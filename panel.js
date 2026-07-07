const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const exportBtn = document.getElementById("exportBtn");
const copySelectedBtn = document.getElementById("copySelectedBtn");

function setStatus(message, data) {
  const suffix = data ? "\n\n" + JSON.stringify(data, null, 2) : "";
  statusEl.textContent = message + suffix;
}

function evalInInspectedPage(source) {
  return new Promise((resolve, reject) => {
    chrome.devtools.inspectedWindow.eval(
      source,
      { useContentScriptContext: false },
      (result, exceptionInfo) => {
        if (exceptionInfo && exceptionInfo.isException) {
          reject(new Error(exceptionInfo.value || exceptionInfo.description || "Evaluation failed."));
          return;
        }
        resolve(result);
      }
    );
  });
}

const installerSource = `(${function () {
  function nowIso() {
    return new Date().toISOString();
  }

  function safeOuterHTML(node) {
    try {
      if (!node) return null;
      if (node.nodeType === Node.ELEMENT_NODE) return node.outerHTML;
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType === Node.COMMENT_NODE) return "<!--" + node.textContent + "-->";
      return String(node.nodeValue || node.nodeName || "");
    } catch (err) {
      return "[unavailable: " + err.message + "]";
    }
  }

  function nodeLabel(node) {
    if (!node) return "null";
    if (node === document) return "document";
    if (node === document.documentElement) return "html";
    if (node.nodeType === Node.TEXT_NODE) return "#text";
    if (node.nodeType === Node.COMMENT_NODE) return "#comment";
    if (node.nodeType !== Node.ELEMENT_NODE) return node.nodeName;

    const el = node;
    let label = el.tagName.toLowerCase();
    if (el.id) label += "#" + el.id;
    if (el.classList && el.classList.length) {
      label += "." + Array.from(el.classList).slice(0, 5).join(".");
    }
    return label;
  }

  function cssEscapeBasic(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function pathForNode(node) {
    try {
      if (!node) return "null";
      if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.COMMENT_NODE) {
        return pathForNode(node.parentNode) + " > " + nodeLabel(node);
      }
      if (node === document.documentElement) return "html";
      if (node.id) return node.tagName.toLowerCase() + "#" + cssEscapeBasic(node.id);

      const parts = [];
      let current = node;
      while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
        let part = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (parent) {
          const sameTagSiblings = Array.from(parent.children).filter(
            child => child.tagName === current.tagName
          );
          if (sameTagSiblings.length > 1) {
            part += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
          }
        }
        parts.unshift(part);
        current = current.parentElement;
      }
      return ["html"].concat(parts).join(" > ");
    } catch (err) {
      return "[path unavailable: " + err.message + "]";
    }
  }

  function summarizeNode(node) {
    return {
      label: nodeLabel(node),
      path: pathForNode(node),
      html: safeOuterHTML(node)
    };
  }

  function serializeStyleSheet(sheet, index) {
    const owner = sheet.ownerNode || null;
    const out = {
      index,
      href: sheet.href || null,
      disabled: !!sheet.disabled,
      media: sheet.media ? Array.from(sheet.media).join(", ") : "",
      ownerTag: owner && owner.tagName ? owner.tagName.toLowerCase() : null,
      ownerId: owner && owner.id ? owner.id : null,
      ownerClass: owner && owner.className ? String(owner.className) : null,
      accessible: true,
      cssText: ""
    };

    try {
      const rules = sheet.cssRules;
      const pieces = [];
      for (let i = 0; i < rules.length; i += 1) {
        pieces.push(rules[i].cssText);
      }
      out.cssText = pieces.join("\n");
    } catch (err) {
      out.accessible = false;
      out.error = err && err.message ? err.message : String(err);
      out.cssText = "";
    }
    return out;
  }

  function serializeAllStyleSheets() {
    return Array.from(document.styleSheets).map(serializeStyleSheet);
  }

  function joinedAccessibleCss(sheets) {
    return sheets.map(sheet => {
      const source = sheet.href || (sheet.ownerTag ? `<${sheet.ownerTag}> index ${sheet.index}` : `stylesheet ${sheet.index}`);
      if (!sheet.accessible) {
        return `/* ${source}\n   inaccessible: ${sheet.error || "unknown reason"}\n*/`;
      }
      return `/* ${source} */\n${sheet.cssText}`;
    }).join("\n\n");
  }

  function makeCssSummary(initial, current) {
    const max = Math.max(initial.length, current.length);
    const changes = [];
    for (let i = 0; i < max; i += 1) {
      const before = initial[i] || null;
      const after = current[i] || null;
      const beforeKey = before ? `${before.href || "inline"}|${before.ownerTag || ""}|${before.ownerId || ""}|${before.index}` : "missing";
      const afterKey = after ? `${after.href || "inline"}|${after.ownerTag || ""}|${after.ownerId || ""}|${after.index}` : "missing";
      if (!before || !after) {
        changes.push({ index: i, status: before ? "removed" : "added", before, after });
        continue;
      }
      if (before.accessible !== after.accessible || before.cssText !== after.cssText || before.disabled !== after.disabled || beforeKey !== afterKey) {
        changes.push({
          index: i,
          status: "changed",
          sourceBefore: before.href || `${before.ownerTag || "inline"}#${before.ownerId || ""}`,
          sourceAfter: after.href || `${after.ownerTag || "inline"}#${after.ownerId || ""}`,
          accessibleBefore: before.accessible,
          accessibleAfter: after.accessible,
          disabledBefore: before.disabled,
          disabledAfter: after.disabled,
          beforeLength: before.cssText ? before.cssText.length : 0,
          afterLength: after.cssText ? after.cssText.length : 0
        });
      }
    }
    return changes;
  }

  function installCapture() {
    if (window.__domCssCapture && window.__domCssCapture.__installed) {
      return window.__domCssCapture.status();
    }

    const state = {
      __installed: true,
      startedAt: nowIso(),
      url: location.href,
      title: document.title,
      initialHtml: document.documentElement.outerHTML,
      initialCss: serializeAllStyleSheets(),
      mutations: [],
      cssChangeEvents: [],
      cssPollMs: 1000,
      cssPollLimit: 200,
      lastCssJoined: "",
      observer: null,
      cssInterval: null
    };
    state.lastCssJoined = joinedAccessibleCss(state.initialCss);

    state.observer = new MutationObserver(function (mutationList) {
      for (const mutation of mutationList) {
        const record = {
          time: nowIso(),
          type: mutation.type,
          target: summarizeNode(mutation.target)
        };

        if (mutation.type === "attributes") {
          record.attributeName = mutation.attributeName;
          record.oldValue = mutation.oldValue;
          record.newValue = mutation.target && mutation.target.getAttribute ? mutation.target.getAttribute(mutation.attributeName) : null;
        }

        if (mutation.type === "characterData") {
          record.oldValue = mutation.oldValue;
          record.newValue = mutation.target ? mutation.target.textContent : null;
        }

        if (mutation.type === "childList") {
          record.addedNodes = Array.from(mutation.addedNodes).map(summarizeNode);
          record.removedNodes = Array.from(mutation.removedNodes).map(summarizeNode);
        }

        state.mutations.push(record);
        if (state.mutations.length > 10000) {
          state.mutations.splice(0, state.mutations.length - 10000);
        }
      }
    });

    state.observer.observe(document.documentElement, {
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      characterDataOldValue: true,
      childList: true,
      subtree: true
    });

    state.cssInterval = window.setInterval(function () {
      try {
        const current = serializeAllStyleSheets();
        const joined = joinedAccessibleCss(current);
        if (joined !== state.lastCssJoined) {
          state.cssChangeEvents.push({
            time: nowIso(),
            summary: makeCssSummary(state.initialCss, current)
          });
          if (state.cssChangeEvents.length > state.cssPollLimit) {
            state.cssChangeEvents.splice(0, state.cssChangeEvents.length - state.cssPollLimit);
          }
          state.lastCssJoined = joined;
        }
      } catch (err) {
        state.cssChangeEvents.push({ time: nowIso(), error: err.message || String(err) });
      }
    }, state.cssPollMs);

    state.status = function () {
      const currentCss = serializeAllStyleSheets();
      return {
        installed: true,
        startedAt: state.startedAt,
        url: state.url,
        title: state.title,
        mutationCount: state.mutations.length,
        cssChangeEventCount: state.cssChangeEvents.length,
        stylesheetCount: currentCss.length,
        accessibleStylesheetCount: currentCss.filter(sheet => sheet.accessible).length,
        inaccessibleStylesheetCount: currentCss.filter(sheet => !sheet.accessible).length
      };
    };

    state.stop = function () {
      if (state.observer) state.observer.disconnect();
      if (state.cssInterval) window.clearInterval(state.cssInterval);
      state.observer = null;
      state.cssInterval = null;
      return state.status();
    };

    state.export = function () {
      const currentCss = serializeAllStyleSheets();
      const currentHtml = document.documentElement.outerHTML;
      const cssSummary = makeCssSummary(state.initialCss, currentCss);
      return {
        meta: {
          tool: "DOM + CSS DevTools Capture",
          version: "1.0.0",
          exportedAt: nowIso(),
          startedAt: state.startedAt,
          url: location.href,
          originalUrlAtStart: state.url,
          title: document.title,
          userAgent: navigator.userAgent,
          note: "This is a live DOM/CSS snapshot for developer handoff. It is not a clean patch against the site's source files."
        },
        initialHtml: state.initialHtml,
        currentHtml,
        initialCss: state.initialCss,
        currentCss,
        accessibleCssText: joinedAccessibleCss(currentCss),
        cssChangeSummary: cssSummary,
        cssChangeEvents: state.cssChangeEvents,
        mutations: state.mutations
      };
    };

    window.__domCssCapture = state;
    return state.status();
  }

  return installCapture();
}.toString()})();`;

async function ensureInstalled() {
  return evalInInspectedPage(installerSource);
}

async function getStatus() {
  return evalInInspectedPage("window.__domCssCapture ? window.__domCssCapture.status() : { installed: false }");
}

async function stopCapture() {
  return evalInInspectedPage("window.__domCssCapture ? window.__domCssCapture.stop() : { installed: false }");
}

async function exportCapture() {
  return evalInInspectedPage("window.__domCssCapture ? window.__domCssCapture.export() : null");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function safeFilenamePart(value) {
  return String(value || "page")
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "page";
}

function timestampForFilename(date = new Date()) {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
    "-",
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds())
  ].join("");
}

function crc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = crc32Table();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU16(array, offset, value) {
  array[offset] = value & 0xff;
  array[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32(array, offset, value) {
  array[offset] = value & 0xff;
  array[offset + 1] = (value >>> 8) & 0xff;
  array[offset + 2] = (value >>> 16) & 0xff;
  array[offset + 3] = (value >>> 24) & 0xff;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

function concatUint8Arrays(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function makeZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { time, date } = dosDateTime();

  for (const file of files) {
    const filenameBytes = encoder.encode(file.name);
    const dataBytes = typeof file.content === "string" ? encoder.encode(file.content) : file.content;
    const checksum = crc32(dataBytes);

    const local = new Uint8Array(30 + filenameBytes.length);
    writeU32(local, 0, 0x04034b50);
    writeU16(local, 4, 20);
    writeU16(local, 6, 0);
    writeU16(local, 8, 0);
    writeU16(local, 10, time);
    writeU16(local, 12, date);
    writeU32(local, 14, checksum);
    writeU32(local, 18, dataBytes.length);
    writeU32(local, 22, dataBytes.length);
    writeU16(local, 26, filenameBytes.length);
    writeU16(local, 28, 0);
    local.set(filenameBytes, 30);

    localParts.push(local, dataBytes);

    const central = new Uint8Array(46 + filenameBytes.length);
    writeU32(central, 0, 0x02014b50);
    writeU16(central, 4, 20);
    writeU16(central, 6, 20);
    writeU16(central, 8, 0);
    writeU16(central, 10, 0);
    writeU16(central, 12, time);
    writeU16(central, 14, date);
    writeU32(central, 16, checksum);
    writeU32(central, 20, dataBytes.length);
    writeU32(central, 24, dataBytes.length);
    writeU16(central, 28, filenameBytes.length);
    writeU16(central, 30, 0);
    writeU16(central, 32, 0);
    writeU16(central, 34, 0);
    writeU16(central, 36, 0);
    writeU32(central, 38, 0);
    writeU32(central, 42, offset);
    central.set(filenameBytes, 46);

    centralParts.push(central);
    offset += local.length + dataBytes.length;
  }

  const centralDirectory = concatUint8Arrays(centralParts);
  const end = new Uint8Array(22);
  writeU32(end, 0, 0x06054b50);
  writeU16(end, 4, 0);
  writeU16(end, 6, 0);
  writeU16(end, 8, files.length);
  writeU16(end, 10, files.length);
  writeU32(end, 12, centralDirectory.length);
  writeU32(end, 16, offset);
  writeU16(end, 20, 0);

  return new Blob([...localParts, centralDirectory, end], { type: "application/zip" });
}

function buildReadme(payload) {
  return `DOM + CSS DevTools Capture export\n\nURL: ${payload.meta.url}\nTitle: ${payload.meta.title}\nStarted at: ${payload.meta.startedAt}\nExported at: ${payload.meta.exportedAt}\n\nFiles in this ZIP:\n\n- current-dom.html\n  The live DOM at export time. This includes DOM edits made in the Elements panel and runtime DOM changes made by scripts.\n\n- initial-dom.html\n  The live DOM when capture started. Useful only if capture was started before editing.\n\n- accessible-current-css.css\n  All stylesheet rules that page JavaScript could access at export time. Cross-origin/protected stylesheets may be omitted or marked inaccessible.\n\n- current-css-snapshot.json\n  Per-stylesheet CSS snapshot at export time, including inaccessible stylesheet metadata and errors.\n\n- initial-css-snapshot.json\n  Per-stylesheet CSS snapshot when capture started.\n\n- css-change-summary.json\n  A simple before/after summary of stylesheet changes detected during export.\n\n- css-change-events.json\n  Polling-based CSS change events detected during capture.\n\n- mutation-log.json\n  DOM mutations observed while capture was running.\n\n- full-export.json\n  Everything above in one structured JSON file.\n\nImportant caveats:\n\nThis is not a source-code patch. It is a live browser snapshot. A developer still needs to map the final DOM and CSS back into the site templates, components and source CSS files.\n\nDevTools' Elements panel changes mutate the live DOM. This extension records that live DOM and observed mutations, but it cannot tell which React/Vue/template/PHP/Liquid/etc. source file caused the original markup.\n\nCSS rules from cross-origin stylesheets may be blocked by browser security and cannot always be exported through page JavaScript.\n`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

startBtn.addEventListener("click", async () => {
  try {
    const status = await ensureInstalled();
    setStatus("Capture is running. Make your Elements/CSS edits, then click Export ZIP.", status);
  } catch (err) {
    setStatus("Could not start capture: " + err.message);
  }
});

stopBtn.addEventListener("click", async () => {
  try {
    const status = await stopCapture();
    setStatus("Capture stopped. You can still export the latest snapshot if the page has not reloaded.", status);
  } catch (err) {
    setStatus("Could not stop capture: " + err.message);
  }
});

exportBtn.addEventListener("click", async () => {
  try {
    let payload = await exportCapture();
    if (!payload) {
      await ensureInstalled();
      payload = await exportCapture();
    }

    const files = [
      { name: "README.txt", content: buildReadme(payload) },
      { name: "current-dom.html", content: payload.currentHtml },
      { name: "initial-dom.html", content: payload.initialHtml },
      { name: "accessible-current-css.css", content: payload.accessibleCssText },
      { name: "current-css-snapshot.json", content: JSON.stringify(payload.currentCss, null, 2) },
      { name: "initial-css-snapshot.json", content: JSON.stringify(payload.initialCss, null, 2) },
      { name: "css-change-summary.json", content: JSON.stringify(payload.cssChangeSummary, null, 2) },
      { name: "css-change-events.json", content: JSON.stringify(payload.cssChangeEvents, null, 2) },
      { name: "mutation-log.json", content: JSON.stringify(payload.mutations, null, 2) },
      { name: "full-export.json", content: JSON.stringify(payload, null, 2) }
    ];

    const zip = makeZip(files);
    const filename = `dom-css-capture-${safeFilenamePart(payload.meta.url)}-${timestampForFilename()}.zip`;
    downloadBlob(zip, filename);

    setStatus("Exported ZIP.", {
      filename,
      url: payload.meta.url,
      mutationCount: payload.mutations.length,
      stylesheetCount: payload.currentCss.length,
      accessibleStylesheetCount: payload.currentCss.filter(sheet => sheet.accessible).length,
      inaccessibleStylesheetCount: payload.currentCss.filter(sheet => !sheet.accessible).length,
      cssChangeSummaryCount: payload.cssChangeSummary.length
    });
  } catch (err) {
    setStatus("Could not export: " + err.message);
  }
});

copySelectedBtn.addEventListener("click", async () => {
  try {
    const selectedHtml = await evalInInspectedPage("$0 ? $0.outerHTML : null");
    if (!selectedHtml) {
      setStatus("No selected element found in the Elements panel.");
      return;
    }
    await navigator.clipboard.writeText(selectedHtml);
    setStatus("Copied the selected element's outerHTML to the clipboard.");
  } catch (err) {
    setStatus("Could not copy selected element HTML: " + err.message);
  }
});

getStatus()
  .then(status => setStatus(status.installed ? "Capture is already available on this page." : "Not started.", status))
  .catch(() => setStatus("Not started."));
