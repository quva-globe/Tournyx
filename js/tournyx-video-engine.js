(() => {
  "use strict";

  const ADS_CONFIG_URL = "ads-config.json";
  const HERO_CONFIG_URL = "event-banners.json";
  const AD_STALL_FAILSAFE_MS = 4200;

  let adsConfig = null;
  let lastAdPlayedAt = 0;
  let adRoundRobinIdx = 0;

  let activeSessionToken = 0;
  let activeHls = null;
  let activeAdTimer = null;
  let controlsFadeTimer = null;
  let feedObserver = null;
  let registeredCatalog = [];
  let currentItem = null;
  let inAdMode = false;
  let currentAdObj = null;
  let adCanSkip = false;
  let isFollowing = false;

  const SPEED_STEPS = [0.75, 1, 1.25, 1.5, 2];
  let speedIdx = 1;

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"'`=/]/g, (s) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "/": "&#x2F;", "`": "&#x60;", "=": "&#x3D;"
    }[s]));
  }

  function safeUrl(raw, fallback = "") {
    const s = String(raw || "").trim();
    if (!s) return fallback;
    if (/^https?:\/\//i.test(s)) return s;
    if (/^[a-z0-9/_.-]+(?:\?[a-z0-9=&_%+-]+)?(?:#[a-z0-9_-]+)?$/i.test(s) && !s.startsWith("//")) return s;
    return fallback;
  }

  function extractYouTubeId(rawUrl) {
    const s = String(rawUrl || "").trim();
    const m = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function formatTime(sec) {
    const total = Math.max(0, Math.floor(Number(sec) || 0));
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
  }

  function isLiteOrSaveData() {
    return document.documentElement.getAttribute("data-perf-tier") === "lite" ||
      Boolean(navigator.connection?.saveData) ||
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  }

  function notifyShellOverlay(hidden) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "TX_OVERLAY_STATE", hidden: Boolean(hidden) }, window.location.origin);
      }
    } catch (e) {}
  }

  function haptic(style = "light") {
    try { window.TournyxNative?.haptic?.(style); } catch (e) {}
  }

  async function loadAdsConfig() {
    if (adsConfig) return adsConfig;
    try {
      const res = await fetch(ADS_CONFIG_URL, { cache: "no-cache" });
      if (res.ok) {
        adsConfig = await res.json();
        return adsConfig;
      }
    } catch (e) {}
    adsConfig = { enabled: false, cooldown_sec: 90, ads: [] };
    return adsConfig;
  }

  // =========================================================================
  // 1. INTEGRATED FULL-BLEED ANIMATED GAMING HERO STAGE + EVENT SLIDER
  // =========================================================================
  let heroAutoTimer = null;

  async function mountGamingHeroStage() {
    const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (page !== "index.html" && page !== "") return;
    if (document.getElementById("tx-gaming-hero-stage")) return;

    const mainEl = document.querySelector("main");
    if (!mainEl) return;

    // Remove legacy detached festival banner if present
    document.getElementById("tx-festival-banner")?.remove();

    let cfg = null;
    try {
      const res = await fetch(HERO_CONFIG_URL, { cache: "no-cache" });
      if (res.ok) cfg = await res.json();
    } catch (e) {}

    const slides = Array.isArray(cfg?.hero_slides) && cfg.hero_slides.length > 0 ? cfg.hero_slides : [
      {
        id: "default-hero",
        eyebrow: "LIVE SEASON 8 • FEATURED DROP",
        title: "THE GRAND CLUTCH CHAMPIONSHIP",
        description: "Free Fire MAX, BGMI & CODM high-stakes lobbies with verified Room Vaults.",
        cta_text: "Enter Arena",
        cta_href: "explore.html",
        secondary_text: "Watch Reels",
        secondary_href: "reels.html",
        media_type: "image",
        media_url: "og-banner.png",
        poster_url: "og-banner.png"
      }
    ];
    const events = Array.isArray(cfg?.latest_events) ? cfg.latest_events : [];
    const autoplayMs = Math.max(3500, Number(cfg?.autoplay_ms) || 6500);

    const stage = document.createElement("section");
    stage.id = "tx-gaming-hero-stage";
    stage.setAttribute("aria-label", "Featured Gaming Events Stage");
    mainEl.insertBefore(stage, mainEl.firstChild);

    let slideIdx = 0;
    let heroMuted = true;
    let heroPaused = false;

    const renderHero = (idx) => {
      slideIdx = ((idx % slides.length) + slides.length) % slides.length;
      const s = slides[slideIdx];
      const useVideo = s.media_type === "video" && !isLiteOrSaveData() && safeUrl(s.media_url);
      const mediaSrc = safeUrl(s.media_url, "og-banner.png");
      const posterSrc = safeUrl(s.poster_url, "og-banner.png");
      const ctaHref = safeUrl(s.cta_href, "explore.html");
      const secHref = safeUrl(s.secondary_href, "");

      const mediaHtml = useVideo
        ? `<video id="txHeroBgVideo" class="tx-hero-bg-media" src="${escapeHtml(mediaSrc)}" poster="${escapeHtml(posterSrc)}"
             autoplay loop playsinline ${heroMuted ? "muted" : ""} preload="metadata"></video>`
        : `<img class="tx-hero-bg-media" src="${escapeHtml(posterSrc)}" alt="" loading="eager">`;

      const eventsHtml = events.length > 0 ? `
        <div class="tx-hero-event-rail" aria-label="Latest Events">
          ${events.map((ev) => {
            const ic = /^fa-[a-z0-9-]+$/i.test(String(ev.icon || "")) ? ev.icon : "fa-bolt";
            return `
              <a class="tx-hero-event-card" href="${escapeHtml(safeUrl(ev.href, "explore.html"))}">
                <div class="tx-hero-event-icon"><i class="fa-solid ${ic}"></i></div>
                <div style="min-width:0;">
                  <div style="font-family:JetBrains Mono,monospace;font-size:9.5px;font-weight:700;color:#38BDF8;letter-spacing:0.06em;">${escapeHtml(ev.tag || "EVENT")}</div>
                  <div style="font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;">${escapeHtml(ev.title || "")}</div>
                  <div style="font-size:11px;color:#94A3B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${escapeHtml(ev.meta || "")}</div>
                </div>
              </a>
            `;
          }).join("")}
        </div>
      ` : "";

      stage.innerHTML = `
        <div class="tx-hero-motion-viewport">
          ${mediaHtml}
          <div class="tx-hero-scrim" aria-hidden="true"></div>
          ${useVideo ? `
            <div class="tx-hero-media-controls">
              <button id="txHeroMuteBtn" type="button" class="tx-hero-ctrl-btn" aria-label="Toggle Hero Sound">
                <i class="fa-solid ${heroMuted ? "fa-volume-xmark" : "fa-volume-high"}"></i>
              </button>
              <button id="txHeroPauseBtn" type="button" class="tx-hero-ctrl-btn" aria-label="Toggle Hero Playback">
                <i class="fa-solid ${heroPaused ? "fa-play" : "fa-pause"}"></i>
              </button>
            </div>
          ` : ""}
          <div class="tx-hero-copy">
            <span class="tx-hero-eyebrow"><i class="fa-solid fa-bolt"></i> ${escapeHtml(s.eyebrow || "LIVE EVENT")}</span>
            <h1 class="tx-hero-headline">${escapeHtml(s.title || "TOURNYX ARENA")}</h1>
            <p class="tx-hero-desc">${escapeHtml(s.description || "")}</p>
            <div class="tx-hero-actions">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <a class="tx-btn-primary" href="${escapeHtml(ctaHref)}" style="min-height:40px;padding:0 16px;font-size:12.5px;">
                  <span>${escapeHtml(s.cta_text || "Explore")}</span>
                  <i class="fa-solid fa-arrow-right" style="font-size:11px;"></i>
                </a>
                ${secHref ? `<a class="tx-btn-glass" href="${escapeHtml(secHref)}" style="min-height:40px;padding:0 14px;font-size:12px;">${escapeHtml(s.secondary_text || "More")}</a>` : ""}
              </div>
              <div class="tx-hero-dots">
                ${slides.map((_, i) => `<button type="button" class="tx-hero-dot ${i === slideIdx ? "is-active" : ""}" data-hero-dot="${i}" aria-label="Slide ${i + 1}"></button>`).join("")}
              </div>
            </div>
          </div>
        </div>
        ${eventsHtml}
      `;

      const vid = stage.querySelector("#txHeroBgVideo");
      if (vid) {
        vid.addEventListener("error", () => { vid.style.display = "none"; });
        if (heroPaused) vid.pause();
        else vid.play().catch(() => {});
      }

      stage.querySelector("#txHeroMuteBtn")?.addEventListener("click", (e) => {
        heroMuted = !heroMuted;
        if (vid) vid.muted = heroMuted;
        e.currentTarget.innerHTML = `<i class="fa-solid ${heroMuted ? "fa-volume-xmark" : "fa-volume-high"}"></i>`;
      });

      stage.querySelector("#txHeroPauseBtn")?.addEventListener("click", (e) => {
        heroPaused = !heroPaused;
        if (vid) { heroPaused ? vid.pause() : vid.play().catch(() => {}); }
        e.currentTarget.innerHTML = `<i class="fa-solid ${heroPaused ? "fa-play" : "fa-pause"}"></i>`;
      });

      stage.querySelectorAll("[data-hero-dot]").forEach((dot) => {
        dot.addEventListener("click", () => {
          haptic("light");
          renderHero(Number(dot.dataset.heroDot));
          restartHeroTimer();
        });
      });
    };

    const restartHeroTimer = () => {
      clearInterval(heroAutoTimer);
      if (slides.length <= 1) return;
      heroAutoTimer = setInterval(() => {
        if (!document.hidden && !heroPaused && !document.getElementById("tx-yt-player-overlay")?.classList.contains("is-active")) {
          renderHero(slideIdx + 1);
        }
      }, autoplayMs);
    };

    // Pause Hero Motion Video Automatically When Scrolled Out of View (Battery Guard)
    if ("IntersectionObserver" in window) {
      const heroObs = new IntersectionObserver((entries) => {
        const v = stage.querySelector("#txHeroBgVideo");
        if (!v) return;
        const visible = entries[0]?.isIntersecting;
        if (!visible || heroPaused) v.pause();
        else v.play().catch(() => {});
      }, { threshold: 0.25 });
      heroObs.observe(stage);
    }

    // Touch Swipe on Top Motion Viewport
    let sx = 0;
    stage.addEventListener("touchstart", (e) => {
      if (e.target.closest(".tx-hero-event-rail")) return;
      sx = e.touches[0]?.clientX || 0;
    }, { passive: true });
    stage.addEventListener("touchend", (e) => {
      if (!sx || e.target.closest(".tx-hero-event-rail")) { sx = 0; return; }
      const dx = (e.changedTouches[0]?.clientX || 0) - sx;
      sx = 0;
      if (Math.abs(dx) > 48) {
        renderHero(dx < 0 ? slideIdx + 1 : slideIdx - 1);
        restartHeroTimer();
      }
    }, { passive: true });

    renderHero(0);
    restartHeroTimer();
  }

  // =========================================================================
  // 2. HOME FEED MUTED AUTOPLAY ENGINE (SINGLE ACTIVE DECODER)
  // =========================================================================
  function pauseAllFeedAndHeroVideos() {
    document.querySelectorAll("video").forEach((v) => {
      if (v.id === "txYtVideoEl") return;
      try { if (!v.paused) v.pause(); } catch (e) {}
    });
  }

  function extractItemFromDomCard(card) {
    const vid = card.querySelector("video");
    const rawTags = card.dataset.videoTags || card.dataset.game || "Esports,Highlights";
    return {
      id: card.dataset.videoId || `feed-${Math.random().toString(36).slice(2, 8)}`,
      title: card.dataset.videoTitle || card.querySelector("h2,h3,h4")?.textContent?.trim() || "Tournyx Featured Highlight",
      description: card.dataset.videoDesc || card.querySelector("p")?.textContent?.trim() || "Watch live tournaments, scrim highlights, and clutch moments on Tournyx Esports.",
      creator: card.dataset.videoCreator || "Tournyx Esports",
      creatorAvatar: safeUrl(card.dataset.videoAvatar, "favicon.png"),
      game: card.dataset.game || "Esports",
      tags: rawTags.split(",").map((t) => t.trim()).filter(Boolean),
      views: card.dataset.videoViews || "1.2K views",
      publishedAt: card.dataset.videoDate || "Today",
      duration: card.dataset.videoDuration || "",
      likes: parseInt(card.dataset.videoLikes || "0", 10) || 0,
      isLive: card.dataset.isLive === "true",
      videoUrl: safeUrl(card.dataset.videoUrl || vid?.currentSrc || vid?.getAttribute("src") || ""),
      posterUrl: safeUrl(card.dataset.videoPoster || vid?.getAttribute("poster") || "og-banner.png", "og-banner.png")
    };
  }

  function initFeedAutoplay(rootEl = document) {
    if (feedObserver) {
      try { feedObserver.disconnect(); } catch (e) {}
    }

    const cards = Array.from(rootEl.querySelectorAll(".tx-feed-video-card, [data-tx-video-card]"));
    if (cards.length === 0) return;

    const extracted = [];
    cards.forEach((card) => {
      const item = extractItemFromDomCard(card);
      extracted.push(item);

      if (!card.__txClickBound) {
        card.__txClickBound = true;
        card.addEventListener("click", (e) => {
          if (e.target.closest(".tx-autoplay-mute-chip, a, button[data-no-player]")) return;
          e.preventDefault();
          openYouTubePlayer(item, registeredCatalog.length > 0 ? registeredCatalog : extracted);
        });
      }

      const muteBtn = card.querySelector(".tx-autoplay-mute-chip");
      const v = card.querySelector("video");
      if (muteBtn && v && !muteBtn.__txBound) {
        muteBtn.__txBound = true;
        muteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          v.muted = !v.muted;
          muteBtn.innerHTML = `<i class="fa-solid ${v.muted ? "fa-volume-xmark" : "fa-volume-high"}"></i>`;
        });
      }
    });

    if (registeredCatalog.length === 0) registeredCatalog = extracted;
    if (isLiteOrSaveData() || !("IntersectionObserver" in window)) return;

    feedObserver = new IntersectionObserver((entries) => {
      if (document.getElementById("tx-yt-player-overlay")?.classList.contains("is-active")) return;

      let bestEntry = null;
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.62) {
          if (!bestEntry || entry.intersectionRatio > bestEntry.intersectionRatio) bestEntry = entry;
        }
      }

      cards.forEach((card) => {
        const v = card.querySelector("video");
        if (!v) return;
        if (bestEntry && card === bestEntry.target) {
          v.muted = true;
          v.playsInline = true;
          v.play().catch(() => {});
        } else if (!v.paused) {
          v.pause();
        }
      });
    }, { threshold: [0.2, 0.62, 0.85] });

    cards.forEach((c) => feedObserver.observe(c));
  }

  // =========================================================================
  // 3. FULLSCREEN YOUTUBE-STYLE WATCH PLAYER + PRE-ROLL AD SEQUENCER
  // =========================================================================
  function ensurePlayerModalDom() {
    let ov = document.getElementById("tx-yt-player-overlay");
    if (ov) return ov;

    ov = document.createElement("div");
    ov.id = "tx-yt-player-overlay";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-label", "Tournyx Video Player");
    ov.innerHTML = `
      <div class="tx-yt-topbar">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <button id="txYtCloseBtn" type="button" class="tx-yt-icon-btn" aria-label="Close Video Player">
            <i class="fa-solid fa-chevron-down"></i>
          </button>
          <div style="min-width:0;">
            <div style="font-size:12px;font-weight:800;color:#FFFFFF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" id="txYtTopTitle">Tournyx Watch</div>
            <div style="font-size:10px;color:#38BDF8;font-family:JetBrains Mono,monospace;" id="txYtTopBadge">HD STREAM</div>
          </div>
        </div>
        <button id="txYtTopShareBtn" type="button" class="tx-yt-icon-btn" aria-label="Share Video">
          <i class="fa-solid fa-share-nodes"></i>
        </button>
      </div>

      <div class="tx-yt-layout">
        <div class="tx-yt-stage-col">
          <div id="txYtVideoStage" class="tx-yt-video-stage">
            <video id="txYtVideoEl" class="tx-yt-video-el" playsinline preload="metadata"></video>
            <iframe id="txYtIframeEl" class="tx-yt-iframe-el" style="display:none;"
              allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="YouTube Embed"></iframe>

            <!-- Double-Tap ±10s Seek Feedback -->
            <div id="txYtSeekLeftFb" class="tx-yt-seek-feedback is-left"><i class="fa-solid fa-rotate-left"></i> 10s</div>
            <div id="txYtSeekRightFb" class="tx-yt-seek-feedback is-right">10s <i class="fa-solid fa-rotate-right"></i></div>
            <div id="txYtSeekZones" class="tx-yt-seek-zones">
              <div data-zone="left"></div>
              <div data-zone="center"></div>
              <div data-zone="right"></div>
            </div>

            <!-- Pre-Roll Ad HUD (Exact Duration + Ending Countdown + Skip / Non-Skip) -->
            <div id="txAdHud" class="tx-ad-hud">
              <div class="tx-ad-top-row">
                <div class="tx-ad-timer-pill">
                  <span class="tx-ad-tag">AD</span>
                  <span id="txAdTimeStatus">Ad 1 of 1 • 0:00 / 0:15 • Ends in 15s</span>
                </div>
              </div>
              <div class="tx-ad-bottom-row">
                <div class="tx-ad-sponsor-card">
                  <div style="min-width:0;flex:1;">
                    <div id="txAdSponsorName" style="font-size:11px;font-weight:800;color:#38BDF8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Sponsor</div>
                    <div id="txAdHeadline" style="font-size:11.5px;color:#E2E8F0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Featured Campaign</div>
                  </div>
                  <a id="txAdCtaLink" class="tx-ad-cta-btn" href="explore.html">Visit</a>
                </div>
                <button id="txAdSkipBtn" type="button" class="tx-ad-skip-btn" disabled>Ad ends in 15s</button>
              </div>
            </div>

            <!-- Custom Player Controls -->
            <div id="txYtControls" class="tx-yt-controls">
              <div id="txYtProgressWrap" class="tx-yt-progress-wrap" role="slider" aria-label="Video Seek Bar">
                <div class="tx-yt-progress-track">
                  <div id="txYtProgressBuf" class="tx-yt-progress-buf"></div>
                  <div id="txYtProgressFill" class="tx-yt-progress-fill"></div>
                </div>
              </div>
              <div class="tx-yt-ctrl-row">
                <div class="tx-yt-ctrl-group">
                  <button id="txYtPlayBtn" type="button" class="tx-yt-ctrl-btn" aria-label="Play or Pause"><i class="fa-solid fa-pause"></i></button>
                  <button id="txYtMuteBtn" type="button" class="tx-yt-ctrl-btn" aria-label="Mute or Unmute"><i class="fa-solid fa-volume-high"></i></button>
                  <span id="txYtTimeReadout" class="tx-yt-time-readout">0:00 / 0:00</span>
                </div>
                <div class="tx-yt-ctrl-group">
                  <button id="txYtSpeedBtn" type="button" class="tx-yt-ctrl-btn" aria-label="Playback Speed">1x</button>
                  <button id="txYtFsBtn" type="button" class="tx-yt-ctrl-btn" aria-label="Fullscreen"><i class="fa-solid fa-expand"></i></button>
                </div>
              </div>
            </div>
          </div>

          <!-- Metadata, Tags, Engagement Pills & Expandable Description -->
          <div class="tx-yt-meta-wrap">
            <div id="txYtTags" class="tx-yt-tags"></div>
            <h2 id="txYtTitle" class="tx-yt-title">Video Title</h2>
            <div id="txYtStatsRow" class="tx-yt-stats-row"></div>

            <div class="tx-yt-action-pills">
              <button id="txYtLikeBtn" type="button" class="tx-yt-pill-btn"><i class="fa-regular fa-thumbs-up"></i><span id="txYtLikeCount">0</span></button>
              <button id="txYtDislikeBtn" type="button" class="tx-yt-pill-btn"><i class="fa-regular fa-thumbs-down"></i><span>Dislike</span></button>
              <button id="txYtShareBtn" type="button" class="tx-yt-pill-btn"><i class="fa-solid fa-share"></i><span>Share</span></button>
              <button id="txYtSaveBtn" type="button" class="tx-yt-pill-btn"><i class="fa-regular fa-bookmark"></i><span>Save</span></button>
            </div>

            <div class="tx-yt-creator-bar">
              <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                <img id="txYtCreatorAvatar" src="favicon.png" alt="Creator" style="width:40px;height:40px;border-radius:9999px;object-fit:cover;border:1px solid rgba(139,92,246,0.45);">
                <div style="min-width:0;">
                  <div id="txYtCreatorName" style="font-size:13.5px;font-weight:800;color:#FFFFFF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Tournyx Esports</div>
                  <div style="font-size:11px;color:#94A3B8;">Verified Arena Creator</div>
                </div>
              </div>
              <button id="txYtFollowBtn" type="button" class="tx-btn-primary" style="min-height:38px;padding:0 16px;border-radius:9999px;font-size:12px;">Follow</button>
            </div>

            <div id="txYtDescBox" class="tx-yt-desc-box">
              <div style="font-size:11px;font-weight:800;color:#38BDF8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Description</div>
              <div id="txYtDescText" class="tx-yt-desc-text is-clamped"></div>
              <div id="txYtDescToggle" style="font-size:11.5px;font-weight:800;color:#A78BFA;margin-top:6px;">Show more</div>
            </div>
          </div>
        </div>

        <!-- Similar Videos / Up Next Vertical Rail -->
        <aside class="tx-yt-upnext-col" aria-label="Similar Videos">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:13px;font-weight:800;letter-spacing:0.04em;color:#E2E8F0;text-transform:uppercase;">Similar Videos • Up Next</div>
            <span style="font-family:JetBrains Mono,monospace;font-size:10px;color:#38BDF8;">AUTO QUEUE</span>
          </div>
          <div id="txYtUpNextList" style="display:flex;flex-direction:column;gap:10px;"></div>
        </aside>
      </div>
    `;

    document.body.appendChild(ov);
    bindPlayerControls(ov);
    return ov;
  }

  function destroyActiveHls() {
    if (activeHls) {
      try { activeHls.destroy(); } catch (e) {}
      activeHls = null;
    }
  }

  function attachVideoSource(videoEl, url, poster) {
    destroyActiveHls();
    videoEl.poster = poster || "og-banner.png";
    const isHls = /\.m3u8(\?|$)/i.test(url);
    if (isHls && window.Hls && window.Hls.isSupported()) {
      activeHls = new window.Hls({ maxBufferLength: 20, enableWorker: true });
      activeHls.loadSource(url);
      activeHls.attachMedia(videoEl);
    } else {
      videoEl.src = url;
    }
  }

  function bindPlayerControls(ov) {
    const videoEl = ov.querySelector("#txYtVideoEl");
    const controlsEl = ov.querySelector("#txYtControls");
    const progressWrap = ov.querySelector("#txYtProgressWrap");
    const progressFill = ov.querySelector("#txYtProgressFill");
    const progressBuf = ov.querySelector("#txYtProgressBuf");
    const timeReadout = ov.querySelector("#txYtTimeReadout");
    const playBtn = ov.querySelector("#txYtPlayBtn");
    const muteBtn = ov.querySelector("#txYtMuteBtn");
    const speedBtn = ov.querySelector("#txYtSpeedBtn");
    const fsBtn = ov.querySelector("#txYtFsBtn");
    const adSkipBtn = ov.querySelector("#txAdSkipBtn");

    const pokeControls = () => {
      controlsEl.classList.remove("is-faded");
      clearTimeout(controlsFadeTimer);
      if (!videoEl.paused) {
        controlsFadeTimer = setTimeout(() => {
          if (!videoEl.paused && !inAdMode) controlsEl.classList.add("is-faded");
        }, 3200);
      }
    };

    const togglePlay = () => {
      if (videoEl.paused) videoEl.play().catch(() => {});
      else videoEl.pause();
      pokeControls();
    };

    const seekBy = (deltaSec) => {
      if (inAdMode || !Number.isFinite(videoEl.duration)) return;
      videoEl.currentTime = Math.max(0, Math.min(videoEl.duration, videoEl.currentTime + deltaSec));
      const fb = ov.querySelector(deltaSec < 0 ? "#txYtSeekLeftFb" : "#txYtSeekRightFb");
      if (fb) {
        fb.classList.add("is-showing");
        setTimeout(() => fb.classList.remove("is-showing"), 520);
      }
      haptic("light");
    };

    // Double-Tap Left/Right Seek + Center Play/Controls Toggle
    let lastTapAt = 0;
    let lastZone = "";
    ov.querySelector("#txYtSeekZones").addEventListener("click", (e) => {
      const zone = e.target?.dataset?.zone || "center";
      const now = Date.now();
      if (zone !== "center" && zone === lastZone && now - lastTapAt < 320) {
        seekBy(zone === "left" ? -10 : 10);
        lastTapAt = 0;
        return;
      }
      lastTapAt = now;
      lastZone = zone;
      if (controlsEl.classList.contains("is-faded")) pokeControls();
      else if (zone === "center") togglePlay();
    });

    playBtn.addEventListener("click", togglePlay);
    muteBtn.addEventListener("click", () => {
      videoEl.muted = !videoEl.muted;
      muteBtn.innerHTML = `<i class="fa-solid ${videoEl.muted ? "fa-volume-xmark" : "fa-volume-high"}"></i>`;
      pokeControls();
    });

    speedBtn.addEventListener("click", () => {
      if (inAdMode) return;
      speedIdx = (speedIdx + 1) % SPEED_STEPS.length;
      const rate = SPEED_STEPS[speedIdx];
      videoEl.playbackRate = rate;
      speedBtn.textContent = `${rate}x`;
      pokeControls();
    });

    fsBtn.addEventListener("click", async () => {
      const stage = ov.querySelector("#txYtVideoStage");
      try {
        if (!document.fullscreenElement) {
          await (stage.requestFullscreen?.() || videoEl.webkitEnterFullscreen?.());
          try { await screen.orientation?.lock?.("landscape"); } catch (e) {}
        } else {
          await document.exitFullscreen();
          try { screen.orientation?.unlock?.(); } catch (e) {}
        }
      } catch (e) {}
    });

    progressWrap.addEventListener("click", (e) => {
      if (inAdMode || !Number.isFinite(videoEl.duration) || videoEl.duration <= 0) return;
      const rect = progressWrap.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
      videoEl.currentTime = ratio * videoEl.duration;
      pokeControls();
    });

    videoEl.addEventListener("play", () => {
      playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
      pokeControls();
    });

    videoEl.addEventListener("pause", () => {
      playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
      controlsEl.classList.remove("is-faded");
    });

    videoEl.addEventListener("timeupdate", () => {
      const cur = Number(videoEl.currentTime) || 0;
      const dur = Number.isFinite(videoEl.duration) && videoEl.duration > 0
        ? videoEl.duration
        : (inAdMode ? Number(currentAdObj?.duration_sec || 15) : 0);

      if (dur > 0) {
        progressFill.style.width = `${Math.min(100, (cur / dur) * 100)}%`;
        timeReadout.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
      }

      if (videoEl.buffered && videoEl.buffered.length > 0 && dur > 0) {
        const end = videoEl.buffered.end(videoEl.buffered.length - 1);
        progressBuf.style.width = `${Math.min(100, (end / dur) * 100)}%`;
      }

      // Live Pre-Roll Ad Duration & Ending Countdown
      if (inAdMode && currentAdObj) {
        const remaining = Math.max(0, Math.ceil(dur - cur));
        const statusEl = ov.querySelector("#txAdTimeStatus");
        if (statusEl) {
          statusEl.textContent = `Ad 1 of 1 • ${formatTime(cur)} / ${formatTime(dur)} • Ends in ${remaining}s`;
        }
        if (currentAdObj.skippable) {
          const skipAfter = Math.max(1, Number(currentAdObj.skip_after_sec) || 5);
          const untilSkip = Math.max(0, Math.ceil(skipAfter - cur));
          if (untilSkip <= 0) {
            adCanSkip = true;
            adSkipBtn.disabled = false;
            adSkipBtn.classList.add("is-ready");
            adSkipBtn.innerHTML = '<span>Skip Ad</span><i class="fa-solid fa-forward-step"></i>';
          } else {
            adCanSkip = false;
            adSkipBtn.disabled = true;
            adSkipBtn.classList.remove("is-ready");
            adSkipBtn.textContent = `Skip in ${untilSkip}s`;
          }
        } else {
          adCanSkip = false;
          adSkipBtn.disabled = true;
          adSkipBtn.classList.remove("is-ready");
          adSkipBtn.textContent = `Video starts in ${remaining}s`;
        }
      }
    });

    videoEl.addEventListener("ended", () => {
      if (inAdMode) {
        finishAdAndStartMainVideo(activeSessionToken);
      } else {
        // Auto-queue top similar video when current clip finishes
        const nextBtn = ov.querySelector("#txYtUpNextList button");
        if (nextBtn) nextBtn.click();
      }
    });

    adSkipBtn.addEventListener("click", () => {
      if (inAdMode && adCanSkip) {
        haptic("light");
        finishAdAndStartMainVideo(activeSessionToken);
      }
    });

    ov.querySelector("#txYtCloseBtn").addEventListener("click", closeYouTubePlayer);

    // Engagement Controls (Like / Dislike / Share / Save / Follow / Expand Description)
    let liked = false;
    let disliked = false;
    let saved = false;

    const likeBtn = ov.querySelector("#txYtLikeBtn");
    const dislikeBtn = ov.querySelector("#txYtDislikeBtn");
    const saveBtn = ov.querySelector("#txYtSaveBtn");
    const followBtn = ov.querySelector("#txYtFollowBtn");

    likeBtn.addEventListener("click", () => {
      haptic("light");
      liked = !liked;
      if (liked) disliked = false;
      likeBtn.classList.toggle("is-active", liked);
      dislikeBtn.classList.toggle("is-active", disliked);
      const baseLikes = Number(currentItem?.likes) || 0;
      ov.querySelector("#txYtLikeCount").textContent = String(baseLikes + (liked ? 1 : 0));
      window.dispatchEvent(new CustomEvent("tournyx:video-like", { detail: { id: currentItem?.id, liked } }));
    });

    dislikeBtn.addEventListener("click", () => {
      haptic("light");
      disliked = !disliked;
      if (disliked) liked = false;
      dislikeBtn.classList.toggle("is-active", disliked);
      likeBtn.classList.toggle("is-active", liked);
      ov.querySelector("#txYtLikeCount").textContent = String(Number(currentItem?.likes) || 0);
    });

    saveBtn.addEventListener("click", () => {
      haptic("light");
      saved = !saved;
      saveBtn.classList.toggle("is-active", saved);
      saveBtn.innerHTML = `<i class="${saved ? "fa-solid" : "fa-regular"} fa-bookmark"></i><span>${saved ? "Saved" : "Save"}</span>`;
    });

    followBtn.addEventListener("click", () => {
      haptic("light");
      isFollowing = !isFollowing;
      followBtn.textContent = isFollowing ? "Following" : "Follow";
      followBtn.className = isFollowing ? "tx-btn-glass" : "tx-btn-primary";
    });

    const shareHandler = () => {
      haptic("light");
      const shareUrl = `https://tournyx.in/?watch=${encodeURIComponent(currentItem?.id || "")}`;
      const shareData = { title: currentItem?.title || "Tournyx Esports", text: `Watch ${currentItem?.title || "this clutch highlight"} on Tournyx Esports!`, url: shareUrl };
      if (navigator.share) navigator.share(shareData).catch(() => {});
      else if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(shareUrl).then(() => window.showToast?.("Video link copied!")).catch(() => {});
      }
    };
    ov.querySelector("#txYtShareBtn").addEventListener("click", shareHandler);
    ov.querySelector("#txYtTopShareBtn").addEventListener("click", shareHandler);

    ov.querySelector("#txYtDescBox").addEventListener("click", () => {
      const txt = ov.querySelector("#txYtDescText");
      const tog = ov.querySelector("#txYtDescToggle");
      const clamped = txt.classList.toggle("is-clamped");
      tog.textContent = clamped ? "Show more" : "Show less";
    });

    // Desktop Keyboard Shortcuts While Watch View Is Active
    document.addEventListener("keydown", (e) => {
      if (!ov.classList.contains("is-active")) return;
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.key === "Escape") { e.preventDefault(); closeYouTubePlayer(); }
      else if (e.key === " " || e.key.toLowerCase() === "k") { e.preventDefault(); togglePlay(); }
      else if (e.key.toLowerCase() === "m") { e.preventDefault(); muteBtn.click(); }
      else if (e.key.toLowerCase() === "f") { e.preventDefault(); fsBtn.click(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); seekBy(-10); }
      else if (e.key === "ArrowRight") { e.preventDefault(); seekBy(10); }
    });
  }

  function rankSimilarVideos(target, pool) {
    const targetTags = new Set((target?.tags || []).map((t) => String(t).toLowerCase()));
    const targetGame = String(target?.game || "").toLowerCase();
    return (pool || [])
      .filter((v) => v && v.id !== target?.id)
      .map((v) => {
        let score = 0;
        if (String(v.game || "").toLowerCase() === targetGame && targetGame) score += 4;
        if (v.creator && v.creator === target?.creator) score += 2;
        (v.tags || []).forEach((t) => { if (targetTags.has(String(t).toLowerCase())) score += 2; });
        return { v, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((x) => x.v);
  }

  function finishAdAndStartMainVideo(token) {
    if (token !== activeSessionToken || !currentItem) return;
    clearTimeout(activeAdTimer);
    inAdMode = false;
    currentAdObj = null;
    adCanSkip = false;

    const ov = document.getElementById("tx-yt-player-overlay");
    if (!ov) return;
    const videoEl = ov.querySelector("#txYtVideoEl");
    const iframeEl = ov.querySelector("#txYtIframeEl");
    const adHud = ov.querySelector("#txAdHud");
    const progressFill = ov.querySelector("#txYtProgressFill");
    const controlsEl = ov.querySelector("#txYtControls");
    const seekZones = ov.querySelector("#txYtSeekZones");

    adHud.classList.remove("is-active");
    progressFill.classList.remove("is-ad");
    progressFill.style.width = "0%";

    const ytId = extractYouTubeId(currentItem.videoUrl);
    if (ytId) {
      destroyActiveHls();
      videoEl.pause();
      videoEl.style.display = "none";
      controlsEl.style.display = "none";
      seekZones.style.display = "none";
      iframeEl.style.display = "block";
      iframeEl.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
      return;
    }

    iframeEl.style.display = "none";
    iframeEl.src = "about:blank";
    videoEl.style.display = "block";
    controlsEl.style.display = "flex";
    seekZones.style.display = "grid";
    videoEl.playbackRate = SPEED_STEPS[speedIdx];
    videoEl.muted = false;

    const cleanSrc = safeUrl(currentItem.videoUrl);
    if (!cleanSrc) return;
    attachVideoSource(videoEl, cleanSrc, currentItem.posterUrl);
    videoEl.play().catch(() => {
      videoEl.muted = true;
      videoEl.play().catch(() => {});
    });
  }

  async function openYouTubePlayer(item, catalog = []) {
    if (!item) return;
    const token = ++activeSessionToken;
    currentItem = item;
    if (Array.isArray(catalog) && catalog.length > 0) registeredCatalog = catalog;

    pauseAllFeedAndHeroVideos();
    notifyShellOverlay(true);
    document.body.classList.add("modal-open");

    const ov = ensurePlayerModalDom();
    ov.classList.add("is-active");
    ov.scrollTop = 0;

    // Populate Metadata, Tags, Creator, Description & Similar Videos
    ov.querySelector("#txYtTopTitle").textContent = item.title || "Tournyx Watch";
    ov.querySelector("#txYtTopBadge").textContent = item.isLive ? "LIVE STREAM" : (item.game || "HD CLUTCH");
    ov.querySelector("#txYtTitle").textContent = item.title || "Untitled Stream";
    ov.querySelector("#txYtStatsRow").innerHTML = `
      ${item.isLive ? '<span class="tx-live-badge">LIVE</span>' : ""}
      <span>${escapeHtml(item.views || "1.2K views")}</span>
      <span>•</span>
      <span>${escapeHtml(item.publishedAt || "Just now")}</span>
    `;
    ov.querySelector("#txYtTags").innerHTML = (item.tags || [item.game || "Esports"]).slice(0, 6)
      .map((t) => `<span class="tx-yt-tag-chip">#${escapeHtml(String(t).replace(/^#/, ""))}</span>`).join("");
    ov.querySelector("#txYtLikeCount").textContent = String(Number(item.likes) || 0);
    ov.querySelector("#txYtCreatorName").textContent = item.creator || "Tournyx Esports";
    ov.querySelector("#txYtCreatorAvatar").src = safeUrl(item.creatorAvatar, "favicon.png");
    const descText = ov.querySelector("#txYtDescText");
    descText.textContent = item.description || "Official Tournyx Esports arena stream & highlight.";
    descText.classList.add("is-clamped");
    ov.querySelector("#txYtDescToggle").textContent = "Show more";

    // Render Ranked Similar Videos / Up Next
    const similar = rankSimilarVideos(item, registeredCatalog);
    const upNextList = ov.querySelector("#txYtUpNextList");
    upNextList.innerHTML = similar.length > 0 ? similar.map((sim, idx) => `
      <button type="button" class="tx-upnext-card" data-upnext-idx="${idx}">
        <div class="tx-upnext-thumb">
          <img src="${escapeHtml(safeUrl(sim.posterUrl, "og-banner.png"))}" alt="" loading="lazy">
          <span class="tx-upnext-dur">${escapeHtml(sim.isLive ? "LIVE" : (sim.duration || "HD"))}</span>
        </div>
        <div style="min-width:0;display:flex;flex-direction:column;justify-content:center;gap:4px;">
          <div style="font-size:12.5px;font-weight:800;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(sim.title)}</div>
          <div style="font-size:11px;color:#94A3B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(sim.creator || "Tournyx")}</div>
          <div style="font-size:10.5px;color:#38BDF8;font-family:JetBrains Mono,monospace;">${escapeHtml(sim.views || "Trending")}</div>
        </div>
      </button>
    `).join("") : '<div style="font-size:12px;color:#94A3B8;padding:12px;border-radius:14px;background:rgba(14,16,30,0.7);">No more similar videos in this playlist.</div>';

    upNextList.querySelectorAll("[data-upnext-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const chosen = similar[Number(btn.dataset.upnextIdx)];
        if (chosen) openYouTubePlayer(chosen, registeredCatalog);
      });
    });

    // Check Pre-Roll Sponsor Ad Eligibility (Skippable or Non-Skippable)
    const cfg = await loadAdsConfig();
    if (token !== activeSessionToken) return;

    const cooldownMs = Math.max(0, Number(cfg?.cooldown_sec ?? 90)) * 1000;
    const validAds = Array.isArray(cfg?.ads) ? cfg.ads.filter((a) => safeUrl(a?.media_url)) : [];
    const shouldPlayAd = Boolean(cfg?.enabled) && validAds.length > 0 && (Date.now() - lastAdPlayedAt >= cooldownMs);

    if (!shouldPlayAd) {
      finishAdAndStartMainVideo(token);
      return;
    }

    const ad = validAds[adRoundRobinIdx % validAds.length];
    adRoundRobinIdx++;
    lastAdPlayedAt = Date.now();
    inAdMode = true;
    currentAdObj = ad;
    adCanSkip = false;

    const videoEl = ov.querySelector("#txYtVideoEl");
    const iframeEl = ov.querySelector("#txYtIframeEl");
    const adHud = ov.querySelector("#txAdHud");
    const progressFill = ov.querySelector("#txYtProgressFill");
    const controlsEl = ov.querySelector("#txYtControls");
    const adSkipBtn = ov.querySelector("#txAdSkipBtn");

    iframeEl.style.display = "none";
    iframeEl.src = "about:blank";
    videoEl.style.display = "block";
    controlsEl.style.display = "flex";
    progressFill.classList.add("is-ad");
    progressFill.style.width = "0%";

    ov.querySelector("#txAdSponsorName").textContent = ad.sponsor || "Sponsored";
    ov.querySelector("#txAdHeadline").textContent = ad.headline || "Featured Event";
    const ctaLink = ov.querySelector("#txAdCtaLink");
    ctaLink.textContent = ad.cta_text || "Learn More";
    ctaLink.href = safeUrl(ad.cta_url, "explore.html");
    const durGuess = Math.max(3, Number(ad.duration_sec) || 15);
    ov.querySelector("#txAdTimeStatus").textContent = `Ad 1 of 1 • 0:00 / ${formatTime(durGuess)} • Ends in ${durGuess}s`;
    adSkipBtn.disabled = true;
    adSkipBtn.classList.remove("is-ready");
    adSkipBtn.textContent = ad.skippable ? `Skip in ${Math.max(1, Number(ad.skip_after_sec) || 5)}s` : `Video starts in ${durGuess}s`;
    adHud.classList.add("is-active");

    videoEl.playbackRate = 1;
    videoEl.muted = false;
    attachVideoSource(videoEl, safeUrl(ad.media_url), safeUrl(ad.poster_url, "og-banner.png"));

    // Fail-Safe: If sponsor ad fails or stalls >4.2s, jump cleanly into user's video (never trap user!)
    const onAdError = () => {
      if (inAdMode && token === activeSessionToken) finishAdAndStartMainVideo(token);
    };
    videoEl.addEventListener("error", onAdError, { once: true });

    clearTimeout(activeAdTimer);
    activeAdTimer = setTimeout(() => {
      if (inAdMode && token === activeSessionToken && videoEl.currentTime < 0.25) {
        finishAdAndStartMainVideo(token);
      }
    }, AD_STALL_FAILSAFE_MS);

    videoEl.play().catch(() => {
      videoEl.muted = true;
      videoEl.play().catch(onAdError);
    });
  }

  function closeYouTubePlayer() {
    activeSessionToken++;
    clearTimeout(activeAdTimer);
    clearTimeout(controlsFadeTimer);
    inAdMode = false;
    currentAdObj = null;
    destroyActiveHls();

    const ov = document.getElementById("tx-yt-player-overlay");
    if (ov) {
      const videoEl = ov.querySelector("#txYtVideoEl");
      const iframeEl = ov.querySelector("#txYtIframeEl");
      try {
        videoEl.pause();
        videoEl.removeAttribute("src");
        videoEl.load();
      } catch (e) {}
      if (iframeEl) iframeEl.src = "about:blank";
      ov.classList.remove("is-active");
    }

    document.body.classList.remove("modal-open");
    notifyShellOverlay(false);
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
  }

  // Expose Public Engine API for index.html, explore.html & reels.html
  window.TournyxVideoEngine = {
    mountHero: mountGamingHeroStage,
    initFeedAutoplay,
    registerCatalog(items) {
      if (Array.isArray(items)) registeredCatalog = items;
    },
    open: openYouTubePlayer,
    close: closeYouTubePlayer
  };

  window.addEventListener("DOMContentLoaded", () => {
    mountGamingHeroStage();
    setTimeout(() => initFeedAutoplay(document), 450);
  });
})();
