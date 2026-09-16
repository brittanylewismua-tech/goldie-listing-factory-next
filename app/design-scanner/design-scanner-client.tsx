"use client";

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
  scope?: string;
  trademark: Trademark | null;
  scansLeftToday: number | null;
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
  "Finding listings with verified movement in this niche",
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
  return canvas.toDataURL("image/jpeg", 0.86);
}

export default function DesignScannerClient({ signedInEmail }: { signedInEmail: string }) {
  void signedInEmail;
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
  const [left, setLeft] = useState<number | null>(null);
  const timers = useRef<number[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/design-scanner/scan");
      if (!response.ok) return;
      const body = await response.json() as
        { scans: HistoryRow[]; scansLeftToday: number | null };
      setHistory(body.scans ?? []);
      setLeft(body.scansLeftToday);
    } catch { /* history is a convenience, never a blocker */ }
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
    setResult(null);
    try {
      const [hash, normalized] = await Promise.all([hashOf(file), normalizeImage(file)]);
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
      else { setResult(body); setLeft(body.scansLeftToday); void loadHistory(); }
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
    <main className="scanner">
      <h1>Design Scanner</h1>
      <p className="lede">
        See how your design compares with listings that have actually been
        moving in your niche.
      </p>

      <div className="stage">
        {preview
          ? <img src={preview} alt="Your design" />
          : <p className="empty">Your design will show here.</p>}
        {scanning && <div className="beam" aria-hidden="true" />}
      </div>

      <label className="pick">
        {preview ? "Choose a different design" : "Choose a design"}
        <input type="file" accept="image/png,image/jpeg,image/webp"
          onChange={event => void onFile(event.target.files?.[0])} />
      </label>

      <div className="field">
        <label htmlFor="niche">Who is it for?</label>
        <input id="niche" type="text" value={niche} placeholder="bachelorette, dog mom, teacher…"
          onChange={event => setNiche(event.target.value)} />
        {savedNiches.length > 0 && (
          <select aria-label="Use a niche you are watching" value=""
            onChange={event => event.target.value && setNiche(event.target.value)}
            style={{ marginTop: 10 }}>
            <option value="">Or use a niche you are watching…</option>
            {savedNiches.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        )}
      </div>

      <button className="go" onClick={() => void scan()} disabled={!ready}>
        {scanning ? "Scanning…" : "Scan"}
      </button>

      {scanning && (
        <ul className="stages">
          {STAGES.map((text, index) => (
            <li key={text} data-done={index <= stage ? "yes" : "no"}>{text}</li>
          ))}
        </ul>
      )}

      {left !== null && !scanning && (
        <p className="left">{left} scan{left === 1 ? "" : "s"} left today</p>
      )}

      {error && <p className="error">{error}</p>}

      {result && <ScanResult result={result} />}

      {history.length > 0 && (
        <section className="history">
          <h2>Your scans</h2>
          {history.map(row => (
            <button key={row.id} onClick={() => { setResult(row.result); setNiche(row.niche); }}>
              {row.niche}
              <span className="when"> · {new Date(row.createdAt * 1000).toLocaleDateString()}</span>
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

function ScanResult({ result }: { result: Result }) {
  return (
    <section className="result">
      <p className="overall">{currentLabel(result.overall)}</p>

      {result.ok ? (
        <>
          {result.scope && <p className="scope">{result.scope}</p>}
          {result.working && result.working.length > 0 && (
            <div className="block">
              <h2>What is working</h2>
              <ul>{result.working.map(line => <li key={line}>{line}</li>)}</ul>
            </div>
          )}
          {result.opportunity && (
            <div className="block">
              <h2>Biggest opportunity</h2>
              <p>{result.opportunity}</p>
            </div>
          )}
        </>
      ) : (
        <div className="block">
          <div className="refusal"><p>{result.refusal?.because}</p></div>
        </div>
      )}

      {result.trademark && (
        <div className="block">
          <h2>Trademark</h2>
          <div className="tm" data-risk={result.trademark.risk}>
            <p>{result.trademark.summary}</p>
            {!result.trademark.registerReady && (
              <p className="loading">
                The federal register is still loading, so this is not a
                complete trademark search yet.
              </p>
            )}
          </div>
        </div>
      )}

      {result.evidence && <p className="evidence">{result.evidence}</p>}
    </section>
  );
}
