/* D573 - rendering a scene against a known placement, so it can be proved before
   a real listing depends on it. The sample is small and left of centre on
   purpose: those are exactly the placements the old fixed 42% centred fallback
   destroyed, so if a scene is still guessing, this shows it immediately. */
import { placementAdjustment } from "./placement-contract";

const SAMPLE = { x: .3, y: .38, scale: .16, angle: 0 } as const;

function swatch(): Promise<HTMLImageElement> {
  const canvas = document.createElement("canvas");
  canvas.width = 600; canvas.height = 600;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#d6483f"; context.fillRect(0, 0, 600, 600);
  context.fillStyle = "#ffffff";
  context.font = "bold 92px sans-serif";
  context.textAlign = "center"; context.textBaseline = "middle";
  context.fillText("TEST", 300, 300);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The test artwork could not be drawn."));
    image.src = canvas.toDataURL("image/png");
  });
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That scene photograph could not be loaded."));
    image.src = src;
  });
}

type Scene = {
  src: string; name: string; normalized?: boolean;
  corners: [[number, number], [number, number], [number, number], [number, number]];
  quadMeans?: "garment" | "print-area"; occlusionUrl?: string;
};

export async function renderSceneTest(scene: Scene): Promise<string> {
  const adjustment = placementAdjustment(SAMPLE, "t-shirt", scene.quadMeans || "garment");
  if (!adjustment) throw new Error(`"${scene.name}" has not had its print area confirmed yet, so Goldie cannot place a design on it exactly. Use "Mark where the design can print" first.`);
  const [photo, art] = await Promise.all([load(scene.src), swatch()]);
  const canvas = document.createElement("canvas");
  canvas.width = photo.naturalWidth; canvas.height = photo.naturalHeight;
  const context = canvas.getContext("2d")!;
  context.drawImage(photo, 0, 0);

  const quad = scene.corners.map(([x, y]) => scene.normalized === false ? [x, y] : [x * canvas.width, y * canvas.height]) as Array<[number, number]>;
  const at = (u: number, v: number): [number, number] => {
    const top: [number, number] = [quad[0][0] + (quad[1][0] - quad[0][0]) * u, quad[0][1] + (quad[1][1] - quad[0][1]) * u];
    const bottom: [number, number] = [quad[3][0] + (quad[2][0] - quad[3][0]) * u, quad[3][1] + (quad[2][1] - quad[3][1]) * u];
    return [top[0] + (bottom[0] - top[0]) * v, top[1] + (bottom[1] - top[1]) * v];
  };
  // The sample occupies `scale` of the print area, centred on Printify's x/y.
  const half = adjustment.scale / 2;
  const cu = .5 + adjustment.x, cv = .5 + adjustment.y;
  const [ax, ay] = at(cu - half, cv - half);
  const [bx, by] = at(cu + half, cv - half);
  const [dx, dy] = at(cu - half, cv + half);
  context.save();
  context.setTransform((bx - ax) / art.width, (by - ay) / art.width, (dx - ax) / art.height, (dy - ay) / art.height, ax, ay);
  context.drawImage(art, 0, 0);
  context.restore();

  if (scene.occlusionUrl) {
    const mask = await load(scene.occlusionUrl).catch(() => null);
    if (mask) context.drawImage(mask, 0, 0, canvas.width, canvas.height);
  }
  return canvas.toDataURL("image/jpeg", .9);
}
