import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "www");

const EXCLUDE_DIRS = new Set([
  ".git",
  ".github",
  "node_modules",
  "www",
  "android",
  "ios",
  "src-tauri",
  "scripts",
  "supabase",
  "android-patches",
  "ios-patches",
  "dist",
  "build"
]);

const EXCLUDE_FILES = new Set([
  "package.json",
  "package-lock.json",
  "capacitor.config.json",
  "capacitor.config.ts",
  ".gitignore",
  ".env",
  ".env.local",
  ".env.production",
  "README.md",
  "DESIGN.md"
]);

const ALLOWED_EXTS = new Set([
  ".html",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".ico",
  ".mp4",
  ".webm",
  ".mp3",
  ".wav",
  ".woff",
  ".woff2",
  ".ttf",
  ".webmanifest"
]);

function cleanOutDir() {
  if (fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function patchHtmlForNative(html) {
  let out = html;

  // 1. Strip Google AdSense web scripts inside native app containers (policy compliance)
  out = out.replace(
    /<script[^>]*pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js[^>]*><\/script>\s*/gi,
    ""
  );
  out = out.replace(/<meta[^>]*name=["']google-adsense-account["'][^>]*>\s*/gi, "");

  // 2. Inject universal native-bridge.js once right before </head>
  if (!out.includes("native-bridge.js") && /<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, '  <script src="native-bridge.js"></script>\n</head>');
  }

  return out;
}

let htmlCount = 0;
let assetCount = 0;

function copyTree(srcDir, dstDir) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".well-known") continue;

    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      fs.mkdirSync(dstPath, { recursive: true });
      copyTree(srcPath, dstPath);
      continue;
    }

    if (EXCLUDE_FILES.has(entry.name)) continue;
    if (/\.env(\.|$)/i.test(entry.name)) continue;
    if (/\.(jks|keystore|p12|mobileprovision|pem|key)$/i.test(entry.name)) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) continue;

    if (ext === ".html") {
      const raw = fs.readFileSync(srcPath, "utf8");
      fs.writeFileSync(dstPath, patchHtmlForNative(raw), "utf8");
      htmlCount++;
    } else {
      fs.copyFileSync(srcPath, dstPath);
      assetCount++;
    }
  }
}

cleanOutDir();
copyTree(ROOT, OUT_DIR);

if (!fs.existsSync(path.join(OUT_DIR, "index.html"))) {
  console.error("❌ Error: index.html was not found in repository root!");
  process.exit(1);
}

console.log(`✅ Tournyx www/ bundle ready: ${htmlCount} HTML page(s), ${assetCount} asset(s).`);
