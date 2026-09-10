import UPNG from "upng-js";

type Request = { buffer: ArrayBuffer; originalBytes: number };

function percentile(bucket: Uint32Array, count: number, fraction: number) {
  const target = Math.ceil(count * fraction);
  let seen = 0;
  for (let value = 0; value < bucket.length; value += 1) {
    seen += bucket[value];
    if (seen >= target) return value;
  }
  return 255;
}

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const decoded = UPNG.decode(event.data.buffer);
    const original = UPNG.toRGBA8(decoded)[0];
    const quantized = UPNG.quantize([original], 256);
    const reduced = quantized.bufs[0];
    const before = new Uint8Array(original);
    const after = new Uint8Array(reduced);
    const pixels = decoded.width * decoded.height;
    const stride = Math.max(1, Math.floor(pixels / 200_000));
    const differences = new Uint32Array(256);
    let rgbTotal = 0, rgbCount = 0, alphaTotal = 0, alphaCount = 0;
    for (let pixel = 0; pixel < pixels; pixel += stride) {
      const offset = pixel * 4;
      alphaTotal += Math.abs(before[offset + 3] - after[offset + 3]);
      alphaCount += 1;
      if (Math.max(before[offset + 3], after[offset + 3]) <= 8) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        const difference = Math.abs(before[offset + channel] - after[offset + channel]);
        differences[difference] += 1;
        rgbTotal += difference;
        rgbCount += 1;
      }
    }
    const mean = rgbCount ? rgbTotal / rgbCount : 0;
    const p95 = rgbCount ? percentile(differences, rgbCount, .95) : 0;
    const alphaMean = alphaCount ? alphaTotal / alphaCount : 0;
    if (mean > 4 || p95 > 18 || alphaMean > 1) {
      self.postMessage({ ok: false, error: "quality_gate" });
      return;
    }
    const encoded = UPNG.encode(quantized.bufs, decoded.width, decoded.height, 0);
    if (encoded.byteLength >= event.data.originalBytes * .75) {
      self.postMessage({ ok: false, error: "size_gate" });
      return;
    }
    self.postMessage({ ok: true, buffer: encoded }, { transfer: [encoded] });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : "optimization_failed" });
  }
};

export {};
