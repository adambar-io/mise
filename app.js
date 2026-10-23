'use strict';
/* Mise: a tiny, free recipe keeper. No build step, data stays on-device (localStorage). */

const KEY = 'mise.v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);

let db = { recipes: [], grocery: [], settings: {} };
try { db = Object.assign(db, JSON.parse(localStorage.getItem(KEY)) || {}); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { toast('Could not save (storage full or blocked)'); } };
const byId = id => db.recipes.find(r => r.id === id);

let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }

/* ---------- quantity scaling ---------- */
const VULGAR = { '½': .5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': .25, '¾': .75, '⅛': .125, '⅜': .375, '⅝': .625, '⅞': .875 };
const NUM = '(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?(?:\\s?[½⅓⅔¼¾⅛⅜⅝⅞])?|[½⅓⅔¼¾⅛⅜⅝⅞])';
const LEAD = new RegExp('^(\\s*)(' + NUM + ')(?:(\\s*(?:-|–|to)\\s*)(' + NUM + '))?', 'i');
function parseNum(s) {
  s = s.trim();
  let m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/); if (m) return +m[1] + m[2] / m[3];
  m = s.match(/^(\d+)\/(\d+)$/); if (m) return m[1] / m[2];
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*([½⅓⅔¼¾⅛⅜⅝⅞])$/); if (m) return parseFloat(m[1].replace(',', '.')) + VULGAR[m[2]];
  if (VULGAR[s]) return VULGAR[s];
  return parseFloat(s.replace(',', '.'));
}
function fmtNum(n) {
  if (n >= 10) return String(Math.round(n * 10) / 10).replace(/\.0$/, '');
  const whole = Math.floor(n + 1e-9), f = n - whole;
  const opts = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, 'UP']];
  const [, sym] = opts.reduce((b, o) => Math.abs(o[0] - f) < Math.abs(b[0] - f) ? o : b);
  if (sym === 'UP') return String(whole + 1);
  if (!whole && !sym) return String(Math.round(n * 100) / 100);
  return (whole || '') + sym;
}
function scaleLine(line, k) {
  if (k === 1) return line;
  return line.replace(LEAD, (all, sp, a, mid, b) => {
    const x = parseNum(a); if (!isFinite(x)) return all;
    let out = sp + fmtNum(x * k);
    if (b) { const y = parseNum(b); if (isFinite(y)) out += mid + fmtNum(y * k); }
    return out;
  });
}

/* ---------- recipe import ---------- */
const decodeHtml = s => { const t = document.createElement('textarea'); t.innerHTML = String(s ?? ''); return t.value; };
const clean = s => decodeHtml(String(s ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim();
const asArr = x => x == null ? [] : Array.isArray(x) ? x : [x];

function minutes(iso) {
  const m = String(iso || '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  return m ? (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}
function flatSteps(x) {
  const out = [];
  for (const s of asArr(x)) {
    if (typeof s === 'string') clean(s).split(/\n+/).forEach(t => t && out.push(t));
    else if (s && /HowToSection/i.test(asArr(s['@type']).join())) { if (s.name) out.push('## ' + clean(s.name)); out.push(...flatSteps(s.itemListElement)); }
    else if (s) { const t = clean(s.text || s.name); if (t) t.split(/\n+/).forEach(u => out.push(u)); }
  }
  return out;
}
function collectNodes(v, acc = []) {
  if (Array.isArray(v)) v.forEach(x => collectNodes(x, acc));
  else if (v && typeof v === 'object') { acc.push(v); if (v['@graph']) collectNodes(v['@graph'], acc); }
  return acc;
}
function recipeFromLd(blobs, url) {
  const nodes = [];
  for (const b of blobs) { try { collectNodes(JSON.parse(b), nodes); } catch {} }
  const n = nodes.find(x => asArr(x['@type']).some(t => /^Recipe$/i.test(t)));
  if (!n) return null;
  let img = asArr(n.image)[0]; if (img && typeof img === 'object') img = img.url || img.contentUrl;
  const y = asArr(n.recipeYield).map(String).join(' ');
  const servings = parseInt((y.match(/\d+/) || [])[0]) || 0;
  const tags = [...asArr(n.recipeCategory), ...asArr(n.recipeCuisine), ...String(asArr(n.keywords).join(',')).split(',')]
    .map(t => clean(t).toLowerCase()).filter(t => t && t.length < 24);
  return {
    id: uid(), title: clean(n.name) || 'Untitled', url: url || n.url || '', image: img || '',
    servings, yieldText: servings ? '' : clean(y),
    prep: minutes(n.prepTime), cook: minutes(n.cookTime), total: minutes(n.totalTime),
    ingredients: asArr(n.recipeIngredient).map(clean).filter(Boolean),
    steps: flatSteps(n.recipeInstructions),
    notes: '', tags: [...new Set(tags)].slice(0, 6), fav: false, added: Date.now(),
  };
}
function recipeFromHtml(html, url) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blobs = [...doc.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent);
  return recipeFromLd(blobs, url);
}
async function fetchHtml(url) {
  const w = (db.settings.worker || '').replace(/\/+$/, '');
  const tries = [url];
  if (w) tries.unshift(w + '/?url=' + encodeURIComponent(url));
  tries.push('https://corsproxy.io/?' + encodeURIComponent(url), 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url));
  for (const t of tries) {
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 12000);
      const r = await fetch(t, { signal: ctl.signal }); clearTimeout(to);
      if (r.ok) { const txt = await r.text(); if (txt.length > 300) return txt; }
    } catch {}
  }
  throw new Error('Could not fetch that page.');
}
async function importUrl(url) {
  const html = await fetchHtml(url);
  const r = recipeFromHtml(html, url);
  if (!r || (!r.ingredients.length && !r.steps.length)) throw new Error('No recipe data found on that page.');
  return r;
}

/* ---------- routing ---------- */
const view = { q: '', tag: '', servings: {}, got: {}, done: {} };
function route() {
  const hash = location.hash.slice(1) || '/';
  const [path, ...qs] = hash.split('?');
  const query = qs.join('?');
  const p = path.split('/').filter(Boolean);
  document.body.classList.toggle('cooking', p[0] === 'cook');
  if (p[0] !== 'cook') releaseWake();
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on',
    (a.dataset.tab === 'lib' && (!p[0] || ['r', 'edit', 'add', 'import'].includes(p[0]))) ||
    (a.dataset.tab === 'grocery' && p[0] === 'grocery') || (a.dataset.tab === 'settings' && p[0] === 'settings')));
  const app = $('#app');
  const R = { '': vLibrary, r: vRecipe, cook: vCook, edit: vEdit, add: vAdd, grocery: vGrocery, settings: vSettings, import: vBookmarklet };
  app.innerHTML = (R[p[0] || ''] || vLibrary)(p[1], query);
  if (p[0] !== 'cook') window.scrollTo(0, 0);
  if (p[0] === 'cook') requestWake();
  const post = { import: () => runBookmarklet(query), add: () => { if (query.startsWith('url=')) { $('#url').value = decodeURIComponent(query.slice(4)); doImport(); } } }[p[0]];
  post && post();
}
window.addEventListener('hashchange', route);

/* ---------- views ---------- */
const mins = n => !n ? '' : n >= 60 ? `${Math.floor(n / 60)}h${n % 60 ? ' ' + (n % 60) + 'm' : ''}` : `${n}m`;
const totalOf = r => r.total || (r.prep + r.cook) || 0;

function vLibrary() {
  const q = view.q.toLowerCase();
  const tags = [...new Set(db.recipes.flatMap(r => r.tags || []))].sort();
  const list = db.recipes.filter(r =>
    (!view.tag || (view.tag === '★' ? r.fav : (r.tags || []).includes(view.tag))) &&
    (!q || (r.title + ' ' + r.ingredients.join(' ') + ' ' + (r.tags || []).join(' ')).toLowerCase().includes(q)))
    .sort((a, b) => b.added - a.added);
  return `<div class="bar"><h1>Recipes</h1><a class="btn primary" href="#/add">+ Add</a></div>
  <input id="search" type="search" placeholder="Search title, ingredient, tag" value="${esc(view.q)}">
  ${db.recipes.length ? `<div class="chips"><button class="chip ${!view.tag ? 'on' : ''}" data-tag="">All</button>
    <button class="chip ${view.tag === '★' ? 'on' : ''}" data-tag="★">★ Favorites</button>
    ${tags.map(t => `<button class="chip ${view.tag === t ? 'on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
  ${list.length ? `<div class="grid">${list.map(r => `<a class="card" href="#/r/${r.id}">
    <div class="ph" style="${r.image ? `background-image:url('${esc(r.image)}')` : ''}"></div>
    ${r.fav ? '<span class="fav">★</span>' : ''}<div class="t">${esc(r.title)}</div>
    <div class="m muted">${mins(totalOf(r))}</div></a>`).join('')}</div>`
    : `<div class="empty">${db.recipes.length ? 'No matches.' : 'No recipes yet.<br><br><a class="btn primary" href="#/add">Import your first recipe</a>'}</div>`}`;
}

function vRecipe(id) {
  const r = byId(id); if (!r) return '<p>Recipe not found. <a href="#/">Back</a></p>';
  const base = r.servings || 0, sv = view.servings[id] || base, k = base ? sv / base : 1;
  const list = (arr, tag) => arr.map(s => s.startsWith('## ') ? `<li class="head">${esc(s.slice(3))}</li>` : `<li>${tag ? esc(scaleLine(s, k)) : esc(s)}</li>`).join('');
  return `<div class="bar"><a href="#/">‹ Recipes</a><span><button class="ghost" data-act="fav">${r.fav ? '★' : '☆'}</button><a class="btn" href="#/edit/${id}">Edit</a></span></div>
  <h1>${esc(r.title)}</h1>
  ${r.image ? `<img class="hero" src="${esc(r.image)}" alt="" onerror="this.remove()">` : ''}
  <div class="meta">
    ${r.prep ? `<div><span class="muted">Prep</span><b>${mins(r.prep)}</b></div>` : ''}
    ${r.cook ? `<div><span class="muted">Cook</span><b>${mins(r.cook)}</b></div>` : ''}
    ${r.total && !(r.prep && r.cook) ? `<div><span class="muted">Total</span><b>${mins(r.total)}</b></div>` : ''}
    ${base ? `<div><span class="muted">Servings</span><span class="stepper"><button data-act="sv-" aria-label="Fewer">−</button><b>${sv}</b><button data-act="sv+" aria-label="More">+</button></span></div>`
      : r.yieldText ? `<div><span class="muted">Yield</span><b>${esc(r.yieldText)}</b></div>` : ''}
  </div>
  <div class="row"><a class="btn primary" href="#/cook/${id}">Start cooking</a><button data-act="togro">Add to groceries</button></div>
  <h2>Ingredients</h2><ul class="ing">${list(r.ingredients, true)}</ul>
  <h2>Method</h2><ol class="steps">${list(r.steps)}</ol>
  ${r.notes ? `<h2>Notes</h2><p style="white-space:pre-wrap">${esc(r.notes)}</p>` : ''}
  <p>${(r.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</p>
  ${r.url ? `<p class="muted">Source: <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(new URL(r.url, location.href).hostname)}</a></p>` : ''}`;
}

function vCook(id) {
  const r = byId(id); if (!r) return '<p>Not found.</p>';
  const base = r.servings || 0, sv = view.servings[id] || base, k = base ? sv / base : 1;
  const got = view.got[id] || (view.got[id] = {}), done = view.done[id] || (view.done[id] = {});
  let n = -1;
  return `<div class="cook"><div class="bar"><a class="btn" href="#/r/${id}">Done</a><b style="flex:1;text-align:center">${esc(r.title)}</b>
    <button data-act="ingtoggle">Ingredients</button></div>
  <div class="ing-panel" id="ingp" hidden><ul class="ing">${r.ingredients.map((s, i) => `<li data-got="${i}" class="${got[i] ? 'got' : ''}">${esc(scaleLine(s, k))}</li>`).join('')}</ul></div>
  <ol class="steps">${r.steps.map(s => {
    if (s.startsWith('## ')) return `<li class="head">${esc(s.slice(3))}</li>`;
    n++; return `<li data-step="${n}" class="${done[n] ? 'done' : ''}">${stepHtml(s)}</li>`;
  }).join('')}</ol><p class="muted" style="text-align:center">Tap a step to mark it done. Screen stays awake.</p><div style="height:70px"></div></div>`;
}
const TIME_RE = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi;
function stepHtml(s) {
  let out = '', last = 0, m; TIME_RE.lastIndex = 0;
  while ((m = TIME_RE.exec(s))) {
    const v = parseFloat(m[2] || m[1]), u = m[3][0].toLowerCase();
    const secs = Math.round(v * (u === 'h' ? 3600 : u === 'm' ? 60 : 1));
    out += esc(s.slice(last, m.index)) + esc(m[0]) + `<button class="tbtn" data-timer="${secs}" data-label="${esc(m[0])}">⏱ start</button>`;
    last = m.index + m[0].length;
  }
  return out + esc(s.slice(last));
}

function vEdit(id) {
  const r = (id && byId(id)) || { title: '', url: '', image: '', servings: 4, prep: 0, cook: 0, ingredients: [], steps: [], notes: '', tags: [] };
  const f = (name, label, val, type = 'text') => `<label>${label}</label><input name="${name}" type="${type}" value="${esc(val)}">`;
  return `<div class="bar"><a href="#/${id ? 'r/' + id : ''}">‹ Cancel</a><h1 style="margin:0">${id ? 'Edit' : 'New'} recipe</h1><span></span></div>
  <form id="editform" data-id="${id || ''}">
    ${f('title', 'Title', r.title)}${f('url', 'Source link', r.url)}${f('image', 'Photo URL', r.image)}
    <div class="row">${['servings', 'prep', 'cook'].map(k => `<div style="flex:1">${f(k, k === 'servings' ? 'Servings' : k[0].toUpperCase() + k.slice(1) + ' (min)', r[k] || '', 'number')}</div>`).join('')}</div>
    ${f('tags', 'Tags (comma separated)', (r.tags || []).join(', '))}
    <label>Ingredients (one per line)</label><textarea name="ingredients">${esc(r.ingredients.join('\n'))}</textarea>
    <label>Method (one step per line; start a line with ## for a section heading)</label><textarea name="steps" style="min-height:220px">${esc(r.steps.join('\n'))}</textarea>
    <label>Notes</label><textarea name="notes" style="min-height:80px">${esc(r.notes || '')}</textarea>
    <div class="row" style="margin-top:16px"><button class="primary" type="submit">Save</button>${id ? '<button type="button" class="danger" data-act="del">Delete</button>' : ''}</div>
  </form>`;
}

function vAdd() {
  return `<div class="bar"><a href="#/">‹ Recipes</a><span></span></div><h1>Add a recipe</h1>
  <label>Paste a recipe link</label>
  <div class="row"><input id="url" type="url" placeholder="https://…" inputmode="url" autocapitalize="off"><button class="primary" data-act="import">Import</button></div>
  <p id="status" class="muted"></p>
  <p class="muted">Works with most recipe sites. If a site blocks it, use the bookmarklet in <a href="#/settings">Settings</a>.</p>
  <h2>Other ways</h2><div class="row"><a class="btn" href="#/edit">Type it in</a><label class="btn" style="margin:0;color:var(--ink);font-size:1rem">Import Mise backup<input id="restore" type="file" accept=".json" hidden></label></div>`;
}

function vGrocery() {
  const open = db.grocery.filter(g => !g.done), done = db.grocery.filter(g => g.done);
  const row = g => `<li class="${g.done ? 'done' : ''}"><input type="checkbox" data-g="${g.id}" ${g.done ? 'checked' : ''}><span>${esc(g.text)}${g.from ? `<small>${esc(g.from)}</small>` : ''}</span><button class="ghost" data-gdel="${g.id}" aria-label="Remove">×</button></li>`;
  return `<div class="bar"><h1>Groceries</h1><button data-act="gclear">Clear checked</button></div>
  <form id="gform" class="row"><input name="t" placeholder="Add an item" autocomplete="off"><button class="primary">Add</button></form>
  <div class="gro">${db.grocery.length ? `<ul>${open.map(row).join('')}${done.map(row).join('')}</ul>` : '<div class="empty">Nothing on the list.<br>Open a recipe and tap “Add to groceries”.</div>'}</div>`;
}

function bookmarklet() {
  const app = location.origin + location.pathname;
  const js = `javascript:(function(){var s=[].map.call(document.querySelectorAll('script[type="application/ld+json"]'),function(e){return e.textContent});var d=btoa(unescape(encodeURIComponent(JSON.stringify({u:location.href,s:s})))).replace(/\\+/g,'-').replace(/\\//g,'_');window.open('${app}#/import?d='+d)})()`;
  return js;
}
function vSettings() {
  const bm = bookmarklet();
  return `<h1>Settings</h1>
  <div class="card-box"><h2>Install</h2><p class="muted">iPhone: Share → Add to Home Screen. Android/desktop Chrome: menu → Install app. On Android you can then share a recipe link straight to Mise.</p></div>
  <div class="card-box"><h2>Import bookmarklet</h2>
    <p class="muted">For sites that block link import, or on iPhone: save this as a bookmark, then tap it while viewing any recipe page.</p>
    <p><a class="btn primary" href="${esc(bm)}" onclick="event.preventDefault();toast('Drag me to your bookmarks bar, or use Copy')">📌 Save to Mise</a> <button data-act="copybm">Copy code</button></p></div>
  <div class="card-box"><h2>Your own import proxy (optional)</h2>
    <p class="muted">Free Cloudflare Worker, see <code>worker/</code> in the repo. Makes link import more reliable.</p>
    <input id="worker" placeholder="https://mise-proxy.you.workers.dev" value="${esc(db.settings.worker || '')}"><p><button data-act="saveworker">Save</button></p></div>
  <div class="card-box"><h2>Backup</h2><p class="muted">${db.recipes.length} recipes stored on this device only. Export regularly.</p>
    <div class="row"><button data-act="export">Export backup</button><label class="btn" style="margin:0;color:var(--ink);font-size:1rem">Import backup<input id="restore" type="file" accept=".json" hidden></label></div></div>`;
}

function vBookmarklet() { return '<h1>Importing…</h1><p id="status" class="muted">Reading recipe data.</p>'; }
function runBookmarklet(query) {
  const st = $('#status');
  try {
    const d = query.replace(/^d=/, '').replace(/-/g, '+').replace(/_/g, '/');
    const p = JSON.parse(decodeURIComponent(escape(atob(d))));
    const r = recipeFromLd(p.s, p.u);
    if (!r) throw 0;
    db.recipes.push(r); save(); toast('Imported'); location.replace('#/r/' + r.id);
  } catch { st.innerHTML = 'That page has no recipe data. <a href="#/edit">Type it in instead</a>.'; }
}

/* ---------- actions ---------- */
async function doImport() {
  const url = $('#url').value.trim(), st = $('#status');
  if (!/^https?:\/\//i.test(url)) return (st.textContent = 'Enter a full link starting with http.');
  st.textContent = 'Fetching…';
  try {
    const r = await importUrl(url);
    db.recipes.push(r); save(); toast('Imported'); location.hash = '#/r/' + r.id;
  } catch (e) { st.innerHTML = esc(e.message) + ' Try the bookmarklet in <a href="#/settings">Settings</a>, or <a href="#/edit">type it in</a>.'; }
}
function addToGroceries(r) {
  const base = r.servings || 0, sv = view.servings[r.id] || base, k = base ? sv / base : 1;
  r.ingredients.forEach(s => db.grocery.push({ id: uid(), text: scaleLine(s, k), done: false, from: r.title }));
  save(); toast(`Added ${r.ingredients.length} items`);
}
function download(name, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click();
}

document.addEventListener('click', e => {
  const t = e.target.closest('button,[data-step],[data-got]'); if (!t) return;
  const id = location.hash.split('/')[2]?.split('?')[0], r = byId(id), act = t.dataset.act;
  if (t.dataset.tag !== undefined) { view.tag = t.dataset.tag; return route(); }
  if (t.dataset.timer) return startTimer(+t.dataset.timer, t.dataset.label);
  if (t.dataset.step !== undefined) { const d = view.done[id]; d[t.dataset.step] = !d[t.dataset.step]; t.classList.toggle('done'); return; }
  if (t.dataset.got !== undefined) { const g = view.got[id]; g[t.dataset.got] = !g[t.dataset.got]; t.classList.toggle('got'); return; }
  if (t.dataset.gdel) { db.grocery = db.grocery.filter(g => g.id !== t.dataset.gdel); save(); return route(); }
  if (!act) return;
  if (act === 'fav') { r.fav = !r.fav; save(); route(); }
  if (act === 'sv+' || act === 'sv-') { view.servings[id] = Math.max(1, (view.servings[id] || r.servings) + (act === 'sv+' ? 1 : -1)); route(); }
  if (act === 'togro') addToGroceries(r);
  if (act === 'ingtoggle') $('#ingp').hidden = !$('#ingp').hidden;
  if (act === 'import') doImport();
  if (act === 'del' && confirm('Delete this recipe?')) { db.recipes = db.recipes.filter(x => x.id !== id); save(); location.hash = '#/'; }
  if (act === 'gclear') { db.grocery = db.grocery.filter(g => !g.done); save(); route(); }
  if (act === 'copybm') navigator.clipboard.writeText(bookmarklet()).then(() => toast('Copied'), () => toast('Copy failed'));
  if (act === 'saveworker') { db.settings.worker = $('#worker').value.trim(); save(); toast('Saved'); }
  if (act === 'export') download(`mise-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(db, null, 1));
});
document.addEventListener('input', e => {
  if (e.target.id === 'search') { view.q = e.target.value; const pos = e.target.selectionStart; route(); const s = $('#search'); s.focus(); s.setSelectionRange(pos, pos); }
});
document.addEventListener('change', e => {
  if (e.target.dataset.g) { const g = db.grocery.find(x => x.id === e.target.dataset.g); g.done = e.target.checked; save(); route(); }
  if (e.target.id === 'restore' && e.target.files[0]) e.target.files[0].text().then(txt => {
    try {
      const d = JSON.parse(txt); const have = new Set(db.recipes.map(r => r.id));
      const add = (d.recipes || []).filter(r => r && r.title && !have.has(r.id));
      db.recipes.push(...add); save(); toast(`Imported ${add.length} recipes`); route();
    } catch { toast('Not a Mise backup file'); }
  });
});
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'gform') { const v = e.target.t.value.trim(); if (v) { db.grocery.unshift({ id: uid(), text: v, done: false, from: '' }); save(); route(); $('#gform input').focus(); } }
  if (e.target.id === 'editform') {
    const f = new FormData(e.target), id = e.target.dataset.id;
    const lines = s => String(f.get(s)).split('\n').map(x => x.trim()).filter(Boolean);
    const data = {
      title: f.get('title').trim() || 'Untitled', url: f.get('url').trim(), image: f.get('image').trim(),
      servings: +f.get('servings') || 0, prep: +f.get('prep') || 0, cook: +f.get('cook') || 0,
      tags: f.get('tags').split(',').map(t => t.trim().toLowerCase()).filter(Boolean),
      ingredients: lines('ingredients'), steps: lines('steps'), notes: f.get('notes').trim(),
    };
    let r = id && byId(id);
    if (r) Object.assign(r, data); else { r = { id: uid(), fav: false, added: Date.now(), total: 0, yieldText: '', ...data }; db.recipes.push(r); }
    save(); location.hash = '#/r/' + r.id;
  }
});

/* ---------- timers + wake lock ---------- */
const timers = [];
function startTimer(secs, label) {
  timers.push({ id: uid(), end: Date.now() + secs * 1000, label, ring: false });
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  tick();
}
function beep() {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    [0, .35, .7].forEach(t => { const o = c.createOscillator(); o.frequency.value = 880; o.connect(c.destination); o.start(c.currentTime + t); o.stop(c.currentTime + t + .2); });
  } catch {}
  navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 300]);
}
function tick() {
  const box = $('#timers');
  for (const t of timers) {
    if (!t.ring && Date.now() >= t.end) {
      t.ring = true; beep(); toast(`Timer done: ${t.label}`);
      try { if (Notification.permission === 'granted') new Notification('Mise timer', { body: t.label + ' is done' }); } catch {}
    }
  }
  box.innerHTML = timers.map(t => {
    const left = Math.max(0, Math.ceil((t.end - Date.now()) / 1000));
    return `<div class="timer ${t.ring ? 'ring' : ''}" data-tid="${t.id}">${esc(t.label)} · ${t.ring ? 'done' : Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0')} <button class="ghost" data-tdel="${t.id}" style="color:inherit;padding:0 4px">×</button></div>`;
  }).join('');
}
setInterval(() => timers.length && tick(), 1000);
document.addEventListener('click', e => {
  const b = e.target.closest('[data-tdel]'); if (!b) return;
  const i = timers.findIndex(t => t.id === b.dataset.tdel); if (i >= 0) timers.splice(i, 1); tick();
});

let wake = null;
async function requestWake() { try { wake = await navigator.wakeLock?.request('screen'); } catch {} }
function releaseWake() { try { wake?.release(); } catch {} wake = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && location.hash.startsWith('#/cook')) requestWake(); });

/* ---------- boot ---------- */
(function boot() {
  // Android share target: ?url= or ?text= containing a link
  const sp = new URLSearchParams(location.search);
  const shared = [sp.get('url'), sp.get('text')].map(s => (s || '').match(/https?:\/\/\S+/)?.[0]).find(Boolean);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (shared) { history.replaceState(null, '', location.pathname); location.hash = '#/add?url=' + encodeURIComponent(shared); if (location.hash.startsWith('#/add')) return; }
  route();
})();
