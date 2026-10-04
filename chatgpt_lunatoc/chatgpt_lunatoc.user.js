// ==UserScript==
// @name         ChatGPT LunaTOC Auto Collapse
// @namespace    local
// @version      1.1.2
// @description  Collapse LunaTOC after 10 seconds when entering a ChatGPT conversation.
// @match        https://chatgpt.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  var BUTTON_ID = "luna-toc-toggle-btn";
  var VISIBLE_CLASS = "luna-toc-sidebar-visible";
  var HIDDEN_CLASS = "luna-toc-sidebar-hidden";
  var COLLAPSE_DELAY_MS = 10000;
  var scheduled = false;
  var collapseTimer = null;
  var lastPathname = location.pathname;
  var collapsePending = isConversationPath(lastPathname);

  function isConversationPath(pathname) {
    return /\/c\/[a-z0-9-]+(?:\/|$)/i.test(pathname);
  }

  function updateRouteState() {
    var pathname = location.pathname;
    if (pathname === lastPathname) return;

    var wasConversation = isConversationPath(lastPathname);
    var isConversation = isConversationPath(pathname);

    lastPathname = pathname;

    if (!isConversation) {
      collapsePending = false;
      clearTimeout(collapseTimer);
      collapseTimer = null;
    } else if (!wasConversation) {
      collapsePending = true;
    }
  }

  function collapseLunaToc() {
    collapseTimer = null;
    updateRouteState();

    if (!isConversationPath(location.pathname)) return;
    if (!collapsePending) return;

    var button = document.getElementById(BUTTON_ID);
    if (!button) return;

    if (button.classList.contains(HIDDEN_CLASS)) {
      collapsePending = false;
      return;
    }

    if (!button.classList.contains(VISIBLE_CLASS)) return;

    collapsePending = false;
    button.click();
  }

  function reconcileLunaToc() {
    updateRouteState();

    if (!isConversationPath(location.pathname)) return;
    if (!collapsePending) return;

    var button = document.getElementById(BUTTON_ID);
    if (!button) return;

    if (button.classList.contains(HIDDEN_CLASS)) {
      collapsePending = false;
      clearTimeout(collapseTimer);
      collapseTimer = null;
      return;
    }

    if (!button.classList.contains(VISIBLE_CLASS)) return;
    if (collapseTimer !== null) return;

    collapseTimer = setTimeout(collapseLunaToc, COLLAPSE_DELAY_MS);
  }

  function scheduleCollapse() {
    if (scheduled) return;
    scheduled = true;

    setTimeout(function () {
      scheduled = false;
      reconcileLunaToc();
    }, 0);
  }

  function installDomObserver() {
    var observer = new MutationObserver(scheduleCollapse);

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function installHistoryHooks() {
    var oldPushState = history.pushState;
    var oldReplaceState = history.replaceState;

    history.pushState = function () {
      var result = oldPushState.apply(this, arguments);
      scheduleCollapse();
      return result;
    };

    history.replaceState = function () {
      var result = oldReplaceState.apply(this, arguments);
      scheduleCollapse();
      return result;
    };

    window.addEventListener("popstate", scheduleCollapse);
  }

  function start() {
    installDomObserver();
    installHistoryHooks();
    reconcileLunaToc();
  }

  start();
})();
