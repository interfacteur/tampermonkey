// ==UserScript==
// @name         ChatGPT auto-rename with YYYYMMDD + fixed title banner
// @namespace    local
// @version      1.1.0
// @description  Auto-append conversation creation date (YYYYMMDD) to title and show a fixed banner with the page <title>.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // -----------------------
  // Configuration
  // -----------------------
  var ENABLE_AUTO_RENAME = true;
  var ENABLE_TITLE_BANNER = true;

  // If the title already ends with " {YYYYMMDD}", do nothing.
  // If the title already ends with " {<8digits>}", do nothing (safety).
  var RE_DATE_SUFFIX_THIS = function (yyyymmdd) {
    return new RegExp(" \\{" + yyyymmdd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\}$");
  };
  var RE_DATE_SUFFIX_ANY = / \{[0-9]{8}\}$/;

  // Banner style
  var BANNER_ID = "cgpt-fixed-title-banner";
  var BANNER_BUTTON_ID = "cgpt-fixed-title-banner-toggle";
  var BANNER_HEIGHT_PX = 26;
  var BANNER_Z = 2147483647;
  var bannerCollapsed = false;

  // -----------------------
  // Utilities
  // -----------------------
  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toYYYYMMDD(d) {
    var y = d.getFullYear();
    var m = pad2(d.getMonth() + 1);
    var day = pad2(d.getDate());
    return String(y) + String(m) + String(day);
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function getConversationIdFromUrl() {
    // Typical: https://chatgpt.com/c/<uuid>
    // Also seen: https://chat.openai.com/c/<uuid>
    var m = window.location.pathname.match(/\/c\/([a-z0-9-]+)/i);
    return m ? m[1] : null;
  }

  async function getAccessToken() {
    // This endpoint is referenced in public tooling that automates ChatGPT internal API calls.
    var r = await fetch("/api/auth/session", { method: "GET", credentials: "include" });
    if (!r.ok) {
      throw new Error("GET /api/auth/session failed: " + r.status);
    }
    var j = await r.json();

    // Observed keys vary; try common ones.
    var t = j && (j.accessToken || j.access_token);
    if (!t && j && j.token && (j.token.accessToken || j.token.access_token)) {
      t = j.token.accessToken || j.token.access_token;
    }
    if (!t) {
      throw new Error("No access token found in /api/auth/session payload");
    }
    return t;
  }

  async function fetchConversation(conversationId, accessToken) {
    var url = "/backend-api/conversation/" + encodeURIComponent(conversationId);
    var r = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + accessToken
      }
    });
    if (!r.ok) {
      throw new Error("GET " + url + " failed: " + r.status);
    }
    return await r.json();
  }

  async function patchConversationTitle(conversationId, newTitle, accessToken) {
    var url = "/backend-api/conversation/" + encodeURIComponent(conversationId);
    var r = await fetch(url, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + accessToken
      },
      body: JSON.stringify({ title: newTitle })
    });
    if (!r.ok) {
      throw new Error("PATCH " + url + " failed: " + r.status);
    }
    return await r.json().catch(function () { return null; });
  }

  function tryGetDateFromExtensionTimestamp() {
    // Fallback: if an extension injected spans like:
    // <span class="chatgpt-timestamp">Jan 2 2026 - 22:51:02</span>
    // We take the first one in DOM order, parse date, return YYYYMMDD.
    var el = document.querySelector(".chatgpt-timestamp");
    if (!el) return null;

    var s = (el.textContent || "").trim();
    // "Jan 2 2026 - 22:51:02"
    // We parse the "Mon D YYYY" prefix.
    var m = s.match(/^([A-Za-z]{3})\s+([0-9]{1,2})\s+([0-9]{4})\b/);
    if (!m) return null;

    var mon = m[1];
    var day = parseInt(m[2], 10);
    var year = parseInt(m[3], 10);

    var months = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
    };
    if (months[mon] === undefined) return null;

    var d = new Date(year, months[mon], day);
    if (isNaN(d.getTime())) return null;

    return toYYYYMMDD(d);
  }

  // -----------------------
  // Fixed title banner
  // -----------------------
  function ensureTitleBanner() {
    if (!ENABLE_TITLE_BANNER) return;

    var banner = document.getElementById(BANNER_ID);
    if (!banner) {
      banner = document.createElement("div");
      banner.id = BANNER_ID;
      banner.style.position = "fixed";
      banner.style.top = "0";
      banner.style.left = "0";
      banner.style.right = "0";
      banner.style.height = String(BANNER_HEIGHT_PX) + "px";
      banner.style.zIndex = String(BANNER_Z);
      banner.style.display = "flex";
      banner.style.alignItems = "center";
      banner.style.padding = "0 10px";
      banner.style.boxSizing = "border-box";
      banner.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
      banner.style.fontSize = "12px";
      banner.style.fontWeight = "600";
      banner.style.color = "#111";
      banner.style.background = "rgba(245,245,245,0.92)";
      banner.style.borderBottom = "1px solid rgba(0,0,0,0.12)";
      banner.style.backdropFilter = "blur(6px)";
      banner.style.webkitBackdropFilter = "blur(6px)";
      banner.style.pointerEvents = "none";

      var txt = document.createElement("div");
      txt.id = BANNER_ID + "-txt";
      txt.style.whiteSpace = "nowrap";
      txt.style.overflow = "hidden";
      txt.style.textOverflow = "ellipsis";
      txt.style.width = "100%";
      banner.appendChild(txt);

      document.documentElement.appendChild(banner);
    }

    updateBannerText();
    observeTitleChanges();
    ensureBannerToggleButton();
    installBannerCollapseHandler();
  }

  function ensureBannerToggleButton() {
    var btn = document.getElementById(BANNER_BUTTON_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = BANNER_BUTTON_ID;
      btn.type = "button";
      btn.textContent = "⬇";
      btn.style.position = "fixed";
      btn.style.top = "6px";
      btn.style.right = "8px";
      btn.style.zIndex = String(BANNER_Z + 1);
      btn.style.padding = "2px 6px";
      btn.style.fontSize = "12px";
      btn.style.fontWeight = "700";
      btn.style.border = "1px solid rgba(0,0,0,0.2)";
      btn.style.borderRadius = "4px";
      btn.style.background = "rgba(245,245,245,0.95)";
      btn.style.cursor = "pointer";
      btn.style.boxShadow = "0 1px 2px rgba(0,0,0,0.12)";
      btn.style.display = "none";

      btn.addEventListener("click", function () {
        expandBanner();
      });

      document.documentElement.appendChild(btn);
    }

    updateBannerToggleVisibility();
  }

  function collapseBanner() {
    var banner = document.getElementById(BANNER_ID);
    if (banner) {
      banner.style.display = "none";
    }
    bannerCollapsed = true;
    updateBannerToggleVisibility();
  }

  function expandBanner() {
    var banner = document.getElementById(BANNER_ID);
    if (banner) {
      banner.style.display = "flex";
    }
    bannerCollapsed = false;
    updateBannerToggleVisibility();
  }

  function updateBannerToggleVisibility() {
    var btn = document.getElementById(BANNER_BUTTON_ID);
    if (!btn) return;

    btn.style.display = bannerCollapsed ? "block" : "none";
  }

  var bannerCollapseHandlerInstalled = false;
  function installBannerCollapseHandler() {
    if (bannerCollapseHandlerInstalled) return;
    bannerCollapseHandlerInstalled = true;

    window.addEventListener("dblclick", function (e) {
      if (bannerCollapsed) return;
      var banner = document.getElementById(BANNER_ID);
      if (!banner) return;

      var rect = banner.getBoundingClientRect();
      var withinX = e.clientX >= rect.left && e.clientX <= rect.right;
      var withinY = e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (withinX && withinY) {
        collapseBanner();
      }
    });
  }

  function updateBannerText() {
    var tEl = document.querySelector("title");
    var t = (tEl && tEl.textContent) ? tEl.textContent : document.title;
    var txt = document.getElementById(BANNER_ID + "-txt");
    if (txt) txt.textContent = t || "";
  }

  var titleObserverInstalled = false;
  function observeTitleChanges() {
    if (titleObserverInstalled) return;
    titleObserverInstalled = true;

    var head = document.head || document.documentElement;
    var mo = new MutationObserver(function () {
      updateBannerText();
    });
    mo.observe(head, { subtree: true, childList: true, characterData: true });
  }

  // -----------------------
  // Auto rename logic
  // -----------------------
  var lastAttemptByConversationId = Object.create(null);
  var ATTEMPT_COOLDOWN_MS = 5000;

  async function maybeAutoRenameCurrentConversation() {
    if (!ENABLE_AUTO_RENAME) return;

    var conversationId = getConversationIdFromUrl();
    if (!conversationId) return;

    var now = Date.now();
    var lastAttempt = lastAttemptByConversationId[conversationId];
    if (lastAttempt && now - lastAttempt < ATTEMPT_COOLDOWN_MS) return;
    lastAttemptByConversationId[conversationId] = now;

    try {
      var accessToken = await getAccessToken();

      var convo = await fetchConversation(conversationId, accessToken);

      var title = (convo && typeof convo.title === "string") ? convo.title.trim() : "";
      if (!title) return;

      var yyyymmdd = null;

      // Prefer server-side create_time (seconds since epoch).
      if (convo && typeof convo.create_time === "number") {
        var d = new Date(convo.create_time * 1000);
        if (!isNaN(d.getTime())) {
          yyyymmdd = toYYYYMMDD(d);
        }
      }

      // Fallback to extension-injected timestamps (less strict).
      if (!yyyymmdd) {
        yyyymmdd = tryGetDateFromExtensionTimestamp();
      }

      if (!yyyymmdd) return;

      // If already has this exact date suffix, do nothing.
      if (RE_DATE_SUFFIX_THIS(yyyymmdd).test(title)) return;

      // Safety: if it already ends with any 8-digit date, do nothing.
      if (RE_DATE_SUFFIX_ANY.test(title)) return;

      var newTitle = title + " {" + yyyymmdd + "}";

      await patchConversationTitle(conversationId, newTitle, accessToken);

      // Small delay then refresh banner text (page title can lag behind).
      await sleep(250);
      updateBannerText();

      // Log for traceability.
      console.log("[cgpt] renamed:", { conversationId: conversationId, from: title, to: newTitle });
    } catch (e) {
      console.warn("[cgpt] auto-rename skipped:", e && e.message ? e.message : e);
    }
  }

  // -----------------------
  // SPA navigation hook
  // -----------------------
  var navHooksInstalled = false;

  function dispatchNavEvents(eventName) {
    try {
      window.dispatchEvent(new Event("locationchange"));
      if (eventName) {
        window.dispatchEvent(new Event(eventName));
      }
    } catch (e) {
      console.warn("[cgpt] navigation event dispatch failed:", e && e.message ? e.message : e);
    }
  }

  function installSpaHooks() {
    if (navHooksInstalled) return;
    navHooksInstalled = true;

    var _pushState = history.pushState;
    var _replaceState = history.replaceState;

    function onNav() {
      ensureTitleBanner();
      // Delay a bit: the conversation view is often rendered after URL change.
      setTimeout(function () { maybeAutoRenameCurrentConversation(); }, 600);
    }

    history.pushState = function () {
      var r = _pushState.apply(this, arguments);
      onNav();
      dispatchNavEvents("pushstate");
      return r;
    };
    history.replaceState = function () {
      var r = _replaceState.apply(this, arguments);
      onNav();
      dispatchNavEvents("replacestate");
      return r;
    };
    window.addEventListener("popstate", function () {
      onNav();
      dispatchNavEvents("popstate");
    });

    // Initial run
    onNav();

    // Also: periodic check, because some navigations do not touch history as expected.
    setInterval(function () {
      ensureTitleBanner();
      maybeAutoRenameCurrentConversation();
    }, 2500);
  }

  // -----------------------
  // Start
  // -----------------------
  installSpaHooks();

})();
