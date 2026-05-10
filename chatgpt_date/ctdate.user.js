// ==UserScript==
// @name         ChatGPT Fixed Title Banner Auto Date
// @namespace    local
// @version      1.4.0
// @description  Fixed banner with dated chat title. One-shot server rename after stable title and timestamp.
// @downloadURL  https://raw.githubusercontent.com/interfacteur/tampermonkey/main/chatgpt_date/ctdate.user.js
// @updateURL    https://raw.githubusercontent.com/interfacteur/tampermonkey/main/chatgpt_date/ctdate.user.js
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
  var MAX_TIMESTAMP_TICKS = 30;
  var TIMESTAMP_INTERVAL_MS = 1000;
  var URL_POLL_MS = 1000;

  var timestampHandle = null;
  var timestampConversationId = null;

  var urlPollHandle = null;
  var titleObserver = null;

  var lastUrl = location.href;
  var titleAtRouteChange = document.title;
  var waitingForFreshTitle = false;

  var bannerCollapsed = false;
  var bannerVisible = false;

  var renameState = Object.create(null);

  function log() {
    if (false) {
      console.log.apply(console, arguments);
    }
  }

  function warn() {
    console.warn.apply(console, arguments);
  }

  function getConversationIdFromUrl() {
    var m = location.pathname.match(/\/c\/([a-z0-9-]+)/i);
    return m ? m[1] : null;
  }

  function cleanDocumentTitle(value) {
    var t = String(value || "").trim();
    t = t.replace(/^ChatGPT\s*-\s*/i, "").trim();
    return t;
  }

  function isNeutralTitle(title) {
    var t = cleanDocumentTitle(title);
    return !t || t === "ChatGPT";
  }

  function removeDateSuffix(title) {
    return String(title || "").trim().replace(RE_DATE, "").trim();
  }

  function addDateSuffix(title, yyyymmdd) {
    return removeDateSuffix(title) + " {" + yyyymmdd + "}";
  }

  function getHistDate() {
    var el = document.querySelector(".chatgpt-timestamp");
    if (!el) return null;

    var raw = el.textContent.trim();
    var m = raw.match(/^([A-Za-z]{3})\s+([0-9]{1,2})\s+([0-9]{4})/);
    if (!m) return null;

    var mos = {
      Jan: "01",
      Feb: "02",
      Mar: "03",
      Apr: "04",
      May: "05",
      Jun: "06",
      Jul: "07",
      Aug: "08",
      Sep: "09",
      Oct: "10",
      Nov: "11",
      Dec: "12"
    };

    if (!mos[m[1]]) return null;

    return m[3] + mos[m[1]] + m[2].padStart(2, "0");
  }

  function setupUI() {
    if (!document.body) return false;

    if (!document.getElementById(BANNER_ID)) {
      var b = document.createElement("div");
      b.id = BANNER_ID;

      Object.assign(b.style, {
        position: "fixed",
        top: "0",
        left: "0",
        right: "0",
        height: "26px",
        zIndex: "9999999",
        display: "none",
        alignItems: "center",
        padding: "0 10px",
        fontSize: "12px",
        fontWeight: "600",
        fontFamily: "monospace",
        color: "#111",
        background: "rgba(245,245,245,0.92)",
        borderBottom: "1px solid rgba(0,0,0,0.12)",
        backdropFilter: "blur(6px)",
        pointerEvents: "none"
      });

      var t = document.createElement("div");
      t.id = TEXT_ID;

      Object.assign(t.style, {
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        width: "100%"
      });

      b.appendChild(t);
      document.body.appendChild(b);
    }

    if (!document.getElementById(BTN_ID)) {
      var btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.textContent = "v";

      Object.assign(btn.style, {
        position: "fixed",
        top: "6px",
        right: "8px",
        zIndex: "10000000",
        padding: "2px 6px",
        fontSize: "12px",
        background: "#fff",
        border: "1px solid #ccc",
        borderRadius: "4px",
        display: "none",
        cursor: "pointer"
      });

      btn.onclick = function () {
        bannerCollapsed = false;
        updateBannerVisibility();
      };

      document.body.appendChild(btn);
    }

    return true;
  }

  function updateBannerVisibility() {
    var b = document.getElementById(BANNER_ID);
    var btn = document.getElementById(BTN_ID);

    if (b) {
      b.style.display = bannerVisible && !bannerCollapsed ? "flex" : "none";
    }

    if (btn) {
      btn.style.display = bannerVisible && bannerCollapsed ? "block" : "none";
    }
  }

  function showBanner(text) {
    if (!setupUI()) return;

    var txt = document.getElementById(TEXT_ID);
    if (!txt) return;

    txt.textContent = text;
    bannerVisible = true;
    updateBannerVisibility();
  }

  function hideBanner() {
    bannerVisible = false;
    updateBannerVisibility();
  }

  function stopTimestampMonitor() {
    if (timestampHandle) {
      clearInterval(timestampHandle);
      timestampHandle = null;
    }
    timestampConversationId = null;
  }

  function getAccessToken() {
    return fetch("/api/auth/session", {
      method: "GET",
      credentials: "include"
    }).then(function (r) {
      if (!r.ok) {
        throw new Error("GET /api/auth/session failed: " + r.status);
      }
      return r.json();
    }).then(function (j) {
      var t = j && (
        j.accessToken ||
        j.access_token ||
        (j.token && (j.token.accessToken || j.token.access_token))
      );

      if (!t) {
        throw new Error("No access token found");
      }

      return t;
    });
  }

  function fetchConversationTitle(conversationId, token) {
    var url = "/backend-api/conversation/" + encodeURIComponent(conversationId);

    return fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + token
      }
    }).then(function (r) {
      if (!r.ok) {
        throw new Error("GET " + url + " failed: " + r.status);
      }
      return r.json();
    }).then(function (j) {
      var title = j && typeof j.title === "string" ? j.title.trim() : "";
      if (!title) {
        throw new Error("Empty conversation title");
      }
      return title;
    });
  }

  function patchConversationTitle(conversationId, newTitle, token) {
    var url = "/backend-api/conversation/" + encodeURIComponent(conversationId);

    return fetch(url, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + token
      },
      body: JSON.stringify({
        title: newTitle
      })
    }).then(function (r) {
      if (!r.ok) {
        throw new Error("PATCH " + url + " failed: " + r.status);
      }
      return r.text().catch(function () {
        return "";
      });
    });
  }

  function autoRenameOnce(conversationId, yyyymmdd) {
    if (!conversationId || !yyyymmdd) return;

    if (renameState[conversationId]) {
      return;
    }

    renameState[conversationId] = "running";

    getAccessToken()
      .then(function (token) {
        return fetchConversationTitle(conversationId, token).then(function (apiTitle) {
          return {
            token: token,
            apiTitle: apiTitle
          };
        });
      })
      .then(function (data) {
        var apiTitle = data.apiTitle;

        if (RE_DATE.test(apiTitle)) {
          renameState[conversationId] = "done";

          var displayTitleAlready = cleanDocumentTitle(document.title);
          if (RE_DATE.test(displayTitleAlready)) {
            showBanner(displayTitleAlready);
          }

          return null;
        }

        var newApiTitle = addDateSuffix(apiTitle, yyyymmdd);

        return patchConversationTitle(conversationId, newApiTitle, data.token).then(function () {
          renameState[conversationId] = "done";

          var displayTitle = cleanDocumentTitle(document.title);

          if (isNeutralTitle(displayTitle)) {
            displayTitle = newApiTitle;
          } else {
            displayTitle = addDateSuffix(displayTitle, yyyymmdd);
          }

          showBanner(displayTitle);

          setTimeout(evaluateCurrentPage, 500);
          setTimeout(evaluateCurrentPage, 1500);

          return null;
        });
      })
      .catch(function (e) {
        renameState[conversationId] = "failed";
        warn("[cgpt-title-date] auto rename skipped:", e && e.message ? e.message : e);
      });
  }

  function startTimestampMonitor(conversationId) {
    if (!conversationId) return;

    if (timestampHandle && timestampConversationId === conversationId) {
      return;
    }

    stopTimestampMonitor();

    var ticks = 0;
    timestampConversationId = conversationId;

    timestampHandle = setInterval(function () {
      var currentConversationId = getConversationIdFromUrl();
      var title = cleanDocumentTitle(document.title);

      if (currentConversationId !== conversationId) {
        stopTimestampMonitor();
        return;
      }

      if (RE_DATE.test(title)) {
        stopTimestampMonitor();
        showBanner(title);
        return;
      }

      if (isNeutralTitle(title)) {
        return;
      }

      var date = getHistDate();

      if (date) {
        stopTimestampMonitor();
        autoRenameOnce(conversationId, date);
        return;
      }

      ticks++;

      if (ticks >= MAX_TIMESTAMP_TICKS) {
        stopTimestampMonitor();
        hideBanner();
      }
    }, TIMESTAMP_INTERVAL_MS);
  }

  function evaluateCurrentPage() {
    var conversationId = getConversationIdFromUrl();
    var title = cleanDocumentTitle(document.title);

    if (!conversationId) {
      stopTimestampMonitor();
      hideBanner();
      return;
    }

    if (waitingForFreshTitle && title === cleanDocumentTitle(titleAtRouteChange)) {
      return;
    }

    if (isNeutralTitle(title)) {
      hideBanner();
      return;
    }

    if (RE_DATE.test(title)) {
      stopTimestampMonitor();
      showBanner(title);
      return;
    }

    if (renameState[conversationId] === "running") {
      return;
    }

    if (renameState[conversationId] === "done" || renameState[conversationId] === "failed") {
      hideBanner();
      return;
    }

    startTimestampMonitor(conversationId);
  }

  function onRouteMaybeChanged() {
    if (location.href === lastUrl) {
      return;
    }

    lastUrl = location.href;
    titleAtRouteChange = document.title;
    waitingForFreshTitle = true;

    stopTimestampMonitor();
    hideBanner();

    setTimeout(evaluateCurrentPage, 0);
  }

  function onTitleMaybeChanged() {
    if (waitingForFreshTitle && document.title !== titleAtRouteChange) {
      waitingForFreshTitle = false;
    }

    evaluateCurrentPage();
  }

  function installTitleObserver() {
    if (titleObserver) return;

    var target = document.head || document.documentElement;

    titleObserver = new MutationObserver(function () {
      onTitleMaybeChanged();
    });

    titleObserver.observe(target, {
      subtree: true,
      childList: true,
      characterData: true
    });
  }

  function installHistoryHooks() {
    var oldPushState = history.pushState;
    var oldReplaceState = history.replaceState;

    history.pushState = function () {
      var r = oldPushState.apply(this, arguments);
      onRouteMaybeChanged();
      return r;
    };

    history.replaceState = function () {
      var r = oldReplaceState.apply(this, arguments);
      onRouteMaybeChanged();
      return r;
    };

    window.addEventListener("popstate", function () {
      setTimeout(onRouteMaybeChanged, 0);
    });
  }

  function installUrlPoller() {
    if (urlPollHandle) return;

    urlPollHandle = setInterval(function () {
      onRouteMaybeChanged();
    }, URL_POLL_MS);
  }

  function installCollapseHandler() {
    window.addEventListener("dblclick", function (e) {
      if (!bannerVisible || bannerCollapsed) return;

      if (e.clientY <= 26) {
        bannerCollapsed = true;
        updateBannerVisibility();
      }
    });
  }

  function start() {
    setupUI();
    installTitleObserver();
    installHistoryHooks();
    installUrlPoller();
    installCollapseHandler();
    evaluateCurrentPage();
  }

  start();
})();
