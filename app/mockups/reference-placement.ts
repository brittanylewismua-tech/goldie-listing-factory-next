"use client";

// Placing a design on a lifestyle photo the way Printify placed it on the product.
//
// Brittany's rule: whatever the Printify template placement is, that is exactly
// the lifestyle mockup placement - for a tee, a mug, a shower curtain, anything
// Printify prints. Nothing here knows what the product is.
//
// It was not working, and the reason was structural. Every mockup template is
// saved with a hardcoded box, [[.15,.12],[.85,.12],[.85,.88],[.15,.88]] - the
// middle 70% of the PHOTO. Not the product, not the print area. The renderer
// then warped the artwork onto that box at a fixed 42%. That constant was tuned
// until one set of tee photos looked right, which is why it fell apart on any
// other framing or product.
//
// The fix uses two measurements instead of two constants:
//
//   1. The Printify preview shows the product with the artwork already on it.
//      Measured there: how wide the artwork is as a fraction of the product, and
//      where its centre sits. That is the specification.
//   2. Segmentation locates the same product inside the lifestyle photo.
//
// Reproduce (1) inside (2) and the placement matches, whatever the product.
// Measured on her Gildan Tee: artwork is 14.5% of the garment width, centred
// horizontally, 41.6% down.

export type ReferenceFit = { widthRatio: number; centreX: number; centreY: number };
export type ProductBox = { centreX: number; centreY: number; width: number; height: number };

const near = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/* The artwork inside the Printify preview, relative to the product itself.
   Taken as the largest connected region unlike the product's own colour - a
   plain bounding box also swallows the neck label and the shadow under a
   sleeve, which stretched the measurement to a 0.44 aspect ratio on artwork
   that is actually square. */
export async function measureReference(reference: Blob): Promise<ReferenceFit | null> {
  try {
    const bitmap = await createImageBitmap(reference);
    const width = 700, height = Math.max(1, Math.round(width * bitmap.height / bitmap.width));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const data = context.getImageData(0, 0, width, height).data;
    const at = (x: number, y: number) => { const i = (y * width + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };

    const background = at(2, 2);
    let px0 = width, px1 = -1, py0 = height, py1 = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (near(at(x, y), background) > 30) { if (x < px0) px0 = x; if (x > px1) px1 = x; if (y < py0) py0 = y; if (y > py1) py1 = y; }
    }
    const productWidth = px1 - px0, productHeight = py1 - py0;
    if (productWidth < 40 || productHeight < 40) return null;

    // The product's own colour, so a white tee and a black mug both work.
    const samples: number[][] = [];
    for (let n = 0; n < 400; n++) samples.push(at(px0 + Math.floor(Math.random() * productWidth), py0 + Math.floor(Math.random() * productHeight)));
    const median = (channel: number) => samples.map(s => s[channel]).sort((a, b) => a - b)[samples.length >> 1];
    const base = [median(0), median(1), median(2)];

    const ink = new Uint8Array(width * height);
    for (let y = py0; y <= py1; y++) for (let x = px0; x <= px1; x++) {
      const colour = at(x, y);
      if (near(colour, base) > 70 && near(colour, background) > 30) ink[y * width + x] = 1;
    }

    const seen = new Uint8Array(width * height);
    let best: { n: number; x0: number; x1: number; y0: number; y1: number } | null = null;
    for (let y = py0; y <= py1; y++) for (let x = px0; x <= px1; x++) {
      const id = y * width + x;
      if (!ink[id] || seen[id]) continue;
      const stack = [id]; seen[id] = 1;
      let n = 0, x0 = width, x1 = -1, y0 = height, y1 = -1;
      while (stack.length) {
        const current = stack.pop()!, cy = (current / width) | 0, cx = current % width;
        n++;
        if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
        // A 2px reach keeps thin lettering joined to the artwork it belongs to.
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const ny = cy + dy, nx = cx + dx;
          if (ny < py0 || ny > py1 || nx < px0 || nx > px1) continue;
          const nid = ny * width + nx;
          if (ink[nid] && !seen[nid]) { seen[nid] = 1; stack.push(nid); }
        }
      }
      if (!best || n > best.n) best = { n, x0, x1, y0, y1 };
    }
    if (!best || best.n < 200) return null;

    const widthRatio = (best.x1 - best.x0) / productWidth;
    if (!(widthRatio > 0.01 && widthRatio < 1.2)) return null;
    return {
      widthRatio,
      centreX: ((best.x0 + best.x1) / 2 - px0) / productWidth,
      centreY: ((best.y0 + best.y1) / 2 - py0) / productHeight,
    };
  } catch { return null; }
}

/* Where the product sits in the lifestyle photo. The segmentation endpoint
   returns its box as centre-x, centre-y, width, height - verified by drawing it
   back over the scene, where it bounds the garment exactly. */
export async function productBoxInScene(sceneDataUrl: string, productName: string): Promise<ProductBox | null> {
  try {
    const prompt = productName.trim() ? `the ${productName.trim().toLowerCase()} being worn or displayed` : "the product being worn or displayed";
    const response = await fetch("/api/mockups/analyze", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: sceneDataUrl, prompt }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { masks?: Array<{ score?: number; box?: number[] }> };
    const found = (payload.masks || []).filter(mask => Array.isArray(mask.box) && mask.box.length === 4)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    if (!found || (found.score ?? 0) < 0.4) return null;
    const [centreX, centreY, width, height] = found.box as number[];
    if (!(width > 0.05 && width <= 1 && height > 0.05 && height <= 1)) return null;
    return { centreX, centreY, width, height };
  } catch { return null; }
}


export type Quad=[[number,number],[number,number],[number,number],[number,number]];
export type Adjustment={scale:number;x:number;y:number};

/* D433 - the placement, derived rather than guessed.
   Reproduce the artwork's size and position within the product, exactly as the
   Printify preview shows it, inside the product as segmentation finds it in the
   lifestyle photo. Nothing here is specific to a garment.

   rigid() maps the whole design canvas onto a quad, so with the quad set to the
   product box: artInScene = scale x artWidthOfCanvas x productWidth. The target
   is fit.widthRatio x productWidth, so scale = widthRatio / artWidthOfCanvas.
   The offsets close the gap between where the artwork sits inside its own canvas
   and where the reference puts it on the product. */
export function derivedPlacement(fit:ReferenceFit,box:ProductBox,bounds?:{left:number;top:number;right:number;bottom:number}):{adjustment:Adjustment;quad:Quad}|null{
  const artWidth=Math.max(.05,(bounds?.right??1)-(bounds?.left??0));
  const artCentreX=((bounds?.left??0)+(bounds?.right??1))/2,artCentreY=((bounds?.top??0)+(bounds?.bottom??1))/2;
  const scale=fit.widthRatio/artWidth;
  const x0=box.centreX-box.width/2,y0=box.centreY-box.height/2,x1=box.centreX+box.width/2,y1=box.centreY+box.height/2;
  /* A measurement can be wrong in ways the maths cannot see - a Printify preview
     that is a model shot rather than a flat lay, or segmentation returning the
     person instead of the product. Rather than trust a derived number that lands
     somewhere absurd, hand back nothing and let the caller fall back. The bounds
     are deliberately loose: this is a sanity check, not a second guess. */
  const artOfProduct=scale*artWidth;
  if(!Number.isFinite(scale)||artOfProduct<.02||artOfProduct>1.05)return null;
  if(fit.centreX<0||fit.centreX>1||fit.centreY<0||fit.centreY>1)return null;
  if(x0<-.05||y0<-.05||x1>1.05||y1>1.05||x1-x0<.05||y1-y0<.05)return null;
  return {
    adjustment:{scale,x:fit.centreX-.5-(artCentreX-.5)*scale,y:fit.centreY-.5-(artCentreY-.5)*scale},
    quad:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]] as Quad,
  };
}
