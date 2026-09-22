"use client";

import PrintCheck from "@/app/command-center/print-check";
import ActionPlan from "@/app/command-center/action-plan";
import { nextScanAt } from "@/app/scan-reset";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * WHAT THE MEMBER SEES.
 *
 * Upload, name the niche, scan. One answer, four short pieces and a line
 * saying what it was compared against. No scores, no metrics, no gallery of
 * other people's listings — those would be both a worse experience and a
 * disclosure we have no right to make.
 *
 * The beam runs while we wait and stops when the answer arrives. It never
 * delays a finished result: there is no minimum duration anywhere in here.
 */

type Trademark = {
  risk: "clear" | "caution" | "high";
  summary: string;
  registerReady: boolean;
  phrase: string;
};

type Result = {
  ok: boolean;
  overall: string;
  working?: string[];
  opportunity?: string;
  evidence?: string;
  refusal?: { kind: string; because: string };
  allowanceCharged?:boolean;
  scope?: string;
  /* Whether the design is about the niche at all, as distinct from whether it
     is built like the listings that are moving in it. */
  subject?: { verdict: "on-subject" | "off-subject" | "unknown"; matched: string[]; because: string };
  /*
    WHAT THE PIXELS THEMSELVES SAY.

    Measured on every scan, returned by the API since the measurement was
    built, and rendered nowhere: contrast, edge softness and whether either
    survives being shrunk to the size a buyer first sees. A member was told
    how their design compares with what is moving while being told nothing
    about whether it is legible at all.
  */
  imageQuality?: {
    contrast: string; sharpness: string; thumbnailReadable: string;
    emptiness?: string; notes?: string[];
  };
  trademark: Trademark | null;
  scansLeftToday: number | null;
  nextScanAt?: string | null;
  niche: string;
  warm: boolean;
  scanId?: string;
};

type HistoryRow = { id: string; niche: string; artworkHash: string;
  createdAt: number; result: Result };

/**
 * LABELS THIS PRODUCT NO LONGER STANDS BEHIND.
 *
 * Scans saved before the wording correction carry "Strong alignment" and
 * "Visually strong, weak niche alignment" — claims about niche fit that a
 * construction-only comparison cannot make. The stored record keeps what it
 * said, because rewriting history is worse; what a member SEES is mapped to
 * the current wording, so no retired claim can be reopened.
 */
const RETIRED_LABELS: Record<string, string> = {
  "Strong alignment": "Strong visual-pattern alignment",
  "Promising, but unclear at thumbnail size": "Moderate visual-pattern alignment",
  "Visually strong, weak niche alignment": "Weak visual-pattern alignment",
  "Not enough verified niche evidence yet": "Not enough verified evidence",
};

const currentLabel = (overall: string) => RETIRED_LABELS[overall] ?? overall;

const STAGES = [
  "Reading your design",
  "Finding listings with recorded buyer activity",
  "Comparing how they are built",
];

/* The content hash identifies the design so the same file is never paid for
   twice. Computed in the browser, from the bytes. */
async function hashOf(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/* Downscaled before it is sent: the analysis reads composition and contrast,
   not print resolution, and a 40MB upload helps nobody. */
async function normalizeImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = 768;
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  /* Transparent artwork on a white ground, the way it prints. */
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  // The server measures pixels with its PNG decoder.
  return canvas.toDataURL("image/png");
}

export default function DesignScannerClient({ signedInEmail }: { signedInEmail: string }) {
  void signedInEmail;
  const [original,setOriginal]=useState<{width:number;height:number;url:string}|null>(null);
  useEffect(()=>()=>{if(original)URL.revokeObjectURL(original.url)},[original]);
  const [preview, setPreview] = useState("");
  const [dataUrl, setDataUrl] = useState("");
  const [artworkHash, setArtworkHash] = useState("");
  const [niche, setNiche] = useState("");
  const [savedNiches, setSavedNiches] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [selectedScan,setSelectedScan]=useState<HistoryRow|null>(null);
  /* A saved scan that failed to load is not a member who has never
     scanned, and the allowance count is not "unlimited" because the
     request that carries it fell over. */
  const [historyFailed, setHistoryFailed] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [nextAt, setNextAt] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/design-scanner/scan");
      if (!response.ok) { setHistoryFailed(true); return; }
      const body = await response.json() as
        { scans: HistoryRow[]; scansLeftToday: number | null; nextScanAt?: string | null };
      setHistory(body.scans ?? []);
      setLeft(body.scansLeftToday);
      setNextAt(body.nextScanAt ?? null);
      setHistoryFailed(false);
    } catch { setHistoryFailed(true); }
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  useEffect(() => {
    /*
      Saved MARKET WATCH niches, not Shop Map worlds.

      This read Shop Map, which is the member's OWN shop — the wrong source
      entirely: Design Scanner compares against the marketplace, and a niche
      the member has been watching already has a normalized definition and a
      live cohort behind it. Picking one here reuses that definition exactly,
      and does not subscribe them to anything new.
    */
    (async () => {
      try {
        const response = await fetch("/api/market-watch/niches");
        if (!response.ok) return;
        const body = await response.json() as { watches?: Array<{ phrase?: string }> };
        setSavedNiches((body.watches ?? []).map(watch => String(watch.phrase ?? ""))
          .filter(Boolean));
      } catch { /* the field still accepts anything typed */ }
    })();
  }, []);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setSelectedScan(null);
    setResult(null);
    try {
      const [hash, normalized] = await Promise.all([hashOf(file), normalizeImage(file)]);
      const bitmap=await createImageBitmap(file);
      setOriginal({width:bitmap.width,height:bitmap.height,url:URL.createObjectURL(file)});
      bitmap.close();
      setArtworkHash(hash);
      setDataUrl(normalized);
      setPreview(normalized);
    } catch {
      setError("That file could not be opened. PNG or JPG works best.");
    }
  };

  const scan = async () => {
    if (!artworkHash || !niche.trim() || scanning) return;
    setScanning(true);
    setError("");
    setSelectedScan(null);
    setResult(null);
    setStage(0);
    timers.current.forEach(window.clearTimeout);
    timers.current = [
      window.setTimeout(() => setStage(1), 700),
      window.setTimeout(() => setStage(2), 1600),
    ];
    try {
      const response = await fetch("/api/design-scanner/scan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artworkHash, niche: niche.trim(), imageDataUrl: dataUrl }),
      });
      const body = await response.json() as Result & { error?: string };
      if (!response.ok) setError(body.error ?? "That scan did not complete.");
      else { setResult(body); setLeft(body.scansLeftToday);
        setNextAt(body.nextScanAt ?? null); void loadHistory(); }
    } catch {
      setError("That scan did not complete. It has not been counted against your daily scans.");
    } finally {
      /* The animation stops with the work. It is not padded out to look busy. */
      timers.current.forEach(window.clearTimeout);
      timers.current = [];
      setScanning(false);
    }
  };

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const ready = useMemo(() => Boolean(artworkHash && niche.trim() && !scanning),
    [artworkHash, niche, scanning]);

  return (
    <main className="scanner p-grid">
      <header className="command-page-heading"><h1>Design Scanner</h1>
      <p className="lede">
        Compare your design with Etsy listings that have recorded buyer activity.
      </p></header>

      <section className="scanner-compose" aria-label="New design scan"><div className="scanner-artwork"><div className="stage">
        {preview
          ? <img src={preview} alt="Your design" />
          : <div className="empty p-empty"><b>No design yet</b><p>Upload your artwork to compare its style, layout, and colors with relevant Etsy listings.</p></div>}
        {scanning && <div className="beam" aria-hidden="true" />}
      </div>

      <label className="pick">
        {preview ? "Choose a different design" : "Choose a design"}
        <input type="file" accept="image/png,image/jpeg,image/webp"
          onChange={event => void onFile(event.target.files?.[0])} />
      </label></div>

      <div className="scanner-settings"><h2 className="utility-heading">Set up your scan</h2><p className="scanner-help">Add your artwork and choose its audience to find a relevant comparison.</p><div className="field">
        <label htmlFor="niche">Who is it for?</label>
        <input id="niche" type="text" value={niche} placeholder="bachelorette, dog mom, teacher…"
          onChange={event => setNiche(event.target.value)} />
        {savedNiches.length > 0 && (
          <select aria-label="Use a tracked keyword" value=""
            onChange={event => event.target.value && setNiche(event.target.value)}
            style={{ marginTop: 10 }}>
            <option value="">Choose a tracked keyword…</option>
            {savedNiches.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        )}
      </div>

      <button className="go p-button p-button-primary" onClick={() => void scan()} disabled={!ready}>
        {scanning ? "Scanning…" : "Scan"}
      </button>
      {/*
        A DISABLED BUTTON THAT SAYS WHY.

        "Scan" greyed out with nothing beside it leaves the member guessing
        which of the two things above it is missing — and the design is chosen
        through a file picker, so it is genuinely easy to think you have.
      */}
      {!ready && !scanning && (
        <p className="go-needs" role="status">
          {!artworkHash && !niche.trim() ? "Choose a design and say who it is for."
            : !artworkHash ? "Choose a design to scan."
            : "Say who this design is for."}
        </p>
      )}

      {scanning && (
        <ul className="stages">
          {STAGES.map((text, index) => (
            <li key={text} data-done={index <= stage ? "yes" : "no"}>{text}</li>
          ))}
        </ul>
      )}

      {left !== null && !scanning && (
        <p className="left p-badge">
          {left} scan{left === 1 ? "" : "s"} left today
          {/*
            D1690 · At the limit, when one comes back is the only useful thing
            left to say. The allowance is a rolling day rather than a calendar
            one, so it is not midnight, and a member with no date guesses.
          */}
          {left === 0 && nextScanAt(nextAt)
            ? <span className="left-next"> · next one {nextScanAt(nextAt)}</span>
            : null}
        </p>
      )}

      {error && <p className="error p-notice p-notice-bad" role="alert">{error}</p>}
      </div></section>

      {original&&artworkHash&&<PrintCheck width={original.width} height={original.height} preview={original.url}/>}
      {selectedScan && <p className="p-notice" role="status">{`Saved scan for ${selectedScan.niche} · ${new Date(selectedScan.createdAt*1000).toLocaleString()}. ${!preview ? "The original artwork is not stored with this result. Upload it again to run a new scan." : ""}`}</p>}
      {result && <><ScanResult result={result} /><ActionPlan feature="designScanner" source={result.scanId||artworkHash||result.niche} heading={`Design revision: ${result.niche}`} notes={`Scan finding: ${currentLabel(result.overall)}
${result.opportunity||result.refusal?.because||''}
${result.imageQuality?.notes?.join('\n')||''}

Keep: ${result.working?.join('; ')||'Record what should stay unchanged.'}

One change for the next version:

Recheck at the same thumbnail size and intended print size. Upload the revised file and compare the same niche. Record whether the original issue improved.`}/></>}

      {historyFailed && history.length === 0 && (
        <p className="p-notice" role="status">
          Your saved scans could not be loaded. None of them have been changed.{" "}
          <button type="button" className="p-button p-button-quiet"
            onClick={() => void loadHistory()}>Try again</button>
        </p>
      )}

      {history.length > 0 && (
        <section className="history p-card-quiet">
          <h2 className="utility-heading">Your scans</h2>
          {history.map(row => (
            <button key={row.id} aria-pressed={selectedScan?.id===row.id} onClick={() => { setSelectedScan(row); setResult(row.result); setNiche(row.niche); if(row.artworkHash!==artworkHash){setPreview("");setDataUrl("");setArtworkHash("");} }}>
              {row.niche}
              <span className="when"> · {new Date(row.createdAt * 1000).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit"})}</span>
              {/* What it said, so a list of seven scans is not seven identical
                  rows the member has to open one by one to tell apart. */}
              {row.result?.overall && (
                <span className="verdict-line">{currentLabel(row.result.overall)}</span>
              )}
            </button>
          ))}
        </section>
      )}
    </main>
  );
}

/*
  ONE MEASUREMENT, ONE SENTENCE, AND NEVER ONE EXPLAINING THE OTHER.

  Contrast and edge softness are measured independently, so a design that is
  both faint and blurred is told both things. An earlier version folded one
  into the other and handed back a correction that did not match the problem.

  A design that passes everything says nothing here: a green tick on every
  scan trains the member to stop reading the section that matters.
*/
function ImageQuality({ quality }: { quality?: Result["imageQuality"] }) {
  if (!quality) return null;
  const notes = quality.notes ?? [];
  const unverified = [quality.contrast, quality.sharpness, quality.thumbnailReadable]
    .includes("unverified");
  if (!notes.length && !unverified) return null;
  return (
    <div className="block quality" role="status">
      <h2 className="utility-heading">Before you list this</h2>
      {unverified && notes.length === 0
        ? <p className="quality-note">
            This design could not be measured, so its readability was not checked.
          </p>
        : <ul className="quality-notes">
            {notes.map(note => <li key={note}>{note}</li>)}
          </ul>}
    </div>
  );
}

function ScanResult({ result }: { result: Result }) {
  return (
    <section className="result p-card">
      <p className="overall">{currentLabel(result.overall)}</p>

      {result.ok ? (
        <>
          {/* An off-subject design is told so plainly, ahead of a verdict it
              would otherwise read as approval. */}
          {/* The class names are written out rather than interpolated: one
              built from a value cannot be checked against the stylesheet, and
              the guard that catches dead rules is worth keeping able to see. */}
          {result.subject && result.subject.verdict !== "on-subject" && (
            <p className={result.subject.verdict === "unknown"
              ? "subject-warning subject-unknown" : "subject-warning subject-off"}
              role="status">
              {result.subject.because}
            </p>
          )}
          <ImageQuality quality={result.imageQuality} />
          {result.scope && <p className="scope">
            This compares layout, contrast, and readability with Etsy listings that have
            recorded buyer activity. Similar visual features do not establish demand for your design.
          </p>}
          {result.working && result.working.length > 0 && (
            <div className="block">
              <h2 className="utility-heading">What is working</h2>
              <ul>{result.working.map(line => <li key={line}>{line}</li>)}</ul>
            </div>
          )}
          {result.opportunity && (
            <div className="block">
              <h2 className="utility-heading">Biggest opportunity</h2>
              <p>{result.opportunity}</p>
            </div>
          )}
        </>
      ) : (
        <div className="block">
          {/* A refused comparison still measured the artwork, and that
              measurement is often the more useful half. */}
          <ImageQuality quality={result.imageQuality} />
          <div className="refusal"><p>{result.refusal?.because}</p>{result.allowanceCharged===false&&<p>No scan was used from your allowance.</p>}</div>
        </div>
      )}

      {result.trademark && (
        <div className="block">
          <h2 className="utility-heading">Trademark</h2>
          <div className="tm" data-risk={result.trademark.risk}>
            <p>{result.trademark.summary}</p>
            {!result.trademark.registerReady && (
              <p className="loading">
                The trademark search is incomplete. Review the matching records before deciding whether to use the phrase.
              </p>
            )}
          </div>
        </div>
      )}

      {result.evidence && <p className="evidence">Recorded listing activity does not tell us how many units an individual listing sold.</p>}
    </section>
  );
}
