type Bounds = { left: number; top: number; right: number; bottom: number };
type Request = { buffer: ArrayBuffer; originalBytes: number; bounds?: Bounds };

/* Crop already-measured transparent padding with the browser's native image
   decoder/encoder. This preserves every visible source pixel and avoids the
   large palette-analysis cost that made a 5,016px PNG sit at 0% for a minute. */
self.onmessage = async (event: MessageEvent<Request>) => {
  try {
    const source = await createImageBitmap(new Blob([event.data.buffer], { type: "image/png" }));
    const measured = event.data.bounds ?? { left: 0, top: 0, right: 1, bottom: 1 };
    const margin = .006;
    const left = Math.max(0, measured.left - margin);
    const top = Math.max(0, measured.top - margin);
    const right = Math.min(1, measured.right + margin);
    const bottom = Math.min(1, measured.bottom + margin);
    const x = Math.floor(left * source.width);
    const y = Math.floor(top * source.height);
    const width = Math.max(1, Math.ceil(right * source.width) - x);
    const height = Math.max(1, Math.ceil(bottom * source.height) - y);
    if (width >= source.width * .97 && height >= source.height * .97) {
      source.close();
      self.postMessage({ ok: false, error: "no_safe_crop" });
      return;
    }
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas_unavailable");
    context.drawImage(source, x, y, width, height, 0, 0, width, height);
    source.close();
    const blob = await canvas.convertToBlob({ type: "image/png" });
    if (blob.size >= event.data.originalBytes * .82) {
      self.postMessage({ ok: false, error: "size_gate" });
      return;
    }
    const buffer = await blob.arrayBuffer();
    self.postMessage({ ok: true, buffer }, { transfer: [buffer] });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : "optimization_failed" });
  }
};

export {};
