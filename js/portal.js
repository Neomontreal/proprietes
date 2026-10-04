/* Plataforma madre: búsqueda, filtros, orden, vistas previas en movimiento y tarjetas flotantes. Sin librerías. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const html = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  let D = {}; try { D = JSON.parse($('#portal-data').textContent); } catch { /* sin datos */ }
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  /* ---------- Visita libre vencida: se oculta ---------- */
  $$('[data-until]').forEach(el => { const t = Date.parse(el.dataset.until); if (t && Date.now() > t) el.remove(); });

  /* ---------- Aparición suave ---------- */
  if (!reduce && 'IntersectionObserver' in window) {
    html.classList.add('reveal-on');
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px' });
    $$('.reveal').forEach(el => io.observe(el));
  }

  /* ---------- Vistas previas en movimiento: solo cuando la tarjeta está en pantalla ---------- */
  const videos = $$('.pc__video');
  if (!reduce && !saveData && videos.length && 'IntersectionObserver' in window) {
    const vo = new IntersectionObserver(es => es.forEach(e => {
      const v = e.target;
      if (e.isIntersecting) {
        if (!v.src) v.src = v.dataset.src;
        v.play().then(() => v.classList.add('is-playing')).catch(() => {});
      } else { v.pause(); }
    }), { threshold: .55 });
    videos.forEach(v => vo.observe(v));
  }

  /* ---------- Inclinación sutil al pasar el cursor (solo puntero fino) ---------- */
  if (!reduce && matchMedia('(pointer: fine)').matches) {
    $$('.pc__media').forEach(m => {
      m.addEventListener('pointermove', e => {
        const r = m.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        m.style.setProperty('--rx', `${(-y * 4).toFixed(2)}deg`); m.style.setProperty('--ry', `${(x * 5).toFixed(2)}deg`);
      });
      m.addEventListener('pointerleave', () => { m.style.setProperty('--rx', '0deg'); m.style.setProperty('--ry', '0deg'); });
    });
  }

  /* ---------- Búsqueda, chips, filtros y orden ---------- */
  const grid = $('[data-grid]'); if (!grid) return;
  const cards = $$('.pc', grid), countEl = $('[data-count]'), emptyEl = $('[data-empty]');
  const input = $('#q'), list = $('#suggest'), sortSel = $('#sort');
  const fsel = n => $(`[data-f="${n}"]`);
  const S = { q: '', zone: '', band: '', min: '', max: '', beds: '', baths: '', type: '', feats: [], sort: 'recent' };

  // estado ⇄ URL (la búsqueda se puede compartir)
  const params = new URLSearchParams(location.search);
  Object.keys(S).forEach(k => { if (params.has(k)) S[k] = k === 'feats' ? params.get(k).split(',').filter(Boolean) : params.get(k); });
  const writeURL = () => {
    const p = new URLSearchParams();
    Object.entries(S).forEach(([k, v]) => { if (k === 'sort' ? v !== 'recent' : (Array.isArray(v) ? v.length : v)) p.set(k, Array.isArray(v) ? v.join(',') : v); });
    history.replaceState(null, '', (p.toString() ? `?${p}` : location.pathname) + location.hash);
  };
  const active = () => !!(S.q || S.zone || S.band !== '' || S.min || S.max || S.beds || S.baths || S.type || S.feats.length);

  // zona escrita → id de zona (con sinónimos: TMR = Mont-Royal…)
  const zoneIndex = (D.zones || []).map(z => ({ ...z, keys: [z.name, z.id, ...(z.aka || [])].map(norm) }));
  const matchZone = q => { const n = norm(q); return n && zoneIndex.find(z => z.keys.some(k => k === n || k.startsWith(n) && n.length >= 3)); };

  function apply() {
    const bands = D.bands || [];
    const q = norm(S.q);
    let n = 0;
    cards.forEach(c => {
      const d = c.dataset, price = +d.price;
      let ok = true;
      if (q) ok = q.split(' ').every(w => d.q.includes(w));
      if (ok && S.zone) ok = d.zone === S.zone;
      if (ok && S.band !== '') { const i = +S.band, lo = bands[i], hi = bands[i + 1]; ok = price >= lo && (hi === undefined || price < hi); }
      if (ok && S.min) ok = price >= +S.min;
      if (ok && S.max) ok = price <= +S.max;
      if (ok && S.beds) ok = +d.beds >= +S.beds;
      if (ok && S.baths) ok = +d.baths >= +S.baths;
      if (ok && S.type) ok = d.type === S.type;
      if (ok && S.feats.length) ok = S.feats.every(f => d.feats.split(' ').includes(f));
      c.hidden = !ok; if (ok) n++;
    });
    const key = { 'price-asc': c => +c.dataset.price, 'price-desc': c => -c.dataset.price, 'area-desc': c => -c.dataset.area }[S.sort];
    const sorted = [...cards].sort(key ? (a, b) => key(a) - key(b) : (a, b) => b.dataset.date.localeCompare(a.dataset.date));
    sorted.forEach(c => grid.append(c));
    if (countEl && D.count) countEl.textContent = D.count[n === 1 || (D.lang === 'fr' && n === 0) ? 0 : 1].replace('{n}', n);   // en francés 0 va en singular
    if (emptyEl) emptyEl.hidden = n > 0;
    $$('.chip[data-zone]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.zone === S.zone)));
    $$('.chip[data-band]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.band === S.band)));
    $$('.chip[data-feat]').forEach(b => b.setAttribute('aria-pressed', String(S.feats.includes(b.dataset.feat))));
    document.body.classList.toggle('is-filtering', active());
    writeURL();
  }

  const goResults = () => $('#proprietes').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });

  // sugerencias del buscador (zonas disponibles)
  let sel = -1;
  const renderList = () => {
    const n = norm(input.value);
    const items = n ? zoneIndex.filter(z => z.keys.some(k => k.includes(n))) : zoneIndex;
    list.innerHTML = '';
    items.slice(0, 6).forEach((z, i) => {
      const li = document.createElement('li'); li.setAttribute('role', 'option'); li.dataset.zone = z.id; li.id = `opt-${i}`;
      li.textContent = z.name; const c = document.createElement('span'); c.textContent = z.n; li.append(c);
      li.addEventListener('mousedown', e => { e.preventDefault(); pick(z); });
      list.append(li);
    });
    list.hidden = !items.length || document.activeElement !== input; input.setAttribute('aria-expanded', String(!list.hidden)); sel = -1;
  };
  const pick = z => { S.zone = z.id; S.q = ''; input.value = z.name; list.hidden = true; input.setAttribute('aria-expanded', 'false'); apply(); goResults(); };
  if (input) {
    input.value = S.q || (S.zone && zoneIndex.find(z => z.id === S.zone)?.name) || '';
    input.addEventListener('focus', renderList);
    input.addEventListener('input', () => { S.zone = ''; renderList(); });
    input.addEventListener('blur', () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); });
    input.addEventListener('keydown', e => {
      const opts = $$('li', list);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (!opts.length) return;
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
        opts.forEach((o, i) => o.setAttribute('aria-selected', String(i === sel))); input.setAttribute('aria-activedescendant', opts[sel].id);
      } else if (e.key === 'Escape') { list.hidden = true; }
      else if (e.key === 'Enter' && sel >= 0 && opts[sel]) { e.preventDefault(); pick(zoneIndex.find(z => z.id === opts[sel].dataset.zone)); }
    });
    input.form.addEventListener('submit', e => {
      e.preventDefault();
      const z = matchZone(input.value);
      if (z) { S.zone = z.id; S.q = ''; } else { S.zone = ''; S.q = input.value.trim(); }
      list.hidden = true; input.blur(); apply(); goResults();
    });
  }

  $$('.chip[data-zone]').forEach(b => b.addEventListener('click', () => {
    S.zone = S.zone === b.dataset.zone ? '' : b.dataset.zone; S.q = ''; if (input) input.value = S.zone ? b.firstChild.textContent.trim() : '';
    apply(); if (S.zone) goResults();
  }));
  $$('.chip[data-band]').forEach(b => b.addEventListener('click', () => { S.band = S.band === b.dataset.band ? '' : b.dataset.band; apply(); if (S.band !== '') goResults(); }));
  $$('.chip[data-feat]').forEach(b => b.addEventListener('click', () => {
    const f = b.dataset.feat; S.feats = S.feats.includes(f) ? S.feats.filter(x => x !== f) : [...S.feats, f]; apply();
  }));
  ['min', 'max', 'beds', 'baths', 'type'].forEach(k => { const s = fsel(k); if (s) { s.value = S[k]; s.addEventListener('change', () => { S[k] = s.value; apply(); }); } });
  if (sortSel) { sortSel.value = S.sort; sortSel.addEventListener('change', () => { S.sort = sortSel.value; apply(); }); }
  const toggle = $('.pfilters__toggle'), panel = $('#filters');
  if (toggle && panel) toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); });
  const clear = $('[data-clear]');
  if (clear) clear.addEventListener('click', () => {
    Object.assign(S, { q: '', zone: '', band: '', min: '', max: '', beds: '', baths: '', type: '', feats: [] });
    if (input) input.value = ''; ['min', 'max', 'beds', 'baths', 'type'].forEach(k => { const s = fsel(k); if (s) s.value = ''; }); apply();
  });

  apply();
})();
