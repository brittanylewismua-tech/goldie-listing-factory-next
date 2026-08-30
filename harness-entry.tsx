import { renderToStaticMarkup } from "react-dom/server";
import FactoryPanel from "./app/factory-panel";
import ArtworkGrid from "./app/artwork-grid";
import PhotoLayout from "./app/photo-layout";
import PageHead from "./app/page-head";

const shirt = (label: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#fff"/><text x="100" y="95" font-family="Georgia" font-size="20" font-weight="800" fill="#b4464d" text-anchor="middle">LIFE IS</text><text x="100" y="120" font-family="Georgia" font-size="20" font-weight="800" fill="#b4464d" text-anchor="middle">BETTER</text><text x="100" y="145" font-family="Georgia" font-size="15" fill="#b4464d" text-anchor="middle">${label}</text></svg>`
  )}`;

const page = (
  <main className="app-shell" data-product-selected="true">
    <aside className="topbar">
      <div className="brand"><b>Goldie</b></div>
      <nav><a href="#">Listing Factory</a><a href="#">Batch history</a><a href="#">Saved products</a></nav>
    </aside>
    <div className="factory-main">
      <header className="factory-top">
        <b>Dachshund batch</b>
        <div><span>Saved just now</span></div>
      </header>
      <div className="factory-work">
        <section className="hero workflow-hero">
          <PageHead
            title="Build the listing photos"
            copy="Review the real Printify placement, choose production photos, and add your own finished lifestyle images—all in one place per listing."
            help={<button className="context-help-trigger" type="button">?</button>}
            stepCount={<p className="hero-step-count">Step 2 of 4 · Designs + images</p>}
            summary="2 listings · 8 photos"
          />
        </section>
        <FactoryPanel index={1} title="Upload finished designs" description="2 print-resolution PNG files · originals stored in this browser" state="2 ready" />
        <FactoryPanel index={2} title="Review Printify placement" description="Open every design full size before photos are chosen" state="2 ready" open onToggle={() => {}} toggleLabel="Close">
          <ArtworkGrid
            items={[
              { key: "a", previewUrl: shirt("Dachshund"), name: "dachshund-red.png", meta: "Listing 1 of 2 · 312 DPI · good to print", openLabel: "Adjust in Printify", onOpen: () => {}, metaClassName: "placement-dpi", linkClassName: "placement-printify-link" },
              { key: "b", previewUrl: shirt("Corgi"), name: "corgi-navy.png", meta: "Listing 2 of 2 · 298 DPI · review before printing", openLabel: "Adjust in Printify", onOpen: () => {}, metaClassName: "placement-dpi", linkClassName: "placement-printify-link" },
            ]}
          />
        </FactoryPanel>
        <FactoryPanel index={3} title="Add your listing photos" description="Drag them into the order buyers will see" state="8 photos" open onToggle={() => {}} toggleLabel="Close">
          <PhotoLayout previewUrl={shirt("Dachshund")} name="dachshund-red.png" meta="4 of 20 photos">
            <section className="listing-photo-order">
              <div className="photo-order-strip">
                {["Front flat lay", "Model front", "Size guide", "Close-up", "Folded", "Back", "Lifestyle", "Detail"].map((name, i) => (
                  <article key={name}>
                    <img src={shirt(String(i + 1))} alt="" />
                    <b>{i < 4 ? "Printify photo" : "Uploaded photo"}</b>
                    <small className="photo-order-name">{name}</small>
                  </article>
                ))}
              </div>
            </section>
          </PhotoLayout>
        </FactoryPanel>
      </div>
    </div>
  </main>
);

process.stdout.write(renderToStaticMarkup(page));
