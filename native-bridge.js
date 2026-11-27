(() => {
  "use strict";

  const APP_VERSION = "6.0.0";
  const VERSION_CHECK_URL = "https://tournyx.in/app-version.json";
  const LOGO_FALLBACK_URL =
    "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEg_20wCR-WBMpQmw3vxcYUf-vxIO1PYDJoQN_Sid3UDjA9tf0cuX0eH40jbzHoJad4cxbnjhPjqfCw1Z5V1LhgN9zFuIQC0fJjecTy3D9PFu5WjR2H1wHwTD1bUGnXY_NiApWn5gMs6velcQngSzKoP1yHzX0cVsFSUFM8zIefcbiPayY7680Kz0V0ZAAE/s1264/1000093706.png";

  const KNOWN_PAGES = new Set([
    "index", "explore", "matches", "reels", "clans", "tournament",
    "resolve", "tickets", "profile", "login", "giveaway", "offer",
    "refer", "premium", "settings", "notifications", "support",
    "about", "contact", "feedback", "leaderboard", "blogs",
    "discord", "instagram", "youtube", "privacy", "terms", "refund",
    "Globe-support", "maintenance"
  ]);

  const PERSISTED_KEYS = [
    "tournyx_user",
    "tournyx_perf_tier",
    "tournyx_theme_config",
    "tournyx_psm",
    "tx_onboard_v6_done"
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

  function doNativeHaptic(style = "light") {
    try {
      const h = window.Capacitor?.Plugins?.Haptics;
      if (h?.impact) {
        h.impact({ style: style === "heavy" ? "HEAVY" : "LIGHT" });
        return;
      }
      if (navigator.vibrate) navigator.vibrate(style === "heavy" ? 24 : 10);
    } catch (e) {}
  }

  // =========================================================================
  // 1. ZERO-DEPENDENCY INDEXEDDB SWR CACHE (INSTANT LOADS & LOW NETWORK USE)
  // =========================================================================
  const TournyxCache = (() => {
    const DB_NAME = "tournyx_app_cache_v6";
    const STORE = "kv";
    let dbPromise = null;

    function openDb() {
      if (dbPromise) return dbPromise;
      if (!window.indexedDB) return Promise.resolve(null);
      dbPromise = new Promise((resolve) => {
        try {
          const req = window.indexedDB.open(DB_NAME, 1);
          req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE)) {
              req.result.createObjectStore(STORE);
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
      return dbPromise;
    }

    return {
      async get(key) {
        const db = await openDb();
        if (!db) return null;
        return new Promise((resolve) => {
          try {
            const tx = db.transaction(STORE, "readonly");
            const req = tx.objectStore(STORE).get(String(key));
            req.onsuccess = () => {
              const rec = req.result;
              if (!rec) return resolve(null);
              if (rec.exp && Date.now() > rec.exp) return resolve(null);
              resolve(rec.val);
            };
            req.onerror = () => resolve(null);
          } catch (e) {
            resolve(null);
          }
        });
      },
      async set(key, val, ttlMs = 30 * 60 * 1000) {
        const db = await openDb();
        if (!db) return false;
        return new Promise((resolve) => {
          try {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).put({ val, exp: Date.now() + ttlMs }, String(key));
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
          } catch (e) {
            resolve(false);
          }
        });
      },
      async clear() {
        const db = await openDb();
        if (!db) return;
        try {
          db.transaction(STORE, "readwrite").objectStore(STORE).clear();
        } catch (e) {}
      }
    };
  })();

  // =========================================================================
  // 2. PERSISTENT OS STORAGE MIRROR (@capacitor/preferences)
  //    Ensures Android/iOS OS Cache Cleanup Never Wipes Logged-In User Session
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
  // 3. UNIFIED COMMON APP LOADER (window.TournyxLoader)
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
            <div style="font-size:13px;font-weight:700;color:#FFFFFF;line-height:1.2;" id="tx-loader-label">Loading Arena...</div>
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
        }, 220);
      }
    },
    show(label = "Syncing Arena...") {
      ensureLoaderDom();
      const ov = document.getElementById("tx-common-loader");
      const lbl = document.getElementById("tx-loader-label");
      if (lbl) lbl.textContent = String(label || "Syncing Arena...");
      if (ov) ov.classList.add("is-active");
      this.bar(72);
      clearTimeout(loaderAutoHideTimer);
      loaderAutoHideTimer = setTimeout(() => this.hide(), 12000);
    },
    hide() {
      clearTimeout(loaderAutoHideTimer);
      const ov = document.getElementById("tx-common-loader");
      if (ov) ov.classList.remove("is-active");
      this.bar(100);
    }
  };

  window.TournyxLoader = TournyxLoader;
  window.TournyxCache = TournyxCache;

  // Expose unified native API
  window.TournyxNative = {
    version: APP_VERSION,
    isNative,
    isCapacitor,
    isTauri,
    isAppleNative,
    platform,
    cache: TournyxCache,
    loader: TournyxLoader,
    haptic: doNativeHaptic,
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
  // 4. AUTOMATIC NATIVE GEOLOCATION BRIDGE (FIXES LOGIN LOCATION PROMPT)
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
              errorCb({ code: 1, message: "Location permission denied. Please enable Location in App Settings." });
            }
            return;
          }
          const pos = await nativeGeo.getCurrentPosition({
            enableHighAccuracy: Boolean(options?.enableHighAccuracy),
            timeout: Math.min(20000, Math.max(6000, Number(options?.timeout) || 12000)),
            maximumAge: Number(options?.maximumAge) || 60000
          });
          if (typeof successCb === "function") successCb(pos);
        } catch (err) {
          // Graceful fallback to WebView geolocation handler wired in MainActivity.java
          origGetPos(successCb, errorCb, options);
        }
      };
    }
  }

  if (!isNative) return;

  // =========================================================================
  // 5. FAST-TAP NAVIGATION MUTEX & SMOOTH DARK PAGE TRANSITIONS
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

    // Strict fast-tap mutex: blocks duplicate rapid taps from glitching the dock/WebView
    if (isNavigating) return;
    const curFull = (window.location.pathname.split("/").pop() || "index.html") + window.location.search;
    if (curFull === resolved.url) return;

    isNavigating = true;
    clearTimeout(navUnlockTimer);
    navUnlockTimer = setTimeout(() => { isNavigating = false; }, 2500);

    doNativeHaptic("light");
    TournyxLoader.bar(78);
    document.body?.classList.add("tx-page-leaving");

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ||
      document.documentElement.getAttribute("data-perf-tier") === "lite";
    const delayMs = reduceMotion ? 16 : 120;

    setTimeout(() => {
      window.location.href = resolved.url;
    }, delayMs);
  }

  // Intercept <a> taps globally (before page handlers race)
  document.addEventListener("click", (e) => {
    const anchor = e.target?.closest?.("a[href]");
    if (!anchor) return;
    if (e.defaultPrevented) return;
    const rawHref = anchor.getAttribute("href") || "";

    if (/^(intent:|freefiremax:|freefireth:|pubg:|cod:|riotclient:|whatsapp:)/i.test(rawHref)) {
      return;
    }

    const resolved = resolveLocalNativeHref(rawHref);
    if (!resolved) return;

    e.preventDefault();
    if (resolved.external) {
      window.TournyxNative.openExternal(resolved.url);
    } else {
      performSmoothNavigate(resolved.url);
    }
  }, false);

  // Intercept window.open('/reels?id=...') cleanly
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
  // 6. ANIMATED COLD-START BRAND SPLASH SCREEN (RUNS ONCE PER COLD LAUNCH)
  // =========================================================================
  function mountAnimatedColdSplash() {
    if (sessionStorage.getItem("tx_cold_boot_done") === "1") return;
    sessionStorage.setItem("tx_cold_boot_done", "1");

    const splash = document.createElement("div");
    splash.id = "tx-animated-splash";
    splash.setAttribute("aria-label", "Loading Tournyx Esports");
    splash.innerHTML = `
      <div class="tx-splash-crest-wrap">
        <div class="tx-splash-ring"></div>
        <img class="tx-splash-logo" src="favicon.png" onerror="this.onerror=null;this.src='${LOGO_FALLBACK_URL}'" alt="Tournyx Esports">
      </div>
      <div style="text-align:center;">
        <div style="font-family:Orbitron,Plus Jakarta Sans,sans-serif;font-size:18px;font-weight:900;letter-spacing:0.12em;color:#FFFFFF;">
          TOURNYX<span style="color:#D4FF00;">.</span>
        </div>
        <div style="font-family:JetBrains Mono,monospace;font-size:10px;letter-spacing:0.18em;color:#94A3B8;margin-top:4px;text-transform:uppercase;">
          ${isAppleNative ? "LIQUID GLASS ENGINE" : "ESPORTS ARENA"}
        </div>
      </div>
      <div class="tx-splash-bar-track"><div class="tx-splash-bar-fill"></div></div>
    `;
    document.body.appendChild(splash);

    // Hide static OS splash right as our 60fps animated splash takes over
    try { window.Capacitor?.Plugins?.SplashScreen?.hide?.(); } catch (e) {}

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      splash.classList.add("is-hiding");
      setTimeout(() => {
        splash.remove();
        maybeShowFirstLaunchOnboarding();
      }, 360);
    };

    // Reveal swiftly once DOM is painted (min 520ms aesthetic beat, max 1300ms fail-safe)
    const minDelay = new Promise((r) => setTimeout(r, 520));
    const maxDelay = new Promise((r) => setTimeout(r, 1300));
    const docReady = document.readyState === "complete"
      ? Promise.resolve()
      : new Promise((r) => window.addEventListener("load", r, { once: true }));

    Promise.race([Promise.all([minDelay, docReady]), maxDelay]).then(dismiss);
  }

  // =========================================================================
  // 7. 1ST-LAUNCH NATIVE PERMISSION ONBOARDING (LOCATION + NOTIFICATIONS)
  // =========================================================================
  function maybeShowFirstLaunchOnboarding() {
    if (!isMobileNative) return;
    if (localStorage.getItem("tx_onboard_v6_done") === "1") return;

    const ov = document.createElement("div");
    ov.id = "tx-onboard-overlay";
    ov.className = "is-active";
    ov.innerHTML = `
      <div class="tx-native-dialog">
        <div style="height:4px;background:linear-gradient(90deg,#00F2FF,#D4FF00,#00FF7F);"></div>
        <div style="padding:24px;display:flex;flex-direction:column;gap:16px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <img src="favicon.png" onerror="this.onerror=null;this.src='${LOGO_FALLBACK_URL}'" alt="Tournyx"
              style="width:48px;height:48px;border-radius:14px;border:1px solid rgba(212,255,0,0.45);object-fit:cover;">
            <div>
              <div style="font-size:17px;font-weight:800;color:#FFFFFF;">Welcome to Tournyx App</div>
              <div style="font-size:12px;color:#94A3B8;">Quick setup for instant login &amp; live Room IDs</div>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:10px;">
            <div style="padding:12px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);display:flex;gap:12px;align-items:flex-start;">
              <i class="fa-solid fa-location-dot" style="color:#00F2FF;margin-top:3px;"></i>
              <div>
                <div style="font-size:13px;font-weight:700;color:#FFFFFF;">Location Access (Required for Login)</div>
                <div style="font-size:11.5px;color:#94A3B8;margin-top:2px;">Verifies regional tournament eligibility &amp; prevents multi-region spoofing.</div>
              </div>
            </div>
            <div style="padding:12px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);display:flex;gap:12px;align-items:flex-start;">
              <i class="fa-solid fa-bell" style="color:#D4FF00;margin-top:3px;"></i>
              <div>
                <div style="font-size:13px;font-weight:700;color:#FFFFFF;">Room ID &amp; Match Alerts</div>
                <div style="font-size:11.5px;color:#94A3B8;margin-top:2px;">Get notified the second your tournament Room ID unlocks.</div>
              </div>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;padding-top:4px;">
            <button id="txOnboardAllowBtn" type="button"
              style="min-height:46px;border-radius:14px;border:none;background:linear-gradient(135deg,#D4FF00,#B8F500);color:#050508;font-weight:800;font-size:13px;cursor:pointer;">
              Enable Permissions &amp; Continue
            </button>
            <button id="txOnboardSkipBtn" type="button"
              style="min-height:40px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:#94A3B8;font-weight:600;font-size:12px;cursor:pointer;">
              Ask Me Later
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(ov);

    const closeOnboard = () => {
      localStorage.setItem("tx_onboard_v6_done", "1");
      ov.remove();
    };

    ov.querySelector("#txOnboardSkipBtn")?.addEventListener("click", closeOnboard);
    ov.querySelector("#txOnboardAllowBtn")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "Requesting Permissions...";
      try {
        await window.Capacitor?.Plugins?.Geolocation?.requestPermissions?.();
      } catch (err) {}
      try {
        if (window.OneSignal?.Notifications?.requestPermission) {
          await window.OneSignal.Notifications.requestPermission();
        } else if (window.Notification?.requestPermission) {
          await window.Notification.requestPermission();
        }
      } catch (err) {}
      closeOnboard();
      if (typeof window.showToast === "function") {
        window.showToast("Tournyx App permissions ready!");
      }
    });
  }

  // =========================================================================
  // 8. ADAPTIVE NETWORK & BATTERY GUARD (ZERO IDLE DRAIN)
  // =========================================================================
  function updateNetworkProfile(connType = "") {
    const navConn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const eff = String(connType || navConn?.effectiveType || "4g").toLowerCase();
    const saveData = Boolean(navConn?.saveData);
    let tier = "fast";
    if (!navigator.onLine || eff === "none") tier = "offline";
    else if (saveData || eff.includes("2g") || eff.includes("slow")) tier = "slow";
    else if (eff.includes("3g")) tier = "medium";

    document.documentElement.dataset.txNet = tier;

    // Auto-downgrade to Lite graphics on 2G / Data Saver for lag-free experience
    if (tier === "slow" && !localStorage.getItem("tournyx_perf_tier")) {
      document.documentElement.setAttribute("data-perf-tier", "lite");
    }
  }

  function bindBatteryAndLifecycleGuards() {
    updateNetworkProfile();
    navigator.connection?.addEventListener?.("change", () => updateNetworkProfile());

    try {
      window.Capacitor?.Plugins?.Network?.addListener?.("networkStatusChange", (st) => {
        updateNetworkProfile(st?.connected ? st.connectionType : "none");
      });
    } catch (e) {}

    // Freeze media when app moves to background so battery stays cool
    const suspendMedia = () => {
      document.querySelectorAll("video").forEach((v) => {
        try { if (!v.paused) v.pause(); } catch (e) {}
      });
    };

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) suspendMedia();
    });

    try {
      window.Capacitor?.Plugins?.App?.addListener?.("appStateChange", ({ isActive }) => {
        if (!isActive) suspendMedia();
      });
    } catch (e) {}
  }

  // =========================================================================
  // 9. MOBILE PULL-TO-REFRESH & DOCK AUTO-CONDENSE ON SCROLL
  // =========================================================================
  function initMobileGestures() {
    if (!isMobileNative) return;
    const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();

    // Auto-condense floating bottom dock softly when scrolling down
    if (page !== "reels.html") {
      let lastY = window.scrollY;
      let scrollTick = false;
      window.addEventListener("scroll", () => {
        if (scrollTick) return;
        scrollTick = true;
        requestAnimationFrame(() => {
          const y = window.scrollY;
          document.body.classList.toggle("tx-dock-condensed", y > 80 && y > lastY + 12);
          lastY = y;
          scrollTick = false;
        });
      }, { passive: true });
    }

    // Native Pull-to-Refresh (Disabled on reels.html so vertical snap-scroll stays 100% pure)
    if (page === "reels.html") return;

    const pill = document.createElement("div");
    pill.id = "tx-ptr-pill";
    pill.innerHTML = '<i class="fa-solid fa-rotate-right" style="color:#D4FF00;"></i><span>Pull to refresh</span>';
    document.body.appendChild(pill);

    let startY = 0;
    let pullDist = 0;
    let tracking = false;

    window.addEventListener("touchstart", (e) => {
      if (window.scrollY > 2 || document.body.classList.contains("modal-open") || isNavigating) return;
      startY = e.touches[0]?.clientY || 0;
      pullDist = 0;
      tracking = true;
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
      if (!tracking) return;
      const dy = (e.touches[0]?.clientY || 0) - startY;
      if (dy <= 10 || window.scrollY > 2) {
        if (pullDist > 0) {
          pill.classList.remove("is-visible");
          pill.style.transform = "translate3d(-50%, -64px, 0)";
        }
        pullDist = 0;
        return;
      }
      pullDist = Math.min(115, dy * 0.55);
      pill.classList.add("is-visible");
      pill.style.transform = `translate3d(-50%, ${Math.round(pullDist - 54)}px, 0)`;
      const span = pill.querySelector("span");
      if (span) span.textContent = pullDist >= 72 ? "Release to refresh" : "Pull to refresh";
    }, { passive: true });

    window.addEventListener("touchend", () => {
      if (!tracking) return;
      tracking = false;
      if (pullDist >= 72 && !isNavigating) {
        doNativeHaptic("heavy");
        TournyxLoader.show("Refreshing Arena...");
        pill.classList.remove("is-visible");
        setTimeout(() => window.location.reload(), 160);
      } else {
        pill.classList.remove("is-visible");
        pill.style.transform = "translate3d(-50%, -64px, 0)";
      }
      pullDist = 0;
    }, { passive: true });
  }

  // =========================================================================
  // 10. DESKTOP QUICK COMMAND PALETTE (Cmd+K / Ctrl+K) & MAC DRAG REGION
  // =========================================================================
  const CMD_ROUTES = [
    { name: "Home Arena Feed", sub: "Tournaments, Scrims & Social Feed", href: "index.html", icon: "fa-house" },
    { name: "Explore Cups & Scrims", sub: "Browse and register for open lobbies", href: "explore.html", icon: "fa-compass" },
    { name: "My Registered Matches", sub: "Open private Room Vaults & E-Certificates", href: "matches.html", icon: "fa-trophy" },
    { name: "Clutch Reels", sub: "Full-screen vertical highlights player", href: "reels.html", icon: "fa-clapperboard" },
    { name: "Clans & Squad Voice", sub: "Manage rosters and live voice comms", href: "clans.html", icon: "fa-shield-halved" },
    { name: "Host Event Studio", sub: "Create a Tournament or Daily Scrim", href: "tournament.html", icon: "fa-satellite-dish" },
    { name: "Tickets & Wallet", sub: "View TX Passes and Points balance", href: "tickets.html", icon: "fa-ticket" },
    { name: "Player Profile", sub: "Stats, IGNs & verified badges", href: "profile.html", icon: "fa-user" },
    { name: "Settings & About", sub: "Graphics tier, legal & app info", href: "settings.html", icon: "fa-sliders" }
  ];

  function toggleCommandPalette(forceOpen) {
    let pal = document.getElementById("tx-cmd-palette");
    if (!pal) {
      pal = document.createElement("div");
      pal.id = "tx-cmd-palette";
      pal.innerHTML = `
        <div class="tx-native-dialog" style="max-width:520px;">
          <div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;gap:10px;">
            <i class="fa-solid fa-magnifying-glass" style="color:#00F2FF;font-size:13px;"></i>
            <input id="txCmdInput" type="text" placeholder="Jump to any Tournyx screen..."
              style="flex:1;background:transparent;border:none;outline:none;color:#FFFFFF;font-size:14px;">
            <span style="font-family:JetBrains Mono,monospace;font-size:10px;color:#64748B;padding:2px 6px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);">ESC</span>
          </div>
          <div id="txCmdList" style="max-height:340px;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:4px;"></div>
        </div>
      `;
      pal.addEventListener("click", (e) => {
        if (e.target === pal) toggleCommandPalette(false);
      });
      document.body.appendChild(pal);

      const inp = pal.querySelector("#txCmdInput");
      inp.addEventListener("input", () => renderCmdList(inp.value));
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const first = pal.querySelector("#txCmdList button");
          if (first) first.click();
        }
      });
    }

    const shouldOpen = forceOpen !== undefined ? Boolean(forceOpen) : !pal.classList.contains("is-active");
    pal.classList.toggle("is-active", shouldOpen);
    if (shouldOpen) {
      const inp = pal.querySelector("#txCmdInput");
      inp.value = "";
      renderCmdList("");
      setTimeout(() => inp.focus(), 30);
    }
  }

  function renderCmdList(query) {
    const list = document.getElementById("txCmdList");
    if (!list) return;
    const q = String(query || "").trim().toLowerCase();
    const matches = CMD_ROUTES.filter((r) => !q || r.name.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q));
    list.innerHTML = matches.map((r) => `
      <button type="button" data-cmd-href="${escapeHtml(r.href)}"
        style="width:100%;text-align:left;padding:10px 12px;border-radius:12px;border:none;background:transparent;color:#FFFFFF;display:flex;align-items:center;gap:12px;cursor:pointer;">
        <i class="fa-solid ${escapeHtml(r.icon)}" style="width:20px;text-align:center;color:#D4FF00;"></i>
        <div style="min-width:0;flex:1;">
          <div style="font-size:13px;font-weight:700;">${escapeHtml(r.name)}</div>
          <div style="font-size:11px;color:#94A3B8;">${escapeHtml(r.sub)}</div>
        </div>
        <i class="fa-solid fa-arrow-right" style="font-size:11px;color:#64748B;"></i>
      </button>
    `).join("") || '<div style="padding:20px;text-align:center;font-size:12px;color:#94A3B8;">No matching screens</div>';

    list.querySelectorAll("button[data-cmd-href]").forEach((btn) => {
      btn.addEventListener("mouseenter", () => { btn.style.background = "rgba(255,255,255,0.08)"; });
      btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; });
      btn.addEventListener("click", () => {
        toggleCommandPalette(false);
        performSmoothNavigate(btn.dataset.cmdHref);
      });
    });
  }

  function initDesktopEnhancements() {
    if (!isDesktopNative) return;

    // Enable dragging macOS Overlay titlebar smoothly from top header empty space
    if (platform === "macos") {
      const hdr = document.querySelector("header");
      if (hdr) hdr.setAttribute("data-tauri-drag-region", "");
    }

    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }
      if (e.key === "Escape" && document.getElementById("tx-cmd-palette")?.classList.contains("is-active")) {
        e.preventDefault();
        toggleCommandPalette(false);
        return;
      }
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        window.history.back();
      } else if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        window.history.forward();
      }
    });
  }

  // =========================================================================
  // 11. NON-BLOCKING IN-APP UPDATE CHECKER (app-version.json)
  // =========================================================================
  function compareSemver(a, b) {
    const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
    const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) > (pb[i] || 0)) return 1;
      if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    }
    return 0;
  }

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
      if (compareSemver(latest, APP_VERSION) <= 0) return;

      const pill = document.createElement("div");
      pill.id = "tx-update-pill";
      pill.innerHTML = `
        <i class="fa-solid fa-sparkles" style="color:#00FF7F;"></i>
        <span>Update <strong>v${escapeHtml(latest)}</strong> ready</span>
        <button id="txUpdateGo" type="button" style="padding:5px 10px;border-radius:8px;border:none;background:#D4FF00;color:#050508;font-weight:800;font-size:11px;cursor:pointer;">Update</button>
        <button id="txUpdateClose" type="button" aria-label="Dismiss" style="background:none;border:none;color:#94A3B8;cursor:pointer;padding:2px 4px;"><i class="fa-solid fa-xmark"></i></button>
      `;
      document.body.appendChild(pill);
      pill.querySelector("#txUpdateGo")?.addEventListener("click", () => window.TournyxNative.openExternal(dlUrl));
      pill.querySelector("#txUpdateClose")?.addEventListener("click", () => pill.remove());
    } catch (e) {}
  }

  // =========================================================================
  // 12. CAPACITOR STATUS BAR, DEEP LINKS & ANDROID HARDWARE BACK BUTTON
  // =========================================================================
  function initCapacitorSystemHooks() {
    if (!isCapacitor) return;
    const plugins = window.Capacitor?.Plugins || {};

    try {
      plugins.StatusBar?.setBackgroundColor?.({ color: "#050508" });
      plugins.StatusBar?.setStyle?.({ style: "DARK" });
    } catch (e) {}

    // Deep Link Router (https://tournyx.in/explore?tournament=... -> explore.html?tournament=...)
    try {
      plugins.App?.addListener?.("appUrlOpen", (event) => {
        if (!event?.url) return;
        const resolved = resolveLocalNativeHref(event.url);
        if (resolved && !resolved.external) {
          performSmoothNavigate(resolved.url);
        }
      });
    } catch (e) {}

    // Android Hardware Back Button Stack
    let lastBackPress = 0;
    try {
      plugins.App?.addListener?.("backButton", () => {
        if (document.getElementById("tx-onboard-overlay")) {
          document.getElementById("tx-onboard-overlay").remove();
          localStorage.setItem("tx_onboard_v6_done", "1");
          return;
        }

        const drawer = document.getElementById("commandDrawer");
        if (drawer?.classList.contains("active") && typeof window.toggleCommandDrawer === "function") {
          window.toggleCommandDrawer(false);
          return;
        }

        const activeSheets = document.querySelectorAll(".sheet-overlay.active");
        if (activeSheets.length > 0) {
          if (typeof window.handleUniversalBack === "function") {
            window.handleUniversalBack(true);
            return;
          }
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

        const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
        if (page !== "index.html" && page !== "") {
          if (window.history.length > 1) window.history.back();
          else performSmoothNavigate("index.html");
          return;
        }

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
  }

  // =========================================================================
  // 13. BOOT SEQUENCE
  // =========================================================================
  hydratePersistedNativePrefs();

  window.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("is-native-app", `platform-${platform}`, "tx-page-entering");
    setTimeout(() => document.body.classList.remove("tx-page-entering"), 260);

    ensureLoaderDom();
    mountAnimatedColdSplash();
    bindBatteryAndLifecycleGuards();
    initCapacitorSystemHooks();
    initMobileGestures();
    initDesktopEnhancements();
    setTimeout(checkAppUpdateSoft, 3500);
  });

  window.addEventListener("pageshow", () => {
    isNavigating = false;
    document.body?.classList.remove("tx-page-leaving");
    TournyxLoader.hide();
  });
})();
