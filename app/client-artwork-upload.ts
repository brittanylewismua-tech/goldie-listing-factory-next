export const MAX_DIRECT_PRINTIFY_BYTES = 40 * 1024 * 1024;
const LARGE_TRANSPARENT_PNG_BYTES = 12 * 1024 * 1024;

type Bounds = { left: number; top: number; right: number; bottom: number };
type OptimizerReply = { ok: true; buffer: ArrayBuffer } | { ok: false; error?: string };
let optimizerQueue: Promise<void> = Promise.resolve();

async function runLargePngOptimizer(file: File, bounds?: Bounds) {
  let buffer: ArrayBuffer;
  try { buffer = await file.arrayBuffer(); } catch { return null; }
  return new Promise<Blob | null>((resolve) => {
    let worker: Worker;
    /* Keep the worker at a real same-origin public URL. The production bundler
       otherwise emitted a build-machine address that browsers reject. */
    try { worker = new Worker("/large-png-worker.js"); }
    catch { resolve(null); return; }
    const timeout = window.setTimeout(() => { worker.terminate(); resolve(null); }, 30_000);
    worker.onmessage = (event: MessageEvent<OptimizerReply>) => {
      window.clearTimeout(timeout);
      worker.terminate();
      resolve(event.data.ok ? new Blob([event.data.buffer], { type: "image/png" }) : null);
    };
    worker.onerror = () => { window.clearTimeout(timeout); worker.terminate(); resolve(null); };
    try {
      worker.postMessage({ buffer, originalBytes: file.size, bounds }, [buffer]);
    } catch {
      window.clearTimeout(timeout);
      worker.terminate();
      resolve(null);
    }
  });
}

/* Large transparent PNGs are serialized so two 25–40 MB designs cannot each
   hold several decoded pixel buffers at once on a memory-constrained laptop.
   The worker accepts its smaller indexed result only when a sampled visual and
   alpha-error gate passes; otherwise the untouched original is used. */
function optimizeLargeTransparentPng(file: File, bounds?: Bounds) {
  let finish!: () => void;
  const turn = new Promise<void>((resolve) => { finish = resolve; });
  const prior = optimizerQueue;
  optimizerQueue = turn;
  return prior.then(() => runLargePngOptimizer(file, bounds)).finally(finish);
}

function jpegBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("The Listing Factory could not optimize this artwork.")),
    "image/jpeg",
    quality,
  ));
}

export async function prepareArtworkFile(file: File, hasTransparency: boolean, allowWhiteFlatten = false, bounds?: Bounds) {
  /* Printify already accepts this file. Sending its original bytes is both the
     fastest and the safest path: the previous order ran the PNG optimizer for
     every transparent file over 12 MB even when it was under Printify's 40 MB
     limit. A rejected optimization then added up to 30 seconds and returned
     this exact original file anyway. Reserve optimization for a file that
     cannot be sent directly. */
  if (file.size <= MAX_DIRECT_PRINTIFY_BYTES) return { blob: file as Blob, fileName: file.name };
  if (/\.png$/i.test(file.name) && hasTransparency && file.size > LARGE_TRANSPARENT_PNG_BYTES) {
    const optimized = await optimizeLargeTransparentPng(file, bounds);
    if (optimized && optimized.size < file.size * .82 && optimized.size <= MAX_DIRECT_PRINTIFY_BYTES) {
      return { blob: optimized, fileName: file.name.replace(/\.png$/i, "-optimized.png"), bounds: { left: 0, top: 0, right: 1, bottom: 1 } };
    }
  }
  if (hasTransparency && !allowWhiteFlatten) throw new Error("This transparent PNG is too large for Printify's upload request. Export an optimized transparent PNG under 40 MB; keep the same pixel dimensions so the DPI does not change.");

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) { bitmap.close(); throw new Error("The Listing Factory could not optimize this artwork."); }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  let blob = await jpegBlob(canvas, .94);
  if (blob.size > MAX_DIRECT_PRINTIFY_BYTES) blob = await jpegBlob(canvas, .86);
  if (blob.size > MAX_DIRECT_PRINTIFY_BYTES) throw new Error("This artwork is still too large after safe optimization. Export an optimized JPG under 40 MB; keep the same pixel dimensions so the DPI does not change.");
  return { blob, fileName: file.name.replace(/\.[^.]+$/, "") + "-goldie-optimized.jpg" };
}
