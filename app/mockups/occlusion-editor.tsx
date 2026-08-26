"use client";
/* D573 - "Keep these parts in front of the design."
   A back print that runs under a hood is not solved by a print-area box: the
   hood has to be painted back over the artwork afterwards. This is where that
   mask is made. Goldie can propose it, and she can correct it by hand, because
   a segmenter that is wrong about hair once will be wrong about it on every
   render until someone fixes it. The result is stored with the scene. */
import { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  maskUrl?: string;
  onSave: (mask: Blob | null) => Promise<void> | void;
  onClose: () => void;
};

export default function OcclusionEditor({ src, maskUrl, onSave, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const photoRef = useRef<HTMLImageElement | null>(null);
  const painting = useRef(false);
  const [brush, setBrush] = useState(46);
  const [erasing, setErasing] = useState(false);
  const [showMask, setShowMask] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  // The mask canvas matches the photograph pixel for pixel, so what is painted
  // here lands exactly where it was painted at render time.
  useEffect(() => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      photoRef.current = image;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      if (!maskUrl) return;
      const existing = new Image();
      existing.crossOrigin = "anonymous";
      existing.onload = () => canvas.getContext("2d")?.drawImage(existing, 0, 0, canvas.width, canvas.height);
      existing.src = maskUrl;
    };
    image.src = src;
  }, [src, maskUrl]);

  function at(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const box = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * canvas.width,
      y: ((event.clientY - box.top) / box.height) * canvas.height,
      radius: (brush / box.width) * canvas.width,
    };
  }

  /* Painting copies pixels from the original photograph rather than filling with
     a colour. What ends up over the artwork is the real hood, not a shape. */
  function paint(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!painting.current) return;
    const canvas = canvasRef.current, photo = photoRef.current;
    if (!canvas || !photo) return;
    const context = canvas.getContext("2d")!;
    const { x, y, radius } = at(event);
    context.save();
    if (erasing) {
      context.globalCompositeOperation = "destination-out";
      context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
    } else {
      context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.clip();
      context.drawImage(photo, 0, 0, canvas.width, canvas.height);
    }
    context.restore();
  }

  async function detect() {
    setDetecting(true); setNote("");
    try {
      const response = await fetch("/api/mockups/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: new URL(src, window.location.origin).toString(),
          prompt: "hood, hair, arms, hands, straps and anything else in front of the printable surface" }),
      });
      const payload = await response.json() as { masks?: Array<{ url: string }>; error?: string };
      if (!response.ok) throw new Error(payload.error || "That did not work.");
      const first = payload.masks?.[0]?.url;
      if (!first) { setNote("Goldie could not find anything crossing the design here. If that is right, save it as is."); return; }
      await new Promise<void>((resolve) => {
        const layer = new Image(); layer.crossOrigin = "anonymous";
        layer.onload = () => { const canvas = canvasRef.current!; canvas.getContext("2d")!.drawImage(layer, 0, 0, canvas.width, canvas.height); resolve(); };
        layer.onerror = () => resolve();
        layer.src = first;
      });
      setNote("Have a look. Paint anything it missed, erase anything it should not have taken.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "That did not work.");
    } finally { setDetecting(false); }
  }

  async function save() {
    const canvas = canvasRef.current; if (!canvas) return;
    setSaving(true);
    try {
      const context = canvas.getContext("2d")!;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let painted = false;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 8) { painted = true; break; }
      // An empty mask is a real answer: nothing crosses the print in this scene.
      if (!painted) { await onSave(null); return; }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      await onSave(blob);
    } finally { setSaving(false); }
  }

  return (
    <div className="modal">
      <div className="calibrator occlusionEditor">
        <button className="close" onClick={onClose}>×</button>
        <p className="mockupEyebrow">KEEP THESE PARTS IN FRONT OF THE DESIGN</p>
        <h2>Paint over anything that should cover the print.</h2>
        <p>On a back view that is usually the hood and any hair falling over it. The design will pass underneath whatever you paint.</p>
        <div className="calImage occlusionStage">
          <img src={src} alt="Scene" />
          <canvas
            ref={canvasRef}
            className={showMask ? "occlusionMask" : "occlusionMask hidden"}
            onPointerDown={(event) => { painting.current = true; event.currentTarget.setPointerCapture(event.pointerId); paint(event); }}
            onPointerMove={paint}
            onPointerUp={() => { painting.current = false; }}
            onPointerLeave={() => { painting.current = false; }}
          />
        </div>
        <div className="occlusionTools">
          <button type="button" className={erasing ? "occTool" : "occTool on"} onClick={() => setErasing(false)}>Paint</button>
          <button type="button" className={erasing ? "occTool on" : "occTool"} onClick={() => setErasing(true)}>Erase</button>
          <label className="occBrush">Brush<input type="range" min={12} max={140} value={brush} onChange={(event) => setBrush(Number(event.target.value))} /></label>
          <button type="button" className="occTool" onClick={() => setShowMask(!showMask)}>{showMask ? "Hide" : "Show"}</button>
          <button type="button" className="occTool" onClick={() => { const canvas = canvasRef.current; if (canvas) canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height); }}>Clear</button>
        </div>
        <div className="calibratorActions">
          <button className="suggestArea" disabled={detecting} onClick={() => void detect()}>{detecting ? "Looking…" : "Find the hood and hair for me"}</button>
          <button className="confirmArea" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save this scene"}</button>
        </div>
        {note && <p className="calibratorNote">{note}</p>}
      </div>
    </div>
  );
}
