"use client";
/* Stage 1 of the embedded editor. Lives inside Listing Factory - it never
   navigates away, never reloads, and never opens the old standalone flow.

   Konva provides the pointer, selection and handle behaviour. It does NOT
   render the result: Konva is affine-only, so four-corner perspective is
   impossible in it. The picture on screen comes from composite(), the same
   function the export calls, so what a seller approves is exactly what ships. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Circle, Line } from "react-konva";
import {
  type PlacementTransform, type Quad, type RenderingMode, type BlendMode, type NormalizedPoint,
  fitWithinSurface, toViewport,
} from "./placement-profile.ts";
import { composite, exportComposite } from "./scene-composite.ts";

const BLENDS: Array<{ value: BlendMode; label: string }> = [
  { value: "normal", label: "Normal" }, { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" }, { value: "overlay", label: "Overlay" },
  { value: "soft-light", label: "Soft light" },
];

function useImage(src: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) { setImage(null); return; }
    const element = new Image();
    element.crossOrigin = "anonymous";
    element.onload = () => setImage(element);
    element.src = src;
    return () => { element.onload = null; };
  }, [src]);
  return image;
}

export type SceneEditorProps = {
  sceneName: string;
  photoUrl: string;
  artworkUrl: string;
  surface: Quad;
  mode: RenderingMode;
  transform: PlacementTransform;
  /* Goldie's automatic placement, so "Reset placement" always has a home. */
  automatic: PlacementTransform;
  foregroundUrl?: string | null;
  hasNext?: boolean;
  /* `improveScene` is the seller explicitly saying this correction is about the
     PHOTOGRAPH rather than about this one design. Without it, the correction
     stays attached to this listing and no other design inherits it. */
  onSave: (transform: PlacementTransform, exported: Blob, improveScene: boolean) => Promise<void> | void;
  onSaveNext?: (transform: PlacementTransform, exported: Blob, improveScene: boolean) => Promise<void> | void;
  onCancel: () => void;
};

export default function SceneEditor(props: SceneEditorProps) {
  const photo = useImage(props.photoUrl);
  const artwork = useImage(props.artworkUrl);
  const foreground = useImage(props.foregroundUrl || null);

  const [transform, setTransform] = useState<PlacementTransform>(props.transform);
  const [past, setPast] = useState<PlacementTransform[]>([]);
  const [future, setFuture] = useState<PlacementTransform[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showBefore, setShowBefore] = useState(false);
  const [saving, setSaving] = useState("");
  const [improveScene, setImproveScene] = useState(false);
  const dragOrigin = useRef<{ pointer: { x: number; y: number }; corners: Quad } | null>(null);

  /* Every change goes through here so undo and redo restore the transform AND
     the rendering settings together - they are one record, not two. */
  const change = useCallback((next: Partial<PlacementTransform>) => {
    setTransform(current => { setPast(p => [...p.slice(-40), current]); setFuture([]); return { ...current, ...next }; });
  }, []);
  const undo = useCallback(() => setPast(p => {
    if (!p.length) return p;
    setFuture(f => [transform, ...f].slice(0, 40));
    setTransform(p[p.length - 1]);
    return p.slice(0, -1);
  }), [transform]);
  const redo = useCallback(() => setFuture(f => {
    if (!f.length) return f;
    setPast(p => [...p, transform]);
    setTransform(f[0]);
    return f.slice(1);
  }), [transform]);

  // The editor viewport is a scaled preview; nothing about it reaches storage.
  const view = useMemo(() => {
    const maxWidth = 760, maxHeight = 560;
    if (!photo) return { width: maxWidth, height: maxHeight, scale: 1 };
    const scale = Math.min(maxWidth / photo.naturalWidth, maxHeight / photo.naturalHeight, 1);
    return { width: Math.round(photo.naturalWidth * scale), height: Math.round(photo.naturalHeight * scale), scale };
  }, [photo]);

  /* The composite, at preview size, from the same function the export uses. */
  const preview = useMemo(() => {
    if (!photo || !artwork) return null;
    if (showBefore) return null;
    try {
      return composite({
        photo: Object.assign(photo, { width: photo.naturalWidth, height: photo.naturalHeight }),
        artwork: Object.assign(artwork, { width: artwork.naturalWidth, height: artwork.naturalHeight }),
        transform, mode: props.mode, foreground,
        width: view.width, height: view.height,
      });
    } catch { return null; }
  }, [photo, artwork, foreground, transform, props.mode, view.width, view.height, showBefore]);

  // Autosave in progress work so a refresh does not discard it.
  const draftKey = `goldie-editor-${props.sceneName}`;
  useEffect(() => {
    try { window.sessionStorage.setItem(draftKey, JSON.stringify(transform)); } catch { /* private mode */ }
  }, [draftKey, transform]);
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(draftKey);
      if (saved) setTransform(JSON.parse(saved) as PlacementTransform);
    } catch { /* nothing recoverable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === "z" && !event.shiftKey) { event.preventDefault(); undo(); }
      if (event.key === "z" && event.shiftKey) { event.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [undo, redo]);

  const cornerAt = (index: number) => toViewport(transform.corners[index], view);

  const moveCorner = (index: number, x: number, y: number) => {
    const next = transform.corners.map((point, i) =>
      i === index ? [x / view.width, y / view.height] as NormalizedPoint : point) as Quad;
    change({ corners: next });
  };

  /* Dragging the whole design: every corner moves together, so perspective is
     preserved rather than flattened. */
  const dragAll = (dx: number, dy: number, from: Quad) => {
    change({ corners: from.map(([x, y]) => [x + dx / view.width, y + dy / view.height] as NormalizedPoint) as Quad });
  };

  const scaleAll = (factor: number) => {
    const cx = transform.corners.reduce((a, p) => a + p[0], 0) / 4;
    const cy = transform.corners.reduce((a, p) => a + p[1], 0) / 4;
    change({ corners: transform.corners.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor] as NormalizedPoint) as Quad });
  };

  async function runSave(next?: boolean) {
    if (!photo || !artwork) return;
    setSaving(next ? "Saving…" : "Saving…");
    try {
      const blob = await exportComposite({
        photo: Object.assign(photo, { width: photo.naturalWidth, height: photo.naturalHeight }),
        artwork: Object.assign(artwork, { width: artwork.naturalWidth, height: artwork.naturalHeight }),
        transform, mode: props.mode, foreground,
      });
      try { window.sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
      if (next && props.onSaveNext) await props.onSaveNext(transform, blob, improveScene);
      else await props.onSave(transform, blob, improveScene);
    } finally { setSaving(""); }
  }

  const busy = !photo || !artwork;

  return (
    <div className="modal sceneEditorModal">
      <div className="sceneEditor">
        <header className="sceneEditorHead">
          <div>
            <p className="mockupEyebrow">ADJUST PLACEMENT</p>
            <h2>{props.sceneName}</h2>
          </div>
          <button className="close" onClick={props.onCancel} aria-label="Cancel">×</button>
        </header>

        <div className="sceneEditorBody">
          <div className="sceneEditorCanvas" onWheel={event => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            setZoom(z => Math.min(4, Math.max(.4, z - event.deltaY / 500)));
          }}>
            {busy ? <p className="sceneEditorLoading">Opening your photo…</p> : (
              <Stage width={view.width} height={view.height} scaleX={zoom} scaleY={zoom} x={pan.x} y={pan.y}
                draggable onDragEnd={event => setPan({ x: event.target.x(), y: event.target.y() })}>
                <Layer>
                  {showBefore
                    ? <KonvaImage image={photo!} width={view.width} height={view.height} />
                    : preview ? <KonvaImage image={preview} width={view.width} height={view.height} /> : null}
                </Layer>
                <Layer>
                  {/* the design's outline, so it can be grabbed and moved as one */}
                  <Line
                    points={transform.corners.flatMap(p => [p[0] * view.width, p[1] * view.height])}
                    closed stroke="#d6a83f" strokeWidth={1.5} dash={[6, 4]}
                    draggable
                    onDragStart={() => { dragOrigin.current = { pointer: { x: 0, y: 0 }, corners: transform.corners }; }}
                    onDragMove={event => {
                      const from = dragOrigin.current?.corners; if (!from) return;
                      dragAll(event.target.x(), event.target.y(), from);
                    }}
                    onDragEnd={event => { event.target.position({ x: 0, y: 0 }); dragOrigin.current = null; }}
                  />
                  {transform.corners.map((_, index) => {
                    const at = cornerAt(index);
                    return <Circle key={index} x={at.x} y={at.y} radius={7 / zoom} fill="#fff" stroke="#d6a83f" strokeWidth={2 / zoom}
                      draggable onDragMove={event => moveCorner(index, event.target.x(), event.target.y())} />;
                  })}
                </Layer>
              </Stage>
            )}
          </div>

          <aside className="sceneEditorControls">
            <div className="editorRow">
              <button onClick={() => scaleAll(1.06)}>Bigger</button>
              <button onClick={() => scaleAll(1 / 1.06)}>Smaller</button>
              <button onClick={() => change({ rotation: transform.rotation - 2 })}>Rotate ↺</button>
              <button onClick={() => change({ rotation: transform.rotation + 2 })}>Rotate ↻</button>
            </div>
            <div className="editorRow">
              <button onClick={() => change({ flipX: !transform.flipX })}>Flip across</button>
              <button onClick={() => change({ flipY: !transform.flipY })}>Flip down</button>
            </div>

            <label className="editorField">Lean sideways
              <input type="range" min={-.6} max={.6} step={.02} value={transform.skewX}
                onChange={e => change({ skewX: Number(e.target.value) })} /></label>
            <label className="editorField">Lean up and down
              <input type="range" min={-.6} max={.6} step={.02} value={transform.skewY}
                onChange={e => change({ skewY: Number(e.target.value) })} /></label>

            <label className="editorField">How strong the design looks
              <input type="range" min={.2} max={1} step={.02} value={transform.opacity}
                onChange={e => change({ opacity: Number(e.target.value) })} /></label>

            <label className="editorField">How it sits on the surface
              <select value={transform.blendMode} onChange={e => change({ blendMode: e.target.value as BlendMode })}>
                {BLENDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select></label>

            {props.mode === "fabric" && (
              <label className="editorField">Let the fabric show through
                <input type="range" min={0} max={1} step={.02} value={transform.fabricStrength}
                  onChange={e => change({ fabricStrength: Number(e.target.value) })} />
                <span className="editorHint">Keeps the design&rsquo;s colour and borrows the garment&rsquo;s folds and shadows.</span>
              </label>
            )}
            {props.mode === "cylindrical" && (
              <label className="editorField">Curve around the product
                <input type="range" min={0} max={1} step={.02} value={transform.curvature}
                  onChange={e => change({ curvature: Number(e.target.value) })} /></label>
            )}

            <div className="editorRow">
              <button onClick={() => change({ corners: fitWithinSurface(transform.corners, props.surface) })}>Fit to the product</button>
              <button onClick={() => change({ ...props.automatic })}>Reset placement</button>
            </div>
            <div className="editorRow">
              <button onClick={undo} disabled={!past.length}>Undo</button>
              <button onClick={redo} disabled={!future.length}>Redo</button>
              <button onMouseDown={() => setShowBefore(true)} onMouseUp={() => setShowBefore(false)}
                onMouseLeave={() => setShowBefore(false)}>Hold to compare</button>
            </div>
            <div className="editorRow editorZoom">
              <button onClick={() => setZoom(z => Math.min(4, z + .2))}>Zoom in</button>
              <button onClick={() => setZoom(z => Math.max(.4, z - .2))}>Zoom out</button>
              <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset view</button>
            </div>
          </aside>
        </div>

        <footer className="sceneEditorActions">
          <label className="improveScene" title="Only the way this photo works is remembered - never this design's size or position.">
            <input type="checkbox" checked={improveScene} onChange={e => setImproveScene(e.target.checked)} />
            Improve this scene for future designs
          </label>
          <button className="resetPoints" onClick={props.onCancel}>Cancel</button>
          <button className="confirmArea" disabled={busy || Boolean(saving)} onClick={() => void runSave(false)}>
            {saving || "Save"}</button>
          {props.hasNext && props.onSaveNext && (
            <button className="confirmArea" disabled={busy || Boolean(saving)} onClick={() => void runSave(true)}>
              Save &amp; next</button>
          )}
        </footer>
      </div>
    </div>
  );
}
