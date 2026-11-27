(() => {
  "use strict";

  if (window.location.pathname.toLowerCase().endsWith("app-shell.html")) return;

  const APP_VERSION = "8.0.0";
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

  const PERSISTED_KEYS = [
    "tournyx_user",
    SUPABASE_AUTH_STORAGE_KEY,
    "tournyx_perf_tier",
    "tournyx_theme_config",
    "tournyx_psm",
    "tx_onboard_v6_done",
    "tx_perms_boot_v2"
  ];

  const DESKTOP_SIDEBAR_ITEMS = [
    { id: "index", label: "Home Arena", href: "index.html", icon: "fa-house" },
    { id: "explore", label: "Explore Cups", href: "explore.html", icon: "fa-compass" },
    { id: "matches", label: "My Matches", href: "matches.html", icon: "fa-trophy" },
    { id: "reels", label: "Clutch Reels", href: "reels.html", icon: "fa-clapperboard" },
    { id: "clans", label: "Clans & Voice", href: "clans.html", icon: "fa-shield-halved" },
    { id: "tournament", label: "Host Studio", href: "tournament.html", icon: "fa-satellite-dish" },
    { id: "tickets", label: "Tickets & Wallet", href: "tickets.html", icon: "fa-ticket" },
    { id: "profile", label: "Player Profile", href: "profile.html", icon: "fa-user" },
    { id: "settings", label: "Settings", href: "settings.html", icon: "fa-sliders" }
  ];

  const topWin = (() => {
    try { return window.top || window; } catch (e) { return window; }
  })();

  const capObj = window.Capacitor || topWin.Capacitor || null;
  const isCapacitor = Boolean(capObj?.isNativePlatform?.());
  const isTauri = Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__ || topWin.__TAURI_INTERNALS__ || topWin.__TAURI__);
  const isNative = isCapacitor || isTauri;
  const shellApi = (() => {
    try { return (window.parent && window.parent !== window && window.parent.TournyxShell) ? window.parent.TournyxShell : null; }
    catch (e) { return null; }
  })();
  const isInShell = Boolean(shellApi);
  const androidBridge = (() => {
    try { return window.TournyxAndroidBridge || topWin.TournyxAndroidBridge || null; }
    catch (e) { return null; }
  })();

  function detectPlatform() {
    if (isCapacitor) return (capObj.getPlatform?.() || "android").toLowerCase();
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

  // Boot top-level native launches inside persistent app-shell.html
  if (isNative && window.self === window.top && !sessionStorage.getItem("tx_shell_bypass")) {
    const file = window.location.pathname.split("/").pop() || "index.html";
    const target = `${file}${window.location.search || ""}${window.location.hash || ""}`;
    window.location.replace(`app-shell.html?page=${encodeURIComponent(target)}`);
    return;
  }

  document.documentElement.dataset.txPlatform = platform;
  document.documentElement.dataset.txNative = isNative ? "true" : "false";

  function syncPerfTier(tierOverride) {
    let t = tierOverride || localStorage.getItem("tournyx_perf_tier") ||
      (topWin?.document?.documentElement?.getAttribute("data-perf-tier")) || "";
    if (!t) {
      const mem = Number(navigator.deviceMemory) || 4;
      const cores = Number(navigator.hardwareConcurrency) || 4;
      const saveData = Boolean(navigator.connection?.saveData);
      const reduce = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
      if (reduce || saveData || mem <= 2 || cores <= 2) t = "lite";
      else if (mem >= 6 && cores >= 6) t = "ultra";
      else t = "balanced";
    }
    document.documentElement.setAttribute("data-perf-tier", t);
    return t;
  }
  syncPerfTier();
  window.addEventListener("tournyx:perf-tier-change", (e) => syncPerfTier(e?.detail?.tier));

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"'`=/]/g, (s) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "/": "&#x2F;", "`": "&#x60;", "=": "&#x3D;"
    }[s]));
  }

  function currentPageFile() {
    return (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  }

  function isTrustedOrigin(origin) {
    if (!origin || origin === "null" || origin === window.location.origin) return true;
    try {
      const h = new URL(origin).hostname.toLowerCase();
      return h === "app.tournyx.in" || h === "tournyx.in" || h === "www.tournyx.in" || h === "localhost" || h === "tauri.localhost";
    } catch (e) { return false; }
  }

  function doNativeHaptic(style = "light") {
    try {
      const h = capObj?.Plugins?.Haptics;
      if (h?.impact) { h.impact({ style: style === "heavy" ? "HEAVY" : "LIGHT" }); return; }
      if (navigator.vibrate) navigator.vibrate(style === "heavy" ? 22 : 9);
    } catch (e) {}
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
        try { capObj?.Plugins?.Preferences?.set?.({ key, value: String(value) }); } catch (e) {}
      }
    };
    Storage.prototype.removeItem = function(key) {
      origRemoveItem.call(this, key);
      if (this === window.localStorage && PERSISTED_KEYS.includes(key)) {
        try { capObj?.Plugins?.Preferences?.remove?.({ key }); } catch (e) {}
      }
    };
  }

  // =========================================================================
  // 2. UNIFIED 360° INWARD-ABSORBING LOADER (ZERO TOP LOADING LINE)
  // =========================================================================
  let loaderAutoHideTimer = null;

  function ensureLocalAbsorbLoader() {
    if (!document.body || isInShell) return;
    if (!document.getElementById("tx-common-loader")) {
      const ov = document.createElement("div");
      ov.id = "tx-common-loader";
      ov.setAttribute("role", "status");
      const rays = Array.from({ length: 24 }, (_, i) => `<span class="tx-absorb-ray" style="--i:${i}"></span>`).join("");
      ov.innerHTML = `
        <div class="tx-absorb-stage">
          <div class="tx-absorb-core-glow" aria-hidden="true"></div>
          <div class="tx-absorb-ring" aria-hidden="true"></div>
          <div class="tx-absorb-ring is-second" aria-hidden="true"></div>
          <div class="tx-absorb-streams" aria-hidden="true">${rays}</div>
          <img class="tx-absorb-logo" src="logo-transparent.png" onerror="this.onerror=null;this.src='favicon.png'" alt="Tournyx">
        </div>
        <div id="tx-loader-label" class="tx-burst-label">Syncing Arena</div>
      `;
      document.body.appendChild(ov);
    }
  }

  const TournyxLoader = {
    bar() {},
    show(label = "Syncing Arena") {
      if (isInShell) {
        window.parent.postMessage({ type: "TX_LOADER", active: true, label: String(label || "Syncing Arena") }, window.location.origin);
        return;
      }
      ensureLocalAbsorbLoader();
      const ov = document.getElementById("tx-common-loader");
      const lbl = document.getElementById("tx-loader-label");
      if (lbl) lbl.textContent = String(label || "Syncing Arena");
      if (ov) ov.classList.add("is-active");
      clearTimeout(loaderAutoHideTimer);
      loaderAutoHideTimer = setTimeout(() => this.hide(), 7000);
    },
    hide() {
      if (isInShell) {
        window.parent.postMessage({ type: "TX_LOADER", active: false }, window.location.origin);
        return;
      }
      clearTimeout(loaderAutoHideTimer);
      document.getElementById("tx-common-loader")?.classList.remove("is-active");
    }
  };

  window.TournyxLoader = TournyxLoader;

  // =========================================================================
  // 3. PERSISTENT DESKTOP LEFT SIDEBAR (WINDOWS, macOS & WEB >= 1024px)
  // =========================================================================
  function mountDesktopPersistentSidebar() {
    const page = currentPageFile();
    if (page === "login.html") return;
    if (document.getElementById("tx-desktop-sidebar")) return;

    const activeId = page.replace(/\.html$/i, "") || "index";
    const curTier = document.documentElement.getAttribute("data-perf-tier") || "balanced";
    const kbdShortcut = platform === "macos" || /Mac/i.test(navigator.userAgent) ? "⌘K" : "Ctrl K";

    const aside = document.createElement("aside");
    aside.id = "tx-desktop-sidebar";
    aside.setAttribute("aria-label", "Tournyx Desktop Navigation");
    aside.innerHTML = `
      <a href="index.html" class="tx-sb-brand">
        <img src="logo-transparent.png" onerror="this.onerror=null;this.src='favicon.png'" alt="Tournyx">
        <div>
          <div class="tx-sb-brand-name">TOURNYX</div>
          <div style="font-size:9px;letter-spacing:0.18em;color:#38BDF8;font-family:JetBrains Mono,monospace;">ESPORTS ARENA</div>
        </div>
      </a>
      <button id="txSbCmdBtn" type="button" class="tx-sb-search-btn">
        <span><i class="fa-solid fa-magnifying-glass" style="margin-right:8px;color:#38BDF8;"></i>Quick Jump</span>
        <span style="font-family:JetBrains Mono,monospace;font-size:10px;padding:2px 6px;border-radius:6px;border:1px solid rgba(255,255,255,0.14);">${kbdShortcut}</span>
      </button>
      <nav class="tx-sb-nav">
        ${DESKTOP_SIDEBAR_ITEMS.map((item) => `
          <a href="${item.href}" class="tx-sb-link ${activeId === item.id ? "is-active" : ""}" ${activeId === item.id ? 'aria-current="page"' : ""}>
            <i class="fa-solid ${item.icon}"></i>
            <span>${item.label}</span>
          </a>
        `).join("")}
      </nav>
      <div class="tx-sb-footer">
        <div class="tx-sb-tier-pill">
          <span><i class="fa-solid fa-gauge-high" style="color:#8B5CF6;margin-right:6px;"></i>Graphics</span>
          <button id="txSbTierCycle" type="button"
            style="background:rgba(139,92,246,0.22);border:1px solid rgba(139,92,246,0.45);color:#E2E8F0;font-size:10px;font-weight:800;text-transform:uppercase;padding:3px 8px;border-radius:8px;cursor:pointer;">
            ${escapeHtml(curTier)}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(aside);
    document.body.classList.add("tx-has-desktop-sidebar");

    aside.querySelector("#txSbCmdBtn")?.addEventListener("click", () => toggleCommandPalette(true));
    aside.querySelector("#txSbTierCycle")?.addEventListener("click", (e) => {
      const order = ["ultra", "balanced", "lite"];
      const now = document.documentElement.getAttribute("data-perf-tier") || "balanced";
      const next = order[(order.indexOf(now) + 1) % order.length];
      window.TournyxNative?.setPerfTier?.(next);
      e.currentTarget.textContent = next;
    });
  }

  // =========================================================================
  // 4. DIRECT NATIVE ANDROID & iOS GEOLOCATION ENGINE
  // =========================================================================
  const pendingLocationQueue = [];

  if (platform === "android" && androidBridge?.requestLocationAndFetch) {
    window.addEventListener("tournyx:native-location", (e) => {
      const d = e?.detail || {};
      const pos = {
        coords: {
          latitude: Number(d.latitude),
          longitude: Number(d.longitude),
          accuracy: Number(d.accuracy) || 25,
          altitude: null, altitudeAccuracy: null, heading: null, speed: null
        },
        timestamp: Number(d.timestamp) || Date.now()
      };
      while (pendingLocationQueue.length > 0) {
        const item = pendingLocationQueue.shift();
        clearTimeout(item.timer);
        try { if (typeof item.successCb === "function") item.successCb(pos); } catch (err) {}
      }
    });

    window.addEventListener("tournyx:native-location-error", (e) => {
      const d = e?.detail || {};
      const errObj = { code: Number(d.code) || 1, message: String(d.message || "Location permission required.") };
      if (typeof window.showToast === "function" && d.message) window.showToast(d.message, true);
      while (pendingLocationQueue.length > 0) {
        const item = pendingLocationQueue.shift();
        clearTimeout(item.timer);
        try { if (typeof item.errorCb === "function") item.errorCb(errObj); } catch (err) {}
      }
    });

    const nativeAndroidGetCurrentPosition = function(successCb, errorCb, options) {
      const timeoutMs = Math.min(20000, Math.max(9000, Number(options?.timeout) || 14000));
      const entry = {
        successCb,
        errorCb,
        timer: setTimeout(() => {
          const idx = pendingLocationQueue.indexOf(entry);
          if (idx >= 0) pendingLocationQueue.splice(idx, 1);
          if (typeof errorCb === "function") errorCb({ code: 3, message: "Location request timed out. Please retry." });
        }, timeoutMs)
      };
      pendingLocationQueue.push(entry);
      try {
        androidBridge.requestLocationAndFetch();
      } catch (err) {
        clearTimeout(entry.timer);
        const idx = pendingLocationQueue.indexOf(entry);
        if (idx >= 0) pendingLocationQueue.splice(idx, 1);
        if (typeof errorCb === "function") errorCb({ code: 2, message: "Could not start native location." });
      }
    };

    try {
      if (window.Geolocation?.prototype) {
        Object.defineProperty(window.Geolocation.prototype, "getCurrentPosition", {
          configurable: true, writable: true, value: nativeAndroidGetCurrentPosition
        });
      }
      if (navigator.geolocation) navigator.geolocation.getCurrentPosition = nativeAndroidGetCurrentPosition;
    } catch (e) {}

    if (navigator.permissions?.query) {
      const origPermQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = function(desc) {
        if (desc?.name === "geolocation") {
          return Promise.resolve({ state: androidBridge.hasLocationAccess?.() ? "granted" : "prompt", onchange: null });
        }
        return origPermQuery(desc);
      };
    }
  } else if (platform === "ios" && isCapacitor && navigator.geolocation) {
    const nativeGeo = capObj?.Plugins?.Geolocation;
    const origGetPos = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    if (nativeGeo?.getCurrentPosition) {
      navigator.geolocation.getCurrentPosition = async function(successCb, errorCb, options) {
        try {
          let perm = await nativeGeo.checkPermissions?.();
          if ((perm?.location || perm?.coarseLocation) !== "granted") perm = await nativeGeo.requestPermissions?.();
          if ((perm?.location || perm?.coarseLocation) === "denied") {
            if (typeof errorCb === "function") errorCb({ code: 1, message: "Location permission denied." });
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
  // 5. TRANSPARENT SUPABASE SWR CACHE (ZERO BLANK SCREENS ON TAB SWITCH)
  // =========================================================================
  const SWR_PREFIX = "tx_swr_v8:";
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
      const keys = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(SWR_PREFIX)) keys.push(k);
      }
      keys.forEach((k) => sessionStorage.removeItem(k));
    } catch (e) {}
  }

  function readSwr(key) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (!p || typeof p.body !== "string") return null;
      if (Date.now() - p.ts > SWR_TTL_MS) { sessionStorage.removeItem(key); return null; }
      return p;
    } catch (e) { return null; }
  }

  function writeSwr(key, body, ct) {
    if (!body || body.length > SWR_MAX_BYTES) return;
    try {
      const keys = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(SWR_PREFIX)) keys.push(k);
      }
      if (keys.length >= SWR_MAX_ENTRIES) sessionStorage.removeItem(keys[0]);
      sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), ct: ct || "application/json; charset=utf-8", body }));
    } catch (e) { clearSwrCache(); }
  }

  if (isNative && typeof window.fetch === "function") {
    const origFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
      const urlStr = typeof input === "string" ? input : (input?.url || "");
      const method = String(init?.method || (typeof input !== "string" ? input?.method : "GET") || "GET").toUpperCase();

      if (!urlStr.includes(SUPABASE_HOST) || !urlStr.includes("/rest/v1/")) return origFetch(input, init);

      const isReadGet = method === "GET";
      const isReadRpc = method === "POST" && /\/rest\/v1\/rpc\/get_[a-z0-9_]+/i.test(urlStr);

      if (!isReadGet && !isReadRpc) {
        clearSwrCache();
        return origFetch(input, init);
      }

      const bodySig = isReadRpc && typeof init?.body === "string" ? init.body : "";
      const cacheKey = swrKeyHash(`${method}|${urlStr}|${bodySig}`);
      const forceFresh = sessionStorage.getItem("tx_force_fresh") === "1";

      const refreshInBg = () => origFetch(input, init).then((resp) => {
        if (resp && resp.ok) {
          resp.clone().text().then((txt) => writeSwr(cacheKey, txt, resp.headers.get("content-type"))).catch(() => {});
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
  // 6. 1-TAP NATIVE OAUTH (CHROME CUSTOM TABS / ASWebAuth + AUTO FINALIZER)
  // =========================================================================
  function installSupabaseOAuthHook() {
    if (!isNative) return;

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
            if (isCapacitor) {
              try {
                TournyxLoader.show("Opening Account Picker");
                const opts = Object.assign({}, credentials?.options || {}, {
                  redirectTo: `${OAUTH_CALLBACK_URI}?source=app`,
                  skipBrowserRedirect: true
                });
                const res = await origOAuth(Object.assign({}, credentials, { options: opts }));
                if (res?.data?.url) {
                  if (platform === "android" && androidBridge?.openOAuthUrl) {
                    androidBridge.openOAuthUrl(res.data.url);
                    setTimeout(() => TournyxLoader.hide(), 900);
                  } else if (isInShell) {
                    window.parent.postMessage({ type: "TX_OPEN_OAUTH", url: res.data.url }, window.location.origin);
                  } else if (capObj?.Plugins?.Browser?.open) {
                    await capObj.Plugins.Browser.open({ url: res.data.url, toolbarColor: "#050508" });
                    setTimeout(() => TournyxLoader.hide(), 900);
                  }
                } else {
                  TournyxLoader.hide();
                }
                return res;
              } catch (err) {
                TournyxLoader.hide();
                return origOAuth(credentials);
              }
            }

            if (isTauri) {
              const opts = Object.assign({}, credentials?.options || {}, {
                redirectTo: `${window.location.origin}/login.html?native_oauth=1`
              });
              return origOAuth(Object.assign({}, credentials, { options: opts }));
            }
            return origOAuth(credentials);
          };

          // Finalize PKCE ?code= OR #access_token= handoff when returning from Chrome Custom Tabs
          const urlParams = new URLSearchParams(window.location.search);
          const hashParams = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
          const pkceCode = urlParams.get("code");
          const accTok = hashParams.get("access_token");
          const refTok = hashParams.get("refresh_token");

          if (urlParams.get("native_oauth") === "1" && !client.auth.__txOAuthFinalized) {
            client.auth.__txOAuthFinalized = true;
            const persistAndFinish = () => {
              const tok = localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
              if (tok) capObj?.Plugins?.Preferences?.set?.({ key: SUPABASE_AUTH_STORAGE_KEY, value: tok });
              TournyxLoader.hide();
            };
            if (pkceCode && typeof client.auth.exchangeCodeForSession === "function") {
              client.auth.exchangeCodeForSession(pkceCode).then(persistAndFinish).catch(() => TournyxLoader.hide());
            } else if (accTok && refTok && typeof client.auth.setSession === "function") {
              client.auth.setSession({ access_token: accTok, refresh_token: refTok }).then(persistAndFinish).catch(() => TournyxLoader.hide());
            } else {
              TournyxLoader.hide();
            }
          }
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
          set(val) { _sb = val; wrapCreateClient(val); }
        });
      } catch (e) {}
    }
  }
  installSupabaseOAuthHook();

  // =========================================================================
  // 7. TRUE TWO-WAY CLAN VOICE SYNC & ANDROID SCREEN SHARING (clans.html ONLY)
  // =========================================================================
  const liveMicTracks = new Set();
  let voiceHangupCooldownUntil = 0;
  let applyingNativeVoiceSync = false;
  let localSpeakerOn = true;
  let screenSharePending = null;
  let screenCanvas = null;
  let screenCtx = null;
  let screenStream = null;

  function detectActiveRoomName() {
    try {
      const explicit = document.querySelector("[data-room-title], #voiceRoomTitle, #activeRoomTitle, .voice-room-title");
      const t1 = explicit?.textContent?.trim();
      if (t1 && t1.length >= 2) return t1.slice(0, 42);

      // Detect active voice channel label (e.g., "Scrim Comms #1") inside Clan Voice modal or header
      const headings = document.querySelectorAll("#voiceRoomModal h2, #voiceRoomModal h3, #clanVoiceModal h2, #clanVoiceModal h3, .voice-room-header span");
      for (const h of headings) {
        const txt = (h.textContent || "").trim();
        if (txt.length >= 3 && txt.length <= 42 && !/^(OPEN|LOCKED|00:|LIVE)$/i.test(txt)) return txt;
      }
    } catch (e) {}
    return "Tournyx Squad Voice";
  }

  function findVoiceControlButton(kind) {
    const btns = Array.from(document.querySelectorAll("button"));
    for (const btn of btns) {
      const r = btn.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const txt = (btn.textContent || "").trim().toLowerCase();
      if (kind === "mute" && (txt === "mute" || txt === "unmute" || txt === "muted")) return btn;
      if (kind === "speaker" && (txt === "speaker" || txt === "earpiece" || txt === "speaker on" || txt === "speaker off")) return btn;
      if (kind === "leave" && (txt === "leave" || txt === "leave room" || txt === "hang up")) return btn;
    }
    return null;
  }

  function readInPageMuteState() {
    const alive = Array.from(liveMicTracks).filter((t) => t.readyState === "live");
    if (alive.length > 0) return alive.every((t) => !t.enabled);
    const btn = findVoiceControlButton("mute");
    if (btn) {
      const txt = (btn.textContent || "").trim().toLowerCase();
      if (txt === "unmute" || txt === "muted") return true;
    }
    return false;
  }

  function pushVoiceStateToShell() {
    if (currentPageFile() !== "clans.html") return;
    const alive = Array.from(liveMicTracks).filter((t) => t.readyState === "live");
    const isActive = alive.length > 0 && Date.now() >= voiceHangupCooldownUntil;
    const isMuted = isActive ? readInPageMuteState() : false;

    const payload = {
      active: isActive,
      roomName: detectActiveRoomName(),
      muted: isMuted,
      speaker: localSpeakerOn
    };

    if (shellApi) shellApi.setVoiceState(payload);
    else if (androidBridge) {
      try {
        if (isActive) {
          if (!androidBridge.isVoiceServiceActive?.()) androidBridge.startVoiceService(payload.roomName);
          androidBridge.updateVoiceService(payload.roomName, payload.muted, payload.speaker);
        } else {
          androidBridge.stopVoiceService();
        }
      } catch (e) {}
    }
  }

  function forceStopLocalVoiceTracks() {
    voiceHangupCooldownUntil = Date.now() + 5000;
    liveMicTracks.forEach((t) => { try { t.stop(); } catch (err) {} });
    liveMicTracks.clear();
    try { androidBridge?.stopScreenShare?.(); } catch (err) {}
    try { androidBridge?.stopVoiceService?.(); } catch (err) {}
    if (shellApi) shellApi.setVoiceState({ active: false, muted: false });
  }

  function installNativeMediaAndVoiceBridge() {
    if (!isNative || !navigator.mediaDevices) return;

    if (currentPageFile() === "clans.html" && typeof navigator.mediaDevices.getUserMedia === "function" && !navigator.mediaDevices.__txGumWrapped) {
      const origGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.__txGumWrapped = true;

      navigator.mediaDevices.getUserMedia = async function(constraints) {
        const stream = await origGum(constraints);
        if (constraints?.audio && stream && Date.now() >= voiceHangupCooldownUntil) {
          stream.getAudioTracks().forEach((track) => {
            liveMicTracks.add(track);
            const onEnd = () => { liveMicTracks.delete(track); pushVoiceStateToShell(); };
            track.addEventListener("ended", onEnd, { once: true });
            const origStop = track.stop.bind(track);
            track.stop = function() { origStop(); onEnd(); };
          });
          setTimeout(pushVoiceStateToShell, 180);
        }
        return stream;
      };
    }

    // Android MediaProjection Screen Sharing Polyfill
    if (platform === "android" && androidBridge?.requestScreenShare) {
      navigator.mediaDevices.getDisplayMedia = function() {
        return new Promise((resolve, reject) => {
          if (screenSharePending) {
            reject(new DOMException("Screen share already in progress", "AbortError"));
            return;
          }
          screenSharePending = { resolve, reject };
          androidBridge.requestScreenShare();
        });
      };

      window.addEventListener("tournyx:screen-share-ready", (e) => {
        if (!screenSharePending) return;
        const { resolve, reject } = screenSharePending;
        screenSharePending = null;
        try {
          const w = Number(e?.detail?.width) || 540;
          const h = Number(e?.detail?.height) || 960;
          screenCanvas = document.createElement("canvas");
          screenCanvas.width = w;
          screenCanvas.height = h;
          screenCtx = screenCanvas.getContext("2d");
          screenCtx.fillStyle = "#050508";
          screenCtx.fillRect(0, 0, w, h);

          screenStream = screenCanvas.captureStream(12);
          screenStream.getVideoTracks().forEach((vt) => {
            const origStop = vt.stop.bind(vt);
            vt.stop = function() {
              origStop();
              try { androidBridge.stopScreenShare(); } catch (err) {}
              screenStream = null; screenCanvas = null; screenCtx = null;
            };
          });
          resolve(screenStream);
        } catch (err) { reject(err); }
      });

      window.addEventListener("tournyx:screen-share-denied", () => {
        if (!screenSharePending) return;
        const { reject } = screenSharePending;
        screenSharePending = null;
        reject(new DOMException("Screen sharing permission denied", "NotAllowedError"));
      });

      window.addEventListener("tournyx:screen-frame", (e) => {
        if (!screenCtx || !screenCanvas || !e?.detail?.jpg) return;
        const img = new Image();
        img.onload = () => {
          try { screenCtx.drawImage(img, 0, 0, screenCanvas.width, screenCanvas.height); } catch (err) {}
        };
        img.src = "data:image/jpeg;base64," + e.detail.jpg;
      });
    }

    if (currentPageFile() === "clans.html") {
      // Push In-App Mute / Speaker / Leave Clicks Live to Android Notification & Floating Pill
      document.addEventListener("click", (e) => {
        if (applyingNativeVoiceSync) return;
        const btn = e.target?.closest?.("button");
        if (!btn) return;
        const txt = (btn.textContent || "").trim().toLowerCase();
        if (txt === "leave" || txt === "leave room" || txt === "hang up") {
          forceStopLocalVoiceTracks();
        } else if (txt === "mute" || txt === "unmute" || txt === "muted") {
          setTimeout(pushVoiceStateToShell, 90);
        } else if (txt === "speaker" || txt === "earpiece" || txt === "speaker on" || txt === "speaker off") {
          localSpeakerOn = !localSpeakerOn;
          try { androidBridge?.setSpeakerphone?.(localSpeakerOn); } catch (err) {}
          setTimeout(pushVoiceStateToShell, 90);
        }
      }, true);

      // Receive Notification Shade / Floating Pill Actions -> Update clans.html UI & Audio in Lockstep
      window.addEventListener("message", (e) => {
        if (!isTrustedOrigin(e.origin)) return;
        const msg = e?.data;
        if (!msg || msg.type !== "TX_SHELL_VOICE_ACTION") return;

        applyingNativeVoiceSync = true;
        try {
          if (msg.action === "mute") {
            const wantMuted = Boolean(msg.state?.muted);
            const currentlyMuted = readInPageMuteState();
            const muteBtn = findVoiceControlButton("mute");
            if (muteBtn && currentlyMuted !== wantMuted) {
              muteBtn.click();
            }
            // Enforce track state even if page handler differs
            liveMicTracks.forEach((t) => { if (t.readyState === "live") t.enabled = !wantMuted; });
          } else if (msg.action === "speaker") {
            const wantSpeaker = Boolean(msg.state?.speaker);
            if (localSpeakerOn !== wantSpeaker) {
              localSpeakerOn = wantSpeaker;
              const spkBtn = findVoiceControlButton("speaker");
              if (spkBtn) spkBtn.click();
            }
          } else if (msg.action === "leave") {
            forceStopLocalVoiceTracks();
            const leaveBtn = findVoiceControlButton("leave");
            if (leaveBtn) leaveBtn.click();
          }
        } catch (err) {
        } finally {
          setTimeout(() => { applyingNativeVoiceSync = false; }, 140);
        }
      });
    }
  }
  installNativeMediaAndVoiceBridge();

  // =========================================================================
  // 8. YOUTUBE + INSTAGRAM HYBRID DOCK CONTROLLER (EXPLICIT OVERLAYS ONLY!)
  //    - Fixes Bug Where Home Background Wrapper Hid Bottom Dock Permanently
  //    - Scroll Down -> Dock Smoothly Hides; Scroll Up -> Dock Returns Immediately
  // =========================================================================
  function initHybridDockAndScrollController() {
    if (!isInShell || !isMobileNative) return;
    const page = currentPageFile();

    // A. Explicit-Only Interactive Overlay & Keyboard Observer (Zero False Positives on Home!)
    let lastOverlayHidden = null;
    let scanTimer = null;

    const isVisibleEl = (el) => {
      if (!el || el.classList.contains("hidden")) return false;
      const st = window.getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 40 && r.height > 40;
    };

    const detectExplicitOverlay = () => {
      // 1. Mobile keyboard open on editable input
      const ae = document.activeElement;
      if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && !ae.readOnly && !ae.disabled) {
        const t = String(ae.type || "").toLowerCase();
        if (!["checkbox", "radio", "range", "button", "submit"].includes(t)) return true;
      }

      // 2. Explicit modal-open class or known active drawers/modals/players/voice rooms
      if (document.body.classList.contains("modal-open")) return true;

      const explicitSelectors = [
        "#tx-yt-player-overlay.is-active",
        "#commandDrawer.active", ".command-drawer.active",
        ".sheet-overlay.active", ".modal.active", ".modal.show",
        "#theaterPlayerModal.active", "#videoModal.active", "#postVideoModal.active",
        "#voiceRoomModal.active", "#clanVoiceModal.active",
        "[data-tx-modal='open']", "[role='dialog'][aria-modal='true']"
      ];
      for (const sel of explicitSelectors) {
        const el = document.querySelector(sel);
        if (el && isVisibleEl(el)) return true;
      }

      // 3. Catch custom video / voice / modal overlays explicitly named modal/drawer/sheet/player/voice
      //    (NEVER scans generic fixed background divs!)
      const namedOverlays = document.querySelectorAll(
        '[id*="Modal"], [id*="modal"], [id*="Drawer"], [id*="drawer"], [id*="VoiceRoom"], [id*="Player"]'
      );
      for (const el of namedOverlays) {
        if (el.id === "tx-common-loader" || el.id === "tx-animated-splash") continue;
        if (!isVisibleEl(el)) continue;
        const st = window.getComputedStyle(el);
        if (st.position === "fixed" && (parseInt(st.zIndex, 10) || 0) >= 40) {
          return true;
        }
      }
      return false;
    };

    const scheduleOverlayScan = () => {
      if (scanTimer) return;
      scanTimer = setTimeout(() => {
        scanTimer = null;
        const hidden = detectExplicitOverlay();
        if (hidden !== lastOverlayHidden) {
          lastOverlayHidden = hidden;
          window.parent.postMessage({ type: "TX_OVERLAY_STATE", hidden }, window.location.origin);
        }
      }, 65);
    };

    const obs = new MutationObserver(scheduleOverlayScan);
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"]
    });
    document.addEventListener("focusin", scheduleOverlayScan, true);
    document.addEventListener("focusout", () => setTimeout(scheduleOverlayScan, 110), true);
    document.addEventListener("click", () => setTimeout(scheduleOverlayScan, 80), true);
    scheduleOverlayScan();

    // B. YouTube-Style Smooth Scroll-Down Hide / Scroll-Up Reveal
    if (page !== "reels.html" && page !== "login.html") {
      let lastY = window.scrollY;
      let scrollHidden = false;
      let ticking = false;

      window.addEventListener("scroll", () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const y = Math.max(0, window.scrollY);
          const dy = y - lastY;
          const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          const nearTop = y <= 24;
          const nearBottom = maxScroll > 120 && y >= maxScroll - 24;

          let nextHidden = scrollHidden;
          if (nearTop || nearBottom || dy < -10) nextHidden = false;
          else if (y > 56 && dy > 14) nextHidden = true;

          if (nextHidden !== scrollHidden) {
            scrollHidden = nextHidden;
            window.parent.postMessage({ type: "TX_DOCK_SCROLL", hidden: scrollHidden }, window.location.origin);
          }
          lastY = y;
          ticking = false;
        });
      }, { passive: true });
    }
  }

  // =========================================================================
  // 9. FIXED MY CLAN DASHBOARD -> ALL CLANS / MY CLANS BACK HANDLER
  // =========================================================================
  if (currentPageFile() === "clans.html") {
    window.__txHandleClanBack = function() {
      const isVis = (el) => {
        if (!el || el.classList.contains("hidden")) return false;
        const st = window.getComputedStyle(el);
        return st.display !== "none" && st.visibility !== "hidden" && Number(st.opacity) > 0 && el.getBoundingClientRect().height > 8;
      };

      // 1. If a Clan Voice Room modal is expanded, collapse/minimize it first
      const voiceCollapse = document.querySelector("#voiceRoomModal .fa-chevron-down, #clanVoiceModal .fa-chevron-down");
      const voiceBtn = voiceCollapse?.closest?.("button");
      if (voiceBtn && isVis(voiceBtn)) {
        voiceBtn.click();
        return true;
      }

      // 2. Detect if user is currently inside an individual Clan Dashboard (e.g., "avengers" with Voice Room / Ready Check / RECRUIT)
      const mainText = (document.querySelector("main")?.textContent || document.body.textContent || "");
      const insideClanWorkspace = Boolean(
        (mainText.includes("Ready Check") && mainText.includes("Voice Room")) ||
        (mainText.includes("RECRUIT") && mainText.includes("MEMBERS")) ||
        isVis(document.querySelector("#clanDashboard, #clanDetailView, #activeClanView, #myClanWorkspace, [data-clan-dashboard]"))
      );

      if (!insideClanWorkspace) return false;

      // 3. Try explicit Clan Dashboard exit functions if defined on clans.html
      const fnCandidates = ["closeClanDashboard", "backToClans", "showAllClans", "exitClanView", "leaveClanDashboard", "closeClanDetail", "switchToMyClans", "renderAllClans"];
      for (const fn of fnCandidates) {
        if (typeof window[fn] === "function") {
          try { window[fn](); return true; } catch (e) {}
        }
      }

      // 4. Click explicit back or "My Clans" / "All Clans" directory tab inside clans.html
      const directBtn = document.querySelector(
        '#backToClansBtn, [data-action="back-to-clans"], [onclick*="showAllClans"], [onclick*="backToClans"], [onclick*="closeClan"], [onclick*="exitClan"]'
      );
      if (directBtn && isVis(directBtn)) {
        directBtn.click();
        return true;
      }

      const btns = Array.from(document.querySelectorAll("button, a"));
      for (const btn of btns) {
        if (!isVis(btn)) continue;
        const txt = (btn.textContent || "").trim().toLowerCase();
        if (
          txt === "my clans" ||
          txt === "all clans" ||
          txt === "discover clans" ||
          txt.includes("back to clans")
        ) {
          btn.click();
          return true;
        }
      }

      // 5. Bulletproof Fallback: Reload clans.html base list cleanly so user NEVER jumps straight to Home
      window.location.href = "clans.html";
      return true;
    };
  }

  // =========================================================================
  // 10. EDGE-SWIPE TABS, PULL-TO-REFRESH, SHARE REWRITER & CMD+K
  // =========================================================================
  function initEdgeSwipeTabs() {
    if (!isInShell || !isMobileNative) return;
    const page = currentPageFile();
    if (page === "login.html" || page === "reels.html") return;

    let sx = 0, sy = 0, eligible = false;

    const insideHorizontalScroller = (node) => {
      let el = node;
      while (el && el !== document.body) {
        if (el.id === "tx-gaming-hero-stage" || el.id === "tx-festival-banner" || el.tagName === "INPUT" || el.tagName === "TEXTAREA") return true;
        const st = window.getComputedStyle(el);
        if ((st.overflowX === "auto" || st.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 12) return true;
        el = el.parentElement;
      }
      return false;
    };

    window.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1 || document.body.classList.contains("modal-open")) { eligible = false; return; }
      if (insideHorizontalScroller(e.target)) { eligible = false; return; }
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      eligible = true;
    }, { passive: true });

    window.addEventListener("touchend", (e) => {
      if (!eligible) return;
      eligible = false;
      const dx = (e.changedTouches[0]?.clientX || 0) - sx;
      const dy = Math.abs((e.changedTouches[0]?.clientY || 0) - sy);
      if (Math.abs(dx) >= 88 && dy < 42) {
        window.parent.postMessage({ type: "TX_STEP_TAB", delta: dx < 0 ? 1 : -1 }, window.location.origin);
      }
    }, { passive: true });
  }

  function hideWebAppPromoCards() {
    if (!isNative) return;
    const sweep = () => {
      document.querySelectorAll("div, section").forEach((el) => {
        if (el.id === "tx-gaming-hero-stage" || el.children.length > 5) return;
        const txt = (el.textContent || "");
        if (txt.includes("Playing in Background?") && txt.includes("GET APP")) el.style.display = "none";
      });
    };
    sweep();
    setTimeout(sweep, 350);
    setTimeout(sweep, 1100);
  }

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
      navigator.clipboard.writeText = function(text) { return origWriteText(normalizePublicShareStr(text)); };
    }
  }

  function resolveLocalNativeHref(rawHref) {
    if (!rawHref) return null;
    const trimmed = String(rawHref).trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("javascript:") || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) return null;
    let candidate = trimmed;
    try {
      const parsed = new URL(trimmed, window.location.origin);
      const host = parsed.hostname.toLowerCase();
      if (host === "tournyx.in" || host === "www.tournyx.in" || host === "app.tournyx.in" || host === "localhost" || host === "tauri.localhost") {
        candidate = parsed.pathname + parsed.search + parsed.hash;
      } else if (/^https?:\/\//i.test(trimmed)) return { external: true, url: trimmed };
    } catch (e) { return null; }

    if (candidate === "/" || candidate === "") return { external: false, url: "index.html" };
    const m = candidate.match(/^\/?([A-Za-z0-9_-]+)(?:\.html)?(\?[^#]*)?(#.*)?$/);
    if (m && KNOWN_PAGES.has(m[1])) return { external: false, url: `${m[1]}.html${m[2] || ""}${m[3] || ""}` };
    return null;
  }

  function performSmoothNavigate(targetHref) {
    const resolved = resolveLocalNativeHref(targetHref);
    if (!resolved) {
      if (/^https?:\/\//i.test(String(targetHref || ""))) window.TournyxNative.openExternal(targetHref);
      return;
    }
    if (resolved.external) { window.TournyxNative.openExternal(resolved.url); return; }
    if (shellApi) shellApi.navigate(resolved.url);
    else { doNativeHaptic("light"); TournyxLoader.show("Loading Arena"); window.location.href = resolved.url; }
  }

  window.TournyxNative = {
    version: APP_VERSION,
    isNative,
    isCapacitor,
    isTauri,
    isAppleNative,
    isInShell,
    platform,
    loader: TournyxLoader,
    haptic: doNativeHaptic,
    clearCache: clearSwrCache,
    setPerfTier(tier) {
      if (!["ultra", "balanced", "lite"].includes(tier)) return;
      localStorage.setItem("tournyx_perf_tier", tier);
      syncPerfTier(tier);
      shellApi?.setPerfTier?.(tier);
    },
    openExternal(url) {
      if (!url || !/^https?:\/\//i.test(url)) return;
      if (platform === "android" && androidBridge?.openExternalUrl) {
        androidBridge.openExternalUrl(url);
        return;
      }
      if (isCapacitor && capObj?.Plugins?.Browser?.open) {
        capObj.Plugins.Browser.open({ url, toolbarColor: "#050508" }).catch(() => window.open(url, "_blank", "noopener,noreferrer"));
        return;
      }
      if (isTauri && (window.__TAURI_INTERNALS__ || topWin.__TAURI_INTERNALS__)?.invoke) {
        (window.__TAURI_INTERNALS__ || topWin.__TAURI_INTERNALS__).invoke("plugin:opener|open_url", { url }).catch(() => window.open(url, "_blank", "noopener,noreferrer"));
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    },
    navigate(href) { performSmoothNavigate(href); },
    openCommandPalette() { toggleCommandPalette(true); }
  };

  function toggleCommandPalette(forceOpen) {
    let pal = document.getElementById("tx-cmd-palette");
    if (!pal) {
      pal = document.createElement("div");
      pal.id = "tx-cmd-palette";
      pal.innerHTML = `
        <div class="tx-native-dialog" style="max-width:520px;">
          <div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.12);display:flex;align-items:center;gap:10px;">
            <i class="fa-solid fa-magnifying-glass" style="color:#38BDF8;font-size:13px;"></i>
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
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") pal.querySelector("#txCmdList button")?.click(); });
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
    const rows = DESKTOP_SIDEBAR_ITEMS.filter((r) => !needle || r.label.toLowerCase().includes(needle));
    list.innerHTML = rows.map((r) => `
      <button type="button" data-cmd-href="${escapeHtml(r.href)}"
        style="width:100%;text-align:left;padding:10px 12px;border-radius:12px;border:none;background:transparent;color:#FFFFFF;display:flex;align-items:center;gap:12px;cursor:pointer;">
        <i class="fa-solid ${escapeHtml(r.icon)}" style="width:20px;text-align:center;color:#38BDF8;"></i>
        <div style="min-width:0;flex:1;font-size:13px;font-weight:700;">${escapeHtml(r.label)}</div>
      </button>
    `).join("") || '<div style="padding:18px;text-align:center;font-size:12px;color:#94A3B8;">No matching screens</div>';

    list.querySelectorAll("button[data-cmd-href]").forEach((btn) => {
      btn.addEventListener("mouseenter", () => { btn.style.background = "rgba(139,92,246,0.16)"; });
      btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; });
      btn.addEventListener("click", () => {
        toggleCommandPalette(false);
        if (isNative) performSmoothNavigate(btn.dataset.cmdHref);
        else window.location.href = btn.dataset.cmdHref;
      });
    });
  }

  // Web Browser Boot: Mount Desktop Persistent Left Sidebar + Ctrl+K Only
  if (!isNative) {
    window.addEventListener("DOMContentLoaded", () => {
      mountDesktopPersistentSidebar();
      document.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); toggleCommandPalette(); }
        else if (e.key === "Escape" && document.getElementById("tx-cmd-palette")?.classList.contains("is-active")) toggleCommandPalette(false);
      });
    });
    return;
  }

  // Native Link & window.open Interception
  document.addEventListener("click", (e) => {
    const anchor = e.target?.closest?.("a[href]");
    if (!anchor || e.defaultPrevented) return;
    const rawHref = anchor.getAttribute("href") || "";
    if (/^(intent:|freefiremax:|freefireth:|pubg:|cod:|riotclient:|whatsapp:)/i.test(rawHref)) return;
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
      if (resolved.external) { window.TournyxNative.openExternal(resolved.url); return null; }
      performSmoothNavigate(resolved.url);
      return window;
    }
    return origWindowOpen(url, target, features);
  };

  function suppressDuplicateLoginSplash() {
    if (currentPageFile() !== "login.html") return;
    const sweep = () => {
      document.querySelectorAll("div, section").forEach((el) => {
        if (el.id === "tx-common-loader") return;
        const txt = (el.textContent || "").toUpperCase();
        if (txt.includes("INITIALIZING TOURNYX") || txt.includes("SKIP INTRO")) {
          const st = window.getComputedStyle(el);
          if (st.position === "fixed" || Number(st.zIndex) >= 50) el.classList.add("tx-login-intro-hidden");
        }
      });
    };
    sweep();
    setTimeout(sweep, 80);
    setTimeout(sweep, 260);
  }

  function initPullToRefresh() {
    if (!isMobileNative) return;
    const page = currentPageFile();
    if (page === "reels.html" || page === "login.html") return;

    const pill = document.createElement("div");
    pill.id = "tx-ptr-pill";
    pill.innerHTML = '<i class="fa-solid fa-rotate-right" style="color:#38BDF8;"></i><span>Pull to refresh</span>';
    document.body.appendChild(pill);

    let startY = 0, startX = 0, pullDist = 0, tracking = false;
    window.addEventListener("touchstart", (e) => {
      if (window.scrollY > 1 || document.body.classList.contains("modal-open")) { tracking = false; return; }
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
        if (pullDist > 0) { pill.classList.remove("is-visible"); pill.style.transform = "translate3d(-50%, -68px, 0)"; }
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
      if (pullDist >= 84) {
        doNativeHaptic("heavy");
        clearSwrCache();
        sessionStorage.setItem("tx_force_fresh", "1");
        TournyxLoader.show("Refreshing Arena");
        pill.classList.remove("is-visible");
        setTimeout(() => window.location.reload(), 120);
      } else {
        pill.classList.remove("is-visible");
        pill.style.transform = "translate3d(-50%, -68px, 0)";
      }
      pullDist = 0;
    }, { passive: true });
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
      const pa = String(latest).split(".").map((n) => parseInt(n, 10) || 0);
      const pb = APP_VERSION.split(".").map((n) => parseInt(n, 10) || 0);
      const newer = (pa[0] > pb[0]) || (pa[0] === pb[0] && pa[1] > pb[1]) || (pa[0] === pb[0] && pa[1] === pb[1] && pa[2] > pb[2]);
      if (!newer) return;

      const pill = document.createElement("div");
      pill.id = "tx-update-pill";
      pill.innerHTML = `
        <i class="fa-solid fa-sparkles" style="color:#38BDF8;"></i>
        <span>Update <strong>v${escapeHtml(latest)}</strong> ready</span>
        <button id="txUpdateGo" type="button" style="padding:5px 10px;border-radius:8px;border:none;background:linear-gradient(135deg,#8B5CF6,#38BDF8);color:#FFFFFF;font-weight:800;font-size:11px;cursor:pointer;">Update</button>
        <button id="txUpdateClose" type="button" aria-label="Dismiss" style="background:none;border:none;color:#94A3B8;cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
      `;
      document.body.appendChild(pill);
      pill.querySelector("#txUpdateGo")?.addEventListener("click", () => window.TournyxNative.openExternal(dlUrl));
      pill.querySelector("#txUpdateClose")?.addEventListener("click", () => pill.remove());
    } catch (e) {}
  }

  window.addEventListener("DOMContentLoaded", () => {
    sessionStorage.removeItem("tx_force_fresh");
    const page = currentPageFile();
    document.body.classList.add("is-native-app", `platform-${platform}`, "tx-page-entering");
    if (isMobileNative && page !== "login.html" && page !== "reels.html") {
      document.body.classList.add("tx-has-dock");
    }
    setTimeout(() => document.body.classList.remove("tx-page-entering"), 200);

    suppressDuplicateLoginSplash();
    hideWebAppPromoCards();
    mountDesktopPersistentSidebar();
    initHybridDockAndScrollController();
    initPullToRefresh();
    initEdgeSwipeTabs();

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && page !== "clans.html") {
        document.querySelectorAll("video").forEach((v) => { try { if (!v.paused) v.pause(); } catch (e) {} });
      }
    });

    if (isDesktopNative) {
      if (platform === "macos") document.querySelector("header")?.setAttribute("data-tauri-drag-region", "");
      document.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); toggleCommandPalette(); }
        else if (e.key === "Escape" && document.getElementById("tx-cmd-palette")?.classList.contains("is-active")) toggleCommandPalette(false);
      });
    }

    setTimeout(checkAppUpdateSoft, 3500);
  });

  window.addEventListener("pageshow", () => TournyxLoader.hide());
})();
