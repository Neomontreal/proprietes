/* Interfaz madre: acceso por enlace mágico, solicitudes por etapa, detalle con fotos firmadas, notas y aprobaciones.
   Todo lo que viene del formulario es texto de terceros: se pinta siempre con textContent, nunca como HTML. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const C = JSON.parse($('#madre-config').textContent);
  const STAGES = [
    ['recu', 'Recibidas'], ['preparation', 'En preparación'], ['plan', 'Plan por aprobar'], ['credits', 'Créditos por aprobar'],
    ['generation', 'Generando'], ['publie', 'Publicadas'], ['vendu', 'Vendidas'], ['refuse', 'Rechazadas'],
  ];
  const NAME = Object.fromEntries(STAGES);
  const money = n => (n == null ? '—' : new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n));
  const date = s => new Date(s).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  const digits = s => String(s || '').replace(/\D/g, ''), intl = s => (digits(s).length === 10 ? '1' : '') + digits(s);

  // h('p', {class: 'x'}, 'texto', nodo…) — construye DOM sin innerHTML
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => { if (v == null || v === false) return; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v); });
    kids.flat(Infinity).forEach(k => { if (k != null && k !== false) el.append(k instanceof Node ? k : String(k)); });
    return el;
  }
  const safeHref = u => (/^(https?:|mailto:|tel:)/i.test(u || '') ? u : null);

  if (!window.supabase) { document.body.append(h('p', { class: 'wrap form-status', 'data-state': 'error' }, 'No se pudo cargar Supabase. Revisa la conexión.')); return; }
  const db = window.supabase.createClient(C.url, C.key, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' } });
  const login = $('[data-login]'), board = $('[data-board]'), list = $('[data-list]'), empty = $('[data-empty]'), filters = $('[data-filters]'), dlg = $('[data-detail]');
  const logout = $('[data-logout]');
  let rows = [], stage = 'activas';

  /* ---------- Acceso ---------- */
  $('[data-login-form]').addEventListener('submit', async e => {
    e.preventDefault();
    const st = $('[data-login-status]'), email = $('#email').value.trim(), b = $('button', e.target);
    b.disabled = true; st.dataset.state = ''; st.textContent = 'Enviando…';
    const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
    b.disabled = false;
    if (error) { st.dataset.state = 'error'; st.textContent = /rate|seconds/i.test(error.message) ? 'Espera un minuto antes de pedir otro enlace.' : 'Ese correo no tiene acceso.'; }
    else st.textContent = 'Listo: abre el enlace que llegó a tu correo en este mismo dispositivo.';
  });
  logout.addEventListener('click', async () => { await db.auth.signOut(); location.reload(); });

  db.auth.onAuthStateChange((_ev, session) => route(session));
  db.auth.getSession().then(({ data }) => route(data.session));

  let shown = null;
  function route(session) {
    const key = session ? session.user.id : 'out'; if (key === shown) return; shown = key;
    if (location.hash.includes('access_token')) history.replaceState(null, '', location.pathname);
    login.hidden = !!session; board.hidden = !session; logout.hidden = !session;
    if (session) load();
  }

  /* ---------- Lista ---------- */
  async function load() {
    const { data, error } = await db.from('submissions').select('*').order('created_at', { ascending: false });
    if (error) { list.replaceChildren(h('li', { class: 'form-status', 'data-state': 'error' }, 'No se pudieron leer las solicitudes: ' + error.message)); return; }
    rows = data || [];
    if (!rows.length && !(await isAdmin())) { list.replaceChildren(h('li', { class: 'form-status', 'data-state': 'error' }, 'Esta cuenta no es administradora.')); return; }
    drawFilters(); draw();
  }
  async function isAdmin() { const { data } = await db.rpc('is_admin'); return !!data; }

  const ACTIVE = ['recu', 'preparation', 'plan', 'credits', 'generation'];
  function drawFilters() {
    const count = s => rows.filter(r => (s === 'activas' ? ACTIVE.includes(r.status) : s === 'todas' || r.status === s)).length;
    const chip = (id, label) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(stage === id), onclick: () => { stage = id; drawFilters(); draw(); } },
      label, h('span', { class: 'chip__n' }, count(id)));
    filters.replaceChildren(chip('activas', 'En curso'), ...STAGES.map(([id, n]) => chip(id, n)), chip('todas', 'Todas'));
  }
  function draw() {
    const vis = rows.filter(r => (stage === 'activas' ? ACTIVE.includes(r.status) : stage === 'todas' || r.status === stage));
    list.replaceChildren(...vis.map(r => {
      const p = r.property || {}, b = r.broker || {}, photos = (r.media || []).filter(m => m.kind === 'photo').length;
      return h('li', {}, h('button', { type: 'button', class: 'sub-row', onclick: () => open(r) },
        h('span', { class: `badge badge--${r.status}` }, NAME[r.status] || r.status),
        h('span', { class: 'sub-row__main' }, h('strong', {}, p.address || 'Sin dirección'), h('span', {}, [p.city, money(p.price)].filter(Boolean).join(' · '))),
        h('span', { class: 'sub-row__meta' }, h('span', {}, b.name || ''), h('span', {}, `${photos} fotos · ${date(r.created_at)}`))));
    }));
    empty.hidden = vis.length > 0;
  }

  /* ---------- Detalle ---------- */
  const dl = pairs => h('dl', { class: 'facts' }, pairs.filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => [h('dt', {}, k), h('dd', {}, Array.isArray(v) ? v.join(', ') : v)]));
  const block = (title, ...kids) => h('section', { class: 'sub__block' }, h('h3', {}, title), ...kids);
  const para = (k, v) => (v ? h('div', { class: 'sub__text' }, h('p', { class: 'label' }, k), h('p', {}, v)) : null);

  async function open(r) {
    const p = r.property || {}, b = r.broker || {}, s = r.story || {}, nb = s.nearby || {}, A = r.admin || {};
    const photos = (r.media || []).filter(m => m.kind === 'photo'), plans = (r.media || []).filter(m => m.kind === 'plan');
    const gallery = h('ul', { class: 'sub__photos' }, photos.map(m => h('li', {}, h('span', { class: 'ph' }, String(m.order).padStart(2, '0')))));
    const plansEl = h('ul', { class: 'sub__plans' });
    const note = h('textarea', { rows: 4, 'aria-label': 'Notas internas' }); note.value = A.notes || '';
    const sel = h('select', { 'aria-label': 'Etapa' }, STAGES.map(([id, n]) => { const o = h('option', { value: id }, n); if (id === r.status) o.selected = true; return o; }));
    const slug = h('input', { type: 'text', placeholder: 'slug (p. ej. 428-strathcona)', 'aria-label': 'Slug' }); slug.value = r.slug || '';
    const url = h('input', { type: 'text', inputmode: 'url', placeholder: 'https://…', 'aria-label': 'Página publicada' }); url.value = r.site_url || '';
    const msg = h('p', { class: 'form-status', role: 'status' });

    async function save(patch, okText) {
      msg.dataset.state = ''; msg.textContent = 'Guardando…';
      const { data, error } = await db.from('submissions').update(patch).eq('id', r.id).select().single();
      if (error) { msg.dataset.state = 'error'; msg.textContent = 'No se guardó: ' + error.message; return; }
      Object.assign(r, data); msg.textContent = okText || 'Guardado.'; drawFilters(); draw();
      sel.value = r.status;
    }
    const approve = (key, to, text) => save({ status: to, admin: { ...r.admin, [key]: new Date().toISOString() } }, text);

    const planBox = A.plan ? block('Plan del recorrido', h('pre', { class: 'sub__plan' }, A.plan),
      r.status === 'plan' ? h('button', { type: 'button', class: 'btn btn--primary', onclick: () => approve('plan_ok_at', 'credits', 'Plan aprobado. Sigue la cotización de créditos.') }, h('span', { class: 'btn__text' }, 'Aprobar plan')) : null,
      A.plan_ok_at ? h('p', { class: 'hint' }, 'Aprobado el ' + date(A.plan_ok_at)) : null) : null;
    const q = A.quote;
    const quoteBox = q ? block('Cotización de créditos (Higgsfield)',
      h('ul', { class: 'sub__quote' }, (q.items || []).map(it => h('li', {}, h('span', {}, it.label), h('b', {}, `${it.credits} cr`)))),
      h('p', { class: 'sub__total' }, `Total: ${q.total} créditos`, q.balance != null ? ` · saldo ${q.balance}` : ''),
      r.status === 'credits' ? h('button', { type: 'button', class: 'btn btn--primary', onclick: () => approve('credits_ok_at', 'generation', 'Créditos aprobados. La generación queda autorizada para esta cotización.') }, h('span', { class: 'btn__text' }, `Aprobar ${q.total} créditos`)) : null,
      A.credits_ok_at ? h('p', { class: 'hint' }, 'Aprobado el ' + date(A.credits_ok_at)) : null) : null;

    const wa = intl(b.whatsapp || b.phone), tel = intl(b.phone);
    dlg.replaceChildren(h('div', { class: 'sub__inner' },
      h('header', { class: 'sub__head' },
        h('div', {}, h('span', { class: `badge badge--${r.status}` }, NAME[r.status]), h('h2', {}, p.address || 'Sin dirección'),
          h('p', { class: 'lead' }, [p.zone, p.city, money(p.price)].filter(Boolean).join(' · ')),
          h('p', { class: 'hint' }, `Expediente ${r.id.slice(0, 8).toUpperCase()} · recibido ${date(r.created_at)} · idioma ${r.lang.toUpperCase()}`)),
        h('button', { type: 'button', class: 'sub__close', 'aria-label': 'Cerrar', onclick: () => dlg.close() }, '×')),
      block('Corredor', dl([['Nombre', b.name], ['Agencia', b.agency], ['Permiso OACIQ', b.licence], ['Teléfono', b.phone], ['Correo', b.email]]),
        h('div', { class: 'sub__links' },
          wa.length >= 10 ? h('a', { class: 'btn btn--ghost', href: `https://wa.me/${wa}`, target: '_blank', rel: 'noopener' }, h('span', { class: 'btn__text' }, 'WhatsApp')) : null,
          b.email ? h('a', { class: 'btn btn--ghost', href: `mailto:${b.email}` }, h('span', { class: 'btn__text' }, 'Correo')) : null,
          tel.length >= 10 ? h('a', { class: 'btn btn--ghost', href: `tel:+${tel}` }, h('span', { class: 'btn__text' }, 'Llamar')) : null)),
      block('Propiedad', dl([['Tipo', p.type], ['Precio', money(p.price)], ['Recámaras', p.beds], ['Baños', p.baths], ['Medios baños', p.halfBaths], ['Superficie', p.area && `${p.area} pi²`],
        ['Terreno', p.lot && `${p.lot} pi²`], ['Año', p.year], ['Estacionamiento', p.parking], ['Características', p.features], ['Código postal', p.postal]]),
        safeHref(p.centris_url) ? h('a', { class: 'link', href: p.centris_url, target: '_blank', rel: 'noopener noreferrer' }, 'Ver ficha Centris ↗') : null),
      block('Historia', para('Lo único', s.highlights), para('Renovaciones', s.renovations), para('Incluye', s.inclusions), para('No incluye', s.exclusions),
        dl([['Escuelas', nb.schools], ['Parques', nb.parks], ['Transporte', nb.transit], ['Comercios', nb.shops],
          ['Casa abierta', s.openHouse && `${s.openHouse.date} ${s.openHouse.start || ''}–${s.openHouse.end || ''}`]])),
      block(`Fotos (${photos.length})`, gallery),
      plans.length ? block(`Planos (${plans.length})`, plansEl) : null,
      planBox, quoteBox,
      block('Seguimiento', h('div', { class: 'sub__form' },
        h('label', {}, h('span', { class: 'label' }, 'Etapa'), sel),
        h('label', {}, h('span', { class: 'label' }, 'Slug'), slug),
        h('label', { class: 'full' }, h('span', { class: 'label' }, 'Página publicada'), url),
        h('label', { class: 'full' }, h('span', { class: 'label' }, 'Notas internas'), note)),
        h('div', { class: 'sub__links' },
          h('button', { type: 'button', class: 'btn btn--primary', onclick: () => save({ status: sel.value, slug: slug.value.trim() || null, site_url: url.value.trim() || null, admin: { ...r.admin, notes: note.value } }) }, h('span', { class: 'btn__text' }, 'Guardar')),
          r.site_url && safeHref(r.site_url) ? h('a', { class: 'btn btn--ghost', href: r.site_url, target: '_blank', rel: 'noopener' }, h('span', { class: 'btn__text' }, 'Abrir página ↗')) : null),
        msg),
      h('p', { class: 'hint' }, `Consentimientos: fotos ${r.consent?.photos_rights ? '✓' : '✗'} · corredor ${r.consent?.broker_ok ? '✓' : '✗'} · privacidad ${r.consent?.privacy ? '✓' : '✗'}`)));
    dlg.showModal(); dlg.scrollTop = 0;

    // Fotos privadas: URLs firmadas por 1 hora, con miniatura transformada si el plan lo permite
    const paths = (r.media || []).map(m => m.path);
    if (!paths.length) return;
    const { data, error } = await db.storage.from('intake').createSignedUrls(paths, 3600);
    if (error || !data) return;
    const signed = Object.fromEntries(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
    photos.forEach((m, i) => {
      const u = signed[m.path], li = gallery.children[i]; if (!u || !li) return;
      const a = h('a', { href: u, target: '_blank', rel: 'noopener', title: m.name });
      if (/jpe?g|png|webp/i.test(m.type || m.path)) a.append(h('img', { src: u, alt: m.name, loading: 'lazy', decoding: 'async' }));
      else a.append(h('span', { class: 'ph' }, (m.name.split('.').pop() || '').toUpperCase()));
      a.append(h('b', {}, String(m.order).padStart(2, '0'))); li.replaceChildren(a);
    });
    plans.forEach(m => { const u = signed[m.path]; if (u) plansEl.append(h('li', {}, h('a', { class: 'link', href: u, target: '_blank', rel: 'noopener' }, `${m.name} ↗`))); });
  }
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
})();
