// ==UserScript==
// @name         ChatGPT Fixed Title Banner + Historical YYYYMMDD (No-API)
// @namespace    local
// @version      1.2.0
// @description  Auto-append date to title and show a fixed banner. Fixed to avoid 429 errors by removing API calls.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  var BANNER_ID = "cgpt-fixed-title-banner";
  var BANNER_BUTTON_ID = "cgpt-fixed-title-banner-toggle";
  var BANNER_HEIGHT_PX = 26;
  var BANNER_Z = 2147483647;
  var bannerCollapsed = false;

  // --- Extraction de la date (via ton extension de timestamp) ---
  function getHistoricalDate() {
    var el = document.querySelector(".chatgpt-timestamp");
    if (!el) return null;
    var s = (el.textContent || "").trim();
    var m = s.match(/^([A-Za-z]{3})\s+([0-9]{1,2})\s+([0-9]{4})/);
    if (!m) return null;

    var months = { Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06", Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12" };
    return m[3] + months[m[1]] + m[2].padStart(2, "0");
  }

  // --- Interface (Reprise stricte de ton code) ---
  function ensureTitleBanner() {
    var banner = document.getElementById(BANNER_ID);
    if (!banner) {
      banner = document.createElement("div");
      banner.id = BANNER_ID;
      banner.style.position = "fixed";
      banner.style.top = "0"; banner.style.left = "0"; banner.style.right = "0";
      banner.style.height = BANNER_HEIGHT_PX + "px";
      banner.style.zIndex = BANNER_Z;
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
    ensureBannerToggleButton();
  }

  function ensureBannerToggleButton() {
    var btn = document.getElementById(BANNER_BUTTON_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = BANNER_BUTTON_ID;
      btn.type = "button";
      btn.textContent = "⬇";
      btn.style.position = "fixed";
      btn.style.top = "6px"; btn.style.right = "8px";
      btn.style.zIndex = BANNER_Z + 1;
      btn.style.padding = "2px 6px";
      btn.style.fontSize = "12px";
      btn.style.background = "rgba(245,245,245,0.95)";
      btn.style.border = "1px solid rgba(0,0,0,0.2)";
      btn.style.borderRadius = "4px";
      btn.style.cursor = "pointer";
      btn.style.display = "none";
      btn.addEventListener("click", function () { expandBanner(); });
      document.documentElement.appendChild(btn);
    }
  }

  function collapseBanner() {
    var banner = document.getElementById(BANNER_ID);
    if (banner) banner.style.display = "none";
    bannerCollapsed = true;
    document.getElementById(BANNER_BUTTON_ID).style.display = "block";
  }

  function expandBanner() {
    var banner = document.getElementById(BANNER_ID);
    if (banner) banner.style.display = "flex";
    bannerCollapsed = false;
    document.getElementById(BANNER_BUTTON_ID).style.display = "none";
  }

  window.addEventListener("dblclick", function (e) {
    var banner = document.getElementById(BANNER_ID);
    if (!banner || bannerCollapsed) return;
    var rect = banner.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
      collapseBanner();
    }
  });

  function updateBannerText() {
    var txt = document.getElementById(BANNER_ID + "-txt");
    if (!txt) return;
    var date = getHistoricalDate() || "--------";
    var title = document.title.replace(/ChatGPT/i, "").trim();
    txt.textContent = (title || "Nouvelle conversation") + " {" + date + "}";
  }

  // --- Logic ---
  function onNav() {
    ensureTitleBanner();
    setTimeout(updateBannerText, 600);
  }

  // Hook SPA
  var _pushState = history.pushState;
  var _replaceState = history.replaceState;
  history.pushState = function () { _pushState.apply(this, arguments); onNav(); };
  history.replaceState = function () { _replaceState.apply(this, arguments); onNav(); };
  window.addEventListener("popstate", onNav);

  // MutationObserver pour détecter l'arrivée du timestamp
  new MutationObserver(updateBannerText).observe(document.head, { subtree: true, childList: true, characterData: true });
  new MutationObserver(updateBannerText).observe(document.body, { childList: true, subtree: true });

  onNav();
})();
