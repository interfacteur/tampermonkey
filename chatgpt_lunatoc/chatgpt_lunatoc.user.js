// ==UserScript==
// @name         ChatGPT LunaTOC Auto Collapse
// @namespace    local
// @version      1.0.0
// @description  Collapse the LunaTOC sidebar when it appears on a ChatGPT conversation.
// @match        https://chatgpt.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  var BUTTON_ID = "luna-toc-toggle-btn";
  var VISIBLE_CLASS = "luna-toc-sidebar-visible";
  var scheduled = false;

  function isConversationPage() {
    return /\/c\/[a-z0-9-]+(?:\/|$)/i.test(location.pathname);
  }

  function collapseLunaToc() {
    if (!isConversationPage()) return;

    var button = document.getElementById(BUTTON_ID);
    if (!button || !button.classList.contains(VISIBLE_CLASS)) return;

    button.click();
  }

  function scheduleCollapse() {
    if (scheduled) return;
    scheduled = true;

    setTimeout(function () {
      scheduled = false;
      collapseLunaToc();
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
    collapseLunaToc();
  }

  start();
})();
