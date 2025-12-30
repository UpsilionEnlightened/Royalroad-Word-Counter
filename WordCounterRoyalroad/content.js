const PARENT_SELECTOR = "div.chapter-inner.chapter-content";
(function () {
  let isUpdatingBadge = false;
  const LOG_PREFIX = "[WordCounter]";
  const MAX_TRIES = 20, TRY_MS = 300;
  const DRAG_THRESHOLD_PX = 5;

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
  //Mouse checks; for dragging box and for copying count
  function attachDragAndClick(b) {
    if (b.dataset.dragAttached === "1") return;
    b.dataset.dragAttached = "1";

    let pointerId = null;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;
    let dragging = false;

    function setPos(left, top) {
      b.style.left = `${left}px`;
      b.style.top = `${top}px`;
      b.style.right = "auto";
      b.style.bottom = "auto";
    }

    //Press on count; initializes checks for mouse movement
    b.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointerId = e.pointerId;
      b.setPointerCapture(pointerId);
      const r = b.getBoundingClientRect();
      startLeft = r.left; startTop = r.top;
      startX = e.clientX; startY = e.clientY;
      dragging = false;
      b.style.cursor = "grabbing";
      e.preventDefault();
    });

    //Mouse movement; if mouse is pressed on count, log movement
    b.addEventListener("pointermove", (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      const dx = e.clientX - startX; const dy = e.clientY - startY;
    
      //If drag amount exceeds threshold, do not copy
      if (!dragging) {
        if ((dx * dx + dy * dy) < (DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX)) return;
        dragging = true;
      }
      setPos(startLeft + dx, startTop + dy);
      e.preventDefault();
    });

    //Mouse press released; drag or copy
    b.addEventListener("pointerup", (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      b.releasePointerCapture(pointerId);
      pointerId = null;
      b.style.cursor = "grab";

      //if dragging, stop; no actions must now be taken
      if (dragging) {
        dragging = false;
        return;
      }

      //copy count
      const n = b.dataset.count || "";
      navigator.clipboard?.writeText(n);
      b.classList.add("copied");
      b.textContent = `Copied: ${n}`;
      setTimeout(() => {
        b.classList.remove("copied");
        b.textContent = `Words: ${n}`;
      }, 900);
    });

    b.addEventListener("lostpointercapture", () => {
      pointerId = null;
      dragging = false;
      b.style.cursor = "grab";
    });

    b.style.cursor = "grab";
  }

  function ensureBadge(doc) {
    let b = doc.getElementById("oswc-badge");
    if (!b) {
      b = doc.createElement("div");
      b.id = "oswc-badge";
      b.title = "Click to copy";
      (doc.body || doc.documentElement).appendChild(b);
      attachDragAndClick(b);
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
  let recountScheduled = false;
  function scheduleRecount(win) {
    if (isUpdatingBadge) return;
    if (recountScheduled) return;
    recountScheduled = true;
    setTimeout(() => {
      recountScheduled = false;
      tryCountHere(win);
    }, 250);
  }

  function attachObserver(win) {
    const doc = win.document;
    const parent = doc.querySelector(PARENT_SELECTOR);
    if (!parent) return;

    const obs = new MutationObserver((mutList) => {
      // Ignore mutations that involve extension badge
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
