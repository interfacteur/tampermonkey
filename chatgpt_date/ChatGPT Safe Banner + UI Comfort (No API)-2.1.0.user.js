// ==UserScript==
// @name         ChatGPT Safe Banner + UI Comfort (No API)
// @namespace    local
// @version      2.1.0
// @description  Bandeau titre + date. Double-clic pour masquer, bouton pour afficher. SANS REQUÊTES API (Évite l'erreur 429).
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // --- Configuration ---
  const BANNER_ID = "cgpt-safe-banner";
  const TOGGLE_BTN_ID = "cgpt-banner-toggle";
  const BANNER_HEIGHT_PX = 26;
  const BANNER_Z = 2147483647;

  // --- Fonctions Utiles ---
  function getYYYYMMDD() {
    const d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  }

  // --- Logique UI ---
  function createUI() {
    if (document.getElementById(BANNER_ID)) return;

    // 1. La Bannière
    const banner = document.createElement("div");
    banner.id = BANNER_ID;
    Object.assign(banner.style, {
      position: "fixed", top: "0", left: "0", right: "0",
      height: `${BANNER_HEIGHT_PX}px`, zIndex: BANNER_Z,
      display: "flex", alignItems: "center", padding: "0 12px",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "12px", fontWeight: "600", color: "#111",
      background: "rgba(245,245,245,0.92)", borderBottom: "1px solid rgba(0,0,0,0.12)",
      backdropFilter: "blur(6px)", webkitBackdropFilter: "blur(6px)",
      cursor: "pointer", transition: "transform 0.2s ease"
    });
    banner.title = "Double-cliquez pour masquer";

    const txt = document.createElement("div");
    txt.id = `${BANNER_ID}-txt`;
    txt.style.cssText = "white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;";
    banner.appendChild(txt);

    // 2. Le Bouton de rappel (Flèche)
    const btn = document.createElement("button");
    btn.id = TOGGLE_BTN_ID;
    btn.textContent = "⬇";
    Object.assign(btn.style, {
      position: "fixed", top: "4px", right: "8px", zIndex: BANNER_Z + 1,
      padding: "2px 6px", fontSize: "12px", background: "white",
      border: "1px solid #ccc", borderRadius: "4px", cursor: "pointer",
      display: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
    });

    // --- Événements ---
    banner.addEventListener("dblclick", () => {
      banner.style.display = "none";
      btn.style.display = "block";
    });

    btn.addEventListener("click", () => {
      banner.style.display = "flex";
      btn.style.display = "none";
    });

    document.documentElement.appendChild(banner);
    document.documentElement.appendChild(btn);
    updateText();
  }

  function updateText() {
    const txt = document.getElementById(`${BANNER_ID}-txt`);
    if (!txt) return;

    // Nettoie le titre (enlève "ChatGPT" et les suffixes)
    let cleanTitle = document.title.replace(/ChatGPT\s*(-?)/i, "").trim();
    if (!cleanTitle) cleanTitle = "Nouvelle conversation";

    txt.textContent = `[${getYYYYMMDD()}] ${cleanTitle}`;
  }

  // --- Surveillance ---
  function init() {
    if (!document.body) {
        setTimeout(init, 100);
        return;
    }
    createUI();

    // Observe les changements de titre de l'onglet (SPA)
    const titleTag = document.querySelector('title');
    if (titleTag) {
      new MutationObserver(updateText).observe(titleTag, { childList: true });
    }

    // Sécurité pour les changements d'URL
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        updateText();
      }
    }, 1500);
  }

  init();
})();