"use client";

/* D724 · The prototype's .goldie-art-grid / .goldie-art-card (source:
   goldie-ux-preview-site @ aad9208, peach-glass). Measured from it:

     .goldie-art-grid     2 columns, gap 12
     .goldie-art-card     #fff, 1px #ded1d8, radius 10, overflow hidden
     .goldie-art-preview  190px tall, #f0eceF
     .goldie-art-meta     grid, align center, padding 12 13, top hairline
     .goldie-link         #6b365a, 11px/750

   This replaces the 46px thumbnail production shows today. The artwork is what
   tells two listings apart — both of hers are labelled "Unisex Garment-Dyed
   Sweatshirt", and her own Etsy grid has three pairs of near-identical titles.
   Presentation only: the caller supplies every value and the open handler. */

export type ArtworkItem = {
  key: string;
  previewUrl?: string;
  name: string;
  meta?: string;
  onOpen?: () => void;
  openLabel?: string;
  /* D724 · The placement card keeps the two hooks its protections are written
     against - the print-quality line (D541) and the live Printify action (D680)
     - so replacing the markup does not quietly drop either guarantee. */
  metaClassName?: string;
  linkClassName?: string;
};

export default function ArtworkGrid({ items }: { items: ArtworkItem[] }) {
  if (!items.length) return null;
  return (
    <div className="factory-art-grid">
      {items.map(item => (
        <article className="factory-art-card" key={item.key}>
          <div className="factory-art-preview">
            {item.previewUrl
              ? <img src={item.previewUrl} alt="" decoding="async" loading="lazy" />
              : null}
          </div>
          <div className="factory-art-meta">
            <div>
              <strong>{item.name}</strong>
              {item.meta ? <small className={item.metaClassName}>{item.meta}</small> : null}
            </div>
            {item.onOpen ? (
              <button type="button" className={item.linkClassName ? `factory-link ${item.linkClassName}` : "factory-link"} onClick={item.onOpen}>
                {item.openLabel ?? "View full size"}
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
