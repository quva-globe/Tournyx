(() => {
  "use strict";

  const APP_VERSION = "6.1.0";
  const PUBLIC_ORIGIN = "https://tournyx.in";
  const OAUTH_CALLBACK_URI = "in.tournyx.app://auth/callback";
  const VERSION_CHECK_URL = "https://tournyx.in/app-version.json";
  const SUPABASE_HOST = "zuatrwfrejnwfnldqqgy.supabase.co";
  const SUPABASE_AUTH_STORAGE_KEY = "sb-zuatrwfrejnwfnldqqgy-auth-token";

  const KNOWN_PAGES = new Set([
    "index", "explore", "matches", "reels", "clans", "tournament",
    "resolve", "tickets", "profile", "login", "giveaway", "offer",
    "refer", "premium", "settings", "notifications", "support",
    "about", "contact", "feedback", "leaderboard", "blogs",
    "discord", "instagram", "youtube", "privacy", "terms", "refund",
    "Globe-support", "maintenance"
  ]);

  const AUTH_EXEMPT_PAGES = new Set([
    "login.html", "privacy.html", "terms.html", "refund.html", "support.html", "about.html"
  ]);

  const PERSISTED_KEYS = [
    "tournyx_user",
    SUPABASE_AUTH_STORAGE_KEY,
    "tournyx_perf_tier",
    "tournyx_theme_config",
    "tournyx_psm",
    "tx_onboard_v6_done"
  ];

  const DOCK_TABS = [
    { id: "index", label: "Home", href: "index.html", icon: "fa-house" },
    { id: "explore", label: "Explore", href: "explore.html", icon: "fa-compass" },
    { id: "matches", label: "Matches", href: "matches.html", icon: "fa-trophy" },
    { id: "reels", label: "Reels", href: "reels.html", icon: "fa-clapperboard" },
    { id: "clans", label: "Clans", href: "clans.html", icon: "fa-shield-halved" },
    { id: "profile", label: "Profile", href: "profile.html", icon: "fa-user" }
  ];

  const DEFAULT_EVENT_BANNERS = [
    {
      id: "mega-weekend-drop",
      badge: "LIVE EVENT • SEASON 6",
      title: "THE GRAND CLUTCH FEST",
      subtitle: "Zero-lag Free Fire MAX & BGMI rooms with instant TX Pass rewards.",
      cta_text: "Explore Cups",
      cta_href: "explore.html",
      theme: "dragon-violet",
      icon: "fa-trophy"
    },
    {
      id: "festival-special",
      badge: "FESTIVAL SPECIAL",
      title: "MEGA PRIZE POOL DROP",
      subtitle: "Daily scrims, 8-slice Spin & Win, and bonus streak drops unlocked.",
      cta_text: "Claim Rewards",
      cta_href: "index.html#dailyCheckinCard",
      theme: "festival-gold",
      icon: "fa-sparkles"
    },
    {
      id: "clutch-reels-creator",
      badge: "CREATOR ARENA",
      title: "UPLOAD CLUTCH REELS",
      subtitle: "Drop 1v4 vertical highlights and earn +25 TX PTS per 1,000 verified views.",
      cta_text: "Watch Reels",
      cta_href: "reels.html",
      theme: "cyber-cyan",
      icon: "fa-clapperboard"
    }
  ];

  const isCapacitor = Boolean(window.Capacitor?.isNativePlatform?.());
  const isTauri = Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
  const isNative = isCapacitor || isTauri;

  function detectPlatform() {
    if (isCapacitor) return (window.Capacitor.getPlatform?.() || "android").toLowerCase();
    if (isTauri) {
      const ua = navigator.userAgent || "";
      if (/Mac/i.test(ua)) return "macos";
      if (/Win/i.test(ua)) return "windows";
      return "linux";
    }
    return "web";
  }

  const platform = detectPlatform();
  const isAppleNative = platform === "ios" || platform === "macos";
  const isMobileNative = platform === "android" || platform === "ios";
  const isDesktopNative = platform === "windows" || platform === "macos" || platform === "linux";

  document.documentElement.dataset.txPlatform = platform;
  document.documentElement.dataset.txNative = isNative ? "true" : "false";

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"'`=/]/g, (s) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "/": "&#x2F;", "`": "&#x60;", "=": "&#x3D;"
    }[s]));
  }

  function safeBannerHref(raw) {
    const s = String(raw || "explore.html").trim();
    if (/^https?:\/\//i.test(s)) return s;
    if (/^[a-z0-9/_.-]+(?:\?[a-z0-9=&_%+-]+)?(?:#[a-z0-9_-]+)?$/i.test(s) && !s.startsWith("//")) return s;
    return "explore.html";
  }

  function currentPageFile() {
    return (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  }

  function doNativeHaptic(style = "light") {
    try {
      const h = window.Capacitor?.Plugins?.Haptics;
      if (h?.impact) {
        h.impact({ style: style === "heavy" ? "HEAVY" : "LIGHT" });
        return;
      }
      if (navigator.vibrate) navigator.vibrate(style === "heavy" ? 22 : 10);
    } catch (e) {}
  }

  function hasValidSavedSession() {
    try {
      const raw = localStorage.getItem("tournyx_user");
      if (!raw || raw === "undefined" || raw === "null") return false;
      const u = JSON.parse(raw);
      return Boolean(u?.email && String(u.email).toLowerCase() !== "guest@tournyx.com");
    } catch (e) {
      return false;
    }
  }

  // =========================================================================
  // 1. PERSISTENT OS STORAGE MIRROR (@capacitor/preferences)
  // =========================================================================
  const origSetItem = Storage.prototype.setItem;
  const origRemoveItem = Storage.prototype.removeItem;

  if (isCapacitor) {
    Storage.prototype.setItem = function(key, value) {
      origSetItem.call(this, key, value);
      if (this === window.localStorage && PERSISTED_KEYS.includes(key)) {
        try {
          window.Capacitor?.Plugins?.Preferences?.set?.({ key, value: String(value) });
        } catch (e) {}
      }
    };

    Storage.prototype.removeItem = function(key) {
      origRemoveItem.call(this, key);
      if (this === window.localStorage && PERSISTED_KEYS.includes(key)) {
        try {
          window.Capacitor?.Plugins?.Preferences?.remove?.({ key });
        } catch (e) {}
      }
    };
  }

  async function hydratePersistedNativePrefs() {
    if (!isCapacitor) return;
    const prefs = window.Capacitor?.Plugins?.Preferences;
    if (!prefs?.get) return;
    let restoredUser = false;
    for (const key of PERSISTED_KEYS) {
      try {
        const localVal = window.localStorage.getItem(key);
        if (!localVal || localVal === "undefined" || localVal === "null") {
          const res = await prefs.get({ key });
          if (res?.value && res.value !== "undefined" && res.value !== "null") {
            origSetItem.call(window.localStorage, key, res.value);
            if (key === "tournyx_user") restoredUser = true;
          }
        } else {
          prefs.set?.({ key, value: localVal });
        }
      } catch (e) {}
    }
    if (restoredUser) {
      window.dispatchEvent(new CustomEvent("tournyx:session-restored"));
    }
  }

  // =========================================================================
  // 2. TRANSPARENT SUPABASE SWR CACHE (ZERO BLANK SCREENS ON TAB SWITCH)
  //    - Caches read-only REST GET + get_* RPCs in fast sessionStorage (<1ms)
  //    - Auto-invalidates immediately on ANY write/mutation request
  // =========================================================================
  const SWR_PREFIX = "tx_swr_v6:";
  const SWR_TTL_MS = 90 * 1000;
  const SWR_MAX_ENTRIES = 28;
  const SWR_MAX_BYTES = 160000;

  function swrKeyHash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return SWR_PREFIX + (h >>> 0).toString(36);
  }

  function clearSwrCache() {
    try {
      const toRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(SWR_PREFIX)) toRemove.push(k);
      }
      toRemove.forEach((k) => sessionStorage.removeItem(k));
    } catch (e) {}
  }

  function readSwr(key) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.body !== "string") return null;
      if (Date.now() - parsed.ts > SWR_TTL_MS) {
        sessionStorage.removeItem(key);
        return null;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function writeSwr(key, body, contentType) {
    if (!body || body.length > SWR_MAX_BYTES) return;
    try {
      const keys = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(SWR_PREFIX)) keys.push(k);
      }
      if (keys.length >= SWR_MAX_ENTRIES) {
        sessionStorage.removeItem(keys[0]);
      }
      sessionStorage.setItem(key, JSON.stringify({
        ts: Date.now(),
        ct: contentType || "application/json; charset=utf-8",
        body
      }));
    } catch (e) {
      clearSwrCache();
    }
  }

  if (isNative && typeof window.fetch === "function") {
    const origFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
      const urlStr = typeof input === "string" ? input : (input?.url || "");
      const method = String(init?.method || (typeof input !== "string" ? input?.method : "GET") || "GET").toUpperCase();

      if (!urlStr.includes(SUPABASE_HOST) || !urlStr.includes("/rest/v1/")) {
        return origFetch(input, init);
      }

      const isReadGet = method === "GET";
      const isReadRpc = method === "POST" && /\/rest\/v1\/rpc\/get_[a-z0-9_]+/i.test(urlStr);

      // Any mutation clears cached reads so wallet/streak/joins stay 100% live
      if (!isReadGet && !isReadRpc) {
        clearSwrCache();
        return origFetch(input, init);
      }

      const bodySig = isReadRpc && typeof init?.body === "string" ? init.body : "";
      const cacheKey = swrKeyHash(`${method}|${urlStr}|${bodySig}`);
      const forceFresh = sessionStorage.getItem("tx_force_fresh") === "1";

      const refreshInBg = () => origFetch(input, init).then((resp) => {
        if (resp && resp.ok) {
          resp.clone().text().then((txt) => {
            writeSwr(cacheKey, txt, resp.headers.get("content-type"));
          }).catch(() => {});
        }
        return resp;
      });

      if (!forceFresh) {
        const cached = readSwr(cacheKey);
        if (cached) {
          refreshInBg().catch(() => {});
          return Promise.resolve(new Response(cached.body, {
            status: 200,
            headers: { "Content-Type": cached.ct, "X-Tournyx-Cache": "SWR-HIT" }
          }));
        }
      }

      return refreshInBg();
    };
  }

  // =========================================================================
  // 3. NATIVE 1-TAP OAUTH BRIDGE (GOOGLE, DISCORD, FACEBOOK DEVICE ACCOUNTS)
  //    Uses Chrome Custom Tabs / ASWebAuthenticationSession + Custom Scheme
  // =========================================================================
  let activeSupaClients = [];

  function installSupabaseOAuthHook() {
    if (!isCapacitor) return;

    const wrapCreateClient = (sbObj) => {
      if (!sbObj || typeof sbObj.createClient !== "function" || sbObj.__txWrapped) return;
      const origCreate = sbObj.createClient.bind(sbObj);
      sbObj.__txWrapped = true;

      sbObj.createClient = function(...args) {
        const client = origCreate(...args);
        if (client?.auth && typeof client.auth.signInWithOAuth === "function" && !client.auth.__txOAuthWrapped) {
          const origOAuth = client.auth.signInWithOAuth.bind(client.auth);
          client.auth.__txOAuthWrapped = true;

          client.auth.signInWithOAuth = async function(credentials) {
            try {
              const opts = Object.assign({}, credentials?.options || {}, {
                redirectTo: OAUTH_CALLBACK_URI,
                skipBrowserRedirect: true
              });
              const res = await origOAuth(Object.assign({}, credentials, { options: opts }));
              if (res?.data?.url && window.Capacitor?.Plugins?.Browser?.open) {
                TournyxLoader.show("Opening Secure Sign-In...");
                await window.Capacitor.Plugins.Browser.open({
                  url: res.data.url,
                  toolbarColor: "#050508",
                  presentationStyle: "popover"
                });
                setTimeout(() => TournyxLoader.hide(), 1200);
              }
              return res;
            } catch (err) {
              TournyxLoader.hide();
              return origOAuth(credentials);
            }
          };
          activeSupaClients.push(client);
        }
        return client;
      };
    };

    if (window.supabase) {
      wrapCreateClient(window.supabase);
    } else {
      let _sb;
      try {
        Object.defineProperty(window, "supabase", {
          configurable: true,
          get() { return _sb; },
          set(val) {
            _sb = val;
            wrapCreateClient(val);
          }
        });
      } catch (e) {}
    }
  }

  async function handleNativeOAuthCallback(urlStr) {
    try {
      await window.Capacitor?.Plugins?.Browser?.close?.();
    } catch (e) {}

    TournyxLoader.show("Completing Sign-In...");
    try {
      const parsed = new URL(urlStr);
      const queryParams = new URLSearchParams(parsed.search || "");
      const hashParams = new URLSearchParams((parsed.hash || "").replace(/^#/, ""));
      const code = queryParams.get("code");
      const accessToken = hashParams.get("access_token") || queryParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token") || queryParams.get("refresh_token");

      const client = activeSupaClients[0] || (
        window.supabase?.createClient
          ? window.supabase.createClient(
              `https://${SUPABASE_HOST}`,
              "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YXRyd2ZyZWpud2ZubGRxcWd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNDE5NjEsImV4cCI6MjA5OTYxNzk2MX0.zcJO4Es-DnuUKR-L_Eu44xIwmz4PxsFVCgs-t492t1g"
            )
          : null
      );

      if (client?.auth) {
        if (code && typeof client.auth.exchangeCodeForSession === "function") {
          await client.auth.exchangeCodeForSession(code);
        } else if (accessToken && refreshToken && typeof client.auth.setSession === "function") {
          await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        }

        // Persist auth token to OS Preferences immediately
        const sbTok = localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
        if (sbTok) {
          window.Capacitor?.Plugins?.Preferences?.set?.({ key: SUPABASE_AUTH_STORAGE_KEY, value: sbTok });
        }
      }

      clearSwrCache();
      // Land on login.html?native_oauth=1 so login.html's existing user lookup syncs public.Users -> index.html
      window.location.href = "login.html?native_oauth=1";
    } catch (err) {
      TournyxLoader.hide();
      if (typeof window.showToast === "function") {
        window.showToast("Sign-in cancelled or failed. Please try again.", true);
      }
    }
  }

  installSupabaseOAuthHook();

  // =========================================================================
  // 4. AUTOMATIC WHATSAPP / SHARE LINK REWRITER (app.tournyx.in -> tournyx.in)
  // =========================================================================
  function normalizePublicShareStr(val) {
    if (typeof val !== "string") return val;
    return val
      .replace(/https?:\/\/app\.tournyx\.in/gi, PUBLIC_ORIGIN)
      .replace(/capacitor:\/\/app\.tournyx\.in/gi, PUBLIC_ORIGIN)
      .replace(/https?:\/\/tauri\.localhost/gi, PUBLIC_ORIGIN);
  }

  if (isNative) {
    if (navigator.share) {
      const origShare = navigator.share.bind(navigator);
      navigator.share = function(data) {
        const clean = Object.assign({}, data || {});
        if (clean.url) clean.url = normalizePublicShareStr(clean.url);
        if (clean.text) clean.text = normalizePublicShareStr(clean.text);
        return origShare(clean);
      };
    }

    if (navigator.clipboard?.writeText) {
      const origWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = function(text) {
        return origWriteText(normalizePublicShareStr(text));
      };
    }
  }

  // =========================================================================
  // 5. UNIFIED COMMON APP LOADER (window.TournyxLoader)
  // =========================================================================
  let loaderAutoHideTimer = null;

  function ensureLoaderDom() {
    if (!document.body) return;
    if (!document.getElementById("tx-loader-rail")) {
      const rail = document.createElement("div");
      rail.id = "tx-loader-rail";
      rail.innerHTML = '<div id="tx-loader-rail-fill"></div>';
      document.body.appendChild(rail);
    }
    if (!document.getElementById("tx-common-loader")) {
      const ov = document.createElement("div");
      ov.id = "tx-common-loader";
      ov.setAttribute("role", "status");
      ov.setAttribute("aria-live", "polite");
      ov.innerHTML = `
        <div class="tx-loader-pill">
          <div class="tx-loader-spinner" aria-hidden="true"></div>
          <div style="min-width:0;">
            <div style="font-size:13px;font-weight:700;color:#FFFFFF;line-height:1.2;" id="tx-loader-label">Syncing Arena...</div>
            <div style="font-size:10px;color:#94A3B8;font-family:JetBrains Mono,monospace;margin-top:2px;">TOURNYX ESPORTS</div>
          </div>
        </div>`;
      document.body.appendChild(ov);
    }
  }

  const TournyxLoader = {
    bar(pct = 65) {
      ensureLoaderDom();
      const rail = document.getElementById("tx-loader-rail");
      const fill = document.getElementById("tx-loader-rail-fill");
      if (!rail || !fill) return;
      rail.classList.add("is-active");
      fill.style.width = `${Math.max(8, Math.min(100, Number(pct) || 0))}%`;
      if (pct >= 100) {
        setTimeout(() => {
          rail.classList.remove("is-active");
          fill.style.width = "0%";
        }, 200);
      }
    },
    show(label = "Syncing Arena...") {
      ensureLoaderDom();
      const ov = document.getElementById("tx-common-loader");
      const lbl = document.getElementById("tx-loader-label");
      if (lbl) lbl.textContent = String(label || "Syncing Arena...");
      if (ov) ov.classList.add("is-active");
      this.bar(75);
      clearTimeout(loaderAutoHideTimer);
      loaderAutoHideTimer = setTimeout(() => this.hide(), 10000);
    },
    hide() {
      clearTimeout(loaderAutoHideTimer);
      const ov = document.getElementById("tx-common-loader");
      if (ov) ov.classList.remove("is-active");
      this.bar(100);
    }
  };

  window.TournyxLoader = TournyxLoader;
  window.TournyxNative = {
    version: APP_VERSION,
    isNative,
    isCapacitor,
    isTauri,
    isAppleNative,
    platform,
    loader: TournyxLoader,
    haptic: doNativeHaptic,
    clearCache: clearSwrCache,
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
    },
    navigate(href) {
      performSmoothNavigate(href);
    },
    openCommandPalette() {
      toggleCommandPalette(true);
    }
  };

  // =========================================================================
  // 6. AUTOMATIC NATIVE GEOLOCATION BRIDGE (ZERO LOGIN BLOCKS)
  // =========================================================================
  if (isCapacitor && navigator.geolocation) {
    const nativeGeo = window.Capacitor?.Plugins?.Geolocation;
    const origGetPos = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);

    if (nativeGeo?.getCurrentPosition) {
      navigator.geolocation.getCurrentPosition = async function(successCb, errorCb, options) {
        try {
          let perm = await nativeGeo.checkPermissions?.();
          const state = perm?.location || perm?.coarseLocation;
          if (state !== "granted") {
            perm = await nativeGeo.requestPermissions?.();
          }
          const finalState = perm?.location || perm?.coarseLocation;
          if (finalState === "denied") {
            if (typeof errorCb === "function") {
              errorCb({ code: 1, message: "Location permission denied. Enable Location in App Settings." });
            }
            return;
          }
          const pos = await nativeGeo.getCurrentPosition({
            enableHighAccuracy: Boolean(options?.enableHighAccuracy),
            timeout: Math.min(18000, Math.max(6000, Number(options?.timeout) || 12000)),
            maximumAge: Number(options?.maximumAge) || 60000
          });
          if (typeof successCb === "function") successCb(pos);
        } catch (err) {
          origGetPos(successCb, errorCb, options);
        }
      };
    }
  }

  // =========================================================================
  // 7. ZOMATO-STYLE ANIMATED EVENT & FESTIVAL HERO BANNER (HOME PAGE)
  //    Works seamlessly on BOTH Website and All 4 Dedicated Apps
  // =========================================================================
  let bannerTimer = null;

  async function mountAnimatedEventBanner() {
    const page = currentPageFile();
    if (page !== "index.html" && page !== "") return;
    if (document.getElementById("tx-festival-banner")) return;

    const mainEl = document.querySelector("main");
    if (!mainEl) return;

    let banners = DEFAULT_EVENT_BANNERS;
    let autoplayMs = 4800;

    try {
      const res = await fetch("event-banners.json", { cache: "no-cache" });
      if (res.ok) {
        const cfg = await res.json();
        if (Array.isArray(cfg?.banners) && cfg.banners.length > 0) {
          banners = cfg.banners;
          if (Number(cfg.autoplay_ms) >= 2500) autoplayMs = Number(cfg.autoplay_ms);
        }
      }
    } catch (e) {}

    const wrap = document.createElement("section");
    wrap.id = "tx-festival-banner";
    wrap.setAttribute("aria-label", "Featured Events and Festivals");
    mainEl.insertBefore(wrap, mainEl.firstChild);

    let activeIdx = 0;

    const renderSlide = (idx) => {
      activeIdx = ((idx % banners.length) + banners.length) % banners.length;
      const b = banners[activeIdx];
      const allowedThemes = new Set(["dragon-violet", "festival-gold", "cyber-cyan", "crimson-rush"]);
      const themeKey = allowedThemes.has(b.theme) ? b.theme : "dragon-violet";
      const iconCls = /^fa-[a-z0-9-]+$/i.test(String(b.icon || "")) ? b.icon : "fa-trophy";
      const ctaHref = safeBannerHref(b.cta_href);

      wrap.innerHTML = `
        <div class="tx-fb-stage tx-fb-theme-${themeKey}">
          <div class="tx-fb-sheen" aria-hidden="true"></div>
          <div class="tx-fb-orb" aria-hidden="true"><i class="fa-solid ${iconCls}"></i></div>
          <div class="tx-fb-content">
            <span class="tx-fb-badge"><i class="fa-solid fa-bolt"></i> ${escapeHtml(b.badge || "LIVE EVENT")}</span>
            <h2 class="tx-fb-title">${escapeHtml(b.title || "TOURNYX ARENA")}</h2>
            <p class="tx-fb-sub">${escapeHtml(b.subtitle || "")}</p>
          </div>
          <div class="tx-fb-footer">
            <a class="tx-fb-cta" href="${escapeHtml(ctaHref)}">
              <span>${escapeHtml(b.cta_text || "Explore")}</span>
              <i class="fa-solid fa-arrow-right" style="font-size:10px;color:#D4FF00;"></i>
            </a>
            <div class="tx-fb-dots">
              ${banners.map((_, i) => `<button type="button" class="tx-fb-dot ${i === activeIdx ? "is-active" : ""}" data-fb-dot="${i}" aria-label="Banner ${i + 1}"></button>`).join("")}
            </div>
          </div>
        </div>
      `;

      wrap.querySelectorAll("[data-fb-dot]").forEach((dot) => {
        dot.addEventListener("click", () => {
          doNativeHaptic("light");
          renderSlide(Number(dot.dataset.fbDot));
          restartAutoplay();
        });
      });
    };

    const restartAutoplay = () => {
      clearInterval(bannerTimer);
      if (banners.length <= 1) return;
      bannerTimer = setInterval(() => {
        if (!document.hidden) renderSlide(activeIdx + 1);
      }, autoplayMs);
    };

    // Swipe Left / Right Support on Touch Screens
    let sx = 0;
    wrap.addEventListener("touchstart", (e) => { sx = e.touches[0]?.clientX || 0; }, { passive: true });
    wrap.addEventListener("touchend", (e) => {
      const dx = (e.changedTouches[0]?.clientX || 0) - sx;
      if (Math.abs(dx) > 42) {
        renderSlide(dx < 0 ? activeIdx + 1 : activeIdx - 1);
        restartAutoplay();
      }
    }, { passive: true });

    renderSlide(0);
    restartAutoplay();
  }

  // If running in normal web browser (not native app), only mount the Event Banner and exit
  if (!isNative) {
    window.addEventListener("DOMContentLoaded", () => {
      mountAnimatedEventBanner();
    });
    return;
  }

  // =========================================================================
  // 8. FAST-TAP NAVIGATION MUTEX & LOCAL PREFETCH ENGINE
  // =========================================================================
  let isNavigating = false;
  let navUnlockTimer = null;

  function resolveLocalNativeHref(rawHref) {
    if (!rawHref) return null;
    const trimmed = String(rawHref).trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("javascript:") || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) {
      return null;
    }

    let candidate = trimmed;
    try {
      const parsed = new URL(trimmed, window.location.origin);
      const host = parsed.hostname.toLowerCase();
      if (host === "tournyx.in" || host === "www.tournyx.in" || host === "app.tournyx.in" || host === "localhost" || host === "tauri.localhost") {
        candidate = parsed.pathname + parsed.search + parsed.hash;
      } else if (/^https?:\/\//i.test(trimmed)) {
        return { external: true, url: trimmed };
      }
    } catch (e) {
      return null;
    }

    if (candidate === "/" || candidate === "") {
      return { external: false, url: "index.html" };
    }

    const cleanMatch = candidate.match(/^\/?([A-Za-z0-9_-]+)(?:\.html)?(\?[^#]*)?(#.*)?$/);
    if (cleanMatch && KNOWN_PAGES.has(cleanMatch[1])) {
      return { external: false, url: `${cleanMatch[1]}.html${cleanMatch[2] || ""}${cleanMatch[3] || ""}` };
    }
    return null;
  }

  function performSmoothNavigate(targetHref) {
    const resolved = resolveLocalNativeHref(targetHref);
    if (!resolved) {
      if (/^https?:\/\//i.test(String(targetHref || ""))) {
        window.TournyxNative.openExternal(targetHref);
      }
      return;
    }
    if (resolved.external) {
      window.TournyxNative.openExternal(resolved.url);
      return;
    }

    // Strict fast-tap mutex prevents WebView thrashing when tapping quickly
    if (isNavigating) return;
    const curFull = currentPageFile() + window.location.search;
    if (curFull === resolved.url) return;

    isNavigating = true;
    clearTimeout(navUnlockTimer);
    navUnlockTimer = setTimeout(() => { isNavigating = false; }, 1800);

    doNativeHaptic("light");
    TournyxLoader.bar(80);
    window.location.href = resolved.url;
  }

  function prefetchCorePages() {
    const cur = currentPageFile();
    const run = () => {
      DOCK_TABS.forEach((tab) => {
        if (tab.href === cur) return;
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.href = tab.href;
        document.head.appendChild(link);
      });
    };
    if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 1200 });
    else setTimeout(run, 600);
  }

  document.addEventListener("click", (e) => {
    const anchor = e.target?.closest?.("a[href]");
    if (!anchor || e.defaultPrevented) return;
    const rawHref = anchor.getAttribute("href") || "";

    if (/^(intent:|freefiremax:|freefireth:|pubg:|cod:|riotclient:|whatsapp:)/i.test(rawHref)) {
      return;
    }

    const resolved = resolveLocalNativeHref(rawHref);
    if (!resolved) return;

    e.preventDefault();
    if (resolved.external) window.TournyxNative.openExternal(resolved.url);
    else performSmoothNavigate(resolved.url);
  }, false);

  const origWindowOpen = window.open.bind(window);
  window.open = function(url, target, features) {
    const resolved = resolveLocalNativeHref(url);
    if (resolved) {
      if (resolved.external) {
        window.TournyxNative.openExternal(resolved.url);
        return null;
      }
      performSmoothNavigate(resolved.url);
      return window;
    }
    return origWindowOpen(url, target, features);
  };

  // =========================================================================
  // 9. UNIFIED FLOATING LIQUID GLASS CAPSULE DOCK (FIXES ALL NAV BUGS)
  // =========================================================================
  function mountUnifiedCapsuleDock() {
    const page = currentPageFile();
    if (page === "login.html" || page === "reels.html") return;
    if (document.getElementById("tx-native-dock")) return;

    const activeKey = page.replace(/\.html$/i, "") || "index";
    const dock = document.createElement("nav");
    dock.id = "tx-native-dock";
    dock.setAttribute("aria-label", "Tournyx Primary Navigation");
    dock.innerHTML = DOCK_TABS.map((t) => {
      const isAct = activeKey === t.id;
      return `
        <a href="${t.href}" class="tx-dock-item ${isAct ? "is-active" : ""}" ${isAct ? 'aria-current="page"' : ""}>
          <i class="fa-solid ${t.icon}"></i>
          <span>${t.label}</span>
        </a>
      `;
    }).join("");

    document.body.appendChild(dock);
    document.body.classList.add("tx-has-dock");

    // Softly condense capsule dock when scrolling down
    let lastY = window.scrollY;
    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        dock.classList.toggle("is-condensed", y > 90 && y > lastY + 14);
        lastY = y;
        ticking = false;
      });
    }, { passive: true });
  }

  // =========================================================================
  // 10. SUPPRESS DUPLICATE login.html WEB SPLASH INSIDE NATIVE APPS ONLY
  // =========================================================================
  function suppressDuplicateLoginSplash() {
    if (currentPageFile() !== "login.html") return;
    const sweep = () => {
      document.querySelectorAll("div, section").forEach((el) => {
        if (el.id === "tx-animated-splash" || el.id === "tx-common-loader") return;
        const txt = (el.textContent || "").toUpperCase();
        if (txt.includes("INITIALIZING TOURNYX") || txt.includes("SKIP INTRO")) {
          const st = window.getComputedStyle(el);
          if (st.position === "fixed" || st.zIndex >= 50) {
            el.classList.add("tx-login-intro-hidden");
          }
        }
      });
    };
    sweep();
    setTimeout(sweep, 80);
    setTimeout(sweep, 260);
  }

  // =========================================================================
  // 11. 2-STAGE TX DRAGON KINETIC SPLASH + FIRST-TIME LOGIN GATE
  // =========================================================================
  function enforceFirstTimeLoginGate() {
    const page = currentPageFile();
    if (AUTH_EXEMPT_PAGES.has(page)) return false;
    if (!hasValidSavedSession()) {
      window.location.replace("login.html");
      return true;
    }
    return false;
  }

  function mountAnimatedColdSplash(onDone) {
    if (sessionStorage.getItem("tx_cold_boot_done") === "1") {
      onDone();
      return;
    }
    sessionStorage.setItem("tx_cold_boot_done", "1");

    const splash = document.createElement("div");
    splash.id = "tx-animated-splash";
    splash.setAttribute("aria-label", "Loading Tournyx Esports");
    splash.innerHTML = `
      <div class="tx-splash-aura" aria-hidden="true"></div>
      <div class="tx-splash-crest-wrap">
        <div class="tx-splash-arc-outer"></div>
        <div class="tx-splash-arc-inner"></div>
        <div class="tx-splash-logo-frame">
          <img class="tx-splash-logo" src="favicon.png" alt="Tournyx Esports">
        </div>
      </div>
      <div style="text-align:center;position:relative;z-index:2;">
        <div style="font-family:Orbitron,Plus Jakarta Sans,sans-serif;font-size:20px;font-weight:900;letter-spacing:0.14em;color:#FFFFFF;">
          TOURNYX<span style="color:#D4FF00;">.</span>
        </div>
        <div style="font-family:JetBrains Mono,monospace;font-size:10px;letter-spacing:0.20em;color:#C4B5FD;margin-top:5px;text-transform:uppercase;">
          ESPORTS ARENA
        </div>
      </div>
    `;
    document.body.appendChild(splash);

    // Seamless Stage 1 -> Stage 2 handoff
    try { window.Capacitor?.Plugins?.SplashScreen?.hide?.(); } catch (e) {}

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      splash.classList.add("is-hiding");
      setTimeout(() => {
        splash.remove();
        onDone();
      }, 340);
    };

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const beatMs = reduceMotion ? 260 : 1250;
    const minBeat = new Promise((r) => setTimeout(r, beatMs));
    const maxCap = new Promise((r) => setTimeout(r, 1750));
    const docReady = document.readyState === "complete"
      ? Promise.resolve()
      : new Promise((r) => window.addEventListener("load", r, { once: true }));

    Promise.race([Promise.all([minBeat, docReady]), maxCap]).then(dismiss);
  }

  // =========================================================================
  // 12. SMOOTH DELIBERATE PULL-TO-REFRESH (KEEPING USER'S GESTURE, ZERO ACCIDENTS)
  // =========================================================================
  function initPullToRefresh() {
    if (!isMobileNative) return;
    const page = currentPageFile();
    if (page === "reels.html" || page === "login.html") return;

    const pill = document.createElement("div");
    pill.id = "tx-ptr-pill";
    pill.innerHTML = '<i class="fa-solid fa-rotate-right" style="color:#D4FF00;"></i><span>Pull to refresh</span>';
    document.body.appendChild(pill);

    let startY = 0;
    let startX = 0;
    let pullDist = 0;
    let tracking = false;

    window.addEventListener("touchstart", (e) => {
      if (window.scrollY > 1 || document.body.classList.contains("modal-open") || isNavigating) {
        tracking = false;
        return;
      }
      startY = e.touches[0]?.clientY || 0;
      startX = e.touches[0]?.clientX || 0;
      pullDist = 0;
      tracking = true;
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
      if (!tracking) return;
      const dy = (e.touches[0]?.clientY || 0) - startY;
      const dx = Math.abs((e.touches[0]?.clientX || 0) - startX);
      if (dx > dy || dy <= 18 || window.scrollY > 1) {
        if (pullDist > 0) {
          pill.classList.remove("is-visible");
          pill.style.transform = "translate3d(-50%, -68px, 0)";
        }
        pullDist = 0;
        if (dx > dy) tracking = false;
        return;
      }
      pullDist = Math.min(120, (dy - 18) * 0.55);
      pill.classList.add("is-visible");
      pill.style.transform = `translate3d(-50%, ${Math.round(pullDist - 54)}px, 0)`;
      const span = pill.querySelector("span");
      if (span) span.textContent = pullDist >= 84 ? "Release to refresh" : "Pull to refresh";
    }, { passive: true });

    window.addEventListener("touchend", () => {
      if (!tracking) return;
      tracking = false;
      if (pullDist >= 84 && !isNavigating) {
        doNativeHaptic("heavy");
        clearSwrCache();
        sessionStorage.setItem("tx_force_fresh", "1");
        TournyxLoader.show("Refreshing Arena...");
        pill.classList.remove("is-visible");
        setTimeout(() => window.location.reload(), 120);
      } else {
        pill.classList.remove("is-visible");
        pill.style.transform = "translate3d(-50%, -68px, 0)";
      }
      pullDist = 0;
    }, { passive: true });
  }

  // =========================================================================
  // 13. DESKTOP COMMAND PALETTE (Cmd+K / Ctrl+K) & BATTERY GUARDS
  // =========================================================================
  const CMD_ROUTES = [
    { name: "Home Arena Feed", sub: "Event Banners, Tournaments & Social Feed", href: "index.html", icon: "fa-house" },
    { name: "Explore Cups & Scrims", sub: "Browse and register for open lobbies", href: "explore.html", icon: "fa-compass" },
    { name: "My Registered Matches", sub: "Open private Room Vaults & E-Certificates", href: "matches.html", icon: "fa-trophy" },
    { name: "Clutch Reels", sub: "Full-screen vertical highlights player", href: "reels.html", icon: "fa-clapperboard" },
    { name: "Clans & Squad Voice", sub: "Manage rosters and live voice comms", href: "clans.html", icon: "fa-shield-halved" },
    { name: "Host Event Studio", sub: "Create a Tournament or Daily Scrim", href: "tournament.html", icon: "fa-satellite-dish" },
    { name: "Tickets & Wallet", sub: "View TX Passes and Points balance", href: "tickets.html", icon: "fa-ticket" },
    { name: "Player Profile", sub: "Stats, IGNs & verified badges", href: "profile.html", icon: "fa-user" }
  ];

  function toggleCommandPalette(forceOpen) {
    let pal = document.getElementById("tx-cmd-palette");
    if (!pal) {
      pal = document.createElement("div");
      pal.id = "tx-cmd-palette";
      pal.innerHTML = `
        <div class="tx-native-dialog" style="max-width:520px;">
          <div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.12);display:flex;align-items:center;gap:10px;">
            <i class="fa-solid fa-magnifying-glass" style="color:#00F2FF;font-size:13px;"></i>
            <input id="txCmdInput" type="text" placeholder="Jump to any Tournyx screen..."
              style="flex:1;background:transparent;border:none;outline:none;color:#FFFFFF;font-size:14px;">
            <span style="font-family:JetBrains Mono,monospace;font-size:10px;color:#64748B;padding:2px 6px;border-radius:6px;border:1px solid rgba(255,255,255,0.14);">ESC</span>
          </div>
          <div id="txCmdList" style="max-height:340px;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:4px;"></div>
        </div>
      `;
      pal.addEventListener("click", (e) => { if (e.target === pal) toggleCommandPalette(false); });
      document.body.appendChild(pal);
      const inp = pal.querySelector("#txCmdInput");
      inp.addEventListener("input", () => renderCmdList(inp.value));
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") pal.querySelector("#txCmdList button")?.click();
      });
    }
    const open = forceOpen !== undefined ? Boolean(forceOpen) : !pal.classList.contains("is-active");
    pal.classList.toggle("is-active", open);
    if (open) {
      const inp = pal.querySelector("#txCmdInput");
      inp.value = "";
      renderCmdList("");
      setTimeout(() => inp.focus(), 25);
    }
  }

  function renderCmdList(q) {
    const list = document.getElementById("txCmdList");
    if (!list) return;
    const needle = String(q || "").trim().toLowerCase();
    const rows = CMD_ROUTES.filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.sub.toLowerCase().includes(needle));
    list.innerHTML = rows.map((r) => `
      <button type="button" data-cmd-href="${escapeHtml(r.href)}"
        style="width:100%;text-align:left;padding:10px 12px;border-radius:12px;border:none;background:transparent;color:#FFFFFF;display:flex;align-items:center;gap:12px;cursor:pointer;">
        <i class="fa-solid ${escapeHtml(r.icon)}" style="width:20px;text-align:center;color:#D4FF00;"></i>
        <div style="min-width:0;flex:1;">
          <div style="font-size:13px;font-weight:700;">${escapeHtml(r.name)}</div>
          <div style="font-size:11px;color:#94A3B8;">${escapeHtml(r.sub)}</div>
        </div>
      </button>
    `).join("") || '<div style="padding:18px;text-align:center;font-size:12px;color:#94A3B8;">No matching screens</div>';

    list.querySelectorAll("button[data-cmd-href]").forEach((btn) => {
      btn.addEventListener("mouseenter", () => { btn.style.background = "rgba(255,255,255,0.08)"; });
      btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; });
      btn.addEventListener("click", () => {
        toggleCommandPalette(false);
        performSmoothNavigate(btn.dataset.cmdHref);
      });
    });
  }

  function initDesktopAndBatteryHooks() {
    const suspendMedia = () => {
      document.querySelectorAll("video").forEach((v) => { try { if (!v.paused) v.pause(); } catch (e) {} });
    };
    document.addEventListener("visibilitychange", () => { if (document.hidden) suspendMedia(); });

    if (isDesktopNative) {
      if (platform === "macos") {
        document.querySelector("header")?.setAttribute("data-tauri-drag-region", "");
      }
      document.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          toggleCommandPalette();
        } else if (e.key === "Escape" && document.getElementById("tx-cmd-palette")?.classList.contains("is-active")) {
          toggleCommandPalette(false);
        }
      });
    }

    if (!isCapacitor) return;
    const plugins = window.Capacitor?.Plugins || {};
    try {
      plugins.StatusBar?.setBackgroundColor?.({ color: "#050508" });
      plugins.StatusBar?.setStyle?.({ style: "DARK" });
      plugins.App?.addListener?.("appStateChange", ({ isActive }) => { if (!isActive) suspendMedia(); });

      // Deep Links + Native OAuth Callback Router
      plugins.App?.addListener?.("appUrlOpen", (event) => {
        const url = event?.url || "";
        if (!url) return;
        if (url.toLowerCase().startsWith(OAUTH_CALLBACK_URI)) {
          handleNativeOAuthCallback(url);
          return;
        }
        const resolved = resolveLocalNativeHref(url);
        if (resolved && !resolved.external) performSmoothNavigate(resolved.url);
      });

      // Android Hardware Back Button Stack
      let lastBackPress = 0;
      plugins.App?.addListener?.("backButton", () => {
        const drawer = document.getElementById("commandDrawer");
        if (drawer?.classList.contains("active") && typeof window.toggleCommandDrawer === "function") {
          window.toggleCommandDrawer(false);
          return;
        }
        const activeSheets = document.querySelectorAll(".sheet-overlay.active");
        if (activeSheets.length > 0) {
          const top = activeSheets[activeSheets.length - 1];
          if (top.id === "theaterPlayerModal" && typeof window.closeTheaterPlayer === "function") {
            window.closeTheaterPlayer();
            return;
          }
          if (top.id && typeof window.closeModal === "function") {
            window.closeModal(top.id);
            return;
          }
          top.classList.remove("active");
          document.body.classList.remove("modal-open");
          return;
        }
        const pg = currentPageFile();
        if (pg !== "index.html" && pg !== "" && pg !== "login.html") {
          if (window.history.length > 1) window.history.back();
          else performSmoothNavigate("index.html");
          return;
        }
        const now = Date.now();
        if (now - lastBackPress < 2000) plugins.App?.exitApp?.();
        else {
          lastBackPress = now;
          if (typeof window.showToast === "function") window.showToast("Press back again to exit Tournyx");
        }
      });
    } catch (e) {}
  }

  // Non-Blocking Update Check
  async function checkAppUpdateSoft() {
    if (sessionStorage.getItem("tx_update_checked") === "1") return;
    sessionStorage.setItem("tx_update_checked", "1");
    try {
      const res = await fetch(VERSION_CHECK_URL, { cache: "no-store" });
      if (!res.ok) return;
      const meta = await res.json();
      const latest = meta?.[platform]?.version || meta?.latest_version;
      const dlUrl = meta?.[platform]?.download_url || meta?.download_url;
      if (!latest || !dlUrl || !/^https?:\/\//i.test(dlUrl)) return;
      const pa = String(latest).split(".").map((n) => parseInt(n, 10) || 0);
      const pb = APP_VERSION.split(".").map((n) => parseInt(n, 10) || 0);
      const newer = (pa[0] > pb[0]) || (pa[0] === pb[0] && pa[1] > pb[1]) || (pa[0] === pb[0] && pa[1] === pb[1] && pa[2] > pb[2]);
      if (!newer) return;

      const pill = document.createElement("div");
      pill.id = "tx-update-pill";
      pill.innerHTML = `
        <i class="fa-solid fa-sparkles" style="color:#00FF7F;"></i>
        <span>Update <strong>v${escapeHtml(latest)}</strong> ready</span>
        <button id="txUpdateGo" type="button" style="padding:5px 10px;border-radius:8px;border:none;background:#D4FF00;color:#050508;font-weight:800;font-size:11px;cursor:pointer;">Update</button>
        <button id="txUpdateClose" type="button" aria-label="Dismiss" style="background:none;border:none;color:#94A3B8;cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
      `;
      document.body.appendChild(pill);
      pill.querySelector("#txUpdateGo")?.addEventListener("click", () => window.TournyxNative.openExternal(dlUrl));
      pill.querySelector("#txUpdateClose")?.addEventListener("click", () => pill.remove());
    } catch (e) {}
  }

  // =========================================================================
  // 14. BOOT SEQUENCE
  // =========================================================================
  const prefsReadyPromise = hydratePersistedNativePrefs();

  window.addEventListener("DOMContentLoaded", async () => {
    sessionStorage.removeItem("tx_force_fresh");
    document.body.classList.add("is-native-app", `platform-${platform}`, "tx-page-entering");
    setTimeout(() => document.body.classList.remove("tx-page-entering"), 220);

    suppressDuplicateLoginSplash();
    ensureLoaderDom();
    initDesktopAndBatteryHooks();

    await prefsReadyPromise;

    mountAnimatedColdSplash(() => {
      if (enforceFirstTimeLoginGate()) return;
      mountUnifiedCapsuleDock();
      mountAnimatedEventBanner();
      initPullToRefresh();
      prefetchCorePages();
      setTimeout(checkAppUpdateSoft, 3500);
    });
  });

  window.addEventListener("pageshow", () => {
    isNavigating = false;
    TournyxLoader.hide();
  });
})();
