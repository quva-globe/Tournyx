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

  // Priority 1: User's transparent cutout in repository root (NEVER overwritten if transparent)
  const rootTransparent = path.join(ROOT, "logo-transparent.png");
  if (fs.existsSync(rootTransparent)) {
    const meta = await sharp(rootTransparent).metadata();
    if ((meta.width || 0) >= 128) {
      console.log(`🎨 Using root transparent logo: logo-transparent.png (${meta.width}x${meta.height})`);
      return { filePath: rootTransparent, isRootTransparent: true };
    }
  }

  // Priority 2: Custom uploaded logo in assets/
  const customAsset = path.join(ASSETS_DIR, "tournyx-icon.png");
  if (fs.existsSync(customAsset)) {
    const meta = await sharp(customAsset).metadata();
    if ((meta.width || 0) >= 256) {
      console.log(`🎨 Using assets/tournyx-icon.png (${meta.width}x${meta.height})`);
      return { filePath: customAsset, isRootTransparent: false };
    }
  }

  // Priority 3: Root favicon.png if high-res
  const rootFavicon = path.join(ROOT, "favicon.png");
  if (fs.existsSync(rootFavicon)) {
    const meta = await sharp(rootFavicon).metadata();
    if ((meta.width || 0) >= 512) {
      return { filePath: rootFavicon, isRootTransparent: false };
    }
  }

  console.log("⬇️ Downloading fallback Tournyx emblem...");
  const res = await fetch(FALLBACK_LOGO_URL);
  if (!res.ok) throw new Error(`Failed to fetch logo (HTTP ${res.status}). Upload logo-transparent.png to root.`);
  fs.writeFileSync(customAsset, Buffer.from(await res.arrayBuffer()));
  return { filePath: customAsset, isRootTransparent: false };
}

/**
 * Produces a clean 512x512 transparent working master at assets/logo-transparent-clean.png.
 * - If source already has >3% transparent pixels (like root logo-transparent.png), keeps its EXACT alpha untouched.
 * - Otherwise runs O(N) corner-sampled BFS flood-fill to strip solid black OR solid purple/colored outer boxes.
 */
async function prepareTransparentMaster(sourcePath, outPath) {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .resize(512, 512, { fit: "contain", background: BG_TRANS })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const total = w * h;
  const px = new Uint8ClampedArray(data);

  let transparentCount = 0;
  for (let i = 0; i < total; i++) {
    if (px[i * 4 + 3] < 24) transparentCount++;
  }

  let cutoutBuf;
  if (transparentCount / total > 0.03) {
    // Source already has genuine transparency — preserve pixel-perfect original alpha
    cutoutBuf = await sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  } else {
    // Sample corner pixel as reference box background color
    const bgR = px[0], bgG = px[1], bgB = px[2];
    const visited = new Uint8Array(total);
    const removed = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;

    const isBoxBg = (idx) => {
      const o = idx * 4;
      if (px[o + 3] < 24) return true;
      const dr = Math.abs(px[o] - bgR);
      const dg = Math.abs(px[o + 1] - bgG);
      const db = Math.abs(px[o + 2] - bgB);
      return (dr + dg + db) <= 78;
    };

    const seed = (x, y) => {
      const idx = y * w + x;
      if (!visited[idx] && isBoxBg(idx)) {
        visited[idx] = 1;
        queue[tail++] = idx;
      }
    };

    for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
    for (let y = 1; y < h - 1; y++) { seed(0, y); seed(w - 1, y); }

    while (head < tail) {
      const idx = queue[head++];
      removed[idx] = 1;
      px[idx * 4 + 3] = 0;

      const x = idx % w;
      const y = (idx - x) / w;
      if (x > 0 && !visited[idx - 1] && isBoxBg(idx - 1)) { visited[idx - 1] = 1; queue[tail++] = idx - 1; }
      if (x < w - 1 && !visited[idx + 1] && isBoxBg(idx + 1)) { visited[idx + 1] = 1; queue[tail++] = idx + 1; }
      if (y > 0 && !visited[idx - w] && isBoxBg(idx - w)) { visited[idx - w] = 1; queue[tail++] = idx - w; }
      if (y < h - 1 && !visited[idx + w] && isBoxBg(idx + w)) { visited[idx + w] = 1; queue[tail++] = idx + w; }
    }

    // 1px soft feather along cutout perimeter
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        if (removed[idx]) continue;
        if (removed[idx - 1] || removed[idx + 1] || removed[idx - w] || removed[idx + w]) {
          const o = idx * 4;
          const dist = Math.abs(px[o] - bgR) + Math.abs(px[o + 1] - bgG) + Math.abs(px[o + 2] - bgB);
          if (dist < 110) px[o + 3] = Math.round((dist / 110) * px[o + 3]);
        }
      }
    }

    cutoutBuf = await sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  }

  let trimmedBuf = cutoutBuf;
  try {
    trimmedBuf = await sharp(cutoutBuf).trim({ threshold: 8 }).png().toBuffer();
  } catch (e) {}

  const centeredLogo = await sharp(trimmedBuf)
    .resize(468, 468, { fit: "contain", background: BG_TRANS })
    .png()
    .toBuffer();

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp({ create: { width: 512, height: 512, channels: 4, background: BG_TRANS } })
    .composite([{ input: centeredLogo, gravity: "center" }])
    .png()
    .toFile(outPath);

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

async function generateWebsiteRootIcons(cleanTransparentPath, hadRootTransparent) {
  // Only write root logo-transparent.png if user didn't already supply one directly in root
  const rootTransparentOut = path.join(ROOT, "logo-transparent.png");
  if (!hadRootTransparent) {
    fs.copyFileSync(cleanTransparentPath, rootTransparentOut);
  }

  await renderSquareIcon(cleanTransparentPath, 512, 0.86, BG_OBS, path.join(ROOT, "favicon.png"), "#050508");
  await renderSquareIcon(cleanTransparentPath, 180, 0.86, BG_OBS, path.join(ROOT, "apple-touch-icon.png"), "#050508");

  const icoPng = await sharp(path.join(ROOT, "favicon.png")).resize(48, 48).png().toBuffer();
  fs.writeFileSync(path.join(ROOT, "favicon.ico"), buildPngIcoBuffer(icoPng, 48));

  // Crisp 1200x630 3-Color OpenGraph Card (WhatsApp / Discord / X)
  const glowSvg = Buffer.from(`
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g1" cx="50%" cy="46%" r="52%">
          <stop offset="0%" stop-color="#8B5CF6" stop-opacity="0.50"/>
          <stop offset="48%" stop-color="#38BDF8" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#050508" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1200" height="630" fill="#050508"/>
      <rect width="1200" height="630" fill="url(#g1)"/>
    </svg>
  `);

  const emblemBuf = await sharp(cleanTransparentPath)
    .resize(420, 420, { fit: "contain", background: BG_TRANS })
    .png()
    .toBuffer();

  await sharp(glowSvg)
    .composite([{ input: emblemBuf, gravity: "center" }])
    .flatten({ background: "#050508" })
    .png()
    .toFile(path.join(ROOT, "og-banner.png"));

  console.log("✅ Website icons updated cleanly from logo-transparent.png (favicon.png, favicon.ico, apple-touch-icon.png, og-banner.png).");
}

async function generateSourceAssets(cleanTransparentPath) {
  await renderSquareIcon(cleanTransparentPath, 1024, 0.84, BG_OBS, path.join(ASSETS_DIR, "icon-only.png"), "#050508");
  await renderSquareIcon(cleanTransparentPath, 1024, 0.66, BG_TRANS, path.join(ASSETS_DIR, "icon-foreground.png"));
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG_OBS } })
    .png()
    .toFile(path.join(ASSETS_DIR, "icon-background.png"));
  await renderSquareIcon(cleanTransparentPath, 2732, 0.24, BG_OBS, path.join(ASSETS_DIR, "splash.png"), "#050508");
  console.log("✅ Master 1024px icons & splash built in assets/.");
}

async function writeAndroidIcons(cleanTransparentPath) {
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
    await renderSquareIcon(cleanTransparentPath, d.legacy, 0.84, BG_OBS, path.join(outDir, "ic_launcher.png"), "#050508");
    await renderSquareIcon(cleanTransparentPath, d.legacy, 0.80, BG_OBS, path.join(outDir, "ic_launcher_round.png"), "#050508");
    await renderSquareIcon(cleanTransparentPath, d.fg, 0.66, BG_TRANS, path.join(outDir, "ic_launcher_foreground.png"));
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
      await renderSquareIcon(cleanTransparentPath, 1080, 0.30, BG_OBS, sp, "#050508");
    }
  }
  console.log("✅ Android adaptive icons & splash built from logo-transparent.png.");
}

async function writeIOSIcons(cleanTransparentPath) {
  const iconSetDir = path.join(ROOT, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset");
  if (!fs.existsSync(iconSetDir)) throw new Error("iOS AppIcon.appiconset not found.");

  await renderSquareIcon(cleanTransparentPath, 1024, 0.84, BG_OBS, path.join(iconSetDir, "AppIcon-512@2x.png"), "#050508");

  const splashSetDir = path.join(ROOT, "ios", "App", "App", "Assets.xcassets", "Splash.imageset");
  if (fs.existsSync(splashSetDir)) {
    for (const f of fs.readdirSync(splashSetDir)) {
      if (f.endsWith(".png")) {
        await renderSquareIcon(cleanTransparentPath, 1242, 0.28, BG_OBS, path.join(splashSetDir, f), "#050508");
      }
    }
  }
  console.log("✅ iOS opaque 1024px AppIcon & splash built from logo-transparent.png.");
}

async function main() {
  const { filePath, isRootTransparent } = await resolveMasterLogo();
  const cleanTransparentPath = await prepareTransparentMaster(
    filePath,
    path.join(ASSETS_DIR, "logo-transparent-clean.png")
  );
  await generateSourceAssets(cleanTransparentPath);
  if (MODE === "web" || MODE === "all" || MODE === "source") {
    await generateWebsiteRootIcons(cleanTransparentPath, isRootTransparent);
  }
  if (MODE === "android" || MODE === "all") await writeAndroidIcons(cleanTransparentPath);
  if (MODE === "ios" || MODE === "all") await writeIOSIcons(cleanTransparentPath);
}

main().catch((err) => {
  console.error("❌ Icon build failed:", err.message);
  process.exit(1);
});
