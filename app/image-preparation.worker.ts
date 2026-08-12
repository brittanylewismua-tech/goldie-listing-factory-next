/// <reference lib="webworker" />

import UPNG from "upng-js";

type PrepareRequest = {
  file: File;
  maxPrintWidth?: number | null;
  maxPrintHeight?: number | null;
};

type PreparedMessage =
  | { type: "progress"; message: string }
  | { type: "complete"; blob: Blob; fileName: string }
  | { type: "error"; message: string };

const transportLimit = 4.5 * 1024 * 1024;

self.onmessage = async (event: MessageEvent<PrepareRequest>) => {
  const { file, maxPrintWidth, maxPrintHeight } = event.data;
  const send = (message: PreparedMessage) => self.postMessage(message);

  try {
    send({ type: "progress", message: `Preparing ${file.name}` });
    const bitmap = await createImageBitmap(file);
    const productScale = maxPrintWidth && maxPrintHeight
      ? Math.min(1, maxPrintWidth / bitmap.width, maxPrintHeight / bitmap.height)
      : 1;
    let width = Math.max(1, Math.round(bitmap.width * productScale));
    let height = Math.max(1, Math.round(bitmap.height * productScale));
    const supportedPng = file.type === "image/png" || /\.png$/i.test(file.name);
    const supportedJpeg = /image\/jpe?g/i.test(file.type) || /\.jpe?g$/i.test(file.name);

    if (productScale === 1 && file.size <= transportLimit && (supportedPng || supportedJpeg)) {
      bitmap.close();
      send({ type: "complete", blob: file, fileName: file.name });
      return;
    }

    const preserveTransparency = supportedPng || (!supportedJpeg && file.type !== "image/jpeg");
    let repacked: Blob | null = null;
    let pass = 0;
    while (!repacked || repacked.size > transportLimit) {
      pass += 1;
      send({ type: "progress", message: `Optimizing ${file.name}${pass > 1 ? ` · pass ${pass}` : ""}` });
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d", { willReadFrequently: preserveTransparency });
      if (!context) throw new Error("The browser could not prepare this image.");
      context.drawImage(bitmap, 0, 0, width, height);
      repacked = await canvas.convertToBlob({ type: preserveTransparency ? "image/png" : "image/jpeg", quality: 0.94 });

      if (preserveTransparency && repacked.size > transportLimit) {
        const pixels = context.getImageData(0, 0, width, height);
        for (const colorCount of [0, 512, 256]) {
          const optimized = new Blob([UPNG.encode([pixels.data.buffer], width, height, colorCount)], { type: "image/png" });
          if (optimized.size < repacked.size) repacked = optimized;
          if (repacked.size <= transportLimit) break;
        }
      }

      if (repacked.size > transportLimit) {
        width = Math.max(1, Math.round(width * 0.9));
        height = Math.max(1, Math.round(height * 0.9));
      }
    }

    bitmap.close();
    const fileName = preserveTransparency ? file.name.replace(/\.[^.]+$/, ".png") : file.name.replace(/\.[^.]+$/, ".jpg");
    send({ type: "complete", blob: repacked, fileName });
  } catch (error) {
    send({ type: "error", message: error instanceof Error ? error.message : "This image could not be prepared." });
  }
};

export {};
