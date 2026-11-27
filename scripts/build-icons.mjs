import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const ASSETS_DIR = path.join(ROOT, "assets");
const MODE = (process.argv[2] || "source").toLowerCase();

const FALLBACK_LOGO_URL =
  "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEg_20wCR-WBMpQmw3vxcYUf-vxIO1PYDJoQN_Sid3UDjA9tf0cuX0eH40jbzHoJad4cxbnjhPjqfCw1Z5V1LhgN9zFuIQC0fJjecTy3D9PFu5WjR2H1wHwTD1bUGnXY_NiApWn5gMs6velcQngSzKoP1yHzX0cVsFSUFM8zIefcbiPayY7680Kz0V0ZAAE/s1264/1000093706.png";

const BG_OBS = { r: 5, g: 5, b: 8, alpha: 1 };
const BG_TRANS = { r: 0, g: 0, b: 0, alpha: 0 };

async function resolveMasterLogo() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  // Priority 1: Your redesigned gradient logo at assets/tournyx-icon.png
  const customPath = path.join(ASSETS_DIR, "tournyx-icon.png");
  if (fs.existsSync(customPath)) {
    const meta = await sharp(customPath).metadata();
    if ((meta.width || 0) >= 256) {
      console.log(`🎨 Using custom Tournyx logo: assets/tournyx-icon.png (${meta.width}x${meta.height})`);
      return customPath;
    }
  }

  const rootFavicon = path.join(ROOT, "favicon.png");
  if (fs.existsSync(rootFavicon)) {
    const meta = await sharp(rootFavicon).metadata();
    if ((meta.width || 0) >= 512) {
      fs.copyFileSync(rootFavicon, customPath);
      return customPath;
    }
  }

  console.log("⬇️ Downloading fallback Tournyx emblem (upload assets/tournyx-icon.png for your new logo)...");
  const res = await fetch(FALLBACK_LOGO_URL);
  if (!res.ok) throw new Error(`Failed to fetch logo (HTTP ${res.status}). Upload assets/tournyx-icon.png.`);
  fs.writeFileSync(customPath, Buffer.from(await res.arrayBuffer()));
  return customPath;
}

/**
 * Extracts a true frameless transparent cutout (logo-transparent.png) for splash, loader & adaptive foregrounds.
 * - If source PNG already has >4% transparent pixels, preserves its exact original alpha channel.
 * - If source PNG has a dark/black solid background, runs an O(N) edge flood-fill + 1px soft feather pass
 *   so dark interiors of the TX dragon remain untouched while outer dark borders become 100% transparent.
 */
async function extractTransparentLogo(logoPath, outPath) {
  const { data, info } = await sharp(logoPath)
    .ensureAlpha()
    .resize(512, 512, { fit: "contain", background: BG_TRANS })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const total = w * h;
  const px = new Uint8ClampedArray(data);

  let alreadyTransparent = 0;
  for (let i = 0; i < total; i++) {
    if (px[i * 4 + 3] < 20) alreadyTransparent++;
  }

  let cutoutBuf;
  if (alreadyTransparent / total > 0.04) {
    // Source already has clean alpha transparency
    cutoutBuf = await sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  } else {
    // O(N) typed-array BFS flood-fill from image border edges for near-black background removal
    const visited = new Uint8Array(total);
    const removed = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;

    const isDarkBg = (idx) => {
      const o = idx * 4;
      const r = px[o], g = px[o + 1], b = px[o + 2], a = px[o + 3];
      if (a < 20) return true;
      const maxC = r > g ? (r > b ? r : b) : (g > b ? g : b);
      const minC = r < g ? (r < b ? r : b) : (g < b ? g : b);
      return maxC <= 34 && (maxC - minC) <= 22;
    };

    const seed = (x, y) => {
      const idx = y * w + x;
      if (!visited[idx] && isDarkBg(idx)) {
        visited[idx] = 1;
        queue[tail++] = idx;
      }
    };

    for (let x = 0; x < w; x++) {
      seed(x, 0);
      seed(x, h - 1);
    }
    for (let y = 1; y < h - 1; y++) {
      seed(0, y);
      seed(w - 1, y);
    }

    while (head < tail) {
      const idx = queue[head++];
      removed[idx] = 1;
      px[idx * 4 + 3] = 0;

      const x = idx % w;
      const y = (idx - x) / w;
      if (x > 0) {
        const n = idx - 1;
        if (!visited[n] && isDarkBg(n)) { visited[n] = 1; queue[tail++] = n; }
      }
      if (x < w - 1) {
        const n = idx + 1;
        if (!visited[n] && isDarkBg(n)) { visited[n] = 1; queue[tail++] = n; }
      }
      if (y > 0) {
        const n = idx - w;
        if (!visited[n] && isDarkBg(n)) { visited[n] = 1; queue[tail++] = n; }
      }
      if (y < h - 1) {
        const n = idx + w;
        if (!visited[n] && isDarkBg(n)) { visited[n] = 1; queue[tail++] = n; }
      }
    }

    // 1px soft anti-alias feather on rim pixels touching removed background
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        if (removed[idx]) continue;
        if (removed[idx - 1] || removed[idx + 1] || removed[idx - w] || removed[idx + w]) {
          const o = idx * 4;
          const lum = Math.max(px[o], px[o + 1], px[o + 2]);
          if (lum < 56) {
            px[o + 3] = Math.round((lum / 56) * px[o + 3]);
          }
        }
      }
    }

    cutoutBuf = await sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  }

  // Trim excess empty border and re-center crisply at 512x512 (90% frame fill)
  let trimmedBuf = cutoutBuf;
  try {
    trimmedBuf = await sharp(cutoutBuf).trim({ threshold: 8 }).png().toBuffer();
  } catch (e) {}

  const centeredLogo = await sharp(trimmedBuf)
    .resize(460, 460, { fit: "contain", background: BG_TRANS })
    .png()
    .toBuffer();

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp({ create: { width: 512, height: 512, channels: 4, background: BG_TRANS } })
    .composite([{ input: centeredLogo, gravity: "center" }])
    .png()
    .toFile(outPath);

  console.log(`✅ Extracted frameless transparent logo: ${path.relative(ROOT, outPath)}`);
  return outPath;
}

async function renderSquareIcon(logoPath, size, innerRatio, background, outPath, flattenHex = null) {
  const innerSize = Math.round(size * innerRatio);
  const logoBuf = await sharp(logoPath)
    .resize(innerSize, innerSize, { fit: "contain", background: BG_TRANS })
    .png()
    .toBuffer();

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  let pipeline = sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logoBuf, gravity: "center" }]);
  if (flattenHex) pipeline = pipeline.flatten({ background: flattenHex });
  await pipeline.png().toFile(outPath);
}

function buildPngIcoBuffer(pngBuf, size = 48) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(22, 12);

  return Buffer.concat([header, entry, pngBuf]);
}

async function generateWebsiteRootIcons(transparentLogoPath) {
  // 1. Frameless transparent logo in root (served directly to app-shell.html splash & burst loader)
  fs.copyFileSync(transparentLogoPath, path.join(ROOT, "logo-transparent.png"));

  // 2. Website favicon.png (512x512) & Apple Touch Icon (180x180 opaque)
  await renderSquareIcon(transparentLogoPath, 512, 0.86, BG_OBS, path.join(ROOT, "favicon.png"), "#050508");
  await renderSquareIcon(transparentLogoPath, 180, 0.86, BG_OBS, path.join(ROOT, "apple-touch-icon.png"), "#050508");

  // 3. Standard browser favicon.ico (48x48 PNG-in-ICO)
  const icoPng = await sharp(path.join(ROOT, "favicon.png")).resize(48, 48).png().toBuffer();
  fs.writeFileSync(path.join(ROOT, "favicon.ico"), buildPngIcoBuffer(icoPng, 48));

  // 4. WhatsApp / Discord OpenGraph Banner (1200x630 — 3-Color Violet + Ice Cyan + Obsidian)
  const glowSvg = Buffer.from(`
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g1" cx="50%" cy="46%" r="50%">
          <stop offset="0%" stop-color="#8B5CF6" stop-opacity="0.48"/>
          <stop offset="48%" stop-color="#38BDF8" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#050508" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1200" height="630" fill="#050508"/>
      <rect width="1200" height="630" fill="url(#g1)"/>
    </svg>
  `);

  const emblemBuf = await sharp(transparentLogoPath)
    .resize(410, 410, { fit: "contain", background: BG_TRANS })
    .png()
    .toBuffer();

  await sharp(glowSvg)
    .composite([{ input: emblemBuf, gravity: "center" }])
    .flatten({ background: "#050508" })
    .png()
    .toFile(path.join(ROOT, "og-banner.png"));

  console.log("✅ Root brand files updated: logo-transparent.png, favicon.png, favicon.ico, apple-touch-icon.png & og-banner.png.");
}

async function generateSourceAssets(transparentLogoPath) {
  await renderSquareIcon(transparentLogoPath, 1024, 0.84, BG_OBS, path.join(ASSETS_DIR, "icon-only.png"), "#050508");
  await renderSquareIcon(transparentLogoPath, 1024, 0.66, BG_TRANS, path.join(ASSETS_DIR, "icon-foreground.png"));
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG_OBS } })
    .png()
    .toFile(path.join(ASSETS_DIR, "icon-background.png"));
  await renderSquareIcon(transparentLogoPath, 2732, 0.24, BG_OBS, path.join(ASSETS_DIR, "splash.png"), "#050508");
  console.log("✅ Master 1024px Tournyx assets generated in assets/.");
}

async function writeAndroidIcons(transparentLogoPath) {
  const resDir = path.join(ROOT, "android", "app", "src", "main", "res");
  if (!fs.existsSync(resDir)) throw new Error("android/app/src/main/res not found.");

  const densities = [
    { dir: "mipmap-mdpi", legacy: 48, fg: 108 },
    { dir: "mipmap-hdpi", legacy: 72, fg: 162 },
    { dir: "mipmap-xhdpi", legacy: 96, fg: 216 },
    { dir: "mipmap-xxhdpi", legacy: 144, fg: 324 },
    { dir: "mipmap-xxxhdpi", legacy: 192, fg: 432 }
  ];

  for (const d of densities) {
    const outDir = path.join(resDir, d.dir);
    if (fs.existsSync(outDir)) {
      for (const f of fs.readdirSync(outDir)) {
        if (f.endsWith(".webp")) fs.unlinkSync(path.join(outDir, f));
      }
    }
    await renderSquareIcon(transparentLogoPath, d.legacy, 0.84, BG_OBS, path.join(outDir, "ic_launcher.png"), "#050508");
    await renderSquareIcon(transparentLogoPath, d.legacy, 0.80, BG_OBS, path.join(outDir, "ic_launcher_round.png"), "#050508");
    await renderSquareIcon(transparentLogoPath, d.fg, 0.64, BG_TRANS, path.join(outDir, "ic_launcher_foreground.png"));
  }

  const valuesDir = path.join(resDir, "values");
  fs.mkdirSync(valuesDir, { recursive: true });
  fs.writeFileSync(
    path.join(valuesDir, "ic_launcher_background.xml"),
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#050508</color>\n</resources>\n',
    "utf8"
  );

  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
  const anydpiDir = path.join(resDir, "mipmap-anydpi-v26");
  fs.mkdirSync(anydpiDir, { recursive: true });
  fs.writeFileSync(path.join(anydpiDir, "ic_launcher.xml"), adaptiveXml, "utf8");
  fs.writeFileSync(path.join(anydpiDir, "ic_launcher_round.xml"), adaptiveXml, "utf8");

  const splashTargets = [
    path.join(resDir, "drawable", "splash.png"),
    path.join(resDir, "drawable-port-xxhdpi", "splash.png"),
    path.join(resDir, "drawable-land-xxhdpi", "splash.png")
  ];
  for (const sp of splashTargets) {
    if (fs.existsSync(path.dirname(sp)) || sp.endsWith(path.join("drawable", "splash.png"))) {
      await renderSquareIcon(transparentLogoPath, 1080, 0.30, BG_OBS, sp, "#050508");
    }
  }
  console.log("✅ Official Tournyx Android adaptive icons & splash written cleanly.");
}

async function writeIOSIcons(transparentLogoPath) {
  const iconSetDir = path.join(ROOT, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset");
  if (!fs.existsSync(iconSetDir)) throw new Error("iOS AppIcon.appiconset not found.");

  await renderSquareIcon(transparentLogoPath, 1024, 0.84, BG_OBS, path.join(iconSetDir, "AppIcon-512@2x.png"), "#050508");

  const splashSetDir = path.join(ROOT, "ios", "App", "App", "Assets.xcassets", "Splash.imageset");
  if (fs.existsSync(splashSetDir)) {
    for (const f of fs.readdirSync(splashSetDir)) {
      if (f.endsWith(".png")) {
        await renderSquareIcon(transparentLogoPath, 1242, 0.28, BG_OBS, path.join(splashSetDir, f), "#050508");
      }
    }
  }
  console.log("✅ Official Tournyx iOS opaque 1024px AppIcon & splash written cleanly.");
}

async function main() {
  const masterLogoPath = await resolveMasterLogo();
  const transparentLogoPath = await extractTransparentLogo(
    masterLogoPath,
    path.join(ASSETS_DIR, "logo-transparent.png")
  );
  await generateSourceAssets(transparentLogoPath);
  if (MODE === "web" || MODE === "all" || MODE === "source") {
    await generateWebsiteRootIcons(transparentLogoPath);
  }
  if (MODE === "android" || MODE === "all") await writeAndroidIcons(transparentLogoPath);
  if (MODE === "ios" || MODE === "all") await writeIOSIcons(transparentLogoPath);
}

main().catch((err) => {
  console.error("❌ Icon build failed:", err.message);
  process.exit(1);
});
