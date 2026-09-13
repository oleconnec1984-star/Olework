import {
  avatarOptions,
  normalizeAvatar,
  type AvatarConfig,
  type AvatarV2,
} from "./avatar";
type AtlasName = "anatomy" | "hair" | "wardrobe" | "simple" | "features";
type Sprite = { canvas: HTMLCanvasElement; width: number; height: number };
const atlasSpec = {
  anatomy: { columns: 4, bands: [0, 350, 650, 960, 1254] },
  hair: { columns: 4, bands: [0, 400, 825, 1254] },
  wardrobe: { columns: 6, bands: [0, 230, 450, 625, 840, 1024] },
  simple: { columns: 4, bands: [0, 300, 580, 905, 1254] },
  features: { columns: 4, bands: [0, 314, 627, 941, 1254] },
};
const atlases = new Map<AtlasName, Promise<HTMLImageElement>>();
const sprites = new Map<string, Sprite>();
const renders = new Map<string, HTMLCanvasElement>();
function image(name: AtlasName) {
  let p = atlases.get(name);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      const fail = () => {
        clearTimeout(timer);
        atlases.delete(name);
        reject(new Error("โหลดชิ้นส่วน Avatar ไม่สำเร็จ"));
      };
      const timer = setTimeout(fail, 15000);
      img.onload = () => {
        clearTimeout(timer);
        resolve(img);
      };
      img.onerror = fail;
      img.src = "/avatar-v2/" + name + ".png";
    });
    atlases.set(name, p);
  }
  return p;
}
function surface(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
// Runtime crops generated raster components. No emoji, procedural shapes, or
// vector stand-ins are used to draw a person. All anatomy comes from the atlases.
async function sprite(
  name: AtlasName,
  index: number,
  color?: string,
): Promise<Sprite> {
  const key = name + ":" + index + ":" + (color || "original");
  const cached = sprites.get(key);
  if (cached) return cached;
  const img = await image(name),
    spec = atlasSpec[name],
    row = Math.floor(index / spec.columns),
    w = Math.floor(img.width / spec.columns),
    y = spec.bands[row],
    h = spec.bands[row + 1] - y;
  const tile = surface(w, h),
    ctx = tile.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, (index % spec.columns) * w, y, w, h, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h);
  let x0 = w,
    y0 = h,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (pixels.data[i + 3] > 128) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  if (x0 > x1 || y0 > y1) throw new Error("ชิ้นส่วน Avatar ไม่สมบูรณ์");
  const rgb = color
    ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
    : null;
  for (let i = 0; i < pixels.data.length; i += 4) {
    if (pixels.data[i + 3] < 160) {
      pixels.data[i + 3] = 0;
      continue;
    }
    pixels.data[i + 3] = 255;
    const l = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3;
    if (name === "wardrobe" && (index === 17 || index === 18) && l > 85) {
      pixels.data[i + 3] = 0;
      continue;
    }
    if (rgb) {
      if (l < 62) {
        pixels.data[i] = 45;
        pixels.data[i + 1] = 38;
        pixels.data[i + 2] = 34;
      } else {
        for (let j = 0; j < 3; j++) pixels.data[i + j] = rgb[j];
      }
    } else {
      const value = l < 95 ? 40 : l < 190 ? 130 : 245;
      pixels.data[i] = value;
      pixels.data[i + 1] = value;
      pixels.data[i + 2] = value;
    }
  }
  // Remove isolated atlas-edge flecks without inventing/drawing replacement art.
  if (name === "hair" || name === "simple" || name === "features") {
    const seen = new Uint8Array(w * h),
      groups: number[][] = [];
    for (let p = 0; p < w * h; p++) {
      if (seen[p] || !pixels.data[p * 4 + 3]) continue;
      const group = [p];
      seen[p] = 1;
      for (let q = 0; q < group.length; q++) {
        const n = group[q],
          x = n % w,
          y = Math.floor(n / w);
        for (const next of [
          x > 0 ? n - 1 : -1,
          x < w - 1 ? n + 1 : -1,
          y > 0 ? n - w : -1,
          y < h - 1 ? n + w : -1,
        ])
          if (next >= 0 && !seen[next] && pixels.data[next * 4 + 3]) {
            seen[next] = 1;
            group.push(next);
          }
      }
      groups.push(group);
    }
    const largest = Math.max(...groups.map((g) => g.length));
    for (const group of groups)
      if (group.length < largest * 0.015)
        for (const p of group) pixels.data[p * 4 + 3] = 0;
  }
  ctx.putImageData(pixels, 0, 0);
  const cropped = surface(x1 - x0 + 1, y1 - y0 + 1);
  cropped
    .getContext("2d")!
    .drawImage(
      tile,
      x0,
      y0,
      cropped.width,
      cropped.height,
      0,
      0,
      cropped.width,
      cropped.height,
    );
  const result = {
    canvas: cropped,
    width: cropped.width,
    height: cropped.height,
  };
  sprites.set(key, result);
  return result;
}
const indexOf = (key: keyof typeof avatarOptions, id: string) =>
  Math.max(
    0,
    avatarOptions[key].findIndex((o) => o.id === id),
  );
export async function renderAvatar(
  input: AvatarConfig,
  mode: "full" | "portrait" = "full",
): Promise<HTMLCanvasElement> {
  const c = normalizeAvatar(input),
    key = JSON.stringify(c) + mode;
  const cached = renders.get(key);
  if (cached) return cached;
  // Every surface uses the same compact, full-body 48 px character. The
  // portrait mode is retained for stored callers, but no longer removes the
  // body: small cards scale this exact sprite down with nearest-neighbour CSS.
  const out = surface(48, 48),
    ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const draw = async (
    name: AtlasName,
    index: number,
    x: number,
    y: number,
    w: number,
    h: number,
    color?: string,
  ) => {
    const s = await sprite(name, index, color);
    ctx.drawImage(s.canvas, x, y, w, h);
  };
  const drawHalf = async (
    index: number,
    side: "left" | "right",
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    const s = await sprite("wardrobe", index),
      half = Math.floor(s.width / 2),
      sourceX = side === "left" ? 0 : half;
    ctx.drawImage(
      s.canvas,
      sourceX,
      0,
      side === "left" ? half : s.width - half,
      s.height,
      x,
      y,
      w,
      h,
    );
  };
  const hairIndex = 4 + indexOf("hair", c.hair),
    long = [
      "bob",
      "long",
      "curly",
      "ponytail",
      "bun",
      "twintails",
      "wavy",
    ].includes(c.hair),
    hairHeight = long ? 34 : 24;

  // Back hair -> anatomy -> clothes -> face -> front hair -> accessories.
  // Every coloured layer is normalized to one flat fill plus one dark outline.
  if (long) await draw("simple", hairIndex, 6, 0, 36, hairHeight, c.hairColor);
  await draw("anatomy", 4, 12, 22, 24, 26, c.skin);
  await draw("wardrobe", indexOf("top", c.top), 11, 25, 26, 15, c.topColor);
  await draw(
    "wardrobe",
    8 + indexOf("bottom", c.bottom),
    13,
    35,
    22,
    9,
    c.bottomColor,
  );
  await draw(
    "wardrobe",
    13 + indexOf("shoes", c.shoes),
    12,
    42,
    24,
    6,
    c.shoeColor,
  );
  await draw("simple", indexOf("face", c.face), 10, 4, 28, 27, c.skin);
  await draw("anatomy", 5, 15, 13, 18, 6, c.eyeColor);
  await draw("features", indexOf("brow", c.brow), 15, 10, 18, 5, c.browColor);
  await draw(
    "features",
    4 + indexOf("mouth", c.mouth),
    19,
    21,
    10,
    4,
    "#FFFFFF",
  );
  if (c.facialHair !== "none") {
    const moustache = ["thin", "classic", "handlebar", "thick"].includes(
      c.facialHair,
    );
    await draw(
      "features",
      7 + indexOf("facialHair", c.facialHair),
      moustache ? 18 : 17,
      moustache ? 19 : 18,
      moustache ? 12 : 14,
      moustache ? 4 : 9,
      c.facialHairColor,
    );
  }
  const hair = await sprite("simple", hairIndex, c.hairColor);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 48, 13);
  if (long) {
    ctx.rect(0, 13, 13, 22);
    ctx.rect(35, 13, 13, 22);
  }
  ctx.clip();
  ctx.drawImage(hair.canvas, 6, 0, 36, hairHeight);
  ctx.restore();
  if (c.earrings === "stud") {
    await drawHalf(24, "left", 8, 19, 3, 3);
    await drawHalf(24, "right", 37, 19, 3, 3);
  }
  if (c.earrings === "hoop") {
    await drawHalf(25, "left", 8, 19, 3, 5);
    await drawHalf(25, "right", 37, 19, 3, 5);
  }
  if (c.glasses !== "none")
    await draw("wardrobe", 16 + indexOf("glasses", c.glasses), 13, 13, 22, 7);
  if (renders.size > 180) renders.clear();
  renders.set(key, out);
  return out;
}
export function describeAvatar(c: AvatarV2) {
  const label = (k: keyof typeof avatarOptions) =>
    avatarOptions[k].find((o) => o.id === c[k])?.name || c[k];
  return [label("face"), label("skin"), label("hair")].join(" · ");
}
