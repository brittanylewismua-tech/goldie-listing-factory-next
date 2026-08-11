"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type DesignFile = { name: string; size: number; id: string };
type TemplateDetails = { id: string; title: string; provider: string; enabledVariants: number; shop: string };

const demoDrafts = [
  { name: "pink-dorm-collage.png", status: "Ready", variants: 3 },
  { name: "rich-man-poster.png", status: "Ready", variants: 3 },
  { name: "cowgirl-disco.png", status: "Ready", variants: 3 },
];

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
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);

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
      .map((file) => ({ name: file.name, size: file.size, id: `${file.name}-${file.size}-${file.lastModified}` }));
    setFiles(images);
    setComplete(false);
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

  function createDrafts() {
    if (!ready) return;
    setRunning(true);
    window.setTimeout(() => {
      setRunning(false);
      setComplete(true);
    }, 1200);
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
              <p className="step-copy">Upload a complete folder or select individual images. PNG, JPG, WEBP and TIFF are supported.</p>
              <div className="file-reminder"><b>Before uploading</b><span>Designs must already be upscaled if needed. For apparel—or any product where the background should not print—use a transparent-background PNG.</span></div>
              <input ref={folderPicker} className="hidden-picker" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.tif,.tiff" {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={(event) => chooseFiles(event.target.files)} />
              <input ref={imagePicker} className="hidden-picker" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.tif,.tiff" onChange={(event) => chooseFiles(event.target.files)} />
              <div className="upload-actions">
              <button className="folder-drop" onClick={() => folderPicker.current?.click()}>
                <span className="upload-icon" aria-hidden="true">↑</span>
                <span><b>{files.length ? `${files.length} designs ready` : "Choose a folder"}</b><small>{files.length ? `${(totalSize / 1024 / 1024).toFixed(1)} MB selected · Choose again to replace` : "Upload every design in one folder"}</small></span>
                <span className="browse-chip">Browse</span>
              </button>
              <button className="folder-drop" onClick={() => imagePicker.current?.click()}>
                <span className="upload-icon" aria-hidden="true">＋</span>
                <span><b>Choose individual images</b><small>Select one image or several at once</small></span>
                <span className="browse-chip">Browse</span>
              </button>
              </div>
            </div>
          </article>
        </div>

        <aside className="launch-panel">
          <div className="launch-top">
            <img src="/goldie-g.png" alt="" className="goldie-g" />
            <p className="mini-label">BATCH SUMMARY</p>
            <h2>{complete ? "Drafts created" : "Current batch"}</h2>
            <p>{complete ? "Open the latest batch to review placement and sizing in Printify." : "Complete the four sections to create unpublished drafts in Printify."}</p>
          </div>

          <div className="summary-list">
            <div><span>Printify</span><b className={connected ? "ready-text" : "waiting-text"}>{connected ? "Connected" : "Waiting"}</b></div>
            <div><span>Template</span><b>{templateLoaded ? "Loaded" : "—"}</b></div>
            <div><span>Designs</span><b>{files.length || "—"}</b></div>
            <div><span>Publishing</span><b>Draft only</b></div>
          </div>

          {!complete ? (
            <button className="launch-button" disabled={!ready || running} onClick={createDrafts}>
              <span className="button-glint" />{running ? "Building your drafts…" : "Create Printify drafts"}<span>→</span>
            </button>
          ) : (
            <button className="launch-button" onClick={() => window.alert("Your newest batch will open in separate Printify tabs.")}><span className="button-glint" />Open latest batch<span>↗</span></button>
          )}
          <p className="launch-note">Listings remain unpublished until you publish them in Printify.</p>

          {complete && (
            <div className="draft-preview">
              <div className="draft-title"><b>Latest batch</b><span>{files.length || demoDrafts.length} drafts</span></div>
              {(files.length ? files.slice(0, 3).map((file) => ({ name: file.name, status: "Ready", variants: 3 })) : demoDrafts).map((draft) => (
                <div className="draft-row" key={draft.name}><span className="draft-check">✓</span><div><b>{draft.name}</b><small>{draft.variants} variants · {draft.status}</small></div><span>↗</span></div>
              ))}
            </div>
          )}
        </aside>
      </section>

      <footer><span>GOLDIE LISTING FACTORY</span><span>BE A WOLF BIZ · 2026</span></footer>
    </main>
  );
}
