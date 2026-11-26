(() => {
  "use strict";

  const KNOWN_PAGES = new Set([
    "index", "explore", "matches", "reels", "clans", "tournament",
    "resolve", "tickets", "profile", "login", "giveaway", "offer",
    "refer", "premium", "settings", "notifications", "support",
    "about", "contact", "feedback", "leaderboard", "blogs",
    "discord", "instagram", "youtube", "privacy", "terms", "refund",
    "Globe-support", "maintenance"
  ]);

  const isCapacitor = Boolean(window.Capacitor?.isNativePlatform?.());
  const isTauri = Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
  const isNative = isCapacitor || isTauri;

  function detectPlatform() {
    if (isCapacitor) return window.Capacitor.getPlatform?.() || "android";
    if (isTauri) {
      const ua = navigator.userAgent || "";
      if (/Mac/i.test(ua)) return "macos";
      if (/Win/i.test(ua)) return "windows";
      return "linux";
    }
    return "web";
  }

  const platform = detectPlatform();
  document.documentElement.dataset.txPlatform = platform;

  // Expose unified host API for Tournyx pages & future Tournyx Engine 2.0 plugins
  window.TournyxNative = {
    isNative,
    isCapacitor,
    isTauri,
    platform,
    openExternal(url) {
      if (!url || !/^https?:\/\//i.test(url)) return;
      if (isCapacitor && window.Capacitor?.Plugins?.Browser?.open) {
        window.Capacitor.Plugins.Browser.open({ url, toolbarColor: "#050508" }).catch(() => {
          window.open(url, "_blank", "noopener,noreferrer");
        });
        return;
      }
      if (isTauri && window.__TAURI_INTERNALS__?.invoke) {
        window.__TAURI_INTERNALS__.invoke("plugin:opener|open_url", { url }).catch(() => {
          window.open(url, "_blank", "noopener,noreferrer");
        });
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  if (!isNative) return;

  // Resolve extensionless local paths (/reels?id=123 -> reels.html?id=123) inside native WebView
  function resolveLocalNativeHref(rawHref) {
    if (!rawHref) return null;
    const trimmed = String(rawHref).trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("javascript:") || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) {
      return null;
    }

    // Rewrite tournyx.in internal links back to local pages
    let candidate = trimmed;
    try {
      const parsed = new URL(trimmed, window.location.origin);
      if (parsed.hostname === "tournyx.in" || parsed.hostname === "www.tournyx.in") {
        candidate = parsed.pathname + parsed.search + parsed.hash;
      } else if (/^https?:\/\//i.test(trimmed)) {
        return { external: true, url: trimmed };
      }
    } catch (e) {
      return null;
    }

    const match = candidate.match(/^\/?([A-Za-z0-9_-]+)(\?[^#]*)?(#.*)?$/);
    if (match && KNOWN_PAGES.has(match[1])) {
      return { external: false, url: `${match[1]}.html${match[2] || ""}${match[3] || ""}` };
    }
    return null;
  }

  // Intercept <a> clicks for extensionless routes & external links
  document.addEventListener("click", (e) => {
    const anchor = e.target?.closest?.("a[href]");
    if (!anchor) return;
    const rawHref = anchor.getAttribute("href") || "";

    // Let Android game intents & custom schemes pass straight to OS
    if (/^(intent:|freefiremax:|freefireth:|pubg:|cod:|riotclient:|whatsapp:)/i.test(rawHref)) {
      return;
    }

    const resolved = resolveLocalNativeHref(rawHref);
    if (!resolved) return;

    if (resolved.external) {
      e.preventDefault();
      window.TournyxNative.openExternal(resolved.url);
    } else if (resolved.url !== rawHref) {
      e.preventDefault();
      window.location.href = resolved.url;
    }
  }, true);

  // Intercept window.open('/reels?id=...') so in-app routes never open blank popups
  const origWindowOpen = window.open.bind(window);
  window.open = function(url, target, features) {
    const resolved = resolveLocalNativeHref(url);
    if (resolved) {
      if (resolved.external) {
        window.TournyxNative.openExternal(resolved.url);
        return null;
      }
      window.location.href = resolved.url;
      return window;
    }
    return origWindowOpen(url, target, features);
  };

  // Native StatusBar, SplashScreen, Deep Links & Android Hardware Back Button
  window.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("is-native-app", `platform-${platform}`);

    if (!isCapacitor) return;
    const plugins = window.Capacitor?.Plugins || {};

    try {
      plugins.StatusBar?.setBackgroundColor?.({ color: "#050508" });
      plugins.StatusBar?.setStyle?.({ style: "DARK" });
      plugins.SplashScreen?.hide?.();
    } catch (e) {}

    // Handle Deep Links (https://tournyx.in/matches?focus=T-123)
    try {
      plugins.App?.addListener?.("appUrlOpen", (event) => {
        if (!event?.url) return;
        const resolved = resolveLocalNativeHref(event.url);
        if (resolved && !resolved.external) {
          window.location.href = resolved.url;
        }
      });
    } catch (e) {}

    // Android Hardware Back Button Handler
    let lastBackPress = 0;
    try {
      plugins.App?.addListener?.("backButton", () => {
        // 1. Close mobile drawer if open
        const drawer = document.getElementById("commandDrawer");
        if (drawer?.classList.contains("active") && typeof window.toggleCommandDrawer === "function") {
          window.toggleCommandDrawer(false);
          return;
        }

        // 2. Close active modal/sheet if any
        const activeSheets = document.querySelectorAll(".sheet-overlay.active");
        if (activeSheets.length > 0) {
          if (typeof window.handleUniversalBack === "function") {
            window.handleUniversalBack(true);
            return;
          }
          const top = activeSheets[activeSheets.length - 1];
          if (top.id && typeof window.closeModal === "function") {
            window.closeModal(top.id);
            return;
          }
          top.classList.remove("active");
          return;
        }

        // 3. Navigate back if not on index.html
        const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
        if (page !== "index.html" && page !== "") {
          if (window.history.length > 1) window.history.back();
          else window.location.href = "index.html";
          return;
        }

        // 4. Double-tap back to exit on Home
        const now = Date.now();
        if (now - lastBackPress < 2000) {
          plugins.App?.exitApp?.();
        } else {
          lastBackPress = now;
          if (typeof window.showToast === "function") {
            window.showToast("Press back again to exit Tournyx");
          }
        }
      });
    } catch (e) {}
  });
})();
