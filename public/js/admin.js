/* Aladdin Tech — painel do lojista (central do vendedor) */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const UI = ICONS.ui, ART = ICONS.art;
  const sv = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const IC = {
    dash: sv('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="4" rx="1.5"/><rect x="13" y="10" width="7" height="10" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/>'),
    orders: sv('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
    box: sv('<path d="M4 7.5L12 4l8 3.5v9L12 20l-8-3.5z"/><path d="M4 7.5l8 3.5 8-3.5M12 11v9"/>'),
    folder: sv('<path d="M3.5 6.5h6l2 2h9v10h-17z"/>'),
    fire: sv('<path d="M12 21c-4 0-7-2.7-7-6.5 0-3 2-5 3.5-6.5.2 1.6 1 2.8 2.2 3.3C10 8 11.5 5 14 3c0 3 5 5.5 5 11.5C19 18.3 16 21 12 21z"/>'),
    star: sv('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>'),
    ask: sv('<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.5"/><circle cx="12" cy="16.8" r=".6" fill="currentColor"/>'),
    users: sv('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.6-.3 4.6 1.3 5 4.3"/>'),
    lock: sv('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
    gear: sv('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>'),
    out: sv('<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>'),
    edit: sv('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
    eye: sv('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
    ext: sv('<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>'),
    copy: sv('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>'),
    pause: sv('<path d="M9 6v12M15 6v12"/>'),
    play: sv('<path d="M8 5.5v13l10.5-6.5z"/>'),
    wand: sv('<path d="M4 20L15 9M14 4v3M19 9h-3M17.5 5.5l-2 2M9 4.5l.6 1.4L11 6.5l-1.4.6L9 8.5l-.6-1.4L7 6.5l1.4-.6zM18 14l.6 1.4 1.4.6-1.4.6L18 18l-.6-1.4-1.4-.6 1.4-.6z"/>'),
    upload: sv('<path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19h14"/>'),
    grip: sv('<circle cx="9" cy="7" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="17" r="1"/><circle cx="15" cy="17" r="1"/>'),
    tag: UI.tag,
  };

  const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const fmtDate = (s) => s ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const pad = (n) => String(n).padStart(2, '0');
  const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const localNow = () => toLocalInput(new Date());
  const S = { cats: [], settings: {}, me: null, dirty: false };

  async function api(url, opts = {}) {
    const r = await fetch(url, { method: opts.method || 'GET', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && url !== '/api/admin/login') { renderLogin(); throw new Error(d.error || 'Sessão expirada'); }
    if (r.status === 403 && d.must_change) { renderForceChange(); throw new Error(d.error); }
    if (!r.ok) throw new Error(d.error || 'Erro ao salvar');
    return d;
  }
  function toast(msg, err) {
    const t = $('#toast');
    t.innerHTML = (err ? '' : UI.check) + `<span>${esc(msg)}</span>`;
    t.style.background = err ? '#f3c2c2' : '';
    t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 3000);
  }
  const can = (perm) => S.me && (perm === 'owner-only' ? S.me.role === 'owner' : (S.me.perms.includes('*') || S.me.perms.includes(perm)));
  function thumb(p) {
    const img = (p.images || [])[0] || p.image;
    return img ? `<div class="thumb sm"><img src="${esc(img)}" alt=""></div>` : `<div class="thumb sm"><div class="art">${ART[p.category_icon] || ART.acessorios}</div></div>`;
  }
  function promoState(p) {
    if (!(p.promo_price > 0 && p.promo_price < p.price)) return null;
    const now = localNow();
    if (p.promo_end && now > p.promo_end) return 'ended';
    if (p.promo_start && now < p.promo_start) return 'scheduled';
    return 'active';
  }
  const PROMO_TAG = { active: '<span class="status st-entregue">Ativa</span>', scheduled: '<span class="status st-confirmado">Agendada</span>', ended: '<span class="status st-cancelado">Encerrada</span>' };
  const genPass = () => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'; const n = '23456789'; let s = ''; const r = crypto.getRandomValues(new Uint32Array(10)); for (let i = 0; i < 8; i++) s += a[r[i] % a.length]; return s + n[r[8] % 8] + n[r[9] % 8]; };

  /* ---------- modal ---------- */
  function modal(html, size = '') {
    const m = $('#modal'); m.className = 'modal ' + size; m.innerHTML = html;
    $('#modalScrim').classList.add('on'); document.body.style.overflow = 'hidden';
    $$('[data-close]', m).forEach((b) => b.addEventListener('click', closeModal));
    return m;
  }
  function closeModal() { $('#modalScrim').classList.remove('on'); document.body.style.overflow = ''; }
  $('#modalScrim').addEventListener('mousedown', (e) => { if (e.target.id === 'modalScrim') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  const mHead = (t) => `<div class="m-head"><h3>${t}</h3><button class="icon-btn" data-close aria-label="Fechar">${UI.close}</button></div>`;
  function viewPhoto(url) { modal(mHead('Foto') + `<div class="m-body" style="place-items:center"><img src="${esc(url)}" alt="" style="max-height:70vh;border-radius:12px"></div>`); }

  /* ---------- login ---------- */
  // campo de senha com o olho para conferir o que foi digitado
  const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>', EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 3.5l17 17"/><path d="M10.6 5.6A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.1 3.9M6.2 6.9C3.9 8.5 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  const pwInput = (name, ph, ac) => `<div class="field pw-wrap"><input type="password" name="${name}" placeholder="${ph}" autocomplete="${ac}" required><button type="button" class="pw-eye" aria-label="Mostrar senha" title="Mostrar senha">${EYE}</button></div>`;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.pw-eye'); if (!b) return;
    const i = b.parentElement.querySelector('input'); const show = i.type === 'password';
    i.type = show ? 'text' : 'password'; b.innerHTML = show ? EYE_OFF : EYE;
    b.setAttribute('aria-label', show ? 'Esconder senha' : 'Mostrar senha'); b.title = b.getAttribute('aria-label');
    i.focus({ preventScroll: true }); const n = i.value.length; try { i.setSelectionRange(n, n); } catch {}
  });
  function renderForgot(prefill = '') {
    S.me = null;
    $('#root').innerHTML = `<div class="login"><form class="login-card" id="fgForm">
      <div class="logo"><img src="/img/logo-original.jpg" alt="Aladdin Tech"></div>
      <h1>Esqueci minha <span class="serif gold">senha</span></h1>
      <p>Digite seu usuário ou o e-mail cadastrado. Enviamos um link para você criar uma nova senha.</p>
      <div class="field"><input name="login" placeholder="Usuário ou e-mail" autocomplete="username" autocapitalize="none" required autofocus value="${esc(prefill)}"></div>
      <button class="btn btn-gold btn-block" type="submit">Enviar link</button>
      <p class="form-msg" id="fgMsg"></p>
      <p class="secure-note block">Não tem e-mail cadastrado? O Dono da loja recebe o aviso e pode criar uma senha provisória para você em <b>Equipe</b>.</p>
      <a href="#" class="btn-ghost" id="fgBack" style="font-size:13px">← Voltar ao login</a>
    </form></div>`;
    $('#fgBack').addEventListener('click', (e) => { e.preventDefault(); renderLogin(); });
    $('#fgForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', e.target); btn.disabled = true;
      try { const r = await api('/api/admin/forgot', { method: 'POST', body: { login: e.target.login.value.trim() } }); $('#fgMsg').className = 'form-msg ok'; $('#fgMsg').textContent = r.message; btn.textContent = 'Link enviado'; }
      catch (err) { $('#fgMsg').className = 'form-msg err'; $('#fgMsg').textContent = err.message; btn.disabled = false; }
    });
  }
  function renderReset(token) {
    S.me = null;
    $('#root').innerHTML = `<div class="login"><form class="login-card" id="rsForm">
      <div class="logo"><img src="/img/logo-original.jpg" alt="Aladdin Tech"></div>
      <h1>Nova <span class="serif gold">senha</span></h1>
      <p>Crie a nova senha do seu acesso ao painel.</p>
      ${pwInput('next', 'Nova senha', 'new-password')}
      ${pwInput('confirm', 'Repita a nova senha', 'new-password')}
      <div class="pw-meter"><i id="pwBar"></i></div>
      <p class="hint" style="margin:0">Mínimo 8 caracteres, com letras e números. Evite datas e nomes.</p>
      <button class="btn btn-gold btn-block" type="submit">Salvar nova senha</button>
      <p class="form-msg err" id="rsMsg"></p>
    </form></div>`;
    const f = $('#rsForm');
    f.next.addEventListener('input', () => meter(f.next.value, $('#pwBar')));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (f.next.value !== f.confirm.value) { $('#rsMsg').textContent = 'As senhas não conferem.'; return; }
      try {
        const r = await api('/api/admin/reset', { method: 'POST', body: { token, password: f.next.value, confirm: f.confirm.value } });
        history.replaceState(null, '', '/admin'); renderLogin(r.username, 'Senha criada. Entre com a nova senha.');
      } catch (err) { $('#rsMsg').textContent = err.message; }
    });
  }
  function renderLogin(user = '', notice = '') {
    S.me = null;
    $('#root').innerHTML = `<div class="login"><form class="login-card" id="loginForm" autocomplete="on">
      <div class="logo"><img src="/img/logo-original.jpg" alt="Aladdin Tech"></div>
      <h1>Central do <span class="serif gold">lojista</span></h1>
      <p>Acesso restrito à equipe Aladdin Tech</p>
      ${notice ? `<p class="form-msg ok">${esc(notice)}</p>` : ''}
      <div class="field"><input name="username" placeholder="Usuário" autocomplete="username" autocapitalize="none" required ${user ? '' : 'autofocus'} value="${esc(user)}"></div>
      ${pwInput('password', 'Senha', 'current-password')}
      <a href="#" class="forgot-link" id="forgotLink">Esqueci minha senha</a>
      <button class="btn btn-gold btn-block" type="submit">Entrar</button>
      <p class="form-msg err" id="loginMsg"></p>
      <p class="secure-note">${IC.lock} Conexão protegida · bloqueio após tentativas repetidas</p>
      <a href="/" class="btn-ghost" style="font-size:13px">← Voltar à loja</a>
    </form></div>`;
    $('#forgotLink').addEventListener('click', (e) => { e.preventDefault(); renderForgot($('#loginForm').username.value.trim()); });
    if (user) $('#loginForm').password.focus();
    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', e.target); btn.disabled = true;
      try {
        await api('/api/admin/login', { method: 'POST', body: { username: e.target.username.value, password: e.target.password.value } });
        boot();
      } catch (err) { $('#loginMsg').textContent = err.message; btn.disabled = false; }
    });
  }
  function renderForceChange() {
    $('#root').innerHTML = `<div class="login"><form class="login-card" id="fcForm">
      <div class="logo"><img src="/img/logo-original.jpg" alt=""></div>
      <h1>Crie sua <span class="serif gold">senha</span></h1>
      <p>Por segurança, troque a senha provisória antes de continuar.</p>
      ${pwInput('current', 'Senha atual (provisória)', 'current-password')}
      ${pwInput('next', 'Nova senha', 'new-password')}
      ${pwInput('confirm', 'Repita a nova senha', 'new-password')}
      <div class="pw-meter"><i id="pwBar"></i></div>
      <p class="hint" style="margin:0">Mínimo 8 caracteres, com letras e números. Evite datas e nomes.</p>
      <button class="btn btn-gold btn-block" type="submit">Salvar e entrar</button>
      <p class="form-msg err" id="fcMsg"></p>
    </form></div>`;
    const f = $('#fcForm');
    f.next.addEventListener('input', () => meter(f.next.value, $('#pwBar')));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (f.next.value !== f.confirm.value) { $('#fcMsg').textContent = 'As senhas não conferem.'; return; }
      try { await api('/api/admin/password', { method: 'POST', body: { current: f.current.value, next: f.next.value } }); toast('Senha criada com sucesso'); boot(); }
      catch (err) { $('#fcMsg').textContent = err.message; }
    });
  }
  function meter(pw, bar) {
    let s = 0;
    if (pw.length >= 8) s++; if (pw.length >= 12) s++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^a-zA-Z0-9]/.test(pw)) s++;
    bar.style.width = (s / 5) * 100 + '%';
    bar.style.background = s <= 2 ? 'var(--err)' : s <= 3 ? 'var(--gold)' : 'var(--ok)';
  }

  /* ---------- layout ---------- */
  const PAGES = {
    dashboard: ['Visão geral', IC.dash, 'dashboard', () => viewDash()],
    pedidos: ['Pedidos', IC.orders, 'orders', () => viewOrders()],
    financeiro: ['Financeiro', sv('<path d="M4 19.5h16M6.5 16V11M11 16V7M15.5 16v-6M20 16V5"/>'), 'owner-only', () => viewFinance()],
    estoque: ['Estoque (IMEI)', sv('<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M7.5 9v6M10 9v6M12.5 9v6M15 9v6M17 9v6"/>'), 'products', () => viewStockUnits()],
    comissoes: ['Comissões', sv('<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2c-.5-.9-1.6-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2s1.1 1.7 2.8 2.1 2.9.9 2.9 2.2-1.3 2.1-2.9 2.1c-1.3 0-2.4-.6-2.9-1.5M12 6.3v1.5M12 16.7v1.5"/>'), 'owner-only', () => viewCommissions()],
    assistencia: ['Assistência técnica', sv('<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.6-.6-.6-2.6z"/>'), 'orders', () => viewServiceOrders()],
    prevenda: ['Pré-venda', sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'), 'orders', () => viewPreorders()],
    troca: ['Troca Garantida', sv('<path d="M4 8h13l-3-3M20 16H7l3 3"/>'), 'orders', () => viewTradePlans()],
    ranking: ['Ranking da equipe', sv('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5v1.5A3 3 0 0 0 7.4 10.5M17 6h2.5v1.5a3 3 0 0 1-2.9 3"/>'), 'dashboard', () => viewRanking()],
    carrinhos: ['Carrinhos abandonados', sv('<path d="M3 4h2.5l2.2 11h10.6l2.2-8H7"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>'), 'orders', () => viewCarts()],
    clientes: ['Clientes', sv('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c.8-3.9 3.8-6 7.5-6s6.7 2.1 7.5 6"/>'), 'orders', () => viewCustomers()],
    produtos: ['Produtos', IC.box, 'products', (arg) => arg ? productEditor(arg) : viewProducts()],
    promocoes: ['Promoções', IC.fire, 'promos', () => viewPromos()],
    cupons: ['Cupons', IC.tag, 'coupons', () => viewCoupons()],
    guias: ['Guias (blog)', sv('<path d="M5 4.5h10.5L19 8v11.5H5z"/><path d="M8.5 10h7M8.5 13.5h7M8.5 17h4.5"/>'), 'settings', (arg) => arg ? postEditor(arg) : viewPosts()],
    notificacoes: ['Notificações (app)', sv('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>'), 'promos', () => viewPush()],
    emails: ['E-mails', sv('<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>'), 'coupons', () => viewEmails()],
    categorias: ['Categorias', IC.folder, 'categories', () => viewCats()],
    avaliacoes: ['Avaliações', IC.star, 'reviews', () => viewReviews()],
    perguntas: ['Perguntas', IC.ask, 'questions', () => viewQuestions()],
    vitrine: ['Fotos da loja', sv('<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8 8"/>'), 'settings', () => viewStorePhotos()],
    equipe: ['Equipe', IC.users, 'users', () => viewUsers()],
    seguranca: ['Segurança', IC.lock, null, () => viewSecurity()],
    config: ['Configurações', IC.gear, 'settings', () => viewSettings()],
  };
  /* fotos → WebP no navegador (sem servidor de imagens): roda em segundo plano para Dono/Gerente */
  const webpOk = (() => { try { const c = document.createElement('canvas'); c.width = c.height = 1; return c.toDataURL('image/webp').startsWith('data:image/webp'); } catch { return false; } })();
  let webpRunning = false;
  async function optimizeImages(onProgress) {
    if (!webpOk || webpRunning) return { done: 0, saved: 0 };
    webpRunning = true; let done = 0, saved = 0;
    try {
      const r = await api('/api/admin/webp/pending');
      for (const url of r.pending) {
        try {
          const blob = await (await fetch(url, { headers: { Accept: 'image/png,image/jpeg' }, cache: 'no-store' })).blob();
          const bmp = await createImageBitmap(blob);
          const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
          const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
          c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
          const data = c.toDataURL('image/webp', /\.png$/i.test(url) ? 0.9 : 0.82);
          const x = await api('/api/admin/webp', { method: 'POST', body: { url, data } });
          done++; saved += x.saved || 0; onProgress && onProgress(done, r.pending_count, saved);
        } catch { /* uma foto com problema não para as outras */ }
      }
      return { done, saved, total: r.total, pending: r.pending_count };
    } finally { webpRunning = false; }
  }
  window.ATopt = optimizeImages;
  async function boot() {
    const rt = /^#redefinir=([a-f0-9]{64})$/.exec(location.hash);
    if (rt) return renderReset(rt[1]);
    try { S.me = await api('/api/admin/me'); } catch { return; }
    if (S.me.must_change) return renderForceChange();
    S.cats = await api('/api/categories');
    if (can('settings')) S.settings = await api('/api/admin/settings').catch(() => ({}));
    $('#root').innerHTML = `<div class="shell">
      <aside class="side" id="side">
        <a href="/" target="_blank" rel="noopener" class="brand"><span class="brand-lamp">${ICONS.lamp}</span><span class="brand-text"><span><b>Aladdin</b> Tech</span><small>Central do lojista</small></span></a>
        <a class="btn btn-gold btn-sm side-cta" href="#produtos/novo" ${can('products') ? '' : 'hidden'}>${UI.plus} Anunciar produto</a>
        ${Object.entries(PAGES).filter(([, p]) => !p[2] || can(p[2])).map(([k, [t, ic]]) => `<a href="#${k}" class="nav-i" data-page="${k}"><i>${ic}</i>${t}<span class="pill" data-pill="${k}" hidden></span></a>`).join('')}
        <div class="bottom">
          <div class="me"><span class="avatar">${esc(S.me.name[0] || '?')}</span><div><b>${esc(S.me.name)}</b><small>${esc(S.me.role_label)} · @${esc(S.me.username)}</small></div></div>
          <a href="/" target="_blank" rel="noopener" class="nav-i"><i>${IC.ext}</i>Ver loja</a>
          <a href="#" class="nav-i" id="logout"><i>${IC.out}</i>Sair</a>
        </div>
      </aside>
      <main class="main">
        <div class="m-top"><button class="icon-btn" id="sideBtn" aria-label="Menu">${UI.menu}</button><span class="brand-lamp" style="width:40px;height:26px">${ICONS.lamp}</span><span style="width:42px"></span></div>
        <div id="view"></div>
      </main></div>`;
    if (['owner', 'manager'].includes(S.me.role) || can('products')) setTimeout(() => optimizeImages().catch(() => {}), 4000);
    $('#logout').addEventListener('click', async (e) => { e.preventDefault(); await api('/api/admin/logout', { method: 'POST' }).catch(() => {}); renderLogin(); });
    $('#sideBtn').addEventListener('click', () => $('#side').classList.toggle('open'));
    window.onhashchange = route;
    route();
  }
  let lastHash = location.hash;
  async function route() {
    if (S.dirty && location.hash !== lastHash) {
      if (!confirm('Há alterações não salvas neste anúncio. Deseja sair mesmo assim?')) { history.replaceState(null, '', lastHash); return; }
    }
    S.dirty = false; lastHash = location.hash;
    const [k, arg] = (location.hash.slice(1) || 'dashboard').split('/');
    const page = PAGES[k] && (!PAGES[k][2] || can(PAGES[k][2])) ? PAGES[k] : PAGES.dashboard;
    $$('.nav-i[data-page]').forEach((a) => a.classList.toggle('on', a.dataset.page === k));
    $('#side').classList.remove('open');
    document.title = page[0] + ' — Central Aladdin Tech';
    $('#view').onclick = null; $('#view').onchange = null; $('#view').oninput = null;
    $('#view').innerHTML = `<div class="skeleton" style="height:200px"></div>`;
    window.scrollTo(0, 0);
    try { await page[3](arg); } catch (e) { if (S.me) $('#view').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    refreshPills();
  }
  window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  async function refreshPills() {
    if (!can('dashboard')) return;
    try {
      const s = await api('/api/admin/stats');
      const set = (k, n) => { const p = $(`[data-pill="${k}"]`); if (p) { p.hidden = !n; p.textContent = n; } };
      set('pedidos', s.orders_new); set('avaliacoes', s.reviews_pending); set('perguntas', s.questions_pending);
    } catch {}
  }
  const top = (eyebrow, title, actions = '') => `<div class="top"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1></div><div class="top-actions">${actions}</div></div>`;

  /* ---------- dashboard ---------- */
  const STATUS = { novo: 'Novo', confirmado: 'Confirmado', separando: 'Separando', enviado: 'Saiu p/ entrega', pronto: 'Pronto p/ retirada', entregue: 'Entregue', cancelado: 'Cancelado' };
  const statusTag = (s) => `<span class="status st-${s}">${STATUS[s] || s}</span>`;
  const payTag = (p) => !p ? '' : `<br><small style="color:${p === 'aprovado' ? 'var(--ok)' : ['recusado', 'cancelado', 'estornado', 'valor divergente'].includes(p) ? 'var(--err)' : 'var(--gold)'}">● ${p === 'aprovado' ? 'Pago online' : 'Pagamento ' + esc(p)}</small>`;
  async function viewDash() {
    const s = await api('/api/admin/stats');
    const days = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const key = d.toLocaleDateString('sv-SE'); days.push({ key, label: d.getDate(), v: (s.daily.find((x) => x.d === key) || {}).v || 0 }); }
    const max = Math.max(1, ...days.map((d) => d.v));
    const tasks = [
      s.orders_new && can('orders') ? [`${s.orders_new} pedido(s) aguardando confirmação`, '#pedidos'] : null,
      s.questions_pending && can('questions') ? [`${s.questions_pending} pergunta(s) de clientes sem resposta`, '#perguntas'] : null,
      s.reviews_pending && can('reviews') ? [`${s.reviews_pending} avaliação(ões) para moderar`, '#avaliacoes'] : null,
      s.low_stock.length && can('products') ? [`${s.low_stock.length} produto(s) com estoque baixo`, '#produtos'] : null,
      can('settings') && (digits(S.settings.whatsapp).length < 12 || /0000/.test(S.settings.whatsapp || '')) ? ['Configure o WhatsApp e o endereço da loja', '#config'] : null,
    ].filter(Boolean);
    $('#view').innerHTML = top('Painel', `Olá, ${esc(S.me.name.split(' ')[0])} <span class="serif gold">✦</span>`, can('products') ? `<a class="btn btn-gold btn-sm" href="#produtos/novo">${UI.plus} Anunciar produto</a>` : '') +
      (tasks.length ? `<div class="tasks">${tasks.map(([t, h]) => `<a href="${h}" class="task"><span></span>${esc(t)}${UI.chev}</a>`).join('')}</div>` : '') +
      `<div class="kpis">
        <div class="kpi"><span>Faturamento no mês</span><b>${brl(s.revenue_month)}</b><small>pedidos não cancelados</small></div>
        <div class="kpi"><span>Pedidos no mês</span><b>${s.orders_month}</b><small>${s.orders_new} aguardando confirmação</small></div>
        <div class="kpi"><span>Anúncios ativos</span><b>${s.products}</b><small>${s.promos_active} em promoção</small></div>
        <div class="kpi"><span>Reputação</span><b>${s.rating ? String(s.rating).replace('.', ',') + ' ★' : '—'}</b><small>${s.reviews_pending} avaliações · ${s.questions_pending} perguntas pendentes</small></div>
      </div>
      <div class="dash-grid">
        <div class="panel"><h3>Vendas — últimos 14 dias</h3>
          <div class="bars">${days.map((d) => `<div title="${d.key}: ${brl(d.v)}"><i style="height:${(d.v / max) * 100}%"></i><span>${d.label}</span></div>`).join('')}</div></div>
        <div class="panel"><h3>Estoque baixo</h3>
          ${s.low_stock.length ? s.low_stock.map((p) => `<a href="#produtos/${p.id}" class="sum-row" style="padding:9px 0;border-bottom:1px solid var(--line)"><span>${esc(p.name)}</span><span style="color:${p.stock <= 0 ? 'var(--err)' : 'var(--gold)'}">${p.stock} un.</span></a>`).join('') : '<p class="muted" style="margin:0">Tudo em ordem.</p>'}</div>
      </div>
      <div class="panel" style="margin-top:14px"><h3>Pedidos recentes</h3>
        ${s.recent.length ? `<div class="tbl-wrap" style="border:0"><table class="tbl"><thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Entrega</th><th>Total</th><th>Status</th></tr></thead><tbody>
        ${s.recent.map((o) => `<tr class="click" data-order="${o.id}"><td><b>${esc(o.code)}</b></td><td>${esc(o.customer.name)}</td><td>${fmtDate(o.created_at)}</td><td>${o.channel === 'loja' ? '<span class="gold">Venda na loja</span>' : o.reserve_until && !['entregue', 'cancelado'].includes(o.status) ? `<span class="gold">Reserva</span><br><small class="muted">até ${fmtDate(o.reserve_until)}</small>` : o.delivery_method === 'pickup' ? 'Retirada' : 'Entrega'}${o.seller_name ? `<br><small class="muted">por ${esc(o.seller_name)}</small>` : ''}</td><td>${brl(o.total)}</td><td>${statusTag(o.status)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted" style="margin:0">Nenhum pedido ainda. Assim que um cliente finalizar uma compra, ele aparece aqui.</p>'}
      </div>`;
    $('#view').onclick = (e) => { const tr = e.target.closest('[data-order]'); if (tr && can('orders')) { location.hash = 'pedidos'; setTimeout(() => openOrder(+tr.dataset.order), 350); } };
  }

  /* ---------- pedidos ---------- */
  let ORDERS = [], orderFilter = '';
  async function viewOrders() {
    ORDERS = await api('/api/admin/orders');
    const draw = () => {
      const q = ($('#oSearch').value || '').toLowerCase();
      const list = ORDERS.filter((o) => (!orderFilter || o.status === orderFilter) && (!q || (o.code + ' ' + o.customer.name + ' ' + o.customer.phone).toLowerCase().includes(q)));
      $('#ordersBody').innerHTML = list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pedido</th><th>Cliente</th><th>Itens</th><th>Entrega</th><th>Pagamento</th><th>Total</th><th>Status</th></tr></thead><tbody>
        ${list.map((o) => `<tr class="click" data-o="${o.id}"><td><b>${esc(o.code)}</b><br><small class="muted">${fmtDate(o.created_at)}</small></td>
          <td>${esc(o.customer.name)}<br><small class="muted">${esc(o.customer.phone)}</small></td>
          <td>${o.items.reduce((a, i) => a + i.qty, 0)} item(s)</td><td>${o.delivery_method === 'pickup' ? 'Retirada' : 'Entrega'}</td>
          <td>${{ pix: 'Pix', card: 'Cartão ' + o.installments + 'x', cash: 'Na entrega' }[o.payment]}${payTag(o.pay_status)}${o.nfe_status === 'autorizado' ? '<br><small class="st-on">● NF-e ' + esc(o.nfe_number || '') + '</small>' : o.nfe_status === 'erro' ? '<br><small style="color:var(--err)">● NF-e rejeitada</small>' : ''}</td><td><b>${brl(o.total)}</b></td><td>${statusTag(o.status)}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">Nenhum pedido neste filtro.</div>';
    };
    $('#view').innerHTML = top('Vendas', 'Pedidos', `<input class="input pill-input" id="oSearch" placeholder="Buscar pedido, cliente…">`) +
      `<div class="seg" style="margin-bottom:16px" id="ofilter"><button data-f="" class="${!orderFilter ? 'on' : ''}">Todos (${ORDERS.length})</button>${Object.entries(STATUS).map(([k, l]) => `<button data-f="${k}" class="${orderFilter === k ? 'on' : ''}">${l} (${ORDERS.filter((o) => o.status === k).length})</button>`).join('')}</div><div id="ordersBody"></div>`;
    $('#oSearch').addEventListener('input', draw);
    $('#view').onclick = (e) => {
      const b = e.target.closest('[data-f]'); if (b) { orderFilter = b.dataset.f; $$('#ofilter button').forEach((x) => x.classList.toggle('on', x === b)); draw(); return; }
      const tr = e.target.closest('[data-o]'); if (tr) openOrder(+tr.dataset.o);
    };
    draw();
  }
  async function openOrder(id) {
    if (!ORDERS.length) ORDERS = await api('/api/admin/orders');
    const o = ORDERS.find((x) => x.id === id); if (!o) return;
    const a = o.delivery.address;
    const addr = o.delivery_method === 'pickup' ? 'Retirada na loja' : typeof a === 'object' ? [a.street, a.number, a.complement, a.district, a.city, a.cep].filter(Boolean).join(', ') : '';
    const pay = o.channel === 'loja' ? { pix: 'Pix', card: /débito/.test(o.notes || '') ? 'Cartão de débito' : `Cartão de crédito — ${o.installments}x`, cash: 'Dinheiro' }[o.payment] : { pix: 'Pix', card: `Cartão de crédito — ${o.installments}x`, cash: 'Na entrega/retirada' }[o.payment];
    const phone = digits(o.customer.phone);
    const msg = `Olá, ${o.customer.name.split(' ')[0]}! Aqui é da Aladdin Tech sobre o seu pedido ${o.code}.`;
    const m = modal(mHead(`Pedido <span class="serif gold">${esc(o.code)}</span>`) + `<div class="m-body">
      <div class="kv"><span>Cliente</span><span>${esc(o.customer.name)}</span><span>WhatsApp</span><span>${esc(o.customer.phone)}</span>
        ${o.customer.email ? `<span>E-mail</span><span>${esc(o.customer.email)}</span>` : ''}${o.customer.cpf ? `<span>CPF</span><span>${esc(o.customer.cpf)}</span>` : ''}
        <span>Data</span><span>${fmtDate(o.created_at)}</span><span>${o.delivery_method === 'pickup' ? 'Retirada' : 'Entrega'}</span><span>${esc(o.delivery.label || '')}${addr ? ' — ' + esc(addr) : ''}</span>
        <span>Pagamento</span><span>${pay}${o.pay_status ? ` — <b style="color:${o.pay_status === 'aprovado' ? 'var(--ok)' : 'var(--gold)'}">${o.pay_status === 'aprovado' ? 'PAGO (Mercado Pago)' : esc(o.pay_status)}</b>${o.pay_id ? ` <small class="muted">#${esc(o.pay_id)}</small>` : ''}` : ''}</span>${o.notes ? `<span>Observações</span><span>${esc(o.notes)}</span>` : ''}</div>
      <div class="order-items">${o.items.map((i) => `<div class="oi"><div class="t-thumb">${thumb({ image: i.image, category_icon: 'acessorios' })}</div><div style="flex:1"><b style="font-weight:500">${i.qty}x ${esc(i.name)}</b><br><small class="muted">${esc(Object.entries(i.options || {}).map(([k, v]) => k + ': ' + v).join(' · '))}</small></div><span>${brl(i.price * i.qty)}</span></div>`).join('')}</div>
      <div style="display:grid;gap:6px">
        <div class="sum-row"><span>Subtotal</span><span>${brl(o.subtotal)}</span></div>
        ${o.discount ? `<div class="sum-row disc"><span>Cupom ${esc(o.coupon)}</span><span>− ${brl(o.discount)}</span></div>` : ''}
        ${o.pix_discount ? `<div class="sum-row disc"><span>Desconto Pix</span><span>− ${brl(o.pix_discount)}</span></div>` : ''}
        <div class="sum-row"><span>Frete</span><span>${o.shipping ? brl(o.shipping) : 'Grátis'}</span></div>
        <div class="sum-row total"><span>Total</span><span>${brl(o.total)}</span></div>
      </div>
      ${o.delivery_method !== 'pickup' && typeof a === 'object' && a ? `<div class="ship-label">
        <div><span class="cg-label">Etiqueta de envio</span><pre id="oLabel">${esc([a.recipient || o.customer.name, `${a.street}, ${a.number}${a.complement ? ' — ' + a.complement : ''}`, a.district, `${a.city}/${a.uf || ''}`, `CEP ${a.cep}`, `Tel. ${o.customer.phone}`].join('\n'))}</pre></div>
        <div class="ship-actions"><button type="button" class="btn btn-line btn-sm" id="oCopy">${IC.copy} Copiar etiqueta</button>
          <a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.lat && a.lng ? a.lat + ',' + a.lng : [a.street, a.number, a.district, a.city, a.uf, a.cep].join(', '))}">${IC.eye} Ver no mapa</a></div></div>` : ''}
      <div class="row c2">
        <div class="field"><label>Status do pedido</label><select id="oStatus">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Código de rastreio (Correios)</label><input id="oTrack" value="${esc(o.tracking || '')}" placeholder="Ex.: AB123456789BR" style="text-transform:uppercase"></div>
      </div>
      ${o.reserve_until && !['entregue', 'cancelado'].includes(o.status) ? `<div class="rs-admin">${IC.clock || ''}<div><b>Reserva — pagar na retirada</b><span>Separada até <b>${fmtDate(o.reserve_until)}</b>. Se não for retirada, cancela sozinha e o estoque volta. Ao entregar, marque “Entregue”.</span></div></div>` : ''}
      <div class="wa-line"><button type="button" class="btn btn-line btn-sm" id="oWa">${UI.wa} Mandar aviso do status no WhatsApp</button><small class="muted" id="oWaInfo"></small></div>
      <div class="seller-line" id="sellerBox"></div>
      <div class="war-box" id="warBox"></div>
      <div class="nfe-box" id="nfeBox"></div>
      <label class="switch" style="font-size:13px"><input type="checkbox" id="oNotify" checked><span></span>Avisar o cliente por e-mail sobre a mudança</label>
      <p class="hint">Ao cancelar, o estoque dos itens é devolvido automaticamente. Ao marcar “Saiu p/ entrega” com rastreio, o cliente recebe o código.</p>
    </div>
    <div class="m-foot"><a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://wa.me/${phone.length <= 11 ? '55' + phone : phone}?text=${encodeURIComponent(msg)}">${UI.wa} Chamar cliente</a><button class="btn btn-gold btn-sm" id="oSave">Salvar status</button></div>`);
    warrantyBox(o, m);
    $('#oWa', m).addEventListener('click', async () => {
      try { const r = await api(`/api/admin/orders/${o.id}/wa?status=${encodeURIComponent($('#oStatus', m).value)}`);
        if (!r.text) return toast('Sem mensagem pronta para este status.', 1);
        window.open(`https://wa.me/${r.phone}?text=${encodeURIComponent(r.text)}`, '_blank', 'noopener'); } catch (e) { toast(e.message, 1); }
    });
    {
      const SRC = { link: 'pelo link do vendedor', whatsapp: 'pelo WhatsApp do vendedor', checkout: 'informado pelo cliente', painel: 'atribuído no painel' };
      const box = $('#sellerBox', m);
      const info = `<span class="cg-label">Vendedor</span><span>${o.seller_name ? `<b>${esc(o.seller_name)}</b> <small class="muted">${o.channel === 'loja' ? 'venda no balcão' : SRC[o.seller_source] || ''}</small>` : '<span class="muted">Sem vendedor — não conta no ranking</span>'}</span>`;
      box.innerHTML = info;
      if (['owner', 'manager'].includes(S.me.role)) api('/api/admin/ranking').then((r) => {
        box.innerHTML = info + `<select class="input" id="oSeller" style="max-width:220px"><option value="">Sem vendedor</option>${r.rows.filter((x) => x.active).map((x) => `<option value="${x.id}" ${x.id === o.seller_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`;
        $('#oSeller', m).addEventListener('change', async (e) => {
          try { await api('/api/admin/orders/' + o.id + '/seller', { method: 'PUT', body: { seller_id: e.target.value || null } });
            o.seller_id = +e.target.value || null; o.seller_name = e.target.value ? e.target.selectedOptions[0].textContent : null; o.seller_source = 'painel'; toast('Vendedor atualizado — o ranking já considera a mudança'); }
          catch (err) { toast(err.message, 1); }
        });
      }).catch(() => {});
    }
    const NFE = { '': ['Não emitida', ''], processando: ['Processando na Sefaz…', 'gold'], autorizado: ['Autorizada', 'st-on'], erro: ['Rejeitada', ''], cancelada: ['Cancelada', 'st-off'] };
    const drawNfe = (x) => {
      const st = x.nfe_status || '', [lbl, cls] = NFE[st] || [st, ''];
      $('#nfeBox', m).innerHTML = `<div class="nfe-head"><span class="cg-label">Nota fiscal (NF-e)</span><span class="${cls}" style="${st === 'erro' ? 'color:var(--err)' : ''}">● ${lbl}${x.nfe_number ? ' · nº ' + esc(x.nfe_number) : ''}</span></div>
        ${x.nfe_error ? `<p class="hint" style="margin:0;color:var(--err)">${esc(x.nfe_error)}</p>` : ''}
        <div class="nfe-act">
          ${!(S.settings.nfe_on ?? S.me.nfe_on) ? '<span class="hint" style="margin:0">Ative a emissão em Configurações → Nota fiscal.</span>' : ''}
          ${(S.settings.nfe_on ?? S.me.nfe_on) && (!st || st === 'erro' || st === 'cancelada') && o.status !== 'cancelado' ? '<button class="btn btn-gold btn-sm" data-nfe="emit">Emitir NF-e</button>' : ''}
          ${st === 'processando' ? '<button class="btn btn-line btn-sm" data-nfe="refresh">Atualizar status</button>' : ''}
          ${x.nfe_danfe ? `<a class="btn btn-line btn-sm" href="${esc(x.nfe_danfe)}" target="_blank" rel="noopener">Abrir DANFE</a>` : ''}
          ${x.nfe_xml ? `<a class="btn btn-line btn-sm" href="${esc(x.nfe_xml)}" target="_blank" rel="noopener">XML</a>` : ''}
          ${st === 'autorizado' && S.me.role === 'owner' ? '<button class="btn-ghost" data-nfe="cancel" style="color:var(--err)">Cancelar nota</button>' : ''}
        </div>`;
    };
    drawNfe(o);
    $('#nfeBox', m).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-nfe]'); if (!b) return;
      b.disabled = true;
      try {
        if (b.dataset.nfe === 'emit') { const r = await api(`/api/admin/orders/${o.id}/nfe`, { method: 'POST' }); Object.assign(o, r); toast(r.nfe_status === 'autorizado' ? 'Nota autorizada!' : 'Nota enviada para a Sefaz'); }
        if (b.dataset.nfe === 'refresh') { const r = await api(`/api/admin/orders/${o.id}/nfe/refresh`, { method: 'POST' }); Object.assign(o, r); }
        if (b.dataset.nfe === 'cancel') {
          const j = prompt('Motivo do cancelamento (mínimo 15 caracteres). Prazo legal: até 24h após a autorização.'); if (!j) { b.disabled = false; return; }
          await api(`/api/admin/orders/${o.id}/nfe/cancel`, { method: 'POST', body: { justificativa: j } }); o.nfe_status = 'cancelada'; toast('Nota cancelada');
        }
        ORDERS = await api('/api/admin/orders'); Object.assign(o, ORDERS.find((x) => x.id === o.id) || {}); drawNfe(o);
      } catch (err) { toast(err.message, 1); b.disabled = false; }
    });
    const oc = $('#oCopy', m);
    oc && oc.addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText($('#oLabel', m).textContent); toast('Etiqueta copiada'); });
    $('#oSave', m).addEventListener('click', async () => {
      try {
        const r = await api('/api/admin/orders/' + o.id, { method: 'PUT', body: { status: $('#oStatus', m).value, tracking: $('#oTrack', m).value, notify: $('#oNotify', m).checked } });
        toast(r.whatsapp === 'enviado' ? 'Pedido atualizado · cliente avisado por e-mail e WhatsApp' : r.mailed ? 'Pedido atualizado e cliente avisado por e-mail' : 'Pedido atualizado'); closeModal(); if (location.hash === '#pedidos') viewOrders(); refreshPills();
      }
      catch (e) { toast(e.message, 1); }
    });
  }

  /* ---------- e-mails: campanhas de ofertas + caixa de saída ---------- */
  async function viewEmails() {
    const [d, prods] = await Promise.all([api('/api/admin/emails'), api('/api/admin/products')]);
    const sel = new Set(prods.filter((p) => p.active && promoState(p) === 'active').slice(0, 4).map((p) => p.id));
    const KIND = { verificacao: 'Confirmação de conta', senha: 'Redefinir senha', pedido: 'Pedido', oferta: 'Oferta', 'oferta-teste': 'Oferta (teste)', teste: 'Teste' };
    const ST = { enviado: 'st-on', simulado: 'gold', erro: '' };
    $('#view').innerHTML = top('Marketing', 'E-mails', '') +
      (!d.ready ? `<div class="notice">O envio real ainda não está ligado: os e-mails ficam salvos aqui na caixa de saída. ${S.me.role === 'owner' ? '<a class="btn btn-line btn-sm" href="#config">Configurar SMTP</a>' : 'Peça ao Dono para configurar o SMTP.'}</div>` : '') +
      `<div class="settings-grid">
        <form class="panel" id="cmpForm"><h3>Nova campanha de ofertas</h3>
          <p class="hint" style="margin:-8px 0 0">Vai para <b>${d.audience_verified}</b> cliente(s) que aceitaram receber ofertas e confirmaram o e-mail (${d.audience} aceitaram no total). Todo e-mail leva o link de descadastro.</p>
          <div class="field"><label>Assunto</label><input name="subject" maxlength="120" required placeholder="Ex.: 🔥 Semana do iPhone — até 15% OFF"></div>
          <div class="field"><label>Título dentro do e-mail</label><input name="title" maxlength="140" required placeholder="Ex.: O upgrade que você esperava chegou"></div>
          <div class="field"><label>Mensagem</label><textarea name="message" rows="4" maxlength="3000" placeholder="Conte a novidade em poucas linhas…"></textarea></div>
          <div class="field"><label>Produtos em destaque (até 8)</label><div class="cmp-prods">${prods.filter((p) => p.active).map((p) => `<label class="${sel.has(p.id) ? 'on' : ''}"><input type="checkbox" value="${p.id}" ${sel.has(p.id) ? 'checked' : ''}><span class="t-thumb">${thumb(p)}</span><span>${esc(p.name)}<small>${promoState(p) === 'active' ? '<b class="gold">' + brl(p.promo_price) + '</b>' : brl(p.price)}</small></span></label>`).join('')}</div></div>
          <div class="field"><label>Texto do botão</label><input name="button_label" maxlength="40" value="Ver ofertas"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input class="input" name="test_to" placeholder="E-mail para teste" style="max-width:240px"><button type="button" class="btn btn-line btn-sm" id="cmpTest">Enviar teste</button>
            <button type="submit" class="btn btn-gold btn-sm">Enviar para ${d.audience_verified} cliente(s)</button></div>
          <p class="form-msg" id="cmpMsg"></p>
        </form>
        <div class="panel"><h3>Caixa de saída</h3>
          <div class="outbox">${d.list.length ? d.list.map((e) => `<button class="ob-row" data-mail="${e.id}"><span class="${ST[e.status] || ''}" style="${e.status === 'erro' ? 'color:var(--err)' : ''}">●</span><div><b>${esc(e.subject)}</b><small>${esc(e.to_addr)} · ${esc(KIND[e.kind] || e.kind)} · ${fmtDate(e.created_at)}${e.error ? ' · ' + esc(e.error) : ''}</small></div><em>${esc(e.status)}</em></button>`).join('') : '<p class="muted" style="margin:0">Nenhum e-mail ainda.</p>'}</div>
        </div>
      </div>`;
    const f = $('#cmpForm');
    f.addEventListener('change', (e) => { const c = e.target.closest('.cmp-prods input'); if (c) { c.checked ? sel.add(+c.value) : sel.delete(+c.value); c.closest('label').classList.toggle('on', c.checked); } });
    const payload = () => { const fd = Object.fromEntries(new FormData(f)); return { subject: fd.subject, title: fd.title, message: fd.message, button_label: fd.button_label, product_ids: [...sel] }; };
    $('#cmpTest').addEventListener('click', async () => {
      if (!f.reportValidity()) return;
      try { await api('/api/admin/campaign', { method: 'POST', body: { ...payload(), test_to: f.test_to.value } }); toast('Teste enviado — veja na caixa de saída'); viewEmails(); } catch (e) { toast(e.message, 1); }
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!d.audience_verified) return toast('Nenhum cliente apto a receber ofertas ainda', 1);
      if (!confirm(`Enviar esta campanha para ${d.audience_verified} cliente(s)?`)) return;
      try { const r = await api('/api/admin/campaign', { method: 'POST', body: payload() }); toast(`Campanha em envio para ${r.sent} cliente(s)`); setTimeout(viewEmails, 1500); } catch (err) { toast(err.message, 1); }
    });
    $('#view').onclick = (e) => {
      const r = e.target.closest('[data-mail]'); if (!r) return;
      modal(mHead('Visualizar e-mail') + `<div class="m-body" style="padding:0"><iframe src="/api/admin/emails/${r.dataset.mail}/preview" title="Prévia" style="width:100%;height:70vh;border:0;background:#0b0b0c"></iframe></div>`);
    };
  }

  /* ---------- clientes ---------- */
  async function viewCarts() {
    const d = await api('/api/admin/carts');
    const ST = { aberto: ['Aberto', 'gold'], lembrado: ['Lembrete enviado', 'st-confirmado'], convertido: ['Comprou', 'st-on'] };
    $('#view').innerHTML = top('Vendas', 'Carrinhos abandonados', `${S.me.role === 'owner' || (S.me.perms || []).includes('settings') ? '<a class="btn btn-line btn-sm" href="#config">Configurar lembretes</a>' : ''}`) +
      `<div class="kpis" style="grid-template-columns:repeat(3,1fr)">
        <div class="kpi"><span>Valor parado em carrinhos</span><b>${brl(d.open_value)}</b><small>clientes que não finalizaram</small></div>
        <div class="kpi"><span>Recuperado com lembretes</span><b class="gold">${brl(d.recovered_value)}</b><small>compraram depois do lembrete</small></div>
        <div class="kpi"><span>Carrinhos</span><b>${d.carts.length}</b><small>${d.carts.filter((c) => c.status === 'convertido').length} convertidos</small></div></div>` +
      (d.carts.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cliente</th><th>Itens</th><th>Valor</th><th>Última atividade</th><th>Status</th><th></th></tr></thead><tbody>
      ${d.carts.map((c) => { const ph = digits(c.phone), [l, cls] = ST[c.status] || [c.status, '']; const first = String(c.name || '').split(' ')[0];
        const msg = `Olá${first ? ', ' + first : ''}! Aqui é da ${S.settings.store_name || 'Aladdin Tech'}. Vi que você separou ${c.items.map((i) => i.name).join(', ')} e não finalizou — posso te ajudar com alguma dúvida? 😊`;
        return `<tr><td><b>${esc(c.name || 'Visitante')}</b><br><small class="muted">${esc(c.email || 'sem e-mail')}${c.phone ? ' · ' + esc(c.phone) : ''}</small>${c.email && !c.consent ? '<br><small class="muted">não autorizou e-mail</small>' : ''}</td>
          <td>${c.items.map((i) => `${i.qty}x ${esc(i.name)}`).join('<br>')}</td><td><b>${brl(c.subtotal)}</b></td>
          <td>${fmtDate(c.updated_at)}${c.reminders ? `<br><small class="muted">${c.reminders} lembrete(s)${c.recovered_clicks ? ' · abriu ' + c.recovered_clicks + 'x' : ''}</small>` : ''}</td>
          <td><span class="${cls}">● ${l}</span>${c.order_code ? '<br><small class="muted">' + esc(c.order_code) + '</small>' : ''}</td>
          <td><div class="act">${c.status !== 'convertido' && ph ? `<a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://wa.me/${ph.length <= 11 ? '55' + ph : ph}?text=${encodeURIComponent(msg)}">${UI.wa} WhatsApp</a>` : ''}
            ${c.status !== 'convertido' && c.email && c.consent ? `<button class="btn btn-line btn-sm" data-remind="${c.id}">Lembrar agora</button>` : ''}</div></td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="empty">Nenhum carrinho ainda. Eles aparecem quando um cliente com conta (ou que autorizou o lembrete no checkout) adiciona produtos e não finaliza.</div>');
    $('#view').onclick = async (e) => {
      const b = e.target.closest('[data-remind]'); if (!b) return;
      b.disabled = true;
      try { await api(`/api/admin/carts/${b.dataset.remind}/remind`, { method: 'POST' }); toast('Lembrete enviado'); viewCarts(); } catch (err) { toast(err.message, 1); b.disabled = false; }
    };
  }

  async function viewCustomers() {
    const list = await api('/api/admin/customers');
    $('#view').onclick = async (e) => {
      const b = e.target.closest('[data-cbadj]'); if (!b) return;
      const c = list.find((x) => x.id === +b.dataset.cbadj);
      const v = prompt(`Ajustar cashback de ${c.name} (saldo ${brl(c.cashback)}).\nUse valor positivo para dar crédito ou negativo para retirar:`, '20');
      if (v === null) return; const amount = Number(String(v).replace(',', '.')); if (!amount) return toast('Valor inválido.', 1);
      const note = prompt('Motivo (aparece no extrato do cliente):', 'Cortesia da loja') || 'ajuste manual';
      try { const r = await api(`/api/admin/customers/${c.id}/cashback`, { method: 'POST', body: { amount, note } }); c.cashback = r.balance; toast('Cashback ajustado: saldo ' + brl(r.balance)); viewCustomers(); } catch (err) { toast(err.message, 1); }
    };
    $('#view').innerHTML = top('Relacionamento', 'Clientes cadastrados', `<input class="input pill-input" id="cSearch" placeholder="Buscar nome, e-mail ou telefone…">`) +
      `<div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><span>Clientes</span><b>${list.length}</b></div>
        <div class="kpi"><span>Compraram pelo site</span><b>${list.filter((c) => c.orders).length}</b></div>
        <div class="kpi"><span>Avaliaram</span><b>${list.filter((c) => c.reviews).length}</b></div></div><div id="cList"></div>`;
    const draw = () => {
      const q = $('#cSearch').value.toLowerCase();
      const rows = list.filter((c) => !q || (c.name + ' ' + c.email + ' ' + c.phone).toLowerCase().includes(q));
      $('#cList').innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cliente</th><th>Contato</th><th>Cadastro</th><th>Pedidos</th><th>Total comprado</th><th>Clube</th><th></th></tr></thead><tbody>
        ${rows.map((c) => { const ph = digits(c.phone); return `<tr><td><div class="t-prod">${c.avatar ? `<img src="${esc(c.avatar)}" alt="" class="avatar" style="object-fit:cover">` : `<span class="avatar">${esc(c.name[0])}</span>`}<div><b>${esc(c.name)}</b><small>${esc(c.address_city || (c.city ? c.city + '/' + c.uf : ''))}</small></div></div></td>
          <td>${esc(c.email)} ${c.email_verified ? '<span class="st-on" title="E-mail confirmado">✓</span>' : '<small class="gold">(não confirmado)</small>'}<br><small class="muted">${esc(c.phone || '—')}${c.marketing ? ' · <span class="gold">recebe ofertas</span>' : ''}</small></td>
          <td>${fmtDate(c.created_at)}</td><td>${c.orders}</td><td>${brl(c.spent)}</td>
          <td>${esc(c.tier || '')}<br><small class="${c.cashback > 0 ? 'gold' : 'muted'}">${brl(c.cashback || 0)} de cashback</small>${S.me.role === 'owner' ? `<br><button class="btn-ghost" style="font-size:12px;padding:0" data-cbadj="${c.id}">Ajustar</button>` : ''}</td>
          <td>${ph ? `<a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://wa.me/${ph.length <= 11 ? '55' + ph : ph}">${UI.wa} WhatsApp</a>` : ''}</td></tr>`; }).join('')}
        </tbody></table></div>` : '<div class="empty">Nenhum cliente cadastrado ainda. Eles aparecem aqui quando criam conta para comprar, avaliar ou perguntar.</div>';
    };
    $('#cSearch').addEventListener('input', draw); draw();
  }

  /* ---------- produtos: lista ---------- */
  let PRODUCTS = [], prodTab = 'todos';
  async function viewProducts() {
    PRODUCTS = await api('/api/admin/products');
    const TABS = {
      todos: ['Todos', () => true], ativos: ['Ativos', (p) => p.active], pausados: ['Pausados', (p) => !p.active],
      semestoque: ['Sem estoque', (p) => p.stock <= 0], promo: ['Em promoção', (p) => promoState(p) === 'active' || promoState(p) === 'scheduled'],
      melhorar: ['Para melhorar', (p) => quality(p).score < 70]
    };
    $('#view').innerHTML = top('Catálogo', 'Meus anúncios', `<input class="input pill-input" id="pSearch" placeholder="Buscar por título, marca ou SKU…"><a class="btn btn-gold btn-sm" href="#produtos/novo">${UI.plus} Anunciar produto</a>`) +
      `<div class="seg" style="margin-bottom:16px" id="ptabs">${Object.entries(TABS).map(([k, [l, f]]) => `<button data-t="${k}" class="${prodTab === k ? 'on' : ''}">${l} (${PRODUCTS.filter(f).length})</button>`).join('')}</div><div id="pList"></div>`;
    const draw = () => {
      const q = $('#pSearch').value.toLowerCase();
      const list = PRODUCTS.filter(TABS[prodTab][1]).filter((p) => !q || (p.name + ' ' + p.brand + ' ' + p.sku + ' ' + p.category_name).toLowerCase().includes(q));
      $('#pList').innerHTML = list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Anúncio</th><th>Preço</th><th>Estoque</th><th>Qualidade</th><th>Status</th><th></th></tr></thead><tbody>
        ${list.map((p) => { const st = promoState(p), qa = quality(p); return `<tr class="click" data-p="${p.id}">
          <td><div class="t-prod"><div class="t-thumb">${thumb(p)}</div><div><b>${esc(p.name)}</b><small>${esc(p.category_name || 'Sem categoria')} · ${esc(p.condition)}${p.sku ? ' · SKU ' + esc(p.sku) : ''}</small>${p.open_questions ? `<small class="gold"> · ${p.open_questions} pergunta(s) sem resposta</small>` : ''}</div></div></td>
          <td>${st === 'active' ? `<b class="gold">${brl(p.promo_price)}</b><br><small class="muted" style="text-decoration:line-through">${brl(p.price)}</small>` : brl(p.price)}${st ? '<br>' + PROMO_TAG[st] : ''}</td>
          <td><span style="${p.stock <= 0 ? 'color:var(--err)' : p.stock <= 2 ? 'color:var(--gold)' : ''}">${p.stock} un.</span></td>
          <td><div class="q-mini"><i style="--v:${qa.score}"></i>${qa.score}%</div></td>
          <td><span class="${p.active ? 'st-on' : 'st-off'}">${p.active ? '● Ativo' : '● Pausado'}</span>${p.featured ? '<br><small class="gold">★ Destaque</small>' : ''}</td>
          <td><div class="act">
            <button class="icon-btn" data-toggle="${p.id}" title="${p.active ? 'Pausar anúncio' : 'Reativar anúncio'}">${p.active ? IC.pause : IC.play}</button>
            <button class="icon-btn" data-dup="${p.id}" title="Duplicar">${IC.copy}</button>
            <a class="icon-btn" href="/produto/${esc(p.slug)}" target="_blank" rel="noopener" title="Ver na loja" data-stop>${IC.eye}</a>
            <button class="icon-btn" data-del="${p.id}" title="Excluir">${UI.trash}</button></div></td></tr>`; }).join('')}
        </tbody></table></div>` : '<div class="empty">Nenhum anúncio neste filtro.</div>';
    };
    draw();
    $('#pSearch').addEventListener('input', draw);
    $('#view').onclick = async (e) => {
      const t = e.target.closest('[data-t]'); if (t) { prodTab = t.dataset.t; $$('#ptabs button').forEach((x) => x.classList.toggle('on', x === t)); draw(); return; }
      if (e.target.closest('[data-stop]')) return;
      const act = e.target.closest('[data-toggle],[data-dup],[data-del]');
      if (act) {
        e.stopPropagation();
        const p = PRODUCTS.find((x) => x.id === +(act.dataset.toggle || act.dataset.dup || act.dataset.del));
        try {
          if (act.dataset.toggle) { await api('/api/admin/products/' + p.id, { method: 'PUT', body: { ...p, active: !p.active } }); toast(p.active ? 'Anúncio pausado' : 'Anúncio reativado'); }
          if (act.dataset.dup) { const r = await api(`/api/admin/products/${p.id}/duplicate`, { method: 'POST' }); toast('Cópia criada (pausada) — revise e publique'); location.hash = 'produtos/' + r.id; return; }
          if (act.dataset.del) { if (!confirm(`Excluir "${p.name}" definitivamente?\n\nDica: para tirar da loja sem perder o anúncio, use Pausar.`)) return; await api('/api/admin/products/' + p.id, { method: 'DELETE' }); toast('Anúncio excluído'); }
          viewProducts();
        } catch (err) { toast(err.message, 1); }
        return;
      }
      const tr = e.target.closest('[data-p]'); if (tr) location.hash = 'produtos/' + tr.dataset.p;
    };
  }

  /* ---------- qualidade do anúncio ---------- */
  function quality(p) {
    const len = (p.name || '').trim().length;
    const checks = [
      ['Pelo menos 3 fotos', (p.images || []).length >= 3, 20],
      ['Título entre 20 e 70 caracteres', len >= 20 && len <= 70, 15],
      ['Título com a marca', !!p.brand && (p.name || '').toLowerCase().includes(String(p.brand).toLowerCase().split(' ')[0]), 5],
      ['Frase curta de destaque', (p.short || '').length >= 20, 10],
      ['Descrição com 150+ caracteres', (p.description || '').length >= 150, 15],
      ['Ficha técnica com 4+ itens', (p.specs || []).length >= 4, 15],
      ['Categoria definida', !!p.category_id, 5],
      ['Estoque disponível', p.stock > 0, 10],
      ['Garantia informada', !!(p.warranty || '').trim(), 5],
    ];
    const score = checks.reduce((a, c) => a + (c[1] ? c[2] : 0), 0);
    return { score, checks };
  }

  /* ---------- imagens: redimensionar, remover fundo, enquadrar ---------- */
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Não foi possível abrir a imagem.')); i.src = src; });
  const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  function canvasFrom(img, max = 1600) {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c;
  }
  function hasAlpha(c) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 16) if (d[i] < 250) return true;
    return false;
  }
  function exportCanvas(c) {
    if (hasAlpha(c)) { const w = c.toDataURL('image/webp', .9); return w.startsWith('data:image/webp') ? w : c.toDataURL('image/png'); }
    return c.toDataURL('image/jpeg', .88);
  }
  // remove o fundo por preenchimento a partir das bordas, usando a cor média dos cantos
  function removeBackground(src, tol) {
    const w = src.width, h = src.height;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.drawImage(src, 0, 0);
    const im = ctx.getImageData(0, 0, w, h), px = im.data;
    let r = 0, g = 0, b = 0, n = 0;
    for (const [cx, cy] of [[0, 0], [w - 6, 0], [0, h - 6], [w - 6, h - 6]])
      for (let y = cy; y < cy + 6; y++) for (let x = cx; x < cx + 6; x++) { const i = (y * w + x) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
    r /= n; g /= n; b /= n;
    const dist = (p) => Math.abs(px[p * 4] - r) + Math.abs(px[p * 4 + 1] - g) + Math.abs(px[p * 4 + 2] - b);
    const seen = new Uint8Array(w * h), stack = new Int32Array(w * h * 2); let sp = 0;
    for (let x = 0; x < w; x++) { stack[sp++] = x; stack[sp++] = (h - 1) * w + x; }
    for (let y = 0; y < h; y++) { stack[sp++] = y * w; stack[sp++] = y * w + w - 1; }
    while (sp > 0) {
      const p = stack[--sp];
      if (seen[p] || dist(p) > tol) continue;
      seen[p] = 1;
      const x = p % w;
      if (x > 0) stack[sp++] = p - 1; if (x < w - 1) stack[sp++] = p + 1;
      if (p >= w) stack[sp++] = p - w; if (p < w * (h - 1)) stack[sp++] = p + w;
      if (sp > stack.length - 8) break;
    }
    for (let p = 0; p < w * h; p++) {
      if (seen[p]) { px[p * 4 + 3] = 0; continue; }
      const x = p % w;
      const edge = (x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) || (p >= w && seen[p - w]) || (p < w * (h - 1) && seen[p + w]);
      if (edge) px[p * 4 + 3] = Math.max(0, Math.min(255, ((dist(p) - tol * .5) / tol) * 255));
    }
    ctx.putImageData(im, 0, 0);
    return c;
  }
  // recorta ao objeto e centraliza em um quadrado com margem
  function frameSquare(src, bg) {
    const w = src.width, h = src.height, d = src.getContext('2d').getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, side = Math.round(Math.max(bw, bh) / .84);
    const c = document.createElement('canvas'); c.width = c.height = Math.min(side, 1600);
    const k = c.width / side, ctx = c.getContext('2d');
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(src, x0, y0, bw, bh, (c.width - bw * k) / 2, (c.height - bh * k) / 2, bw * k, bh * k);
    return c;
  }
  async function uploadData(dataUrl, folder) { return (await api('/api/admin/upload', { method: 'POST', body: { data: dataUrl, folder } })).url; }
  async function fileToUpload(file, folder, max = 1800) {
    const c = canvasFrom(await loadImg(await readFile(file)), max);
    return uploadData(c.toDataURL('image/jpeg', .86), folder);
  }

  /* ---------- fotos da loja: equipe + mural de clientes ---------- */
  async function viewStorePhotos() {
    const s = S.settings = await api('/api/admin/settings');
    const st = { team_photo: s.team_photo || '', team_members: [...(s.team_members || [])], wall_photos: [...(s.wall_photos || [])], hero_left: s.hero_left || '', hero_right: s.hero_right || '' };
    $('#view').innerHTML = top('Vitrine', 'Fotos da <span class="serif gold">loja</span>', `<a class="btn btn-line btn-sm" href="/" target="_blank" rel="noopener">${IC.eye} Ver no site</a><button class="btn btn-gold btn-sm" id="spSave">Salvar</button>`) + `
      <div class="panel" style="margin-bottom:14px"><h3>Imagem do topo da página inicial</h3>
        <p class="hint" style="margin:-8px 0 0">Ficam nos cantos superiores, ao lado do título. Prefira imagens em boa resolução (800 px ou mais). Use o <b>Estúdio</b> para remover o fundo — elas se fundem ao preto do site.</p>
        <div class="hero-slots">
          
          <div class="hero-slot" data-slot="hero_right"><span class="cg-label">Retrato do topo (à direita)</span><div class="hs-prev checker"></div><div class="hs-act"></div></div>
        </div>
      </div>
      <div class="panel" style="margin-bottom:14px"><h3>Homenagem ao fundador & CEO <small class="muted" style="font-size:12px;font-weight:300">— final da página inicial</small></h3>
        <div class="row c2">
          <div class="field"><label>Nome do CEO</label><input id="ceoName" maxlength="80" value="${esc(s.ceo_name || '')}" placeholder="Nome e sobrenome"></div>
          <div class="field"><label>Cargo</label><input id="ceoTitle" maxlength="60" value="${esc(s.ceo_title || 'Fundador & CEO')}"></div>
        </div>
        <div class="field"><label>Frase dele (opcional — use uma frase real dita por ele)</label><input id="ceoQuote" maxlength="240" value="${esc(s.ceo_quote || '')}" placeholder="Ex.: o lema que ele repete para a equipe"></div>
        <div class="field"><label>Texto da homenagem</label><textarea id="ceoText" rows="5" maxlength="1500">${esc(s.ceo_text || '')}</textarea><p class="hint" style="margin-top:0">Deixe uma linha em branco para separar parágrafos. As fotos usadas são as 3 que vocês enviaram.</p></div>
      </div>
      <div class="settings-grid">
        <div class="panel"><h3>Nossa equipe</h3>
          <p class="hint" style="margin:-8px 0 0">Aparece na página inicial (“Quem faz a Aladdin”) e em “Como chegar”. Use uma foto horizontal, com boa luz.</p>
          <div id="teamPh"></div>
          <div class="field"><label>Texto de apresentação</label><textarea id="teamText" rows="2" maxlength="300">${esc(s.team_text || '')}</textarea></div>
          <label class="cg-label">Pessoas (da esquerda para a direita na foto)</label>
          <div class="repeat" id="teamRep"></div>
          <button type="button" class="btn btn-ghost" id="addMember" style="justify-self:start">+ Adicionar pessoa</button>
        </div>
        <div class="panel"><h3>Mural dos Upgrades</h3>
          <p class="hint" style="margin:-8px 0 0">Fotos de clientes com a árvore da loja. Aparecem numa faixa animada antes das avaliações. Até 60 fotos — arraste para reordenar.</p>
          <div class="field"><label>Frase do mural</label><input id="wallText" maxlength="200" value="${esc(s.wall_text || '')}"></div>
          <label class="dropzone sm" id="wallDrop">${IC.upload}<b>Adicionar fotos ao mural</b><span>Arraste ou clique · fotos verticais ficam melhores</span><input type="file" accept="image/*" multiple id="wallIn"></label>
          <div class="ph-grid" id="wallGrid"></div>
          <div class="tip">${IC.lock}<div><b>Direito de imagem</b><p>Publique apenas fotos de clientes que autorizaram o uso (uma mensagem no WhatsApp confirmando já ajuda a se proteger).</p></div></div>
        </div>
      </div>`;
    const drawTeam = () => {
      $('#teamPh').innerHTML = st.team_photo
        ? `<div class="team-prev"><img src="${esc(st.team_photo)}" alt=""><div><label class="btn btn-line btn-sm">Trocar foto<input type="file" accept="image/*" id="teamIn" hidden></label><button type="button" class="btn btn-ghost" id="teamRm">Remover</button></div></div>`
        : `<label class="dropzone sm">${IC.upload}<b>Enviar foto da equipe</b><span>JPG, PNG ou WEBP</span><input type="file" accept="image/*" id="teamIn"></label>`;
      $('#teamIn').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { st.team_photo = await fileToUpload(f, 'loja', 2000); drawTeam(); toast('Foto enviada — clique em Salvar'); } catch (err) { toast(err.message, 1); }
      });
      const rm = $('#teamRm'); rm && rm.addEventListener('click', () => { st.team_photo = ''; drawTeam(); });
      $('#teamRep').innerHTML = st.team_members.map((m, i) => `<div class="r" data-mi="${i}" style="grid-template-columns:1fr 1fr 34px"><input class="input" data-k="name" value="${esc(m.name)}" placeholder="Nome"><input class="input" data-k="role" value="${esc(m.role)}" placeholder="Função (ex.: Consultor Apple)"><button type="button" class="icon-btn" data-rmm style="width:34px;height:34px">${UI.trash}</button></div>`).join('');
    };
    const drawWall = () => {
      $('#wallGrid').innerHTML = st.wall_photos.map((u, i) => `<div class="ph" draggable="true" data-i="${i}"><img src="${esc(u)}" alt=""><div class="ph-act"><button type="button" data-rmw="${i}" title="Remover">${UI.trash}</button></div><span class="grip">${IC.grip}</span></div>`).join('');
    };
    const DEF = { hero_left: '/img/hero-genio.png', hero_right: '/img/hero-alladin.jpg' };
    const drawHero = () => $$('.hero-slot').forEach((slot) => {
      const k = slot.dataset.slot, cur = st[k] || DEF[k];
      $('.hs-prev', slot).innerHTML = `<img src="${esc(cur)}" alt="">`;
      $('.hs-act', slot).innerHTML = `<label class="btn btn-line btn-sm">${IC.upload} Enviar imagem<input type="file" accept="image/*" hidden data-hin="${k}"></label>
        <button type="button" class="btn btn-line btn-sm" data-hstudio="${k}">${IC.wand} Estúdio</button>${st[k] ? `<button type="button" class="btn btn-ghost" data-hreset="${k}">Voltar à original</button>` : ''}`;
    });
    drawHero();
    $('.hero-slots').addEventListener('change', async (e) => {
      const inp = e.target.closest('[data-hin]'); if (!inp || !inp.files[0]) return;
      const f = inp.files[0];
      try {
        const c = canvasFrom(await loadImg(await readFile(f)), 1600);
        st[inp.dataset.hin] = await uploadData(exportCanvas(c), 'loja'); drawHero(); toast('Imagem enviada — use o Estúdio se quiser tirar o fundo, depois clique em Salvar');
      } catch (err) { toast(err.message, 1); }
    });
    $('.hero-slots').addEventListener('click', (e) => {
      const s2 = e.target.closest('[data-hstudio]');
      if (s2) { const k = s2.dataset.hstudio; photoStudio(st[k] || DEF[k], (url) => { st[k] = url; drawHero(); }, 'loja', false); return; }
      const r = e.target.closest('[data-hreset]'); if (r) { st[r.dataset.hreset] = ''; drawHero(); }
    });
    drawTeam(); drawWall();
    $('#addMember').addEventListener('click', () => { st.team_members.push({ name: '', role: '' }); drawTeam(); $$('#teamRep [data-k=name]').pop().focus(); });
    $('#teamRep').addEventListener('input', (e) => { const r = e.target.closest('[data-mi]'); if (r) st.team_members[+r.dataset.mi][e.target.dataset.k] = e.target.value; });
    $('#teamRep').addEventListener('click', (e) => { if (e.target.closest('[data-rmm]')) { st.team_members.splice(+e.target.closest('[data-mi]').dataset.mi, 1); drawTeam(); } });
    const addWall = async (files) => {
      $('#wallDrop').classList.add('busy');
      for (const f of [...files].slice(0, 60 - st.wall_photos.length)) {
        if (!f.type.startsWith('image/')) continue;
        try { st.wall_photos.push(await fileToUpload(f, 'loja', 1400)); drawWall(); } catch (err) { toast(err.message, 1); }
      }
      $('#wallDrop').classList.remove('busy');
    };
    $('#wallIn').addEventListener('change', (e) => { addWall(e.target.files); e.target.value = ''; });
    const wd = $('#wallDrop');
    wd.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); wd.classList.add('over'); } });
    wd.addEventListener('dragleave', () => wd.classList.remove('over'));
    wd.addEventListener('drop', (e) => { wd.classList.remove('over'); if (e.dataTransfer.files.length) { e.preventDefault(); addWall(e.dataTransfer.files); } });
    let from = null;
    const g = $('#wallGrid');
    g.addEventListener('dragstart', (e) => { const el = e.target.closest('.ph'); if (el) from = +el.dataset.i; });
    g.addEventListener('dragover', (e) => { if (from !== null) e.preventDefault(); });
    g.addEventListener('drop', (e) => { const el = e.target.closest('.ph'); if (from === null || !el) return; e.preventDefault(); const [x] = st.wall_photos.splice(from, 1); st.wall_photos.splice(+el.dataset.i, 0, x); from = null; drawWall(); });
    g.addEventListener('click', (e) => { const r = e.target.closest('[data-rmw]'); if (r) { st.wall_photos.splice(+r.dataset.rmw, 1); drawWall(); } else { const ph = e.target.closest('.ph'); if (ph && e.target.tagName === 'IMG') viewPhoto(st.wall_photos[+ph.dataset.i]); } });
    $('#spSave').addEventListener('click', async () => {
      try {
        await api('/api/admin/settings', { method: 'PUT', body: { ceo_name: $('#ceoName').value.trim(), ceo_title: $('#ceoTitle').value.trim(), ceo_quote: $('#ceoQuote').value.trim(), ceo_text: $('#ceoText').value.trim(),
          hero_left: st.hero_left, hero_right: st.hero_right, team_photo: st.team_photo, team_members: st.team_members.filter((m) => m.name.trim()), team_text: $('#teamText').value.trim(), wall_photos: st.wall_photos, wall_text: $('#wallText').value.trim() } });
        toast('Fotos da loja salvas');
      } catch (e) { toast(e.message, 1); }
    });
  }

  function photoStudio(url, onSave, folder, squareDefault = true) {
    let mode = 'remove', tol = 42, square = squareDefault, srcCanvas = null, out = null;
    const m = modal(mHead(`Estúdio de <span class="serif gold">foto</span>`) + `<div class="m-body studio">
      <div class="studio-prev checker" id="stPrev"><span class="muted">Carregando…</span></div>
      <div class="studio-ctl">
        <span class="cg-label">Fundo</span>
        <div class="seg" id="stMode">
          <button data-m="original">Original</button><button data-m="remove" class="on">Sem fundo</button><button data-m="white">Fundo branco</button>
        </div>
        <div class="field" id="stTolF"><label>Sensibilidade da remoção <b id="stTolV">${tol}</b></label><input type="range" min="8" max="140" value="${tol}" id="stTol"></div>
        <label class="switch"><input type="checkbox" id="stSq" ${square ? 'checked' : ''}><span></span>Centralizar em formato quadrado</label>
        <div class="tip">${IC.wand}<div><b>Como funciona</b><p>Funciona melhor com fotos tiradas sobre fundo liso (branco, cinza ou uma cor só). Se apagar parte do produto, diminua a sensibilidade; se sobrar fundo, aumente.</p></div></div>
      </div></div>
      <div class="m-foot"><button class="btn btn-line btn-sm" data-close>Cancelar</button><button class="btn btn-gold btn-sm" id="stSave">Aplicar na foto</button></div>`);
    const render = () => {
      if (!srcCanvas) return;
      let c = srcCanvas;
      if (mode !== 'original') c = removeBackground(srcCanvas, tol);
      if (square) c = frameSquare(c, mode === 'white' ? '#ffffff' : (mode === 'original' ? null : null));
      if (mode === 'white' && !square) { const w = document.createElement('canvas'); w.width = c.width; w.height = c.height; const x = w.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w.width, w.height); x.drawImage(c, 0, 0); c = w; }
      out = c;
      $('#stPrev', m).innerHTML = ''; c.style.maxWidth = '100%'; c.style.maxHeight = '100%'; $('#stPrev', m).appendChild(c);
      $('#stTolF', m).style.display = mode === 'original' ? 'none' : '';
    };
    const debRender = (() => { let t; return () => { clearTimeout(t); t = setTimeout(render, 120); }; })();
    loadImg(url).then((img) => { srcCanvas = canvasFrom(img, 1400); render(); }).catch((e) => toast(e.message, 1));
    $('#stMode', m).addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b) return; mode = b.dataset.m; $$('#stMode button', m).forEach((x) => x.classList.toggle('on', x === b)); render(); });
    $('#stTol', m).addEventListener('input', (e) => { tol = +e.target.value; $('#stTolV', m).textContent = tol; debRender(); });
    $('#stSq', m).addEventListener('change', (e) => { square = e.target.checked; render(); });
    $('#stSave', m).addEventListener('click', async () => {
      if (!out) return;
      const btn = $('#stSave', m); btn.disabled = true; btn.textContent = 'Salvando…';
      try { onSave(await uploadData(exportCanvas(out), folder)); closeModal(); toast(folder === 'loja' ? 'Imagem pronta — clique em Salvar' : 'Foto atualizada'); }
      catch (e) { toast(e.message, 1); btn.disabled = false; btn.textContent = 'Aplicar na foto'; }
    });
  }

  /* ---------- editor de anúncio (central do vendedor) ---------- */
  const SPEC_SUGGEST = {
    iphone: ['Tela', 'Chip', 'Armazenamento', 'Câmera', 'Bateria', 'Cor', 'Conectividade', 'Garantia'],
    macbook: ['Chip', 'Memória', 'SSD', 'Tela', 'Bateria', 'Portas', 'Garantia'],
    ipad: ['Tela', 'Chip', 'Armazenamento', 'Conexão', 'Compatível com', 'Garantia'],
    watch: ['Caixa', 'Tela', 'Saúde', 'Resistência', 'Bateria', 'Pulseira'],
    airpods: ['Cancelamento de ruído', 'Bateria', 'Estojo', 'Conexão', 'Resistência'],
    jbl: ['Potência', 'Bateria', 'Proteção', 'Conexão', 'Dimensões'],
    playstation: ['Armazenamento', 'Resolução', 'Versão', 'Inclui', 'Garantia'],
    acessorios: ['Compatível com', 'Material', 'Potência', 'Conector', 'Garantia'],
    bike: ['Motor', 'Bateria', 'Autonomia', 'Velocidade máxima', 'Tempo de recarga', 'Aro', 'Peso suportado', 'Garantia'],
  };
  const OPTION_SUGGEST = { Cor: ['Preto', 'Branco', 'Azul', 'Prata', 'Dourado'], Armazenamento: ['128 GB', '256 GB', '512 GB', '1 TB'], Tamanho: ['41 mm', '45 mm'], Versão: ['Mídia física', 'Digital'] };
  const DESC_TPL = {
    'O que vem na caixa': '\n\nO QUE VEM NA CAIXA\n• Aparelho\n• Cabo USB‑C\n• Documentação',
    'Garantia': '\n\nGARANTIA\n• 1 ano de garantia Apple + suporte Aladdin Tech\n• Nota fiscal',
    'Estado (seminovo)': '\n\nESTADO DO APARELHO\n• Saúde da bateria: __%\n• Sem marcas de uso / marcas leves\n• Revisado e testado por nossos técnicos',
    'Diferenciais': '\n\nPOR QUE COMPRAR NA ALADDIN TECH\n• Procedência garantida\n• Entrega expressa ou retirada na loja\n• Use seu usado como parte do pagamento',
  };

  async function productEditor(arg) {
    if (!PRODUCTS.length || arg !== 'novo') PRODUCTS = await api('/api/admin/products');
    const isNew = arg === 'novo';
    const src = isNew ? null : PRODUCTS.find((x) => x.id === +arg);
    if (!isNew && !src) { $('#view').innerHTML = '<div class="empty">Anúncio não encontrado.</div>'; return; }
    const P = src ? JSON.parse(JSON.stringify(src)) : {
      name: '', brand: 'Apple', condition: 'Novo', short: '', description: '', price: '', old_price: '', cost: '', stock: 1, sku: '', warranty: '', grade: '', battery_health: '', imei_checked: false, real_photos: false, used_notes: '', included: '',
      images: [], specs: [], options: [], featured: false, active: true, category_id: (S.cats[0] || {}).id, promo_price: 0, promo_start: '', promo_end: ''
    };
    let promoOn = P.promo_price > 0;
    const catIcon = () => (S.cats.find((c) => c.id === +P.category_id) || {}).icon || 'acessorios';

    $('#view').innerHTML = `
      <div class="top"><div><a href="#produtos" class="crumb-back">← Meus anúncios</a><h1>${isNew ? 'Novo <span class="serif gold">anúncio</span>' : 'Editar <span class="serif gold">anúncio</span>'}</h1></div>
        <div class="top-actions">${!isNew ? `<a class="btn btn-line btn-sm" href="/produto/${esc(P.slug)}" target="_blank" rel="noopener">${IC.eye} Ver na loja</a>` : ''}</div></div>
      <div class="editor">
        <div class="ed-main">
          <section class="ed-card" id="sec-fotos">
            <header><em>1</em><div><h3>Fotos</h3><p>A primeira é a capa. Arraste para reordenar. Até 10 fotos — no site o cliente desliza o dedo para ver todas.</p></div></header>
            <label class="dropzone" id="drop">${IC.upload}<b>Arraste as fotos aqui</b><span>ou clique para escolher · JPG, PNG ou WEBP</span><input type="file" accept="image/*" multiple id="fileIn"></label>
            <label class="switch" style="margin-top:4px"><input type="checkbox" id="autoBg"><span></span>Remover o fundo automaticamente das novas fotos</label>
            <div class="ph-grid" id="phGrid"></div>
            <div class="tip">${IC.wand}<div><b>Dicas de fotos que vendem</b><p>Fundo branco ou sem fundo, produto centralizado, boa luz e sem marcas d’água. Mostre frente, verso, laterais e a caixa. No <b>Estúdio</b> você remove o fundo e enquadra a foto em um clique.</p></div></div>
          </section>

          <section class="ed-card">
            <header><em>2</em><div><h3>Título e categoria</h3><p>Use: Produto + Marca + Modelo + Característica principal.</p></div></header>
            <div class="field"><label>Título do anúncio *</label><input id="fName" maxlength="120" value="${esc(P.name)}" placeholder="Ex.: iPhone 16 Pro Max 256 GB Titânio Natural"><small class="counter" id="nameCount"></small></div>
            <div class="field"><label>Categoria</label><div class="cat-pick" id="catPick">${S.cats.map((c) => `<button type="button" data-cat="${c.id}" class="${c.id === +P.category_id ? 'on' : ''}"><i>${ART[c.icon] || ART.acessorios}</i>${esc(c.name)}</button>`).join('')}</div></div>
            <div class="row c2">
              <div class="field"><label>Marca</label><input id="fBrand" value="${esc(P.brand)}" list="brands"><datalist id="brands"><option>Apple</option><option>JBL</option><option>Sony</option><option>Samsung</option><option>Xiaomi</option><option>Motorola</option></datalist></div>
              <div class="field"><label>Condição</label><div class="seg full" id="condPick">${['Novo', 'Lacrado', 'Seminovo', 'Vitrine'].map((c) => `<button type="button" data-cond="${c}" class="${P.condition === c ? 'on' : ''}">${c}</button>`).join('')}</div></div>
              <div class="used-box pre-edit">
                <label class="switch"><input type="checkbox" id="fSoon" ${P.coming_soon ? 'checked' : ''}><span></span><b style="font-weight:500">Em breve / pré-venda</b> — aparece no site com “Me avise” e fila por sinal</label>
                <div class="row c3" id="soonBox" ${P.coming_soon ? '' : 'hidden'}><div class="field"><label>Previsão de chegada</label><input id="fEta" maxlength="80" value="${esc(P.coming_eta || '')}" placeholder="Ex.: chega dia 20/11"></div>
                  <div class="field"><label>Sinal para garantir (R$, 0 = só aviso)</label><input id="fDep" type="number" min="0" step="50" value="${P.preorder_deposit || ''}" placeholder="Ex.: 500"></div>
                  <div class="field"><label>Unidades no 1º lote</label><input id="fUnits" type="number" min="0" value="${P.preorder_units || ''}" placeholder="Ex.: 5"></div></div>
              </div>
              <div class="used-box" id="usedBox" ${/semi|vitrine/i.test(P.condition || '') ? '' : 'hidden'}>
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><span class="cg-label">Ficha do seminovo (aparece na página do produto)</span>
                  ${P.id ? '<button type="button" class="btn btn-line btn-sm" id="laudoBtn">Emitir laudo técnico (31 itens)</button>' : '<small class="muted">Salve o anúncio para emitir o laudo técnico.</small>'}</div>
                <div class="row c2"><div class="field"><label>Estado</label><div class="seg full" id="gradePick">${[['A', 'A · impecável'], ['B', 'B · marcas leves'], ['C', 'C · marcas visíveis']].map(([g, l]) => `<button type="button" data-grade="${g}" class="${P.grade === g ? 'on' : ''}">${l}</button>`).join('')}</div></div>
                  <div class="field"><label>Saúde da bateria (%)</label><input id="fBat" type="number" min="1" max="100" value="${P.battery_health || ''}" placeholder="Ex.: 91"></div></div>
                <label class="switch"><input type="checkbox" id="fImei" ${P.imei_checked ? 'checked' : ''}><span></span>IMEI consultado: sem restrição de roubo/furto e desbloqueado</label>
                <label class="switch"><input type="checkbox" id="fReal" ${P.real_photos ? 'checked' : ''}><span></span>As fotos do anúncio são desta unidade (fotos reais)</label>
                <div class="row c2"><div class="field"><label>Acompanha</label><input id="fIncl" maxlength="160" value="${esc(P.included || '')}" placeholder="Ex.: cabo USB-C e caixa original"></div>
                  <div class="field"><label>Observações de uso</label><input id="fUsedNotes" maxlength="300" value="${esc(P.used_notes || '')}" placeholder="Ex.: risco leve na lateral esquerda"></div></div>
              </div>
            </div>
          </section>

          <section class="ed-card">
            <header><em>3</em><div><h3>Descrição</h3><p>Conte o que o cliente precisa saber para comprar sem dúvidas.</p></div></header>
            <div class="field"><label>Frase de destaque (aparece no cartão do produto)</label><input id="fShort" maxlength="160" value="${esc(P.short)}" placeholder="Ex.: Titânio. Chip A19 Pro. A câmera mais avançada."></div>
            <div class="field"><label>Descrição completa</label>
              <div class="tpl-bar">${Object.keys(DESC_TPL).map((k) => `<button type="button" class="chip" data-tpl="${esc(k)}">+ ${esc(k)}</button>`).join('')}</div>
              <textarea id="fDesc" rows="9" maxlength="8000" placeholder="Descreva o produto, estado, o que acompanha, diferenciais…">${esc(P.description)}</textarea><small class="counter" id="descCount"></small></div>
          </section>

          <section class="ed-card">
            <header><em>4</em><div><h3>Variações</h3><p>Opções que o cliente escolhe na página do produto (cor, armazenamento…).</p></div></header>
            <div id="optList"></div>
            <div class="tpl-bar"><span class="muted" style="font-size:12px">Adicionar:</span>${Object.keys(OPTION_SUGGEST).map((k) => `<button type="button" class="chip" data-addopt="${k}">+ ${k}</button>`).join('')}<button type="button" class="chip" data-addopt="">+ Outra</button></div>
          </section>

          <section class="ed-card">
            <header><em>5</em><div><h3>Ficha técnica</h3><p>Especificações exibidas em tabela. Quanto mais completa, menos dúvidas.</p></div></header>
            <div id="specList" class="spec-list"></div>
            <div class="tpl-bar" id="specSuggest"></div>
          </section>

          <section class="ed-card">
            <header><em>6</em><div><h3>Preço e promoção</h3><p>Defina o preço, o valor “de” e agende promoções com início e fim.</p></div></header>
            <div class="row c3">
              <div class="field"><label>Preço de venda (R$) *</label><input id="fPrice" type="number" step="0.01" min="0" value="${P.price}"></div>
              <div class="field"><label>Preço “de” (riscado)</label><input id="fOld" type="number" step="0.01" min="0" value="${P.old_price || ''}"></div>
              <div class="field"><label>Custo (privado) ${IC.lock.replace('<svg', '<svg style="width:12px;height:12px;display:inline;vertical-align:-1px"')}</label><input id="fCost" type="number" step="0.01" min="0" value="${P.cost || ''}"></div>
            </div>
            <div class="price-sim" id="priceSim"></div>
            <label class="switch"><input type="checkbox" id="promoOn" ${promoOn ? 'checked' : ''}><span></span><b style="font-weight:500">Ativar promoção</b></label>
            <div id="promoBox" class="promo-box">
              <div class="row c2">
                <div class="field"><label>Desconto (%)</label><input id="fPct" type="number" min="1" max="89" step="1"></div>
                <div class="field"><label>Preço promocional (R$)</label><input id="fPromo" type="number" step="0.01" min="0" value="${P.promo_price || ''}"></div>
              </div>
              <div class="row c2">
                <div class="field"><label>Início (vazio = agora)</label><input id="fPS" type="datetime-local" value="${esc(P.promo_start)}"></div>
                <div class="field"><label>Fim (vazio = sem prazo)</label><input id="fPE" type="datetime-local" value="${esc(P.promo_end)}"></div>
              </div>
              <div class="tpl-bar"><span class="muted" style="font-size:12px">Duração rápida:</span>${[['24 horas', 1], ['3 dias', 3], ['7 dias', 7], ['15 dias', 15]].map(([l, d]) => `<button type="button" class="chip" data-dur="${d}">${l}</button>`).join('')}<button type="button" class="chip" data-dur="fds">Fim de semana</button></div>
              <p class="hint" id="promoInfo" style="margin:0"></p>
            </div>
          </section>

          <section class="ed-card">
            <header><em>7</em><div><h3>Estoque e garantia</h3><p>O estoque baixa sozinho a cada venda e volta se o pedido for cancelado.</p></div></header>
            <div class="row c3">
              <div class="field"><label>Estoque (unidades)</label><input id="fStock" type="number" min="0" value="${P.stock}" ${P.track_units ? 'readonly title="Calculado pelas unidades (IMEI) cadastradas"' : ''}>
                <label class="switch" style="margin-top:8px;font-size:12.5px"><input type="checkbox" id="fTrack" ${P.track_units ? 'checked' : ''}><span></span>Controlar por unidade (IMEI)</label>
                ${P.id ? '<button type="button" class="btn-ghost" id="unitsBtn" style="font-size:12.5px;padding:4px 0">Ver / dar entrada em unidades →</button>' : ''}</div>
              <div class="field"><label>SKU / código interno</label><input id="fSku" maxlength="40" value="${esc(P.sku)}" placeholder="Opcional"></div>
              <div class="field"><label>Vendas antes do site</label><input id="fSoldBase" type="number" min="0" value="${P.sold_base || ''}" placeholder="0"><small class="muted">Só números reais (histórico da loja). Somado às vendas do sistema no “+N vendidos”.</small></div>
              <div class="field"><label>Garantia</label><input id="fWar" maxlength="120" value="${esc(P.warranty)}" placeholder="Ex.: 1 ano Apple"></div>
              <div class="field" style="grid-column:1/-1"><label>Vídeos do produto (YouTube, Shorts, Reels do Instagram ou TikTok — um link por linha, até 6)</label><textarea id="fVideos" rows="3" placeholder="https://www.instagram.com/reel/...
https://youtube.com/shorts/...">${esc((P.videos || []).join('\n'))}</textarea></div>
              <div class="field"><label>Anúncio no Mercado Livre (MLB…)</label><input id="fMl" maxlength="20" value="${esc(P.ml_item_id || '')}" placeholder="MLB1234567890"></div>
              <div class="field"><label>Item na Shopee (ID)</label><input id="fSh" maxlength="20" inputmode="numeric" value="${esc(P.shopee_item_id || '')}" placeholder="Ex.: 23456789012"></div>
              <div class="field"><label>Código de barras / GTIN (opcional — ajuda no Google Shopping)</label><input id="fGtin" inputmode="numeric" maxlength="14" value="${esc(P.gtin || '')}" placeholder="Ex.: 0195949000000"></div>
              <div class="field"><label>Prazo da garantia da loja (meses)</label><input id="fWarM" type="number" min="0" max="60" value="${P.warranty_months || ''}" placeholder="padrão: ${/semi/i.test(P.condition || '') ? (S.settings.warranty_used_months ?? 3) : (S.settings.warranty_new_months ?? 12)}"></div>
            </div>
            <div class="row c3">
              <div class="field"><label>Peso com embalagem (kg)</label><input id="fKg" type="number" step="0.01" min="0" value="${P.weight_kg || ''}" placeholder="Ex.: 0.6"></div>
              <div class="field"><label>Caixa (L × C × A, cm)</label><div style="display:flex;gap:6px"><input id="fW" type="number" min="0" value="${P.width_cm || ''}" placeholder="L"><input id="fL" type="number" min="0" value="${P.length_cm || ''}" placeholder="C"><input id="fH" type="number" min="0" value="${P.height_cm || ''}" placeholder="A"></div></div>
              <div class="field"><label>NCM (nota fiscal)</label><input id="fNcm" maxlength="10" value="${esc(P.ncm || '')}" placeholder="Ex.: 8517.13.00"></div>
            </div>
            <p class="hint" style="margin:0">Peso e caixa entram no cálculo de frete dos Correios. Em branco, usamos medidas padrão da categoria. O NCM vem da sua contabilidade (vazio = NCM padrão das configurações).</p>
          </section>

          <section class="ed-card">
            <header><em>8</em><div><h3>Publicação</h3><p>Controle onde e se o anúncio aparece.</p></div></header>
            <div style="display:flex;gap:28px;flex-wrap:wrap">
              <label class="switch"><input type="checkbox" id="fActive" ${P.active ? 'checked' : ''}><span></span>Anúncio ativo na loja</label>
              <label class="switch"><input type="checkbox" id="fFeat" ${P.featured ? 'checked' : ''}><span></span>Destaque na página inicial</label>
            </div>
          </section>
        </div>

        <aside class="ed-side">
          <div class="ed-sticky">
            <div class="panel"><h3 style="margin-bottom:12px">Prévia na loja</h3><div id="preview"></div></div>
            <div class="panel"><div class="q-head"><div class="q-ring" id="qRing"><span></span></div><div><h3 style="margin:0">Qualidade do anúncio</h3><p class="muted" id="qText" style="margin:2px 0 0;font-size:12.5px"></p></div></div><ul class="q-list" id="qList"></ul></div>
            <div class="ed-actions">
              <button class="btn btn-gold btn-block" id="save">${isNew ? 'Publicar anúncio' : 'Salvar alterações'}</button>
              ${isNew ? '<button class="btn btn-line btn-block" id="saveDraft">Salvar como pausado</button>' : ''}
              <p class="form-msg err" id="saveMsg"></p>
            </div>
          </div>
        </aside>
      </div>`;

    const V = $('#view');
    const markDirty = () => { S.dirty = true; };
    /* fotos */
    const drawPhotos = () => {
      $('#phGrid').innerHTML = P.images.map((u, i) => `<div class="ph checker" draggable="true" data-i="${i}">
        <img src="${esc(u)}" alt="">${i === 0 ? '<span class="cover">CAPA</span>' : ''}
        <div class="ph-act"><button type="button" data-studio="${i}" title="Estúdio: remover fundo e enquadrar">${IC.wand}</button>${i ? `<button type="button" data-cover="${i}" title="Usar como capa">${IC.star}</button>` : ''}<button type="button" data-rmimg="${i}" title="Remover">${UI.trash}</button></div>
        <span class="grip">${IC.grip}</span></div>`).join('') + (P.images.length ? '' : `<p class="muted" style="margin:0;font-size:13px">Nenhuma foto ainda. Sem fotos, a loja mostra uma ilustração da categoria.</p>`);
      sync();
    };
    let uploading = 0;
    const addFiles = async (files) => {
      if (P.images.length >= 10) { toast('Limite de 10 fotos por produto.', 1); return; }
      for (const f of [...files].slice(0, 10 - P.images.length)) {
        if (!f.type.startsWith('image/')) continue;
        uploading++; $('#drop').classList.add('busy');
        try {
          let c = canvasFrom(await loadImg(await readFile(f)), 1600);
          if ($('#autoBg').checked) c = frameSquare(removeBackground(c, 42));
          P.images.push(await uploadData(exportCanvas(c))); markDirty(); drawPhotos();
        } catch (e) { toast(e.message, 1); }
        uploading--; if (!uploading) $('#drop').classList.remove('busy');
      }
    };
    $('#fileIn').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
    const drop = $('#drop');
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); drop.classList.add('over'); } }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
    let dragFrom = null;
    $('#phGrid').addEventListener('dragstart', (e) => { const el = e.target.closest('.ph'); if (el) { dragFrom = +el.dataset.i; el.classList.add('dragging'); } });
    $('#phGrid').addEventListener('dragend', (e) => { const el = e.target.closest('.ph'); el && el.classList.remove('dragging'); });
    $('#phGrid').addEventListener('dragover', (e) => { if (dragFrom !== null) e.preventDefault(); });
    $('#phGrid').addEventListener('drop', (e) => {
      const el = e.target.closest('.ph'); if (dragFrom === null || !el) return;
      e.preventDefault(); const to = +el.dataset.i; const [x] = P.images.splice(dragFrom, 1); P.images.splice(to, 0, x); dragFrom = null; markDirty(); drawPhotos();
    });
    $('#phGrid').addEventListener('click', (e) => {
      const r = e.target.closest('[data-rmimg]'); if (r) { P.images.splice(+r.dataset.rmimg, 1); markDirty(); drawPhotos(); return; }
      const c = e.target.closest('[data-cover]'); if (c) { const [x] = P.images.splice(+c.dataset.cover, 1); P.images.unshift(x); markDirty(); drawPhotos(); return; }
      const s = e.target.closest('[data-studio]'); if (s) { const i = +s.dataset.studio; photoStudio(P.images[i], (url) => { P.images[i] = url; markDirty(); drawPhotos(); }); return; }
      const ph = e.target.closest('.ph'); if (ph && e.target.tagName === 'IMG') viewPhoto(P.images[+ph.dataset.i]);
    });

    /* variações */
    const drawOpts = () => {
      $('#optList').innerHTML = P.options.map((o, i) => `<div class="opt-row" data-oi="${i}">
        <input class="input" data-oname value="${esc(o.name)}" placeholder="Nome (ex.: Cor)">
        <div class="chips-in">${o.values.map((v, j) => `<span class="vchip">${esc(v)}<button type="button" data-rmv="${j}" aria-label="Remover">${UI.close}</button></span>`).join('')}<input data-vin placeholder="Digite e tecle Enter"></div>
        <button type="button" class="icon-btn" data-rmopt title="Remover variação">${UI.trash}</button></div>
        ${OPTION_SUGGEST[o.name] ? `<div class="tpl-bar sub">${OPTION_SUGGEST[o.name].filter((v) => !o.values.includes(v)).map((v) => `<button type="button" class="chip" data-sugv="${i}" data-v="${esc(v)}">+ ${esc(v)}</button>`).join('')}</div>` : ''}`).join('')
        || '<p class="muted" style="margin:0;font-size:13px">Sem variações — o cliente compra o produto como está.</p>';
      sync();
    };
    $('#optList').addEventListener('keydown', (e) => {
      if (!e.target.matches('[data-vin]') || (e.key !== 'Enter' && e.key !== ',')) return;
      e.preventDefault();
      const i = +e.target.closest('[data-oi]').dataset.oi, v = e.target.value.trim().replace(/,$/, '');
      if (v && !P.options[i].values.includes(v)) { P.options[i].values.push(v); markDirty(); drawOpts(); $(`[data-oi="${i}"] [data-vin]`).focus(); }
    });
    $('#optList').addEventListener('input', (e) => { if (e.target.matches('[data-oname]')) { P.options[+e.target.closest('[data-oi]').dataset.oi].name = e.target.value; markDirty(); sync(); } });
    $('#optList').addEventListener('click', (e) => {
      const row = e.target.closest('[data-oi]');
      if (e.target.closest('[data-rmv]')) { P.options[+row.dataset.oi].values.splice(+e.target.closest('[data-rmv]').dataset.rmv, 1); markDirty(); drawOpts(); }
      else if (e.target.closest('[data-rmopt]')) { P.options.splice(+row.dataset.oi, 1); markDirty(); drawOpts(); }
      const sg = e.target.closest('[data-sugv]'); if (sg) { P.options[+sg.dataset.sugv].values.push(sg.dataset.v); markDirty(); drawOpts(); }
    });

    /* ficha técnica */
    const drawSpecs = () => {
      $('#specList').innerHTML = P.specs.map((s, i) => `<div class="spec-row" data-si="${i}"><input class="input" data-k value="${esc(s.k)}" placeholder="Item"><input class="input" data-v value="${esc(s.v)}" placeholder="Descrição"><button type="button" class="icon-btn" data-rmspec>${UI.trash}</button></div>`).join('');
      const used = P.specs.map((s) => s.k.toLowerCase());
      $('#specSuggest').innerHTML = `<span class="muted" style="font-size:12px">Sugestões:</span>` + (SPEC_SUGGEST[catIcon()] || SPEC_SUGGEST.acessorios).filter((k) => !used.includes(k.toLowerCase()))
        .map((k) => `<button type="button" class="chip" data-addspec="${esc(k)}">+ ${esc(k)}</button>`).join('') + `<button type="button" class="chip" data-addspec="">+ Outro item</button>`;
      sync();
    };
    $('#specList').addEventListener('input', (e) => { const r = e.target.closest('[data-si]'); if (!r) return; const s = P.specs[+r.dataset.si]; if (e.target.matches('[data-k]')) s.k = e.target.value; else s.v = e.target.value; markDirty(); sync(); });
    $('#specList').addEventListener('click', (e) => { if (e.target.closest('[data-rmspec]')) { P.specs.splice(+e.target.closest('[data-si]').dataset.si, 1); markDirty(); drawSpecs(); } });

    /* preço & promoção */
    const num = (id) => Number($(id).value) || 0;
    const syncPrice = () => {
      const price = num('#fPrice'), cost = num('#fCost'), old = num('#fOld');
      const promo = promoOn ? num('#fPromo') : 0;
      const sell = promo > 0 && promo < price ? promo : price;
      const pix = sell * (1 - (Number(S.settings.pix_discount) || 5) / 100);
      const nInst = Number(S.settings.installments_no_interest) || 10;
      const margin = cost > 0 && sell > 0 ? ((sell - cost) / sell) * 100 : null;
      $('#priceSim').innerHTML = price > 0 ? `
        <div><span>Cliente vê</span><b>${brl(sell)}</b>${old > sell || (promo && price > promo) ? `<small style="text-decoration:line-through">${brl(Math.max(old, promo ? price : 0))}</small>` : ''}</div>
        <div><span>No Pix</span><b class="gold">${brl(pix)}</b></div>
        <div><span>Parcelado</span><b>${nInst}x ${brl(sell / nInst)}</b></div>
        ${margin !== null ? `<div><span>Margem</span><b style="color:${margin < 8 ? 'var(--err)' : margin < 15 ? 'var(--gold)' : 'var(--ok)'}">${margin.toFixed(1).replace('.', ',')}%</b><small>${brl(sell - cost)} por venda</small></div>` : ''}` : '<p class="muted" style="margin:0;font-size:13px">Informe o preço para ver a simulação.</p>';
      $('#promoBox').style.display = promoOn ? '' : 'none';
      if (promoOn) {
        const ps = $('#fPS').value, pe = $('#fPE').value, now = localNow();
        const info = !(promo > 0) ? 'Defina o desconto ou o preço promocional.' : promo >= price ? '⚠ O preço promocional precisa ser menor que o preço de venda.'
          : pe && pe <= (ps || now) ? '⚠ O fim precisa ser depois do início.'
          : ps && ps > now ? `Agendada: começa em ${new Date(ps).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${pe ? ' e termina em ' + new Date(pe).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''}.`
          : `Ativa ${pe ? 'até ' + new Date(pe).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + ' — a loja mostra contagem regressiva' : 'sem data de término'}.`;
        $('#promoInfo').textContent = info;
      }
      sync();
    };
    const setPct = () => { const price = num('#fPrice'), pr = num('#fPromo'); $('#fPct').value = price > 0 && pr > 0 && pr < price ? Math.round((1 - pr / price) * 100) : ''; };
    setPct();
    $('#fPct').addEventListener('input', () => { const price = num('#fPrice'), pct = num('#fPct'); if (price > 0 && pct > 0 && pct < 90) $('#fPromo').value = (Math.round(price * (1 - pct / 100) * 100) / 100).toFixed(2); markDirty(); syncPrice(); });
    $('#fPromo').addEventListener('input', () => { setPct(); markDirty(); syncPrice(); });
    $('#fPrice').addEventListener('input', () => { const pct = num('#fPct'); if (promoOn && pct) $('#fPromo').value = (Math.round(num('#fPrice') * (1 - pct / 100) * 100) / 100).toFixed(2); markDirty(); syncPrice(); });
    ['#fOld', '#fCost', '#fPS', '#fPE'].forEach((id) => $(id).addEventListener('input', () => { markDirty(); syncPrice(); }));
    $('#promoOn').addEventListener('change', (e) => { promoOn = e.target.checked; markDirty(); syncPrice(); });
    $('#promoBox').addEventListener('click', (e) => {
      const d = e.target.closest('[data-dur]'); if (!d) return;
      const start = new Date(); let end = new Date();
      if (d.dataset.dur === 'fds') { const day = start.getDay(); const toSat = (6 - day + 7) % 7; start.setDate(start.getDate() + (day === 0 || day === 6 ? 0 : toSat)); if (!(day === 0 || day === 6)) start.setHours(0, 0, 0, 0); end = new Date(start); end.setDate(end.getDate() + (start.getDay() === 6 ? 1 : 0)); end.setHours(23, 59, 0, 0); }
      else end.setDate(end.getDate() + +d.dataset.dur);
      $('#fPS').value = start > new Date() ? toLocalInput(start) : ''; $('#fPE').value = toLocalInput(end); markDirty(); syncPrice();
    });

    /* campos gerais */
    const collect = () => {
      P.name = $('#fName').value.trim(); P.brand = $('#fBrand').value.trim(); P.short = $('#fShort').value.trim(); P.description = $('#fDesc').value;
      P.price = num('#fPrice'); P.old_price = num('#fOld'); P.cost = num('#fCost'); P.stock = parseInt($('#fStock').value) || 0;
      P.track_units = $('#fTrack').checked; P.ml_item_id = $('#fMl').value.trim(); P.shopee_item_id = $('#fSh').value.trim();
      P.videos = $('#fVideos').value.split(/\s+/).filter(Boolean); P.gtin = $('#fGtin').value.trim();
      P.sku = $('#fSku').value.trim(); P.sold_base = Math.max(0, parseInt($('#fSoldBase').value) || 0); P.warranty = $('#fWar').value.trim(); P.warranty_months = +$('#fWarM').value || 0;
      P.coming_soon = $('#fSoon').checked; P.coming_eta = $('#fEta').value.trim(); P.preorder_deposit = +$('#fDep').value || 0; P.preorder_units = +$('#fUnits').value || 0;
      P.battery_health = +$('#fBat').value || 0; P.imei_checked = $('#fImei').checked; P.real_photos = $('#fReal').checked; P.included = $('#fIncl').value.trim(); P.used_notes = $('#fUsedNotes').value.trim();
      P.weight_kg = num('#fKg'); P.width_cm = num('#fW'); P.length_cm = num('#fL'); P.height_cm = num('#fH'); P.ncm = $('#fNcm').value.trim(); P.active = $('#fActive').checked; P.featured = $('#fFeat').checked;
      P.promo_price = promoOn ? num('#fPromo') : 0; P.promo_start = promoOn ? $('#fPS').value : ''; P.promo_end = promoOn ? $('#fPE').value : '';
      return P;
    };
    const sync = () => {
      collect();
      $('#nameCount').textContent = `${P.name.length} / 120 ${P.name.length > 70 ? '· títulos com até 70 caracteres aparecem inteiros' : ''}`;
      $('#descCount').textContent = `${P.description.length} / 8000`;
      // prévia
      const st = promoState(P), sell = st === 'active' ? P.promo_price : P.price, old = st === 'active' ? Math.max(P.old_price, P.price) : P.old_price;
      const off = old > sell && sell > 0 ? Math.round((1 - sell / old) * 100) : 0;
      $('#preview').innerHTML = `<article class="pcard" style="pointer-events:none">
        <div class="media"><div class="badges">${st === 'active' ? '<span class="badge gold">Oferta</span>' : ''}${P.condition !== 'Novo' ? `<span class="badge">${esc(P.condition)}</span>` : ''}${off ? `<span class="badge off">−${off}%</span>` : ''}</div>
          ${P.images[0] ? `<div class="thumb"><img src="${esc(P.images[0])}" alt=""></div>` : `<div class="thumb"><div class="art">${ART[catIcon()] || ART.acessorios}</div></div>`}</div>
        <div class="info"><span class="brand-l">${esc(P.brand)}</span><h3>${esc(P.name || 'Título do anúncio')}</h3>${P.short ? `<p class="short">${esc(P.short)}</p>` : ''}
          <div class="price-row"><div>${off ? `<span class="price-old">${brl(old)}</span>` : ''}<span class="price">${brl(sell)}</span><span class="price-pix">${brl(sell * (1 - (Number(S.settings.pix_discount) || 5) / 100))} no Pix</span></div><span class="quick-add">${UI.plus}</span></div></div></article>`;
      const q = quality(P);
      $('#qRing').style.setProperty('--v', q.score);
      $('#qRing span').textContent = q.score + '%';
      $('#qText').textContent = q.score >= 85 ? 'Excelente — pronto para vender!' : q.score >= 60 ? 'Bom. Complete os itens abaixo para vender mais.' : 'Básico. Anúncios completos vendem mais.';
      $('#qList').innerHTML = q.checks.map(([l, ok]) => `<li class="${ok ? 'ok' : ''}">${ok ? UI.check : '<i></i>'}${l}</li>`).join('');
    };

    V.oninput = (e) => { if (e.target.closest('.ed-main') && !e.target.closest('#optList,#specList,#promoBox')) { markDirty(); sync(); } };
    V.onchange = (e) => { if (e.target.matches('#fActive,#fFeat')) { markDirty(); sync(); } };
    V.onclick = (e) => {
      const c = e.target.closest('[data-cat]'); if (c) { P.category_id = +c.dataset.cat; $$('[data-cat]').forEach((x) => x.classList.toggle('on', x === c)); markDirty(); drawSpecs(); return; }
      const cd = e.target.closest('[data-cond]'); if (cd) { P.condition = cd.dataset.cond; $$('[data-cond]').forEach((x) => x.classList.toggle('on', x === cd)); $('#usedBox').hidden = !/semi|vitrine/i.test(P.condition); markDirty(); sync(); return; }
      if (e.target.id === 'fSoon') { $('#soonBox').hidden = !e.target.checked; markDirty(); }
      if (e.target.closest('#laudoBtn')) { laudoForm(P); return; }
      if (e.target.closest('#unitsBtn')) { unitsModal(P); return; }
      if (e.target.id === 'fTrack') { $('#fStock').readOnly = e.target.checked; markDirty(); }
      const gd = e.target.closest('[data-grade]'); if (gd) { P.grade = P.grade === gd.dataset.grade ? '' : gd.dataset.grade; $$('[data-grade]').forEach((x) => x.classList.toggle('on', x.dataset.grade === P.grade)); markDirty(); return; }
      const t = e.target.closest('[data-tpl]'); if (t) { const ta = $('#fDesc'); ta.value = (ta.value.trimEnd() + DESC_TPL[t.dataset.tpl]).replace(/^\n+/, ''); markDirty(); sync(); ta.focus(); return; }
      const ao = e.target.closest('[data-addopt]'); if (ao) { if (P.options.length >= 6) return toast('Máximo de 6 variações', 1); P.options.push({ name: ao.dataset.addopt, values: [] }); markDirty(); drawOpts(); const ins = $$('[data-vin]'); ins.length && (ao.dataset.addopt ? ins[ins.length - 1] : $$('[data-oname]').pop()).focus(); return; }
      const as = e.target.closest('[data-addspec]'); if (as) { P.specs.push({ k: as.dataset.addspec, v: '' }); markDirty(); drawSpecs(); const r = $$('.spec-row').pop(); r && $(as.dataset.addspec ? '[data-v]' : '[data-k]', r).focus(); return; }
    };
    const save = async (asDraft) => {
      collect();
      const msg = $('#saveMsg'); msg.textContent = '';
      if (P.name.length < 3) { msg.textContent = 'Informe o título do anúncio.'; $('#fName').focus(); return; }
      if (!(P.price > 0)) { msg.textContent = 'Informe o preço de venda.'; $('#fPrice').focus(); return; }
      if (uploading) { msg.textContent = 'Aguarde o envio das fotos terminar.'; return; }
      const body = { ...P, options: P.options.filter((o) => o.name.trim() && o.values.length), specs: P.specs.filter((s) => s.k.trim() && s.v.trim()) };
      if (asDraft) body.active = false;
      const btn = $('#save'); btn.disabled = true;
      try {
        const r = await api('/api/admin/products' + (isNew ? '' : '/' + P.id), { method: isNew ? 'POST' : 'PUT', body });
        S.dirty = false;
        toast(isNew ? (asDraft ? 'Anúncio salvo como pausado' : 'Anúncio publicado!') : 'Alterações salvas');
        if (isNew) location.hash = 'produtos/' + r.id; else { PRODUCTS = await api('/api/admin/products'); }
      } catch (e) { msg.textContent = e.message; }
      btn.disabled = false;
    };
    $('#save').addEventListener('click', () => save(false));
    $('#saveDraft') && $('#saveDraft').addEventListener('click', () => save(true));

    drawPhotos(); drawOpts(); drawSpecs(); syncPrice();
    S.dirty = false;
  }

  /* ---------- promoções ---------- */
  async function viewPromos() {
    PRODUCTS = await api('/api/admin/products');
    const sel = new Set();
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    $('#view').innerHTML = top('Marketing', 'Central de <span class="serif gold">promoções</span>', can('coupons') ? `<a class="btn btn-line btn-sm" href="#cupons">${IC.tag} Cupons de desconto</a>` : '') + `
      <div class="panel promo-make">
        <h3>Criar promoção</h3>
        <div class="row c3">
          <div class="field"><label>Aplicar em</label><select id="pmScope"><option value="sel">Produtos selecionados abaixo</option>${S.cats.map((c) => `<option value="cat:${c.id}">Toda a categoria ${esc(c.name)}</option>`).join('')}<option value="all">Toda a loja</option></select></div>
          <div class="field"><label>Desconto (%)</label><input id="pmPct" type="number" min="1" max="89" value="10"></div>
          <div class="field"><label>Nome interno (opcional)</label><input id="pmName" placeholder="Ex.: Black Friday"></div>
        </div>
        <div class="row c2">
          <div class="field"><label>Início (vazio = agora)</label><input id="pmStart" type="datetime-local"></div>
          <div class="field"><label>Fim</label><input id="pmEnd" type="datetime-local" value="${toLocalInput(in7)}"></div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="btn btn-gold btn-sm" id="pmApply">${IC.fire} Aplicar promoção</button><button class="btn btn-line btn-sm" id="pmClear">Encerrar promoção dos selecionados</button><span class="muted" id="pmSel" style="font-size:13px"></span></div>
        <p class="hint" style="margin:0">O preço promocional é calculado sobre o preço de venda de cada produto. A loja exibe selo “Oferta”, preço riscado e contagem regressiva, e o preço volta sozinho ao fim do prazo.</p>
      </div>
      <div class="tbl-wrap" style="margin-top:14px"><table class="tbl"><thead><tr><th style="width:34px"><input type="checkbox" id="pmAll" aria-label="Selecionar todos"></th><th>Produto</th><th>Preço</th><th>Promoção</th><th>Período</th><th>Status</th></tr></thead><tbody>
      ${PRODUCTS.map((p) => { const st = promoState(p); return `<tr><td><input type="checkbox" data-sel="${p.id}"></td>
        <td><div class="t-prod"><div class="t-thumb">${thumb(p)}</div><div><b>${esc(p.name)}</b><small>${esc(p.category_name || '')}</small></div></div></td>
        <td>${brl(p.price)}</td><td>${p.promo_price > 0 ? `<b class="gold">${brl(p.promo_price)}</b> <small class="muted">−${Math.round((1 - p.promo_price / p.price) * 100)}%</small>` : '<span class="muted">—</span>'}</td>
        <td><small>${p.promo_price > 0 ? `${p.promo_start ? fmtDate(p.promo_start) : 'Agora'} → ${p.promo_end ? fmtDate(p.promo_end) : 'sem fim'}` : ''}</small></td>
        <td>${st ? PROMO_TAG[st] : '<span class="muted">Sem promoção</span>'}</td></tr>`; }).join('')}
      </tbody></table></div>`;
    const upd = () => { $('#pmSel').textContent = sel.size ? `${sel.size} selecionado(s)` : ''; };
    $('#view').onchange = (e) => {
      if (e.target.id === 'pmAll') { $$('[data-sel]').forEach((c) => { c.checked = e.target.checked; c.checked ? sel.add(+c.dataset.sel) : sel.delete(+c.dataset.sel); }); upd(); }
      if (e.target.matches('[data-sel]')) { e.target.checked ? sel.add(+e.target.dataset.sel) : sel.delete(+e.target.dataset.sel); upd(); }
    };
    $('#pmApply').addEventListener('click', async () => {
      const scope = $('#pmScope').value, body = { percent: +$('#pmPct').value, start: $('#pmStart').value, end: $('#pmEnd').value };
      if (scope === 'sel') { if (!sel.size) return toast('Selecione os produtos na tabela', 1); body.product_ids = [...sel]; }
      else if (scope === 'all') { if (!confirm('Aplicar esta promoção em TODOS os produtos da loja?')) return; body.all = true; }
      else body.category_id = +scope.split(':')[1];
      try { const r = await api('/api/admin/promos/bulk', { method: 'POST', body }); toast(`Promoção aplicada em ${r.count} produto(s)`); viewPromos(); } catch (e) { toast(e.message, 1); }
    });
    $('#pmClear').addEventListener('click', async () => {
      if (!sel.size) return toast('Selecione os produtos na tabela', 1);
      try { await api('/api/admin/promos/clear', { method: 'POST', body: { product_ids: [...sel] } }); toast('Promoção encerrada'); viewPromos(); } catch (e) { toast(e.message, 1); }
    });
  }

  /* ---------- categorias ---------- */
  async function viewCats() {
    S.cats = await api('/api/categories');
    $('#view').innerHTML = top('Catálogo', 'Categorias', `<button class="btn btn-gold btn-sm" id="newCat">${UI.plus} Nova categoria</button>`) +
      `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Categoria</th><th>Ordem</th><th>Produtos</th><th></th></tr></thead><tbody>
      ${S.cats.map((c) => `<tr class="click" data-c="${c.id}"><td><div class="t-prod"><div class="t-thumb">${thumb({ category_icon: c.icon })}</div><b>${esc(c.name)}</b></div></td><td>${c.sort}</td><td>${c.count}</td>
        <td><div class="act"><button class="icon-btn" data-cdel="${c.id}" title="Excluir">${UI.trash}</button></div></td></tr>`).join('')}
      </tbody></table></div>`;
    $('#newCat').addEventListener('click', () => catForm());
    $('#view').onclick = async (e) => {
      const d = e.target.closest('[data-cdel]');
      if (d) { e.stopPropagation(); if (!confirm('Excluir esta categoria?')) return; try { await api('/api/admin/categories/' + d.dataset.cdel, { method: 'DELETE' }); toast('Categoria excluída'); viewCats(); } catch (err) { toast(err.message, 1); } return; }
      const tr = e.target.closest('[data-c]'); if (tr) catForm(S.cats.find((c) => c.id === +tr.dataset.c));
    };
  }
  function catForm(c) {
    const isNew = !c; c = c || { name: '', icon: 'acessorios', sort: S.cats.length };
    let icon = c.icon;
    const m = modal(mHead(isNew ? 'Nova categoria' : 'Editar categoria') + `<div class="m-body">
      <div class="row c2"><div class="field"><label>Nome *</label><input id="cName" value="${esc(c.name)}"></div><div class="field"><label>Ordem de exibição</label><input id="cSort" type="number" value="${c.sort}"></div></div>
      <div class="field"><label>Ilustração</label><div class="icon-pick">${Object.keys(ART).map((k) => `<button type="button" data-ic="${k}" class="${k === icon ? 'on' : ''}" title="${k}">${ART[k]}</button>`).join('')}</div></div>
    </div><div class="m-foot"><button class="btn btn-line btn-sm" data-close>Cancelar</button><button class="btn btn-gold btn-sm" id="cSave">Salvar</button></div>`, 'sm');
    $('.icon-pick', m).addEventListener('click', (e) => { const b = e.target.closest('[data-ic]'); if (!b) return; icon = b.dataset.ic; $$('[data-ic]', m).forEach((x) => x.classList.toggle('on', x === b)); });
    $('#cSave', m).addEventListener('click', async () => {
      try { await api('/api/admin/categories' + (isNew ? '' : '/' + c.id), { method: isNew ? 'POST' : 'PUT', body: { name: $('#cName', m).value.trim(), sort: $('#cSort', m).value, icon } }); toast('Categoria salva'); closeModal(); viewCats(); }
      catch (e) { toast(e.message, 1); }
    });
  }

  /* ---------- cupons ---------- */
  const CTYPE = { percent: 'Percentual (%)', fixed: 'Valor fixo (R$)', freeship: 'Frete grátis' };
  async function viewCoupons() {
    const list = await api('/api/admin/coupons');
    const val = (c) => c.type === 'percent' ? c.value + '%' : c.type === 'fixed' ? brl(c.value) : 'Frete grátis';
    const expired = (c) => c.expires_at && new Date(c.expires_at + 'T23:59:59') < new Date();
    $('#view').innerHTML = top('Marketing', 'Cupons de desconto', `${can('promos') ? `<a class="btn btn-line btn-sm" href="#promocoes">${IC.fire} Promoções</a>` : ''}<button class="btn btn-gold btn-sm" id="newCp">${UI.plus} Novo cupom</button>`) +
      (list.length ? `<div class="coupon-grid">${list.map((c) => `<div class="coupon-card ${!c.active || expired(c) ? 'off' : ''}" data-cp="${c.id}">
        <div class="cc-left"><b>${val(c)}</b><span>${c.type === 'freeship' ? '' : 'de desconto'}</span></div>
        <div class="cc-right"><div class="cc-code">${esc(c.code)}<button class="icon-btn" data-copy="${esc(c.code)}" title="Copiar código">${IC.copy}</button></div>
          <small>${esc(c.description || '')}</small>
          <small class="muted">${c.min_order ? 'Mín. ' + brl(c.min_order) + ' · ' : ''}${c.uses}${c.max_uses ? '/' + c.max_uses : ''} uso(s) · ${c.expires_at ? (expired(c) ? 'Expirou em ' : 'Até ') + new Date(c.expires_at + 'T12:00').toLocaleDateString('pt-BR') : 'Sem validade'}</small>
          <div class="cc-foot"><span class="${c.active && !expired(c) ? 'st-on' : 'st-off'}">${c.active ? (expired(c) ? '● Expirado' : '● Ativo') : '● Inativo'}</span><button class="icon-btn" data-cpdel="${c.id}" title="Excluir">${UI.trash}</button></div></div>
      </div>`).join('')}</div>` : '<div class="empty">Nenhum cupom criado.</div>');
    $('#newCp').addEventListener('click', () => couponForm());
    $('#view').onclick = async (e) => {
      const cp = e.target.closest('[data-copy]'); if (cp) { e.stopPropagation(); navigator.clipboard && navigator.clipboard.writeText(cp.dataset.copy); toast('Código copiado'); return; }
      const d = e.target.closest('[data-cpdel]');
      if (d) { e.stopPropagation(); if (!confirm('Excluir este cupom?')) return; await api('/api/admin/coupons/' + d.dataset.cpdel, { method: 'DELETE' }); toast('Cupom excluído'); viewCoupons(); return; }
      const card = e.target.closest('[data-cp]'); if (card) couponForm(list.find((c) => c.id === +card.dataset.cp));
    };
  }
  function couponForm(c) {
    const isNew = !c; c = c || { code: '', type: 'percent', value: 10, min_order: 0, max_uses: 0, expires_at: '', description: '', active: 1 };
    const m = modal(mHead(isNew ? 'Novo cupom' : 'Editar cupom') + `<form class="m-body" id="cpForm">
      <div class="row c2"><div class="field"><label>Código *</label><div style="display:flex;gap:6px"><input name="code" value="${esc(c.code)}" required style="text-transform:uppercase;letter-spacing:.08em" placeholder="EX.: BLACKFRIDAY"><button type="button" class="btn btn-line btn-sm" id="cpGen" title="Gerar código">Gerar</button></div></div>
        <div class="field"><label>Tipo</label><select name="type">${Object.entries(CTYPE).map(([k, l]) => `<option value="${k}" ${c.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="row c2"><div class="field" id="valField"><label>Valor do desconto</label><input name="value" type="number" step="0.01" min="0" value="${c.value}"></div>
        <div class="field"><label>Pedido mínimo (R$)</label><input name="min_order" type="number" step="0.01" min="0" value="${c.min_order}"></div></div>
      <div class="row c2"><div class="field"><label>Limite de usos (0 = ilimitado)</label><input name="max_uses" type="number" min="0" value="${c.max_uses}"></div>
        <div class="field"><label>Válido até</label><input name="expires_at" type="date" value="${esc(c.expires_at)}"></div></div>
      <div class="field"><label>Descrição (aparece para o cliente)</label><input name="description" value="${esc(c.description)}" placeholder="Ex.: 10% em toda a loja"></div>
      <label class="switch"><input type="checkbox" name="active" ${c.active ? 'checked' : ''}><span></span>Cupom ativo</label>
    </form><div class="m-foot"><button class="btn btn-line btn-sm" data-close>Cancelar</button><button class="btn btn-gold btn-sm" id="cpSave">Salvar cupom</button></div>`, 'sm');
    const tSel = $('[name=type]', m), vf = $('#valField', m);
    const syncT = () => { vf.style.display = tSel.value === 'freeship' ? 'none' : ''; };
    tSel.addEventListener('change', syncT); syncT();
    $('#cpGen', m).addEventListener('click', () => { $('[name=code]', m).value = 'ALADDIN' + genPass().slice(0, 5).toUpperCase(); });
    $('#cpSave', m).addEventListener('click', async () => {
      const f = $('#cpForm', m); if (!f.reportValidity()) return;
      const fd = new FormData(f), body = Object.fromEntries(fd); body.active = fd.get('active') === 'on';
      try { await api('/api/admin/coupons' + (isNew ? '' : '/' + c.id), { method: isNew ? 'POST' : 'PUT', body }); toast('Cupom salvo'); closeModal(); viewCoupons(); }
      catch (e) { toast(e.message, 1); }
    });
  }

  /* ---------- avaliações ---------- */
  let rvTab = 'pendentes';
  async function viewReviews() {
    const list = await api('/api/admin/reviews');
    const TABS = { pendentes: ['Aguardando', (r) => !r.approved], publicadas: ['Publicadas', (r) => r.approved], fotos: ['Com fotos', (r) => r.photos.length], todas: ['Todas', () => true] };
    const draw = () => {
      const rows = list.filter(TABS[rvTab][1]);
      $('#rvList').innerHTML = rows.length ? rows.map((r) => `<div class="rv ${r.approved ? '' : 'pending'}" data-r="${r.id}">
        <div class="meta"><span><b style="color:var(--text);font-weight:500">${esc(r.name)}</b>${r.city ? ' · ' + esc(r.city) : ''} · ${fmtDate(r.created_at)} · ${r.product_name ? `<a href="/produto/${esc(r.product_slug)}" target="_blank" rel="noopener" class="gold">${esc(r.product_name)}</a>` : 'Avaliação da loja'}
          ${r.verified ? '<span class="verified">' + UI.check + ' Compra verificada</span>' : r.order_code ? `<span class="muted"> · pedido informado ${esc(r.order_code)} (não confere)</span>` : ''}</span>
          <span class="gold" style="letter-spacing:2px">${'★'.repeat(r.rating)}<span style="opacity:.2">${'★'.repeat(5 - r.rating)}</span></span></div>
        ${r.title ? `<b style="font-weight:500">${esc(r.title)}</b>` : ''}
        <p>${esc(r.comment)}</p>
        ${r.photos.length ? `<div class="rv-ph">${r.photos.map((u) => `<div><img src="${esc(u)}" alt="" data-view="${esc(u)}"><button data-rmph="${esc(u)}" title="Remover foto">${UI.close}</button></div>`).join('')}</div>` : ''}
        <div class="reply-box"><textarea class="input" rows="2" data-reply placeholder="Responder publicamente como Aladdin Tech…">${esc(r.reply)}</textarea><button class="btn btn-line btn-sm" data-savereply>${r.reply ? 'Atualizar resposta' : 'Responder'}</button></div>
        <div class="meta"><span>${r.approved ? '<span class="st-on">● Publicada</span>' : '<span class="gold">● Aguardando aprovação</span>'} · ${r.helpful || 0} acharam útil</span>
          <span style="display:flex;gap:8px"><button class="btn btn-sm ${r.approved ? 'btn-line' : 'btn-gold'}" data-ap="${r.approved ? 0 : 1}">${r.approved ? 'Ocultar' : 'Aprovar e publicar'}</button><button class="btn btn-line btn-sm" data-rdel>Excluir</button></span></div>
      </div>`).join('') : '<div class="empty">Nada por aqui.</div>';
    };
    $('#view').innerHTML = top('Reputação', 'Avaliações', '') +
      `<div class="seg" style="margin-bottom:16px" id="rvTabs">${Object.entries(TABS).map(([k, [l, f]]) => `<button data-t="${k}" class="${rvTab === k ? 'on' : ''}">${l} (${list.filter(f).length})</button>`).join('')}</div>
      <div class="review-adm" id="rvList"></div>`;
    draw();
    $('#view').onclick = async (e) => {
      const t = e.target.closest('[data-t]'); if (t) { rvTab = t.dataset.t; $$('#rvTabs button').forEach((x) => x.classList.toggle('on', x === t)); draw(); return; }
      const v = e.target.closest('[data-view]'); if (v) return viewPhoto(v.dataset.view);
      const card = e.target.closest('[data-r]'); if (!card) return;
      const id = +card.dataset.r;
      try {
        if (e.target.closest('[data-ap]')) { const ap = e.target.closest('[data-ap]').dataset.ap === '1'; await api('/api/admin/reviews/' + id, { method: 'PUT', body: { approved: ap } }); toast(ap ? 'Avaliação publicada' : 'Avaliação ocultada'); }
        else if (e.target.closest('[data-savereply]')) { await api('/api/admin/reviews/' + id, { method: 'PUT', body: { reply: $('[data-reply]', card).value.trim() } }); toast('Resposta salva'); }
        else if (e.target.closest('[data-rmph]')) { if (!confirm('Remover esta foto da avaliação?')) return; await api('/api/admin/reviews/' + id, { method: 'PUT', body: { remove_photo: e.target.closest('[data-rmph]').dataset.rmph } }); toast('Foto removida'); }
        else if (e.target.closest('[data-rdel]')) { if (!confirm('Excluir esta avaliação e suas fotos?')) return; await api('/api/admin/reviews/' + id, { method: 'DELETE' }); toast('Avaliação excluída'); }
        else return;
        viewReviews(); refreshPills();
      } catch (err) { toast(err.message, 1); }
    };
  }

  /* ---------- perguntas ---------- */
  let qTab = 'abertas';
  const Q_TPL = ['Olá! Sim, temos disponível para pronta entrega. Qualquer dúvida, estamos à disposição!', 'Olá! O produto tem garantia e nota fiscal. Você também pode retirar na loja em até 1 hora.', 'Olá! Aceitamos seu aparelho usado como parte do pagamento — simule em “Upgrade” no site.'];
  async function viewQuestions() {
    const list = await api('/api/admin/questions');
    const TABS = { abertas: ['Sem resposta', (q) => !q.answer], respondidas: ['Respondidas', (q) => q.answer], todas: ['Todas', () => true] };
    const draw = () => {
      const rows = list.filter(TABS[qTab][1]);
      $('#qList').innerHTML = rows.length ? rows.map((q) => `<div class="rv ${q.answer ? '' : 'pending'}" data-q="${q.id}">
        <div class="meta"><span style="display:flex;align-items:center;gap:10px"><span class="t-thumb" style="width:34px;height:34px;border-radius:8px;overflow:hidden">${thumb({ image: q.product_image, category_icon: 'acessorios' })}</span><a href="/produto/${esc(q.product_slug)}#perguntas" target="_blank" rel="noopener" class="gold">${esc(q.product_name || 'Produto removido')}</a></span><span>${esc(q.name)} · ${fmtDate(q.created_at)}</span></div>
        <p style="font-weight:500">${esc(q.question)}</p>
        ${!q.answer ? `<div class="tpl-bar">${Q_TPL.map((t, i) => `<button class="chip" data-qtpl="${i}">Resposta rápida ${i + 1}</button>`).join('')}</div>` : ''}
        <div class="reply-box"><textarea class="input" rows="2" data-answer placeholder="Escreva a resposta (fica pública na página do produto)">${esc(q.answer)}</textarea><button class="btn btn-sm ${q.answer ? 'btn-line' : 'btn-gold'}" data-saveq>${q.answer ? 'Atualizar' : 'Responder'}</button></div>
        <div class="meta"><span>${q.answer ? `Respondida por ${esc(q.answered_by)} em ${fmtDate(q.answered_at)}` : '<span class="gold">● Aguardando resposta</span>'}</span>
          <span style="display:flex;gap:8px"><label class="switch" style="font-size:12.5px"><input type="checkbox" data-pub ${q.public ? 'checked' : ''}><span></span>Pública</label><button class="btn btn-line btn-sm" data-qdel>Excluir</button></span></div>
      </div>`).join('') : '<div class="empty">Nenhuma pergunta aqui.</div>';
    };
    $('#view').innerHTML = top('Atendimento', 'Perguntas dos clientes', '') +
      `<div class="seg" style="margin-bottom:16px" id="qTabs">${Object.entries(TABS).map(([k, [l, f]]) => `<button data-t="${k}" class="${qTab === k ? 'on' : ''}">${l} (${list.filter(f).length})</button>`).join('')}</div>
      <div class="review-adm" id="qList"></div>`;
    draw();
    $('#view').onclick = async (e) => {
      const t = e.target.closest('[data-t]'); if (t) { qTab = t.dataset.t; $$('#qTabs button').forEach((x) => x.classList.toggle('on', x === t)); draw(); return; }
      const card = e.target.closest('[data-q]'); if (!card) return;
      const id = +card.dataset.q;
      const tp = e.target.closest('[data-qtpl]'); if (tp) { $('[data-answer]', card).value = Q_TPL[+tp.dataset.qtpl]; $('[data-answer]', card).focus(); return; }
      try {
        if (e.target.closest('[data-saveq]')) { const a = $('[data-answer]', card).value.trim(); if (!a) return toast('Escreva a resposta', 1); await api('/api/admin/questions/' + id, { method: 'PUT', body: { answer: a } }); toast('Resposta publicada'); }
        else if (e.target.closest('[data-qdel]')) { if (!confirm('Excluir esta pergunta?')) return; await api('/api/admin/questions/' + id, { method: 'DELETE' }); toast('Pergunta excluída'); }
        else return;
        viewQuestions(); refreshPills();
      } catch (err) { toast(err.message, 1); }
    };
    $('#view').onchange = async (e) => {
      if (!e.target.matches('[data-pub]')) return;
      await api('/api/admin/questions/' + e.target.closest('[data-q]').dataset.q, { method: 'PUT', body: { public: e.target.checked } }); toast(e.target.checked ? 'Pergunta visível' : 'Pergunta oculta');
    };
  }

  /* ---------- garantia por IMEI + recibo ---------- */
  const docUrl = (t) => location.origin + '/documento/' + t;
  const waDoc = (o, t) => { const ph = digits(o.customer.phone); const txt = `Olá${o.customer.name ? ', ' + o.customer.name.split(' ')[0] : ''}! Aqui estão o recibo e o termo de garantia da sua compra na Aladdin Tech: ${docUrl(t)}`;
    return 'https://wa.me/' + (ph.length >= 10 ? (ph.length <= 11 ? '55' + ph : ph) : '') + '?text=' + encodeURIComponent(txt); };
  async function warrantyBox(o, m) {
    const box = $('#warBox', m); if (!box) return;
    if (o.status === 'cancelado') { box.hidden = true; return; }
    let data; try { data = await api('/api/admin/orders/' + o.id + '/warranty'); } catch { return; }
    const draw = () => {
      const byIdx = (i) => data.list.filter((w) => w.item_index === i).map((w) => w.serial);
      box.innerHTML = `<div class="nfe-head"><span class="cg-label">Garantia · IMEI / nº de série</span>${data.list.length ? `<span class="st-on">● ${data.list.length} registrada(s)</span>` : '<span class="muted" style="font-size:12px">nenhuma registrada</span>'}</div>
        ${o.items.map((i, k) => `<div class="war-row"><span>${i.qty}x ${esc(i.name)}</span><textarea class="input" rows="${Math.min(3, i.qty)}" data-wi="${k}" placeholder="${i.qty > 1 ? 'Um IMEI por linha' : 'IMEI (15 dígitos) ou nº de série'}">${esc(byIdx(k).join('\n'))}</textarea></div>`).join('')}
        <div class="war-act"><button type="button" class="btn btn-line btn-sm" id="warSave">Salvar garantia</button>
          ${data.doc_token ? `<a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="/documento/${data.doc_token}">Recibo e termo (PDF)</a><a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="${waDoc(o, data.doc_token)}">${UI.wa} Enviar ao cliente</a>`
            : `<button type="button" class="btn btn-line btn-sm" id="docGen">Gerar recibo</button>`}</div>
        <p class="hint" style="margin:0">O cliente consulta a garantia em ${esc(location.host)}/garantia digitando o IMEI. O recibo abre pronto para imprimir ou salvar em PDF.</p>`;
      $('#warSave', box).addEventListener('click', async () => {
        const items = $$('[data-wi]', box).map((t) => ({ index: +t.dataset.wi, serials: t.value.split(/[\s,;]+/).filter(Boolean) }));
        try { data = { ...(await api('/api/admin/orders/' + o.id + '/warranty', { method: 'POST', body: { items } })) }; o.doc_token = data.doc_token; toast('Garantia salva'); draw(); } catch (e) { toast(e.message, 1); }
      });
      $('#docGen', box)?.addEventListener('click', async () => { try { const r = await api('/api/admin/orders/' + o.id + '/doc', { method: 'POST' }); data.doc_token = r.doc_token; o.doc_token = r.doc_token; draw(); } catch (e) { toast(e.message, 1); } });
    };
    draw();
  }

  /* ---------- comissões (somente Dono) ---------- */
  async function viewCommissions(month) {
    const r = await api('/api/admin/commissions' + (month ? '?month=' + month : ''));
    const cfg = r.cfg;
    const open = new Set();
    $('#view').innerHTML = top('Somente o Dono', 'Comissões', `<select class="input pill-input" id="cmMonth">${r.months.map((x) => `<option value="${x.key}" ${x.key === r.month ? 'selected' : ''}>${x.label}</option>`).join('')}</select>
        <button class="btn btn-line btn-sm" id="cmCsv">${IC.copy} Exportar para Excel</button>`) + `
      <div class="kpis"><div class="kpi"><span>Comissão total de ${esc(r.label.split(' de ')[0])}</span><b>${brl(r.total)}</b></div>
        <div class="kpi"><span>Já pago</span><b>${brl(r.total_paid)}</b></div>
        <div class="kpi"><span>A pagar</span><b class="gold">${brl(Math.max(0, r.total - r.total_paid))}</b></div>
        <div class="kpi"><span>Vendido pelos consultores</span><b>${brl(r.sales)}</b></div></div>
      <div class="panel cm-panel"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Consultor</th><th>Vendas</th><th>Base (pago pelo cliente, sem frete)</th><th>% efetivo</th><th>Comissão</th><th>Pagamento</th></tr></thead><tbody>
        ${r.rows.map((x) => `<tr class="click" data-cm="${x.id}"><td><div class="t-prod">${face(x)}<div><b>${esc(x.name)}</b><small>${esc(x.title || '')}${x.active ? '' : ' · desligado'}</small></div></div></td>
          <td>${x.n}</td><td>${brl(x.base)}</td><td>${x.n ? x.eff_pct.toLocaleString('pt-BR') + '%' : '—'}</td><td><b class="gold">${brl(x.amount)}</b></td>
          <td>${x.paid ? `<span class="st-on">● Pago ${brl(x.paid.amount)}</span><br><small class="muted">${fmtDate(x.paid.paid_at)}${x.paid.changed ? ' · <span style="color:var(--err)">valor mudou depois</span>' : ''}</small><br><button class="btn-ghost cm-undo" data-undo="${x.id}">Reabrir</button>`
            : x.amount > 0 ? `<button class="btn btn-gold btn-sm" data-pay="${x.id}">Marcar como pago</button>` : '<span class="muted">—</span>'}</td></tr>
          <tr class="cm-detail" data-cmd="${x.id}" hidden><td colspan="6">${x.orders.length ? x.orders.map((o) => `<div class="cm-order"><div><b>${esc(o.code)}</b> <small class="muted">${fmtDate(o.date)} · ${o.channel === 'loja' ? 'balcão' : 'site'} · pago ${brl(o.total)}</small></div>
            ${o.lines.map((l) => `<div class="cm-line"><span>${l.qty}x ${esc(l.name)} <small class="muted">${esc(l.category)}</small></span><span>${brl(l.base)} × ${l.rate.toLocaleString('pt-BR')}%</span><b>${brl(l.amount)}</b></div>`).join('')}</div>`).join('') : '<p class="muted" style="margin:0">Nenhuma venda paga neste mês.</p>'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhum consultor cadastrado. Em Equipe, ligue “É consultor”.</td></tr>'}
      </tbody></table></div>
      <p class="hint">Clique no consultor para ver pedido por pedido. Contam só vendas pagas/confirmadas (canceladas saem sozinhas). A base é o que o cliente pagou pelos produtos — já com cupom e desconto Pix, sem o frete. “Marcar como pago” trava o valor do mês.</p></div>
      <div class="panel cm-rules"><h3>Regras de comissão</h3>
        <p class="muted" style="margin:0">Ordem de prioridade: <b>categoria</b> → <b>percentual próprio do consultor</b> → <b>padrão</b>. Deixe em branco para usar o padrão. Mudanças valem para os meses ainda não pagos.</p>
        <div class="field" style="max-width:240px"><label>Percentual padrão (%)</label><input class="input" id="cmDef" type="number" min="0" max="50" step="0.1" value="${cfg.default_pct}"></div>
        <div class="cm-grid"><div><span class="cg-label">Por categoria</span>${r.categories.map((c) => `<label class="cm-rate"><span>${esc(c.name)}</span><input class="input" type="number" min="0" max="50" step="0.1" data-cat="${c.id}" value="${cfg.by_category[c.id] ?? ''}" placeholder="${cfg.default_pct}"><i>%</i></label>`).join('')}</div>
          <div><span class="cg-label">Por consultor</span>${r.sellers.map((u) => `<label class="cm-rate"><span>${esc(u.name)}</span><input class="input" type="number" min="0" max="50" step="0.1" data-sel="${u.id}" value="${cfg.by_seller[u.id] ?? ''}" placeholder="${cfg.default_pct}"><i>%</i></label>`).join('') || '<p class="muted">Nenhum consultor.</p>'}</div></div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-gold btn-sm" id="cmSave">Salvar regras</button>${cfg.updated_at ? `<small class="muted">Última alteração: ${fmtDate(cfg.updated_at)} por ${esc(cfg.updated_by)}</small>` : ''}</div>
      </div>`;
    $('#cmMonth').addEventListener('change', (e) => viewCommissions(e.target.value));
    $('#cmCsv').addEventListener('click', () => {
      const q = (v) => '"' + String(v).replace(/"/g, '""') + '"', n = (v) => String(v.toFixed(2)).replace('.', ',');
      const lines = [['Mês', 'Consultor', 'Pedido', 'Data', 'Canal', 'Produto', 'Categoria', 'Qtd', 'Base (R$)', '%', 'Comissão (R$)'].map(q).join(';')];
      r.rows.forEach((x) => x.orders.forEach((o) => o.lines.forEach((l) => lines.push([r.label, x.name, o.code, o.date, o.channel === 'loja' ? 'Balcão' : 'Site', l.name, l.category, l.qty].map(q).concat([n(l.base), String(l.rate).replace('.', ','), n(l.amount)]).join(';')))));
      lines.push(''); lines.push([q('Resumo'), q('Consultor'), q('Vendas'), q('Base'), q('Comissão'), q('Pago')].join(';'));
      r.rows.forEach((x) => lines.push([q(r.label), q(x.name), x.n, n(x.base), n(x.amount), q(x.paid ? 'sim' : 'não')].join(';')));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
      a.download = `comissoes-${r.month}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    $('#cmSave').addEventListener('click', async () => {
      const by_category = {}, by_seller = {};
      $$('[data-cat]').forEach((i) => { if (i.value !== '') by_category[i.dataset.cat] = +i.value; });
      $$('[data-sel]').forEach((i) => { if (i.value !== '') by_seller[i.dataset.sel] = +i.value; });
      try { await api('/api/admin/commissions/config', { method: 'PUT', body: { default_pct: +$('#cmDef').value, by_category, by_seller } }); toast('Regras salvas — comissões recalculadas'); viewCommissions(r.month); } catch (e) { toast(e.message, 1); }
    });
    $('#view').onclick = async (e) => {
      const p = e.target.closest('[data-pay]'), u = e.target.closest('[data-undo]');
      if (p || u) {
        e.stopPropagation();
        const x = r.rows.find((y) => y.id === +(p || u).dataset[p ? 'pay' : 'undo']);
        if (p && !confirm(`Confirmar pagamento de ${brl(x.amount)} para ${x.name} (${r.label})? O valor fica travado.`)) return;
        if (u && !confirm(`Reabrir a comissão de ${x.name}? O valor volta a ser calculado.`)) return;
        try { await api('/api/admin/commissions/pay', { method: 'POST', body: { month: r.month, user_id: x.id, undo: !!u } }); toast(p ? 'Pagamento registrado' : 'Comissão reaberta'); viewCommissions(r.month); } catch (err) { toast(err.message, 1); }
        return;
      }
      const tr = e.target.closest('[data-cm]'); if (tr) { const d = $(`[data-cmd="${tr.dataset.cm}"]`); d.hidden = !d.hidden; }
    };
  }

  /* ---------- ranking da equipe ---------- */
  async function smallPhoto(file, max = 640) {
    const c = canvasFrom(await loadImg(await readFile(file)), max);
    return c.toDataURL('image/jpeg', 0.88);
  }
  const face = (p, cls = '') => p.photo ? `<span class="avatar ph ${cls}"><img src="${esc(p.photo)}" alt=""></span>` : `<span class="avatar ${cls}">${esc((p.name || '?')[0])}</span>`;
  let RANK = null;
  async function viewRanking(month) {
    const r = RANK = await api('/api/admin/ranking' + (month ? '?month=' + month : ''));
    const now = r.month === r.months[0].key;
    const pod = [2, 1, 3].map((n) => r.rows.find((x) => x.pos === n)).filter(Boolean);
    const total = r.rows.reduce((a, x) => a + x.v, 0), qty = r.rows.reduce((a, x) => a + x.n, 0);
    const link = S.me.ref_code ? location.origin + '/?v=' + S.me.ref_code : '';
    const mine = r.rows.find((x) => x.id === S.me.id);
    $('#view').innerHTML = top('Vendas', 'Ranking da equipe', `<select class="input pill-input" id="rkMonth">${r.months.map((x) => `<option value="${x.key}" ${x.key === r.month ? 'selected' : ''}>${x.label}</option>`).join('')}</select>
        ${can('orders') ? `<button class="btn btn-gold btn-sm" id="rkSale">${UI.plus} Registrar venda na loja</button>` : ''}`) + `
      <div class="kpis rk-kpis"><div class="kpi"><span>Vendas da equipe</span><b>${qty}</b></div><div class="kpi"><span>Faturamento da equipe</span><b>${brl(total)}</b></div>
        <div class="kpi"><span>Critério do ranking</span><b style="font-size:18px">${r.metric === 'vendas' ? 'Nº de vendas' : 'Valor vendido'}</b></div>
        ${mine ? `<div class="kpi"><span>Sua posição</span><b>${mine.pos ? mine.pos + 'º' : '—'}</b></div>` : ''}</div>
      <div class="panel rk-adm">
        ${pod.length ? `<div class="rka-podium">${pod.map((p) => `<div class="rka rka-${p.pos}">${face(p, 'xl')}<span class="rka-pos">${p.pos}º</span><b>${esc(p.name)}</b><small>${p.n} venda(s) · ${brl(p.v)}</small></div>`).join('')}</div>`
          : `<div class="empty">Nenhuma venda confirmada em ${esc(r.label)}${now ? ' ainda. A primeira venda abre o pódio' : ''}.</div>`}
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Vendedor</th><th>Vendas</th><th>Faturamento</th><th>Ticket médio</th><th>Meta do mês</th></tr></thead><tbody>
        ${r.rows.map((x) => `<tr><td><b class="${x.pos === 1 ? 'gold' : ''}">${x.pos ? x.pos + 'º' : '—'}</b></td>
          <td><div class="t-prod">${face(x)}<div><b>${esc(x.name)}</b><small>${esc(x.title || '')}${x.active ? '' : ' · desligado'}</small></div></div></td>
          <td>${x.n}<br><small class="muted">${x.n_site} site · ${x.n_loja} loja</small></td><td><b>${brl(x.v)}</b></td><td>${x.n ? brl(x.ticket) : '—'}</td>
          <td>${x.goal ? `<div class="rk-goal"><i style="width:${Math.min(100, x.goal_pct)}%"></i></div><small class="muted">${x.goal_pct}% de ${brl(x.goal)}</small>` : '<span class="muted">—</span>'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Ninguém participa do ranking ainda. Em Equipe, marque “Participa do ranking” nos vendedores.</td></tr>'}
        </tbody></table></div>
        ${r.unassigned.n ? `<p class="hint" style="margin-top:12px">${r.unassigned.n} pedido(s) (${brl(r.unassigned.v)}) deste mês estão <b>sem vendedor</b>${['owner', 'manager'].includes(S.me.role) ? ' — abra o pedido em Pedidos e escolha quem vendeu' : ''}.</p>` : ''}
        <p class="hint">${esc(r.counted)}</p>
      </div>
      <div class="settings-grid">
        ${link ? `<div class="panel"><h3>Seu link de vendas</h3><p class="muted">Compartilhe no seu WhatsApp, Status e Instagram. Quem comprar pelo site depois de abrir esse link (até 30 dias) conta como venda sua.</p>
          <div class="ref-link"><code id="myLink">${esc(link)}</code><button class="btn btn-line btn-sm" id="cpLink">${IC.copy} Copiar</button></div>
          <button class="btn btn-line btn-sm" id="myProf">Editar minha foto, cargo e WhatsApp</button></div>` : ''}
        <div class="panel"><h3>Como cada venda é registrada</h3><ol class="rk-how">
          <li><b>Link do vendedor</b> — o cliente abre o link de vendas e compra pelo site.</li>
          <li><b>WhatsApp do vendedor</b> — o cliente escolhe o vendedor no “Fale com um consultor” do site e depois compra.</li>
          <li><b>No checkout</b> — o cliente marca “Quem te atendeu?”.</li>
          <li><b>Balcão da loja</b> — o vendedor registra a venda aqui (“Registrar venda na loja”). O estoque baixa na hora.</li>
          <li><b>Correção</b> — Dono e Gerente podem trocar o vendedor de qualquer pedido. Tudo fica no registro de segurança.</li></ol></div>
        ${can('settings') ? `<div class="panel"><h3>Ranking no site</h3>
          <label class="switch"><input type="checkbox" id="rkPub" ${S.settings.ranking_public !== false ? 'checked' : ''}><span></span>Mostrar o pódio do mês na página inicial</label>
          <div class="field"><label>Quem ganha o mês</label><select id="rkMetric" class="input"><option value="valor" ${S.settings.ranking_metric !== 'vendas' ? 'selected' : ''}>Quem vendeu mais em valor (R$)</option><option value="vendas" ${S.settings.ranking_metric === 'vendas' ? 'selected' : ''}>Quem fez mais vendas (quantidade)</option></select></div>
          <label class="switch"><input type="checkbox" id="rkVal" ${S.settings.ranking_show_values ? 'checked' : ''}><span></span>Mostrar os valores vendidos no site (não recomendado)</label>
          <div class="field"><label>Prêmio do mês (opcional, aparece no site)</label><input id="rkPrize" maxlength="120" value="${esc(S.settings.ranking_prize || '')}" placeholder="Ex.: folga extra + bônus de R$ 300"></div>
          <button class="btn btn-gold btn-sm" id="rkSave">Salvar</button></div>` : ''}
      </div>`;
    $('#rkMonth').addEventListener('change', (e) => viewRanking(e.target.value));
    $('#rkSale')?.addEventListener('click', saleForm);
    $('#cpLink')?.addEventListener('click', () => { navigator.clipboard.writeText(link).then(() => toast('Link copiado')).catch(() => toast(link)); });
    $('#myProf')?.addEventListener('click', myProfile);
    $('#rkSave')?.addEventListener('click', async () => {
      const body = { ranking_public: $('#rkPub').checked, ranking_metric: $('#rkMetric').value, ranking_show_values: $('#rkVal').checked, ranking_prize: $('#rkPrize').value.trim() };
      try { await api('/api/admin/settings', { method: 'PUT', body }); Object.assign(S.settings, body); toast('Ranking atualizado'); viewRanking(r.month); } catch (e) { toast(e.message, 1); }
    });
  }
  function myProfile() {
    let photo;
    const m = modal(mHead('Meu perfil de vendedor') + `<div class="m-body">
      <div class="photo-pick"><span class="avatar xl" id="mpPrev">${S.me.photo_shown ? `<img src="${esc(S.me.photo_shown)}" alt="">` : esc(S.me.name[0])}</span>
        <div><label class="btn btn-line btn-sm">Enviar foto<input type="file" accept="image/*" id="mpPh" hidden></label><p class="hint">Foto de rosto, bem iluminada. Aparece no pódio e no atendimento do site.</p></div></div>
      <div class="field"><label>Cargo exibido</label><input id="mpTitle" maxlength="50" value="${esc(S.me.title || '')}" placeholder="Ex.: Especialista Apple"></div>
      <div class="field"><label>WhatsApp de atendimento</label><input id="mpWa" inputmode="tel" value="${esc(S.me.whatsapp || '')}" placeholder="(65) 99999-9999"></div>
      <div class="field"><label>E-mail <small class="muted">(para recuperar a senha)</small></label><input id="mpMail" type="email" value="${esc(S.me.email || '')}" placeholder="nome@email.com"></div>
    </div><div class="m-foot"><button class="btn btn-line btn-sm" data-close>Cancelar</button><button class="btn btn-gold btn-sm" id="mpSave">Salvar</button></div>`, 'sm');
    $('#mpPh', m).addEventListener('change', async (e) => { const fl = e.target.files[0]; if (!fl) return; try { photo = await smallPhoto(fl); $('#mpPrev', m).innerHTML = `<img src="${photo}" alt="">`; } catch (err) { toast(err.message, 1); } });
    $('#mpSave', m).addEventListener('click', async () => {
      const body = { title: $('#mpTitle', m).value, whatsapp: $('#mpWa', m).value, email: $('#mpMail', m).value.trim() }; if (photo !== undefined) body.photo = photo;
      try { await api('/api/admin/me/profile', { method: 'PUT', body }); S.me = await api('/api/admin/me'); closeModal(); toast('Perfil atualizado'); viewRanking(); } catch (e) { toast(e.message, 1); }
    });
  }
  async function saleForm(pre = null) {
    if (pre && !(pre instanceof Object && 'product_id' in pre)) pre = null;
    const prods = (await api('/api/admin/products')).filter((p) => p.active && p.stock > 0);
    const price = (p) => p.promo_active ? p.promo_price : p.price;
    const cart = []; let pay = 'pix';
    const sellers = (RANK ? RANK.rows : []).filter((x) => x.active);
    const isSeller = S.me.role === 'seller';
    const m = modal(mHead('Registrar venda na loja') + `<div class="m-body">
      <div class="field"><label>Produto</label><input class="input" id="slQ" placeholder="Buscar por nome ou SKU…" autocomplete="off"><div class="sl-res" id="slRes"></div></div>
      <div id="slItems" class="sl-items"></div>
      <div class="field"><label>Forma de pagamento</label><div class="seg" id="slPay">${[['pix', 'Pix'], ['card', 'Crédito'], ['debit', 'Débito'], ['cash', 'Dinheiro']].map(([k, l]) => `<button type="button" data-p="${k}" class="${k === pay ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="row c2"><div class="field" id="slInstW" hidden><label>Parcelas</label><select class="input" id="slInst">${Array.from({ length: 12 }, (_, i) => `<option>${i + 1}</option>`).join('')}</select></div>
        <div class="field"><label>Desconto (R$)${pre && pre.deposit ? ' — inclui o sinal pago' : ''}</label><input class="input" id="slDisc" type="number" min="0" step="1" value="${pre ? pre.deposit || 0 : 0}"></div></div>
      <div class="field"><label>Cupom ou crédito de Troca Garantida (opcional)</label><input class="input" id="slCoupon" placeholder="Ex.: TROCA-3F9A2C" style="text-transform:uppercase"></div>
      <div class="row c2"><div class="field"><label>Cliente (opcional)</label><input class="input" id="slName" placeholder="Nome"></div><div class="field"><label>WhatsApp (opcional)</label><input class="input" id="slPhone" inputmode="tel"></div></div>
      <div class="field"><label>CPF (opcional, sai no recibo)</label><input class="input" id="slCpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00"></div>
      ${isSeller ? `<p class="hint">A venda será registrada no seu nome: <b>${esc(S.me.name)}</b>.</p>`
        : `<div class="field"><label>Vendedor</label><select class="input" id="slSeller">${sellers.map((x) => `<option value="${x.id}" ${x.id === S.me.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}${sellers.some((x) => x.id === S.me.id) ? '' : `<option value="${S.me.id}">${esc(S.me.name)} (eu)</option>`}</select></div>`}
      <div class="sum-row total"><span>Total</span><span id="slTotal">R$ 0,00</span></div>
    </div><div class="m-foot"><button class="btn btn-line btn-sm" data-close>Cancelar</button><button class="btn btn-gold btn-sm" id="slSave">Registrar venda</button></div>`);
    const draw = () => {
      $('#slItems', m).innerHTML = cart.length ? cart.map((c, i) => `<div class="sl-line"><div class="oi"><div style="flex:1"><b style="font-weight:500">${esc(c.p.name)}</b><br><small class="muted">${brl(price(c.p))} · estoque ${c.p.stock}</small></div>
        <div class="qty-mini"><button type="button" data-q="${i}" data-d="-1">−</button><span>${c.qty}</span><button type="button" data-q="${i}" data-d="1">+</button></div><span>${brl(price(c.p) * c.qty)}</span><button type="button" class="icon-btn" data-rm="${i}">${UI.trash}</button></div>
        <textarea class="input sl-imei" rows="${Math.min(3, c.qty)}" data-imei="${i}" placeholder="IMEI ou nº de série (opcional${c.qty > 1 ? ', um por linha' : ''}) — ativa a garantia">${esc(c.serials || '')}</textarea></div>`).join('')
        : '<p class="muted" style="margin:0;font-size:13px">Nenhum produto adicionado.</p>';
      const sub = cart.reduce((a, c) => a + price(c.p) * c.qty, 0);
      $('#slTotal', m).textContent = brl(Math.max(0, sub - (+$('#slDisc', m).value || 0)));
    };
    $('#slQ', m).addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      $('#slRes', m).innerHTML = q.length < 2 ? '' : prods.filter((p) => (p.name + ' ' + (p.sku || '')).toLowerCase().includes(q)).slice(0, 6)
        .map((p) => `<button type="button" data-add="${p.id}"><span>${esc(p.name)}</span><b>${brl(price(p))}</b></button>`).join('') || '<small class="muted">Nada encontrado (só aparecem produtos ativos com estoque).</small>';
    });
    m.addEventListener('click', (e) => {
      const a = e.target.closest('[data-add]'); if (a) { const p = prods.find((x) => x.id === +a.dataset.add); const c = cart.find((x) => x.p.id === p.id); if (c) c.qty = Math.min(p.stock, c.qty + 1); else cart.push({ p, qty: 1 }); $('#slQ', m).value = ''; $('#slRes', m).innerHTML = ''; draw(); return; }
      const q = e.target.closest('[data-q]'); if (q) { const c = cart[+q.dataset.q]; c.qty = Math.max(1, Math.min(c.p.stock, c.qty + +q.dataset.d)); draw(); return; }
      const r = e.target.closest('[data-rm]'); if (r) { cart.splice(+r.dataset.rm, 1); draw(); return; }
      const p = e.target.closest('[data-p]'); if (p) { pay = p.dataset.p; $$('#slPay button', m).forEach((b) => b.classList.toggle('on', b === p)); $('#slInstW', m).hidden = pay !== 'card'; }
    });
    $('#slDisc', m).addEventListener('input', draw);
    m.addEventListener('input', (e) => { const t = e.target.closest('[data-imei]'); if (t) cart[+t.dataset.imei].serials = t.value; });
    $('#slSave', m).addEventListener('click', async (e) => {
      if (!cart.length) return toast('Adicione pelo menos um produto.', 1);
      e.target.disabled = true;
      try {
        const r = await api('/api/admin/sales', { method: 'POST', body: { items: cart.map((c) => ({ id: c.p.id, qty: c.qty, serials: String(c.serials || '').split(/[\s,;]+/).filter(Boolean) })), payment: pay, installments: +$('#slInst', m).value,
          discount: +$('#slDisc', m).value || 0, coupon: $('#slCoupon', m).value.trim(), preorder_id: pre ? pre.id : undefined, customer: { name: $('#slName', m).value, phone: $('#slPhone', m).value, cpf: $('#slCpf', m).value }, seller_id: isSeller ? undefined : +$('#slSeller', m).value } });
        closeModal(); ORDERS = [];
        const o = { customer: { name: $('#slName', m).value, phone: $('#slPhone', m).value } };
        modal(mHead(`Venda <span class="serif gold">${esc(r.code)}</span> registrada`) + `<div class="m-body"><p style="margin:0">Total <b>${brl(r.total)}</b>. O estoque já foi atualizado.${r.coupon ? ` Cupom ${esc(r.coupon)} aplicado.` : ''}${r.trade ? ` <span class="gold">Troca Garantida ativada (${r.trade}).</span>` : ''}</p>
          ${r.warning ? `<p class="form-msg err" style="margin:0">${esc(r.warning)}</p>` : ''}
          <div class="war-act"><a class="btn btn-gold btn-sm" target="_blank" rel="noopener" href="/documento/${r.doc_token}">Abrir recibo e termo de garantia</a>
          <a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="${waDoc(o, r.doc_token)}">${UI.wa} Enviar no WhatsApp</a></div>
          <p class="hint" style="margin:0">O recibo abre pronto para imprimir ou “Salvar em PDF”.</p></div><div class="m-foot"><button class="btn btn-line btn-sm" data-close>Fechar</button></div>`, 'sm');
        if (location.hash.startsWith('#ranking')) viewRanking(); if (location.hash.startsWith('#prevenda')) viewPreorders(pre && pre.product_id);
      } catch (err) { toast(err.message, 1); e.target.disabled = false; }
    });
    if (pre) { const pp = prods.find((x) => x.id === pre.product_id); if (pp) cart.push({ p: pp, qty: 1 }); $('#slName', m).value = pre.name || ''; $('#slPhone', m).value = pre.phone || ''; }
    draw();
  }

  /* ---------- notificações no celular (app) ---------- */
  async function viewPush() {
    const st = await api('/api/admin/push/stats').catch(() => ({ n: 0, offers: 0 }));
    const log = await api('/api/admin/reminders/log').catch(() => []);
    const K = { aniversario: 'Aniversário', garantia: 'Garantia acabando', troca: '2 anos de iPhone', pelicula: 'Película' };
    $('#view').innerHTML = top('Relacionamento', 'Notificações no celular') + `
      <div class="kpis" style="grid-template-columns:repeat(2,1fr)"><div class="kpi"><span>Aparelhos com notificação ativa</span><b>${st.n || 0}</b></div><div class="kpi"><span>Aceitam ofertas</span><b>${st.offers || 0}</b></div></div>
      <div class="settings-grid"><div class="panel"><h3>Enviar oferta agora</h3>
        <div class="field"><label>Título</label><input id="nTitle" maxlength="80" placeholder="Ex.: iPhone 17 com 10% OFF só hoje"></div>
        <div class="field"><label>Mensagem</label><textarea id="nBody" rows="3" maxlength="220" placeholder="Ex.: Até meia-noite, no Pix. Toque para ver."></textarea></div>
        <div class="field"><label>Abrir qual página (opcional)</label><input id="nUrl" placeholder="/ofertas" value="/ofertas"></div>
        <div class="push-prev"><img src="/img/icon-192.png" alt=""><div><b id="pvT">Título</b><span id="pvB">Mensagem</span></div></div>
        <button class="btn btn-gold btn-sm" id="nSend">Enviar para ${st.offers || 0} aparelho(s)</button>
        <p class="hint" style="margin:0">Só recebe quem ativou as notificações no site ou no app. Use com moderação (1 a 2 por semana) para ninguém desativar. Os avisos de pedido saem sozinhos a cada mudança de status.</p></div>
      <div class="panel"><h3>Lembretes automáticos enviados</h3>
        ${log.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tipo</th><th>Quando</th></tr></thead><tbody>${log.slice(0, 40).map((r) => `<tr><td>${K[r.kind] || esc(r.kind)}</td><td>${fmtDate(r.sent_at)}</td></tr>`).join('')}</tbody></table></div>`
          : '<p class="muted" style="margin:0">Ainda nenhum. Os lembretes saem sozinhos: garantia acabando (30 dias antes), 2 anos de iPhone (avaliação para troca), película a cada 6 meses e presente de aniversário. Configure em Configurações → Clube Aladdin.</p>'}</div></div>`;
    const pv = () => { $('#pvT').textContent = $('#nTitle').value || 'Título'; $('#pvB').textContent = $('#nBody').value || 'Mensagem'; };
    $('#nTitle').addEventListener('input', pv); $('#nBody').addEventListener('input', pv);
    $('#nSend').addEventListener('click', async (e) => {
      if (!confirm('Enviar esta notificação para todos que aceitam ofertas?')) return;
      e.target.disabled = true;
      try { const r = await api('/api/admin/push/broadcast', { method: 'POST', body: { title: $('#nTitle').value, body: $('#nBody').value, url: $('#nUrl').value } }); toast(`Enviada para ${r.sent} aparelho(s)`); } catch (err) { toast(err.message, 1); }
      e.target.disabled = false;
    });
  }

  /* ---------- guias (blog) ---------- */
  async function viewPosts() {
    const list = await api('/api/admin/posts');
    $('#view').innerHTML = top('Conteúdo', 'Guias (blog)', `<a class="btn btn-gold btn-sm" href="#guias/novo">${UI.plus} Novo guia</a>`) + `
      <p class="hint" style="margin:-6px 0 16px">Guias trazem visitas do Google de quem está decidindo a compra. Cada guia aparece em /guias, entra no mapa do site e pode mostrar produtos da loja.</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Guia</th><th>Visitas</th><th>Atualizado</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map((p) => `<tr class="click" data-post="${p.id}"><td><b>${esc(p.title)}</b><br><small class="muted">/guias/${esc(p.slug)}</small></td><td>${p.views}</td><td>${fmtDate(p.updated_at)}</td>
        <td>${p.published ? '<span class="st-on">● Publicado</span>' : '<span class="muted">Rascunho</span>'}</td><td><div class="act"><a class="icon-btn" href="/guias/${esc(p.slug)}" target="_blank" rel="noopener" title="Ver no site">${IC.ext}</a><button class="icon-btn" data-pdel="${p.id}" title="Excluir">${UI.trash}</button></div></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nenhum guia ainda.</td></tr>'}
      </tbody></table></div>`;
    $('#view').onclick = async (e) => {
      const d = e.target.closest('[data-pdel]'); if (d) { e.stopPropagation(); if (!confirm('Excluir este guia?')) return; await api('/api/admin/posts/' + d.dataset.pdel, { method: 'DELETE' }); toast('Guia excluído'); return viewPosts(); }
      if (e.target.closest('a')) return;
      const tr = e.target.closest('[data-post]'); if (tr) location.hash = 'guias/' + tr.dataset.post;
    };
  }
  async function postEditor(arg) {
    const isNew = arg === 'novo';
    const P = isNew ? { title: '', slug: '', excerpt: '', body: '## Primeiro tópico\nEscreva aqui.\n\n- item de lista\n- outro item\n\n[produto:iphone-17-pro-max]', cover: '', published: 1 }
      : (await api('/api/admin/posts')).find((x) => x.id === +arg);
    if (!P) return viewPosts();
    $('#view').innerHTML = top('Guias', isNew ? 'Novo guia' : 'Editar guia', `<a class="btn btn-line btn-sm" href="#guias">Voltar</a><button class="btn btn-gold btn-sm" id="pSave">Salvar</button>`) + `
      <div class="post-ed"><div class="panel" style="display:grid;gap:14px">
        <div class="field"><label>Título</label><input id="pTitle" maxlength="140" value="${esc(P.title)}" placeholder="Ex.: Qual iPhone comprar em 2026?"></div>
        <div class="row c2"><div class="field"><label>Endereço (opcional)</label><input id="pSlug" maxlength="80" value="${esc(P.slug)}" placeholder="gerado pelo título"></div>
          <div class="field"><label>&nbsp;</label><label class="switch"><input type="checkbox" id="pPub" ${P.published ? 'checked' : ''}><span></span>Publicado</label></div></div>
        <div class="field"><label>Resumo (aparece no Google e nas prévias)</label><textarea id="pExc" rows="2" maxlength="300">${esc(P.excerpt)}</textarea></div>
        <div class="field"><label>Capa (opcional)</label><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span id="pCoverPrev">${P.cover ? `<img src="${esc(P.cover)}" alt="" style="height:60px;border-radius:10px">` : ''}</span>
          <label class="btn btn-line btn-sm">Enviar imagem<input type="file" accept="image/*" id="pCoverIn" hidden></label>${P.cover ? '<button type="button" class="btn-ghost" id="pCoverDel">Remover</button>' : ''}</div></div>
        <div class="field"><label>Texto</label><textarea id="pBody" rows="20" style="font-family:ui-monospace,Consolas,monospace;font-size:13px;line-height:1.6">${esc(P.body)}</textarea></div>
        <p class="hint" style="margin:0">Formatação: <code>## Título</code> · <code>### Subtítulo</code> · <code>- item</code> · <code>1. item</code> · <code>**negrito**</code> · <code>[texto](/link)</code> · <code>&gt; destaque</code> · <code>[produto:endereco-do-produto]</code> mostra o card do produto.</p>
      </div><div class="panel"><span class="cg-label">Pré-visualização</span><div class="post-prev" id="pPrev"></div></div></div>`;
    let cover = P.cover;
    const prev = async () => { try { const r = await api('/api/admin/posts/preview', { method: 'POST', body: { body: $('#pBody').value } }); $('#pPrev').innerHTML = `<h1>${esc($('#pTitle').value)}</h1>` + r.html.replace(/<div class="post-prod" data-prod="([^"]+)"><\/div>/g, '<div class="prev-prod">[card do produto: $1]</div>'); } catch {} };
    let t; $('#pBody').addEventListener('input', () => { clearTimeout(t); t = setTimeout(prev, 350); }); $('#pTitle').addEventListener('input', () => { clearTimeout(t); t = setTimeout(prev, 350); });
    $('#pCoverIn').addEventListener('change', async (e) => { const fl = e.target.files[0]; if (!fl) return; try { const data = await smallPhoto(fl, 1600); const r = await api('/api/admin/upload', { method: 'POST', body: { data, folder: 'loja' } }); cover = r.url; $('#pCoverPrev').innerHTML = `<img src="${esc(cover)}" alt="" style="height:60px;border-radius:10px">`; } catch (err) { toast(err.message, 1); } });
    $('#pCoverDel')?.addEventListener('click', () => { cover = ''; $('#pCoverPrev').innerHTML = ''; });
    $('#pSave').addEventListener('click', async () => {
      const body = { title: $('#pTitle').value, slug: $('#pSlug').value, excerpt: $('#pExc').value, body: $('#pBody').value, cover, published: $('#pPub').checked };
      try { const r = await api('/api/admin/posts' + (isNew ? '' : '/' + P.id), { method: isNew ? 'POST' : 'PUT', body }); toast('Guia salvo'); location.hash = 'guias/' + (isNew ? r.id : P.id); if (!isNew) postEditor(P.id); } catch (e) { toast(e.message, 1); }
    });
    prev();
  }

  /* ---------- financeiro (só o Dono) ---------- */
  async function viewFinance(days = 30) {
    const r = await api('/api/admin/finance?days=' + days);
    const pc = (n) => (n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
    $('#view').innerHTML = top('Somente o Dono', 'Financeiro', `<div class="seg" id="fnD">${[[7, '7 dias'], [30, '30 dias'], [90, '90 dias'], [365, '12 meses']].map(([d, l]) => `<button data-fd="${d}" class="${d === days ? 'on' : ''}">${l}</button>`).join('')}</div>`) + `
      <div class="kpis"><div class="kpi"><span>Faturamento (produtos)</span><b>${brl(r.revenue)}</b></div><div class="kpi"><span>Custo dos produtos</span><b>${brl(r.cost)}</b></div>
        <div class="kpi"><span>Lucro bruto</span><b class="gold">${brl(r.profit)}</b></div><div class="kpi"><span>Margem</span><b>${pc(r.margin)}</b></div></div>
      <div class="kpis"><div class="kpi"><span>Vendas pagas</span><b>${r.orders}</b></div><div class="kpi"><span>Ticket médio</span><b>${brl(r.ticket)}</b></div>
        <div class="kpi"><span>Site · Balcão · Marketplaces</span><b style="font-size:16px">${brl(r.channels.site.v)} · ${brl(r.channels.loja.v)} · ${brl(r.channels.marketplace.v)}</b></div>
        <div class="kpi"><span>Estoque (custo · venda)</span><b style="font-size:16px">${brl(r.stock.stock_value.cost)} · ${brl(r.stock.stock_value.price)}</b></div></div>
      ${r.missing_cost.length ? `<p class="form-msg err" style="margin:0 0 14px">Sem custo cadastrado (o lucro desses itens aparece maior do que é): ${r.missing_cost.map(esc).join(', ')}. Preencha “Custo” no cadastro do produto.</p>` : ''}
      <div class="panel" style="margin-bottom:16px"><h3>Lucro por produto</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Produto</th><th>Vendidos</th><th>Faturamento</th><th>Custo</th><th>Lucro</th><th>Margem</th></tr></thead><tbody>
        ${r.products.map((p) => `<tr><td>${esc(p.name)}${p.no_cost ? ' <small class="gold">· sem custo</small>' : ''}</td><td>${p.units}</td><td>${brl(p.revenue)}</td><td>${brl(p.cost)}</td><td><b class="${p.profit < 0 ? '' : 'gold'}" style="${p.profit < 0 ? 'color:var(--err)' : ''}">${brl(p.profit)}</b></td><td>${pc(p.margin)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhuma venda paga no período.</td></tr>'}
      </tbody></table></div><p class="hint">Lucro bruto = valor pago pelos produtos (já com cupons, Pix e cashback) − custo do produto na data da venda (ou da unidade/IMEI, quando controlado). Frete não entra.</p></div>
      <div class="settings-grid">
        <div class="panel"><h3>Mais vendidos (30 dias)</h3>${r.stock.top.map((x) => `<div class="fin-row"><span>${esc(x.name)}</span><b>${x.units30} un.</b><small class="muted">estoque ${x.stock}</small></div>`).join('') || '<p class="muted">Sem vendas nos últimos 30 dias.</p>'}</div>
        <div class="panel"><h3>Sugestão de compra</h3>${r.stock.buy.map((x) => `<div class="fin-row"><span>${esc(x.name)}<small class="muted"> · vende ${x.per_week}/semana · acaba em ${x.days_left} dia(s)</small></span><b class="gold">comprar ${x.suggest}</b>${x.cost_est ? `<small class="muted">≈ ${brl(x.cost_est)}</small>` : ''}</div>`).join('') || '<p class="muted">Nenhum produto acabando nos próximos 15 dias.</p>'}<p class="hint">Calculado pelo ritmo de vendas dos últimos 30 dias, para cobrir mais 30 dias.</p></div>
        <div class="panel" style="grid-column:1/-1"><h3>Parados há mais de 60 dias</h3>${r.stock.stale.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Produto</th><th>Estoque</th><th>Última venda</th><th>Dinheiro parado (custo)</th></tr></thead><tbody>${r.stock.stale.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.stock}</td><td>${x.last_sale ? fmtDate(x.last_sale) : 'nunca vendeu'}</td><td>${brl(x.tied)}</td></tr>`).join('')}</tbody></table></div><p class="hint">Ideias: promoção relâmpago, combo com um item que gira, ou anunciar no Mercado Livre/Shopee.</p>` : '<p class="muted">Nenhum produto parado. 👏</p>'}</div>
      </div>`;
    $('#fnD').addEventListener('click', (e) => { const b = e.target.closest('[data-fd]'); if (b) viewFinance(+b.dataset.fd); });
  }

  /* ---------- estoque por unidade (IMEI) ---------- */
  async function unitsModal(P) {
    const draw = async () => {
      const list = await api('/api/admin/units?product_id=' + P.id);
      const ST = { disponivel: ['Disponível', 'st-on'], reservado: ['Reservado', 'gold'], vendido: ['Vendido', 'muted'], baixa: ['Baixa', 'muted'] };
      $('#unBody').innerHTML = `<div class="kpis" style="grid-template-columns:repeat(3,1fr);margin:0"><div class="kpi"><span>Disponíveis</span><b>${list.filter((u) => u.status === 'disponivel').length}</b></div><div class="kpi"><span>Reservados</span><b>${list.filter((u) => u.status === 'reservado').length}</b></div><div class="kpi"><span>Vendidos</span><b>${list.filter((u) => u.status === 'vendido').length}</b></div></div>
        <div class="tbl-wrap" style="max-height:34vh;overflow:auto"><table class="tbl"><thead><tr><th>IMEI / série</th><th>Entrada</th><th>Custo</th><th>Status</th><th></th></tr></thead><tbody>${list.map((u) => `<tr><td><b style="font-family:ui-monospace,Consolas,monospace;font-weight:500">${esc(u.serial)}</b><br><small class="muted">${esc(u.origin)}${u.supplier ? ' · ' + esc(u.supplier) : ''}</small></td><td>${fmtDate(u.entry_date)}</td><td>${u.cost ? brl(u.cost) : '—'}</td>
          <td><span class="${ST[u.status][1]}">● ${ST[u.status][0]}</span>${u.order_code ? `<br><small class="muted">${esc(u.order_code)}</small>` : ''}</td><td>${u.status === 'disponivel' ? `<button class="btn-ghost" data-woff="${u.id}" style="font-size:12px">Dar baixa</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nenhuma unidade cadastrada.</td></tr>'}</tbody></table></div>`;
    };
    const m = modal(mHead('Unidades (IMEI) — ' + esc(P.name)) + `<div class="m-body"><div id="unBody"></div>
      <span class="cg-label">Entrada de mercadoria</span>
      <div class="field"><label>IMEI(s) ou nº de série (um por linha — dá para colar de uma planilha ou usar leitor de código de barras)</label><textarea class="input" id="unSer" rows="3" style="font-family:ui-monospace,Consolas,monospace"></textarea></div>
      <div class="row c3"><div class="field"><label>Custo por unidade (R$)</label><input class="input" id="unCost" type="number" min="0" step="10" value="${P.cost || ''}"></div>
        <div class="field"><label>Origem</label><select class="input" id="unOrig"><option value="compra">Compra de fornecedor</option><option value="troca">Recebido em troca</option><option value="consignado">Consignado</option><option value="outro">Outro</option></select></div>
        <div class="field"><label>Fornecedor / nota</label><input class="input" id="unSup" maxlength="80"></div></div>
    </div><div class="m-foot"><button class="btn btn-line btn-sm" data-close>Fechar</button><button class="btn btn-gold btn-sm" id="unAdd">Dar entrada</button></div>`);
    m.addEventListener('click', async (e) => { const w = e.target.closest('[data-woff]'); if (!w) return; const n = prompt('Motivo da baixa (perda, defeito, devolução ao fornecedor…):'); if (!n) return;
      try { await api(`/api/admin/units/${w.dataset.woff}/writeoff`, { method: 'POST', body: { notes: n } }); toast('Baixa registrada'); draw(); } catch (err) { toast(err.message, 1); } });
    $('#unAdd', m).addEventListener('click', async () => {
      try { const r = await api('/api/admin/units', { method: 'POST', body: { product_id: P.id, serials: $('#unSer', m).value, cost: +$('#unCost', m).value || 0, origin: $('#unOrig', m).value, supplier: $('#unSup', m).value } });
        toast(`${r.added} unidade(s) adicionada(s)${r.stock !== null ? ' · estoque ' + r.stock : ''}`); $('#unSer', m).value = ''; if (r.stock !== null && $('#fStock')) $('#fStock').value = r.stock; draw(); } catch (err) { toast(err.message, 1); }
    });
    draw();
  }
  async function viewStockUnits() {
    $('#view').innerHTML = top('Estoque', 'Estoque por unidade (IMEI)') + `
      <p class="hint" style="margin:-6px 0 14px">Nos produtos controlados por unidade, cada aparelho tem seu IMEI desde a entrada: o estoque é a contagem das unidades disponíveis, o mesmo aparelho nunca é vendido duas vezes e o custo real de cada unidade entra no lucro. Ative em Produtos → “Controlar por unidade (IMEI)”.</p>
      <div class="panel"><div class="field" style="max-width:420px"><label>Procurar um IMEI ou nº de série</label><input class="input" id="snQ" placeholder="Digite pelo menos 4 dígitos" style="font-family:ui-monospace,Consolas,monospace"></div><div id="snRes"></div></div>`;
    let t; $('#snQ').addEventListener('input', (e) => { clearTimeout(t); const q = e.target.value.trim(); if (q.length < 4) { $('#snRes').innerHTML = ''; return; }
      t = setTimeout(async () => { const r = await api('/api/admin/units?q=' + encodeURIComponent(q));
        $('#snRes').innerHTML = r.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>IMEI / série</th><th>Produto</th><th>Status</th><th>Entrada</th><th>Custo</th></tr></thead><tbody>${r.map((u) => `<tr><td><b style="font-family:ui-monospace,Consolas,monospace;font-weight:500">${esc(u.serial)}</b></td><td>${esc(u.product)}</td><td>${esc(u.status)}${u.order_code ? ' · ' + esc(u.order_code) : ''}</td><td>${fmtDate(u.entry_date)}${u.supplier ? '<br><small class="muted">' + esc(u.supplier) + '</small>' : ''}</td><td>${u.cost ? brl(u.cost) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nenhuma unidade com esse número.</p>'; }, 300); });
  }

  /* ---------- laudo técnico ---------- */
  async function laudoForm(P) {
    const groups = await api('/api/admin/inspections/checklist');
    const m = modal(mHead('Laudo técnico — ' + esc(P.name)) + `<div class="m-body">
      <div class="row c3"><div class="field"><label>Modelo</label><input class="input" id="lzModel" value="${esc(P.name)}"></div>
        <div class="field"><label>IMEI / nº de série</label><input class="input" id="lzSerial" maxlength="20"></div>
        <div class="field"><label>Estado</label><select class="input" id="lzGrade"><option value="">—</option>${['A', 'B', 'C'].map((g) => `<option ${P.grade === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div></div>
      <div class="row c2"><div class="field"><label>Saúde da bateria (%)</label><input class="input" id="lzBat" type="number" min="0" max="100" value="${P.battery_health || ''}"></div>
        <div class="field"><label>Ciclos de bateria (iPhone 15+: Ajustes › Geral › Sobre)</label><input class="input" id="lzCyc" type="number" min="0"></div></div>
      <div class="lz-list">${groups.map(([g, items]) => `<span class="cg-label">${esc(g)}</span>${items.map(([k, l]) => `<div class="lz-row"><span>${esc(l)}</span><div class="seg" data-lz="${k}"><button type="button" data-v="ok" class="on">OK</button><button type="button" data-v="falha">Falha</button><button type="button" data-v="na">N/A</button></div></div>`).join('')}`).join('')}</div>
      <div class="field"><label>Observações (aparece no laudo)</label><textarea class="input" id="lzNotes" rows="2" maxlength="600"></textarea></div>
    </div><div class="m-foot"><button class="btn btn-line btn-sm" data-close>Cancelar</button><button class="btn btn-gold btn-sm" id="lzSave">Emitir laudo</button></div>`);
    m.addEventListener('click', (e) => { const b = e.target.closest('[data-lz] [data-v]'); if (!b) return; $$('button', b.parentElement).forEach((x) => x.classList.toggle('on', x === b)); });
    $('#lzSave', m).addEventListener('click', async () => {
      const results = {}; $$('[data-lz]', m).forEach((g) => { results[g.dataset.lz] = $('.on', g).dataset.v; });
      try {
        const r = await api('/api/admin/inspections', { method: 'POST', body: { product_id: P.id, model: $('#lzModel', m).value, serial: $('#lzSerial', m).value, grade: $('#lzGrade', m).value,
          battery_health: $('#lzBat', m).value, cycles: $('#lzCyc', m).value, notes: $('#lzNotes', m).value, results } });
        closeModal(); modal(mHead('Laudo emitido') + `<div class="m-body"><p style="margin:0">O laudo já aparece na página do produto (“Ver laudo técnico”).</p><div class="war-act"><a class="btn btn-gold btn-sm" target="_blank" rel="noopener" href="/laudo/${r.token}">Abrir laudo (imprimir / PDF)</a></div></div><div class="m-foot"><button class="btn btn-line btn-sm" data-close>Fechar</button></div>`, 'sm');
      } catch (e) { toast(e.message, 1); }
    });
  }

  /* ---------- assistência técnica ---------- */
  let OS_LIST = [], osFilter = 'abertas';
  async function viewServiceOrders() {
    OS_LIST = await api('/api/admin/service');
    const ST = { recebido: 'Recebido', em_analise: 'Em análise', orcamento: 'Orçamento enviado', em_reparo: 'Em reparo', pronto: 'Pronto', entregue: 'Entregue', cancelado: 'Cancelado' };
    const open = (o) => !['entregue', 'cancelado'].includes(o.status);
    $('#view').innerHTML = top('Serviços', 'Assistência técnica', `<input class="input pill-input" id="osQ" placeholder="OS, cliente, aparelho…"><button class="btn btn-gold btn-sm" id="osNew">${UI.plus} Nova OS</button>`) + `
      <div class="kpis"><div class="kpi"><span>Em aberto</span><b>${OS_LIST.filter(open).length}</b></div><div class="kpi"><span>Aguardando aprovação</span><b>${OS_LIST.filter((o) => o.budget_status === 'aguardando').length}</b></div>
        <div class="kpi"><span>Prontos p/ retirar</span><b>${OS_LIST.filter((o) => o.status === 'pronto').length}</b></div><div class="kpi"><span>Entregues no mês</span><b>${OS_LIST.filter((o) => o.status === 'entregue' && (o.delivered_at || '').slice(0, 7) === new Date().toISOString().slice(0, 7)).length}</b></div></div>
      <div class="seg" style="margin-bottom:14px" id="osF">${[['abertas', 'Em aberto'], ['todas', 'Todas'], ['entregue', 'Entregues'], ['cancelado', 'Canceladas']].map(([k, l]) => `<button data-osf="${k}" class="${osFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="osBody"></div>`;
    const draw = () => {
      const q = $('#osQ').value.toLowerCase();
      const rows = OS_LIST.filter((o) => (osFilter === 'todas' || (osFilter === 'abertas' ? open(o) : o.status === osFilter)) && (!q || (o.code + o.name + o.device + o.phone).toLowerCase().includes(q)));
      $('#osBody').innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>OS</th><th>Cliente</th><th>Aparelho</th><th>Orçamento</th><th>Status</th></tr></thead><tbody>${rows.map((o) => `<tr class="click" data-os="${o.id}">
        <td><b>${esc(o.code)}</b><br><small class="muted">${fmtDate(o.created_at)}</small></td><td>${esc(o.name)}<br><small class="muted">${esc(o.phone)}</small></td><td>${esc(o.device)}<br><small class="muted">${esc(o.problem.slice(0, 50))}</small></td>
        <td>${o.budget ? brl(o.budget) : '—'}${o.budget_status ? `<br><small class="${o.budget_status === 'aprovado' ? 'st-on' : o.budget_status === 'recusado' ? 'muted' : 'gold'}">${o.budget_status}</small>` : ''}</td><td>${ST[o.status]}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty">Nenhuma ordem de serviço neste filtro.</div>';
    };
    $('#osQ').addEventListener('input', draw);
    $('#osNew').addEventListener('click', () => osNewForm());
    $('#view').onclick = (e) => { const fl = e.target.closest('[data-osf]'); if (fl) { osFilter = fl.dataset.osf; viewServiceOrders(); return; } const tr = e.target.closest('[data-os]'); if (tr) osDetail(OS_LIST.find((x) => x.id === +tr.dataset.os)); };
    draw();
  }
  function osNewForm() {
    const m = modal(mHead('Nova ordem de serviço') + `<form class="m-body" id="osNf">
      <div class="row c2"><div class="field"><label>Cliente *</label><input name="name" required maxlength="80"></div><div class="field"><label>WhatsApp *</label><input name="phone" required inputmode="tel" maxlength="20"></div></div>
      <div class="row c2"><div class="field"><label>Aparelho *</label><input name="device" required maxlength="80" placeholder="Ex.: iPhone 13 Pro 128 GB"></div><div class="field"><label>IMEI / série</label><input name="serial" maxlength="20"></div></div>
      <div class="field"><label>Defeito relatado *</label><textarea name="problem" rows="2" required maxlength="800" placeholder="Ex.: tela trincada, toque falhando no canto"></textarea></div>
      <div class="row c2"><div class="field"><label>Acessórios deixados</label><input name="accessories" maxlength="200" placeholder="Ex.: capa, chip"></div><div class="field"><label>Previsão</label><input name="eta" maxlength="60" placeholder="Ex.: 2 dias úteis"></div></div>
      <div class="field"><label>Estado na entrada (riscos, marcas)</label><input name="condition_notes" maxlength="400"></div>
      <div class="field"><label>E-mail (opcional)</label><input name="email" type="email" maxlength="120"></div>
      <p class="hint" style="margin:0">Nunca peça para anotar a senha do aparelho. O cliente acompanha pelo site com o nº da OS e os 4 últimos dígitos do WhatsApp.</p>
    </form><div class="m-foot"><button class="btn btn-line btn-sm" data-close>Cancelar</button><button class="btn btn-gold btn-sm" id="osCreate">Abrir OS e imprimir comprovante</button></div>`);
    $('#osCreate', m).addEventListener('click', async () => {
      const fm = $('#osNf', m); if (!fm.reportValidity()) return;
      try { const r = await api('/api/admin/service', { method: 'POST', body: Object.fromEntries(new FormData(fm)) }); closeModal(); window.open('/os/' + r.os.token, '_blank', 'noopener'); toast('OS ' + r.os.code + ' aberta'); viewServiceOrders(); } catch (e) { toast(e.message, 1); }
    });
  }
  function osDetail(o) {
    const ST = [['recebido', 'Recebido'], ['em_analise', 'Em análise'], ['orcamento', 'Orçamento enviado'], ['em_reparo', 'Em reparo'], ['pronto', 'Pronto para retirada'], ['entregue', 'Entregue'], ['cancelado', 'Cancelado']];
    const m = modal(mHead(`OS <span class="serif gold">${esc(o.code)}</span>`) + `<div class="m-body">
      <div class="kv"><span>Cliente</span><span>${esc(o.name)} · ${esc(o.phone)}</span><span>Aparelho</span><span>${esc(o.device)}${o.serial ? ' · ' + esc(o.serial) : ''}</span><span>Defeito</span><span>${esc(o.problem)}</span>
        ${o.accessories ? `<span>Acessórios</span><span>${esc(o.accessories)}</span>` : ''}${o.condition_notes ? `<span>Estado</span><span>${esc(o.condition_notes)}</span>` : ''}</div>
      <div class="row c2"><div class="field"><label>Status</label><select class="input" id="osSt">${ST.map(([k, l]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Orçamento (R$)</label><input class="input" id="osBud" type="number" min="0" step="10" value="${o.budget || ''}"></div></div>
      <div class="field"><label>O que será feito (aparece para o cliente junto do orçamento)</label><input class="input" id="osBn" maxlength="600" value="${esc(o.budget_notes || '')}" placeholder="Ex.: troca do display original + película"></div>
      <div class="row c3"><div class="field"><label>Técnico</label><input class="input" id="osTec" value="${esc(o.technician || S.me.name)}"></div><div class="field"><label>Previsão</label><input class="input" id="osEta" value="${esc(o.eta || '')}"></div>
        <div class="field"><label>Garantia (dias)</label><input class="input" id="osWar" type="number" min="0" value="${o.warranty_days ?? 90}"></div></div>
      <div class="field"><label>Anotação no histórico (opcional)</label><input class="input" id="osNote" maxlength="300"></div>
      <label class="switch" style="font-size:13px"><input type="checkbox" id="osNotify" checked><span></span>Avisar o cliente (e-mail${S.settings && S.settings.wa_auto ? ' e WhatsApp' : ''}) quando mudar o status</label>
      <div class="os-hist-adm">${o.history.slice().reverse().map((h) => `<div><b>${esc((ST.find((x) => x[0] === h.status) || [0, h.status])[1])}</b> <small class="muted">${new Date(h.at).toLocaleString('pt-BR')}${h.by ? ' · ' + esc(h.by) : ''}</small>${h.note ? `<br><small>${esc(h.note)}</small>` : ''}</div>`).join('')}</div>
    </div><div class="m-foot"><a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="/os/${o.token}">Comprovante</a><a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="/assistencia/${o.token}">Página do cliente</a><button class="btn btn-gold btn-sm" id="osSave">Salvar</button></div>`);
    $('#osSave', m).addEventListener('click', async () => {
      try {
        const r = await api('/api/admin/service/' + o.id, { method: 'PUT', body: { status: $('#osSt', m).value, budget: +$('#osBud', m).value || 0, budget_notes: $('#osBn', m).value, technician: $('#osTec', m).value, eta: $('#osEta', m).value, warranty_days: +$('#osWar', m).value, note: $('#osNote', m).value, notify: $('#osNotify', m).checked } });
        closeModal(); viewServiceOrders();
        if (r.message && !r.wa_auto && o.phone) { const ph = o.phone.length <= 11 ? '55' + o.phone : o.phone; modal(mHead('Avisar no WhatsApp') + `<div class="m-body"><p style="margin:0">${esc(r.message)}</p></div><div class="m-foot"><button class="btn btn-line btn-sm" data-close>Agora não</button><a class="btn btn-gold btn-sm" target="_blank" rel="noopener" href="https://wa.me/${ph}?text=${encodeURIComponent(r.message)}">${UI.wa} Enviar</a></div>`, 'sm'); }
        else toast('OS atualizada');
      } catch (e) { toast(e.message, 1); }
    });
  }

  /* ---------- pré-venda ---------- */
  async function viewPreorders(openId) {
    const list = await api('/api/admin/preorders');
    $('#view').innerHTML = top('Lançamentos', 'Pré-venda', `<a class="btn btn-gold btn-sm" href="#produtos/novo">${UI.plus} Anunciar lançamento</a>`) + `
      <p class="hint" style="margin:-6px 0 16px">No cadastro do produto, ligue “Em breve / pré-venda”. O site mostra “Me avise quando chegar” e, se houver sinal, “Eu quero!”. A fila é por ordem de pagamento do sinal.</p>
      ${list.length ? `<div class="pv-grid">${list.map((p) => `<div class="panel pv-card ${p.coming_soon ? 'soon' : ''}" data-pv="${p.id}"><div class="t-prod"><div class="t-thumb">${thumb({ image: p.images[0], category_icon: 'iphone' })}</div><div><b>${esc(p.name)}</b><small>${p.coming_soon ? esc(p.coming_eta || 'em breve') : 'já liberado'} · sinal ${p.preorder_deposit ? brl(p.preorder_deposit) : '—'}</small></div></div>
          <div class="pv-kpis"><div><b>${p.paid}</b><span>sinais pagos</span></div><div><b>${p.interested}</b><span>esperando aviso</span></div><div><b>${p.units || '—'}</b><span>no 1º lote</span></div></div></div>`).join('')}</div>`
        : '<div class="empty">Nenhum lançamento em pré-venda. Abra um produto e ligue “Em breve / pré-venda”.</div>'}
      <div id="pvQueue"></div>`;
    const openQ = async (id) => {
      const p = list.find((x) => x.id === id); if (!p) return;
      $$('.pv-card').forEach((c) => c.classList.toggle('on', +c.dataset.pv === id));
      const q = await api('/api/admin/preorders/' + id);
      const ST = { aguardando: 'aguardando pagamento', pago: 'sinal pago', avisado: 'avisado', convertido: 'comprou', cancelado: 'cancelado' };
      $('#pvQueue').innerHTML = `<div class="panel" style="margin-top:16px"><div class="ao-head" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><h3 style="margin:0">Fila — ${esc(p.name)}</h3>
          ${p.coming_soon ? `<div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap"><div class="field" style="margin:0"><label>Chegaram (unid.)</label><input class="input" id="pvStock" type="number" min="1" value="${p.units || 1}" style="width:110px"></div>
            <div class="field" style="margin:0"><label>Preço de venda</label><input class="input" id="pvPrice" type="number" min="0" step="1" value="${p.price || ''}" style="width:140px"></div><button class="btn btn-gold btn-sm" id="pvRelease">Chegou! Liberar e avisar a fila</button></div>` : ''}</div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fila</th><th>Cliente</th><th>Opções</th><th>Tipo</th><th>Status</th><th></th></tr></thead><tbody>
        ${q.map((r) => `<tr><td><b class="${r.pos === 1 ? 'gold' : ''}">${r.pos ? r.pos + 'º' : '—'}</b></td><td>${esc(r.name)}<br><small class="muted">${esc(r.phone)}${r.email ? ' · ' + esc(r.email) : ''}</small></td>
          <td><small>${esc(Object.values(r.options || {}).join(' · ')) || '—'}</small></td><td>${r.type === 'sinal' ? `Sinal ${brl(r.deposit)}<br><small class="muted">${esc(r.order_code)}</small>` : 'Aviso'}</td>
          <td>${ST[r.status]}${r.paid_at ? `<br><small class="muted">${fmtDate(r.paid_at)}</small>` : ''}</td>
          <td><div class="act">${r.phone ? `<a class="icon-btn" title="WhatsApp" target="_blank" rel="noopener" href="https://wa.me/${r.phone.length <= 11 ? '55' + r.phone : r.phone}">${UI.wa}</a>` : ''}
            ${r.status === 'pago' && !p.coming_soon ? `<button class="btn btn-gold btn-sm" data-conv="${r.id}">Vender (desconta o sinal)</button>` : ''}
            ${['aguardando', 'pago'].includes(r.status) ? `<button class="btn-ghost" data-cancel="${r.id}" title="${r.status === 'pago' ? 'Cancelar e devolver o sinal' : 'Cancelar'}">Cancelar</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Ninguém na fila ainda.</td></tr>'}
        </tbody></table></div><p class="hint">Ao cancelar um sinal pago, faça o estorno no Mercado Pago ou devolva o Pix ao cliente.</p></div>`;
      $('#pvRelease')?.addEventListener('click', async () => {
        if (!confirm('Liberar o produto para venda e avisar toda a fila agora?')) return;
        try {
          const r = await api(`/api/admin/preorders/${id}/release`, { method: 'POST', body: { stock: +$('#pvStock').value, price: +$('#pvPrice').value } });
          modal(mHead('Fila avisada') + `<div class="m-body"><p style="margin:0">${r.paid} cliente(s) com sinal e ${r.notified} interessado(s) avisados por e-mail${r.contact.some((c) => c.auto) ? ' e WhatsApp' : ''}.</p>
            ${r.contact.filter((c) => !c.auto && c.phone).length ? `<p class="hint" style="margin:0">Toque para mandar no WhatsApp (mensagem pronta):</p><div class="pv-contact">${r.contact.filter((c) => !c.auto && c.phone).map((c) => `<a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://wa.me/${c.phone.length <= 11 ? '55' + c.phone : c.phone}?text=${encodeURIComponent(c.text)}">${UI.wa} ${c.pos ? c.pos + 'º · ' : ''}${esc(c.name)}</a>`).join('')}</div>` : ''}
            </div><div class="m-foot"><button class="btn btn-gold btn-sm" data-close>Fechar</button></div>`);
          viewPreorders(id);
        } catch (e) { toast(e.message, 1); }
      });
      $('#pvQueue').onclick = async (e) => {
        const c = e.target.closest('[data-cancel]'), v = e.target.closest('[data-conv]');
        if (c) { if (!confirm('Cancelar este registro da fila?')) return; try { await api('/api/admin/preorders/item/' + c.dataset.cancel, { method: 'POST', body: { status: 'cancelado' } }); openQ(id); } catch (err) { toast(err.message, 1); } }
        if (v) { const r = q.find((x) => x.id === +v.dataset.conv); saleForm({ id: r.id, product_id: id, deposit: r.deposit, name: r.name, phone: r.phone }); }
      };
    };
    $('#view').onclick = (e) => { const c = e.target.closest('[data-pv]'); if (c) openQ(+c.dataset.pv); };
    if (openId || list.length) openQ(openId || list[0].id);
  }

  /* ---------- troca garantida ---------- */
  async function viewTradePlans(phase = '') {
    const list = await api('/api/admin/trade-plans' + (phase ? '?phase=' + phase : ''));
    const PH = { aguardando: 'Aguardando', liberado: 'Liberada', resgatado: 'Usada', expirado: 'Vencida', cancelado: 'Cancelada' };
    $('#view').innerHTML = top('Fidelização', 'Troca Garantida', `<input class="input pill-input" id="tgQ" placeholder="Nome, WhatsApp, certificado, pedido…">`) + `
      <div class="seg" style="margin-bottom:16px" id="tgF">${[['', 'Todas'], ['liberado', 'Liberadas para troca'], ['aguardando', 'Aguardando'], ['resgatado', 'Usadas'], ['expirado', 'Vencidas']].map(([k, l]) => `<button data-ph="${k}" class="${phase === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="tgBody"></div>`;
    const draw = () => {
      const q = $('#tgQ').value.toLowerCase().replace(/\s/g, '');
      const rows = list.filter((t) => !q || (t.code + t.order_code + t.customer_name + t.phone + t.product_name).toLowerCase().replace(/\s/g, '').includes(q));
      $('#tgBody').innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Certificado</th><th>Cliente</th><th>Aparelho</th><th>Pago</th><th>Libera / vence</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map((t) => `<tr><td><b>${esc(t.code)}</b><br><small class="muted">${esc(t.order_code)}</small></td><td>${esc(t.customer_name || '—')}<br><small class="muted">${esc(t.phone)}</small></td><td>${esc(t.product_name)}</td>
          <td>${brl(t.paid_value)}<br><small class="muted">até ${brl(t.values.A)}</small></td><td>${t.opens_at.split('-').reverse().join('/')}<br><small class="muted">até ${t.expires_at.split('-').reverse().join('/')}</small></td>
          <td>${t.phase === 'liberado' ? '<span class="st-on">● Liberada</span>' : PH[t.phase]}${t.coupon_code ? `<br><small class="gold">${esc(t.coupon_code)} · ${brl(t.redeemed_value)}</small>` : ''}</td>
          <td>${t.phase === 'liberado' ? `<button class="btn btn-gold btn-sm" data-redeem="${t.id}">Avaliar e gerar crédito</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty">Nenhum certificado neste filtro. Eles são criados sozinhos quando um iPhone elegível é pago.</div>';
    };
    $('#tgQ').addEventListener('input', draw);
    $('#view').onclick = (e) => {
      const f = e.target.closest('[data-ph]'); if (f) return viewTradePlans(f.dataset.ph);
      const r = e.target.closest('[data-redeem]'); if (!r) return;
      const t = list.find((x) => x.id === +r.dataset.redeem);
      const CHECK = ['Liga e funciona normalmente (tela, toque, Face ID, câmeras, som)', 'Sem tela ou traseira trincada', 'Sem sinais de contato com líquido', 'Sem reparo fora da loja', 'Conta iCloud / Buscar iPhone removida', 'IMEI confere com o certificado'];
      const m = modal(mHead('Avaliar troca — ' + esc(t.code)) + `<div class="m-body"><p style="margin:0"><b>${esc(t.product_name)}</b> · ${esc(t.customer_name)} · pago ${brl(t.paid_value)}</p>
        <div class="tg-check">${CHECK.map((c, i) => `<label class="check"><input type="checkbox" data-ck="${i}"><span>${c}</span></label>`).join('')}</div>
        <div class="field"><label>Estado do aparelho</label><div class="seg full" id="tgGrade">${['A', 'B', 'C'].map((g) => `<button type="button" data-g="${g}">${g} · ${brl(t.values[g])}</button>`).join('')}</div></div>
        <p class="hint" style="margin:0">Todos os itens precisam estar ok. O crédito vira um cupom de uso único (30 dias) para usar na venda do novo aparelho.</p></div>
        <div class="m-foot"><button class="btn btn-line btn-sm" data-close>Cancelar</button><button class="btn btn-gold btn-sm" id="tgGo" disabled>Gerar crédito</button></div>`, 'sm');
      let g = '';
      const upd = () => { $('#tgGo', m).disabled = !g || $$('[data-ck]', m).some((x) => !x.checked); };
      m.addEventListener('change', upd);
      $('#tgGrade', m).addEventListener('click', (e2) => { const b = e2.target.closest('[data-g]'); if (!b) return; g = b.dataset.g; $$('[data-g]', m).forEach((x) => x.classList.toggle('on', x === b)); upd(); });
      $('#tgGo', m).addEventListener('click', async () => {
        try { const x = await api('/api/admin/trade-plans/' + t.id + '/redeem', { method: 'POST', body: { grade: g } });
          closeModal(); modal(mHead('Crédito gerado') + `<div class="m-body"><p style="margin:0">Crédito de <b class="gold">${brl(x.value)}</b> para ${esc(t.customer_name)}.</p><div class="cred"><span>Cupom</span><b>${esc(x.code)}</b><span>Válido até</span><b>${x.expires.split('-').reverse().join('/')}</b></div>
            <p class="hint" style="margin:0">Use em “Registrar venda na loja” → campo “Cupom ou crédito”, ou o cliente usa no site.</p></div><div class="m-foot"><button class="btn btn-gold btn-sm" data-close>Entendi</button></div>`, 'sm');
          viewTradePlans(phase);
        } catch (err) { toast(err.message, 1); }
      });
    };
    draw();
  }

  /* ---------- equipe ---------- */
  const ROLE_INFO = {
    owner: ['Dono', 'Acesso total: equipe, segurança, configurações, vendas e catálogo.'],
    manager: ['Gerente', 'Catálogo, promoções, cupons, pedidos, avaliações, perguntas e configurações. Não gerencia a equipe.'],
    seller: ['Vendedor', 'Anúncios, pedidos, avaliações e perguntas. Sem acesso a cupons, promoções em massa e configurações.'],
  };
  async function viewUsers() {
    const list = await api('/api/admin/users');
    $('#view').innerHTML = top('Acesso', 'Equipe', `<button class="btn btn-gold btn-sm" id="newU">${UI.plus} Adicionar pessoa</button>`) +
      `<div class="role-cards">${Object.entries(ROLE_INFO).map(([k, [l, d]]) => `<div class="panel"><b>${l}</b><p class="muted">${d}</p></div>`).join('')}</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pessoa</th><th>Perfil</th><th>Último acesso</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map((u) => `<tr class="click" data-u="${u.id}"><td><div class="t-prod">${u.photo_shown ? `<span class="avatar ph"><img src="${esc(u.photo_shown)}" alt=""></span>` : `<span class="avatar">${esc(u.name[0])}</span>`}<div><b>${esc(u.name)}</b><small>@${esc(u.username)}${u.id === S.me.id ? ' · você' : ''}${u.in_ranking ? ' · <span class="gold">consultor</span>' : ''}</small></div></div></td>
        <td>${ROLE_INFO[u.role][0]}</td><td>${u.last_login ? fmtDate(u.last_login) : '<span class="muted">Nunca entrou</span>'}${u.sessions ? `<br><small class="muted">${u.sessions} sessão(ões) ativa(s)</small>` : ''}</td>
        <td>${u.active ? '<span class="st-on">● Ativo</span>' : '<span class="st-off">● Bloqueado</span>'}${u.must_change ? '<br><small class="gold">Senha provisória</small>' : ''}</td>
        <td><div class="act">${u.id !== S.me.id ? `<button class="icon-btn" data-udel="${u.id}" title="Excluir">${UI.trash}</button>` : ''}</div></td></tr>`).join('')}
      </tbody></table></div>`;
    $('#newU').addEventListener('click', () => userForm());
    $('#view').onclick = async (e) => {
      const d = e.target.closest('[data-udel]');
      if (d) { e.stopPropagation(); if (!confirm('Excluir este acesso? A pessoa será desconectada imediatamente.')) return; try { await api('/api/admin/users/' + d.dataset.udel, { method: 'DELETE' }); toast('Acesso excluído'); viewUsers(); } catch (err) { toast(err.message, 1); } return; }
      const tr = e.target.closest('[data-u]'); if (tr) userForm(list.find((u) => u.id === +tr.dataset.u));
    };
  }
  function userForm(u) {
    const isNew = !u; const self = u && u.id === S.me.id;
    const m = modal(mHead(isNew ? 'Adicionar pessoa à equipe' : 'Editar acesso') + `<form class="m-body" id="uForm">
      <div class="row c2"><div class="field"><label>Nome</label><input name="name" value="${esc(u ? u.name : '')}" required></div>
        <div class="field"><label>Usuário (para entrar)</label><input name="username" value="${esc(u ? u.username : '')}" ${isNew ? '' : 'disabled'} required autocapitalize="none" placeholder="ex.: thiago"></div></div>
      <div class="field"><label>E-mail <small class="muted">(para recuperar a senha)</small></label><input name="email" type="email" value="${esc(u ? u.email || '' : '')}" autocapitalize="none" placeholder="nome@email.com">
        <p class="hint" style="margin-top:4px">Se a pessoa criar uma conta de cliente no site com este mesmo e-mail (e confirmar), a foto de perfil dela aparece automaticamente na equipe, no atendimento e no pódio.</p></div>
      <div class="field"><label>Conta de cliente vinculada <small class="muted">(opcional — se usou outro e-mail no site)</small></label><input name="customer_email" type="email" value="${esc(u ? u.customer_email || '' : '')}" autocapitalize="none" placeholder="e-mail da conta de cliente"></div>
      <div class="field"><label>Perfil de acesso</label><div class="role-pick">${Object.entries(ROLE_INFO).map(([k, [l, d]]) => `<label><input type="radio" name="role" value="${k}" ${(u ? u.role : 'seller') === k ? 'checked' : ''} ${self ? 'disabled' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('')}</div></div>
      <div class="field"><label>${isNew ? 'Senha provisória' : 'Redefinir senha (opcional)'}</label><div style="display:flex;gap:6px"><input name="password" ${isNew ? 'required' : ''} autocomplete="new-password" placeholder="${isNew ? '' : 'Deixe vazio para manter'}"><button type="button" class="btn btn-line btn-sm" id="uGen">Gerar</button></div>
        <p class="hint" style="margin-top:4px">A pessoa será obrigada a criar a própria senha no primeiro acesso. Envie a senha provisória por um canal seguro.</p></div>
      ${!isNew && !self ? `<label class="switch"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}><span></span>Acesso liberado</label>` : ''}
      <div class="seller-fields">
        <span class="cg-label">Consultor</span>
        <label class="switch"><input type="checkbox" name="in_ranking" ${(u ? u.in_ranking : true) ? 'checked' : ''}><span></span>É consultor: aparece em “Quem é a equipe que irá lhe atender”, no “Fale com um consultor” e no ranking</label>
        <div class="row c2"><div class="field"><label>Cargo exibido</label><input name="title" maxlength="50" value="${esc(u ? u.title || '' : '')}" placeholder="Ex.: Especialista Apple"></div>
          <div class="field"><label>WhatsApp de atendimento</label><input name="whatsapp" inputmode="tel" value="${esc(u ? u.whatsapp || '' : '')}" placeholder="(65) 99999-9999"></div></div>
        <div class="row c2"><div class="field"><label>Código do link de vendas</label><input name="ref_code" maxlength="20" value="${esc(u ? u.ref_code || '' : '')}" placeholder="gerado pelo usuário"><p class="hint" style="margin-top:4px">${esc(location.host)}/?v=<b class="gold" id="refPrev">${esc(u ? u.ref_code || '' : '')}</b></p></div>
          <div class="field"><label>Meta do mês (R$, opcional)</label><input name="goal" type="number" min="0" step="100" value="${u && u.goal ? u.goal : ''}"></div></div>
        <div class="photo-pick"><span class="avatar xl" id="uPhPrev">${u && u.photo_shown ? `<img src="${esc(u.photo_shown)}" alt="">` : esc((u ? u.name : '?')[0] || '?')}</span>
          <div><label class="btn btn-line btn-sm">${IC.upload || ''} Enviar foto<input type="file" accept="image/*" id="uPh" hidden></label> ${u && u.photo ? '<button type="button" class="btn btn-line btn-sm" id="uPhDel">Remover</button>' : ''}
          <p class="hint">Aparece no pódio do site e no “Fale com um consultor”. Foto de rosto, bem iluminada.</p></div></div>
      </div>
    </form><div class="m-foot"><button class="btn btn-line btn-sm" data-close>Cancelar</button><button class="btn btn-gold btn-sm" id="uSave">${isNew ? 'Criar acesso' : 'Salvar'}</button></div>`, 'sm');
    $('#uGen', m).addEventListener('click', () => { $('[name=password]', m).value = genPass(); });
    let photo;
    $('#uPh', m).addEventListener('change', async (e) => { const fl = e.target.files[0]; if (!fl) return; try { photo = await smallPhoto(fl); $('#uPhPrev', m).innerHTML = `<img src="${photo}" alt="">`; } catch (err) { toast(err.message, 1); } });
    $('#uPhDel', m)?.addEventListener('click', () => { photo = ''; $('#uPhPrev', m).textContent = (u.name || '?')[0]; });
    $('[name=ref_code]', m).addEventListener('input', (e) => { $('#refPrev', m).textContent = e.target.value.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, ''); });
    $('#uSave', m).addEventListener('click', async () => {
      const f = $('#uForm', m); if (!f.reportValidity()) return;
      const fd = new FormData(f), body = { name: fd.get('name') };
      if (!self) body.role = fd.get('role');
      if (fd.get('password')) body.password = fd.get('password');
      if (isNew) body.username = fd.get('username'); else if (!self) body.active = fd.get('active') === 'on';
      body.email = (fd.get('email') || '').trim(); body.customer_email = (fd.get('customer_email') || '').trim();
      body.in_ranking = fd.get('in_ranking') === 'on'; body.title = fd.get('title'); body.whatsapp = fd.get('whatsapp'); body.goal = +fd.get('goal') || 0;
      if (fd.get('ref_code')) body.ref_code = fd.get('ref_code');
      if (photo !== undefined) body.photo = photo;
      try {
        await api('/api/admin/users' + (isNew ? '' : '/' + u.id), { method: isNew ? 'POST' : 'PUT', body });
        closeModal(); viewUsers();
        if (body.password) modal(mHead('Acesso pronto') + `<div class="m-body"><p>Envie estes dados para <b>${esc(body.name)}</b>:</p><div class="cred"><span>Endereço</span><b>${esc(location.origin)}/admin</b><span>Usuário</span><b>${esc(isNew ? body.username : u.username)}</b><span>Senha provisória</span><b>${esc(body.password)}</b></div><p class="hint">Esta senha não será exibida novamente.</p></div><div class="m-foot"><button class="btn btn-gold btn-sm" data-close>Entendi</button></div>`, 'sm');
        else toast('Acesso atualizado');
      } catch (e) { toast(e.message, 1); }
    });
  }

  /* ---------- segurança ---------- */
  async function viewSecurity() {
    const auditList = can('users') ? await api('/api/admin/audit') : [];
    const ACT = { login: 'Entrou no painel', login_falhou: 'Tentativa de login falhou', senha_alterada: 'Alterou a senha', produto_criado: 'Criou anúncio', produto_editado: 'Editou anúncio', produto_excluido: 'Excluiu anúncio', produto_duplicado: 'Duplicou anúncio',
      promocao_aplicada: 'Aplicou promoção', promocao_encerrada: 'Encerrou promoção', cupom_criado: 'Criou cupom', cupom_editado: 'Editou cupom', cupom_excluido: 'Excluiu cupom', pedido_status: 'Alterou status de pedido',
      avaliacao_moderada: 'Moderou avaliação', avaliacao_excluida: 'Excluiu avaliação', pergunta_respondida: 'Respondeu pergunta', pergunta_excluida: 'Excluiu pergunta', configuracoes_salvas: 'Alterou configurações',
      backup_manual: 'Fez backup manual', backup_baixado: 'Baixou backup',
      usuario_criado: 'Criou acesso', usuario_editado: 'Editou acesso', usuario_excluido: 'Excluiu acesso', sessoes_encerradas: 'Encerrou outras sessões', categoria_criada: 'Criou categoria', categoria_editada: 'Editou categoria', categoria_excluida: 'Excluiu categoria' };
    $('#view').innerHTML = top('Conta', 'Segurança') + `
      <div class="settings-grid">
        <div class="panel"><h3>Minha senha</h3>
          <div class="field"><label>Senha atual</label><input type="password" id="pwCur" autocomplete="current-password"></div>
          <div class="field"><label>Nova senha</label><input type="password" id="pwNew" autocomplete="new-password"><div class="pw-meter"><i id="pwBar"></i></div></div>
          <p class="hint" style="margin:0">8+ caracteres com letras e números. Ao trocar, suas outras sessões são encerradas.</p>
          <button class="btn btn-gold btn-sm" id="pwSave" style="justify-self:start">Alterar senha</button>
        </div>
        <div class="panel"><h3>Proteções ativas</h3>
          <ul class="sec-list">
            <li>${UI.check} Senhas criptografadas (scrypt) — nem a equipe consegue ver</li>
            <li>${UI.check} Bloqueio temporário após tentativas de login erradas</li>
            <li>${UI.check} Sessão em cookie protegido (HttpOnly · SameSite) com expiração</li>
            <li>${UI.check} Perfis de acesso: Dono, Gerente e Vendedor</li>
            <li>${UI.check} Proteção contra ataques entre sites (CSRF, clickjacking, CSP)</li>
            <li>${UI.check} Fotos validadas pelo conteúdo real do arquivo</li>
            <li>${UI.check} Avaliações e fotos de clientes passam por moderação</li>
            <li>${UI.check} Registro de todas as ações da equipe</li>
            <li>${UI.check} Bloqueio de senhas fracas e das mais vazadas da internet</li>
            <li>${UI.check} Conexão criptografada obrigatória (HSTS) e dados pessoais fora de cache</li>
            <li>${UI.check} Limite de tamanho por requisição e contra excesso de tentativas</li>
            <li>${UI.check} Backup automático diário do banco (14 dias)</li>
            <li>${UI.check} Dependências auditadas: 0 vulnerabilidades conhecidas</li>
          </ul>
          <button class="btn btn-line btn-sm" id="revoke" style="justify-self:start">Encerrar minhas outras sessões</button>
        </div>
      </div>
      ${can('users') ? `<div class="panel" style="margin-top:14px"><h3>Registro de atividades</h3>
        <div class="tbl-wrap" style="border:0"><table class="tbl"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th><th>IP</th></tr></thead><tbody>
        ${auditList.map((a) => `<tr><td style="white-space:nowrap">${fmtDate(a.created_at)}</td><td>${esc(a.user_name)}</td><td style="${a.action === 'login_falhou' ? 'color:var(--err)' : ''}">${esc(ACT[a.action] || a.action)}</td><td><small class="muted">${esc(a.detail)}</small></td><td><small class="muted">${esc(a.ip)}</small></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sem registros.</td></tr>'}
        </tbody></table></div></div>` : ''}
      ${can('owner-only') ? `<div class="panel" style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h3 style="margin:0">Backups do banco de dados</h3>
        <button class="btn btn-line btn-sm" id="bkNow">Fazer backup agora</button></div>
        <p class="hint">Cópia automática todo dia; ficam guardados os 14 últimos. Baixe um de vez em quando e guarde fora deste computador (pendrive ou nuvem).</p>
        <div class="tbl-wrap" style="border:0"><table class="tbl"><thead><tr><th>Arquivo</th><th>Data</th><th>Tamanho</th><th></th></tr></thead><tbody id="bkList"><tr><td colspan="4" class="muted">Carregando…</td></tr></tbody></table></div></div>` : ''}`;
    if (can('owner-only')) {
      const drawBk = async () => { const l = await api('/api/admin/backups');
        $('#bkList').innerHTML = l.map((b) => `<tr><td>${esc(b.name)}</td><td>${new Date(b.created_at).toLocaleString('pt-BR')}</td><td>${(b.size / 1048576).toFixed(1)} MB</td><td><a class="btn-ghost" href="/api/admin/backups/${encodeURIComponent(b.name)}" download>Baixar</a></td></tr>`).join('') || '<tr><td colspan="4" class="muted">O primeiro backup é feito alguns segundos após o servidor iniciar.</td></tr>'; };
      drawBk().catch(() => {});
      $('#bkNow').addEventListener('click', async () => { try { await api('/api/admin/backups', { method: 'POST' }); toast('Backup feito'); drawBk(); } catch (e) { toast(e.message, 1); } });
    }
    $('#pwNew').addEventListener('input', (e) => meter(e.target.value, $('#pwBar')));
    $('#pwSave').addEventListener('click', async () => {
      try { await api('/api/admin/password', { method: 'POST', body: { current: $('#pwCur').value, next: $('#pwNew').value } }); $('#pwCur').value = $('#pwNew').value = ''; toast('Senha alterada'); }
      catch (e) { toast(e.message, 1); }
    });
    $('#revoke').addEventListener('click', async () => { await api('/api/admin/sessions/revoke-others', { method: 'POST' }); toast('Outras sessões encerradas'); });
  }

  /* ---------- configurações ---------- */
  async function viewSettings() {
    const s = S.settings = await api('/api/admin/settings');
    const oh = s.open_hours || {};
    const repeat = (id, rows, tpl, cols) => `<div class="repeat" id="${id}">${rows.map((r) => `<div class="r" style="grid-template-columns:${cols} 34px">${tpl(r)}<button type="button" class="icon-btn" data-rm-row style="width:34px;height:34px">${UI.trash}</button></div>`).join('')}</div>
      <button type="button" class="btn btn-ghost" data-add-row="${id}" style="justify-self:start">+ Adicionar</button>`;
    const hourTpl = (h = {}) => `<input class="input" data-k="days" value="${esc(h.days || '')}" placeholder="Dias"><input class="input" data-k="time" value="${esc(h.time || '')}" placeholder="Horário">`;
    const zoneTpl = (z = {}) => `<input class="input" data-k="name" value="${esc(z.name || '')}" placeholder="Nome da opção"><input class="input" data-k="fee" type="number" step="0.01" min="0" value="${z.fee ?? ''}" placeholder="Taxa R$ (0 = grátis)"><input class="input" data-k="eta" value="${esc(z.eta || '')}" placeholder="Prazo">
      <select class="input" data-k="scope">${[['estado', 'Estado(s)'], ['cidade', 'Cidade(s)'], ['brasil', 'Todo o Brasil']].map(([v, l]) => `<option value="${v}" ${(z.scope || 'brasil') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input class="input" data-k="values" value="${esc(z.values || '')}" placeholder="Ex.: SP, RJ  ou  Campinas, Valinhos">`;
    const consTpl = (c = {}) => `<input class="input" data-k="name" value="${esc(c.name || '')}" placeholder="Nome"><input class="input" data-k="role" value="${esc(c.role || '')}" placeholder="Função"><input class="input" data-k="whatsapp" value="${esc(c.whatsapp || '')}" placeholder="WhatsApp (opcional)">`;
    const faqTpl = (f = {}) => `<div style="display:grid;gap:6px"><input class="input" data-k="q" value="${esc(f.q || '')}" placeholder="Pergunta" maxlength="200"><textarea class="input" data-k="a" rows="2" placeholder="Resposta" maxlength="2000">${esc(f.a || '')}</textarea></div>`;
    const TPL = { hoursRep: [hourTpl, '1fr 1fr'], zonesRep: [zoneTpl, '1.6fr .8fr 1.1fr .9fr 1.4fr'], consRep: [consTpl, '1fr 1fr 1.2fr'], faqRep: [faqTpl, '1fr'] };
    const range = (r) => r ? `${r[0]}-${r[1]}` : '';

    $('#view').innerHTML = top('Loja', 'Configurações', `<button class="btn btn-gold btn-sm" id="sSave">Salvar configurações</button>`) + `<form id="sForm" class="settings-grid">
      <div class="panel"><h3>Identidade & contato</h3>
        <div class="row c2"><div class="field"><label>Nome da loja</label><input name="store_name" value="${esc(s.store_name)}"></div><div class="field"><label>Slogan</label><input name="tagline" value="${esc(s.tagline)}"></div></div>
        <div class="row c2"><div class="field"><label>WhatsApp principal (com DDI e DDD)</label><input name="whatsapp" value="${esc(s.whatsapp)}" placeholder="5511999999999"></div><div class="field"><label>Telefone exibido</label><input name="phone_display" value="${esc(s.phone_display)}"></div></div>
        <div class="row c2"><div class="field"><label>Instagram (usuário)</label><input name="instagram" value="${esc(s.instagram)}"></div><div class="field"><label>E-mail</label><input name="email" value="${esc(s.email)}"></div></div>
        <div class="field"><label>Faixa de anúncio no topo</label><input name="announcement" value="${esc(s.announcement)}"></div>
        <div class="field"><label>Texto de garantia</label><input name="warranty_text" value="${esc(s.warranty_text)}"></div>
      </div>
      <div class="panel"><h3>Indique e ganhe</h3>
        <label class="switch"><input type="checkbox" name="referral_enabled" ${s.referral_enabled !== false ? 'checked' : ''}><span></span>Programa ativo (link pessoal na conta de cada cliente)</label>
        <div class="row c3"><div class="field"><label>Amigo ganha (% na 1ª compra)</label><input name="referral_friend_pct" type="number" min="0" max="50" value="${s.referral_friend_pct ?? 5}"></div>
          <div class="field"><label>Quem indicou ganha (R$)</label><input name="referral_reward_value" type="number" min="0" step="5" value="${s.referral_reward_value ?? 50}"></div>
          <div class="field"><label>Compra mínima (R$)</label><input name="referral_min_order" type="number" min="0" step="50" value="${s.referral_min_order ?? 300}"></div></div>
        <p class="hint" style="margin:0">O amigo precisa criar a conta pelo link. Os cupons são pessoais, de uso único, e só valem na conta de quem ganhou. A recompensa sai quando a 1ª compra do amigo é paga.</p>
      </div>
      <div class="panel" style="grid-column:1/-1"><h3>Página “Nossa história”</h3>
        <div class="field"><label>Texto (um parágrafo por linha)</label><textarea name="about_story" rows="5">${esc(s.about_story || '')}</textarea></div>
        <div class="row c2"><div><span class="cg-label">Números (opcional — use só números reais)</span><div id="abStats">${[0, 1, 2, 3].map((i) => { const x = (s.about_stats || [])[i] || {}; return `<div class="row c2" style="margin-top:6px"><input data-abn="${i}" value="${esc(x.n || '')}" placeholder="+5.000"><input data-abl="${i}" value="${esc(x.l || '')}" placeholder="clientes atendidos"></div>`; }).join('')}</div></div>
          <div><span class="cg-label">Trajetória (opcional)</span><div id="abTl">${[0, 1, 2, 3, 4, 5].map((i) => { const x = (s.about_timeline || [])[i] || {}; return `<div class="row" style="grid-template-columns:90px 1fr;margin-top:6px"><input data-aby="${i}" value="${esc(x.y || '')}" placeholder="2019"><input data-abt="${i}" value="${esc(x.t || '')}" placeholder="Abrimos a primeira loja"></div>`; }).join('')}</div></div></div>
        <div class="row c2"><div class="field"><label>Página da loja no Reclame Aqui (opcional)</label><input name="reclameaqui_url" value="${esc(s.reclameaqui_url || '')}" placeholder="https://www.reclameaqui.com.br/empresa/..."></div>
          <div class="field"><label>Reputação exibida</label><input name="reclameaqui_score" value="${esc(s.reclameaqui_score || '')}" placeholder="Ex.: Ótimo · 9,1"></div></div>
        <p class="hint" style="margin:0">A página usa também a foto da equipe, a homenagem ao CEO, as fotos do mural e a nota do Google (se configurada).</p>
      </div>
      <div class="panel"><h3>Clube Aladdin (cashback)</h3>
        <label class="switch"><input type="checkbox" name="club_enabled" ${s.club_enabled !== false ? 'checked' : ''}><span></span>Programa ativo</label>
        <div class="row c3"><div class="field"><label>Prata (% de volta)</label><input name="club_pct_silver" type="number" min="0" max="30" step="0.5" value="${s.club_pct_silver ?? 2}"></div>
          <div class="field"><label>Ouro (%)</label><input name="club_pct_gold" type="number" min="0" max="30" step="0.5" value="${s.club_pct_gold ?? 3}"></div>
          <div class="field"><label>Diamante (%)</label><input name="club_pct_diamond" type="number" min="0" max="30" step="0.5" value="${s.club_pct_diamond ?? 5}"></div></div>
        <div class="row c3"><div class="field"><label>Ouro a partir de (R$/ano)</label><input name="club_gold_at" type="number" min="0" step="500" value="${s.club_gold_at ?? 5000}"></div>
          <div class="field"><label>Diamante a partir de (R$/ano)</label><input name="club_diamond_at" type="number" min="0" step="500" value="${s.club_diamond_at ?? 15000}"></div>
          <div class="field"><label>Cashback vale por (dias)</label><input name="club_expiry_days" type="number" min="30" value="${s.club_expiry_days ?? 180}"></div></div>
        <div class="row c2"><div class="field"><label>Pode pagar até (% da compra)</label><input name="club_max_use_pct" type="number" min="0" max="100" value="${s.club_max_use_pct ?? 30}"></div>
          <div class="field"><label>Presente de aniversário (R$)</label><input name="club_birthday_value" type="number" min="0" step="10" value="${s.club_birthday_value ?? 50}"></div></div>
        <label class="switch"><input type="checkbox" name="reminders_enabled" ${s.reminders_enabled !== false ? 'checked' : ''}><span></span>Lembretes automáticos (garantia, 2 anos de iPhone, película)</label>
        <label class="switch"><input type="checkbox" name="reminders_whatsapp" ${s.reminders_whatsapp ? 'checked' : ''}><span></span>Também pelo WhatsApp (exige a integração de WhatsApp ativa)</label>
        <p class="hint" style="margin:0">O cashback cai quando o pedido é pago (site ou balcão, se o WhatsApp da venda for o da conta do cliente). Lembretes de oferta só vão para quem aceitou receber ofertas; o aviso de garantia vai para todos.</p>
      </div>
      <div class="panel"><h3>Troca Garantida</h3>
        <label class="switch"><input type="checkbox" name="trade_enabled" ${s.trade_enabled !== false ? 'checked' : ''}><span></span>Incluir em toda compra elegível (certificado no recibo)</label>
        <div class="row c3"><div class="field"><label>Estado A (%)</label><input name="trade_pct_a" type="number" min="0" max="90" value="${s.trade_pct_a ?? 60}"></div>
          <div class="field"><label>Estado B (%)</label><input name="trade_pct_b" type="number" min="0" max="90" value="${s.trade_pct_b ?? 50}"></div>
          <div class="field"><label>Estado C (%)</label><input name="trade_pct_c" type="number" min="0" max="90" value="${s.trade_pct_c ?? 40}"></div></div>
        <div class="row c3"><div class="field"><label>Libera após (meses)</label><input name="trade_months" type="number" min="1" max="36" value="${s.trade_months ?? 12}"></div>
          <div class="field"><label>Prazo para usar (dias)</label><input name="trade_window_days" type="number" min="1" max="365" value="${s.trade_window_days ?? 90}"></div>
          <div class="field"><label>Preço mínimo (R$)</label><input name="trade_min_price" type="number" min="0" step="100" value="${s.trade_min_price ?? 2000}"></div></div>
        <div class="row c2"><div class="field"><label>Categorias (slugs, separados por vírgula)</label><input name="trade_categories" value="${esc(s.trade_categories || 'iphone')}"></div>
          <div class="field"><label>&nbsp;</label><label class="switch"><input type="checkbox" name="trade_only_new" ${s.trade_only_new !== false ? 'checked' : ''}><span></span>Só aparelhos novos</label></div></div>
        <p class="hint" style="margin:0">Percentual sobre o valor pago (já com descontos). Mudanças valem para as próximas vendas; certificados já emitidos mantêm as condições da compra.</p>
      </div>
      <div class="panel"><h3>Reservar e retirar</h3>
        <label class="switch"><input type="checkbox" name="reserve_enabled" ${s.reserve_enabled !== false ? 'checked' : ''}><span></span>Mostrar “Reservar e retirar na loja” nos produtos</label>
        <div class="field" style="max-width:260px"><label>Tempo que a reserva fica separada (horas)</label><input name="reserve_hours" type="number" min="1" max="168" value="${s.reserve_hours ?? 24}"></div>
        <p class="hint" style="margin:0">O cliente reserva sem pagar e paga na retirada. O estoque fica separado; se ninguém retirar no prazo, a reserva cancela sozinha e o produto volta para a venda.</p>
      </div>
      ${S.me.role === 'owner' ? `<div class="panel pay-panel" style="grid-column:1/-1"><h3>Avisos do pedido pelo WhatsApp ${s.wa_provider ? '<span class="st-on" style="font-size:12px">● configurado</span>' : ''}</h3>
        <div class="pay-steps">
          <div><em>1</em><p><b>Z-API</b> (mais simples, popular no Brasil): crie uma instância em z-api.io, conecte o WhatsApp da loja lendo o QR Code e copie o ID e o token.</p></div>
          <div><em>2</em><p><b>API oficial da Meta</b> (WhatsApp Business Platform): crie o app, o número e um <b>modelo de mensagem</b> aprovado com uma variável {{1}}. Cole o token, o ID do número e o nome do modelo.</p></div>
          <div><em>3</em><p>Sem integração, o botão “Mandar aviso do status no WhatsApp” no pedido abre a conversa com a mensagem pronta — é só tocar em enviar.</p></div>
        </div>
        <div class="row c3"><div class="field"><label>Integração</label><select name="wa_provider"><option value="" ${!s.wa_provider ? 'selected' : ''}>Desligada (aviso manual)</option><option value="zapi" ${s.wa_provider === 'zapi' ? 'selected' : ''}>Z-API</option><option value="meta" ${s.wa_provider === 'meta' ? 'selected' : ''}>API oficial da Meta</option></select></div>
          <div class="field"><label>Avisar automaticamente</label><label class="switch" style="margin-top:8px"><input type="checkbox" name="wa_notify" ${s.wa_notify !== false ? 'checked' : ''}><span></span>Pedido novo e cada mudança de status</label></div>
          <div class="field"><label>Testar no número</label><div style="display:flex;gap:6px"><input id="waTestPhone" inputmode="tel" placeholder="(65) 99999-9999"><button type="button" class="btn btn-line btn-sm" id="waTest">Testar</button></div><span id="waRes" class="hint" style="margin:0"></span></div></div>
        <div class="row c3"><div class="field"><label>Z-API · ID da instância</label><input name="zapi_instance" value="${esc(s.zapi_instance || '')}" autocomplete="off"></div>
          <div class="field"><label>Z-API · token da instância</label><input name="zapi_token" type="password" autocomplete="off" value="${esc(s.zapi_token || '')}"></div>
          <div class="field"><label>Z-API · Client-Token (segurança)</label><input name="zapi_client_token" type="password" autocomplete="off" value="${esc(s.zapi_client_token || '')}"></div></div>
        <div class="row c3"><div class="field"><label>Meta · token de acesso</label><input name="wa_token" type="password" autocomplete="off" value="${esc(s.wa_token || '')}"></div>
          <div class="field"><label>Meta · ID do número</label><input name="wa_phone_id" value="${esc(s.wa_phone_id || '')}" autocomplete="off"></div>
          <div class="field"><label>Meta · nome do modelo aprovado</label><input name="wa_template" value="${esc(s.wa_template || '')}" placeholder="aviso_pedido"></div></div>
      </div>` : ''}
      ${S.me.role === 'owner' ? `<div class="panel pay-panel" style="grid-column:1/-1"><h3>Mercado Livre e Shopee — estoque unificado <span id="chSt" style="font-size:12px"></span></h3>
        <div class="pay-steps">
          <div><em>1</em><p>No cadastro de cada produto, informe o código do anúncio (<b>MLB…</b>) e/ou o ID do item na Shopee.</p></div>
          <div><em>2</em><p><b>Mercado Livre:</b> crie um app em developers.mercadolivre.com.br, com o endereço de retorno <code>${esc(location.origin)}/api/ml/callback</code> e as notificações de <b>orders_v2</b> em <code>${esc(location.origin)}/api/ml/notify</code>. Cole o App ID e a chave abaixo, salve e clique em “Conectar”.</p></div>
          <div><em>3</em><p><b>Shopee:</b> com o app aprovado na Shopee Open Platform, cole Partner ID, Partner Key, Shop ID e o token de acesso; cadastre o webhook de pedidos em <code>${esc(location.origin)}/api/shopee/notify</code>.</p></div>
        </div>
        <div class="row c3"><div class="field"><label>Mercado Livre · App ID</label><input name="ml_client_id" value="${esc(s.ml_client_id || '')}" autocomplete="off"></div>
          <div class="field"><label>Mercado Livre · chave secreta</label><input name="ml_client_secret" type="password" autocomplete="off" value="${esc(s.ml_client_secret || '')}"></div>
          <div class="field"><label>&nbsp;</label><a class="btn btn-line btn-sm" href="/api/admin/ml/connect" id="mlConn">Conectar conta do Mercado Livre</a></div></div>
        <div class="row c3"><div class="field"><label>Shopee · Partner ID</label><input name="shopee_partner_id" value="${esc(s.shopee_partner_id || '')}" inputmode="numeric"></div>
          <div class="field"><label>Shopee · Partner Key</label><input name="shopee_partner_key" type="password" autocomplete="off" value="${esc(s.shopee_partner_key || '')}"></div>
          <div class="field"><label>Shopee · Shop ID</label><input name="shopee_shop_id" value="${esc(s.shopee_shop_id || '')}" inputmode="numeric"></div></div>
        <div class="field"><label>Shopee · token de acesso</label><input name="shopee_access_token" type="password" autocomplete="off" value="${esc(s.shopee_access_token || '')}"></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button type="button" class="btn btn-line btn-sm" id="chSync">Sincronizar estoque agora</button><span class="hint" style="margin:0" id="chRes"></span></div>
        <div id="chLog" class="ch-log"></div>
        <p class="hint" style="margin:0">Como funciona: vendeu no site, no balcão ou num canal → o estoque local baixa e, em até 2 minutos, os outros canais recebem a quantidade nova. Pedido cancelado no canal devolve o estoque. As vendas dos canais entram no Financeiro.</p>
      </div>` : ''}
      <div class="panel"><h3>Vitrine no Google e no Instagram</h3>
        <p class="muted" style="margin:0">Catálogo automático com foto, preço, estoque e condição de cada produto — atualizado sozinho. Cole o link abaixo uma única vez em cada plataforma:</p>
        <div class="ref-link"><code>${esc(location.origin)}/feed/google.xml</code><button type="button" class="btn btn-line btn-sm" data-copyfeed="${esc(location.origin)}/feed/google.xml">${IC.copy} Copiar</button></div>
        <p class="hint" style="margin:0"><b>Google:</b> merchants.google.com → Produtos → Fontes de dados → Adicionar fonte → “Arquivo programado” com o link acima (atualização diária). Os produtos aparecem grátis na aba Shopping.<br>
        <b>Instagram/Facebook:</b> business.facebook.com → Gerenciador de Commerce → Catálogo → Fontes de dados → “Feed de dados programado” com o mesmo link. Depois ative as marcações de produto no Instagram.<br>
        Produtos sem foto ou sem preço ficam de fora (exigência das plataformas). Publicado, defina o endereço definitivo do site.</p>
      </div>
      ${S.me.role === 'owner' ? `<div class="panel"><h3>Avaliações do Google no site</h3>
        <div class="field"><label>Chave da Google Places API</label><input name="google_places_key" type="password" autocomplete="off" value="${esc(s.google_places_key || '')}"></div>
        <div class="field"><label>ID do lugar (Place ID) da loja</label><input name="google_place_id" value="${esc(s.google_place_id || '')}" placeholder="ChIJ..."></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button type="button" class="btn btn-line btn-sm" id="gTest">Testar</button><span id="gRes" class="hint" style="margin:0"></span></div>
        <p class="hint" style="margin:0">No Google Cloud, ative a “Places API (New)” e crie uma chave restrita a ela. Encontre o Place ID em developers.google.com/maps/documentation/places/web-service/place-id. O site mostra a nota, o total de avaliações e as melhores avaliações recentes, com atribuição ao Google (atualiza a cada 12 h).</p>
      </div>` : ''}
      <div class="panel"><h3>Medição de resultados</h3>
        <div class="row c2"><div class="field"><label>Google Analytics 4 (ID de medição)</label><input name="ga4_id" value="${esc(s.ga4_id || '')}" placeholder="G-XXXXXXXXXX" autocapitalize="characters"></div>
          <div class="field"><label>Pixel da Meta (Instagram/Facebook)</label><input name="meta_pixel_id" value="${esc(s.meta_pixel_id || '')}" placeholder="1234567890123456" inputmode="numeric"></div></div>
        <p class="hint" style="margin:0">Só começam a medir depois que o cliente clica em “Aceitar todos” no aviso de cookies (LGPD). Eventos enviados: visita de página, produto visto, adicionado à sacola, início do checkout, compra (com valor) e contato pelo WhatsApp.</p>
      </div>
      <div class="panel"><h3>Garantia por IMEI</h3>
        <div class="row c2"><div class="field"><label>Prazo para novos (meses)</label><input name="warranty_new_months" type="number" min="0" max="60" value="${s.warranty_new_months ?? 12}"></div>
          <div class="field"><label>Prazo para seminovos (meses)</label><input name="warranty_used_months" type="number" min="0" max="60" value="${s.warranty_used_months ?? 3}"></div></div>
        <div class="field"><label>Termo de garantia (uma cláusula por linha — em branco usa o texto padrão)</label><textarea name="warranty_terms" rows="6" placeholder="Deixe vazio para usar o termo padrão (cobertura, exclusões, como acionar, CDC).">${esc(s.warranty_terms || '')}</textarea></div>
        <p class="hint" style="margin:0">Cada produto pode ter um prazo próprio no cadastro. Recomendo que o contador ou advogado revise o termo.</p>
      </div>
      <div class="panel"><h3>Endereço & como chegar</h3>
        <div class="field"><label>Endereço (rua, número, bairro)</label><input name="address" value="${esc(s.address)}"></div>
        <div class="row c2"><div class="field"><label>Cidade — UF</label><input name="city" value="${esc(s.city)}"></div><div class="field"><label>CEP</label><input name="cep" value="${esc(s.cep)}"></div></div>
        <div class="field"><label>Busca no mapa</label><input name="map_query" value="${esc(s.map_query)}"><p class="hint" style="margin-top:0">Como aparece no Google Maps. Deixe “Aladdin Tech” para usar o endereço acima.</p></div>
        <label class="switch"><input type="checkbox" name="always_open" id="alwaysOpen" ${s.always_open ? 'checked' : ''}><span></span><b style="font-weight:500">Loja aberta 24 horas, 7 dias por semana</b></label>
        <div id="hoursBox" ${s.always_open ? 'hidden' : ''} style="display:grid;gap:14px">
        <label class="cg-label">Horários exibidos</label>${repeat('hoursRep', s.hours || [], hourTpl, TPL.hoursRep[1])}
        <label class="cg-label">Funcionamento real (para “Aberto agora”) — formato 9-19</label>
        <div class="row c3"><div class="field"><label>Seg–Sex</label><input name="oh_week" value="${range(oh.weekdays)}"></div><div class="field"><label>Sábado</label><input name="oh_sat" value="${range(oh.saturday)}"></div><div class="field"><label>Domingo (vazio = fechado)</label><input name="oh_sun" value="${range(oh.sunday)}"></div></div>
        </div>
      </div>
      <div class="panel" style="grid-column:1/-1"><h3>Entrega & retirada</h3>
        <label class="switch"><input type="checkbox" name="pickup_enabled" ${s.pickup_enabled !== false ? 'checked' : ''}><span></span>Permitir retirada na loja</label>
        <div class="row c2"><div class="field"><label>Prazo de retirada</label><input name="pickup_eta" value="${esc(s.pickup_eta)}"></div><div class="field"><label>Frete grátis acima de (R$, 0 = desativado)</label><input name="free_shipping_above" type="number" step="0.01" value="${s.free_shipping_above}"></div></div>
        <div class="field" style="max-width:220px"><label>UF da loja (para “entrega grátis na região”)</label><input name="store_uf" maxlength="2" value="${esc(s.store_uf || '')}" placeholder="Ex.: SP" style="text-transform:uppercase"></div>
        <label class="cg-label">Opções de entrega — o cliente vê só as que atendem o endereço dele</label>
        <p class="hint" style="margin:-6px 0 0">“Estado(s)” vazio = estado da loja. Taxa 0 aparece como <b>Grátis</b>. Ex.: grátis na região + Correios PAC/SEDEX para o resto do Brasil.</p>
        ${repeat('zonesRep', s.delivery_zones || [], zoneTpl, TPL.zonesRep[1])}
      </div>
      <div class="panel"><h3>Pagamento & atendimento</h3>
        <div class="row c3"><div class="field"><label>Desconto no Pix (%)</label><input name="pix_discount" type="number" step="0.5" min="0" value="${s.pix_discount}"></div>
          <div class="field"><label>Parcelas máximas</label><input name="max_installments" type="number" min="1" max="24" value="${s.max_installments}"></div>
          <div class="field"><label>Sem juros até</label><input name="installments_no_interest" type="number" min="1" max="24" value="${s.installments_no_interest}"></div></div>
        <label class="switch"><input type="checkbox" name="reviews_moderation" ${s.reviews_moderation !== false ? 'checked' : ''}><span></span>Moderar avaliações antes de publicar (recomendado)</label>
        <label class="cg-label">Consultores (botão “Fale com um consultor”)</label>
        ${repeat('consRep', s.consultants || [], consTpl, TPL.consRep[1])}
      </div>
      <div class="panel" style="grid-column:1/-1"><h3>Dados legais (privacidade e cookies)</h3>
        <p class="hint" style="margin:-8px 0 0">Aparecem nas páginas <a href="/privacidade" target="_blank" class="gold">Política de Privacidade</a> e <a href="/cookies" target="_blank" class="gold">Cookies</a> e no rodapé. Recomendamos que um advogado revise os textos.</p>
        <div class="row c3">
          <div class="field"><label>Razão social</label><input name="legal_name" value="${esc(s.legal_name || '')}" placeholder="Ex.: Aladdin Tech Comércio de Eletrônicos LTDA"></div>
          <div class="field"><label>CNPJ</label><input name="cnpj" value="${esc(s.cnpj || '')}" placeholder="00.000.000/0001-00"></div>
          <div class="field"><label>E-mail para privacidade (encarregado/DPO)</label><input name="dpo_email" type="email" value="${esc(s.dpo_email || '')}" placeholder="privacidade@…"></div>
        </div>
        <div class="field" style="max-width:240px"><label>Data da última atualização das políticas</label><input name="policies_updated" type="date" value="${esc(s.policies_updated || '')}"></div>
      </div>
      <div class="panel" style="grid-column:1/-1"><h3>Perguntas frequentes</h3>
        <p class="hint" style="margin:-8px 0 0">Vazio = o site mostra 10 perguntas prontas, montadas automaticamente com os dados da loja (pagamento, frete, garantia, devolução…). Ao adicionar aqui, as suas substituem as automáticas.</p>
        ${repeat('faqRep', s.faq || [], faqTpl, TPL.faqRep[1])}      </div>
      ${S.me.role === 'owner' ? `<div class="panel pay-panel" style="grid-column:1/-1"><h3>Pagamento online — Mercado Pago</h3>
        <div class="pay-steps">
          <div><em>1</em><p>Entre em <b>mercadopago.com.br/developers</b> → <b>Suas integrações</b> → criar aplicação (“Pagamentos online”, Checkout Pro).</p></div>
          <div><em>2</em><p>Em <b>Credenciais de produção</b>, copie o <b>Access Token</b> (começa com <code>APP_USR-</code>) e cole abaixo. Para testar sem cobrar, use o de teste (<code>TEST-</code>).</p></div>
          <div><em>3</em><p>Com o site publicado em HTTPS, cadastre em <b>Webhooks</b> o endereço <code>${esc(location.origin)}/api/payments/mp/webhook</code> (evento “Pagamentos”) e cole a <b>assinatura secreta</b> aqui.</p></div>
        </div>
        <div class="row c2">
          <div class="field"><label>Access Token ${s.mp_env_token ? '<small class="gold">(definido no servidor)</small>' : ''}</label><input name="mp_access_token" type="password" autocomplete="off" value="${esc(s.mp_access_token || '')}" placeholder="APP_USR-..."></div>
          <div class="field"><label>Assinatura secreta do webhook (recomendado)</label><input name="mp_webhook_secret" type="password" autocomplete="off" value="${esc(s.mp_webhook_secret || '')}"></div>
        </div>
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
          <label class="switch"><input type="checkbox" name="online_payments" ${s.online_payments ? 'checked' : ''}><span></span><b style="font-weight:500">Ativar Pix e cartão online no checkout</b></label>
          <button type="button" class="btn btn-line btn-sm" id="mpTest">Testar conexão</button><span id="mpRes" class="hint" style="margin:0"></span>
        </div>
        <p class="hint" style="margin:0">Sem a chave, o site continua funcionando como hoje: o pedido é reservado e o consultor combina o pagamento pelo WhatsApp. O pagamento “na entrega/retirada” sempre continua disponível. Os dados do cartão são digitados no ambiente do Mercado Pago — a loja nunca os recebe.</p>
      </div>` : ''}
      ${S.me.role === 'owner' ? `<div class="panel pay-panel" style="grid-column:1/-1"><h3>Frete em tempo real — Correios e transportadoras ${s.shipping_live ? '<span class="st-on" style="font-size:12px">● ativo</span>' : '<span class="gold" style="font-size:12px">● usando os valores fixos acima</span>'}</h3>
        <div class="pay-steps">
          <div><em>1</em><p>Crie a conta da loja em <b>melhorenvio.com.br</b> (gratuita). Ela calcula <b>PAC, SEDEX</b>, Jadlog, Loggi e outras, com desconto de contrato.</p></div>
          <div><em>2</em><p>Em <b>Configurações → Permissões de acesso → Tokens</b>, gere um token com permissão <b>shipping-calculate</b> e cole abaixo.</p></div>
          <div><em>3</em><p>Confira o <b>CEP da loja</b> (origem) em “Endereço” e cadastre peso e medidas nos produtos. A entrega grátis da região continua valendo.</p></div>
        </div>
        <div class="row c3">
          <div class="field"><label>Cálculo do frete</label><select name="shipping_provider"><option value="fixo" ${s.shipping_provider !== 'melhorenvio' ? 'selected' : ''}>Valores fixos (tabela acima)</option><option value="melhorenvio" ${s.shipping_provider === 'melhorenvio' ? 'selected' : ''}>Tempo real — Melhor Envio</option></select></div>
          <div class="field" style="grid-column:span 2"><label>Token do Melhor Envio</label><input name="me_token" type="password" autocomplete="off" value="${esc(s.me_token || '')}" placeholder="eyJ0eXAiOiJKV1Qi…"></div>
        </div>
        <div class="row c3">
          <div class="field"><label>Acréscimo por envio (R$)</label><input name="shipping_markup" type="number" step="0.01" value="${s.shipping_markup || 0}"></div>
          <div class="field"><label>Dias de separação</label><input name="handling_days" type="number" min="0" value="${s.handling_days ?? 1}"></div>
          <div class="field"><label>Serviços permitidos (IDs, opcional)</label><input name="shipping_services" value="${esc(s.shipping_services || '')}" placeholder="Ex.: 1,2 (PAC e SEDEX)"></div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><label class="switch"><input type="checkbox" name="me_sandbox" ${s.me_sandbox ? 'checked' : ''}><span></span>Ambiente de testes (sandbox)</label>
          <input class="input" id="meCep" placeholder="CEP de teste" value="01310-100" style="max-width:160px"><button type="button" class="btn btn-line btn-sm" id="meTest">Testar cotação</button><span class="hint" id="meRes" style="margin:0">Salve antes de testar.</span></div>
      </div>
      <div class="panel pay-panel" style="grid-column:1/-1"><h3>Nota fiscal eletrônica — Focus NFe ${s.nfe_on ? '<span class="st-on" style="font-size:12px">● ativa</span>' : '<span class="gold" style="font-size:12px">● desativada</span>'}</h3>
        <div class="pay-steps">
          <div><em>1</em><p>Crie a conta em <b>focusnfe.com.br</b>, cadastre a empresa (CNPJ, inscrição estadual, regime) e envie o <b>certificado digital A1</b>.</p></div>
          <div><em>2</em><p>Copie o <b>token</b> (homologação para testar, produção para valer) e cole abaixo. Preencha o <b>CNPJ</b> em “Dados legais”.</p></div>
          <div><em>3</em><p><b>Peça ao seu contador</b> para validar CFOP, CSOSN/CST e NCM abaixo. Com “emitir automaticamente”, a nota sai quando o pagamento é confirmado e vai por e-mail ao cliente.</p></div>
        </div>
        <div class="row c3">
          <div class="field" style="grid-column:span 2"><label>Token da Focus NFe</label><input name="focus_token" type="password" autocomplete="off" value="${esc(s.focus_token || '')}"></div>
          <div class="field"><label>Ambiente</label><select name="nfe_env"><option value="homologacao" ${s.nfe_env !== 'producao' ? 'selected' : ''}>Homologação (testes, sem valor fiscal)</option><option value="producao" ${s.nfe_env === 'producao' ? 'selected' : ''}>Produção (nota válida)</option></select></div>
        </div>
        <div class="row c3">
          <div class="field"><label>Natureza da operação</label><input name="nfe_natureza" value="${esc(s.nfe_natureza || 'Venda de mercadoria')}"></div>
          <div class="field"><label>CFOP mesmo estado / outro estado</label><div style="display:flex;gap:6px"><input name="nfe_cfop_in" value="${esc(s.nfe_cfop_in || '5102')}"><input name="nfe_cfop_out" value="${esc(s.nfe_cfop_out || '6108')}"></div></div>
          <div class="field"><label>NCM padrão</label><input name="nfe_ncm_default" value="${esc(s.nfe_ncm_default || '85171300')}"></div>
        </div>
        <div class="row c3">
          <div class="field"><label>ICMS — CSOSN/CST</label><input name="nfe_csosn" value="${esc(s.nfe_csosn || '102')}"></div>
          <div class="field"><label>PIS / COFINS — CST</label><div style="display:flex;gap:6px"><input name="nfe_pis_cst" value="${esc(s.nfe_pis_cst || '07')}"><input name="nfe_cofins_cst" value="${esc(s.nfe_cofins_cst || '07')}"></div></div>
          <div class="field"><label>Origem da mercadoria</label><select name="nfe_icms_origem">${[['0', '0 — Nacional'], ['1', '1 — Importação direta'], ['2', '2 — Estrangeira, mercado interno']].map(([v, l]) => `<option value="${v}" ${String(s.nfe_icms_origem || '0') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center">
          <label class="switch"><input type="checkbox" name="nfe_enabled" ${s.nfe_enabled ? 'checked' : ''}><span></span><b style="font-weight:500">Ativar nota fiscal</b></label>
          <label class="switch"><input type="checkbox" name="nfe_auto" ${s.nfe_auto !== false ? 'checked' : ''}><span></span>Emitir automaticamente quando o pagamento for confirmado</label>
          <button type="button" class="btn btn-line btn-sm" id="nfTest">Testar token</button><span class="hint" id="nfRes" style="margin:0"></span>
        </div>
        <p class="hint" style="margin:0">Com a nota ativa, o CPF passa a ser obrigatório no checkout.</p>
      </div>` : ''}
      <div class="panel" style="grid-column:1/-1"><h3>Carrinho abandonado</h3>
        <p class="hint" style="margin:-8px 0 0">Enviamos lembretes por e-mail a clientes com conta e a visitantes que autorizaram no checkout. Todo lembrete tem link para parar.</p>
        <div class="row c3">
          <div class="field"><label>1º lembrete após (horas)</label><input name="cart_delay_hours" type="number" step="0.5" min="0.25" value="${s.cart_delay_hours ?? 1}"></div>
          <div class="field"><label>2º lembrete após (horas)</label><input name="cart_second_hours" type="number" min="2" value="${s.cart_second_hours ?? 24}"></div>
          <div class="field"><label>Cupom no 2º lembrete (opcional)</label><input name="cart_coupon" value="${esc(s.cart_coupon || '')}" placeholder="Ex.: VOLTA5" style="text-transform:uppercase"></div>
        </div>
        <label class="switch"><input type="checkbox" name="cart_recovery" ${s.cart_recovery !== false ? 'checked' : ''}><span></span>Enviar lembretes de carrinho abandonado</label>
      </div>
      ${S.me.role === 'owner' ? `<div class="panel pay-panel" style="grid-column:1/-1"><h3>E-mails da loja (SMTP) ${s.mail_ready ? '<span class="st-on" style="font-size:12px">● ativo</span>' : '<span class="gold" style="font-size:12px">● não configurado — e-mails ficam só na caixa de saída</span>'}</h3>
        <div class="pay-steps">
          <div><em>1</em><p>Use o e-mail profissional da loja (ex.: <b>contato@aladdintech.com.br</b>) — Google Workspace, Zoho, Hostinger, Locaweb… Para volume de ofertas, prefira <b>Brevo</b>, <b>Amazon SES</b> ou <b>Resend</b>.</p></div>
          <div><em>2</em><p>Copie do provedor: servidor SMTP, porta (587 ou 465), usuário e senha. No Gmail/Workspace use uma <b>senha de app</b>, não a senha normal.</p></div>
          <div><em>3</em><p>Salve, clique em <b>Enviar teste</b> e confira a caixa de entrada (e o spam). Configure SPF/DKIM no domínio para não cair no spam.</p></div>
        </div>
        <div class="row c3">
          <div class="field" style="grid-column:span 2"><label>Servidor SMTP</label><input name="smtp_host" value="${esc(s.smtp_host || '')}" placeholder="smtp.gmail.com"></div>
          <div class="field"><label>Porta</label><input name="smtp_port" type="number" value="${esc(s.smtp_port || 587)}"></div>
        </div>
        <div class="row c2">
          <div class="field"><label>Usuário</label><input name="smtp_user" value="${esc(s.smtp_user || '')}" autocomplete="off"></div>
          <div class="field"><label>Senha / chave SMTP</label><input name="smtp_pass" type="password" value="${esc(s.smtp_pass || '')}" autocomplete="new-password"></div>
        </div>
        <div class="row c2">
          <div class="field"><label>E-mail remetente</label><input name="mail_from" value="${esc(s.mail_from || '')}" placeholder="contato@aladdintech.com.br"></div>
          <div class="field"><label>Nome do remetente</label><input name="mail_from_name" value="${esc(s.mail_from_name || 'Aladdin Tech')}"></div>
        </div>
        <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center">
          <label class="switch"><input type="checkbox" name="smtp_secure" ${s.smtp_secure ? 'checked' : ''}><span></span>Conexão SSL (porta 465)</label>
          <label class="switch"><input type="checkbox" name="require_email_verification" ${s.require_email_verification !== false ? 'checked' : ''}><span></span>Exigir e-mail confirmado para avaliar e perguntar</label>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input class="input" id="mailTestTo" placeholder="seu@email.com" style="max-width:260px"><button type="button" class="btn btn-line btn-sm" id="mailTest">Enviar teste</button><span class="hint" id="mailRes" style="margin:0">Salve antes de testar.</span></div>
      </div>` : ''}
    </form>`;
    const ao = $('#alwaysOpen'); ao && ao.addEventListener('change', () => { $('#hoursBox').hidden = ao.checked; });
    const testInt = (btn, which, out, extra) => { const b = $(btn); b && b.addEventListener('click', async () => {
      const o = $(out); o.textContent = 'Testando…'; o.style.color = '';
      try { const r = await api('/api/admin/integrations/test', { method: 'POST', body: { which, ...(extra ? extra() : {}) } }); o.textContent = '✓ ' + r.message; o.style.color = 'var(--ok)'; }
      catch (e) { o.textContent = e.message; o.style.color = 'var(--err)'; } }); };
    testInt('#meTest', 'frete', '#meRes', () => ({ cep: $('#meCep').value }));
    testInt('#nfTest', 'nfe', '#nfRes');
    if ($('#chLog')) api('/api/admin/channels').then((c) => {
      $('#chSt').innerHTML = [c.ml.connected ? '<span class="st-on">● Mercado Livre conectado</span>' : c.ml.configured ? '<span class="gold">● Mercado Livre: falta conectar</span>' : '', c.shopee.connected ? '<span class="st-on">● Shopee conectada</span>' : ''].filter(Boolean).join(' · ') + (c.linked ? ` · ${c.linked} produto(s) vinculado(s)` : '');
      $('#chLog').innerHTML = c.log.length ? c.log.slice(0, 8).map((l) => `<div><small class="muted">${fmtDate(l.created_at)}</small> <b>${esc(l.channel)}</b> ${esc(l.action)}: ${esc(l.detail)}${l.ok ? '' : ' <span style="color:var(--err)">✕</span>'}</div>`).join('') : '';
    }).catch(() => {});
    $('#chSync')?.addEventListener('click', async () => { const o = $('#chRes'); o.textContent = 'Sincronizando…'; try { const r = await api('/api/admin/channels/sync', { method: 'POST' }); o.textContent = `✓ ${r.synced} produto(s) atualizado(s) nos canais`; } catch (e) { o.textContent = e.message; } });
    $$('[data-copyfeed]').forEach((b) => b.addEventListener('click', () => navigator.clipboard.writeText(b.dataset.copyfeed).then(() => toast('Link copiado')).catch(() => toast(b.dataset.copyfeed))));
    $('#gTest')?.addEventListener('click', async () => { const o = $('#gRes'); o.textContent = 'Testando…'; o.style.color = '';
      const r = await api('/api/admin/google-reviews/test', { method: 'POST' }).catch((e) => ({ error: e.message })); o.textContent = r.ok ? '✓ ' + r.message : r.error; o.style.color = r.ok ? 'var(--ok)' : 'var(--err)'; });
    $('#waTest')?.addEventListener('click', async () => {
      const o = $('#waRes'); o.textContent = 'Enviando…'; o.style.color = '';
      const r = await api('/api/admin/whatsapp/test', { method: 'POST', body: { phone: $('#waTestPhone').value } }).catch((e) => ({ ok: false, error: e.message }));
      o.textContent = r.ok ? '✓ Mensagem enviada' : (r.error === 'integração desligada' ? 'Salve as configurações antes de testar.' : r.error); o.style.color = r.ok ? 'var(--ok)' : 'var(--err)';
    });
    const mtt = $('#mailTest');
    mtt && mtt.addEventListener('click', async () => {
      const out = $('#mailRes'); out.textContent = 'Enviando…'; out.style.color = '';
      try { const r = await api('/api/admin/emails/test', { method: 'POST', body: { to: $('#mailTestTo').value } }); out.textContent = r.status === 'enviado' ? '✓ Enviado! Confira a caixa de entrada.' : 'SMTP não configurado — o e-mail ficou só na caixa de saída.'; out.style.color = r.status === 'enviado' ? 'var(--ok)' : 'var(--gold)'; }
      catch (e) { out.textContent = e.message; out.style.color = 'var(--err)'; }
    });
    const mt = $('#mpTest');
    mt && mt.addEventListener('click', async () => {
      const out = $('#mpRes'); out.textContent = 'Testando…'; out.style.color = '';
      try { const r = await api('/api/admin/payments/test', { method: 'POST', body: { token: $('[name=mp_access_token]').value } }); out.textContent = `✓ Conectado à conta ${r.account}${r.test ? ' (modo TESTE)' : ''}`; out.style.color = 'var(--ok)'; }
      catch (e) { out.textContent = e.message; out.style.color = 'var(--err)'; }
    });
    const form = $('#sForm');
    form.addEventListener('click', (e) => {
      const rm = e.target.closest('[data-rm-row]'); if (rm) { rm.parentElement.remove(); return; }
      const add = e.target.closest('[data-add-row]');
      if (add) { const id = add.dataset.addRow, [tpl, cols] = TPL[id]; $('#' + id).insertAdjacentHTML('beforeend', `<div class="r" style="grid-template-columns:${cols} 34px">${tpl()}<button type="button" class="icon-btn" data-rm-row style="width:34px;height:34px">${UI.trash}</button></div>`); }
    });
    const rows = (id) => $$('#' + id + ' .r').map((r) => Object.fromEntries($$('[data-k]', r).map((i) => [i.dataset.k, i.type === 'number' ? Number(i.value) || 0 : i.value.trim()])));
    const parseRange = (v) => { const m = /^(\d{1,2})(?:[.,:](\d+))?\s*-\s*(\d{1,2})(?:[.,:](\d+))?$/.exec(String(v).trim()); return m ? [Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0), Number(m[3]) + (m[4] ? Number(m[4]) / 60 : 0)] : null; };
    $('#sSave').addEventListener('click', async () => {
      const fd = new FormData(form), body = {};
      ['store_name', 'tagline', 'whatsapp', 'phone_display', 'instagram', 'email', 'announcement', 'warranty_text', 'address', 'city', 'cep', 'map_query', 'pickup_eta', 'store_uf'].forEach((k) => body[k] = (fd.get(k) || '').trim());
      body.about_story = fd.get('about_story') || ''; body.reclameaqui_url = (fd.get('reclameaqui_url') || '').trim(); body.reclameaqui_score = (fd.get('reclameaqui_score') || '').trim();
      body.about_stats = [0, 1, 2, 3].map((i) => ({ n: ($(`[data-abn="${i}"]`) || {}).value || '', l: ($(`[data-abl="${i}"]`) || {}).value || '' })).filter((x) => x.n.trim() && x.l.trim());
      body.about_timeline = [0, 1, 2, 3, 4, 5].map((i) => ({ y: ($(`[data-aby="${i}"]`) || {}).value || '', t: ($(`[data-abt="${i}"]`) || {}).value || '' })).filter((x) => x.y.trim() && x.t.trim());
      ['club_enabled', 'reminders_enabled', 'reminders_whatsapp'].forEach((k) => { body[k] = fd.get(k) === 'on'; });
      ['club_pct_silver', 'club_pct_gold', 'club_pct_diamond', 'club_gold_at', 'club_diamond_at', 'club_expiry_days', 'club_max_use_pct', 'club_birthday_value'].forEach((k) => { body[k] = Number(fd.get(k)) || 0; });
      body.trade_enabled = fd.get('trade_enabled') === 'on'; body.trade_only_new = fd.get('trade_only_new') === 'on'; body.trade_categories = (fd.get('trade_categories') || '').trim();
      ['trade_pct_a', 'trade_pct_b', 'trade_pct_c', 'trade_months', 'trade_window_days', 'trade_min_price'].forEach((k) => { body[k] = Number(fd.get(k)) || 0; });
      body.referral_enabled = fd.get('referral_enabled') === 'on'; body.reserve_enabled = fd.get('reserve_enabled') === 'on';
      ['referral_friend_pct', 'referral_reward_value', 'referral_min_order', 'reserve_hours'].forEach((k) => { body[k] = Number(fd.get(k)) || 0; });
      if (S.me.role === 'owner' && fd.has('wa_provider')) {
        ['wa_provider', 'zapi_instance', 'zapi_token', 'zapi_client_token', 'wa_token', 'wa_phone_id', 'wa_template'].forEach((k) => { body[k] = (fd.get(k) || '').trim(); });
        body.wa_notify = fd.get('wa_notify') === 'on';
      }
      if (S.me.role === 'owner' && fd.has('ml_client_id')) ['ml_client_id', 'ml_client_secret', 'shopee_partner_id', 'shopee_partner_key', 'shopee_shop_id', 'shopee_access_token'].forEach((k) => { body[k] = (fd.get(k) || '').trim(); });
      if (S.me.role === 'owner' && fd.has('google_place_id')) { body.google_place_id = (fd.get('google_place_id') || '').trim(); body.google_places_key = (fd.get('google_places_key') || '').trim(); }
      body.ga4_id = (fd.get('ga4_id') || '').trim(); body.meta_pixel_id = (fd.get('meta_pixel_id') || '').trim();
      body.warranty_new_months = +fd.get('warranty_new_months') || 0; body.warranty_used_months = +fd.get('warranty_used_months') || 0; body.warranty_terms = fd.get('warranty_terms') || '';
      body.cart_recovery = fd.get('cart_recovery') === 'on';
      body.cart_delay_hours = Number(fd.get('cart_delay_hours')) || 1; body.cart_second_hours = Number(fd.get('cart_second_hours')) || 24;
      body.cart_coupon = (fd.get('cart_coupon') || '').trim().toUpperCase();
      if (S.me.role === 'owner' && fd.has('me_token')) {
        ['shipping_provider', 'me_token', 'shipping_services', 'focus_token', 'nfe_env', 'nfe_natureza', 'nfe_cfop_in', 'nfe_cfop_out', 'nfe_ncm_default', 'nfe_csosn', 'nfe_pis_cst', 'nfe_cofins_cst', 'nfe_icms_origem'].forEach((k) => body[k] = (fd.get(k) || '').trim());
        body.shipping_markup = Number(fd.get('shipping_markup')) || 0; body.handling_days = Math.max(0, parseInt(fd.get('handling_days')) || 0);
        body.me_sandbox = fd.get('me_sandbox') === 'on'; body.nfe_enabled = fd.get('nfe_enabled') === 'on'; body.nfe_auto = fd.get('nfe_auto') === 'on';
      }
      if (S.me.role === 'owner' && fd.has('smtp_host')) {
        ['smtp_host', 'smtp_user', 'smtp_pass', 'mail_from', 'mail_from_name'].forEach((k) => body[k] = (fd.get(k) || '').trim());
        body.smtp_port = Number(fd.get('smtp_port')) || 587; body.smtp_secure = fd.get('smtp_secure') === 'on';
        body.require_email_verification = fd.get('require_email_verification') === 'on';
      }
      body.whatsapp = digits(body.whatsapp); body.instagram = body.instagram.replace('@', '');
      ['free_shipping_above', 'pix_discount', 'max_installments', 'installments_no_interest'].forEach((k) => body[k] = Number(fd.get(k)) || 0);
      body.max_installments = Math.max(1, body.max_installments);
      body.installments_no_interest = Math.min(body.max_installments, Math.max(1, body.installments_no_interest));
      body.pickup_enabled = fd.get('pickup_enabled') === 'on';
      body.reviews_moderation = fd.get('reviews_moderation') === 'on';
      body.always_open = fd.get('always_open') === 'on';
      ['legal_name', 'cnpj', 'dpo_email', 'policies_updated'].forEach((k) => body[k] = (fd.get(k) || '').trim());
      body.faq = rows('faqRep').filter((x) => x.q && x.a);
      if (S.me.role === 'owner') { body.online_payments = fd.get('online_payments') === 'on'; body.mp_access_token = fd.get('mp_access_token') || ''; body.mp_webhook_secret = fd.get('mp_webhook_secret') || ''; }
      body.hours = rows('hoursRep').filter((h) => h.days);
      body.delivery_zones = rows('zonesRep').filter((z) => z.name);
      body.consultants = rows('consRep').filter((c) => c.name).map((c) => ({ ...c, whatsapp: digits(c.whatsapp) }));
      body.open_hours = { weekdays: parseRange(fd.get('oh_week')), saturday: parseRange(fd.get('oh_sat')), sunday: parseRange(fd.get('oh_sun')) };
      try { await api('/api/admin/settings', { method: 'PUT', body }); S.settings = { ...S.settings, ...body }; toast('Configurações salvas'); }
      catch (e) { toast(e.message, 1); }
    });
  }

  boot();
})();
