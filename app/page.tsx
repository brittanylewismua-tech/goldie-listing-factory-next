"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type DesignFile = { name: string; size: number; id: string; file: File };
type TemplateDetails = { id: string; title: string; provider: string; enabledVariants: number; shop: string };
type DraftResult = { id?: string; name: string; shopId?: number; editorUrl?: string; status: "Created" | "Failed"; error?: string };

const MAX_BATCH_FILES = 20;
const MAX_FILE_BYTES = 75 * 1024 * 1024;
const MAX_BATCH_BYTES = 500 * 1024 * 1024;

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
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<DesignFile[]>([]);
  const [fileError, setFileError] = useState("");
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [drafts, setDrafts] = useState<DraftResult[]>([]);
  const [openedDrafts, setOpenedDrafts] = useState<string[]>([]);

  const templateLoaded = templateDetails !== null;
  const ready = connected && templateLoaded && description.trim().length > 0 && files.length > 0;
  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  useEffect(() => {
    fetch("/api/printify")
      .then((response) => response.json())
      .then((result: { connected?: boolean }) => setConnected(Boolean(result.connected)))
      .catch(() => setConnected(false))
      .finally(() => setCheckingConnection(false));
  }, []);

  function chooseFiles(list: FileList | null) {
    if (!list) return;
    const images = Array.from(list)
      .filter((file) => /\.(png|jpe?g|webp|tiff?)$/i.test(file.name))
      .map((file) => ({ name: file.name, size: file.size, id: `${file.name}-${file.size}-${file.lastModified}`, file }));
    if (images.length > MAX_BATCH_FILES) {
      setFileError(`This batch has ${images.length} designs. Choose no more than ${MAX_BATCH_FILES} designs at a time.`);
      return;
    }
    const oversized = images.filter((image) => image.size > MAX_FILE_BYTES);
    if (oversized.length) {
      setFileError(`${oversized.length === 1 ? oversized[0].name : `${oversized.length} designs`} exceeds the 75 MB per-file limit.`);
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
      const response = await fetch("/api/printify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const result = await response.json() as { connected?: boolean; error?: string };
      if (!response.ok || !result.connected) throw new Error(result.error || "Printify could not be connected.");
      setConnected(true); setToken("");
    } catch (error) { setConnected(false); setConnectionError(error instanceof Error ? error.message : "Printify could not be connected."); }
    finally { setConnecting(false); }
  }

  async function loadTemplate() {
    setLoadingTemplate(true); setTemplateError(""); setTemplateDetails(null);
    try {
      const response = await fetch("/api/printify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productUrl: template }) });
      const result = await response.json() as { product?: TemplateDetails; error?: string };
      if (!response.ok || !result.product) throw new Error(result.error || "The template could not be loaded.");
      setTemplateDetails(result.product);
    } catch (error) { setTemplateError(error instanceof Error ? error.message : "The template could not be loaded."); }
    finally { setLoadingTemplate(false); }
  }

  function readAsBase64(file: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(new Error("The design file could not be read."));
      reader.readAsDataURL(file);
    });
  }

  async function preparedUpload(file: File) {
    // Printify recommends URL uploads above 5 MB. While this owner-only Site
    // cannot expose temporary public URLs, keep base64 payloads safely below it.
    const uploadLimit = Math.floor(4.5 * 1024 * 1024);
    if (file.size <= uploadLimit) return { contents: await readAsBase64(file), fileName: file.name };
    const bitmap = await createImageBitmap(file);
    let width = bitmap.width;
    let height = bitmap.height;
    let repacked: Blob | null = null;
    const preserveTransparency = /\.png$/i.test(file.name);
    while (!repacked || repacked.size > uploadLimit) {
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
      repacked = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The large image could not be prepared.")), preserveTransparency ? "image/png" : "image/jpeg", 0.94));
      if (repacked.size > uploadLimit) {
        width = Math.max(1800, Math.round(width * 0.88));
        height = Math.max(1800, Math.round(height * 0.88));
        if (width === 1800 || height === 1800) break;
      }
    }
    bitmap.close();
    if (!repacked || repacked.size > uploadLimit) throw new Error("Goldie couldn’t prepare this design without reducing its print quality. Use a less complex PNG or a high-quality JPG if transparency is not required.");
    const fileName = preserveTransparency ? file.name.replace(/\.[^.]+$/, ".png") : file.name.replace(/\.[^.]+$/, ".jpg");
    return { contents: await readAsBase64(repacked), fileName };
  }

  async function runDrafts(targetFiles: DesignFile[], keepSuccessful = false) {
    if (!ready || !targetFiles.length) return;
    setRunning(true);
    setComplete(false);
    if (!keepSuccessful) setDrafts([]);
    else setDrafts((current) => current.filter((draft) => draft.status === "Created"));
    setProcessed(0);
    for (const design of targetFiles) {
      try {
        const upload = await preparedUpload(design.file);
        const response = await fetch("/api/printify/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productUrl: template, description, fileName: upload.fileName, contents: upload.contents }) });
        const result = await response.json() as { draft?: DraftResult; error?: string };
        if (!response.ok || !result.draft) throw new Error(result.error || "Printify did not create this draft.");
        setDrafts((current) => [...current, result.draft!]);
      } catch (error) {
        setDrafts((current) => [...current, { name: design.name, status: "Failed", error: error instanceof Error ? error.message : "Draft creation failed." }]);
      }
      setProcessed((current) => current + 1);
    }
    setRunning(false);
    setComplete(true);
  }

  function createDrafts() { void runDrafts(files); }

  function retryFailed() {
    const failedNames = new Set(drafts.filter((draft) => draft.status === "Failed").map((draft) => draft.name));
    void runDrafts(files.filter((file) => failedNames.has(file.name)), true);
  }

  function openDraft(draft: DraftResult) {
    if (!draft.id || !draft.editorUrl || !draft.shopId) return;
    const printifyTab = window.open(`https://printify.com/app/store/${draft.shopId}/products/1`, "_blank");
    setOpenedDrafts((current) => current.includes(draft.id!) ? current : [...current, draft.id!]);
    window.setTimeout(() => {
      if (printifyTab && !printifyTab.closed) printifyTab.location.href = draft.editorUrl!;
    }, 2200);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img src="/goldie-wordmark.webp" alt="Goldie" className="wordmark" />
          <span className="brand-divider" />
          <div>
            <p className="product-name">Listing Factory</p>
          </div>
        </div>
        <div className="top-actions">
          <span className="secure-pill"><i /> Private workspace</span>
          <button className="help-button" aria-label="Open help">?</button>
        </div>
      </header>

      <section className="hero">
        <div>
          <h1>Batch create your Printify listings... done for you.</h1>
          <p className="hero-copy">Choose a product template, add your product description, and select a folder of finished designs.</p>
        </div>
        <img src="/goldie-g.png" alt="" className="hero-watermark" />
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
                <div className="connection-row"><span className="connection-icon">P</span><div><b>Printify connected</b><small>Your connection will be remembered</small></div><button onClick={async () => { await fetch("/api/printify", { method: "DELETE" }); setConnected(false); setToken(""); setTemplateDetails(null); }}>Disconnect</button></div>
              )}
            </div>
          </article>

          <article className={`step-card ${templateLoaded ? "done" : ""}`}>
            <div className="step-number">02</div>
            <div className="step-content">
              <div className="step-heading"><div><p className="mini-label">PRODUCT TEMPLATE</p><h2>Choose your Printify product template</h2></div>{templateLoaded && <span className="done-mark">✓ Loaded</span>}</div>
              <p className="step-copy">Paste the link from a product in My Products. Its provider, colors, sizes, pricing and print areas carry into the whole batch—so make sure the details are correctly set in the template listing before beginning.</p>
              <div className="inline-field">
                <input value={template} onChange={(event) => { setTemplate(event.target.value); setTemplateDetails(null); setTemplateError(""); }} placeholder="Paste your Printify product link" aria-label="Printify product link" />
                <button onClick={loadTemplate} disabled={!connected || !template.trim() || loadingTemplate}>{loadingTemplate ? "Loading…" : "Load template"}</button>
              </div>
              {templateError && <p className="field-error" role="alert">{templateError}</p>}
              {templateDetails && <div className="template-proof"><div className="product-thumb"><span>YOUR<br/>ART</span></div><div className="template-info"><b>{templateDetails.title}</b><span>Print provider · {templateDetails.provider}</span><span>{templateDetails.enabledVariants} enabled variants · {templateDetails.shop}</span></div><span className="template-badge">Verified</span></div>}
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
              <div className="batch-limits" aria-label="Batch limits"><span><b>20</b> designs maximum</span><span><b>75 MB</b> per design</span><span><b>500 MB</b> per batch</span></div>
              <div className="file-reminder"><b>Before uploading</b><span>Designs must already be upscaled if needed. For apparel—or any product where the background should not print—use a transparent-background PNG.</span></div>
              <input ref={folderPicker} className="hidden-picker" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.tif,.tiff" {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={(event) => chooseFiles(event.target.files)} />
              <input ref={imagePicker} className="hidden-picker" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.tif,.tiff" onChange={(event) => chooseFiles(event.target.files)} />
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
            <img src="/goldie-g.png" alt="" className="goldie-g" />
            <p className="mini-label">BATCH SUMMARY</p>
            <h2>{running ? `Creating ${processed + 1} of ${files.length}` : complete ? "Batch finished" : "Current batch"}</h2>
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
              <div className="progress-ring" aria-hidden="true"><span>{processed}/{files.length}</span></div>
              <div className="progress-copy"><b>Creating your Printify drafts</b><span>Keep this page open while Goldie finishes the batch.</span></div>
              <div className="progress-track"><span style={{ width: `${files.length ? (processed / files.length) * 100 : 0}%` }} /></div>
            </div>
          )}

          {!complete ? (
            <button className="launch-button" disabled={!ready || running} onClick={createDrafts}>
              <span className="button-glint" />{running ? `Creating ${processed} of ${files.length}…` : "Create Printify drafts"}<span>→</span>
            </button>
          ) : (
            <div className="batch-actions">
              {drafts.some((draft) => draft.status === "Failed") && <button className="retry-button" onClick={retryFailed}>Retry {drafts.filter((draft) => draft.status === "Failed").length} failed designs</button>}
            </div>
          )}
          <p className="launch-note">Listings remain unpublished until you publish them in Printify.</p>

          {complete && (
            <div className="draft-preview">
              <div className="draft-title"><b>Latest batch</b><span>{drafts.length} results</span></div>
              {drafts.map((draft) => (
                <div className={`draft-row ${draft.status === "Failed" ? "draft-failed" : ""}`} key={draft.name}><span className="draft-check">{draft.status === "Created" ? "✓" : "!"}</span><div><b>{draft.name}</b><small>{draft.status === "Created" ? "Unpublished Printify draft" : draft.error}</small></div>{draft.editorUrl && draft.id ? <button className={`edit-draft-button ${openedDrafts.includes(draft.id) ? "opened" : ""}`} onClick={() => openDraft(draft)}><i />{openedDrafts.includes(draft.id) ? "Opened" : "Edit in Printify"}</button> : <span>—</span>}</div>
              ))}
            </div>
          )}
        </aside>
      </section>

      <footer><span>GOLDIE LISTING FACTORY</span><span>BE A WOLF BIZ · 2026</span></footer>
    </main>
  );
}
