(() => {
  'use strict';

  /* ---------- Constantes ---------- */
  const COLS = [
    { id: 'neg', label: 'Négatifs', short: 'Négatif' },
    { id: 'neu', label: 'Neutres', short: 'Neutre' },
    { id: 'pos', label: 'Positifs', short: 'Positif' },
  ];
  const IDX = { neg: 0, neu: 1, pos: 2 };
  const STORE_KEY = 'pour-contre.v1';

  const $ = (sel) => document.querySelector(sel);
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(c));
    }
    return el;
  }

  /* ---------- État ---------- */
  let state = load() || { title: 'Mon projet', items: [] };

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? normalise(JSON.parse(raw)) : null;
    } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible */ }
  }

  function normalise(d) {
    if (!d || typeof d !== 'object' || !Array.isArray(d.items)) {
      throw new Error('Format invalide : la liste "items" est absente.');
    }
    const valid = (v) => COLS.some((c) => c.id === v);
    const seen = new Set();
    const items = d.items.map((it, i) => {
      if (!it || typeof it.text !== 'string') throw new Error('Le point n°' + (i + 1) + ' est invalide.');
      const column = valid(it.column) ? it.column : 'neu';
      let reply = null;
      if (it.reply && typeof it.reply === 'object') {
        const text = typeof it.reply.text === 'string' ? it.reply.text : '';
        const to = valid(it.reply.to) && it.reply.to !== column ? it.reply.to : null;
        if (text || to) reply = { text, to };
      }
      let id = typeof it.id === 'string' && it.id ? it.id : uid();
      if (seen.has(id)) id = uid();
      seen.add(id);
      return { id, text: it.text, column, reply };
    });
    return { title: typeof d.title === 'string' ? d.title : 'Mon projet', items };
  }

  const findItem = (id) => state.items.find((it) => it.id === id);
  const destOf = (it) => (it.reply && it.reply.to && it.reply.to !== it.column ? it.reply.to : null);

  /* ---------- Rendu du plateau ---------- */
  const board = $('#board');

  function render() {
    $('#appTitle').textContent = state.title || 'Pour / Contre';
    document.title = (state.title ? state.title + ' – ' : '') + 'Pour / Contre';

    const counts = { neg: 0, neu: 0, pos: 0 };
    state.items.forEach((it) => counts[it.column]++);

    const heads = h('div', { class: 'heads' },
      COLS.map((c) => h('div', { class: 'head', 'data-col': c.id },
        h('span', { class: 'label' }, c.label),
        h('span', { class: 'count' }, String(counts[c.id])),
        h('button', {
          class: 'add', type: 'button',
          'aria-label': 'Ajouter un point ' + c.short.toLowerCase(),
          onclick: () => openEditor(null, c.id),
        }, '+'))));

    const body = state.items.length
      ? state.items.map(rowFor)
      : [h('div', { class: 'empty' },
          h('p', {}, 'Aucun point pour l’instant. Ajoute-en un avec le bouton + d’une colonne.'),
          h('button', { class: 'btn', type: 'button', onclick: loadSample }, 'Charger un exemple'))];

    board.replaceChildren(heads, ...body);
    renderSummary();
  }

  function rowFor(it, index) {
    const row = h('div', { class: 'row', 'data-index': index });
    const cells = COLS.map((c) => h('div', { class: 'cell', 'data-col': c.id }));

    cells[IDX[it.column]].append(mainCard(it));

    const to = destOf(it);
    if (to) {
      cells[IDX[to]].append(replyCard(it, to));
      const a = IDX[it.column], b = IDX[to];
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const arrow = h('div', { class: 'arrow ' + (b > a ? 'right' : 'left'), 'data-col': to, 'aria-hidden': 'true' });
      arrow.style.left = 'calc(' + lo + ' * (var(--w) + var(--g)) + var(--w))';
      arrow.style.width = 'calc(' + (hi - lo) + ' * (var(--w) + var(--g)) - var(--w))';
      row.append(...cells, arrow);
    } else {
      row.append(...cells);
    }
    return row;
  }

  function cardProps(it, cls, col) {
    return {
      class: 'card ' + cls,
      'data-col': col,
      'data-id': it.id,
      role: 'button',
      tabindex: '0',
      onclick: () => openEditor(it.id),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditor(it.id); } },
    };
  }

  function mainCard(it) {
    const card = h('div', cardProps(it, 'main', it.column), h('p', {}, it.text));
    card.draggable = true;
    card.addEventListener('dragstart', (e) => {
      dragId = it.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', it.id);
      requestAnimationFrame(() => card.classList.add('dragging'));
    });
    card.addEventListener('dragend', () => { dragId = null; card.classList.remove('dragging'); clearDrop(); });

    // Réponse sans changement de colonne : affichée dans la carte
    if (it.reply && it.reply.text && !destOf(it)) {
      card.append(h('div', { class: 'card-reply' }, h('span', { class: 'tag' }, 'Réponse'), h('p', {}, it.reply.text)));
    }
    return card;
  }

  function replyCard(it, to) {
    const txt = it.reply.text;
    return h('div', cardProps(it, 'reply', to),
      h('span', { class: 'tag' }, 'Réponse'),
      h('p', { class: txt ? '' : 'muted' }, txt || '—'));
  }

  function renderSummary() {
    const start = { neg: 0, neu: 0, pos: 0 }, end = { neg: 0, neu: 0, pos: 0 };
    state.items.forEach((it) => { start[it.column]++; end[destOf(it) || it.column]++; });
    $('#summary').replaceChildren(...COLS.map((c) =>
      h('div', { class: 'line', 'data-col': c.id },
        h('span', { class: 'grow' }, c.label),
        h('b', {}, start[c.id] === end[c.id] ? String(start[c.id]) : start[c.id] + ' → ' + end[c.id]))));
  }

  /* ---------- Glisser-déposer (souris) ---------- */
  let dragId = null;

  function clearDrop() {
    board.querySelectorAll('.drop').forEach((el) => el.classList.remove('drop'));
  }
  board.addEventListener('dragover', (e) => {
    if (!dragId) return;
    const t = e.target.closest('.cell, .head');
    if (!t) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!t.classList.contains('drop')) { clearDrop(); t.classList.add('drop'); }
  });
  board.addEventListener('dragleave', (e) => {
    if (!board.contains(e.relatedTarget)) clearDrop();
  });
  board.addEventListener('drop', (e) => {
    const t = e.target.closest('.cell, .head');
    if (!t || !dragId) return;
    e.preventDefault();
    const row = t.closest('.row');
    moveItem(dragId, t.dataset.col, row ? Number(row.dataset.index) : null);
    dragId = null;
    clearDrop();
  });

  function moveItem(id, col, index) {
    const from = state.items.findIndex((it) => it.id === id);
    if (from < 0) return;
    const [it] = state.items.splice(from, 1);
    it.column = col;
    if (it.reply && it.reply.to === col) it.reply.to = null;
    state.items.splice(index == null ? from : index, 0, it);
    save();
    render();
  }

  /* ---------- Éditeur ---------- */
  const editor = $('#editor');
  let ed = null; // brouillon : { id, text, column, replyText, to, index }

  function openEditor(id, col) {
    const it = id ? findItem(id) : null;
    ed = it
      ? { id, text: it.text, column: it.column, replyText: it.reply ? it.reply.text : '', to: it.reply ? it.reply.to : null, index: state.items.indexOf(it) }
      : { id: null, text: '', column: col || 'neu', replyText: '', to: null, index: state.items.length };
    $('#editorTitle').textContent = it ? 'Modifier le point' : 'Nouveau point';
    $('#edText').value = ed.text;
    $('#edReply').value = ed.replyText;
    $('#edDelete').hidden = !it;
    renderEditorControls();
    editor.showModal();
    if (!it) $('#edText').focus();
  }

  function segButtons(container, options, value, onPick) {
    container.replaceChildren(...options.map((o) =>
      h('button', {
        type: 'button',
        role: 'radio',
        'aria-checked': String(o.id === value),
        class: o.id === value ? 'active' : '',
        'data-col': o.col || false,
        onclick: () => onPick(o.id),
      }, o.label)));
  }

  function renderEditorControls() {
    segButtons($('#edCol'),
      COLS.map((c) => ({ id: c.id, col: c.id, label: c.short })),
      ed.column,
      (id) => {
        ed.column = id;
        if (ed.to === id) ed.to = null;
        renderEditorControls();
      });

    const others = COLS.filter((c) => c.id !== ed.column);
    segButtons($('#edTo'),
      [{ id: null, label: 'Reste ici' }, ...others.map((c) => ({ id: c.id, col: c.id, label: c.short }))],
      ed.to,
      (id) => { ed.to = id; renderEditorControls(); });

    const max = ed.id ? state.items.length : state.items.length + 1;
    $('#edPos').textContent = (ed.index + 1) + '/' + max;
    $('#edUp').disabled = ed.index <= 0;
    $('#edDown').disabled = ed.index >= max - 1;
  }

  $('#edUp').addEventListener('click', () => { ed.index--; renderEditorControls(); });
  $('#edDown').addEventListener('click', () => { ed.index++; renderEditorControls(); });
  $('#edClose').addEventListener('click', () => editor.close());
  editor.addEventListener('click', (e) => { if (e.target === editor) editor.close(); });

  $('#edDelete').addEventListener('click', () => {
    if (!ed || !ed.id) return;
    state.items = state.items.filter((it) => it.id !== ed.id);
    save(); render(); editor.close();
    toast('Point supprimé');
  });

  $('#editorForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('#edText').value.trim();
    const replyText = $('#edReply').value.trim();
    if (!text) { toast('Écris d’abord le point.'); $('#edText').focus(); return; }

    const to = ed.to && ed.to !== ed.column ? ed.to : null;
    const item = { id: ed.id || uid(), text, column: ed.column, reply: replyText || to ? { text: replyText, to } : null };

    if (ed.id) state.items = state.items.filter((it) => it.id !== ed.id);
    state.items.splice(Math.min(ed.index, state.items.length), 0, item);
    save(); render(); editor.close();
  });

  /* ---------- Menu latéral ---------- */
  const drawer = $('#drawer'), overlay = $('#overlay'), menuBtn = $('#menuBtn');

  function setDrawer(open) {
    drawer.classList.toggle('open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    overlay.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) $('#titleInput').value = state.title;
  }
  menuBtn.addEventListener('click', () => setDrawer(!drawer.classList.contains('open')));
  $('#drawerClose').addEventListener('click', () => setDrawer(false));
  overlay.addEventListener('click', () => setDrawer(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open')) setDrawer(false); });

  $('#titleInput').addEventListener('input', (e) => {
    state.title = e.target.value;
    save();
    $('#appTitle').textContent = state.title || 'Pour / Contre';
  });

  /* ---------- Export / import JSON ---------- */
  function slug(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pour-contre';
  }

  $('#exportBtn').addEventListener('click', () => {
    const data = { app: 'pour-contre', version: 1, title: state.title, exportedAt: new Date().toISOString(), items: state.items };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: slug(state.title) + '.json' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Fichier exporté');
  });

  const fileInput = $('#fileInput');
  $('#importBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const next = normalise(JSON.parse(await file.text()));
      if (state.items.length && !confirm('Remplacer le contenu actuel par « ' + (next.title || file.name) + ' » ?')) return;
      state = next;
      save(); render(); setDrawer(false);
      toast(next.items.length + ' point(s) importé(s)');
    } catch (err) {
      toast('Import impossible : ' + err.message);
    }
  });

  /* ---------- Exemple / effacement ---------- */
  function loadSample() {
    if (state.items.length && !confirm('Remplacer le contenu actuel par l’exemple ?')) return;
    const mk = (text, column, reply) => ({ id: uid(), text, column, reply: reply || null });
    state = {
      title: 'Télétravail 2 jours par semaine',
      items: [
        mk('Moins de cohésion d’équipe', 'neg', { text: 'Deux jours de présence communs pour tous.', to: 'neu' }),
        mk('Coût d’équipement des postes à domicile', 'neg', { text: 'Budget déjà prévu, amorti sur 3 ans.', to: 'pos' }),
        mk('Management à distance plus exigeant', 'neg', { text: 'Formation des managers prévue au premier trimestre.', to: null }),
        mk('Impact sur les locaux', 'neu', { text: 'Moins de postes nécessaires : sous-location possible.', to: 'pos' }),
        mk('Attractivité pour le recrutement', 'pos'),
        mk('Moins de temps de transport pour l’équipe', 'pos', { text: 'À condition de bien cadrer le droit à la déconnexion.', to: 'neu' }),
      ],
    };
    save(); render(); setDrawer(false);
  }
  $('#sampleBtn').addEventListener('click', loadSample);

  $('#clearBtn').addEventListener('click', () => {
    if (!state.items.length) { toast('Rien à effacer'); return; }
    if (!confirm('Effacer tous les points ? Pense à exporter avant.')) return;
    state.items = [];
    save(); render(); setDrawer(false);
  });

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  /*PWA:START*/
  /* ---------- Installation (PWA) ---------- */
  let deferredPrompt = null;
  const installBtn = $('#installBtn');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.hidden = true;
  });
  window.addEventListener('appinstalled', () => { installBtn.hidden = true; });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
  /*PWA:END*/

  render();
})();
