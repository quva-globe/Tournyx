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

  // Priority 1: Your new redesigned gradient logo at assets/tournyx-icon.png
  const customPath = path.join(ASSETS_DIR, "tournyx-icon.png");
  if (fs.existsSync(customPath)) {
    const meta = await sharp(customPath).metadata();
    if ((meta.width || 0) >= 256) {
      console.log(`🎨 Using custom Tournyx logo: assets/tournyx-icon.png (${meta.width}x${meta.height})`);
      return customPath;
    }
  }

  // Priority 2: Root favicon.png if high-res
  const rootFavicon = path.join(ROOT, "favicon.png");
  if (fs.existsSync(rootFavicon)) {
    const meta = await sharp(rootFavicon).metadata();
    if ((meta.width || 0) >= 512) {
      fs.copyFileSync(rootFavicon, customPath);
      return customPath;
    }
  }

  console.log("⬇️ Downloading fallback Tournyx emblem (upload assets/tournyx-icon.png to use your new gradient logo)...");
  const res = await fetch(FALLBACK_LOGO_URL);
  if (!res.ok) throw new Error(`Failed to fetch logo (HTTP ${res.status}). Upload assets/tournyx-icon.png.`);
  fs.writeFileSync(customPath, Buffer.from(await res.arrayBuffer()));
  return customPath;
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

// Wraps a 48x48 PNG inside a standard valid .ico container (supported on all browsers & Windows)
function buildPngIcoBuffer(pngBuf, size = 48) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: 1 = ICO
  header.writeUInt16LE(1, 4); // Count: 1 image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2); // Color palette
  entry.writeUInt8(0, 3); // Reserved
  entry.writeUInt16LE(1, 4); // Color planes
  entry.writeUInt16LE(32, 6); // Bits per pixel
  entry.writeUInt32LE(pngBuf.length, 8); // Image size
  entry.writeUInt32LE(22, 12); // Offset (6 + 16)

  return Buffer.concat([header, entry, pngBuf]);
}

async function generateWebsiteRootIcons(logoPath) {
  // 1. Website favicon.png (512x512)
  await renderSquareIcon(logoPath, 512, 0.84, BG_OBS, path.join(ROOT, "favicon.png"), "#050508");
  // 2. iOS Safari apple-touch-icon.png (180x180 opaque)
  await renderSquareIcon(logoPath, 180, 0.84, BG_OBS, path.join(ROOT, "apple-touch-icon.png"), "#050508");
  // 3. Standard browser favicon.ico (48x48 PNG-in-ICO)
  const icoPng = await sharp(path.join(ROOT, "favicon.png")).resize(48, 48).png().toBuffer();
  fs.writeFileSync(path.join(ROOT, "favicon.ico"), buildPngIcoBuffer(icoPng, 48));

  // 4. WhatsApp / Discord OpenGraph Banner (1200x630 — Replaces Old Free Fire Preview!)
  const glowSvg = Buffer.from(`
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g1" cx="50%" cy="46%" r="48%">
          <stop offset="0%" stop-color="#8B5CF6" stop-opacity="0.46"/>
          <stop offset="52%" stop-color="#00F2FF" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#050508" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1200" height="630" fill="#050508"/>
      <rect width="1200" height="630" fill="url(#g1)"/>
    </svg>
  `);

  const emblemBuf = await sharp(logoPath)
    .resize(390, 390, { fit: "contain", background: BG_TRANS })
    .png()
    .toBuffer();

  await sharp(glowSvg)
    .composite([{ input: emblemBuf, gravity: "center" }])
    .flatten({ background: "#050508" })
    .png()
    .toFile(path.join(ROOT, "og-banner.png"));

  console.log("✅ Website root icons updated: favicon.png, favicon.ico, apple-touch-icon.png & og-banner.png.");
}

async function generateSourceAssets(logoPath) {
  await renderSquareIcon(logoPath, 1024, 0.82, BG_OBS, path.join(ASSETS_DIR, "icon-only.png"), "#050508");
  await renderSquareIcon(logoPath, 1024, 0.64, BG_TRANS, path.join(ASSETS_DIR, "icon-foreground.png"));
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG_OBS } })
    .png()
    .toFile(path.join(ASSETS_DIR, "icon-background.png"));
  await renderSquareIcon(logoPath, 2732, 0.22, BG_OBS, path.join(ASSETS_DIR, "splash.png"), "#050508");
  console.log("✅ Master 1024px Tournyx assets generated in assets/.");
}

async function writeAndroidIcons(logoPath) {
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
    await renderSquareIcon(logoPath, d.legacy, 0.82, BG_OBS, path.join(outDir, "ic_launcher.png"), "#050508");
    await renderSquareIcon(logoPath, d.legacy, 0.78, BG_OBS, path.join(outDir, "ic_launcher_round.png"), "#050508");
    await renderSquareIcon(logoPath, d.fg, 0.62, BG_TRANS, path.join(outDir, "ic_launcher_foreground.png"));
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
      await renderSquareIcon(logoPath, 1080, 0.30, BG_OBS, sp, "#050508");
    }
  }
  console.log("✅ Official Tournyx Android adaptive icons & splash written cleanly.");
}

async function writeIOSIcons(logoPath) {
  const iconSetDir = path.join(ROOT, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset");
  if (!fs.existsSync(iconSetDir)) throw new Error("iOS AppIcon.appiconset not found.");

  await renderSquareIcon(logoPath, 1024, 0.82, BG_OBS, path.join(iconSetDir, "AppIcon-512@2x.png"), "#050508");

  const splashSetDir = path.join(ROOT, "ios", "App", "App", "Assets.xcassets", "Splash.imageset");
  if (fs.existsSync(splashSetDir)) {
    for (const f of fs.readdirSync(splashSetDir)) {
      if (f.endsWith(".png")) {
        await renderSquareIcon(logoPath, 1242, 0.28, BG_OBS, path.join(splashSetDir, f), "#050508");
      }
    }
  }
  console.log("✅ Official Tournyx iOS opaque 1024px AppIcon & splash written cleanly.");
}

async function main() {
  const logoPath = await resolveMasterLogo();
  await generateSourceAssets(logoPath);
  if (MODE === "web" || MODE === "all" || MODE === "source") await generateWebsiteRootIcons(logoPath);
  if (MODE === "android" || MODE === "all") await writeAndroidIcons(logoPath);
  if (MODE === "ios" || MODE === "all") await writeIOSIcons(logoPath);
}

main().catch((err) => {
  console.error("❌ Icon build failed:", err.message);
  process.exit(1);
});
