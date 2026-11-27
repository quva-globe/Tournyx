import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const ASSETS_DIR = path.join(ROOT, "assets");
const MODE = (process.argv[2] || "source").toLowerCase();

const OFFICIAL_LOGO_URL =
  "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEg_20wCR-WBMpQmw3vxcYUf-vxIO1PYDJoQN_Sid3UDjA9tf0cuX0eH40jbzHoJad4cxbnjhPjqfCw1Z5V1LhgN9zFuIQC0fJjecTy3D9PFu5WjR2H1wHwTD1bUGnXY_NiApWn5gMs6velcQngSzKoP1yHzX0cVsFSUFM8zIefcbiPayY7680Kz0V0ZAAE/s1264/1000093706.png";

const BG_OBS = { r: 5, g: 5, b: 8, alpha: 1 };
const BG_TRANS = { r: 0, g: 0, b: 0, alpha: 0 };

async function resolveMasterLogo() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  const customPath = path.join(ASSETS_DIR, "tournyx-icon.png");
  if (fs.existsSync(customPath)) {
    const meta = await sharp(customPath).metadata();
    if ((meta.width || 0) >= 512) return customPath;
  }

  const rootFavicon = path.join(ROOT, "favicon.png");
  if (fs.existsSync(rootFavicon)) {
    const meta = await sharp(rootFavicon).metadata();
    if ((meta.width || 0) >= 512) {
      fs.copyFileSync(rootFavicon, customPath);
      return customPath;
    }
  }

  console.log("⬇️ Downloading official 1264px Tournyx emblem...");
  const res = await fetch(OFFICIAL_LOGO_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch official Tournyx logo (HTTP ${res.status}). Place a 1024x1024 PNG at assets/tournyx-icon.png.`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(customPath, buf);
  return customPath;
}

async function renderSquareIcon(logoPath, size, innerRatio, background, outPath) {
  const innerSize = Math.round(size * innerRatio);
  const logoBuf = await sharp(logoPath)
    .resize(innerSize, innerSize, { fit: "contain", background: BG_TRANS })
    .png()
    .toBuffer();

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp({
    create: { width: size, height: size, channels: 4, background }
  })
    .composite([{ input: logoBuf, gravity: "center" }])
    .png()
    .toFile(outPath);
}

async function generateSourceAssets(logoPath) {
  // 1. Opaque 1024x1024 icon (Desktop .ico/.icns & iOS AppIcon)
  await renderSquareIcon(logoPath, 1024, 0.80, BG_OBS, path.join(ASSETS_DIR, "icon-only.png"));
  // 2. Transparent 1024x1024 adaptive foreground (64% safe-zone so circular/squircle masks never clip)
  await renderSquareIcon(logoPath, 1024, 0.64, BG_TRANS, path.join(ASSETS_DIR, "icon-foreground.png"));
  // 3. Solid #050508 background
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG_OBS } })
    .png()
    .toFile(path.join(ASSETS_DIR, "icon-background.png"));
  // 4. Centered 2732x2732 Obsidian splash master
  await renderSquareIcon(logoPath, 2732, 0.22, BG_OBS, path.join(ASSETS_DIR, "splash.png"));
  console.log("✅ Master Tournyx 1024px icons & splash generated in assets/.");
}

async function writeAndroidIcons(logoPath) {
  const resDir = path.join(ROOT, "android", "app", "src", "main", "res");
  if (!fs.existsSync(resDir)) {
    throw new Error("android/app/src/main/res not found. Run 'npx cap add android' first.");
  }

  const densities = [
    { dir: "mipmap-mdpi", legacy: 48, fg: 108 },
    { dir: "mipmap-hdpi", legacy: 72, fg: 162 },
    { dir: "mipmap-xhdpi", legacy: 96, fg: 216 },
    { dir: "mipmap-xxhdpi", legacy: 144, fg: 324 },
    { dir: "mipmap-xxxhdpi", legacy: 192, fg: 432 }
  ];

  for (const d of densities) {
    const outDir = path.join(resDir, d.dir);
    // Remove stale Capacitor webp icons so Android never picks them over our PNGs
    if (fs.existsSync(outDir)) {
      for (const f of fs.readdirSync(outDir)) {
        if (f.endsWith(".webp")) fs.unlinkSync(path.join(outDir, f));
      }
    }
    await renderSquareIcon(logoPath, d.legacy, 0.82, BG_OBS, path.join(outDir, "ic_launcher.png"));
    await renderSquareIcon(logoPath, d.legacy, 0.78, BG_OBS, path.join(outDir, "ic_launcher_round.png"));
    await renderSquareIcon(logoPath, d.fg, 0.60, BG_TRANS, path.join(outDir, "ic_launcher_foreground.png"));
  }

  // Deterministic adaptive icon XMLs + #050508 background color
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

  // Crisp #050508 splash drawable (replaces default Capacitor splash)
  const splashTargets = [
    path.join(resDir, "drawable", "splash.png"),
    path.join(resDir, "drawable-port-xxhdpi", "splash.png"),
    path.join(resDir, "drawable-land-xxhdpi", "splash.png")
  ];
  for (const sp of splashTargets) {
    if (fs.existsSync(path.dirname(sp)) || sp.endsWith(path.join("drawable", "splash.png"))) {
      await renderSquareIcon(logoPath, 1080, 0.30, BG_OBS, sp);
    }
  }

  console.log("✅ Official Tournyx Android adaptive icons & splash written cleanly.");
}

async function writeIOSIcons(logoPath) {
  const iconSetDir = path.join(ROOT, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset");
  if (!fs.existsSync(iconSetDir)) {
    throw new Error("iOS AppIcon.appiconset not found. Run 'npx cap add ios' first.");
  }

  // Apple requires strictly opaque 1024x1024 PNG (alpha channel stripped)
  const iconBuf = await sharp(logoPath)
    .resize(820, 820, { fit: "contain", background: BG_TRANS })
    .png()
    .toBuffer();

  const outIcon = path.join(iconSetDir, "AppIcon-512@2x.png");
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG_OBS } })
    .composite([{ input: iconBuf, gravity: "center" }])
    .flatten({ background: "#050508" })
    .png()
    .toFile(outIcon);

  const splashSetDir = path.join(ROOT, "ios", "App", "App", "Assets.xcassets", "Splash.imageset");
  if (fs.existsSync(splashSetDir)) {
    for (const f of fs.readdirSync(splashSetDir)) {
      if (f.endsWith(".png")) {
        await renderSquareIcon(logoPath, 1242, 0.28, BG_OBS, path.join(splashSetDir, f));
      }
    }
  }

  console.log("✅ Official Tournyx iOS opaque 1024px AppIcon & splash written cleanly.");
}

async function main() {
  const logoPath = await resolveMasterLogo();
  await generateSourceAssets(logoPath);
  if (MODE === "android" || MODE === "all") await writeAndroidIcons(logoPath);
  if (MODE === "ios" || MODE === "all") await writeIOSIcons(logoPath);
}

main().catch((err) => {
  console.error("❌ Icon build failed:", err.message);
  process.exit(1);
});
