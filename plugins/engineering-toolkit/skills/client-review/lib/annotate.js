// client-review annotation layer — plain classic script (NOT a module),
// injected into an arbitrary HTML document by inject.mjs so a non-technical
// client can comment on it fully offline (double-click open, file://, no
// server, no iframe, no postMessage parent — this is the offline cousin of
// brain-axi's lib/review/sdk.js, which only works embedded in that project's
// server+iframe review chrome; none of that coupling exists here).
//
// Contract (fixed — read.mjs / inject.mjs depend on it):
//   - Comments live in TWO places: the embedded
//     <script type="application/json" id="brain-comments"> blob in this doc,
//     and localStorage (authoritative for THIS browser while editing).
//   - localStorage keys: "client-review:doc:<docKey>" (this doc's working
//     comment set) and "client-review:author" (remembered name/role).
//   - docKey = document.documentElement.dataset.crDoc, else "default".
//   - Comment shape: { id, anchor, body, author, role, at, status, order,
//     replies:[{body,author,role,at}] }. Anchor is one of
//     {type:"element",selector,snippet}, {type:"text",commonAncestorSelector,
//     quote,start:{selector,offset},end:{selector,offset}}, or
//     {type:"image",selector,x,y,snippet}.
//
// Defensive by construction: every localStorage / JSON.parse / querySelector
// call is wrapped so a missing or malformed blob, a locked-down file://
// storage, or a stale selector never throws into the host page.
(function () {
  'use strict';

  if (window.__crAnnotateLoaded) return;
  window.__crAnnotateLoaded = true;

  // ---- constants ----------------------------------------------------------

  var SCHEMA = 'client-review/1';
  var AUTHOR_KEY = 'client-review:author';
  var DOC_KEY_PREFIX = 'client-review:doc:';
  var SNIPPET_CAP = 120;
  var QUOTE_CAP = 400;
  var MAX_PATH_SEGMENTS = 5;
  var NATIVE_SKIP_SELECTOR = 'button, input, select, textarea, a, label, summary, [contenteditable]';
  var FLASH_START_MS = 500;
  var FLASH_END_MS = 1300;
  var CARD_FOCUS_MS = 1600;
  var TOAST_MS = 2200;

  // Two-stage model: 'draft' = CLIENT stage (default, current behavior —
  // create/edit/delete own comments), 'returned' = REVIEWER stage (read the
  // client's comments, reply to them, export markdown instead of HTML). Read
  // once at load from <html data-cr-stage>; inject.mjs sets the default to
  // "draft" and preserves whatever a re-opened file already carries.
  // exportDoc() stamps the DOWNLOADED copy's <html> as "returned" so that
  // when the client's export comes back and is reopened, it boots straight
  // into reviewer mode — see exportDoc() below.
  var STAGE = (document.documentElement.getAttribute('data-cr-stage') || 'draft');

  // ---- module state ---------------------------------------------------------

  var state = { comments: [], author: null };
  var commentMode = false;
  var captureMode = 'anchor'; // 'anchor' (default: element/text/image) | 'pin' (free pin anywhere)
  var railOpen = false;
  var justHandledSelection = false;
  var resizeTimer = null;
  var pendingAuthorCallback = null;
  var pendingAnchor = null;
  var pendingOrderEl = null;
  var markerNodesByCommentId = {};
  var hoverRafPending = false;
  var lastMoveTarget = null;

  // UI element refs, assigned in init()
  var markerLayerEl, railEl, railUi, toggles, authorModal, composer, hoverBoxEl;

  // ---- small DOM helpers ----------------------------------------------------

  function ce(tag, className) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  function actionBtn(label, onClick, danger) {
    var b = ce('button', 'cr-action-btn' + (danger ? ' danger' : ''));
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  // ---- cssPath / selector building (adapted from lib/review/sdk.js) ---------

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_\-]/g, '\\$&');
  }

  function cssPath(el) {
    var segments = [];
    var node = el;
    while (node && node.nodeType === 1 && segments.length < MAX_PATH_SEGMENTS) {
      if (node.id) {
        segments.unshift('#' + cssEscape(node.id));
        break; // id short-circuits the walk
      }
      var seg = node.tagName ? node.tagName.toLowerCase() : '*';
      var parent = node.parentElement;
      if (parent) {
        var siblings = [];
        for (var i = 0; i < parent.children.length; i++) {
          if (parent.children[i].tagName === node.tagName) siblings.push(parent.children[i]);
        }
        if (siblings.length > 1) {
          var idx = siblings.indexOf(node) + 1;
          seg += ':nth-of-type(' + idx + ')';
        }
      }
      segments.unshift(seg);
      node = parent;
    }
    return segments.join(' > ');
  }

  function nearestElement(node) {
    while (node && node.nodeType !== 1) node = node.parentNode;
    return node;
  }

  function shouldSkip(el) {
    if (!el || el.nodeType !== 1 || typeof el.closest !== 'function') return true;
    if (el.closest(NATIVE_SKIP_SELECTOR)) return true;
    if (el.closest('[data-cr-ui]')) return true;
    return false;
  }

  function clampPct(n) {
    if (!isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
  }

  function generateId() {
    generateId.n = (generateId.n || 0) + 1;
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + generateId.n.toString(36);
  }

  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    try {
      return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      return iso;
    }
  }

  // ---- text anchor boundary build/resolve ------------------------------------
  //
  // The contract's text anchor uses {selector, offset} boundaries (no child-
  // index path, unlike sdk.js's buildBoundary) — offset is a plain CHARACTER
  // offset into the nearest element ancestor's own textContent. Built with
  // the native Range API (Range#toString gives the exact rendered text
  // between two points, matching what a selection's own .toString() would
  // read) and resolved back the same way with a text-node TreeWalker, so
  // building and resolving stay consistent with each other.

  function buildTextBoundary(node, offset) {
    var el = node.nodeType === 1 ? node : nearestElement(node);
    var off = 0;
    try {
      var r = document.createRange();
      r.setStart(el, 0);
      r.setEnd(node, offset);
      off = r.toString().length;
    } catch (e) {
      off = 0;
    }
    return { selector: cssPath(el), offset: off };
  }

  function resolveTextBoundaryPoint(boundary) {
    if (!boundary || !boundary.selector) return null;
    var el;
    try {
      el = document.querySelector(boundary.selector);
    } catch (e) {
      return null;
    }
    if (!el) return null;
    var target = typeof boundary.offset === 'number' ? boundary.offset : 0;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var remaining = target;
    var node, last = null;
    while ((node = walker.nextNode())) {
      last = node;
      var len = node.nodeValue.length;
      if (remaining <= len) return { node: node, offset: remaining };
      remaining -= len;
    }
    if (last) return { node: last, offset: last.nodeValue.length };
    return { node: el, offset: 0 };
  }

  // ---- doc-order rank (for the `order` field) --------------------------------
  //
  // "compute from anchor element's position via a tree walk" — an integer
  // rank from a single document-order element walk, times 10000 plus (for
  // text anchors) the start offset as an intra-element tiebreaker, so two
  // comments anchored inside the same paragraph still order sensibly
  // relative to each other.

  var ELEMENT_RANK_FALLBACK = 999999999;

  function elementRank(el) {
    if (!el) return ELEMENT_RANK_FALLBACK;
    var root = document.body || document.documentElement;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
    var i = 0, node;
    while ((node = walker.nextNode())) {
      i++;
      if (node === el) return i;
    }
    return ELEMENT_RANK_FALLBACK;
  }

  function resolveAnchorPrimaryElement(anchor) {
    if (!anchor) return null;
    try {
      if (anchor.type === 'element' || anchor.type === 'image' || anchor.type === 'pin') {
        return document.querySelector(anchor.selector);
      }
      if (anchor.type === 'text') {
        if (anchor.start && anchor.start.selector) {
          var el = document.querySelector(anchor.start.selector);
          if (el) return el;
        }
        if (anchor.commonAncestorSelector) return document.querySelector(anchor.commonAncestorSelector);
      }
    } catch (e) {
      /* invalid/stale selector */
    }
    return null;
  }

  function computeOrder(anchor, orderElHint) {
    var el = orderElHint || resolveAnchorPrimaryElement(anchor);
    var rank = elementRank(el);
    var tie = 0;
    if (anchor && anchor.type === 'text' && anchor.start && typeof anchor.start.offset === 'number') {
      tie = Math.max(0, Math.min(9999, anchor.start.offset));
    }
    return rank * 10000 + tie;
  }

  // ---- storage: docKey / embedded blob / localStorage ------------------------

  function docKey() {
    var ds = document.documentElement && document.documentElement.dataset;
    return (ds && ds.crDoc) || 'default';
  }

  function localDocKey() {
    return DOC_KEY_PREFIX + docKey();
  }

  function defaultRole() {
    // Reviewer stage always signs as 'reviewer' regardless of any data-cr-role
    // hint — the two-stage model ties role to stage, not to a separate flag.
    if (STAGE === 'returned') return 'reviewer';
    var ds = document.documentElement && document.documentElement.dataset;
    return ds && ds.crRole === 'reviewer' ? 'reviewer' : 'client';
  }

  function loadEmbeddedBlob() {
    try {
      var el = document.getElementById('brain-comments');
      if (!el) return { schema: SCHEMA, comments: [] };
      var txt = (el.textContent || '').trim();
      if (!txt) return { schema: SCHEMA, comments: [] };
      var parsed = JSON.parse(txt);
      if (Array.isArray(parsed)) return { schema: SCHEMA, comments: parsed };
      if (parsed && Array.isArray(parsed.comments)) return parsed;
      return { schema: SCHEMA, comments: [] };
    } catch (e) {
      return { schema: SCHEMA, comments: [] };
    }
  }

  function readLocalDoc() {
    try {
      var raw = localStorage.getItem(localDocKey());
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.comments)) return parsed;
      return null;
    } catch (e) {
      return null;
    }
  }

  function writeLocalDoc() {
    try {
      localStorage.setItem(localDocKey(), JSON.stringify({ schema: SCHEMA, comments: state.comments }));
    } catch (e) {
      /* quota / privacy-mode / file:// storage restrictions — never throw */
    }
  }

  function readAuthor() {
    try {
      var raw = localStorage.getItem(AUTHOR_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed.name === 'string' && parsed.name) return parsed;
      return null;
    } catch (e) {
      return null;
    }
  }

  function writeAuthor(author) {
    try {
      localStorage.setItem(AUTHOR_KEY, JSON.stringify(author));
    } catch (e) {
      /* ignore */
    }
  }

  // Hydration rule: embedded blob is the baseline; localStorage (this
  // browser's in-progress edits) wins when present; otherwise seed
  // localStorage from the baseline.
  function hydrate() {
    var baseline = loadEmbeddedBlob();
    var local = readLocalDoc();
    if (local) {
      state.comments = local.comments;
    } else {
      state.comments = baseline.comments;
      writeLocalDoc();
    }
  }

  function persist() {
    writeLocalDoc();
  }

  // ---- comment mutation helpers ----------------------------------------------

  function isOwn(comment) {
    return !!(state.author && comment && comment.author === state.author.name && comment.role === state.author.role);
  }

  function isOwnReply(reply) {
    return !!(state.author && reply && reply.author === state.author.name && reply.role === state.author.role);
  }

  function deleteComment(comment) {
    if (!isOwn(comment)) return;
    var i = state.comments.indexOf(comment);
    if (i !== -1) state.comments.splice(i, 1);
    persist();
    renderAll();
  }

  function sortedComments() {
    var decorated = state.comments.map(function (c, i) {
      return { c: c, i: i };
    });
    decorated.sort(function (a, b) {
      var oa = typeof a.c.order === 'number' ? a.c.order : Infinity;
      var ob = typeof b.c.order === 'number' ? b.c.order : Infinity;
      if (oa !== ob) return oa - ob;
      var ta = a.c.at || '';
      var tb = b.c.at || '';
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.i - b.i;
    });
    return decorated.map(function (w) {
      return w.c;
    });
  }

  // ---- author-name modal ------------------------------------------------------

  function buildAuthorModal() {
    var overlay = ce('div', 'cr-modal-overlay');
    overlay.setAttribute('data-cr-ui', '');
    var modal = ce('div', 'cr-modal');
    var title = ce('h3', 'cr-modal-title');
    title.textContent = "What's your name?";
    var sub = ce('p', 'cr-modal-sub');
    sub.textContent = "So your comments are signed. We'll remember it on this device.";
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Your name';
    var err = ce('div', 'cr-inline-err');
    var actions = ce('div', 'cr-modal-actions');
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    var save = ce('button', 'cr-modal-save');
    save.type = 'button';
    save.textContent = 'Continue';
    actions.appendChild(cancel);
    actions.appendChild(save);
    modal.appendChild(title);
    modal.appendChild(sub);
    modal.appendChild(input);
    modal.appendChild(err);
    modal.appendChild(actions);
    overlay.appendChild(modal);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) cancelAuthorModal();
    });
    modal.addEventListener('click', function (e) {
      e.stopPropagation();
    });
    cancel.addEventListener('click', function (e) {
      e.stopPropagation();
      cancelAuthorModal();
    });
    save.addEventListener('click', function (e) {
      e.stopPropagation();
      submitAuthorModal();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitAuthorModal();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelAuthorModal();
      }
    });

    return { overlay: overlay, input: input, err: err };
  }

  function showAuthorModal(cb) {
    pendingAuthorCallback = cb;
    authorModal.input.value = '';
    authorModal.err.textContent = '';
    authorModal.err.classList.remove('show');
    authorModal.overlay.classList.add('open');
    authorModal.input.focus();
  }

  function cancelAuthorModal() {
    pendingAuthorCallback = null;
    authorModal.overlay.classList.remove('open');
  }

  function submitAuthorModal() {
    var name = (authorModal.input.value || '').trim();
    if (!name) {
      authorModal.err.textContent = 'Please enter a name.';
      authorModal.err.classList.add('show');
      return;
    }
    var author = { name: name, role: defaultRole() };
    state.author = author;
    writeAuthor(author);
    authorModal.overlay.classList.remove('open');
    var cb = pendingAuthorCallback;
    pendingAuthorCallback = null;
    if (cb) cb(author);
  }

  // Runs `cb(author)` immediately if we already know who's commenting;
  // otherwise prompts once (per the "first comment" rule) and runs it after.
  // Cancelling the prompt aborts whatever action asked for the author.
  function ensureAuthor(cb) {
    if (state.author) {
      cb(state.author);
      return;
    }
    showAuthorModal(cb);
  }

  // ---- new-comment composer ---------------------------------------------------

  function buildComposer() {
    var el = ce('div', 'cr-composer');
    el.setAttribute('data-cr-ui', '');
    var ta = document.createElement('textarea');
    ta.placeholder = 'Add a comment…';
    ta.rows = 3;
    var err = ce('div', 'cr-composer-err');
    var actions = ce('div', 'cr-composer-actions');
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    var save = ce('button', 'cr-composer-save');
    save.type = 'button';
    save.textContent = 'Comment';
    actions.appendChild(cancel);
    actions.appendChild(save);
    el.appendChild(ta);
    el.appendChild(err);
    el.appendChild(actions);

    el.addEventListener('click', function (e) {
      e.stopPropagation();
    });
    cancel.addEventListener('click', function (e) {
      e.stopPropagation();
      closeComposer();
    });
    save.addEventListener('click', function (e) {
      e.stopPropagation();
      commitComposer();
    });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeComposer();
      }
    });

    return { el: el, ta: ta, err: err };
  }

  function positionFloating(el, point) {
    var margin = 12;
    var maxLeft = window.scrollX + window.innerWidth - 260;
    var left = Math.max(window.scrollX + margin, Math.min(point.x, maxLeft));
    var top = point.y + 8;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  function openComposer(anchor, point, orderEl) {
    pendingAnchor = anchor;
    pendingOrderEl = orderEl || null;
    composer.ta.value = '';
    composer.err.textContent = '';
    composer.err.classList.remove('show');
    positionFloating(composer.el, point);
    composer.el.classList.add('open');
    composer.ta.focus();
  }

  function closeComposer() {
    pendingAnchor = null;
    pendingOrderEl = null;
    composer.el.classList.remove('open');
  }

  function commitComposer() {
    if (!pendingAnchor) return;
    var body = (composer.ta.value || '').trim();
    if (!body) {
      composer.err.textContent = 'Write something first.';
      composer.err.classList.add('show');
      return;
    }
    var anchor = pendingAnchor;
    var orderEl = pendingOrderEl;
    ensureAuthor(function (author) {
      var comment = {
        id: generateId(),
        anchor: anchor,
        body: body,
        author: author.name,
        role: author.role,
        at: new Date().toISOString(),
        status: 'open',
        order: computeOrder(anchor, orderEl),
        replies: []
      };
      state.comments.push(comment);
      persist();
      closeComposer();
      renderAll();
      setRailOpen(true);
      focusCardById(comment.id);
    });
  }

  // ---- rail + cards ------------------------------------------------------------

  function buildToggles() {
    var wrap = ce('div', 'cr-toggles');
    wrap.setAttribute('data-cr-ui', '');

    var railBtn = ce('button', 'cr-btn-rail');
    railBtn.type = 'button';
    railBtn.title = 'Comments';
    railBtn.textContent = '💬'; // speech balloon
    var badge = ce('span', 'cr-count-badge zero');
    badge.textContent = '0';
    railBtn.appendChild(badge);
    railBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setRailOpen(!railOpen);
    });

    var modeBtn = ce('button', 'cr-btn-mode');
    modeBtn.type = 'button';
    var dot = ce('span', 'cr-dot');
    var labelNode = document.createTextNode('Comment');
    modeBtn.appendChild(dot);
    modeBtn.appendChild(labelNode);
    modeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setCommentMode(!commentMode);
    });

    // Segmented "Select / Pin" capture-mode control — only meaningful (and
    // only shown, via CSS `.cr-mode-on .cr-seg`) while comment mode is on.
    var segWrap = ce('div', 'cr-seg');
    segWrap.setAttribute('data-cr-ui', '');
    var segAnchorBtn = ce('button', 'cr-seg-btn active');
    segAnchorBtn.type = 'button';
    segAnchorBtn.textContent = '✏️ Highlight';
    segAnchorBtn.title = 'Hover to highlight, then click a block or select text to comment';
    segAnchorBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setCaptureMode('anchor');
    });
    var segPinBtn = ce('button', 'cr-seg-btn');
    segPinBtn.type = 'button';
    segPinBtn.textContent = '📍 Free pin';
    segPinBtn.title = 'Click anywhere to drop a pin at an exact spot';
    segPinBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setCaptureMode('pin');
    });
    segWrap.appendChild(segAnchorBtn);
    segWrap.appendChild(segPinBtn);

    wrap.appendChild(railBtn);
    wrap.appendChild(segWrap);
    wrap.appendChild(modeBtn);

    return {
      wrap: wrap,
      railBtn: railBtn,
      badge: badge,
      modeBtn: modeBtn,
      modeLabelNode: labelNode,
      segWrap: segWrap,
      segAnchorBtn: segAnchorBtn,
      segPinBtn: segPinBtn
    };
  }

  function buildRail() {
    var rail = ce('div', 'cr-rail');
    rail.setAttribute('data-cr-ui', '');

    var header = ce('div', 'cr-rail-header');
    var title = ce('h2', 'cr-rail-title');
    title.textContent = 'Comments';
    var count = ce('span', 'cr-rail-count');
    var exportBtn = ce('button', 'cr-export-btn');
    exportBtn.type = 'button';
    exportBtn.textContent = STAGE === 'returned' ? 'Export markdown' : 'Export';
    exportBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (STAGE === 'returned') exportMarkdown();
      else exportDoc();
    });
    var closeBtn = ce('button', 'cr-rail-close');
    closeBtn.type = 'button';
    closeBtn.title = 'Hide comments panel';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setRailOpen(false);
    });

    header.appendChild(title);
    header.appendChild(count);
    header.appendChild(exportBtn);
    header.appendChild(closeBtn);

    var list = ce('div', 'cr-rail-list');
    rail.appendChild(header);
    rail.appendChild(list);

    return { rail: rail, count: count, list: list };
  }

  function anchorHintText(anchor) {
    if (!anchor) return '';
    if (anchor.type === 'element') return 'on: ' + (anchor.snippet || anchor.selector || 'element');
    if (anchor.type === 'text') return '“' + (anchor.quote || '').slice(0, 60) + '”';
    if (anchor.type === 'image') return 'image pin' + (anchor.snippet ? ': ' + anchor.snippet : '');
    if (anchor.type === 'pin') return 'pin' + (anchor.snippet ? ': ' + anchor.snippet.slice(0, 60) : '');
    return '';
  }

  function buildReply(r, comment) {
    var wrap = ce('div', 'cr-reply');
    var head = ce('div', 'cr-reply-head');
    var author = ce('span', 'cr-reply-author');
    author.textContent = r.author || 'Anonymous';
    var role = ce('span', 'cr-reply-role');
    role.textContent = r.role || '';
    var time = ce('span', 'cr-reply-time');
    time.textContent = fmtTime(r.at);
    head.appendChild(author);
    head.appendChild(role);
    head.appendChild(time);
    // Reviewer stage: let a reviewer delete their own reply — minimal, no
    // edit. Client replies (there aren't any today) stay untouched either way.
    if (STAGE === 'returned' && comment && isOwnReply(r)) {
      var del = ce('button', 'cr-reply-del');
      del.type = 'button';
      del.title = 'Delete reply';
      del.textContent = '✕';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        var i = comment.replies ? comment.replies.indexOf(r) : -1;
        if (i !== -1) comment.replies.splice(i, 1);
        persist();
        renderAll();
      });
      head.appendChild(del);
    }
    var body = ce('div', 'cr-reply-body');
    body.textContent = r.body || '';
    wrap.appendChild(head);
    wrap.appendChild(body);
    return wrap;
  }

  function toggleForm(form) {
    form.classList.toggle('open');
  }

  function closeForm(form) {
    form.classList.remove('open');
  }

  function buildCard(comment) {
    var card = ce('div', 'cr-card');
    card.setAttribute('data-cr-comment-id', comment.id);

    var head = ce('div', 'cr-card-head');
    var author = ce('span', 'cr-card-author');
    author.textContent = comment.author || 'Anonymous';
    var role = ce('span', 'cr-card-role');
    role.textContent = comment.role || '';
    var time = ce('span', 'cr-card-time');
    time.textContent = fmtTime(comment.at);
    head.appendChild(author);
    head.appendChild(role);
    head.appendChild(time);

    var hint = ce('div', 'cr-card-anchor-hint');
    hint.textContent = anchorHintText(comment.anchor);
    hint.title = 'Jump to this comment in the document';
    hint.addEventListener('click', function (e) {
      e.stopPropagation();
      focusAnchor(comment);
    });

    var body = ce('div', 'cr-card-body');
    body.textContent = comment.body;

    var actions = ce('div', 'cr-card-actions');

    var editForm = null;
    // Edit/Delete stay gated on ownership exactly as before. In reviewer
    // stage, state.author.role is always 'reviewer' (see defaultRole), so a
    // client comment is never "own" here — no edit/delete shows, correctly.
    if (isOwn(comment)) {
      var editInput = document.createElement('textarea');
      editInput.rows = 2;
      var editActions = ce('div', 'cr-inline-form-actions');
      editForm = ce('div', 'cr-inline-form');
      editActions.appendChild(
        actionBtn('Cancel', function () {
          closeForm(editForm);
        })
      );
      editActions.appendChild(
        actionBtn('Save', function () {
          var t = (editInput.value || '').trim();
          if (!t) return;
          comment.body = t;
          persist();
          closeForm(editForm);
          renderAll();
        })
      );
      editForm.appendChild(editInput);
      editForm.appendChild(editActions);

      actions.appendChild(
        actionBtn('Edit', function () {
          editInput.value = comment.body;
          toggleForm(editForm);
        })
      );
      actions.appendChild(
        actionBtn('Delete', function () {
          deleteComment(comment);
        }, true)
      );
    }

    var repliesWrap = null;
    var replyForm = null;
    if (STAGE === 'returned') {
      var replies = Array.isArray(comment.replies) ? comment.replies : [];
      if (replies.length) {
        repliesWrap = ce('div', 'cr-card-replies');
        replies.forEach(function (r) {
          repliesWrap.appendChild(buildReply(r, comment));
        });
      }

      var replyInput = document.createElement('textarea');
      replyInput.rows = 2;
      replyInput.placeholder = 'Write a reply…';
      var replyErr = ce('div', 'cr-inline-err');
      var replyActions = ce('div', 'cr-inline-form-actions');
      replyForm = ce('div', 'cr-inline-form cr-reply-form');
      replyActions.appendChild(
        actionBtn('Cancel', function () {
          closeForm(replyForm);
        })
      );
      replyActions.appendChild(
        actionBtn('Add reply', function () {
          var t = (replyInput.value || '').trim();
          if (!t) {
            replyErr.textContent = 'Write something first.';
            replyErr.classList.add('show');
            return;
          }
          ensureAuthor(function (author) {
            if (!Array.isArray(comment.replies)) comment.replies = [];
            comment.replies.push({
              body: t,
              author: author.name,
              role: author.role,
              at: new Date().toISOString()
            });
            persist();
            closeForm(replyForm);
            renderAll();
            focusCardById(comment.id);
          });
        })
      );
      replyForm.appendChild(replyInput);
      replyForm.appendChild(replyErr);
      replyForm.appendChild(replyActions);

      // Reply is offered on every comment (own or not) — the reviewer's job
      // in this stage is to respond to the client's comments, not author new
      // top-level ones.
      actions.appendChild(
        actionBtn('Reply', function () {
          replyInput.value = '';
          replyErr.textContent = '';
          replyErr.classList.remove('show');
          toggleForm(replyForm);
        })
      );
    }

    card.appendChild(head);
    card.appendChild(hint);
    card.appendChild(body);
    if (repliesWrap) card.appendChild(repliesWrap);
    card.appendChild(actions);
    if (editForm) card.appendChild(editForm);
    if (replyForm) card.appendChild(replyForm);

    return card;
  }

  // ---- markers (element badge / text highlight / image pin) --------------------
  //
  // All markers are pure runtime UI: floating, absolutely-positioned overlay
  // nodes computed from the current document layout, never baked into the
  // host content itself. They are rebuilt from `state.comments` on every
  // render and stripped before export (see withUiDetached) so a reopened
  // export starts clean and rebuilds them itself.

  function placeMarker(el, comment, num, kind) {
    var rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return null;
    var marker = ce('div', kind + (comment.status === 'resolved' ? ' resolved' : ''));
    marker.textContent = String(num);
    marker.style.left = rect.left + window.scrollX + 'px';
    marker.style.top = rect.top + window.scrollY + 'px';
    marker.title = 'Comment ' + num;
    marker.addEventListener('click', function (e) {
      e.stopPropagation();
      setRailOpen(true);
      focusCardById(comment.id);
    });
    markerLayerEl.appendChild(marker);
    return marker;
  }

  // Element anchors render as a box covering the element's full rect (a
  // faint, low-opacity accent tint + outline so host text stays readable)
  // with a small numbered badge pinned to the box's top-left corner —
  // clicking either the box or the badge focuses the comment, same as the
  // old corner-dot marker did.
  function renderElementBadge(comment, num) {
    try {
      var el = document.querySelector(comment.anchor.selector);
      if (!el) return;
      var rect = el.getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      var resolved = comment.status === 'resolved';
      var onClick = function (e) {
        e.stopPropagation();
        setRailOpen(true);
        focusCardById(comment.id);
      };

      var box = ce('div', 'cr-mark-box' + (resolved ? ' resolved' : ''));
      box.style.left = rect.left + window.scrollX + 'px';
      box.style.top = rect.top + window.scrollY + 'px';
      box.style.width = rect.width + 'px';
      box.style.height = rect.height + 'px';
      box.title = 'Comment ' + num;
      box.addEventListener('click', onClick);

      var badge = ce('div', 'cr-mark-box-badge' + (resolved ? ' resolved' : ''));
      badge.textContent = String(num);
      badge.title = 'Comment ' + num;
      badge.addEventListener('click', onClick);

      markerLayerEl.appendChild(box);
      markerLayerEl.appendChild(badge);
      markerNodesByCommentId[comment.id] = [box, badge];
    } catch (e) {
      /* stale selector — comment still shows in the rail, just unanchored visually */
    }
  }

  function renderImagePin(comment, num) {
    try {
      var el = document.querySelector(comment.anchor.selector);
      if (!el) return;
      var rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var x = typeof comment.anchor.x === 'number' ? comment.anchor.x : 0;
      var y = typeof comment.anchor.y === 'number' ? comment.anchor.y : 0;
      var pin = ce('div', 'cr-mark-pin' + (comment.status === 'resolved' ? ' resolved' : ''));
      pin.textContent = String(num);
      pin.style.left = rect.left + window.scrollX + (x / 100) * rect.width + 'px';
      pin.style.top = rect.top + window.scrollY + (y / 100) * rect.height + 'px';
      pin.title = 'Comment ' + num;
      pin.addEventListener('click', function (e) {
        e.stopPropagation();
        setRailOpen(true);
        focusCardById(comment.id);
      });
      markerLayerEl.appendChild(pin);
      markerNodesByCommentId[comment.id] = [pin];
    } catch (e) {
      /* stale selector */
    }
  }

  function renderTextHighlight(comment, num) {
    try {
      var startPt = resolveTextBoundaryPoint(comment.anchor.start);
      var endPt = resolveTextBoundaryPoint(comment.anchor.end);
      if (!startPt || !endPt) throw new Error('unresolved boundary');
      var range = document.createRange();
      range.setStart(startPt.node, startPt.offset);
      range.setEnd(endPt.node, endPt.offset);
      var rects = range.getClientRects();
      var nodes = [];
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        if (!r.width || !r.height) continue;
        var mark = ce('div', 'cr-mark-text' + (comment.status === 'resolved' ? ' resolved' : ''));
        mark.style.left = r.left + window.scrollX + 'px';
        mark.style.top = r.top + window.scrollY + 'px';
        mark.style.width = r.width + 'px';
        mark.style.height = r.height + 'px';
        mark.title = 'Comment ' + num;
        (function (id) {
          mark.addEventListener('click', function (e) {
            e.stopPropagation();
            setRailOpen(true);
            focusCardById(id);
          });
        })(comment.id);
        markerLayerEl.appendChild(mark);
        nodes.push(mark);
      }
      if (!nodes.length) throw new Error('empty range');
      markerNodesByCommentId[comment.id] = nodes;
    } catch (e) {
      // Fallback: the exact selection couldn't be re-resolved (host content
      // shifted) — anchor a plain badge to the common-ancestor element
      // instead, so the comment stays discoverable in the document.
      try {
        var fallbackEl = comment.anchor.commonAncestorSelector
          ? document.querySelector(comment.anchor.commonAncestorSelector)
          : null;
        if (fallbackEl) {
          var marker = placeMarker(fallbackEl, comment, num, 'cr-mark-element');
          if (marker) markerNodesByCommentId[comment.id] = [marker];
        }
      } catch (e2) {
        /* give up silently — comment remains visible in the rail only */
      }
    }
  }

  function renderMarkers() {
    while (markerLayerEl.firstChild) markerLayerEl.removeChild(markerLayerEl.firstChild);
    // The hover-outline box lives in this same layer and is cleared above —
    // re-seat it first so it stays behind every comment marker in paint order.
    if (hoverBoxEl) markerLayerEl.appendChild(hoverBoxEl);
    markerNodesByCommentId = {};
    var sorted = sortedComments();
    sorted.forEach(function (comment, i) {
      var num = i + 1;
      if (!comment || !comment.anchor) return;
      if (comment.anchor.type === 'element') renderElementBadge(comment, num);
      else if (comment.anchor.type === 'image' || comment.anchor.type === 'pin') renderImagePin(comment, num);
      else if (comment.anchor.type === 'text') renderTextHighlight(comment, num);
    });
  }

  function renderRail() {
    while (railUi.list.firstChild) railUi.list.removeChild(railUi.list.firstChild);
    var sorted = sortedComments();
    if (!sorted.length) {
      var empty = ce('div', 'cr-rail-empty');
      empty.textContent = 'No comments yet. Turn on Comment mode, then use Highlight to click a block, an image, or select a passage, or switch to Free pin to drop a pin anywhere.';
      railUi.list.appendChild(empty);
    } else {
      sorted.forEach(function (comment) {
        railUi.list.appendChild(buildCard(comment));
      });
    }
    var n = state.comments.length;
    railUi.count.textContent = n + ' comment' + (n === 1 ? '' : 's');
  }

  function updateToggleCounts() {
    var n = state.comments.length;
    toggles.badge.textContent = String(n);
    toggles.badge.classList.toggle('zero', n === 0);
  }

  function renderAll() {
    renderMarkers();
    renderRail();
    updateToggleCounts();
  }

  // ---- focus / scroll-to-anchor -------------------------------------------------

  function findCardEl(id) {
    var children = railUi.list.children;
    for (var i = 0; i < children.length; i++) {
      if (children[i].getAttribute && children[i].getAttribute('data-cr-comment-id') === id) return children[i];
    }
    return null;
  }

  function focusCardById(id) {
    window.requestAnimationFrame(function () {
      var card = findCardEl(id);
      if (!card) return;
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      card.classList.add('cr-focus');
      setTimeout(function () {
        card.classList.remove('cr-focus');
      }, CARD_FOCUS_MS);
    });
  }

  function focusAnchor(comment) {
    var nodes = markerNodesByCommentId[comment.id];
    var target = nodes && nodes[0] ? nodes[0] : resolveAnchorPrimaryElement(comment.anchor);
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    var flashNodes = nodes && nodes.length ? nodes : [target];
    flashNodes.forEach(function (n) {
      n.classList.add('cr-mark-flash');
    });
    setTimeout(function () {
      flashNodes.forEach(function (n) {
        n.classList.add('cr-flash-fade');
      });
    }, FLASH_START_MS);
    setTimeout(function () {
      flashNodes.forEach(function (n) {
        n.classList.remove('cr-mark-flash');
        n.classList.remove('cr-flash-fade');
      });
    }, FLASH_END_MS);
  }

  function clearAllFlashes() {
    if (!markerLayerEl) return;
    var all = markerLayerEl.querySelectorAll('.cr-mark-flash, .cr-flash-fade');
    for (var i = 0; i < all.length; i++) {
      all[i].classList.remove('cr-mark-flash');
      all[i].classList.remove('cr-flash-fade');
    }
  }

  // ---- highlight-mode hover outline -------------------------------------------
  //
  // While comment mode is on and captureMode is 'anchor', a single reusable
  // overlay box previews the element that would be commented on if the user
  // clicked right now — purely cosmetic, never throws, throttled to one
  // reposition per animation frame.

  function hideHoverBox() {
    if (hoverBoxEl) hoverBoxEl.classList.remove('show');
  }

  function showHoverBoxForRect(rect) {
    if (!hoverBoxEl) return;
    hoverBoxEl.style.left = rect.left + window.scrollX + 'px';
    hoverBoxEl.style.top = rect.top + window.scrollY + 'px';
    hoverBoxEl.style.width = rect.width + 'px';
    hoverBoxEl.style.height = rect.height + 'px';
    hoverBoxEl.classList.add('show');
  }

  function updateHoverBox() {
    hoverRafPending = false;
    try {
      if (!commentMode || captureMode !== 'anchor' || !lastMoveTarget) {
        hideHoverBox();
        return;
      }
      var el = nearestElement(lastMoveTarget);
      if (shouldSkip(el)) {
        hideHoverBox();
        return;
      }
      var rect = el.getBoundingClientRect();
      if (!rect.width && !rect.height) {
        hideHoverBox();
        return;
      }
      showHoverBoxForRect(rect);
    } catch (e) {
      hideHoverBox();
    }
  }

  function onDocMouseMove(e) {
    lastMoveTarget = e.target;
    if (hoverRafPending) return;
    hoverRafPending = true;
    window.requestAnimationFrame(updateHoverBox);
  }

  function onDocMouseOut(e) {
    // relatedTarget is null when the pointer leaves the document/window.
    if (!e.relatedTarget) {
      lastMoveTarget = null;
      hideHoverBox();
    }
  }

  // ---- mode / rail toggles --------------------------------------------------

  function setCommentMode(on) {
    commentMode = !!on;
    document.documentElement.classList.toggle('cr-mode-on', commentMode);
    toggles.modeBtn.classList.toggle('active', commentMode);
    toggles.modeLabelNode.nodeValue = commentMode ? 'Commenting…' : 'Comment';
    if (!commentMode) {
      closeComposer();
      hideHoverBox();
    }
  }

  function setRailOpen(on) {
    railOpen = !!on;
    railEl.classList.toggle('open', railOpen);
    toggles.railBtn.classList.toggle('open', railOpen);
  }

  function setCaptureMode(mode) {
    captureMode = mode === 'pin' ? 'pin' : 'anchor';
    toggles.segAnchorBtn.classList.toggle('active', captureMode === 'anchor');
    toggles.segPinBtn.classList.toggle('active', captureMode === 'pin');
    var root = document.documentElement;
    root.classList.toggle('cr-capture-anchor', captureMode === 'anchor');
    root.classList.toggle('cr-capture-pin', captureMode === 'pin');
    if (captureMode !== 'anchor') hideHoverBox();
  }

  // ---- click / selection -> new comment --------------------------------------

  function pagePoint(clientX, clientY) {
    return { x: clientX + window.scrollX, y: clientY + window.scrollY };
  }

  // A free pin is a pixel location; the only thing that survives into linear
  // text (markdown / the rail hint) is the words the pin sits on. Grab the
  // text right at the click point (not the element's leading text) so a pin
  // dropped low in a long block, or between words, still reads meaningfully.
  // Falls back to the element's own leading text when the point isn't over a
  // text node (e.g. whitespace/margin — no local text exists there anyway).
  function localSnippetAt(clientX, clientY, fallbackEl) {
    try {
      var pos = null;
      if (document.caretRangeFromPoint) {
        var r = document.caretRangeFromPoint(clientX, clientY);
        if (r && r.startContainer) pos = { node: r.startContainer, offset: r.startOffset };
      } else if (document.caretPositionFromPoint) {
        var cp = document.caretPositionFromPoint(clientX, clientY);
        if (cp && cp.offsetNode) pos = { node: cp.offsetNode, offset: cp.offset };
      }
      if (pos && pos.node && pos.node.nodeType === 3) {
        var full = pos.node.textContent || '';
        var from = Math.max(0, pos.offset - 30);
        var s = full.slice(from, pos.offset + 50).replace(/\s+/g, ' ').trim();
        // Drop a leading partial word when we cut into the middle of one.
        if (from > 0) s = s.replace(/^\S+\s+/, '');
        if (s) return s.slice(0, SNIPPET_CAP);
      }
    } catch (e) {
      /* caret APIs vary by browser — fall through to element text */
    }
    return ((fallbackEl && fallbackEl.textContent) || '').trim().slice(0, SNIPPET_CAP);
  }

  function onDocMouseUp() {
    justHandledSelection = false;
    if (!commentMode) return;
    if (STAGE !== 'draft') return; // reviewer stage never creates new comments
    if (captureMode === 'pin') return; // free-pin mode never creates text anchors
    var sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    var range = sel.getRangeAt(0);
    var text = sel.toString().trim();
    if (!text) return;
    var commonNode = range.commonAncestorContainer;
    var commonEl = commonNode.nodeType === 1 ? commonNode : nearestElement(commonNode);
    if (!commonEl || shouldSkip(commonEl)) return;
    justHandledSelection = true;
    var start = buildTextBoundary(range.startContainer, range.startOffset);
    var end = buildTextBoundary(range.endContainer, range.endOffset);
    var anchor = {
      type: 'text',
      commonAncestorSelector: cssPath(commonEl),
      quote: text.slice(0, QUOTE_CAP),
      start: start,
      end: end
    };
    var rects = range.getClientRects();
    var lastRect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    var point = pagePoint(lastRect.right || lastRect.left, lastRect.bottom || lastRect.top);
    sel.removeAllRanges();
    openComposer(anchor, point, commonEl);
  }

  function onDocClick(e) {
    if (!commentMode) return;
    if (STAGE !== 'draft') return; // reviewer stage never creates new comments
    if (justHandledSelection) {
      justHandledSelection = false;
      return;
    }
    var el = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement;
    if (shouldSkip(el)) return;

    if (captureMode === 'pin') {
      e.preventDefault();
      e.stopPropagation();
      var pinRect = el.getBoundingClientRect();
      if (!pinRect.width || !pinRect.height) return;
      var pinAnchor = {
        type: 'pin',
        selector: cssPath(el),
        x: clampPct(((e.clientX - pinRect.left) / pinRect.width) * 100),
        y: clampPct(((e.clientY - pinRect.top) / pinRect.height) * 100),
        snippet: localSnippetAt(e.clientX, e.clientY, el)
      };
      openComposer(pinAnchor, pagePoint(e.clientX, e.clientY), el);
      return;
    }

    var mediaEl = el.closest && el.closest('img, svg');
    if (mediaEl) {
      e.preventDefault();
      e.stopPropagation();
      var rect = mediaEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var x = clampPct(((e.clientX - rect.left) / rect.width) * 100);
      var y = clampPct(((e.clientY - rect.top) / rect.height) * 100);
      var snippet = (mediaEl.getAttribute('alt') || mediaEl.getAttribute('aria-label') || '').slice(0, SNIPPET_CAP);
      var anchor = { type: 'image', selector: cssPath(mediaEl), x: x, y: y, snippet: snippet };
      openComposer(anchor, pagePoint(e.clientX, e.clientY), mediaEl);
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    var elAnchor = {
      type: 'element',
      selector: cssPath(el),
      snippet: (el.textContent || '').trim().slice(0, SNIPPET_CAP)
    };
    openComposer(elAnchor, pagePoint(e.clientX, e.clientY), el);
  }

  // ---- export -----------------------------------------------------------------

  function persistBlobIntoDom() {
    var el = document.getElementById('brain-comments');
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/json';
      el.id = 'brain-comments';
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = JSON.stringify({ schema: SCHEMA, comments: state.comments });
  }

  // Temporarily detaches our own runtime UI (markers, rail, toggles, modal,
  // composer) so the exported file's serialized DOM is clean content only —
  // annotate.js rebuilds all of this from the comments blob on next load, so
  // baking stale, viewport-specific overlay positions into the file would
  // only be misleading. Restores everything afterward so the live page is
  // unaffected.
  function withUiDetached(fn) {
    var nodes = [markerLayerEl, railEl, toggles.wrap, authorModal.overlay, composer.el];
    var anchors = nodes.map(function (n) {
      if (!n || !n.parentNode) return null;
      return { parent: n.parentNode, next: n.nextSibling };
    });
    nodes.forEach(function (n) {
      if (n && n.parentNode) n.parentNode.removeChild(n);
    });
    try {
      return fn();
    } finally {
      nodes.forEach(function (n, i) {
        var a = anchors[i];
        if (!n || !a) return;
        // The saved nextSibling may itself have been one of the detached UI
        // nodes (these siblings share a parent), so it may not be back in the
        // DOM yet — insertBefore would throw. Fall back to appending; exact
        // sibling order among our own overlay nodes doesn't matter (they get
        // rebuilt from the blob on next load anyway).
        if (a.next && a.next.parentNode === a.parent) a.parent.insertBefore(n, a.next);
        else a.parent.appendChild(n);
      });
    }
  }

  function deriveExportBasename() {
    var path = '';
    try {
      path = decodeURIComponent(window.location.pathname || '');
    } catch (e) {
      path = window.location.pathname || '';
    }
    var base = path.split(/[\\/]/).pop() || '';
    base = base.replace(/\.html?$/i, '');
    if (!base) base = 'document';
    return base;
  }

  function deriveExportFilename() {
    return deriveExportBasename() + '.commented.html';
  }

  // Shared Blob + <a download> mechanics for both the HTML export and the
  // markdown export — never lets a download-mechanics failure throw into the
  // host page.
  function triggerDownload(blob, filename) {
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      (document.body || document.documentElement).appendChild(a);
      a.click();
      setTimeout(function () {
        if (a.parentNode) a.parentNode.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
    } catch (e) {
      /* never let a download-mechanics failure throw into the host page */
    }
  }

  // ---- tiny toast (used to confirm the markdown clipboard copy) --------------

  var toastTimer = null;

  function showToast(msg) {
    try {
      var el = document.getElementById('cr-toast');
      if (!el) {
        el = ce('div', 'cr-toast');
        el.id = 'cr-toast';
        el.setAttribute('data-cr-ui', '');
        (document.body || document.documentElement).appendChild(el);
      }
      el.textContent = msg;
      el.classList.add('show');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        el.classList.remove('show');
      }, TOAST_MS);
    } catch (e) {
      /* never throw */
    }
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('data-cr-ui', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      (document.body || document.documentElement).appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      if (ta.parentNode) ta.parentNode.removeChild(ta);
    } catch (e) {
      /* clipboard is best-effort — the download still happens */
    }
  }

  function copyToClipboard(text) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).catch(function () {
          fallbackCopy(text);
        });
        return;
      }
    } catch (e) {
      /* fall through to the fallback below */
    }
    fallbackCopy(text);
  }

  function exportDoc() {
    setCommentMode(false);
    clearAllFlashes();
    closeComposer();
    cancelAuthorModal();
    persistBlobIntoDom();

    // Stamp the DOWNLOADED copy's <html> as reviewer stage — same
    // detach/restore discipline as withUiDetached — so the exported file
    // opens straight into reviewer mode, while the LIVE page here stays in
    // draft/client mode (STAGE, read once at load, never changes on this page).
    document.documentElement.setAttribute('data-cr-stage', 'returned');
    var htmlStr;
    try {
      htmlStr = withUiDetached(function () {
        return '<!doctype html>\n' + document.documentElement.outerHTML;
      });
    } finally {
      document.documentElement.setAttribute('data-cr-stage', 'draft');
    }

    try {
      var blob = new Blob([htmlStr], { type: 'text/html' });
      triggerDownload(blob, deriveExportFilename());
    } catch (e) {
      /* never let a download-mechanics failure throw into the host page */
    }
  }

  // ---- markdown export (reviewer stage) --------------------------------------
  //
  // Renders document.body as markdown, skipping the injected UI subtree, and
  // interleaves each comment (+ replies) as a blockquote right after the
  // deepest block that contains its resolved anchor element. Zero-dep,
  // defensive throughout — a malformed DOM or a stale selector degrades to
  // "unmatched" (listed under "## Other comments") rather than throwing.

  var EXPORT_SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, LINK: 1, META: 1 };
  var INLINE_BLOCK_SKIP_TAGS = { UL: 1, OL: 1, TABLE: 1, PRE: 1, BLOCKQUOTE: 1 };

  function isExportSkippable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.id === 'brain-comments') return true;
    if (typeof el.hasAttribute === 'function' && el.hasAttribute('data-cr-ui')) return true;
    if (EXPORT_SKIP_TAGS[el.tagName]) return true;
    return false;
  }

  function documentTitleText() {
    try {
      if (document.title && document.title.trim()) return document.title.trim();
    } catch (e) {
      /* ignore */
    }
    try {
      var h1 = document.querySelector('h1');
      if (h1 && !isExportSkippable(h1) && !(h1.closest && h1.closest('[data-cr-ui]'))) {
        var t = (h1.textContent || '').trim();
        if (t) return t;
      }
    } catch (e) {
      /* ignore */
    }
    return 'Document';
  }

  function oneLineText(s) {
    return (s || '').replace(/\r\n|\r|\n/g, ' ').trim();
  }

  // Location hint for the markdown blockquote. Element/text placement is
  // already conveyed by WHERE the block sits in the walk, but a pin/image is a
  // coordinate — the only text-carryable signal is the words it sits on, so
  // spell that out ("near …"). Text anchors echo the quoted passage.
  function commentLocHint(anchor) {
    if (!anchor) return '';
    if (anchor.type === 'pin') return anchor.snippet ? ' · pin near “' + oneLineText(anchor.snippet).slice(0, 60) + '”' : ' · pin';
    if (anchor.type === 'image') return anchor.snippet ? ' · on image “' + oneLineText(anchor.snippet).slice(0, 60) + '”' : ' · on image';
    if (anchor.type === 'text') return anchor.quote ? ' · on “' + oneLineText(anchor.quote).slice(0, 60) + '”' : '';
    return '';
  }

  function renderCommentBlock(c) {
    var lines = [];
    var icon = c.anchor && (c.anchor.type === 'pin' || c.anchor.type === 'image') ? '📍' : '💬';
    lines.push('> ' + icon + ' ' + (c.author || 'Anonymous') + ' (' + (c.role || '') + ')' + commentLocHint(c.anchor) + ': ' + oneLineText(c.body));
    (c.replies || []).forEach(function (r) {
      lines.push('>    ↳ ' + (r.author || 'Anonymous') + ' (' + (r.role || '') + '): ' + oneLineText(r.body));
    });
    return lines.join('\n');
  }

  // Deliberately narrower than resolveAnchorPrimaryElement (which prefers a
  // text anchor's start-point selector for on-page focusing): the markdown
  // walk wants the coarser commonAncestorSelector per the export contract,
  // since that's the element whose rendered block the comment should trail.
  function primaryElementForComment(anchor) {
    if (!anchor) return null;
    try {
      if (anchor.type === 'element' || anchor.type === 'image' || anchor.type === 'pin') {
        return document.querySelector(anchor.selector);
      }
      if (anchor.type === 'text') {
        return anchor.commonAncestorSelector ? document.querySelector(anchor.commonAncestorSelector) : null;
      }
    } catch (e) {
      /* stale/invalid selector */
    }
    return null;
  }

  function buildCommentIndex() {
    var byEl = [];
    var unmatched = [];
    sortedComments().forEach(function (c) {
      var el = null;
      try {
        el = primaryElementForComment(c.anchor);
      } catch (e) {
        el = null;
      }
      if (el) byEl.push({ el: el, c: c });
      else unmatched.push(c);
    });
    return { byEl: byEl, unmatched: unmatched };
  }

  // Inline HTML -> markdown for a node's children (text runs + emphasis,
  // links, code, images, line breaks). Nested block-level content (lists,
  // tables, pre, blockquote) is intentionally skipped here — callers that
  // walk block structure handle those themselves.
  function inlineMarkdown(node) {
    var res = '';
    if (!node || !node.childNodes) return res;
    for (var i = 0; i < node.childNodes.length; i++) {
      var child = node.childNodes[i];
      if (child.nodeType === 3) {
        res += child.nodeValue || '';
        continue;
      }
      if (child.nodeType !== 1) continue;
      if (isExportSkippable(child)) continue;
      var tag = child.tagName;
      if (INLINE_BLOCK_SKIP_TAGS[tag]) continue;
      if (tag === 'BR') {
        res += '  \n';
        continue;
      }
      if (tag === 'STRONG' || tag === 'B') {
        res += '**' + inlineMarkdown(child).trim() + '**';
        continue;
      }
      if (tag === 'EM' || tag === 'I') {
        res += '_' + inlineMarkdown(child).trim() + '_';
        continue;
      }
      if (tag === 'CODE') {
        res += '`' + (child.textContent || '').trim() + '`';
        continue;
      }
      if (tag === 'A') {
        var href = child.getAttribute('href') || '';
        var linkText = inlineMarkdown(child).trim() || (child.textContent || '').trim() || href;
        res += href ? '[' + linkText + '](' + href + ')' : linkText;
        continue;
      }
      if (tag === 'IMG') {
        var alt = child.getAttribute('alt') || '';
        var src = child.getAttribute('src') || '';
        res += '![' + alt + '](' + src + ')';
        continue;
      }
      res += inlineMarkdown(child);
    }
    return res;
  }

  // Best-effort pipe table: first row is treated as the header.
  function renderTable(tableEl) {
    try {
      var rows = [];
      var trs = tableEl.querySelectorAll('tr');
      for (var i = 0; i < trs.length; i++) {
        var tr = trs[i];
        if (isExportSkippable(tr)) continue;
        var cells = [];
        for (var j = 0; j < tr.children.length; j++) {
          var cell = tr.children[j];
          if (cell.tagName !== 'TD' && cell.tagName !== 'TH') continue;
          cells.push(inlineMarkdown(cell).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|'));
        }
        if (cells.length) rows.push(cells);
      }
      if (!rows.length) return (tableEl.textContent || '').trim();
      var colCount = rows[0].length;
      var sep = [];
      for (var k = 0; k < colCount; k++) sep.push('---');
      var lines = ['| ' + rows[0].join(' | ') + ' |', '| ' + sep.join(' | ') + ' |'];
      for (var r = 1; r < rows.length; r++) lines.push('| ' + rows[r].join(' | ') + ' |');
      return lines.join('\n');
    } catch (e) {
      return (tableEl.textContent || '').trim();
    }
  }

  // The body walk + comment interleaving proper. Nested here (rather than
  // top-level) because walk/emitBlock/attachTo/renderList all close over this
  // call's own `out` (the accumulating block array), `emitted` (comment ids
  // already placed) and `commentIndex` (resolved anchor elements).
  function buildMarkdownDocInner() {
    var out = [];
    var emitted = {};
    var commentIndex = buildCommentIndex();

    function attachTo(node, target) {
      if (!node) return;
      for (var i = 0; i < commentIndex.byEl.length; i++) {
        var entry = commentIndex.byEl[i];
        if (emitted[entry.c.id]) continue;
        var match =
          entry.el === node || (node.nodeType === 1 && typeof node.contains === 'function' && node.contains(entry.el));
        if (match) {
          target.push(renderCommentBlock(entry.c));
          emitted[entry.c.id] = true;
        }
      }
    }

    function emitBlock(text, node) {
      if (text) out.push(text);
      attachTo(node, out);
    }

    function renderList(listEl, ordered) {
      var lines = [];
      var idx = 0;
      for (var i = 0; i < listEl.children.length; i++) {
        var li = listEl.children[i];
        if (!li || li.tagName !== 'LI' || isExportSkippable(li)) continue;
        idx++;
        var marker = ordered ? idx + '. ' : '- ';
        var nestedListEls = [];
        for (var j = 0; j < li.children.length; j++) {
          var c = li.children[j];
          if (c && (c.tagName === 'UL' || c.tagName === 'OL')) nestedListEls.push(c);
        }
        var text = inlineMarkdown(li).replace(/\s+/g, ' ').trim();
        lines.push(marker + text);
        attachTo(li, lines);
        nestedListEls.forEach(function (nested) {
          var subMd = renderList(nested, nested.tagName === 'OL');
          if (subMd) {
            var indented = subMd
              .split('\n')
              .map(function (l) {
                return '  ' + l;
              })
              .join('\n');
            lines.push(indented);
          }
        });
      }
      return lines.join('\n');
    }

    function walk(node) {
      if (!node || node.nodeType !== 1) return;
      if (isExportSkippable(node)) return;
      var tag = node.tagName;

      if (/^H[1-6]$/.test(tag)) {
        var level = Number(tag.charAt(1));
        var htext = inlineMarkdown(node).replace(/\s+/g, ' ').trim();
        emitBlock(new Array(level + 1).join('#') + ' ' + htext, node);
        return;
      }
      if (tag === 'P') {
        emitBlock(inlineMarkdown(node).replace(/\s+/g, ' ').trim(), node);
        return;
      }
      if (tag === 'BLOCKQUOTE') {
        var savedOut = out;
        out = [];
        for (var bi = 0; bi < node.childNodes.length; bi++) walk(node.childNodes[bi]);
        var inner = out;
        out = savedOut;
        var quoted = inner
          .join('\n\n')
          .split('\n')
          .map(function (l) {
            return '> ' + l;
          })
          .join('\n');
        if (quoted.trim()) out.push(quoted);
        attachTo(node, out);
        return;
      }
      if (tag === 'PRE') {
        var code = (node.textContent || '').replace(/\n+$/, '');
        emitBlock('```\n' + code + '\n```', node);
        return;
      }
      if (tag === 'HR') {
        emitBlock('---', node);
        return;
      }
      if (tag === 'IMG') {
        var alt2 = node.getAttribute('alt') || '';
        var src2 = node.getAttribute('src') || '';
        emitBlock('![' + alt2 + '](' + src2 + ')', node);
        return;
      }
      if (tag === 'UL' || tag === 'OL') {
        emitBlock(renderList(node, tag === 'OL'), node);
        return;
      }
      if (tag === 'TABLE') {
        emitBlock(renderTable(node), node);
        return;
      }
      if (tag === 'BR') return;

      // Generic container (div/section/etc., or any tag we don't special-
      // case): recurse into children; if none of them produced a block of
      // their own, fall back to this element's trimmed textContent (the
      // "unknown block-level element" rule).
      var before = out.length;
      for (var ci = 0; ci < node.childNodes.length; ci++) walk(node.childNodes[ci]);
      if (out.length === before) {
        var txt = (node.textContent || '').replace(/\s+/g, ' ').trim();
        if (txt) out.push(txt);
      }
      attachTo(node, out);
    }

    var body = document.body;
    if (body) {
      for (var i = 0; i < body.childNodes.length; i++) walk(body.childNodes[i]);
      attachTo(body, out);
    }

    var leftover = [];
    for (var k = 0; k < commentIndex.byEl.length; k++) {
      var entry = commentIndex.byEl[k];
      if (!emitted[entry.c.id]) leftover.push(entry.c);
    }
    var others = commentIndex.unmatched.concat(leftover);
    if (others.length) {
      out.push('## Other comments');
      others.forEach(function (c) {
        out.push(renderCommentBlock(c));
        emitted[c.id] = true;
      });
    }

    var title = documentTitleText();
    return '# ' + title + '\n\n' + out.join('\n\n').trim() + '\n';
  }

  function buildMarkdownDoc() {
    try {
      return buildMarkdownDocInner();
    } catch (e) {
      // Never let a rendering bug block the export — fall back to a minimal
      // but still useful document.
      return '# ' + documentTitleText() + '\n\n(Could not fully render this document — see the review UI for full comment context.)\n';
    }
  }

  function exportMarkdown() {
    try {
      setCommentMode(false);
      clearAllFlashes();
      closeComposer();
      cancelAuthorModal();

      var md = buildMarkdownDoc();

      copyToClipboard(md);
      showToast('Copied to clipboard');

      try {
        var blob = new Blob([md], { type: 'text/markdown' });
        triggerDownload(blob, deriveExportBasename() + '.comments.md');
      } catch (e) {
        /* never let a download-mechanics failure throw into the host page */
      }
    } catch (e) {
      /* exportMarkdown must never throw into the host page */
    }
  }

  // ---- init -------------------------------------------------------------------

  function init() {
    hydrate();
    state.author = readAuthor();

    document.documentElement.classList.toggle('cr-stage-draft', STAGE !== 'returned');
    document.documentElement.classList.toggle('cr-stage-returned', STAGE === 'returned');

    markerLayerEl = ce('div', 'cr-marker-layer');
    markerLayerEl.setAttribute('data-cr-ui', '');

    hoverBoxEl = ce('div', 'cr-hover-box');
    hoverBoxEl.setAttribute('data-cr-ui', '');
    markerLayerEl.appendChild(hoverBoxEl);

    var railParts = buildRail();
    railEl = railParts.rail;
    railUi = railParts;

    toggles = buildToggles();
    authorModal = buildAuthorModal();
    composer = buildComposer();
    setCaptureMode(captureMode); // sync root classes + seg buttons to the default

    var root = document.body || document.documentElement;
    root.appendChild(markerLayerEl);
    root.appendChild(railEl);
    root.appendChild(toggles.wrap);
    root.appendChild(authorModal.overlay);
    root.appendChild(composer.el);

    document.addEventListener('mouseup', onDocMouseUp, true);
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('mousemove', onDocMouseMove, true);
    document.addEventListener('mouseout', onDocMouseOut, true);

    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderMarkers, 120);
    });
    window.addEventListener('load', function () {
      renderMarkers(); // correct any marker positions thrown off by late-loading images/fonts
    });

    renderAll();

    // Reviewer stage: the rail IS the surface (no in-doc commenting), so
    // start with it open rather than making the reviewer discover it.
    if (STAGE === 'returned') setRailOpen(true);
  }

  try {
    if (document.body) {
      init();
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        try {
          init();
        } catch (e) {
          /* never break the host page */
        }
      });
    }
  } catch (e) {
    /* never break the host page */
  }
})();
