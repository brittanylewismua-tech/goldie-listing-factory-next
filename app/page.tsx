"use client";
/* eslint-disable @next/next/no-img-element, jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import SupportChat from "./support-chat";
import { runBounded } from "./bounded-work";
import { KeywordBank, SavedWorkflow, type Pricing, type Recipe } from "./factory-tools";
import IntegratedMockups from "./integrated-mockups";

type DesignFile = { name: string; size: number; id: string; file: File; previewUrl: string; title: string; tags: string[]; width?: number; height?: number };
type TemplateDetails = { id: string; batchId: string; title: string; provider: string; enabledVariants: number; shop: string; maxPrintWidth?: number | null; maxPrintHeight?: number | null };
type DraftResult = { id?: string; clientId: string; name: string; title?: string; tags?: string[]; previewUrl?: string; printifyImages?: string[]; shopId?: number; editorUrl?: string; status: "Created" | "Failed"; error?: string };

const MAX_BATCH_FILES = 20;
const MAX_BATCH_BYTES = 500 * 1024 * 1024;
const MAX_CONCURRENT_DESIGNS = 2;
const DEFAULT_PRICING: Pricing = { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: 0.25, listingFee: 0.20, shippingCost: 0, shippingCharged: 0 };
function tagsFromTitle(title: string) { return [...new Set(title.split(/[,|]/).map((v) => v.trim().toLowerCase()).filter((v) => v.length > 1 && v.length <= 20))].slice(0, 13); }
function PrintifyImagePicker({ images }: { images: string[] }) { const [selected, setSelected] = useState<Set<string>>(new Set(images.slice(0, 3))); if (!images.length) return <p className="preview-processing">Printify is still processing its product mockups. Open the editor to view them once they appear.</p>; return <details className="printify-image-picker"><summary>Choose Printify flatlays ({selected.size} selected)</summary><p>Select the Printify images you want mixed with the Goldie lifestyle mockups. Goldie will attach and order these automatically after the Etsy connection is approved.</p><div>{images.map((src, index) => <label className={selected.has(src) ? "selected" : ""} key={src}><input type="checkbox" checked={selected.has(src)} onChange={() => setSelected(current => { const next = new Set(current); if (next.has(src)) next.delete(src); else next.add(src); return next; })}/><img src={src} alt={`Printify product mockup ${index + 1}`}/></label>)}</div></details>; }

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
  const csvPicker = useRef<HTMLInputElement>(null);
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
  const [pricing, setPricing] = useState<Pricing>(DEFAULT_PRICING);
  const [mockupTheme, setMockupTheme] = useState("");
  const [bulkTitles, setBulkTitles] = useState("");
  const [activeDesign, setActiveDesign] = useState<string>("");

  const templateLoaded = templateDetails !== null;
  const ready = connected && templateLoaded && description.trim().length > 0 && files.length > 0;
  const missingRequirement = !connected ? "Connect Printify first" : !templateLoaded ? "Choose or verify a product recipe" : !description.trim() ? "Complete the recipe description" : files.length === 0 ? "Add at least one design" : "";
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
      .map((file) => { const title = listingTitle.trim() || file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "); return ({ name: file.name, size: file.size, id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), title, tags: tagsFromTitle(title) }); });
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
    images.forEach((design) => { const probe = document.createElement("img"); probe.onload = () => { setFiles((current) => current.map((item) => item.id === design.id ? { ...item, width: probe.naturalWidth, height: probe.naturalHeight } : item)); URL.revokeObjectURL(probe.src); }; probe.src = URL.createObjectURL(design.file); });
  }

  function updateDesign(id: string, change: Partial<DesignFile>) { setFiles((current) => current.map((file) => file.id === id ? { ...file, ...change } : file)); }
  function applyBulkTitles() { const titles = bulkTitles.split(/\r?\n/).map((v) => v.replace(/^"|"$/g, "").trim()).filter(Boolean); setFiles((current) => current.map((file, index) => titles[index] ? { ...file, title: titles[index], tags: tagsFromTitle(titles[index]) } : file)); }
  async function importTitleCsv(list: FileList | null) { const file = list?.[0]; if (!file) return; const text = await file.text(); const lines = text.split(/\r?\n/).map((line) => line.split(",")[0]?.replace(/^"|"$/g, "").trim()).filter(Boolean); const values = /title/i.test(lines[0] || "") ? lines.slice(1) : lines; setBulkTitles(values.join("\n")); setFiles((current) => current.map((design, index) => values[index] ? { ...design, title: values[index].slice(0, 140), tags: tagsFromTitle(values[index]) } : design)); if (csvPicker.current) csvPicker.current.value = ""; }
  function useRecipe(recipe: Recipe) { setTemplate(recipe.templateUrl); setDescription(recipe.description || ""); setListingTitle(recipe.defaultTitle || ""); setMockupTheme(recipe.defaultMockupTheme || ""); setPricing({ ...DEFAULT_PRICING, ...(recipe.pricing || {}) }); setTemplateDetails(null); void loadTemplateUrl(recipe.templateUrl); }
  function addKeyword(keyword: string) { const id = activeDesign || files[0]?.id; if (!id) return; setFiles((current) => current.map((file) => { if (file.id !== id) return file; const title = file.title ? `${file.title}, ${keyword}` : keyword; return { ...file, title: title.slice(0, 140), tags: tagsFromTitle(title) }; })); }

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

  async function loadTemplateUrl(productUrl = template) {
    setLoadingTemplate(true); setTemplateError(""); setTemplateDetails(null);
    try {
      const response = await fetchWithDeadline("/api/printify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productUrl }) }, 90000);
      const result = await response.json() as { product?: TemplateDetails; error?: string };
      if (!response.ok || !result.product) throw new Error(result.error || "The template could not be loaded.");
      setTemplateDetails(result.product); return true;
    } catch (error) { setTemplateError(error instanceof Error ? error.message : "The template could not be loaded."); return false; }
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
            const response = await fetchWithDeadline("/api/printify/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: templateDetails?.batchId, title: design.title || listingTitle.trim() || undefined, tags: design.tags, pricing, description, fileName: upload.fileName, stagedId: staged.stagedId, supportReference: staged.reference, clientId: design.id }) }, 4 * 60 * 1000);
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
    if (csvPicker.current) csvPicker.current.value = "";
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
            <p className="product-name">Listing + Mockup Factory</p>
          </div>
        </div>
        <div className="top-actions">
          {owner && <a className="diagnostics-link" href="/mastermind-admin" aria-label="Open Goldie Diagnostics" title="Goldie Diagnostics">★</a>}
          <span className="secure-pill"><i /> Secure workspace</span>
        </div>
      </header>

      <section className="hero">
        <div>
          <h1>From finished designs to listing-ready drafts, in one workflow.</h1>
          <p className="hero-copy">Start with a saved product recipe, build titles and pricing in bulk, create Printify drafts, then finish the exact mockups each listing needs.</p>
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

          <SavedWorkflow connected={connected} templateUrl={template} description={description} defaultTitle={listingTitle} mockupTheme={mockupTheme} pricing={pricing} templateVerified={templateLoaded} loadingTemplate={loadingTemplate} onTemplateUrl={(value) => { setTemplate(value); setTemplateDetails(null); setTemplateError(""); }} onDescription={setDescription} onDefaultTitle={setListingTitle} onUseRecipe={useRecipe} onVerifyTemplate={loadTemplateUrl} onPricing={setPricing} onMockupTheme={setMockupTheme} />
          {templateError && <p className="field-error recipe-error" role="alert">{templateError}</p>}
          {templateDetails && <div className="template-proof recipe-proof"><div className="product-thumb"><span>YOUR<br/>ART</span></div><div className="template-info"><b>{templateDetails.title}</b><span>Print provider · {templateDetails.provider}</span><span>{templateDetails.enabledVariants} enabled variants · {templateDetails.shop}</span></div><span className="template-badge">Verified recipe template</span></div>}

          <article className={`step-card ${files.length ? "done" : ""}`}>
            <div className="step-number">03</div>
            <div className="step-content">
              <div className="step-heading"><div><p className="mini-label">DESIGNS</p><h2>Add your finished designs</h2></div>{files.length > 0 && <span className="done-mark">✓ {files.length} loaded</span>}</div>
              <p className="step-copy">Build one focused batch of up to 20 finished designs. Upload a folder or select individual images.</p>
              <p className="batch-limits" aria-label="Batch limits"><span>20 designs maximum</span><i /> <span>500 MB per batch</span><i /> <span>Artwork is sized for the selected product</span></p>
              <div className="file-reminder"><b>Before uploading</b><span>Designs must already be upscaled if needed. Use a transparent-background PNG whenever the background should not print.</span></div>
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
              {files.length > 0 && <div className="listing-editor">
                <div className="editor-heading"><div><b>Build every listing before creating drafts</b><span>Titles and tags stay editable. Select a row before clicking phrases from a keyword bank.</span></div><span>{files.length} listings</span></div>
                <div className="bulk-title-box"><textarea value={bulkTitles} onChange={(e) => setBulkTitles(e.target.value)} rows={3} placeholder="Paste one title per line from eRank or a CSV column"/><div><button onClick={applyBulkTitles}>Apply titles in order</button><button className="secondary-import" onClick={() => csvPicker.current?.click()}>Import title CSV</button><input ref={csvPicker} hidden type="file" accept=".csv,text/csv" onChange={(event) => void importTitleCsv(event.target.files)}/></div></div>
                <KeywordBank onAdd={addKeyword}/>
                <div className="design-table">{files.map((design) => { const qualityKnown = Boolean(templateDetails?.maxPrintWidth && templateDetails?.maxPrintHeight); const qualityReady = Boolean(qualityKnown && design.width && design.height && design.width >= templateDetails!.maxPrintWidth! && design.height >= templateDetails!.maxPrintHeight!); return <article className={`design-line ${activeDesign === design.id ? "active" : ""}`} key={design.id} onClick={() => setActiveDesign(design.id)}><img src={design.previewUrl} alt=""/><div className="design-fields"><label>Title <span>{design.title.length}/140</span><input value={design.title} maxLength={140} onChange={(e) => { const title = e.target.value; updateDesign(design.id, { title, tags: tagsFromTitle(title) }); }}/></label><label>Tags <span>{design.tags.length}/13</span><input value={design.tags.join(", ")} onChange={(e) => updateDesign(design.id, { tags: [...new Set(e.target.value.split(",").map((tag) => tag.trim().toLowerCase()).filter((tag) => tag && tag.length <= 20))].slice(0, 13) })} placeholder="Exact title phrases, separated by commas"/></label><div className="tag-row">{design.tags.map((tag) => <span key={tag}>{tag}</span>)}{!design.tags.length && <small>Add comma-separated title phrases to generate matching Etsy tags.</small>}</div></div><div className={`quality-pill ${qualityReady ? "pass" : "check"}`}><b>{!qualityKnown ? "Waiting for recipe" : qualityReady ? "✓ 300 DPI target met" : "Below 300 DPI target"}</b><small>{design.width ? `${design.width} × ${design.height}px` : "Reading dimensions…"}</small>{qualityKnown && <small>Target: {templateDetails!.maxPrintWidth} × {templateDetails!.maxPrintHeight}px</small>}</div></article>; })}</div>
              </div>}
            </div>
          </article>
        </div>

        <aside className="launch-panel">
          <div className="launch-top">
            <Image src="/goldie-g.png" width={2000} height={2000} alt="" className="goldie-g" />
            <p className="mini-label">BATCH SUMMARY</p>
            <h2>{running ? `${processed} of ${runTotal} complete` : complete ? "Batch finished" : "Current batch"}</h2>
            <p>{complete ? `${drafts.filter((draft) => draft.status === "Created").length} of ${files.length} drafts were created in Printify.` : running ? "Goldie is uploading each design and creating its Printify draft." : "Complete the three sections to create unpublished drafts in Printify."}</p>
          </div>

          <div className="summary-list">
            <div><span>Printify</span><b className={connected ? "ready-text" : "waiting-text"}>{connected ? "Connected" : "Waiting"}</b></div>
            <div><span>Product recipe</span><b>{templateLoaded ? "Ready" : "Not selected"}</b></div>
            <div><span>Designs</span><b>{files.length ? `${files.length} / 20` : "Not added"}</b></div>
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

        </aside>
      </section>

      {complete && <section className="post-draft-workspace"><div className="post-draft-heading"><div><p className="mini-label">PRINTIFY DRAFTS + MOCKUPS</p><h2>Review the real product previews, then finish each listing.</h2><p>Only open Printify when a preview needs manual size or placement adjustment. Mockup choices can be different for every listing.</p></div>{drafts.filter((draft) => draft.status === "Created").length > 1 && <button className="open-all-button" onClick={openAllDrafts}>Open all in Printify</button>}</div>{openAllMessage && <p className="open-all-message" role="status">{openAllMessage}</p>}<div className="draft-card-grid">{drafts.map((draft) => { const design=files.find(file=>file.id===draft.clientId); return <article className={`draft-card ${draft.status === "Failed" ? "failed" : ""}`} key={draft.clientId}><div className="draft-card-top">{draft.previewUrl ? <img src={draft.previewUrl} alt={`Printify preview for ${draft.title || draft.name}`}/> : design ? <div className="pending-preview"><img src={design.previewUrl} alt="Design preview"/><span>Printify preview processing</span></div> : <span className="draft-check">!</span>}<div><span className="draft-state">{draft.status === "Created" ? "PRINTIFY DRAFT CREATED" : "DRAFT FAILED"}</span><h3>{draft.title || draft.name}</h3><small>{draft.status === "Created" ? "Unpublished · pricing and description applied" : draft.error}</small>{design?.tags?.length ? <div className="tag-row">{design.tags.map(tag=><span key={tag}>{tag}</span>)}</div> : null}</div>{draft.editorUrl && draft.id ? <button className={`edit-draft-button ${openedDrafts.includes(draft.id) ? "opened" : ""}`} onClick={() => openDraft(draft)}><i />{openedDrafts.includes(draft.id) ? "Opened" : "Adjust in Printify"}</button> : null}</div>{draft.status === "Created" && <PrintifyImagePicker images={(draft.printifyImages || []).filter(Boolean)}/>} {draft.status === "Created" && design && <details className="draft-mockups" open><summary>Optional: create Goldie lifestyle mockups</summary><IntegratedMockups design={design.file} defaultTheme={mockupTheme}/></details>}{draft.status === "Failed" && <button className="error-help-link" onClick={() => window.dispatchEvent(new CustomEvent("goldie-support", { detail: draft.error ?? "A design failed" }))}>Get help with this error</button>}</article>})}</div></section>}

      <footer><span>GOLDIE LISTING FACTORY</span><span>BE A WOLF BIZ · 2026</span></footer>
      <SupportChat />
    </main>
  );
}
