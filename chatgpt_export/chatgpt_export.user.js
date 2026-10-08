// ==UserScript==
// @name         ChatGPT export current conversation JSON MD HTML
// @namespace    local
// @version      1.2.0
// @description  Export current ChatGPT conversation from backend data as JSON, Markdown, and HTML.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  var API = "/backend-api";
  var BTN_ID = "cgpt-export-current-all";
  var DEVICE_ID = crypto.randomUUID();
  var URL_POLL_MS = 1000;

  var lastUrl = location.href;
  var urlPollHandle = null;
  var domObserver = null;

  function getConversationId() {
    var m = location.pathname.match(/\/c\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  function getDisplayTitle(fallbackTitle) {
    var t = document.title || "";

    t = t.replace(/\s*\|\s*ChatGPT\s*$/i, "");
    t = t.replace(/\s*-\s*ChatGPT\s*$/i, "");
    t = t.trim();

    if (!t || /^ChatGPT$/i.test(t)) {
      return fallbackTitle;
    }

    return t;
  }

  function sanitizeName(name) {
    return String(name || "chatgpt-conversation")
      .replace(/[<>:"/\\|?*]/g, "_")
      .replace(/^[. ]+|[. ]+$/g, "")
      .slice(0, 180) || "chatgpt-conversation";
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");

    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  }

  async function getToken() {
    var res = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "Accept": "application/json"
      }
    });

    if (!res.ok) {
      throw new Error("Session request failed: HTTP " + res.status);
    }

    var session = await res.json();

    if (!session.accessToken) {
      throw new Error("No accessToken in session response.");
    }

    return session.accessToken;
  }

  async function fetchCurrentConversation() {
    var cid = getConversationId();

    if (!cid) {
      throw new Error("No conversation id found in URL.");
    }

    var token = await getToken();

    var res = await fetch(API + "/conversation/" + encodeURIComponent(cid), {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "Accept": "application/json",
        "Authorization": "Bearer " + token,
        "Oai-Language": "en-US",
        "Oai-Device-Id": DEVICE_ID
      }
    });

    if (!res.ok) {
      throw new Error("Conversation request failed: HTTP " + res.status);
    }

    return {
      cid: cid,
      convo: await res.json()
    };
  }

  function escapeMarkdownLabel(str) {
    return String(str || "").replace(/([\\[\]])/g, "\\$1");
  }

  function markdownLink(label, url) {
    var value = String(url || "").trim();

    if (!/^https?:\/\//i.test(value) || /[\s<>]/.test(value)) return "";

    return "[" + escapeMarkdownLabel(label || value) + "](" + value + ")";
  }

  function linkFromReferenceItem(item) {
    if (!item || typeof item !== "object") return "";

    var url = item.url || item.href || item.link;
    var label = item.title || item.name || item.site_name || item.domain || url;

    return markdownLink(label, url);
  }

  function referenceReplacement(ref) {
    if (!ref || typeof ref !== "object") return "";

    var matched = String(ref.matched_text || "");

    if (ref.type === "entity" || matched.indexOf("\uE200entity\uE202") === 0) {
      if (ref.name) return String(ref.name);

      var entityMatch = matched.match(/\uE200entity\uE202(\[[\s\S]*\])\uE201/);
      if (entityMatch) {
        try {
          var entityParts = JSON.parse(entityMatch[1]);
          if (entityParts[1]) return String(entityParts[1]);
        } catch (_) {
          // Fall through to the generic marker cleanup below.
        }
      }
    }

    var alt = String(ref.alt || "").trim();
    var altPattern = /\[([^\]\n]+)\]\((https?:\/\/(?:[^()\s]|\([^()\s]*\))+)\)/gi;
    var altLinks = [];
    var altLink;

    while ((altLink = altPattern.exec(alt)) !== null) {
      var parsedAltLink = markdownLink(altLink[1], altLink[2]);
      if (parsedAltLink && altLinks.indexOf(parsedAltLink) === -1) {
        altLinks.push(parsedAltLink);
      }
    }

    if (altLinks.length) {
      return altLinks.join(", ");
    }

    var directLink = linkFromReferenceItem(ref);
    if (directLink) return directLink;

    var groups = [ref.items, ref.fallback_items, ref.supporting_websites];

    for (var i = 0; i < groups.length; i += 1) {
      var items = groups[i];
      if (!Array.isArray(items)) continue;

      for (var j = 0; j < items.length; j += 1) {
        var itemLink = linkFromReferenceItem(items[j]);
        if (itemLink) return itemLink;
      }
    }

    return "";
  }

  function resolveContentReferences(str, metadata) {
    var text = String(str || "");
    var references = metadata && Array.isArray(metadata.content_references)
      ? metadata.content_references
      : [];

    references.forEach(function (ref) {
      var matched = ref && ref.matched_text ? String(ref.matched_text) : "";
      if (!matched || text.indexOf(matched) === -1) return;

      text = text.split(matched).join(referenceReplacement(ref));
    });

    text = text.replace(/\uE200entity\uE202([^\uE201]*)\uE201/g, function (_, payload) {
      try {
        var parts = JSON.parse(payload);
        return parts[1] ? String(parts[1]) : "";
      } catch (_) {
        return "";
      }
    });

    return text
      .replace(/\uE200cite\uE202[^\uE201]*\uE201/g, "")
      .replace(/\uE200map\uE201/g, "")
      .replace(/\u3010[^\u3011]*\u3011/g, "");
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeRole(role) {
    if (role === "assistant") return "Assistant";
    if (role === "user") return "User";
    if (role === "system") return "System";
    if (role === "tool") return "Tool";
    return role ? role.charAt(0).toUpperCase() + role.slice(1) : "Unknown";
  }

  function formatMessageDate(ts) {
    if (!ts) return "";

    var d = new Date(ts * 1000);
    var months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    var y = String(d.getFullYear());
    var month = months[d.getMonth()];
    var day = String(d.getDate()).padStart(2, "0");
    var h = String(d.getHours()).padStart(2, "0");
    var min = String(d.getMinutes()).padStart(2, "0");
    var sec = String(d.getSeconds()).padStart(2, "0");

    return month + " " + day + " " + y + " - " + h + ":" + min + ":" + sec;
  }

  function partToText(part) {
    if (typeof part === "string") return part;

    if (!part || typeof part !== "object") return "";

    if (part.content_type === "image_asset_pointer") {
      return "[image]";
    }

    if (part.content_type === "audio_transcription" && part.text) {
      return part.text;
    }

    if (part.text) return String(part.text);

    return "";
  }

  function messageToText(msg) {
    if (!msg || !msg.content) return "";

    var content = msg.content;
    var parts = content.parts || [];

    var text = "";

    if (Array.isArray(parts) && parts.length) {
      text = parts.map(partToText).filter(Boolean).join("\n");
    } else if (typeof content.text === "string") {
      text = content.text;
    }

    return resolveContentReferences(text, msg.metadata).trim();
  }

  function getOrderedMessages(convo) {
    var mapping = convo.mapping || {};
    var rootId = null;
    var out = [];

    Object.keys(mapping).some(function (key) {
      if (mapping[key] && mapping[key].parent == null) {
        rootId = key;
        return true;
      }
      return false;
    });

    if (!rootId) {
      return out;
    }

    function walk(id) {
      var node = mapping[id];
      if (!node) return;

      var msg = node.message;
      if (msg) {
        var role = msg.author && msg.author.role ? msg.author.role : "unknown";
        var contentType = msg.content && msg.content.content_type ? msg.content.content_type : "text";
        var text = messageToText(msg);

        if (text) {
          out.push({
            id: id,
            role: role,
            contentType: contentType,
            createTime: msg.create_time || null,
            updateTime: msg.update_time || null,
            text: text
          });
        }
      }

      (node.children || []).forEach(walk);
    }

    walk(rootId);
    return out;
  }

  function toMarkdown(convo, exportTitle) {
    var title = exportTitle || convo.title || "Untitled";
    var lines = [];

    lines.push("# " + title);
    lines.push("");

    if (convo.create_time) {
      lines.push("Created: " + new Date(convo.create_time * 1000).toISOString());
      lines.push("");
    }

    var messages = getOrderedMessages(convo);

    messages.forEach(function (m) {
      if (m.role === "system") return;

      lines.push("## " + normalizeRole(m.role));

      if (m.createTime) {
        lines.push("");
        lines.push("*" + formatMessageDate(m.createTime) + "*");
      }

      lines.push("");
      lines.push(m.text);
      lines.push("");
      lines.push("---");
      lines.push("");
    });

    return lines.join("\n");
  }

  function renderInlineMarkdown(text) {
    var raw = String(text || "");
    var tokens = [];

    function token(html) {
      var index = tokens.length;
      tokens.push(html);
      return "\uE100" + index + "\uE101";
    }

    raw = raw.replace(/`([^`\n]+)`/g, function (_, code) {
      return token("<code>" + escapeHtml(code) + "</code>");
    });

    raw = raw.replace(/\[([^\]\n]+)\]\((https?:\/\/(?:[^()\s]|\([^()\s]*\))+)\)/gi, function (_, label, url) {
      return token(
        '<a href="' + escapeHtml(url) + '" rel="noopener noreferrer" target="_blank">' +
        escapeHtml(label) +
        "</a>"
      );
    });

    var safe = escapeHtml(raw)
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
      .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
      .replace(/_([^_\n]+)_/g, "<em>$1</em>");

    return safe.replace(/\uE100([0-9]+)\uE101/g, function (_, index) {
      return tokens[Number(index)] || "";
    });
  }

  function renderTextAsHtml(text) {
    var raw = String(text || "");
    var codeBlocks = [];

    raw = raw.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, function (_, lang, code) {
      var index = codeBlocks.length;
      codeBlocks.push({
        lang: lang || "",
        code: code || ""
      });
      return "\n\n@@CODE_BLOCK_" + index + "@@\n\n";
    });

    var html = [];
    var paragraph = [];
    var listItems = [];
    var listType = null;

    function flushParagraph() {
      if (!paragraph.length) return;
      html.push("<p>" + paragraph.map(renderInlineMarkdown).join("<br>") + "</p>");
      paragraph = [];
    }

    function flushList() {
      if (!listItems.length) return;
      html.push(
        "<" + listType + ">" +
        listItems.map(function (item) {
          return "<li>" + renderInlineMarkdown(item) + "</li>";
        }).join("") +
        "</" + listType + ">"
      );
      listItems = [];
      listType = null;
    }

    raw.split("\n").forEach(function (line) {
      var codeMatch = line.trim().match(/^@@CODE_BLOCK_([0-9]+)@@$/);
      var unordered = line.match(/^\s*[-+*]\s+(.+)$/);
      var ordered = line.match(/^\s*[0-9]+[.)]\s+(.+)$/);
      var heading = line.match(/^\s*(#{1,6})\s+(.+)$/);

      if (codeMatch) {
        flushParagraph();
        flushList();
        var block = codeBlocks[Number(codeMatch[1])];
        var label = block.lang
          ? '<div class="code-lang">' + escapeHtml(block.lang) + '</div>'
          : "";
        html.push(label + '<pre><code>' + escapeHtml(block.code) + '</code></pre>');
        return;
      }

      if (unordered || ordered) {
        flushParagraph();
        var nextType = unordered ? "ul" : "ol";
        if (listType && listType !== nextType) flushList();
        listType = nextType;
        listItems.push((unordered || ordered)[1]);
        return;
      }

      if (heading) {
        flushParagraph();
        flushList();
        var level = heading[1].length;
        html.push("<h" + level + ">" + renderInlineMarkdown(heading[2]) + "</h" + level + ">");
        return;
      }

      if (!line.trim()) {
        flushParagraph();
        flushList();
        return;
      }

      flushList();
      paragraph.push(line);
    });

    flushParagraph();
    flushList();

    return html.join("\n");
  }

  function toHtml(convo, exportTitle) {
    var title = exportTitle || convo.title || "Untitled";
    var messages = getOrderedMessages(convo);
    var created = convo.create_time ? new Date(convo.create_time * 1000).toISOString() : "";

    var body = messages.map(function (m) {
      if (m.role === "system") return "";

      var role = normalizeRole(m.role);
      var cls = m.role === "user" ? "msg user" : "msg assistant";
      var msgDate = m.createTime ? formatMessageDate(m.createTime) : "";

      return [
        '<section class="' + cls + '">',
        '<div class="msg-head">',
        '<h2>' + escapeHtml(role) + '</h2>',
        msgDate ? '<div class="msg-date">' + escapeHtml(msgDate) + '</div>' : "",
        '</div>',
        '<div class="content">',
        renderTextAsHtml(m.text),
        '</div>',
        '</section>'
      ].join("\n");
    }).join("\n");

    return [
      "<!doctype html>",
      '<html lang="fr">',
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      "<title>" + escapeHtml(title) + "</title>",
      "<style>",
      "html { background: #ffffff; color: #111111; }",
      "body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif; line-height: 1.62; font-size: 16px; }",
      "main { max-width: 920px; margin: 0 auto; padding: 32px 22px 80px; }",
      "header { border-bottom: 1px solid #dddddd; margin-bottom: 28px; padding-bottom: 18px; }",
      "h1 { font-size: 26px; line-height: 1.25; margin: 0 0 8px; font-weight: 700; }",
      ".meta { color: #666666; font-size: 13px; }",
      ".msg { margin: 0 0 30px; padding: 18px 18px 16px; border-radius: 14px; border: 1px solid #dddddd; }",
      ".msg h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; color: #555555; }",
      ".msg-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0 0 12px; }",
      ".msg-head h2 { margin: 0; }",
      ".msg-date { color: #666666; font-size: 12px; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, \"Liberation Mono\", monospace; }",
      ".msg.user { background: #f7f7f7; }",
      ".msg.assistant { background: #ffffff; }",
      ".content p { margin: 0 0 14px; }",
      ".content p:last-child { margin-bottom: 0; }",
      ".content a { color: #0969da; text-decoration: underline; text-underline-offset: 2px; }",
      ".content ul, .content ol { margin: 0 0 14px; padding-left: 26px; }",
      ".content li { margin: 4px 0; }",
      "pre { margin: 14px 0; padding: 14px 16px; overflow-x: auto; border-radius: 10px; background: #0d1117; color: #c9d1d9; }",
      "pre code { background: transparent; color: inherit; padding: 0; border-radius: 0; }",
      "code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, \"Liberation Mono\", monospace; font-size: 0.92em; background: #eeeeee; padding: 2px 5px; border-radius: 5px; }",
      ".code-lang { margin: 16px 0 -10px; padding: 5px 10px; display: inline-block; border-radius: 8px 8px 0 0; background: #222222; color: #dddddd; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }",
      "@media print { body { font-size: 12px; } main { max-width: none; padding: 0; } .msg { break-inside: avoid; } .msg-head { display: block; } .msg-date { margin-top: 4px; } }",
      "</style>",
      "</head>",
      "<body>",
      "<main>",
      "<header>",
      "<h1>" + escapeHtml(title) + "</h1>",
      created ? '<div class="meta">Created: ' + escapeHtml(created) + "</div>" : "",
      "</header>",
      body,
      "</main>",
      "</body>",
      "</html>"
    ].join("\n");
  }

  function timestamp() {
    var d = new Date();
    var y = String(d.getFullYear());
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    var h = String(d.getHours()).padStart(2, "0");
    var min = String(d.getMinutes()).padStart(2, "0");
    var sec = String(d.getSeconds()).padStart(2, "0");

    return y + m + day + "_" + h + min + sec;
  }

  async function buildExportData() {
    var data = await fetchCurrentConversation();
    var fallbackTitle = data.convo.title || data.cid;
    var exportTitle = getDisplayTitle(fallbackTitle);
    var title = sanitizeName(exportTitle);
    var basename = title + "_" + data.cid.slice(0, 8) + "--" + timestamp();

    return {
      basename: basename,
      json: JSON.stringify(data.convo, null, 2),
      md: toMarkdown(data.convo, exportTitle),
      html: toHtml(data.convo, exportTitle)
    };
  }

  async function exportFormat(format, button) {
    var data = await buildExportData();

    if (format === "json") {
      download(
        data.basename + ".json",
        data.json,
        "application/json;charset=utf-8"
      );
      return;
    }

    if (format === "md") {
      download(
        data.basename + ".md",
        data.md,
        "text/markdown;charset=utf-8"
      );
      return;
    }

    if (format === "html") {
      download(
        data.basename + ".html",
        data.html,
        "text/html;charset=utf-8"
      );
      return;
    }

    throw new Error("Unknown export format: " + format);
  }

  function makeMenuItem(label, format) {
    var item = document.createElement("button");

    item.textContent = label;
    item.style.display = "block";
    item.style.width = "100%";
    item.style.padding = "8px 10px";
    item.style.border = "0";
    item.style.borderBottom = "1px solid #333";
    item.style.background = "#111";
    item.style.color = "#fff";
    item.style.fontSize = "13px";
    item.style.textAlign = "left";
    item.style.cursor = "pointer";

    item.addEventListener("mouseenter", function () {
      item.style.background = "#222";
    });

    item.addEventListener("mouseleave", function () {
      item.style.background = "#111";
    });

    item.addEventListener("click", function () {
      var parentMenu = item.parentNode;
      if (parentMenu) {
        parentMenu.style.display = "none";
      }

      var old = item.textContent;
      item.disabled = true;
      item.textContent = "Exporting...";

      exportFormat(format, item)
        .then(function () {
          item.textContent = old;
          item.disabled = false;
        })
        .catch(function (err) {
          console.error(err);
          alert(String(err && err.message ? err.message : err));
          item.textContent = old;
          item.disabled = false;
        });
    });

    return item;
  }

  function addExportMenu() {
    if (!getConversationId() || !document.body) return;
    if (document.getElementById(BTN_ID)) return;

    var wrap = document.createElement("div");
    wrap.id = BTN_ID;
    wrap.style.position = "fixed";
    wrap.style.right = "16px";
    wrap.style.bottom = "16px";
    wrap.style.zIndex = "999999";
    wrap.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";

    var menu = document.createElement("div");
    menu.style.display = "none";
    menu.style.position = "absolute";
    menu.style.right = "0";
    menu.style.bottom = "42px";
    menu.style.minWidth = "120px";
    menu.style.overflow = "hidden";
    menu.style.border = "1px solid #555";
    menu.style.borderRadius = "8px";
    menu.style.background = "#111";
    menu.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.25)";

    menu.appendChild(makeMenuItem("JSON", "json"));
    menu.appendChild(makeMenuItem("MD", "md"));
    menu.appendChild(makeMenuItem("HTML", "html"));

    var main = document.createElement("button");
    main.textContent = "Export";
    main.style.padding = "8px 10px";
    main.style.border = "1px solid #777";
    main.style.borderRadius = "6px";
    main.style.background = "#111";
    main.style.color = "#fff";
    main.style.fontSize = "13px";
    main.style.cursor = "pointer";

    main.addEventListener("click", function () {
      menu.style.display = menu.style.display === "none" ? "block" : "none";
    });

    document.addEventListener("click", function (ev) {
      if (!wrap.contains(ev.target)) {
        menu.style.display = "none";
      }
    });

    wrap.appendChild(menu);
    wrap.appendChild(main);
    document.body.appendChild(wrap);
  }

  function removeExportMenu() {
    var wrap = document.getElementById(BTN_ID);
    if (wrap) {
      wrap.remove();
    }
  }

  function syncExportMenu() {
    if (!getConversationId()) {
      removeExportMenu();
      return;
    }

    addExportMenu();
  }

  function onRouteMaybeChanged() {
    if (location.href === lastUrl) {
      return;
    }

    lastUrl = location.href;
    setTimeout(syncExportMenu, 0);
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

  function installDomObserver() {
    if (domObserver) return;

    domObserver = new MutationObserver(syncExportMenu);
    domObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function start() {
    installHistoryHooks();
    installUrlPoller();
    installDomObserver();
    syncExportMenu();
  }

  start();

})();
