// ==UserScript==
// @name         ChatGPT export current conversation JSON MD HTML
// @namespace    local
// @version      1.4.0
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

  function fileReferenceReplacement(ref, matched) {
    var label = "";
    var url = "";

    if (ref && typeof ref === "object") {
      label = String(
        ref.name || ref.title || ref.file_name || ref.filename ||
        findValueByKeys(ref, ["name", "title", "file_name", "filename"], 3) || ""
      ).trim();
      url = validHttpUrl(
        ref.url || ref.href || ref.download_url ||
        findValueByKeys(ref, ["url", "href", "download_url"], 3)
      );
    }

    var marker = String(matched || "");
    var targetMatch = marker.match(/\uE200filecite\uE202([^\uE201]+)/);
    var markerParts = targetMatch ? targetMatch[1].split("\uE202") : [];
    var target = markerParts[0] || "";
    var lines = markerParts[1] || "";

    if (!label && target) label = target;
    if (!label) return marker;

    var suffix = lines
      ? " (" + lines.replace(/^L/i, "lignes ").replace(/-L?/i, "–") + ")"
      : "";

    return url ? markdownLink(label + suffix, url) : "[Source : " + label + suffix + "]";
  }

  function resolveContentReferences(str, metadata) {
    var text = String(str || "");
    var references = metadata && Array.isArray(metadata.content_references)
      ? metadata.content_references
      : [];

    references.forEach(function (ref) {
      var matched = ref && ref.matched_text ? String(ref.matched_text) : "";
      var isSupportedMarker = /^\uE200(?:cite|entity|filecite)\uE202[^\uE201]*\uE201$/.test(matched);

      if (!isSupportedMarker || text.indexOf(matched) === -1) return;

      var replacement = matched.indexOf("\uE200filecite\uE202") === 0
        ? fileReferenceReplacement(ref, matched)
        : referenceReplacement(ref);
      text = text.split(matched).join(replacement);
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
      .replace(/\uE200message_reaction\uE202([^\uE201]*)\uE201/g, "$1")
      .replace(/\uE200cite\uE202[^\uE201]*\uE201/g, "")
      .replace(/\uE200map\uE201/g, "")
      .replace(/\u3010[^\u3011]*\u3011/g, "");
  }

  function normalizedKey(key) {
    return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function findValueByKeys(root, keys, maxDepth) {
    var wanted = keys.map(normalizedKey);
    var seen = [];

    function visit(value, depth) {
      if (!value || typeof value !== "object" || depth > maxDepth) return null;
      if (seen.indexOf(value) !== -1) return null;
      seen.push(value);

      var names = Object.keys(value);

      for (var i = 0; i < wanted.length; i += 1) {
        for (var j = 0; j < names.length; j += 1) {
          if (wanted[i] === normalizedKey(names[j]) && value[names[j]] != null) {
            return value[names[j]];
          }
        }
      }

      for (var k = 0; k < names.length; k += 1) {
        var found = visit(value[names[k]], depth + 1);
        if (found != null) return found;
      }

      return null;
    }

    return visit(root, 0);
  }

  function numberValue(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function findCoordinates(root) {
    var seen = [];

    function visit(value, depth) {
      if (!value || typeof value !== "object" || depth > 6) return null;
      if (seen.indexOf(value) !== -1) return null;
      seen.push(value);

      var latitude = null;
      var longitude = null;

      Object.keys(value).forEach(function (key) {
        var normalized = normalizedKey(key);
        if (normalized === "latitude" || normalized === "lat") {
          latitude = numberValue(value[key]);
        }
        if (normalized === "longitude" || normalized === "lng" || normalized === "lon") {
          longitude = numberValue(value[key]);
        }
      });

      if (latitude !== null && longitude !== null &&
          latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
        return { latitude: latitude, longitude: longitude };
      }

      var names = Object.keys(value);
      for (var i = 0; i < names.length; i += 1) {
        var found = visit(value[names[i]], depth + 1);
        if (found) return found;
      }

      return null;
    }

    return visit(root, 0);
  }

  function formatAddress(value) {
    if (typeof value === "string") return value.trim();
    if (!value || typeof value !== "object") return "";

    var fields = ["streetaddress", "addressline", "addressline1", "postalcode", "city", "country"];
    var parts = [];

    fields.forEach(function (field) {
      Object.keys(value).forEach(function (key) {
        if (normalizedKey(key) !== field || typeof value[key] !== "string") return;
        var part = value[key].trim();
        if (part && parts.indexOf(part) === -1) parts.push(part);
      });
    });

    return parts.join(", ");
  }

  function validHttpUrl(value) {
    var url = String(value || "").trim();
    return /^https?:\/\/[^\s<>]+$/i.test(url) ? url : "";
  }

  function placeFromReference(ref) {
    if (!ref || typeof ref !== "object") return null;

    var data = ref.entity_data && typeof ref.entity_data === "object" ? ref.entity_data : ref;
    var name = String(ref.name || findValueByKeys(data, ["name", "title"], 4) || "").trim();
    if (!name) return null;

    var addressValue = findValueByKeys(
      data,
      ["formatted_address", "full_address", "street_address", "address"],
      5
    );
    var address = formatAddress(addressValue);
    var phone = findValueByKeys(data, ["phone_number", "telephone", "phone"], 5);
    var website = findValueByKeys(data, ["website_url", "official_website", "website"], 5);
    var coordinates = findCoordinates(data);

    return {
      name: name,
      address: address,
      phone: typeof phone === "string" ? phone.trim() : "",
      website: validHttpUrl(website),
      latitude: coordinates ? coordinates.latitude : null,
      longitude: coordinates ? coordinates.longitude : null
    };
  }

  function extractPlaces(metadata) {
    var references = metadata && Array.isArray(metadata.content_references)
      ? metadata.content_references
      : [];
    var places = [];
    var seen = Object.create(null);

    references.forEach(function (ref) {
      var matched = ref && ref.matched_text ? String(ref.matched_text) : "";
      if (!ref || (ref.type !== "entity" && matched.indexOf("\uE200entity\uE202") !== 0)) return;

      var place = placeFromReference(ref);
      if (!place) return;

      var key = place.name.toLowerCase() + "|" + String(place.latitude) + "|" + String(place.longitude);
      if (seen[key]) return;
      seen[key] = true;
      places.push(place);
    });

    return places;
  }

  function openStreetMapUrl(place) {
    if (place.latitude !== null && place.longitude !== null) {
      return "https://www.openstreetmap.org/?mlat=" + encodeURIComponent(place.latitude) +
        "&mlon=" + encodeURIComponent(place.longitude) +
        "#map=17/" + encodeURIComponent(place.latitude) + "/" + encodeURIComponent(place.longitude);
    }

    var query = [place.name, place.address].filter(Boolean).join(" ");
    return "https://www.openstreetmap.org/search?query=" + encodeURIComponent(query);
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

  function messageContentToText(msg) {
    if (!msg || !msg.content) return "";

    var content = msg.content;
    var parts = content.parts || [];

    var text = "";

    if (Array.isArray(parts) && parts.length) {
      text = parts.map(partToText).filter(Boolean).join("\n");
    } else if (typeof content.text === "string") {
      text = content.text;
    }

    return text;
  }

  function rawPartToText(part) {
    if (typeof part === "string") return part;
    if (!part || typeof part !== "object") return "";
    if (typeof part.text === "string") return part.text;

    try {
      return JSON.stringify(part, null, 2);
    } catch (_) {
      return String(part);
    }
  }

  function messageContentToRawText(msg) {
    if (!msg || !msg.content) return "";

    var content = msg.content;
    if (Array.isArray(content.parts) && content.parts.length) {
      return content.parts.map(rawPartToText).filter(Boolean).join("\n");
    }
    if (typeof content.text === "string") return content.text;

    try {
      return JSON.stringify(content, null, 2);
    } catch (_) {
      return "";
    }
  }

  function messageToText(msg) {
    return resolveContentReferences(messageContentToText(msg), msg && msg.metadata).trim();
  }

  function attachmentFromValue(value) {
    if (!value || typeof value !== "object") return null;

    var contentType = String(value.content_type || value.type || "").toLowerCase();
    var assetPointer = value.asset_pointer || value.file_id || value.id || "";
    var name = value.name || value.file_name || value.filename || value.title || "";
    var mime = value.mime_type || value.mime || "";
    var size = Number(value.size_bytes || value.size || 0);
    var url = validHttpUrl(value.download_url || value.url || value.href);
    var isAttachment = Boolean(
      name || mime || url || assetPointer ||
      contentType.indexOf("asset_pointer") !== -1 ||
      contentType.indexOf("file") !== -1 ||
      contentType.indexOf("image") !== -1
    );

    if (!isAttachment) return null;

    return {
      name: String(name || (contentType.indexOf("image") !== -1 ? "Image" : "Pièce jointe")),
      mime: String(mime || ""),
      size: Number.isFinite(size) && size > 0 ? size : null,
      id: String(assetPointer || ""),
      url: url
    };
  }

  function extractAttachments(msg) {
    if (!msg) return [];

    var candidates = [];
    var contentParts = msg.content && Array.isArray(msg.content.parts) ? msg.content.parts : [];
    var metadataAttachments = msg.metadata && Array.isArray(msg.metadata.attachments)
      ? msg.metadata.attachments
      : [];

    contentParts.concat(metadataAttachments).forEach(function (value) {
      if (!value || typeof value !== "object") return;
      var attachment = attachmentFromValue(value);
      if (attachment) candidates.push(attachment);
    });

    var merged = Object.create(null);
    var order = [];

    candidates.forEach(function (attachment) {
      var normalizedId = attachment.id.replace(/^.*:\/\//, "");
      var key = normalizedId || attachment.url || [attachment.name, attachment.mime].join("|");
      if (!merged[key]) {
        merged[key] = attachment;
        order.push(key);
        return;
      }

      var existing = merged[key];
      if ((!existing.name || existing.name === "Pièce jointe" || existing.name === "Image") && attachment.name) {
        existing.name = attachment.name;
      }
      if (!existing.mime && attachment.mime) existing.mime = attachment.mime;
      if (!existing.size && attachment.size) existing.size = attachment.size;
      if (!existing.url && attachment.url) existing.url = attachment.url;
    });

    return order.map(function (key) { return merged[key]; });
  }

  function parseJsonObject(text) {
    var value = String(text || "").trim();
    if (!value || value.charAt(0) !== "{") return null;

    try {
      var parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function technicalDescriptor(message) {
    var text = String(message.rawText || "").trim();
    var lower = text.toLowerCase();
    var parsed = parseJsonObject(text);
    var path = parsed && typeof parsed.path === "string" ? parsed.path : "";
    var toolSource = parsed && typeof parsed.api_tool_source === "string"
      ? parsed.api_tool_source
      : "";
    var toolName = path || toolSource || String(message.recipient || "");
    var normalizedToolName = toolName.toLowerCase()
      .replace(/[.:]/g, "/")
      .replace(/^\/+|\/+$/g, "");
    var isReadTool = /(^|\/)(?:files\/)?read$/.test(normalizedToolName);
    var isSearchTool = /(^|\/)(?:files\/)?(?:search|find)$/.test(normalizedToolName);

    if (message.role === "tool") {
      if (/^make sure to include\s+\uE200filecite/i.test(text)) {
        return { technical: true, category: "Pièce jointe injectée" };
      }
      if (/\b(error|traceback|exception|failed)\b/i.test(text)) {
        return { technical: true, category: "Erreur technique" };
      }
      if (isReadTool) {
        return { technical: true, category: "Lecture de fichier" };
      }
      if (isSearchTool) {
        return { technical: true, category: "Résultat de recherche" };
      }
      return { technical: true, category: "Résultat d’outil" };
    }

    if (message.role !== "assistant") {
      return { technical: false, category: normalizeRole(message.role) };
    }

    if (/^(?:bash|sh|zsh|python|python3)\s+-/i.test(text)) {
      return { technical: true, category: "Commande interne" };
    }
    if (parsed && (parsed.path || parsed.args || parsed.query || parsed.command)) {
      if (isReadTool) {
        return { technical: true, category: "Appel de lecture" };
      }
      if (isSearchTool || parsed.query) {
        return { technical: true, category: "Appel de recherche" };
      }
      return { technical: true, category: "Appel d’outil" };
    }

    var technicalTypes = [
      "code", "computer_output", "execution_output", "tool_result",
      "reasoning", "reasoning_recap", "thoughts", "model_editable_context"
    ];
    var metadata = message.metadata || {};
    var hidden = metadata.is_visually_hidden_from_conversation === true ||
      metadata.is_hidden === true;
    var addressedToTool = message.recipient && message.recipient !== "all";

    if (hidden || addressedToTool || technicalTypes.indexOf(String(message.contentType).toLowerCase()) !== -1) {
      return { technical: true, category: "Étape intermédiaire" };
    }

    if (lower.indexOf("api tool source") !== -1) {
      return { technical: true, category: "Appel d’outil" };
    }

    return { technical: false, category: "Réponse" };
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
        var displayText = messageContentToText(msg);
        var rawText = messageContentToRawText(msg);
        var hasMap = displayText.indexOf("\uE200map\uE201") !== -1;
        var text = messageToText(msg);

        if (text || rawText || hasMap) {
          var message = {
            id: id,
            role: role,
            contentType: contentType,
            recipient: msg.recipient || "",
            channel: msg.channel || (msg.metadata && msg.metadata.channel) || "",
            createTime: msg.create_time || null,
            updateTime: msg.update_time || null,
            metadata: msg.metadata || {},
            hasMap: hasMap,
            places: hasMap ? extractPlaces(msg.metadata) : [],
            attachments: extractAttachments(msg),
            rawText: rawText.trim(),
            text: text
          };
          message.descriptor = technicalDescriptor(message);
          out.push(message);
        }
      }

      (node.children || []).forEach(walk);
    }

    walk(rootId);
    return out;
  }

  function groupMessagesByTurn(messages) {
    var turns = [];
    var current = null;
    var prelude = [];

    messages.forEach(function (message) {
      if (message.role === "system") return;

      if (message.role === "user") {
        current = {
          index: turns.length + 1,
          user: message,
          responses: [],
          activity: []
        };
        turns.push(current);
        return;
      }

      if (!current) {
        prelude.push(message);
        return;
      }

      if (message.role === "assistant" && !message.descriptor.technical) {
        current.responses.push(message);
      } else {
        current.activity.push(message);
      }
    });

    return { turns: turns, prelude: prelude };
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

      if (m.hasMap) {
        lines.push("### Lieux mentionnés");
        lines.push("");

        if (m.places.length) {
          m.places.forEach(function (place) {
            var details = [place.address, place.phone].filter(Boolean).join(" — ");
            var placeLine = "- **" + place.name + "**";
            if (details) placeLine += " — " + details;
            placeLine += " — [Voir sur OpenStreetMap](" + openStreetMapUrl(place) + ")";
            if (place.website) placeLine += " — [Site officiel](" + place.website + ")";
            lines.push(placeLine);
          });
        } else {
          lines.push("- Une carte était présente dans la conversation d’origine, sans lieu exploitable dans les métadonnées.");
        }

        lines.push("");
      }

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

  function renderMapSummary(places) {
    var content;

    if (!places.length) {
      content = '<p class="map-empty">Une carte était présente dans la conversation d’origine, sans lieu exploitable dans les métadonnées.</p>';
    } else {
      content = "<ul>" + places.map(function (place) {
        var details = [place.address, place.phone].filter(Boolean).join(" — ");
        var links = [
          '<a href="' + escapeHtml(openStreetMapUrl(place)) + '" rel="noopener noreferrer" target="_blank">Voir sur OpenStreetMap</a>'
        ];

        if (place.website) {
          links.push(
            '<a href="' + escapeHtml(place.website) + '" rel="noopener noreferrer" target="_blank">Site officiel</a>'
          );
        }

        return "<li><strong>" + escapeHtml(place.name) + "</strong>" +
          (details ? '<span class="place-details">' + escapeHtml(details) + "</span>" : "") +
          '<span class="place-links">' + links.join(" · ") + "</span></li>";
      }).join("") + "</ul>";
    }

    return [
      '<aside class="map-summary" aria-label="Lieux de la carte">',
      "<h3>Lieux mentionnés</h3>",
      content,
      "</aside>"
    ].join("\n");
  }

  function promptNavigationLabel(text) {
    var label = String(text || "")
      .replace(/```[\s\S]*?```/g, " code ")
      .replace(/[`*_#>\[\]()]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (label.length > 88) label = label.slice(0, 85).trimEnd() + "…";
    return label || "Prompt sans texte";
  }

  function renderPromptNavigation(turns) {
    if (!turns.length) return "";

    return [
      '<nav class="prompt-nav" aria-label="Navigation entre les prompts">',
      "<h2>Prompts</h2>",
      '<div class="activity-controls" aria-label="Affichage de l’activité technique">',
      '<button type="button" data-activity-action="open">Déplier toute l’activité</button>',
      '<button type="button" data-activity-action="close">Masquer toute l’activité</button>',
      "</div>",
      "<ol>",
      turns.map(function (turn) {
        var label = promptNavigationLabel(turn.user.text);
        return '<li><a href="#turn-' + turn.index + '" title="' + escapeHtml(label) + '">' +
          escapeHtml(label) + "</a></li>";
      }).join("\n"),
      "</ol>",
      "</nav>"
    ].join("\n");
  }

  function formatBytes(size) {
    if (!Number.isFinite(size) || size <= 0) return "";
    var units = ["o", "Ko", "Mo", "Go"];
    var value = size;
    var unit = 0;

    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }

    var precision = value >= 10 || unit === 0 ? 0 : 1;
    return value.toFixed(precision).replace(".", ",") + " " + units[unit];
  }

  function renderAttachments(attachments) {
    if (!attachments || !attachments.length) return "";

    return [
      '<details class="attachments-details">',
      "<summary>Pièces jointes — " + attachments.length + "</summary>",
      "<ul>",
      attachments.map(function (attachment) {
        var details = [attachment.mime, formatBytes(attachment.size)].filter(Boolean);
        var name = escapeHtml(attachment.name || "Pièce jointe");
        var main = attachment.url
          ? '<a href="' + escapeHtml(attachment.url) + '" rel="noopener noreferrer" target="_blank" download>' + name + "</a>"
          : "<strong>" + name + "</strong>";
        var unavailable = attachment.url ? "" : '<span class="attachment-unavailable">Fichier original non incorporé</span>';

        return "<li>" + main +
          (details.length ? '<span class="attachment-meta">' + escapeHtml(details.join(" · ")) + "</span>" : "") +
          (attachment.id ? '<span class="attachment-id">Identifiant : <code>' + escapeHtml(attachment.id) + "</code></span>" : "") +
          unavailable + "</li>";
      }).join(""),
      "</ul>",
      "</details>"
    ].join("\n");
  }

  function sourceSummary(ref) {
    if (!ref || typeof ref !== "object") return null;

    var matched = String(ref.matched_text || "");
    if (ref.type === "entity" || matched.indexOf("\uE200entity\uE202") === 0) return null;

    var label = String(
      ref.name || ref.title || ref.file_name || ref.filename || ref.site_name || ref.domain ||
      findValueByKeys(ref, ["name", "title", "file_name", "filename", "site_name"], 3) || ""
    ).trim();
    var url = validHttpUrl(ref.url || ref.href || ref.link || ref.download_url);

    if (!url) {
      var groups = [ref.items, ref.fallback_items, ref.supporting_websites];
      groups.some(function (items) {
        if (!Array.isArray(items)) return false;
        return items.some(function (item) {
          if (!item || typeof item !== "object") return false;
          var candidate = validHttpUrl(item.url || item.href || item.link);
          if (!candidate) return false;
          url = candidate;
          if (!label) label = String(item.title || item.name || item.site_name || item.domain || "").trim();
          return true;
        });
      });
    }

    if (!label && matched.indexOf("\uE200filecite\uE202") === 0) {
      var marker = matched.match(/\uE200filecite\uE202([^\uE202\uE201]+)/);
      if (marker) label = marker[1];
    }

    if (!label && url) label = url;
    if (!label && !matched) return null;

    return {
      label: label || "Référence technique",
      url: url,
      marker: matched,
      type: String(ref.type || "référence")
    };
  }

  function renderSources(message) {
    var refs = message.metadata && Array.isArray(message.metadata.content_references)
      ? message.metadata.content_references
      : [];
    var seen = Object.create(null);
    var sources = refs.map(sourceSummary).filter(function (source) {
      if (!source) return false;
      var key = [source.label, source.url, source.marker].join("|");
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });

    if (!sources.length) return "";

    return [
      '<details class="sources-details">',
      "<summary>Sources et références — " + sources.length + "</summary>",
      "<ul>",
      sources.map(function (source) {
        var label = source.url
          ? '<a href="' + escapeHtml(source.url) + '" rel="noopener noreferrer" target="_blank">' + escapeHtml(source.label) + "</a>"
          : "<strong>" + escapeHtml(source.label) + "</strong>";
        return "<li>" + label +
          '<span class="source-type">' + escapeHtml(source.type) + "</span>" +
          (source.marker ? '<code class="source-marker">' + escapeHtml(source.marker) + "</code>" : "") +
          "</li>";
      }).join(""),
      "</ul>",
      "</details>"
    ].join("\n");
  }

  function renderConversationMessage(message, id, extraClass) {
    var role = normalizeRole(message.role);
    var category = message.role === "assistant" ? " — " + message.descriptor.category : "";
    var msgDate = message.createTime ? formatMessageDate(message.createTime) : "";

    return [
      '<section class="msg ' + escapeHtml(extraClass || message.role) + '"' + (id ? ' id="' + escapeHtml(id) + '"' : "") + ">",
      '<div class="msg-head">',
      "<h2>" + escapeHtml(role + category) + "</h2>",
      msgDate ? '<div class="msg-date">' + escapeHtml(msgDate) + "</div>" : "",
      "</div>",
      '<div class="content">',
      message.hasMap ? renderMapSummary(message.places) : "",
      renderTextAsHtml(message.text),
      "</div>",
      message.role === "assistant" ? renderSources(message) : "",
      "</section>"
    ].join("\n");
  }

  function renderTechnicalEvent(message) {
    var role = normalizeRole(message.role);
    var category = message.descriptor.category;
    var msgDate = message.createTime ? formatMessageDate(message.createTime) : "";
    var raw = message.rawText || message.text || "(aucun contenu textuel)";
    var metadata = [
      message.contentType ? "type : " + message.contentType : "",
      message.recipient ? "destinataire : " + message.recipient : "",
      message.channel ? "canal : " + message.channel : "",
      message.id ? "id : " + message.id : ""
    ].filter(Boolean);

    return [
      '<details class="tech-event">',
      "<summary><strong>" + escapeHtml(role) + "</strong> — " + escapeHtml(category) +
        (msgDate ? '<time>' + escapeHtml(msgDate) + "</time>" : "") + "</summary>",
      metadata.length ? '<div class="tech-meta">' + metadata.map(escapeHtml).join(" · ") + "</div>" : "",
      '<pre><code>' + escapeHtml(raw) + "</code></pre>",
      "</details>"
    ].join("\n");
  }

  function activitySummary(messages) {
    var counts = Object.create(null);
    messages.forEach(function (message) {
      var category = message.descriptor.category;
      counts[category] = (counts[category] || 0) + 1;
    });

    var detail = Object.keys(counts).map(function (category) {
      return counts[category] + " " + category.toLowerCase();
    }).join(", ");

    return "Activité technique — " + messages.length + " élément" + (messages.length > 1 ? "s" : "") +
      (detail ? " (" + detail + ")" : "");
  }

  function renderActivity(messages, className) {
    if (!messages.length) return "";

    return [
      '<details class="activity-details ' + escapeHtml(className || "") + '">',
      "<summary>" + escapeHtml(activitySummary(messages)) + "</summary>",
      '<div class="activity-events">',
      messages.map(renderTechnicalEvent).join("\n"),
      "</div>",
      "</details>"
    ].join("\n");
  }

  function renderTurn(turn) {
    return [
      '<article class="turn" id="turn-' + turn.index + '">',
      renderConversationMessage(turn.user, "", "user"),
      renderAttachments(turn.user.attachments),
      renderActivity(turn.activity),
      turn.responses.map(function (message) {
        return renderConversationMessage(message, "", "assistant final-response");
      }).join("\n"),
      "</article>"
    ].join("\n");
  }

  function toHtml(convo, exportTitle) {
    var title = exportTitle || convo.title || "Untitled";
    var messages = getOrderedMessages(convo);
    var grouped = groupMessagesByTurn(messages);
    var created = convo.create_time ? new Date(convo.create_time * 1000).toISOString() : "";

    var navigation = renderPromptNavigation(grouped.turns);
    var body = (grouped.prelude.length ? renderActivity(grouped.prelude, "prelude-details") : "") +
      grouped.turns.map(renderTurn).join("\n");

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
      "main { box-sizing: border-box; max-width: 920px; margin: 0 auto; padding: 32px 22px 80px; }",
      ".prompt-nav { position: fixed; top: 24px; bottom: 24px; left: 24px; box-sizing: border-box; width: 280px; overflow-y: auto; padding: 16px; border: 1px solid #dddddd; border-radius: 14px; background: #ffffff; }",
      ".prompt-nav h2 { position: sticky; top: -16px; margin: -16px -16px 10px; padding: 16px; border-bottom: 1px solid #dddddd; background: #ffffff; font-size: 16px; z-index: 1; }",
      ".activity-controls { display: grid; gap: 7px; margin: 0 0 14px; }",
      ".activity-controls button { padding: 7px 9px; border: 1px solid #cccccc; border-radius: 8px; background: #f7f7f7; color: #222222; cursor: pointer; text-align: left; }",
      ".activity-controls button:hover, .activity-controls button:focus { border-color: #0969da; color: #0969da; }",
      ".prompt-nav ol { margin: 0; padding-left: 24px; }",
      ".prompt-nav li { margin: 0 0 10px; }",
      ".prompt-nav a { color: #333333; text-decoration: none; }",
      ".prompt-nav a:hover, .prompt-nav a:focus { color: #0969da; text-decoration: underline; }",
      "header { border-bottom: 1px solid #dddddd; margin-bottom: 28px; padding-bottom: 18px; }",
      "h1 { font-size: 26px; line-height: 1.25; margin: 0 0 8px; font-weight: 700; }",
      ".meta { color: #666666; font-size: 13px; }",
      ".turn { margin: 0 0 34px; scroll-margin-top: 24px; }",
      ".msg { margin: 0 0 12px; padding: 18px 18px 16px; border-radius: 14px; border: 1px solid #dddddd; }",
      ".msg h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; color: #555555; }",
      ".msg-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0 0 12px; }",
      ".msg-head h2 { margin: 0; }",
      ".msg-date { color: #666666; font-size: 12px; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, \"Liberation Mono\", monospace; }",
      ".msg.user { background: #f7f7f7; }",
      ".msg.assistant { background: #ffffff; }",
      ".msg.final-response { margin-top: 12px; }",
      ".content p { margin: 0 0 14px; }",
      ".content p:last-child { margin-bottom: 0; }",
      ".content a { color: #0969da; text-decoration: underline; text-underline-offset: 2px; }",
      ".content ul, .content ol { margin: 0 0 14px; padding-left: 26px; }",
      ".content li { margin: 4px 0; }",
      ".map-summary { margin: 0 0 18px; padding: 14px 16px; border: 1px solid #c9d7e8; border-radius: 12px; background: #f4f8fc; }",
      ".map-summary h3 { margin: 0 0 10px; font-size: 16px; }",
      ".map-summary ul { margin-bottom: 0; }",
      ".map-summary li { margin: 8px 0; }",
      ".place-details, .place-links { display: block; }",
      ".map-empty { margin: 0; color: #555555; }",
      ".activity-details, .attachments-details, .sources-details { margin: 10px 0 12px; border: 1px solid #d8d8d8; border-radius: 10px; background: #fafafa; }",
      ".activity-details > summary, .attachments-details > summary, .sources-details > summary { padding: 10px 12px; cursor: pointer; font-weight: 600; color: #444444; }",
      ".activity-events { padding: 0 10px 10px; }",
      ".tech-event { margin: 8px 0; border: 1px solid #dddddd; border-radius: 8px; background: #ffffff; }",
      ".tech-event > summary { padding: 8px 10px; cursor: pointer; }",
      ".tech-event time { float: right; margin-left: 12px; color: #666666; font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }",
      ".tech-meta { padding: 8px 12px 0; color: #666666; font-size: 12px; overflow-wrap: anywhere; }",
      ".tech-event pre { margin: 10px 12px 12px; white-space: pre-wrap; overflow-wrap: anywhere; }",
      ".attachments-details ul, .sources-details ul { margin: 0; padding: 0 16px 12px 34px; }",
      ".attachments-details li, .sources-details li { margin: 8px 0; }",
      ".attachment-meta, .attachment-id, .attachment-unavailable, .source-type, .source-marker { display: block; margin-top: 3px; color: #666666; font-size: 12px; overflow-wrap: anywhere; }",
      ".attachment-unavailable { color: #8a4b08; }",
      ".source-marker { white-space: normal; }",
      "pre { margin: 14px 0; padding: 14px 16px; overflow-x: auto; border-radius: 10px; background: #0d1117; color: #c9d1d9; }",
      "pre code { background: transparent; color: inherit; padding: 0; border-radius: 0; }",
      "code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, \"Liberation Mono\", monospace; font-size: 0.92em; background: #eeeeee; padding: 2px 5px; border-radius: 5px; }",
      ".code-lang { margin: 16px 0 -10px; padding: 5px 10px; display: inline-block; border-radius: 8px 8px 0 0; background: #222222; color: #dddddd; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }",
      "@media (min-width: 1280px) { main { margin-left: max(328px, calc((100vw - 920px) / 2)); margin-right: auto; } }",
      "@media (max-width: 1279px) { .prompt-nav { position: relative; inset: auto; width: auto; max-height: 260px; margin: 18px 22px 0; } }",
      "@media print { body { font-size: 12px; } .prompt-nav { display: none; } main { max-width: none; padding: 0; margin: 0; } .msg { break-inside: avoid; } .msg-head { display: block; } .msg-date { margin-top: 4px; } .activity-details, .attachments-details, .sources-details { break-inside: avoid; } }",
      "</style>",
      "</head>",
      "<body>",
      navigation,
      "<main>",
      "<header>",
      "<h1>" + escapeHtml(title) + "</h1>",
      created ? '<div class="meta">Created: ' + escapeHtml(created) + "</div>" : "",
      "</header>",
      body,
      "</main>",
      "<script>",
      "document.addEventListener('click', function (event) {",
      "  var button = event.target.closest('[data-activity-action]');",
      "  if (!button) return;",
      "  var open = button.getAttribute('data-activity-action') === 'open';",
      "  document.querySelectorAll('details.activity-details, details.activity-details details.tech-event').forEach(function (details) { details.open = open; });",
      "});",
      "</script>",
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
