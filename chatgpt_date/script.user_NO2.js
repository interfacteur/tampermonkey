// ==UserScript==
// @name         ChatGPT Fixed Title Banner + Historical YYYYMMDD (No-API)
// @namespace    local
// @version      1.2.9
// @description  Affiche une bannière fixe avec le titre et la date historique. Utilise un setInterval avec auto-destruction pour la performance.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  var BANNER_ID = "cgpt-fixed-title-banner";
  var BTN_ID = "cgpt-fixed-title-banner-toggle";
  var RE_DATE = / \{[0-9]{8}\}$/;
  var monitorHandle = null;

  function getHistDate() {
    var el = document.querySelector(".chatgpt-timestamp");
    if (!el) return null;
    var m = el.textContent.trim().match(/^([A-Za-z]{3})\s+([0-9]{1,2})\s+([0-9]{4})/);
    if (!m) return null;
    var mos = {Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12"};
    return m[3] + mos[m[1]] + m[2].padStart(2, "0");
  }

  function setupUI() {
    if (document.getElementById(BANNER_ID) || !document.body) return;

    var b = document.createElement("div");
    b.id = BANNER_ID;
    Object.assign(b.style, {
      position: "fixed", top: "0", left: "0", right: "0", height: "26px", zIndex: "9999999",
      display: "flex", alignItems: "center", padding: "0 10px", fontSize: "12px", fontWeight: "600",
      fontFamily: "monospace", color: "#111", background: "rgba(245,245,245,0.92)",
      borderBottom: "1px solid rgba(0,0,0,0.12)", backdropFilter: "blur(6px)", pointerEvents: "none"
    });
    b.innerHTML = '<div id="'+BANNER_ID+'-txt" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;"></div>';
    document.body.appendChild(b);

    var btn = document.createElement("button");
    btn.id = BTN_ID; btn.textContent = "⬇";
    Object.assign(btn.style, {
      position: "fixed", top: "6px", right: "8px", zIndex: "10000000", padding: "2px 6px",
      fontSize: "12px", background: "#fff", border: "1px solid #ccc", borderRadius: "4px", display: "none"
    });
    btn.onclick = function() { b.style.display = "flex"; btn.style.display = "none"; };
    document.body.appendChild(btn);

    window.addEventListener("dblclick", function(e) {
      if (e.clientY <= 26) { b.style.display = "none"; btn.style.display = "block"; }
    });
  }

  function runOnce() {
    // On nettoie tout processus précédent avant de relancer
    if (monitorHandle) clearInterval(monitorHandle);
    
    monitorHandle = setInterval(function() {
      setupUI();
      var txt = document.getElementById(BANNER_ID + "-txt");
      if (!txt) return;

      var date = getHistDate();
      var title = document.title.replace(/ChatGPT/i, "").trim() || "Nouvelle conversation";
      var clean = title.replace(RE_DATE, "");
      
      txt.textContent = clean + " {" + (date || "--------") + "}";

      // AUTO-DESTRUCTION : Dès que la date est trouvée, on libère le CPU
      if (date) {
        clearInterval(monitorHandle);
        monitorHandle = null;
      }
    }, 1000);
  }

  // Lancement initial
  runOnce();

  // Réactivation lors des navigations SPA (clics latéraux)
  var _ps = history.pushState;
  history.pushState = function() {
    _ps.apply(this, arguments);
    setTimeout(runOnce, 500);
  };
  window.addEventListener("popstate", runOnce);

})();
