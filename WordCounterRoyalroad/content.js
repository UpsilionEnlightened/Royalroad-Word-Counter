const PARENT_SELECTOR = "div.chapter-inner.chapter-content";
/***** No edits needed below *****/
(function () {
  let isUpdatingBadge = false;
  const LOG_PREFIX = "[WordCounter]";
  const MAX_TRIES = 20, TRY_MS = 300;

  function log(...args) { try { console.log(LOG_PREFIX, ...args); } catch(_){} }

    function wordCount(text) {
    const m = text.replace(/\s+/g, " ").trim().match(/[\p{L}\p{N}’'-]+/gu);
    return m ? m.length : 0;
  }

  // Safer text extraction (fallback if innerText is empty)
  function visibleInnerText(el) {
    if (!el) return "";
    const t = el.innerText ?? "";
    if (t && t.trim()) return t;

    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TITLE") {
          return NodeFilter.FILTER_REJECT;
        }
        const cs = getComputedStyle(p);
        if (cs.display === "none" || cs.visibility === "hidden") return NodeFilter.FILTER_REJECT;
        if (p.getAttribute("aria-hidden") === "true") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let s = "", cur;
    while ((cur = tw.nextNode())) s += cur.nodeValue;
    return s;
  }

  function ensureBadge(doc) {
    let b = doc.getElementById("oswc-badge");
    if (!b) {
      b = doc.createElement("div");
      b.id = "oswc-badge";
      b.title = "Click to copy";
      b.addEventListener("click", () => {
        const n = b.dataset.count || "";
        navigator.clipboard?.writeText(n);
        b.classList.add("copied");
        b.textContent = `Copied: ${n}`;
        setTimeout(() => {
          b.classList.remove("copied");
          b.textContent = `Words: ${n}`;
        }, 900);
      });
      doc.documentElement.appendChild(b);
    }
    return b;
  }

  function updateBadge(doc, n) {
    isUpdatingBadge = true;       // prevent observer feedback
    const b = ensureBadge(doc);
    b.dataset.count = String(n);
    b.textContent = `Words: ${n}`;
    isUpdatingBadge = false;
  }

  function countInDocument(doc) {
    const parent = doc.querySelector(PARENT_SELECTOR);
    if (!parent) return null;
    const text = visibleInnerText(parent);
    return wordCount(text);
  }

  function tryCountHere(win) {
    const c = countInDocument(win.document);
    if (typeof c === "number") {
      log("Counted", c, "words in", win.location?.href);
      updateBadge(win.document, c);
      return true;
    }
    return false;
  }

  // Debounce mutation-triggered recounts
  let recountTimer = null;
  function scheduleRecount(win) {
    if (isUpdatingBadge) return;     // ignore own badge changes
    if (recountTimer) clearTimeout(recountTimer);
    recountTimer = setTimeout(() => {
      recountTimer = null;
      tryCountHere(win);
    }, 250);
  }

  function attachObserver(win) {
    const doc = win.document;
    const parent = doc.querySelector(PARENT_SELECTOR);
    if (!parent) return;

    const obs = new MutationObserver((mutList) => {
      // Ignore mutations that involve our badge
      for (const m of mutList) {
        if (m.target?.id === "oswc-badge" || (m.addedNodes && [...m.addedNodes].some(n => n.id === "oswc-badge"))) {
          return;
        }
      }
      scheduleRecount(win);
    });
    obs.observe(parent, { subtree: true, childList: true, characterData: true });
    log("Observer attached to parent container");
  }

  function initInWindow(win) {
    let tries = 0;
    const t = setInterval(() => {
      if (tryCountHere(win) || ++tries >= MAX_TRIES) {
        clearInterval(t);
        attachObserver(win);
      }
    }, TRY_MS);
  }

  // Run in this window
  initInWindow(window);

  // Also check same-origin iframes
  for (const f of document.querySelectorAll("iframe")) {
    try {
      if (f.contentWindow && f.contentDocument && f.contentDocument.documentElement) {
        initInWindow(f.contentWindow);
      }
    } catch (_) {
    }
  }
})();