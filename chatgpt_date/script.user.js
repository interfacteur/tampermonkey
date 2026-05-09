// ==UserScript==
// @name         ChatGPT Fixed Title Banner
// @namespace    local
// @version      1.3.0
// @description  Bannière fixe avec titre/date, sans pushState, sécurité mois, MutationObserver sur title.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  var BANNER_ID = "cgpt-fixed-title-banner";
  var BTN_ID = "cgpt-fixed-title-banner-toggle";
  var TEXT_ID = BANNER_ID + "-txt";
  var RE_DATE = / \{[0-9]{8}\}$/;
  
  var monitorHandle = null;
  var urlWatchHandle = null;
  var lastUrl = location.href;
  var maxTicks = 30;

  function getHistDate() {
    var el = document.querySelector(".chatgpt-timestamp");
    if (!el) return null;
    
    var raw = el.textContent.trim();
    var m = raw.match(/^([A-Za-z]{3})\s+([0-9]{1,2})\s+([0-9]{4})/);
    if (!m) return null;

    var mos = {
      Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06",
      Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12"
    };

    if (!mos[m[1]]) return null; 

    return m[3] + mos[m[1]] + m[2].padStart(2, "0");
  }

  function setupUI() {
    if (!document.body || document.getElementById(BANNER_ID)) return;

    var b = document.createElement("div");
    b.id = BANNER_ID;
    Object.assign(b.style, {
      position: "fixed", top: "0", left: "0", right: "0", height: "26px", zIndex: "9999999",
      display: "flex", alignItems: "center", padding: "0 10px", fontSize: "12px", fontWeight: "600",
      fontFamily: "monospace", color: "#111", background: "rgba(245,245,245,0.92)",
      borderBottom: "1px solid rgba(0,0,0,0.12)", backdropFilter: "blur(6px)", pointerEvents: "none"
    });

    var t = document.createElement("div");
    t.id = TEXT_ID;
    Object.assign(t.style, { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%" });

    b.appendChild(t);
    document.body.appendChild(b);

    var btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.textContent = "⬇";
    Object.assign(btn.style, {
      position: "fixed", top: "6px", right: "8px", zIndex: "10000000", padding: "2px 6px",
      fontSize: "12px", background: "#fff", border: "1px solid #ccc", borderRadius: "4px", display: "none"
    });

    btn.onclick = function () { b.style.display = "flex"; btn.style.display = "none"; };
    document.body.appendChild(btn);

    window.addEventListener("dblclick", function (e) {
      if (e.clientY <= 26) { b.style.display = "none"; btn.style.display = "block"; }
    });
  }

  function updateBanner() {
    setupUI();
    var txt = document.getElementById(TEXT_ID);
    if (!txt) return false;

    var date = getHistDate();
    var title = document.title.replace(/ChatGPT/i, "").trim() || "Nouvelle conversation";
    var clean = title.replace(RE_DATE, "");

    txt.textContent = clean + " {" + (date || "--------") + "}";
    return Boolean(date);
  }

  function startMonitor() {
    var ticks = 0;
    if (monitorHandle) clearInterval(monitorHandle);

    updateBanner();

    monitorHandle = setInterval(function () {
      ticks++;
      var foundDate = updateBanner();
      if (foundDate || ticks >= maxTicks) {
        clearInterval(monitorHandle);
        monitorHandle = null;
      }
    }, 1000);
  }

  function startUrlWatcher() {
    var titleEl = document.querySelector("title");
    if (!titleEl || urlWatchHandle) return;

    urlWatchHandle = new MutationObserver(function () {
      lastUrl = location.href;
      startMonitor();
    });

    urlWatchHandle.observe(titleEl, {
      childList: true
    });
  }

  window.addEventListener("popstate", function () {
    lastUrl = location.href;
    startMonitor();
  });

  startMonitor();
  startUrlWatcher();

})();