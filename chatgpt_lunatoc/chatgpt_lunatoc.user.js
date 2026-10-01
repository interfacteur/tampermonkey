// ==UserScript==
// @name         ChatGPT LunaTOC Auto Collapse
// @namespace    local
// @version      1.1.0
// @description  Collapse LunaTOC on conversation entry and hide it outside conversations.
// @match        https://chatgpt.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  var BUTTON_ID = "luna-toc-toggle-btn";
  var VISIBLE_CLASS = "luna-toc-sidebar-visible";
  var HIDDEN_CLASS = "luna-toc-sidebar-hidden";
  var DISABLED_CLASS = "tm-lunatoc-disabled";
  var STYLE_ID = "tm-lunatoc-scope-style";
  var scheduled = false;
  var lastPathname = location.pathname;
  var collapsePending = isConversationPath(lastPathname);

  function isConversationPath(pathname) {
    return /\/c\/[a-z0-9-]+(?:\/|$)/i.test(pathname);
  }

  function installScopeStyle() {
    if (document.getElementById(STYLE_ID)) return;

    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "html." + DISABLED_CLASS + " #luna-toc-react-host," +
      "html." + DISABLED_CLASS + " #luna-toc-sidebar," +
      "html." + DISABLED_CLASS + " #luna-toc-toggle-btn," +
      "html." + DISABLED_CLASS + " #luna-toc-preview-tooltip," +
      "html." + DISABLED_CLASS + " #luna-toc-button-tooltip" +
      "{display:none!important;}";
    (document.head || document.documentElement).appendChild(style);
  }

  function updateRouteState() {
    var pathname = location.pathname;
    if (pathname === lastPathname) return;

    var wasConversation = isConversationPath(lastPathname);
    var isConversation = isConversationPath(pathname);

    lastPathname = pathname;

    if (!isConversation) {
      collapsePending = false;
    } else if (!wasConversation) {
      collapsePending = true;
    }
  }

  function reconcileLunaToc() {
    updateRouteState();

    if (!isConversationPath(location.pathname)) {
      document.documentElement.classList.add(DISABLED_CLASS);
      return;
    }

    document.documentElement.classList.remove(DISABLED_CLASS);
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
    installScopeStyle();
    installDomObserver();
    installHistoryHooks();
    reconcileLunaToc();
  }

  start();
})();
