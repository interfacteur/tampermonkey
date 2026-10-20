// ==UserScript==
// @name         ChatGPT Fixed Title Banner Auto Date
// @namespace    local
// @version      1.9.0
// @description  Fixed banner with dated chat title. Conservative server rename after title stabilization.
// @downloadURL  https://raw.githubusercontent.com/interfacteur/tampermonkey/main/chatgpt_date/chatgpt_date.user.js
// @updateURL    https://raw.githubusercontent.com/interfacteur/tampermonkey/main/chatgpt_date/chatgpt_date.user.js
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
  var TITLE_STABILITY_INTERVAL_MS = 2000;
  var TITLE_STABILITY_READS = 3;
  var MAX_TITLE_STABILITY_READS = 15;
  var RENAME_RETRY_MS = 3000;
  var MAX_RENAME_RETRIES = 3;

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
  var renameRetryHandle = Object.create(null);
  var renameRetryCount = Object.create(null);
  var backendDateAttempted = Object.create(null);
  var datedTitle = Object.create(null);
  var renamedDisplayTitle = Object.create(null);

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

  function getProjectIdFromUrl() {
    var m = location.pathname.match(/\/g\/(g-p-[a-f0-9]{32})(?:-[^/]*)?\/c\/[a-z0-9-]+/i);
    return m ? m[1] : null;
  }

  function getProjectTitle() {
    var projectId = getProjectIdFromUrl();
    if (!projectId) return null;

    var links = document.querySelectorAll('a[href$="/project"]');

    for (var i = 0; i < links.length; i++) {
      var pathname;

      try {
        pathname = new URL(links[i].getAttribute("href"), location.origin).pathname;
      } catch (e) {
        continue;
      }

      if (pathname === "/g/" + projectId + "/project") {
        var title = String(links[i].textContent || "").trim();
        return title || null;
      }
    }

    return null;
  }

  function cleanDocumentTitle(value) {
    var t = String(value || "").trim();
    t = t.replace(/^ChatGPT\s*-\s*/i, "").trim();
    return t;
  }

  function isProvisionalTitle(title) {
    var t = cleanDocumentTitle(title);
    t = t.replace(RE_DATE, "").trim();

    return !t || /^(?:ChatGPT|New Chat|Nouveau chat|Nouvelle discussion)$/i.test(t);
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function renameError(message, kind) {
    var error = new Error(message);
    error.renameKind = kind;
    return error;
  }

  function removeDateSuffix(title) {
    return String(title || "").trim().replace(RE_DATE, "").trim();
  }

  function addDateSuffix(title, yyyymmdd) {
    return removeDateSuffix(title) + " {" + yyyymmdd + "}";
  }

  function getDisplayTitle(title) {
    var projectTitle = getProjectTitle();
    return projectTitle ? projectTitle + " - " + title : title;
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

  function toYYYYMMDDFromSeconds(seconds) {
    if (typeof seconds !== "number" || !isFinite(seconds)) return null;

    var d = new Date(seconds * 1000);
    if (isNaN(d.getTime())) return null;

    var y = String(d.getFullYear());
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");

    return y + m + day;
  }

  function getFirstMessageCreateTime(convo) {
    var mapping = convo && convo.mapping ? convo.mapping : {};
    var first = null;

    Object.keys(mapping).forEach(function (key) {
      var msg = mapping[key] && mapping[key].message;
      var ts = msg && typeof msg.create_time === "number" ? msg.create_time : null;

      if (ts && (!first || ts < first)) {
        first = ts;
      }
    });

    return first;
  }

  function getConversationDate(convo) {
    return toYYYYMMDDFromSeconds(convo && convo.create_time) ||
      toYYYYMMDDFromSeconds(getFirstMessageCreateTime(convo));
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

  function showConversationTitle(conversationId, title) {
    if (!conversationId || !RE_DATE.test(title)) return;

    datedTitle[conversationId] = title;

    var displayTitle = getDisplayTitle(title);
    renamedDisplayTitle[conversationId] = displayTitle;
    showBanner(displayTitle);

    if (document.title !== displayTitle) {
      document.title = displayTitle;
    }
  }

  function refreshProjectDisplay() {
    var conversationId = getConversationIdFromUrl();
    var title = conversationId ? datedTitle[conversationId] : null;
    if (!title) return;

    var currentTitle = cleanDocumentTitle(document.title);
    var previousDisplayTitle = renamedDisplayTitle[conversationId];

    if (previousDisplayTitle && currentTitle !== previousDisplayTitle && !isProvisionalTitle(currentTitle)) {
      return;
    }

    var displayTitle = getDisplayTitle(title);
    if (renamedDisplayTitle[conversationId] === displayTitle && document.title === displayTitle) {
      return;
    }

    renamedDisplayTitle[conversationId] = displayTitle;
    showBanner(displayTitle);

    if (document.title !== displayTitle) {
      document.title = displayTitle;
    }
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

  function fetchConversation(conversationId, token) {
    var url = "/backend-api/conversation/" + encodeURIComponent(conversationId);

    return fetch(url, {
      method: "GET",
      cache: "no-store",
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
    });
  }

  function conversationTitle(convo) {
    return convo && typeof convo.title === "string" ? convo.title.trim() : "";
  }

  function waitForStableConversation(conversationId, token) {
    var previousTitle = "";
    var stableReads = 0;
    var reads = 0;

    function readAgain() {
      if (getConversationIdFromUrl() !== conversationId) {
        throw renameError("Conversation changed during title stabilization", "cancelled");
      }

      return fetchConversation(conversationId, token).then(function (convo) {
        var title = conversationTitle(convo);
        reads++;

        if (isProvisionalTitle(title)) {
          previousTitle = "";
          stableReads = 0;
        } else if (title === previousTitle) {
          stableReads++;
        } else {
          previousTitle = title;
          stableReads = 1;
        }

        if (stableReads >= TITLE_STABILITY_READS) {
          return {
            convo: convo,
            title: title
          };
        }

        if (reads >= MAX_TITLE_STABILITY_READS) {
          throw renameError("Conversation title did not stabilize", "transient");
        }

        return wait(TITLE_STABILITY_INTERVAL_MS).then(readAgain);
      });
    }

    return readAgain();
  }

  function scheduleRenameRetry(conversationId) {
    renameRetryCount[conversationId] = (renameRetryCount[conversationId] || 0) + 1;

    if (renameRetryCount[conversationId] > MAX_RENAME_RETRIES) {
      renameState[conversationId] = "failed";
      hideBanner();
      warn("[cgpt-title-date] auto rename skipped: title remained unstable");
      return;
    }

    renameState[conversationId] = "waiting";
    if (renameRetryHandle[conversationId]) return;

    renameRetryHandle[conversationId] = setTimeout(function () {
      delete renameRetryHandle[conversationId];

      if (getConversationIdFromUrl() !== conversationId) {
        delete renameState[conversationId];
        return;
      }

      delete renameState[conversationId];
      delete backendDateAttempted[conversationId];
      evaluateCurrentPage();
    }, RENAME_RETRY_MS);
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

  function autoRenameOnce(conversationId, fallbackDate) {
    if (!conversationId) return;

    if (renameState[conversationId]) {
      return;
    }

    if (!fallbackDate && backendDateAttempted[conversationId]) {
      startTimestampMonitor(conversationId);
      return;
    }

    if (!fallbackDate) {
      backendDateAttempted[conversationId] = true;
    }

    renameState[conversationId] = "running";

    getAccessToken()
      .then(function (token) {
        return {
          token: token
        };
      })
      .then(function (data) {
        return waitForStableConversation(conversationId, data.token).then(function (stable) {
          return {
            token: data.token,
            convo: stable.convo,
            apiTitle: stable.title
          };
        });
      })
      .then(function (data) {
        var convo = data.convo;
        var apiTitle = data.apiTitle;
        var yyyymmdd = getConversationDate(convo) || fallbackDate;

        if (RE_DATE.test(apiTitle)) {
          renameState[conversationId] = "done";
          delete renameRetryCount[conversationId];
          showConversationTitle(conversationId, apiTitle);

          return null;
        }

        if (!yyyymmdd) {
          delete renameState[conversationId];
          startTimestampMonitor(conversationId);
          return null;
        }

        var newApiTitle = addDateSuffix(apiTitle, yyyymmdd);

        return fetchConversation(conversationId, data.token).then(function (latestConvo) {
          var latestTitle = conversationTitle(latestConvo);

          if (getConversationIdFromUrl() !== conversationId) {
            throw renameError("Conversation changed before title update", "cancelled");
          }

          if (isProvisionalTitle(latestTitle) || latestTitle !== apiTitle) {
            throw renameError("Conversation title changed before title update", "transient");
          }

          return patchConversationTitle(conversationId, addDateSuffix(latestTitle, yyyymmdd), data.token);
        }).then(function () {
          renameState[conversationId] = "done";
          delete renameRetryCount[conversationId];
          showConversationTitle(conversationId, newApiTitle);

          setTimeout(evaluateCurrentPage, 500);
          setTimeout(evaluateCurrentPage, 1500);

          return null;
        });
      })
      .catch(function (e) {
        if (e && e.renameKind === "cancelled") {
          delete renameState[conversationId];
          delete renameRetryCount[conversationId];
          return;
        }

        if (e && e.renameKind === "transient") {
          scheduleRenameRetry(conversationId);
          log("[cgpt-title-date] title not stable yet, retry scheduled:", e.message);
          return;
        }

        if (!fallbackDate) {
          delete renameState[conversationId];
          startTimestampMonitor(conversationId);
          warn("[cgpt-title-date] backend date skipped, waiting for DOM timestamp:", e && e.message ? e.message : e);
          return;
        }

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
        if (renamedDisplayTitle[conversationId] === title && datedTitle[conversationId]) {
          showBanner(title);
        } else {
          showConversationTitle(conversationId, title);
        }
        return;
      }

      if (isProvisionalTitle(title)) {
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

    if (isProvisionalTitle(title)) {
      hideBanner();
      return;
    }

    if (RE_DATE.test(title)) {
      stopTimestampMonitor();
      if (renamedDisplayTitle[conversationId] === title && datedTitle[conversationId]) {
        showBanner(title);
      } else {
        showConversationTitle(conversationId, title);
      }
      return;
    }

    if (renameState[conversationId] === "running") {
      return;
    }

    if (renameState[conversationId] === "waiting") {
      return;
    }

    if (renameState[conversationId] === "done") {
      if (renamedDisplayTitle[conversationId] === title) {
        showBanner(renamedDisplayTitle[conversationId]);
        return;
      }

      delete renameState[conversationId];
      delete backendDateAttempted[conversationId];
      delete datedTitle[conversationId];
      delete renamedDisplayTitle[conversationId];
      autoRenameOnce(conversationId, null);
      return;
    }

    if (renameState[conversationId] === "failed") {
      hideBanner();
      return;
    }

    if (!backendDateAttempted[conversationId]) {
      autoRenameOnce(conversationId, null);
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
    waitingForFreshTitle = Boolean(getConversationIdFromUrl());

    stopTimestampMonitor();
    hideBanner();

    setTimeout(evaluateCurrentPage, 0);
    setTimeout(function () {
      waitingForFreshTitle = false;
      evaluateCurrentPage();
    }, 1000);
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
      refreshProjectDisplay();
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
    installTitleObserver();
    installHistoryHooks();
    installUrlPoller();
    installCollapseHandler();
    evaluateCurrentPage();
  }

  start();
})();
