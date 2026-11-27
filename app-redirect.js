(() => {
  "use strict";

  // Never run inside installed native Capacitor or Tauri apps
  if (window.Capacitor?.isNativePlatform?.() || window.__TAURI_INTERNALS__ || window.__TAURI__) return;
  if (window.self !== window.top) return;

  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  if (!isAndroid && !isIOS) return;

  const KNOWN_PAGES = new Set([
    "index", "explore", "matches", "reels", "clans", "tournament",
    "resolve", "tickets", "profile", "login", "giveaway", "offer",
    "refer", "premium", "settings", "notifications", "support"
  ]);

  const host = window.location.hostname.toLowerCase();
  const qs = new URLSearchParams(window.location.search || "");
  const hs = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
  const hasOAuthPayload = Boolean(qs.get("code") || hs.get("access_token") || qs.get("access_token"));

  // 1. SELF-HEALING OAUTH RETURN BOUNCE (Fixes Chrome Custom Tabs Landing on tournyx.in Instead of App)
  if (hasOAuthPayload) {
    const authBounceUrl = `in.tournyx.app://auth/callback${window.location.search || ""}${window.location.hash || ""}`;
    const androidAuthIntent =
      `intent://auth/callback${window.location.search || ""}` +
      `#Intent;scheme=in.tournyx.app;package=in.tournyx.app;` +
      `S.browser_fallback_url=${encodeURIComponent(window.location.href)};end` +
      (window.location.hash || "");

    const shouldAutoBounce = qs.get("source") === "app" || host === "app.tournyx.in";
    if (shouldAutoBounce && sessionStorage.getItem("tx_oauth_bounced_v8") !== "1") {
      sessionStorage.setItem("tx_oauth_bounced_v8", "1");
      window.location.href = isAndroid ? androidAuthIntent : authBounceUrl;
    }

    window.addEventListener("DOMContentLoaded", () => {
      if (document.getElementById("tx-oauth-return-bar")) return;
      const bar = document.createElement("div");
      bar.id = "tx-oauth-return-bar";
      bar.style.cssText =
        "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;width:min(calc(100vw - 24px),420px);" +
        "padding:12px 14px;border-radius:18px;background:rgba(14,16,30,0.96);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);" +
        "border:1px solid rgba(56,189,248,0.58);box-shadow:0 18px 40px rgba(0,0,0,0.82);display:flex;align-items:center;" +
        "justify-content:space-between;gap:10px;color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;";
      bar.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <img src="logo-transparent.png" onerror="this.onerror=null;this.src='favicon.png'" alt="Tournyx" style="width:30px;height:30px;object-fit:contain;">
          <div style="min-width:0;">
            <div style="font-size:12.5px;font-weight:800;">Sign-In Verified!</div>
            <div style="font-size:10.5px;color:#94A3B8;">Tap to finish login inside Tournyx App</div>
          </div>
        </div>
        <a href="${isAndroid ? androidAuthIntent : authBounceUrl}"
          style="padding:8px 13px;border-radius:9999px;background:linear-gradient(135deg,#8B5CF6,#38BDF8);color:#FFFFFF;font-size:11.5px;font-weight:800;text-decoration:none;white-space:nowrap;">
          Return to App
        </a>
      `;
      document.body.appendChild(bar);
    });
    return;
  }

  // 2. LOOP-FREE app.tournyx.in -> INSTALLED APP HANDOFF
  const rawFile = (window.location.pathname.split("/").pop() || "index.html").replace(/\.html$/i, "");
  const safePage = KNOWN_PAGES.has(rawFile) ? `${rawFile}.html` : "index.html";
  const target = `${safePage}${window.location.search || ""}${window.location.hash || ""}`;
  const fallbackWeb = `https://tournyx.in/${safePage === "index.html" ? "" : target}`;

  const androidIntent =
    `intent://open?page=${encodeURIComponent(target)}` +
    `#Intent;scheme=in.tournyx.app;package=in.tournyx.app;` +
    `S.browser_fallback_url=${encodeURIComponent(fallbackWeb)};end`;
  const iosDeepLink = `in.tournyx.app://open?page=${encodeURIComponent(target)}`;

  if (host === "app.tournyx.in" && isAndroid && sessionStorage.getItem("tx_app_handoff_v8") !== "1") {
    sessionStorage.setItem("tx_app_handoff_v8", "1");
    window.location.href = androidIntent;
  }

  // Sleek 3-Color "Open in Tournyx App" Bar on Mobile Web Browsers
  window.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("tx-web-open-app-bar") || sessionStorage.getItem("tx_open_app_dismissed") === "1") return;
    const bar = document.createElement("div");
    bar.id = "tx-web-open-app-bar";
    bar.style.cssText =
      "position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:99999;width:min(calc(100vw - 24px),420px);" +
      "padding:10px 12px;border-radius:18px;background:rgba(14,16,30,0.94);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);" +
      "border:1px solid rgba(139,92,246,0.52);box-shadow:0 16px 36px rgba(0,0,0,0.78);display:flex;align-items:center;" +
      "justify-content:space-between;gap:10px;color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;";

    const launchHref = isAndroid ? androidIntent : iosDeepLink;
    bar.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;min-width:0;">
        <img src="logo-transparent.png" onerror="this.onerror=null;this.src='favicon.png'" alt="Tournyx"
          style="width:32px;height:32px;object-fit:contain;flex-shrink:0;">
        <div style="min-width:0;">
          <div style="font-size:12.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Tournyx Esports App</div>
          <div style="font-size:10.5px;color:#94A3B8;">Open in dedicated app for best speed</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        <a href="${launchHref}" style="padding:7px 13px;border-radius:9999px;background:linear-gradient(135deg,#8B5CF6,#38BDF8);color:#FFFFFF;font-size:11.5px;font-weight:800;text-decoration:none;">Open App</a>
        <button id="txDismissAppBar" type="button" aria-label="Dismiss" style="background:none;border:none;color:#94A3B8;font-size:16px;padding:4px 6px;cursor:pointer;">&times;</button>
      </div>
    `;
    document.body.appendChild(bar);
    bar.querySelector("#txDismissAppBar")?.addEventListener("click", () => {
      sessionStorage.setItem("tx_open_app_dismissed", "1");
      bar.remove();
    });
  });
})();
