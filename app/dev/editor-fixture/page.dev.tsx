"use client";
/* DEVELOPMENT ONLY.

   The real Listing Factory route needs a signed-in seller, a Printify draft and
   a prepared mockup library, none of which exist in a local Cloudflare dev
   environment with an empty D1. This page stands in for that: it mounts the SAME
   SceneEditor component, the SAME compositor and the SAME export path as Step 2,
   against fixture data, so the editor can be operated locally without touching
   production or publishing anything.

   It refuses to render outside development. `process.env.NODE_ENV` is inlined at
   build time, so in a production build the guard below is a constant and the
   whole page collapses to a refusal. */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  defaultTransform, renderingModeFor, artworkQuadFor,
  type PlacementTransform, type Quad, type RenderingMode,
} from "../../mockups/placement-profile";
import "../../mockups/mockups.css";

const SceneEditor = lazy(() => import("../../mockups/scene-editor"));

/* A garment photograph and a design, drawn locally so the fixture needs no
   network, no R2 and no seeded database. */
function fixturePhoto(width = 1000, height = 1250) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#cfe3ef"); sky.addColorStop(1, "#e8dcc8");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
  // a shirt-like shape with folds, so fabric shading has something to borrow
  ctx.fillStyle = "#f3efe6";
  ctx.beginPath();
  ctx.moveTo(width * .22, height * .22); ctx.lineTo(width * .78, height * .22);
  ctx.lineTo(width * .84, height * .46); ctx.lineTo(width * .74, height * .5);
  ctx.lineTo(width * .76, height * .9); ctx.lineTo(width * .24, height * .9);
  ctx.lineTo(width * .26, height * .5); ctx.lineTo(width * .16, height * .46);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.06)"; ctx.lineWidth = width * .012;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.moveTo(width * (.28 + i * .05), height * .3);
    ctx.quadraticCurveTo(width * (.3 + i * .05), height * .6, width * (.27 + i * .05), height * .88);
    ctx.stroke();
  }
  return canvas.toDataURL("image/jpeg", .92);
}

function fixtureArtwork(label: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 800; canvas.height = 800;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 800, 800);
  ctx.fillStyle = "#c0392b";
  ctx.beginPath(); ctx.arc(400, 400, 330, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "bold 120px sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, 400, 400);
  return canvas.toDataURL("image/png");
}

/* The scene's printable surface, as preparation would have measured it. */
const SURFACE: Quad = [[.32, .30], [.70, .31], [.69, .62], [.31, .61]];

/* Real Printify placement contracts, so the fixture exercises the property that
   matters: each design brings its own size and position. */
const CASES = [
  { name: "Pocket print", product: "Gildan Tee", placement: { x: .26, y: .26, scale: .18, angle: 0 } },
  { name: "Standard front", product: "Gildan Tee", placement: { x: .5, y: .5, scale: .45, angle: 0 } },
  { name: "Oversized front", product: "Gildan Tee", placement: { x: .5, y: .5, scale: .92, angle: 0 } },
  { name: "Hoodie back", product: "Unisex Hoodie", placement: { x: .5, y: .45, scale: .55, angle: 0 } },
  { name: "Mug", product: "Ceramic Mug", placement: { x: .5, y: .5, scale: .6, angle: 0 } },
  { name: "Poster, angled", product: "Matte Poster", placement: { x: .5, y: .5, scale: .88, angle: 6 } },
];

export default function EditorFixture() {
  const development = process.env.NODE_ENV !== "production";
  const [photo, setPhoto] = useState("");
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState<Record<string, PlacementTransform>>({});
  const [exports, setExports] = useState<Record<string, { url: string; width: number; height: number }>>({});
  const [open, setOpen] = useState(false);

  useEffect(() => { if (development) setPhoto(fixturePhoto()); }, [development]);

  const scene = CASES[index];
  /* useMemo runs during server rendering too, and these fixtures draw on a
     canvas - so they must not be built until there is a document. Found by
     running the route: it returned 500 on every request. */
  const [artwork, setArtwork] = useState("");
  useEffect(() => { if (development) setArtwork(fixtureArtwork(`A${index + 1}`)); }, [index, development]);
  const mode: RenderingMode = renderingModeFor(scene.product);
  const automatic = useMemo(
    () => defaultTransform(artworkQuadFor({ surface: SURFACE }, scene.placement), mode),
    [scene, mode]);  // pure maths, safe on the server

  if (!development) return <main style={{ padding: 40 }}><h1>Not available.</h1></main>;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: "1.1rem" }}>Editor fixture — development only</h1>
      <p style={{ fontSize: ".85rem", color: "#6b6257", maxWidth: 620 }}>
        The same editor, compositor and export path as Step 2, with fixture data. Nothing here
        publishes, deletes or reaches Printify or Etsy.
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0" }}>
        {CASES.map((item, i) => (
          <button key={item.name} onClick={() => setIndex(i)}
            style={{ padding: "6px 12px", borderRadius: 999, cursor: "pointer",
              border: i === index ? "1px solid #3d3730" : "1px solid #d9d2c6",
              background: i === index ? "#3d3730" : "#fff", color: i === index ? "#fff" : "#4a443c" }}>
            {item.name}
          </button>
        ))}
      </div>
      <p style={{ fontSize: ".8rem" }}>
        <b>{scene.name}</b> — {scene.product}, Printify scale {scene.placement.scale}, at{" "}
        {scene.placement.x}/{scene.placement.y}. Saved: {saved[scene.name] ? "yes" : "no"}
      </p>
      <button id="open-editor" onClick={() => setOpen(true)}
        style={{ padding: "8px 18px", borderRadius: 999, background: "#3d3730", color: "#fff", border: 0, cursor: "pointer" }}>
        Adjust placement
      </button>

      {exports[scene.name] && (
        <figure style={{ marginTop: 16 }}>
          <figcaption style={{ fontSize: ".78rem" }}>
            Exported at {exports[scene.name].width}×{exports[scene.name].height}
          </figcaption>
          <img src={exports[scene.name].url} alt="Exported" style={{ width: 360, display: "block", marginTop: 6 }} />
        </figure>
      )}

      {open && photo && artwork && (
        <Suspense fallback={<p>Loading the editor…</p>}>
          <SceneEditor
            sceneName={scene.name}
            photoUrl={photo}
            artworkUrl={artwork}
            surface={SURFACE}
            mode={mode}
            transform={saved[scene.name] || automatic}
            automatic={automatic}
            hasNext={index + 1 < CASES.length}
            onSave={async (next, blob) => {
              setSaved(current => ({ ...current, [scene.name]: next }));
              const image = new Image();
              image.onload = () => setExports(current => ({
                ...current, [scene.name]: { url: image.src, width: image.naturalWidth, height: image.naturalHeight },
              }));
              image.src = URL.createObjectURL(blob);
              setOpen(false);
            }}
            onSaveNext={async (next) => {
              setSaved(current => ({ ...current, [scene.name]: next }));
              setIndex(i => Math.min(CASES.length - 1, i + 1));
            }}
            onCancel={() => setOpen(false)}
          />
        </Suspense>
      )}
    </main>
  );
}
