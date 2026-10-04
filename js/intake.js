/* Formulario de alta: pasos, validación, fotos y envío a Supabase (fotos al bucket privado «intake», datos a «submissions»). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const C = JSON.parse($('#intake-config').textContent), t = C.t;
  const form = $('#intake'), steps = $$('[data-step]', form), dots = $$('[data-step-dot]');
  const back = $('[data-back]'), next = $('[data-next]'), status = $('[data-status]'), bar = $('[data-progress]');
  const MAX = { files: 80, plans: 12 }, MB = 25 * 1024 * 1024;
  const OK_TYPES = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;
  const files = { files: [], plans: [] };
  const DRAFT = 'neo-intake-' + C.lang;
  let cur = 0, busy = false, id = null;   // el mismo expediente si hay que reintentar el envío

  const say = (msg, err) => { status.textContent = msg || ''; status.dataset.state = err ? 'error' : ''; };
  const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k]);

  /* ---------- Pasos ---------- */
  function show(i, quiet) {
    cur = i;
    steps.forEach((s, j) => { s.hidden = j !== i; });
    dots.forEach((d, j) => { d.classList.toggle('is-on', j === i); d.classList.toggle('is-done', j < i); });
    back.hidden = i === 0;
    $('.btn__text', next).textContent = i === steps.length - 1 ? t.send : t.next;
    say('');
    if (quiet) return;
    const h = $('h2', steps[i]); h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true });
    form.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  function valid(i) {
    let first = null;
    $$('input, select, textarea', steps[i]).forEach(el => {
      if (el.type === 'file') return;
      const bad = !el.checkValidity() || (el.required && el.type !== 'checkbox' && !el.value.trim());
      el.setAttribute('aria-invalid', String(bad)); if (bad && !first) first = el;
    });
    const fileInput = $('input[type="file"][required]', steps[i]);
    if (fileInput && !files.files.length) { fileInput.closest('.drop').setAttribute('aria-invalid', 'true'); first = first || fileInput; }
    if (first) { say(t.missing, true); (first.type === 'file' ? first.closest('.drop') : first).scrollIntoView({ block: 'center' }); if (first.type !== 'file') first.focus({ preventScroll: true }); }
    return !first;
  }

  back.addEventListener('click', () => show(cur - 1));
  next.addEventListener('click', () => { if (busy || !valid(cur)) return; if (cur < steps.length - 1) { save(); show(cur + 1); } else send(); });
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('input', e => { if (e.target.getAttribute('aria-invalid') === 'true' && e.target.checkValidity()) e.target.setAttribute('aria-invalid', 'false'); save(); });

  /* ---------- Borrador local (si se cierra la página, no se pierde lo escrito; las fotos no se guardan) ---------- */
  function save() {
    const d = {};
    $$('input:not([type="file"]):not([type="checkbox"]), select, textarea', form).forEach(el => { if (el.name && el.name !== '_gotcha') d[el.name] = el.value; });
    d.features = $$('input[name="features"]:checked', form).map(x => x.value);
    try { localStorage.setItem(DRAFT, JSON.stringify(d)); } catch { /* sin almacenamiento */ }
  }
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) || '{}');
    Object.entries(d).forEach(([k, v]) => {
      if (k === 'features') v.forEach(f => { const x = $(`input[name="features"][value="${CSS.escape(f)}"]`, form); if (x) x.checked = true; });
      else { const el = form.elements[k]; if (el && !(el instanceof RadioNodeList)) el.value = v; }
    });
  } catch { /* borrador dañado: se ignora */ }

  /* ---------- Fotos y planos ---------- */
  function addFiles(kind, list) {
    for (const f of list) {
      const type = f.type || (/\.hei[cf]$/i.test(f.name) ? 'image/heic' : '');
      if (!OK_TYPES.test(type) || f.size > MB) continue;
      if (kind === 'files' && type === 'application/pdf') continue;
      if (files[kind].length >= MAX[kind]) break;
      if (files[kind].some(x => x.name === f.name && x.size === f.size)) continue;
      files[kind].push(f);
    }
    render(kind);
  }
  function render(kind) {
    const ul = $(`[data-thumbs="${kind}"]`), count = $(`[data-count="${kind}"]`);
    ul.querySelectorAll('img').forEach(i => URL.revokeObjectURL(i.src));
    ul.innerHTML = '';
    files[kind].forEach((f, i) => {
      const li = document.createElement('li');
      if (/^image\/(jpeg|png|webp)$/.test(f.type)) { const img = new Image(); img.src = URL.createObjectURL(f); img.alt = ''; img.decoding = 'async'; li.append(img); }
      else { const s = document.createElement('span'); s.textContent = f.name.split('.').pop().toUpperCase(); li.append(s); }
      const n = document.createElement('b'); n.textContent = String(i + 1).padStart(2, '0'); li.append(n);
      const x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', `${t.remove} ${f.name}`); x.textContent = '×';
      x.addEventListener('click', () => { files[kind].splice(i, 1); render(kind); });
      li.append(x); ul.append(li);
    });
    const mb = files[kind].reduce((a, f) => a + f.size, 0) / 1048576;
    count.textContent = files[kind].length ? fmt(t.files, { n: files[kind].length, mb: mb.toFixed(1) }) : '';
    if (files[kind].length) $(`[data-drop="${kind}"]`).setAttribute('aria-invalid', 'false');
  }
  $$('[data-drop]').forEach(drop => {
    const kind = drop.dataset.drop, input = $('input', drop);
    input.addEventListener('change', () => { addFiles(kind, input.files); input.value = ''; input.required = false; });
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', e => addFiles(kind, e.dataTransfer.files));
  });

  /* ---------- Envío ---------- */
  const v = n => (form.elements[n] ? form.elements[n].value.trim() : '');
  const int = n => { const x = parseInt(v(n).replace(/\D/g, ''), 10); return Number.isFinite(x) ? x : null; };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
  const safe = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(-60) || 'archivo';

  async function send() {
    if (v('_gotcha')) return;                       // trampa para robots
    if (!window.supabase) { say(t.err, true); return; }
    busy = true; next.disabled = true; back.disabled = true;
    const db = window.supabase.createClient(C.url, C.key, { auth: { persistSession: false } });
    id = id || uuid(); const media = [];
    const queue = [...files.files.map((f, i) => ['photo', f, i]), ...files.plans.map((f, i) => ['plan', f, i])];
    let done = 0; bar.hidden = false;
    const tick = () => { const p = Math.round(done / queue.length * 100); bar.firstElementChild.style.width = p + '%'; say(fmt(t.sending, { p })); };
    tick();
    try {
      const work = queue.slice();
      const worker = async () => {
        for (let job; (job = work.shift());) {
          const [kind, f, i] = job;
          const path = `submissions/${id}/${kind}s/${String(i + 1).padStart(2, '0')}-${safe(f.name)}`;
          let err;
          for (let a = 0; a < 3; a++) {        // reintenta en redes móviles inestables
            ({ error: err } = await db.storage.from('intake').upload(path, f, { contentType: f.type || 'image/heic', upsert: false }));
            if (!err || /exists/i.test(err.message)) { err = null; break; }
            await new Promise(r => setTimeout(r, 1200 * (a + 1)));
          }
          if (err) throw err;
          media.push({ path, kind, order: i + 1, name: f.name, size: f.size, type: f.type });
          done++; tick();
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      media.sort((a, b) => a.kind.localeCompare(b.kind) || a.order - b.order);
      const row = {
        id, lang: C.lang,
        broker: { name: v('b_name'), agency: v('b_agency'), licence: v('b_licence'), phone: v('b_phone'), whatsapp: v('b_whatsapp') || v('b_phone'), email: v('b_email') },
        property: { centris_url: v('centris'), address: v('address'), city: v('city'), zone: v('zone'), postal: v('postal').toUpperCase(), type: v('type'),
                    price: int('price'), year: int('year'), beds: int('beds'), baths: int('baths'), halfBaths: int('half'), area: int('area'), lot: int('lot'),
                    parking: int('parking'), features: $$('input[name="features"]:checked', form).map(x => x.value) },
        story: { highlights: v('highlights'), renovations: v('renos'), inclusions: v('incl'), exclusions: v('excl'),
                 nearby: { schools: v('near_schools'), parks: v('near_parks'), transit: v('near_transit'), shops: v('near_shops') },
                 openHouse: v('oh_date') ? { date: v('oh_date'), start: v('oh_start'), end: v('oh_end') } : null },
        media,
        consent: { photos_rights: form.elements.c_photos.checked, broker_ok: form.elements.c_broker.checked, privacy: form.elements.c_privacy.checked, at: new Date().toISOString() },
      };
      const { error } = await db.from('submissions').insert(row, { returning: 'minimal' });
      if (error) throw error;
      try { localStorage.removeItem(DRAFT); } catch { /* sin almacenamiento */ }
      form.hidden = true; $('.stepper').hidden = true;
      const ok = $('[data-ok]'); ok.hidden = false; $('[data-ref]', ok).textContent = id.slice(0, 8).toUpperCase();
      $('h2', ok).setAttribute('tabindex', '-1'); $('h2', ok).focus();
    } catch (e) {
      console.error(e); say(t.err, true); bar.hidden = true;
    } finally { busy = false; next.disabled = false; back.disabled = false; }
  }

  show(0, true);
})();
