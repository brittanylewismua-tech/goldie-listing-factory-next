"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import SupportChat from "./support-chat";
import { runBounded } from "./bounded-work";

type DesignFile = { name: string; size: number; id: string; file: File };
type TemplateDetails = { id: string; batchId: string; title: string; provider: string; enabledVariants: number; shop: string; maxPrintWidth?: number | null; maxPrintHeight?: number | null };
type DraftResult = { id?: string; clientId: string; name: string; shopId?: number; editorUrl?: string; status: "Created" | "Failed"; error?: string };

const MAX_BATCH_FILES = 20;
const MAX_BATCH_BYTES = 500 * 1024 * 1024;
const MAX_CONCURRENT_DESIGNS = 2;

async function fetchWithDeadline(input: RequestInfo | URL, init: RequestInit, milliseconds: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), milliseconds);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  catch (error) {
    if (controller.signal.aborted) throw new Error("The request took too long and was stopped safely.");
    throw error;
  } finally { window.clearTimeout(timeout); }
}

function friendlyUploadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const supportReference = message.match(/Support reference:\s*([A-Z0-9-]+)/i)?.[1];
  const withReference = (text: string) => `${text}${supportReference ? ` Support reference: ${supportReference}.` : ""}`;
  if (/8253|Provided images do not exist|did not finish (?:processing|registering)/i.test(message)) return withReference("Printify has not finished registering this design after one minute. Keep the successful drafts and use Retry failed designs when the batch finishes.");
  if (/image could not be decoded|could not be read|invalidstateerror|source image could not be decoded/i.test(message)) return withReference("Goldie can see this filename, but cannot read the actual image. Download it fully to your computer, then upload it again as a PNG or JPG.");
  if (/failed to fetch|networkerror|load failed|secure artwork delivery|temporarily unavailable/i.test(message)) return withReference("The upload connection was interrupted. Goldie retried automatically, but Printify still could not receive this design. Retry it when the batch finishes.");
  if (/request took too long|still completing this exact draft/i.test(message)) return withReference("This draft took longer than the safe waiting period. Goldie recorded it so a retry will recover the same draft instead of creating a duplicate.");
  if (/batch session expired/i.test(message)) return withReference("The protected batch session expired. Load the same Printify template again; your selected files will stay on this page.");
  if (/401|token|unauthorized|not accept/i.test(message)) return withReference("Printify rejected the saved connection. Disconnect Printify, create a new token with all scopes, and reconnect.");
  if (/template product was not found|not found in the connected Printify/i.test(message)) return withReference("This template belongs to a different Printify account or shop than the connected token.");
  if (/8150|validation failed|print_areas|placeholder/i.test(message)) return withReference("Printify rejected this template’s print-area setup. Reload the template; if it continues, use a freshly saved copy of the Printify product.");
  if (/429|longer than expected|rate limit/i.test(message)) return withReference("Printify is temporarily limiting requests. Goldie already waited and retried; retry this design when the batch finishes.");
  return message || "Goldie could not create this draft. Retry it when the batch finishes.";
}

export default function Home() {
  const folderPicker = useRef<HTMLInputElement>(null);
  const imagePicker = useRef<HTMLInputElement>(null);
  const [connected, setConnected] = useState(false);
  const [token, setToken] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const [template, setTemplate] = useState("");
  const [templateDetails, setTemplateDetails] = useState<TemplateDetails | null>(null);
  const [templateError, setTemplateError] = useState("");
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [listingTitle, setListingTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<DesignFile[]>([]);
  const [fileError, setFileError] = useState("");
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [drafts, setDrafts] = useState<DraftResult[]>([]);
  const [openedDrafts, setOpenedDrafts] = useState<string[]>([]);
  const [openAllMessage, setOpenAllMessage] = useState("");
  const [owner, setOwner] = useState(false);
  const [preparationMessage, setPreparationMessage] = useState("");
  const [runTotal, setRunTotal] = useState(0);

  const templateLoaded = templateDetails !== null;
  const ready = connected && templateLoaded && description.trim().length > 0 && files.length > 0;
  const missingRequirement = !connected ? "Connect Printify first" : !templateLoaded ? "Load your product template" : !description.trim() ? "Add your description" : files.length === 0 ? "Add at least one design" : "";
  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  useEffect(() => {
    fetch("/api/printify")
      .then((response) => response.json())
      .then((result: { connected?: boolean; owner?: boolean; reason?: string; warning?: string }) => { setConnected(Boolean(result.connected)); setOwner(Boolean(result.owner)); if (result.reason || result.warning) setConnectionError(result.reason || result.warning || ""); })
      .catch(() => setConnected(false))
      .finally(() => setCheckingConnection(false));
  }, []);

  useEffect(() => {
    if (!running) return;
    const protectBatch = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protectBatch);
    return () => window.removeEventListener("beforeunload", protectBatch);
  }, [running]);

  function chooseFiles(list: FileList | null) {
    if (!list) return;
    const images = Array.from(list)
      .filter((file) => /\.(png|jpe?g)$/i.test(file.name))
      .map((file) => ({ name: file.name, size: file.size, id: crypto.randomUUID(), file }));
    if (images.length === 0) {
      setFileError("No supported designs were found. Choose PNG or JPG images.");
      setFiles([]);
      return;
    }
    if (images.length > MAX_BATCH_FILES) {
      setFileError(`This batch has ${images.length} designs. Choose no more than ${MAX_BATCH_FILES} designs at a time.`);
      return;
    }
    const selectedBytes = images.reduce((sum, image) => sum + image.size, 0);
    if (selectedBytes > MAX_BATCH_BYTES) {
      setFileError(`This batch is ${(selectedBytes / 1024 / 1024).toFixed(1)} MB. Reduce it to 500 MB or less.`);
      return;
    }
    setFileError("");
    setFiles(images);
    setComplete(false);
    setDrafts([]);
    setProcessed(0);
  }

  async function connectPrintify() {
    setConnecting(true); setConnectionError("");
    try {
      const response = await fetchWithDeadline("/api/printify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }, 60000);
      const result = await response.json() as { connected?: boolean; error?: string };
      if (!response.ok || !result.connected) throw new Error(result.error || "Printify could not be connected.");
      setConnected(true); setToken("");
    } catch (error) { setConnected(false); setConnectionError(error instanceof Error ? error.message : "Printify could not be connected."); }
    finally { setConnecting(false); }
  }

  async function loadTemplate() {
    setLoadingTemplate(true); setTemplateError(""); setTemplateDetails(null);
    try {
      const response = await fetchWithDeadline("/api/printify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productUrl: template }) }, 90000);
      const result = await response.json() as { product?: TemplateDetails; error?: string };
      if (!response.ok || !result.product) throw new Error(result.error || "The template could not be loaded.");
      setTemplateDetails(result.product);
    } catch (error) { setTemplateError(error instanceof Error ? error.message : "The template could not be loaded."); }
    finally { setLoadingTemplate(false); }
  }

  async function preparedUpload(file: File) {
    // Never decode, resize, draw, or recompress artwork in the browser. A
    // high-resolution PNG can expand to hundreds of megabytes when decoded,
    // which can make Chrome declare the entire page unresponsive. The File is
    // already a streamable Blob, so pass its original bytes straight through.
    if (!/\.(png|jpe?g)$/i.test(file.name) || !/^image\/(png|jpeg)$/i.test(file.type || "image/png")) {
      throw new Error("Choose a PNG or JPG file. WebP artwork must be exported as PNG before uploading.");
    }
    return { blob: file, fileName: file.name };
  }

  async function stageUpload(blob: Blob, fileName: string, reference: string) {
    const waits = [0, 1500, 4000];
    let lastError = "The design could not be prepared for Printify.";
    for (const wait of waits) {
      if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
      try {
        const response = await fetchWithDeadline(`/api/printify/stage?fileName=${encodeURIComponent(fileName)}&reference=${encodeURIComponent(reference)}`, {
          method: "POST",
          headers: { "Content-Type": blob.type || (/\.png$/i.test(fileName) ? "image/png" : "image/jpeg") },
          body: blob,
        }, 90000);
        const result = await response.json() as { stagedId?: string; error?: string };
        if (response.ok && result.stagedId) return { stagedId: result.stagedId, reference };
        lastError = result.error || lastError;
        if (response.status >= 400 && response.status < 500 && response.status !== 429) break;
      } catch (error) { lastError = error instanceof Error ? error.message : lastError; }
    }
    throw new Error(`${lastError}${/Support reference:/i.test(lastError) ? "" : ` Support reference: ${reference}.`}`);
  }

  async function recoverDraft(batchId: string, clientId: string) {
    const delays = [1000, 2000, 4000, 8000, 12000, 15000];
    for (const delay of delays) {
      await new Promise((resolve) => window.setTimeout(resolve, delay));
      const response = await fetchWithDeadline(`/api/printify/drafts?batchId=${encodeURIComponent(batchId)}&clientId=${encodeURIComponent(clientId)}`, {}, 30000);
      const result = await response.json() as { status?: string; draft?: DraftResult };
      if (result.status === "succeeded" && result.draft) return result.draft;
      if (result.status === "failed" || result.status === "not_found") return null;
    }
    return null;
  }

  async function processDesign(design: DesignFile): Promise<DraftResult> {
      const referenceRoot = `GLF-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
      let finalError: Error | null = null;
      try {
        const upload = await preparedUpload(design.file);
        for (let pipelineAttempt = 1; pipelineAttempt <= 3; pipelineAttempt += 1) {
          const supportReference = `${referenceRoot}-A${pipelineAttempt}`;
          try {
            const staged = await stageUpload(upload.blob, upload.fileName, supportReference);
            const response = await fetchWithDeadline("/api/printify/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: templateDetails?.batchId, title: listingTitle.trim() || undefined, description, fileName: upload.fileName, stagedId: staged.stagedId, supportReference: staged.reference, clientId: design.id }) }, 4 * 60 * 1000);
            const result = await response.json() as { draft?: DraftResult; error?: string };
            if ((!response.ok || !result.draft) && (response.status === 409 || /still completing this exact draft/i.test(result.error ?? ""))) {
              const recovered = await recoverDraft(templateDetails!.batchId, design.id);
              if (recovered) result.draft = recovered;
            }
            if (!result.draft) throw new Error(result.error || "Printify did not create this draft.");
            return result.draft;
          } catch (attemptError) {
            finalError = attemptError instanceof Error ? attemptError : new Error("The design failed.");
            const permanent = /\b(?:400|401|403)\b|token|template product was not found|not a recognized|could not be decoded|could not be read|valid PNG or JPG|file contents do not match|does not belong to the signed-in account|batch session expired/i.test(finalError.message);
            if (permanent || pipelineAttempt === 3) break;
            await new Promise((resolve) => window.setTimeout(resolve, pipelineAttempt * 5000));
          }
        }
        throw finalError ?? new Error("Printify did not create this draft.");
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : "The design failed.";
        const supportReference = `${referenceRoot}-A3`;
        if (!/Support reference:/i.test(rawMessage)) {
          void fetch("/api/printify/diagnostics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference: supportReference, fileName: design.name, stage: "browser_image_preparation", message: rawMessage }) });
        }
        return { clientId: design.id, name: design.name, status: "Failed", error: friendlyUploadError(new Error(`${rawMessage}${/Support reference:/i.test(rawMessage) ? "" : ` Support reference: ${supportReference}.`}`)) };
      }
  }

  async function runDrafts(targetFiles: DesignFile[], keepSuccessful = false) {
    if (!ready || !targetFiles.length) return;
    setRunning(true);
    setRunTotal(targetFiles.length);
    setComplete(false);
    setPreparationMessage(`Processing up to ${Math.min(MAX_CONCURRENT_DESIGNS, targetFiles.length)} designs at a time without opening or compressing them`);
    if (!keepSuccessful) setDrafts([]);
    else setDrafts((current) => current.filter((draft) => draft.status === "Created"));
    setProcessed(0);
    await runBounded(targetFiles, MAX_CONCURRENT_DESIGNS, processDesign, (result) => {
      setDrafts((current) => [...current, result]);
      setProcessed((current) => current + 1);
    });
    setRunning(false);
    setPreparationMessage("");
    setRunTotal(0);
    setComplete(true);
  }

  function createDrafts() { void runDrafts(files); }

  function retryFailed() {
    const failedIds = new Set(drafts.filter((draft) => draft.status === "Failed").map((draft) => draft.clientId));
    void runDrafts(files.filter((file) => failedIds.has(file.id)), true);
  }

  function startOver() {
    setTemplate("");
    setTemplateDetails(null);
    setTemplateError("");
    setListingTitle("");
    setDescription("");
    setFiles([]);
    setFileError("");
    setDrafts([]);
    setProcessed(0);
    setComplete(false);
    setOpenedDrafts([]);
    setOpenAllMessage("");
    if (folderPicker.current) folderPicker.current.value = "";
    if (imagePicker.current) imagePicker.current.value = "";
  }

  function openDraft(draft: DraftResult) {
    if (!draft.id || !draft.editorUrl) return;
    window.open(draft.editorUrl, "_blank", "noopener,noreferrer");
    setOpenedDrafts((current) => current.includes(draft.id!) ? current : [...current, draft.id!]);
  }

  function openAllDrafts() {
    const editableDrafts = drafts.filter((draft) => draft.id && draft.editorUrl);
    let opened = 0;
    const openedIds: string[] = [];
    editableDrafts.forEach((draft) => {
      const printifyTab = window.open(draft.editorUrl!, "_blank", "noopener,noreferrer");
      if (!printifyTab) return;
      opened += 1;
      openedIds.push(draft.id!);
    });
    setOpenedDrafts((current) => [...new Set([...current, ...openedIds])]);
    setOpenAllMessage(opened === editableDrafts.length ? `${opened} Printify editor tabs opened.` : `Your browser opened ${opened} of ${editableDrafts.length}. Allow pop-ups for this site to open the rest.`);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <Image src="/goldie-wordmark.webp" width={236} height={120} alt="Goldie" className="wordmark" priority />
          <span className="brand-divider" />
          <div>
            <p className="product-name">Listing Factory</p>
          </div>
        </div>
        <div className="top-actions">
          <nav className="factory-switcher" aria-label="Goldie factories"><a className="active" href="/">Listing Factory</a><a href="/mockups">Mockup Factory</a></nav>
          {owner && <a className="diagnostics-link" href="/mastermind-admin" aria-label="Open Goldie Diagnostics" title="Goldie Diagnostics">★</a>}
          <span className="secure-pill"><i /> Secure workspace</span>
        </div>
      </header>

      <section className="hero">
        <div>
          <h1>Automate your Printify listing creation process, all in one place.</h1>
          <p className="hero-copy">Choose a product template, add your product description, and select a folder of finished designs.</p>
        </div>
        <Image src="/goldie-g.png" width={2000} height={2000} alt="" className="hero-watermark" />
      </section>

      <section className="workspace">
        <div className="steps-column">
          <article className={`step-card ${connected ? "done" : ""}`}>
            <div className="step-number">01</div>
            <div className="step-content">
              <div className="step-heading"><div><p className="mini-label">PRINTIFY CONNECTION</p><h2>Your Printify account</h2></div>{connected && <span className="done-mark">✓ Connected</span>}</div>
              <p className="step-copy">Create drafts directly inside your own Printify shop. Connect once and Goldie will remember your Printify account securely.</p>
              {checkingConnection ? (
                <div className="connection-row"><span className="connection-icon">P</span><div><b>Checking Printify connection…</b><small>This takes just a moment</small></div></div>
              ) : !connected ? (
                <div className="connection-setup">
                  <div className="inline-field"><input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste your Printify token" aria-label="Printify token" /><button onClick={connectPrintify} disabled={!token.trim() || connecting}>{connecting ? "Connecting…" : "Connect Printify"}</button></div>
                  <small>Your token is encrypted before it is saved and is never displayed again.</small>
                  {connectionError && <p className="field-error" role="alert">{connectionError}</p>}
                </div>
              ) : (
                <><div className="connection-row"><span className="connection-icon">P</span><div><b>Printify connected</b><small>Your connection will be remembered</small></div><button onClick={async () => { await fetch("/api/printify", { method: "DELETE" }); setConnected(false); setToken(""); setTemplateDetails(null); setConnectionError(""); }}>Disconnect</button></div>{connectionError && <p className="field-warning" role="status">{connectionError}</p>}</>
              )}
            </div>
          </article>

          <article className={`step-card ${templateLoaded ? "done" : ""}`}>
            <div className="step-number">02</div>
            <div className="step-content">
              <div className="step-heading"><div><p className="mini-label">PRODUCT TEMPLATE</p><h2>Choose your Printify product template</h2></div>{templateLoaded && <span className="done-mark">✓ Loaded</span>}</div>
              <p className="step-copy">Paste the link from a product in My Products. Its provider, colors, sizes, pricing and print areas carry into the whole batch—so make sure the details are correctly set in the template listing before beginning.</p>
              <div className="inline-field">
                <input value={template} onChange={(event) => { setTemplate(event.target.value); setTemplateDetails(null); setTemplateError(""); }} onBlur={() => { if (connected && template.trim() && !templateLoaded && !loadingTemplate) void loadTemplate(); }} onKeyDown={(event) => { if (event.key === "Enter" && connected && template.trim() && !loadingTemplate) { event.preventDefault(); void loadTemplate(); } }} placeholder="Paste your Printify product link" aria-label="Printify product link" />
                <button onClick={loadTemplate} disabled={!connected || !template.trim() || loadingTemplate}>{loadingTemplate ? "Loading…" : "Load template"}</button>
              </div>
              {templateError && <p className="field-error" role="alert">{templateError}</p>}
              {templateDetails && <div className="template-proof"><div className="product-thumb"><span>YOUR<br/>ART</span></div><div className="template-info"><b>{templateDetails.title}</b><span>Print provider · {templateDetails.provider}</span><span>{templateDetails.enabledVariants} enabled variants · {templateDetails.shop}</span></div><span className="template-badge">Verified</span></div>}
              <div className="optional-title-field">
                <label htmlFor="batch-listing-title"><b>Listing title</b> <span>Optional</span></label>
                <p>If these designs use the same title, enter it once and Goldie will add it to every draft. Leave this blank to use each design’s filename as its title.</p>
                <input id="batch-listing-title" value={listingTitle} onChange={(event) => setListingTitle(event.target.value)} placeholder="Paste the listing title for this batch" maxLength={255} />
                <span className="character-count">{listingTitle.length}/255 characters</span>
              </div>
            </div>
          </article>

          <article className={`step-card ${description.trim() ? "done" : ""}`}>
            <div className="step-number">03</div>
            <div className="step-content">
              <div className="step-heading"><div><p className="mini-label">DESCRIPTION</p><h2>Add the batch description</h2></div>{description.trim() && <span className="done-mark">✓ Added</span>}</div>
              <p className="step-copy">This exact description goes into every draft. You can personalize individual listings later.</p>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Paste your product description here" rows={5} />
              <span className="character-count">{description.length.toLocaleString()} characters</span>
            </div>
          </article>

          <article className={`step-card ${files.length ? "done" : ""}`}>
            <div className="step-number">04</div>
            <div className="step-content">
              <div className="step-heading"><div><p className="mini-label">DESIGNS</p><h2>Add your finished designs</h2></div>{files.length > 0 && <span className="done-mark">✓ {files.length} loaded</span>}</div>
              <p className="step-copy">Build one focused batch of up to 20 finished designs. Upload a folder or select individual images.</p>
              <p className="batch-limits" aria-label="Batch limits"><span>20 designs maximum</span><i /> <span>500 MB per batch</span><i /> <span>Artwork is sized for the selected product</span></p>
              <div className="file-reminder"><b>Before uploading</b><span>Designs must already be upscaled if needed. For apparel—or any product where the background should not print—use a transparent-background PNG.</span></div>
              <input ref={folderPicker} className="hidden-picker" type="file" multiple accept=".png,.jpg,.jpeg" {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={(event) => chooseFiles(event.target.files)} />
              <input ref={imagePicker} className="hidden-picker" type="file" multiple accept=".png,.jpg,.jpeg" onChange={(event) => chooseFiles(event.target.files)} />
              <div className="upload-actions">
              <button className="folder-drop" onClick={() => folderPicker.current?.click()}>
                <span className="upload-icon" aria-hidden="true">↑</span>
                <span><b>{files.length ? `${files.length} of 20 designs ready` : "Choose a folder"}</b><small>{files.length ? `${(totalSize / 1024 / 1024).toFixed(1)} of 500 MB selected · Choose again to replace` : "Your folder can contain up to 20 designs"}</small></span>
                <span className="browse-chip">Browse</span>
              </button>
              <button className="folder-drop" onClick={() => imagePicker.current?.click()}>
                <span className="upload-icon" aria-hidden="true">＋</span>
                <span><b>Choose individual images</b><small>Select one image or several at once</small></span>
                <span className="browse-chip">Browse</span>
              </button>
              </div>
              {fileError && <p className="file-limit-error" role="alert"><b>That batch can’t be added.</b><span>{fileError}</span></p>}
              {files.length > 0 && <div className="batch-capacity"><div><b>{files.length}/20 designs</b><span>{20 - files.length} spaces remaining</span></div><div className="capacity-track"><span style={{ width: `${(files.length / 20) * 100}%` }} /></div></div>}
            </div>
          </article>
        </div>

        <aside className="launch-panel">
          <div className="launch-top">
            <Image src="/goldie-g.png" width={2000} height={2000} alt="" className="goldie-g" />
            <p className="mini-label">BATCH SUMMARY</p>
            <h2>{running ? `${processed} of ${runTotal} complete` : complete ? "Batch finished" : "Current batch"}</h2>
            <p>{complete ? `${drafts.filter((draft) => draft.status === "Created").length} of ${files.length} drafts were created in Printify.` : running ? "Goldie is uploading each design and creating its Printify draft." : "Complete the four sections to create unpublished drafts in Printify."}</p>
          </div>

          <div className="summary-list">
            <div><span>Printify</span><b className={connected ? "ready-text" : "waiting-text"}>{connected ? "Connected" : "Waiting"}</b></div>
            <div><span>Template</span><b>{templateLoaded ? "Loaded" : "—"}</b></div>
            <div><span>Designs</span><b>{files.length ? `${files.length} / 20` : "—"}</b></div>
            <div><span>Publishing</span><b>Draft only</b></div>
          </div>

          {running && (
            <div className="batch-progress" role="status" aria-live="polite">
              <div className="progress-ring" aria-hidden="true"><span>{processed}/{runTotal}</span></div>
              <div className="progress-copy"><b>Creating your Printify drafts</b><span>{preparationMessage || "Keep this page open while Goldie finishes the batch."}</span></div>
              <div className="progress-track"><span style={{ width: `${runTotal ? (processed / runTotal) * 100 : 0}%` }} /></div>
            </div>
          )}

          {!complete ? (
            <button className="launch-button" disabled={!ready || running} onClick={createDrafts}>
              <span className="button-glint" />{running ? `${processed} of ${runTotal} complete…` : ready ? "Create Printify drafts" : missingRequirement}<span>→</span>
            </button>
          ) : (
            <div className="batch-actions">
              {drafts.some((draft) => draft.status === "Failed") && <button className="retry-button" onClick={retryFailed}>Retry {drafts.filter((draft) => draft.status === "Failed").length} failed designs</button>}
            </div>
          )}
          <p className="launch-note">Listings remain unpublished until you publish them in Printify.</p>
          {(template || listingTitle || description || files.length > 0 || drafts.length > 0) && <button className="start-over-button" disabled={running} onClick={startOver}>Clear all / start over</button>}

          {complete && (
            <div className="draft-preview">
              <div className="draft-title"><b>Latest batch</b><span>{drafts.length} results</span></div>
              {drafts.map((draft) => (
                <div className={`draft-row ${draft.status === "Failed" ? "draft-failed" : ""}`} key={draft.clientId}><span className="draft-check">{draft.status === "Created" ? "✓" : "!"}</span><div><b>{draft.name}</b><small>{draft.status === "Created" ? "Unpublished Printify draft" : draft.error}</small>{draft.status === "Failed" && <button className="error-help-link" onClick={() => window.dispatchEvent(new CustomEvent("goldie-support", { detail: draft.error ?? "A design failed" }))}>Get help with this error</button>}</div>{draft.editorUrl && draft.id ? <button className={`edit-draft-button ${openedDrafts.includes(draft.id) ? "opened" : ""}`} onClick={() => openDraft(draft)}><i />{openedDrafts.includes(draft.id) ? "Opened" : "Edit in Printify"}</button> : <span>—</span>}</div>
              ))}
              {drafts.filter((draft) => draft.status === "Created").length > 1 && <button className="open-all-button" onClick={openAllDrafts}>Open all in Printify</button>}
              {openAllMessage && <p className="open-all-message" role="status">{openAllMessage}</p>}
            </div>
          )}
        </aside>
      </section>

      <footer><span>GOLDIE LISTING FACTORY</span><span>BE A WOLF BIZ · 2026</span></footer>
      <SupportChat />
    </main>
  );
}
