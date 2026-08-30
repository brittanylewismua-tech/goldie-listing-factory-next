/* Renders the migrated screens to static HTML so they can be looked at.

   The preview environment has no Printify connection and no batch, so it can
   only ever render the Connect screen - steps 1 to 4 do not exist there. This
   is how they get seen: it server-renders the real components with fixture
   data, and the output goes into a browser beside the prototype.

   Every defect in D738-D741 was found this way and none of them were visible
   in the components on their own.

     node_modules/.bin/esbuild tools/render-screens.tsx --bundle --platform=node \
       --format=cjs --jsx=automatic --outfile=screens.cjs \
       --external:react --external:react-dom
     node screens.cjs images > /tmp/images.html      # product | images | listing | publish

   The bundle has to sit at the repo root so node resolves react from
   node_modules; delete it afterwards.

   Known gap: SavedWorkflow loads its products in an effect, and effects do not
   run under server rendering, so step 1's tiles below are written from that
   component's source rather than produced by it. Everything else is the real
   component's own output. */

import { renderToStaticMarkup } from "react-dom/server";
import FactoryPanel from "../app/factory-panel";
import ArtworkGrid from "../app/artwork-grid";
import PhotoLayout from "../app/photo-layout";
import PageHead from "../app/page-head";
import FactoryFooter from "../app/factory-footer";
import RequiredDetailsChecklist from "../app/required-details-checklist";

const art = (l: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#fbf7fa"/><text x="100" y="96" font-family="Georgia" font-size="17" font-weight="800" fill="#b4464d" text-anchor="middle">LIFE IS BETTER</text><text x="100" y="126" font-family="Georgia" font-size="20" fill="#b4464d" text-anchor="middle">${l}</text></svg>`)}`;

const head = (title: string, copy: string, step: string, chip: string) => (
  <section className="hero workflow-hero">
    <PageHead title={title} copy={copy} help={<button className="context-help-trigger" type="button">?</button>}
      stepCount={<p className="hero-step-count">{step}</p>} summary={chip} />
  </section>
);

const tile = (name: string, meta: string, chosen: boolean) => (
  <article className={`recipe-tile ${chosen ? "selected" : ""}`} key={name}>
    <button className="recipe-use" type="button">
      <span className="recipe-icon" aria-hidden="true" />
      <span className="recipe-copy"><b>{name}</b><small>{meta}</small><em>{chosen ? "✓ Ready" : "Choose →"}</em></span>
    </button>
    {chosen ? <button className="change-product" type="button">Change</button> : null}
    <button className="edit-recipe" type="button">Edit</button>
    <button className="delete-recipe" type="button">×</button>
  </article>
);

const row = (title: string, meta: string, checked: boolean) => (
  <article className="final-listing-card" key={title}>
    <label className="final-listing-select"><input type="checkbox" defaultChecked={checked} /></label>
    <img src={art("Dachshund")} alt="" />
    <div><b>{title}</b><small>{meta}</small></div>
    <div className="final-listing-links"><button type="button">Open in Etsy</button><button type="button">Edit</button></div>
  </article>
);

const screens = {
  product: (<>
    {head("Choose what you’re selling", "Pick one saved product or a bundle. Goldie carries its verified variants, pricing, shipping and placement into every listing.", "Step 1 of 4 · Choose product", "1 product selected")}
    <section className="workspace"><div className="workflow-stage"><div className="steps-column">
      <FactoryPanel index={1} title="Saved products" description="3 saved products · choose the one this batch prints on" state="1 selected" tone="done" open onToggle={() => {}} toggleLabel="Close">
        <div className="recipe-grid">
          {tile("Unisex Garment-Dyed Sweatshirt", "Comfort Colors 1566 · 8 colours · 5 sizes", true)}
          {tile("Unisex Heavyweight Tee", "Comfort Colors 1717 · 12 colours · 6 sizes", false)}
          {tile("Gildan Hoodie 18500", "Gildan 18500 · 6 colours · 5 sizes", false)}
        </div>
      </FactoryPanel>
      <FactoryPanel index={2} title="Colours, sizes and pricing" description="Verified from Printify · 40 variants" state="Ready" tone="done" />
    </div></div>
    <div className="workflow-footer-actions"><button className="workflow-back" type="button">← Back</button><span className="autosave-note">✓ Saved automatically</span><button className="workflow-next" type="button">Next step →</button></div>
    </section>
  </>),
  images: (<>
    {head("Build the listing photos", "Review the real Printify placement, choose production photos, and add your own finished lifestyle images—all in one place per listing.", "Step 2 of 4 · Designs + images", "2 listings · 8 photos")}
    <section className="workspace"><div className="workflow-stage"><div className="steps-column">
      <FactoryPanel index={1} title="Upload finished designs" description="2 print-resolution PNG files · originals stored in this browser" state="2 ready" />
      <FactoryPanel index={2} title="Review Printify placement" description="Open every design full size before photos are chosen" state="2 ready" open onToggle={() => {}} toggleLabel="Close">
        <ArtworkGrid items={[
          { key: "a", previewUrl: art("Dachshund"), name: "dachshund-red.png", meta: "Listing 1 of 2 · 312 DPI · good to print", openLabel: "Adjust in Printify", onOpen: () => {}, metaClassName: "placement-dpi", linkClassName: "placement-printify-link" },
          { key: "b", previewUrl: art("Corgi"), name: "corgi-navy.png", meta: "Listing 2 of 2 · 298 DPI · review before printing", openLabel: "Adjust in Printify", onOpen: () => {}, metaClassName: "placement-dpi", linkClassName: "placement-printify-link" },
        ]} />
      </FactoryPanel>
      <FactoryPanel index={3} title="Add your listing photos" description="Drag them into the order buyers will see" state="8 photos" open onToggle={() => {}} toggleLabel="Close">
        <PhotoLayout previewUrl={art("Dachshund")} name="dachshund-red.png" meta="4 of 20 photos">
          <section className="listing-photo-order"><div className="photo-order-strip">
            {["Front flat lay","Model front","Size guide","Close-up","Folded","Back","Lifestyle","Detail"].map((n,i)=>(
              <article key={n}><img src={art(String(i+1))} alt="" /><b>{i<4?"Printify photo":"Uploaded photo"}</b><small className="photo-order-name">{n}</small></article>))}
          </div></section>
        </PhotoLayout>
      </FactoryPanel>
    </div></div>
    <div className="workflow-footer-actions"><button className="workflow-back" type="button">← Back</button><span className="autosave-note">✓ Saved automatically</span><button className="workflow-next" type="button">Next step →</button></div>
    </section>
  </>),
  listing: (<>
    {head("Listing details", "Create the titles and tags, then review the description for every listing.", "Step 3 of 4 · Listing", "2 listings")}
    <section className="workspace"><div className="workflow-stage"><div className="steps-column">
      <FactoryPanel index={1} title="Titles and tags" description="Two listings · 13 tags each" state="2 ready" open onToggle={() => {}} toggleLabel="Close">
        <div className="factory-listing-grid">
          <div className="etsy-details-editor-fields factory-form-card">
            <h3>Etsy details</h3>
            <label>Etsy category<small>Current: Clothing &gt; Sweatshirts</small><input type="search" placeholder="Search Etsy categories" /></label>
            <label>Primary colour<select><option>Red</option></select></label>
            <label>Occasion<input type="text" defaultValue="Birthday" /></label>
          </div>
          <RequiredDetailsChecklist items={[
            { key: "c", label: "Etsy category", value: "Clothing > Sweatshirts", required: true },
            { key: "1", label: "Primary colour", value: "Red", required: true },
            { key: "2", label: "Garment care", value: "", required: true },
            { key: "3", label: "Occasion", value: "Birthday", required: false },
          ]} />
        </div>
      </FactoryPanel>
    </div></div>
    <div className="workflow-footer-actions"><button className="workflow-back" type="button">← Back</button><span className="autosave-note">✓ Saved automatically</span><button className="workflow-next" type="button">Next step →</button></div>
    </section>
  </>),
  publish: (<>
    {head("Review and publish", "Check every listing one last time, then publish the ones you have selected.", "Step 4 of 4 · Publish", "2 listings ready")}
    <section className="workspace"><div className="workflow-stage"><div className="steps-column">
      <div className="factory-review">
        <div className="factory-review-list">
          <section className="final-listing-review"><div className="final-listing-grid">
            {row("Life Is Better With A Dachshund Sweatshirt, Dog Mom Gift, Comfort Colors 1566", "118/140 characters · 13 tags · 8 photos", true)}
            {row("My Best Friend Has Paws Sweatshirt, Dog Lover Gift", "96/140 characters · 13 tags · 8 photos", true)}
            {row("Corgi Mom Crewneck, Gift For Dog Mom", "84/140 characters · 12 tags · 6 photos", false)}
          </div></section>
        </div>
        <div className="factory-publish-box">
          <div className="publish-live-warning"><small>Publishing is live</small><h3>2 listings ready</h3><p>These go live on Etsy the moment you press publish. Etsy charges $0.20 per listing — $0.40 for this press.</p></div>
          <button className="publish-all-button" type="button">Publish 2 selected listings live on Etsy<small className="publish-all-shop">to BeAWolfBiz</small></button>
        </div>
      </div>
    </div></div>
    </section>
  </>),
};

const which = (process.argv[2] || "product") as keyof typeof screens;
process.stdout.write(renderToStaticMarkup(
  <main className="app-shell" data-product-selected="true">
    <aside className="topbar"><div className="brand"><b>Goldie</b></div></aside>
    <div className="factory-main">
      <header className="factory-top"><b>Dachshund batch</b><div><span>Saved just now</span></div></header>
      <div className="factory-work">
        <nav className="workflow-progress" aria-label="progress">
          {["Product","Images","Listing","Publish"].map((s,i)=>(<button key={s} type="button"><span>{i+1}</span><b>{s}</b></button>))}
        </nav>
        {screens[which]}
        <footer><span>GOLDIE LISTING FACTORY</span><span>BE A WOLF BIZ · 2026</span></footer>
      </div>
    </div>
  </main>
));
