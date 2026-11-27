import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "www");
const VENDOR_DIR = path.join(OUT_DIR, "vendor");

const EXCLUDE_DIRS = new Set([
  ".git",
  ".github",
  "node_modules",
  "www",
  "android",
  "ios",
  "src-tauri",
  "scripts",
  "styles",
  "assets",
  "supabase",
  "dist",
  "build",
  "release-out",
  "ios-out"
]);

const EXCLUDE_FILES = new Set([
  "package.json",
  "package-lock.json",
  "capacitor.config.json",
  "capacitor.config.ts",
  "tailwind.config.cjs",
  ".gitignore",
  ".env",
  ".env.example",
  ".env.local",
  ".env.production",
  "README.md",
  "DESIGN.md"
]);

const ALLOWED_EXTS = new Set([
  ".html", ".js", ".mjs", ".css", ".json",
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico",
  ".mp4", ".webm", ".mp3", ".wav", ".woff", ".woff2", ".ttf", ".webmanifest"
]);

function cleanOutDir() {
  if (fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(VENDOR_DIR, { recursive: true });
}

function copyDirRecursive(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function bundleLocalVendors() {
  const flags = { tailwind: false, supabase: false, hls: false, fa: false, appShellCss: false };

  // 1. Pre-compile Tailwind CSS into static www/vendor/tournyx.min.css (Zero CDN runtime lag)
  const twInput = path.join(ROOT, "styles", "tailwind-input.css");
  const twOut = path.join(VENDOR_DIR, "tournyx.min.css");
  if (fs.existsSync(twInput)) {
    const twPkgPath = path.join(ROOT, "node_modules", "tailwindcss", "package.json");
    const twPkg = JSON.parse(fs.readFileSync(twPkgPath, "utf8"));
    const binRel = typeof twPkg.bin === "string" ? twPkg.bin : (twPkg.bin?.tailwindcss || "lib/cli.js");
    const twCli = path.join(ROOT, "node_modules", "tailwindcss", binRel);
    execFileSync(process.execPath, [twCli, "-i", twInput, "-o", twOut, "--minify"], {
      cwd: ROOT,
      stdio: "inherit"
    });
    flags.tailwind = fs.existsSync(twOut);
  }

  // 2. Bundle Supabase UMD locally
  const supaSrc = path.join(ROOT, "node_modules", "@supabase", "supabase-js", "dist", "umd", "supabase.js");
  if (fs.existsSync(supaSrc)) {
    fs.copyFileSync(supaSrc, path.join(VENDOR_DIR, "supabase.min.js"));
    flags.supabase = true;
  }

  // 3. Bundle HLS.js locally
  const hlsSrc = path.join(ROOT, "node_modules", "hls.js", "dist", "hls.min.js");
  if (fs.existsSync(hlsSrc)) {
    fs.copyFileSync(hlsSrc, path.join(VENDOR_DIR, "hls.min.js"));
    flags.hls = true;
  }

  // 4. Bundle FontAwesome CSS + Webfonts locally (0ms offline icons)
  const faRoot = path.join(ROOT, "node_modules", "@fortawesome", "fontawesome-free");
  if (fs.existsSync(path.join(faRoot, "css", "all.min.css"))) {
    fs.mkdirSync(path.join(VENDOR_DIR, "fa", "css"), { recursive: true });
    fs.copyFileSync(path.join(faRoot, "css", "all.min.css"), path.join(VENDOR_DIR, "fa", "css", "all.min.css"));
    if (fs.existsSync(path.join(faRoot, "webfonts"))) {
      copyDirRecursive(path.join(faRoot, "webfonts"), path.join(VENDOR_DIR, "fa", "webfonts"));
    }
    flags.fa = true;
  }

  // 5. Copy Dedicated App Shell CSS (Apple Liquid Glass + Obsidian GPU-Safe) when present
  const shellCssSrc = path.join(ROOT, "styles", "native-app-shell.css");
  if (fs.existsSync(shellCssSrc)) {
    fs.copyFileSync(shellCssSrc, path.join(VENDOR_DIR, "native-app-shell.css"));
    flags.appShellCss = true;
  }

  return flags;
}

function patchHtmlForNative(html, flags) {
  let out = html;

  // 1. Strip Google AdSense web scripts inside native binaries (AdSense WebView compliance)
  out = out.replace(/<script[^>]*pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js[^>]*><\/script>\s*/gi, "");
  out = out.replace(/<meta[^>]*name=["']google-adsense-account["'][^>]*>\s*/gi, "");

  // 2. Replace runtime Tailwind CDN with pre-compiled static local CSS
  if (flags.tailwind) {
    out = out.replace(/<script[^>]*cdn\.tailwindcss\.com[^>]*><\/script>\s*/gi, '<link rel="stylesheet" href="vendor/tournyx.min.css">\n');
    out = out.replace(/<script[^>]*id=["']tailwind-config["'][^>]*>[\s\S]*?<\/script>\s*/gi, "");
  }

  // 3. Rewrite CDN libraries to local zero-latency vendor copies
  if (flags.supabase) {
    out = out.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/gi, "vendor/supabase.min.js");
  }
  if (flags.hls) {
    out = out.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/hls\.js@[^"']+\/dist\/hls\.min\.js/gi, "vendor/hls.min.js");
  }
  if (flags.fa) {
    out = out.replace(/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\/[^"']+\/css\/all\.min\.css/gi, "vendor/fa/css/all.min.css");
  }

  // 4. Inject anti-white-flash inline surface lock + native-app-shell.css + native-bridge.js
  const injections = [
    '<style id="tx-native-boot-lock">html,body{background-color:#050508!important;color:#F8FAFC;}</style>'
  ];
  if (flags.appShellCss && !out.includes("native-app-shell.css")) {
    injections.push('<link rel="stylesheet" href="vendor/native-app-shell.css">');
  }
  if (!out.includes("native-bridge.js")) {
    injections.push('<script src="native-bridge.js"></script>');
  }

  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `  ${injections.join("\n  ")}\n</head>`);
  }

  return out;
}

let htmlCount = 0;
let assetCount = 0;

function copyTree(srcDir, dstDir, flags) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".well-known") continue;
    // Never bundle private payout/admin portal files into client binaries
    if (/^PayoutPortel/i.test(entry.name)) continue;

    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      fs.mkdirSync(dstPath, { recursive: true });
      copyTree(srcPath, dstPath, flags);
      continue;
    }

    if (EXCLUDE_FILES.has(entry.name)) continue;
    if (/\.env(\.|$)/i.test(entry.name)) continue;
    if (/\.(jks|keystore|p12|mobileprovision|pem|key)$/i.test(entry.name)) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) continue;

    if (ext === ".html") {
      const raw = fs.readFileSync(srcPath, "utf8");
      fs.writeFileSync(dstPath, patchHtmlForNative(raw, flags), "utf8");
      htmlCount++;
    } else {
      fs.copyFileSync(srcPath, dstPath);
      assetCount++;
    }
  }
}

cleanOutDir();
const flags = bundleLocalVendors();
copyTree(ROOT, OUT_DIR, flags);

if (!fs.existsSync(path.join(OUT_DIR, "index.html"))) {
  console.error("❌ Error: index.html was not found in repository root!");
  process.exit(1);
}

console.log(`✅ Tournyx www/ bundle ready: ${htmlCount} HTML page(s), ${assetCount} asset(s). Local vendors:`, flags);
