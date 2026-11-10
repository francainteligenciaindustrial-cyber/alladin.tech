/* Aladdin Tech — vitrine (SPA sem framework) */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const UI = ICONS.ui, ART = ICONS.art;
  const app = $('#app');

  /* ---------- utilidades ---------- */
  const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const setRef = (code, src) => { code = String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20); if (code) save('at_ref', { code, src, ts: Date.now() }); };
  const getRef = () => { const r = load('at_ref', null); return r && r.code && Date.now() - r.ts < 30 * 864e5 ? r : null; };
  try { const u = new URL(location.href), ind = u.searchParams.get('indica'); if (ind) { save('at_indica', { code: ind.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10), ts: Date.now() }); u.searchParams.delete('indica'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } } catch {}
  const getIndica = () => { const r = load('at_indica', null); return r && r.code && Date.now() - r.ts < 60 * 864e5 ? r.code : ''; };
  try { const u = new URL(location.href), v = u.searchParams.get('v'); if (v) { setRef(v, 'link'); u.searchParams.delete('v'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } } catch {}
  const sellerList = () => S.settings.sellers || [];
  const conciergePeople = () => {
    const sel = sellerList().map((x) => ({ name: x.name, role: x.title || 'Consultor', whatsapp: x.whatsapp, photo: x.photo, ref: x.ref }));
    return sel.length ? sel : (S.settings.consultants || []).length ? S.settings.consultants : [{ name: 'Equipe Aladdin', role: 'Atendimento' }];
  };
  const avatarHTML = (p) => p.photo ? `<span class="avatar ph"><img src="${esc(p.photo)}" alt="" loading="lazy"></span>` : `<span class="avatar">${esc((p.name || '?').trim()[0])}</span>`;
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  async function api(url, opts = {}) {
    const r = await fetch(url, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Não foi possível concluir. Tente novamente.');
    return d;
  }
  function toast(msg) {
    const t = $('#toast');
    t.innerHTML = UI.check + `<span>${esc(msg)}</span>`;
    t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2600);
  }

  const S = { settings: {}, cats: [], cart: load('at_cart', []), coupon: load('at_coupon', null) };

  const waNumber = (n) => digits(n || S.settings.whatsapp);
  const waLink = (text, n) => `https://wa.me/${waNumber(n)}?text=${encodeURIComponent(text)}`;
  const installmentsFor = (price) => {
    const n = Number(S.settings.installments_no_interest) || Number(S.settings.max_installments) || 1;
    return `${n}x de ${brl(price / n)} sem juros`;
  };
  const pixPrice = (price) => price * (1 - (Number(S.settings.pix_discount) || 0) / 100);

  function thumb(p, cls = '') {
    const img = (p.images || [])[0] || p.image;
    if (img) return `<div class="thumb ${cls}"><img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" decoding="async"></div>`;
    return `<div class="thumb ${cls}"><div class="art">${ART[p.category_icon || p.icon] || ART.acessorios}</div></div>`;
  }
  function stars(r, size) {
    const v = Math.round(Number(r) || 0);
    return `<span class="stars"${size ? ` style="--s:${size}px"` : ''}>${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= v ? '' : 'off'}">${UI.star}</span>`).join('')}</span>`;
  }
  function isOpenNow() {
    if (S.settings.always_open) return true;
    const oh = S.settings.open_hours; if (!oh) return false;
    const d = new Date(), day = d.getDay(), h = d.getHours() + d.getMinutes() / 60;
    const range = day === 0 ? oh.sunday : day === 6 ? oh.saturday : oh.weekdays;
    return !!range && h >= range[0] && h < range[1];
  }
  const fullAddress = () => [S.settings.address, S.settings.city, S.settings.cep].filter(Boolean).join(', ');
  const mapQuery = () => S.settings.map_query && S.settings.map_query !== 'Aladdin Tech' ? S.settings.map_query : fullAddress();

  /* ---------- sacola ---------- */
  const cartKey = (id, opts) => id + '|' + JSON.stringify(opts || {});
  const cartCount = () => S.cart.reduce((a, i) => a + i.qty, 0);
  const cartSubtotal = () => S.cart.reduce((a, i) => a + i.price * i.qty, 0);
  function persistCart() { save('at_cart', S.cart); updateCartBadge(); renderCart(); syncCartSoon(); }
  let cartSyncT;
  function syncCartSoon(extra) {
    clearTimeout(cartSyncT);
    cartSyncT = setTimeout(() => {
      const ck = (typeof CK !== 'undefined' && CK) || {};
      const guest = !S.customer && ck.customer && ck.customer.email && ck.cartConsent;
      if (!S.customer && !guest && !load('at_cart_token', '')) return; // visitante anônimo: nada a lembrar
      api('/api/cart/sync', { method: 'POST', body: { token: load('at_cart_token', ''), items: S.cart.map((i) => ({ id: i.id, qty: i.qty, options: i.options })),
        email: guest ? ck.customer.email : '', name: ck.customer && ck.customer.name, phone: ck.customer && ck.customer.phone, consent: S.customer ? undefined : !!ck.cartConsent, ...(extra || {}) } })
        .then((r) => { if (r.token) save('at_cart_token', r.token); }).catch(() => {});
    }, 1200);
  }
  function addToCart(p, options = {}, qty = 1) {
    const key = cartKey(p.id, options);
    const ex = S.cart.find((i) => i.key === key);
    const max = Math.max(0, p.stock);
    if (max <= 0) return toast('Produto esgotado no momento');
    if (ex) ex.qty = Math.min(max, ex.qty + qty);
    else S.cart.push({ key, id: p.id, slug: p.slug, name: p.name, price: p.price, image: (p.images || [])[0] || '', icon: p.category_icon, options, qty: Math.min(max, qty), stock: max });
    persistCart();
    const c = $('#cartCount'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
    toast('Adicionado à sacola');
    track('add_to_cart', { id: p.id, name: p.name, price: p.price, qty });
  }
  function updateCartBadge() {
    const n = cartCount(), c = $('#cartCount');
    c.textContent = n; c.classList.toggle('on', n > 0);
  }
  function optsText(o) { return Object.entries(o || {}).map(([k, v]) => `${k}: ${v}`).join(' · '); }
  function lineItemHTML(i, editable = true) {
    return `<div class="line-item" data-key="${esc(i.key)}">
      <a href="/produto/${esc(i.slug)}" data-link>${thumb({ images: i.image ? [i.image] : [], category_icon: i.icon, name: i.name }, 'sm')}</a>
      <div class="li-info">
        <b>${esc(i.name)}</b>${optsText(i.options) ? `<small>${esc(optsText(i.options))}</small>` : ''}
        <div class="li-bottom">
          ${editable ? `<div class="qty"><button data-q="-1" aria-label="Diminuir">${UI.minus}</button><span>${i.qty}</span><button data-q="1" aria-label="Aumentar">${UI.plus}</button></div>`
          : `<small>Qtd. ${i.qty}</small>`}
          <span>${brl(i.price * i.qty)}</span>
          ${editable ? `<button class="icon-btn rm" data-rm aria-label="Remover">${UI.trash}</button>` : ''}
        </div>
      </div></div>`;
  }
  function freeBarHTML(sub) {
    const lim = Number(S.settings.free_shipping_above) || 0;
    if (!lim) return '';
    const pct = Math.min(100, (sub / lim) * 100);
    return `<div class="free-bar">${sub >= lim ? 'Você ganhou <b class="gold">frete grátis</b> na entrega' : `Faltam <b>${brl(lim - sub)}</b> para frete grátis`}<div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }
  function renderCart() {
    const body = $('#cartBody'), foot = $('#cartFoot');
    if (!S.cart.length) {
      body.innerHTML = `<div class="empty-cart"><div class="art">${ART.acessorios}</div><p>Sua sacola está vazia.</p><a href="/loja" data-link class="btn btn-line btn-sm">Explorar a loja</a></div>`;
      foot.innerHTML = ''; return;
    }
    body.innerHTML = S.cart.map((i) => lineItemHTML(i)).join('');
    const sub = cartSubtotal();
    foot.innerHTML = `${freeBarHTML(sub)}
      <div class="sum-row total"><span>Subtotal</span><span>${brl(sub)}</span></div>
      <div class="sum-row"><span>No Pix (${S.settings.pix_discount || 0}% off)</span><span class="gold">${brl(pixPrice(sub))}</span></div>
      <a href="/checkout" data-link class="btn btn-gold btn-block">Finalizar compra ${UI.arrow}</a>
      <a href="${waLink('Olá! Gostaria de ajuda para finalizar minha compra:\n' + S.cart.map((i) => `• ${i.qty}x ${i.name}${optsText(i.options) ? ' (' + optsText(i.options) + ')' : ''}`).join('\n'))}" target="_blank" rel="noopener" class="btn btn-line btn-block">${UI.wa} Comprar com um consultor</a>`;
  }
  function cartAction(e) {
    const li = e.target.closest('.line-item'); if (!li) return;
    const item = S.cart.find((i) => i.key === li.dataset.key); if (!item) return;
    const q = e.target.closest('[data-q]');
    if (q) { item.qty = Math.max(1, Math.min(item.stock || 99, item.qty + Number(q.dataset.q))); persistCart(); if (location.pathname === '/checkout') viewCheckout(); }
    if (e.target.closest('[data-rm]')) { S.cart = S.cart.filter((i) => i !== item); persistCart(); if (location.pathname === '/checkout') viewCheckout(); }
  }
  function openCart(open = true) {
    $('#cartDrawer').classList.toggle('open', open);
    $('#scrim').classList.toggle('on', open);
    document.body.style.overflow = open ? 'hidden' : '';
  }

  /* prova social no estilo dos grandes marketplaces: nota, número de avaliações e vendidos */
  const fmtRate = (r) => String(r || 0).replace('.', ',');
  function socialProof(p) {
    if (!p.rating_count && !p.sold_label) return '';
    return `<div class="rating-mini sp-line">${p.rating_count ? `<span class="sp-rate"><b>${fmtRate(p.rating)}</b>${stars(p.rating)}<span class="muted">(${p.rating_count})</span></span>` : ''}${p.rating_count && p.sold_label ? '<span class="sp-sep" aria-hidden="true">|</span>' : ''}${p.sold_label ? `<span class="sp-sold">${esc(p.sold_label)}</span>` : ''}</div>`;
  }
  const bestChip = (p) => p.best_rank ? `<a href="/mais-vendidos?categoria=${esc(p.best_cat_slug)}" data-link class="best-chip">${p.best_rank}º mais vendido em ${esc(p.best_cat)}</a>` : '';
  /* ---------- cartões de produto ---------- */
  function productCard(p) {
    const off = p.old_price > p.price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
    return `<article class="pcard reveal">
      <a href="/produto/${esc(p.slug)}" data-link class="media">
        <div class="badges">${p.best_rank ? `<span class="badge best">${p.best_rank === 1 ? 'Mais vendido' : p.best_rank + 'º mais vendido'}</span>` : ''}${p.promo ? '<span class="badge gold">Oferta</span>' : ''}${p.condition && p.condition !== 'Novo' ? `<span class="badge">${esc(p.condition)}${p.grade ? ' · ' + esc(p.grade) : ''}${p.battery_health ? ' · ' + p.battery_health + '%' : ''}</span>` : ''}${off ? `<span class="badge off">−${off}%</span>` : ''}${p.coming_soon ? '<span class="badge gold">Em breve</span>' : p.stock <= 0 ? '<span class="badge">Esgotado</span>' : ''}</div>
        ${thumb(p)}
        ${p.promo && p.promo_end && timeLeft(p.promo_end) ? `<span class="cd-wrap">${UI.clock}<span data-countdown="${esc(p.promo_end)}">${timeLeft(p.promo_end)}</span></span>` : ''}
      </a>
      ${heartBtn(p.id, 'on-card')}
      <div class="info">
        <span class="brand-l">${esc(p.brand || p.category_name || '')}</span>
        <a href="/produto/${esc(p.slug)}" data-link><h3>${esc(p.name)}</h3></a>
        ${p.short ? `<p class="short">${esc(p.short)}</p>` : ''}
        ${socialProof(p)}
        <div class="price-row">
          <div>
            ${off ? `<span class="price-old">${brl(p.old_price)}</span>` : ''}
            ${p.coming_soon && !(p.price > 0) ? '<span class="price soon-price">Preço a confirmar</span>' : `<span class="price">${brl(p.price)}</span>`}
            ${p.coming_soon ? `<span class="price-pix gold">${esc(p.coming_eta || 'Em breve')}</span>` : `<span class="price-pix">${brl(pixPrice(p.price))} no Pix</span>`}
          </div>
          ${p.coming_soon ? `<a class="quick-add" href="/produto/${esc(p.slug)}" data-link aria-label="Entrar na fila do ${esc(p.name)}">${UI.bell || UI.plus}</a>` : `<button class="quick-add" data-add="${p.id}" aria-label="Adicionar ${esc(p.name)} à sacola" ${p.stock <= 0 ? 'disabled' : ''}>${UI.plus}</button>`}
        </div>
      </div>
    </article>`;
  }
  const productCache = new Map();
  function cacheProducts(list) { list.forEach((p) => productCache.set(String(p.id), p)); return list; }
  function quickAdd(btn) {
    const p = productCache.get(btn.dataset.add); if (!p) return;
    if ((p.options || []).length) return navigate('/produto/' + p.slug); // escolher opções
    addToCart(p); openCart(true);
  }

  /* ---------- layout fixo ---------- */
  const shortName = { 'apple-watch': 'Watch', airpods: 'AirPods', macbook: 'Mac', 'bicicletas-eletricas': 'Bikes elétricas' };
  function renderChrome() {
    const s = S.settings;
    $('#announce').textContent = s.announcement || '';
    $('#announce').style.display = s.announcement ? '' : 'none';
    $('.brand-lamp').innerHTML = ICONS.lamp;
    $('#menuBtn').innerHTML = UI.menu;
    $('#searchBtn').innerHTML = UI.search;
    $('#wishBtn').insertAdjacentHTML('afterbegin', UI.heart); updateWishBadge();
    renderAcctBtn();
    $('#cartBtn').insertAdjacentHTML('afterbegin', UI.bag);
    $('#cartClose').innerHTML = UI.close;
    $('#searchClose').innerHTML = UI.close;
    $('.search-ico').innerHTML = UI.search;
    $('#conciergeBtn').insertAdjacentHTML('beforeend', UI.chat);

    const navLinks = (dup) => `<a href="/loja" data-link ${dup}>Loja</a><a href="/ofertas" data-link class="nav-offer" ${dup}>Ofertas</a><a href="/mais-vendidos" data-link ${dup}>Mais vendidos</a>` +
      S.cats.map((c) => `<a href="/categoria/${c.slug}" data-link ${dup}>${esc(shortName[c.slug] || c.name)}</a>`).join('') +
      `<a href="/upgrade" data-link ${dup}>Upgrade</a><a href="/como-chegar" data-link ${dup}>Visite-nos</a>`;
    // menu em faixa contínua deslizando para a esquerda (a 2ª cópia fecha o loop sem emenda)
    $('#nav').innerHTML = `<div class="nav-track"><div class="nav-set">${navLinks('')}</div><div class="nav-set" aria-hidden="true">${navLinks('tabindex="-1"')}</div></div>`;
    $('#mobileNav').innerHTML = `<a href="/loja" data-link>Toda a loja ${UI.chev}</a><a href="/ofertas" data-link class="gold">Ofertas ${UI.chev}</a><a href="/mais-vendidos" data-link>Mais vendidos ${UI.chev}</a>` +
      S.cats.map((c) => `<a href="/categoria/${c.slug}" data-link>${esc(c.name)} ${UI.chev}</a>`).join('') +
      `<a href="/upgrade" data-link>Upgrade — troque seu aparelho ${UI.chev}</a><a href="/avaliacoes" data-link>Avaliações ${UI.chev}</a><a href="/como-chegar" data-link>Como chegar ${UI.chev}</a>`;

    const year = new Date().getFullYear();
    $('#footer').innerHTML = `<div class="wrap">
      <div class="footer-grid">
        <div>
          <a href="/" data-link class="brand"><span class="brand-lamp">${ICONS.lamp}</span><span class="brand-text"><span><b>Aladdin</b> Tech</span><small>${esc(s.tagline || '')}</small></span></a>
          <p class="about">Tecnologia premium com procedência, garantia e um atendimento que faz a diferença. Novos e seminovos selecionados — e o seu usado vale como parte do upgrade.</p>
          <div class="socials">
            ${s.instagram ? `<a href="https://instagram.com/${esc(s.instagram.replace('@', ''))}" target="_blank" rel="noopener" aria-label="Instagram">${UI.ig}</a>` : ''}
            <a href="${waLink('Olá! Vim pelo site da Aladdin Tech.')}" target="_blank" rel="noopener" aria-label="WhatsApp">${UI.wa}</a>
            <a href="/como-chegar" data-link aria-label="Como chegar">${UI.pin}</a>
          </div>
        </div>
        <div><h5>Loja</h5><ul>${S.cats.map((c) => `<li><a href="/categoria/${c.slug}" data-link>${esc(c.name)}</a></li>`).join('')}</ul></div>
        <div><h5>Atendimento</h5><ul>
          <li><a href="/minha-conta" data-link>Minha conta</a></li>
          <li><a href="/lista-de-desejos" data-link>Lista de desejos</a></li>
          <li><a href="/perguntas-frequentes" data-link>Perguntas frequentes</a></li>
          <li><a href="/garantia" data-link>Consultar garantia</a></li>
          <li><a href="/comparar" data-link>Comparar iPhones</a></li>
          <li><a href="/troca-garantida" data-link>Troca Garantida</a></li>
          <li><a href="/guias" data-link>Guias</a></li>
          <li><a href="/nossa-historia" data-link>Nossa história</a></li>
          <li><a href="/assistencia" data-link>Assistência técnica</a></li>
          <li><a href="#" data-install-open>Instalar o app</a></li>
          <li><a href="#" data-concierge>Falar com consultor</a></li>
          <li><a href="/upgrade" data-link>Upgrade (troca)</a></li>
          <li><a href="/avaliacoes" data-link>Avaliações</a></li>
          <li><a href="/como-chegar" data-link>Como chegar</a></li>
          <li><span>${esc(s.warranty_text || '')}</span></li>
        </ul></div>
        <div><h5>Visite-nos</h5><ul>
          <li><span>${esc(s.address || '')}<br>${esc(s.city || '')}</span></li>
          ${s.always_open ? '<li><span class="foot-247"><b>24h</b> · todos os dias, inclusive feriados</span></li>' : (s.hours || []).map((h) => `<li><span>${esc(h.days)} · ${esc(h.time)}</span></li>`).join('')}
          ${s.phone_display ? `<li><a href="${waLink('Olá!')}" target="_blank" rel="noopener">${esc(s.phone_display)}</a></li>` : ''}
          ${s.email ? `<li><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></li>` : ''}
        </ul></div>
      </div>
      <div class="footer-bottom">
        <span>© ${year} ${esc(s.store_name || 'Aladdin Tech')} · Todos os direitos reservados${s.cnpj ? ' · CNPJ ' + esc(s.cnpj) : ''} · <a href="/privacidade" data-link class="staff-link">Privacidade</a> · <a href="/cookies" data-link class="staff-link">Cookies</a> · <a href="/admin" class="staff-link">${UI.lock} Área do lojista</a></span>
        <div class="pay-icons"><span>PIX</span><span>VISA</span><span>MASTER</span><span>ELO</span><span>AMEX</span></div>
      </div></div>`;
    updateCartBadge(); renderCart(); renderConcierge();
  }

  /* ---------- consultor ---------- */
  const CG = { person: 0, topic: 'Quero comprar um produto' };
  function renderConcierge() {
    const people = conciergePeople();
    const online = isOpenNow();
    const topics = ['Quero comprar um produto', 'Upgrade / troca do meu aparelho', 'Acompanhar meu pedido', 'Garantia e assistência', 'Outro assunto'];
    $('#concierge').innerHTML = `
      <div class="cg-head">
        <span class="eyebrow">Concierge</span>
        <h4>Fale com um <span class="serif gold">consultor</span></h4>
        <p>${S.settings.always_open ? 'Online 24h, todos os dias — resposta em minutos.' : online ? 'Estamos online agora — resposta em minutos.' : 'Deixe sua mensagem, respondemos assim que abrirmos.'}</p>
      </div>
      <div class="cg-body">
        <span class="cg-label">Escolha quem vai te atender</span>
        <div class="cg-people">${people.map((p, i) => `
          <button class="cg-person ${i === CG.person ? 'on' : ''}" data-person="${i}">
            ${avatarHTML(p)}
            <span><b>${esc(p.name)}</b><small>${esc(p.role || '')}</small></span>
            <span class="status ${online ? 'on' : ''}">${online ? 'Online' : 'Offline'}</span>
          </button>`).join('')}</div>
        <span class="cg-label">Assunto</span>
        <div class="cg-topics">${topics.map((t) => `<button class="chip ${t === CG.topic ? 'on' : ''}" data-topic="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <div class="field"><textarea id="cgMsg" rows="3" placeholder="Conte o que você procura (opcional)"></textarea></div>
        <button class="btn btn-gold btn-block" id="cgGo">${UI.wa} Iniciar conversa no WhatsApp</button>
      </div>`;
  }
  function conciergeClick(e) {
    const p = e.target.closest('[data-person]');
    if (p) { CG.person = +p.dataset.person; $$('.cg-person').forEach((b) => b.classList.toggle('on', b === p)); return; }
    const t = e.target.closest('[data-topic]');
    if (t) { CG.topic = t.dataset.topic; $$('.cg-topics .chip').forEach((b) => b.classList.toggle('on', b === t)); return; }
    if (e.target.closest('#cgGo')) {
      const person = conciergePeople()[CG.person] || {};
      if (person.ref) setRef(person.ref, 'whatsapp');
      const msg = $('#cgMsg').value.trim();
      const cp = S.currentProduct, so = optsText(S.currentSel || {});
      const ctx = location.pathname.startsWith('/produto/') && cp ? `\nEstou vendo: ${cp.name}${so ? ' (' + so + ')' : ''} — ${brl(cp.price)}\n${location.origin}/produto/${cp.slug}` : '';
      const text = `Olá${person.name ? ', ' + person.name : ''}! Vim pelo site da Aladdin Tech.\nAssunto: ${CG.topic}${ctx}${msg ? '\n\n' + msg : ''}`;
      track('lead', { method: 'whatsapp' });
      window.open(waLink(text, person.whatsapp), '_blank', 'noopener');
    }
  }
  function openConcierge(open) {
    const c = $('#concierge');
    const on = open ?? !c.classList.contains('open');
    c.classList.toggle('open', on);
    $('#conciergeBtn').innerHTML = (on ? UI.close : UI.chat) + '<span class="concierge-pulse"></span>';
  }

  /* ---------- busca ---------- */
  function openSearch(on = true) {
    $('#searchLayer').classList.toggle('open', on);
    document.body.style.overflow = on ? 'hidden' : '';
    if (on) setTimeout(() => $('#searchInput').focus(), 50);
  }
  const doSearch = debounce(async (q) => {
    const box = $('#searchResults');
    if (q.trim().length < 2) { box.innerHTML = ''; return; }
    const list = cacheProducts(await api('/api/products?limit=8&q=' + encodeURIComponent(q)));
    box.innerHTML = list.length ? list.map((p) => `<a class="search-hit" href="/produto/${esc(p.slug)}" data-link>${thumb(p, 'sm')}<div><b>${esc(p.name)}</b><span>${esc(p.category_name || '')}</span></div><span class="price">${brl(p.price)}</span></a>`).join('')
      + `<a href="/loja?q=${encodeURIComponent(q)}" data-link class="link-arrow" style="margin:14px 12px">Ver todos os resultados ${UI.arrow}</a>`
      : `<p class="muted" style="padding:12px">Nada encontrado para “${esc(q)}”. Fale com um consultor — talvez tenhamos sob encomenda.</p>`;
  }, 220);

  /* ---------- seções reutilizáveis ---------- */
  function sectionHead(eyebrow, title, sub, link) {
    return `<div class="section-head reveal"><div><span class="eyebrow">${eyebrow}</span><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${link || ''}</div>`;
  }
  function perksHTML() {
    const s = S.settings;
    return `<div class="perks reveal">
      <div class="perk"><i>${UI.shield}</i><div><b>Procedência garantida</b><span>Nota fiscal e garantia em todos os aparelhos.</span></div></div>
      <div class="perk"><i>${UI.truck}</i><div><b>Entrega expressa</b><span>${s.delivery_zones && s.delivery_zones[0] ? esc(s.delivery_zones[0].eta) : 'Receba rapidinho'} na cidade.</span></div></div>
      <div class="perk"><i>${UI.store}</i><div><b>Retire na loja</b><span>${esc(s.pickup_eta || 'Compre online e retire.')}</span></div></div>
      <div class="perk"><i>${UI.card}</i><div><b>Até ${s.max_installments || 12}x no cartão</b><span>Ou ${s.pix_discount || 0}% de desconto pagando no Pix.</span></div></div>
    </div>`;
  }
  function visitHTML(full) {
    const s = S.settings, q = encodeURIComponent(mapQuery()), open = isOpenNow();
    return `<div class="visit reveal">
      <div class="visit-info">
        <div><span class="eyebrow">Como chegar</span><h2>Venha viver a <span class="serif gold">experiência</span> Aladdin</h2></div>
        <div class="visit-row"><i>${UI.pin}</i><div><b>Endereço</b><span>${esc(s.address)}<br>${esc(s.city)}${s.cep ? ' · CEP ' + esc(s.cep) : ''}</span></div></div>
        ${s.always_open ? `<div class="open-247"><div class="o-num">24<span>/</span>7</div><div><b>Sempre aberta</b><span>24 horas por dia, 7 dias por semana — inclusive fins de semana e feriados.</span><em class="open-now on">Aberto agora</em></div></div>`
        : `<div class="visit-row"><i>${UI.clock}</i><div><b>Horário <span class="open-now ${open ? 'on' : ''}">${open ? 'Aberto agora' : 'Fechado agora'}</span></b>
          <ul>${(s.hours || []).map((h) => `<li><span>${esc(h.days)}</span><span>${esc(h.time)}</span></li>`).join('')}</ul></div></div>`}
        ${full ? `<div class="visit-row"><i>${UI.phone}</i><div><b>Contato</b><span>${esc(s.phone_display || '')}${s.email ? '<br>' + esc(s.email) : ''}</span></div></div>` : ''}
        <div class="route-btns">
          <a class="btn btn-gold btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${q}">${UI.nav} Google Maps</a>
          <a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://waze.com/ul?q=${q}&navigate=yes">Waze</a>
          <a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=${q}">${UI.car} Uber</a>
        </div>
      </div>
      <div class="map"><iframe title="Mapa da loja" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${q}&z=16&output=embed"></iframe></div>
    </div>`;
  }

  /* ---------- fotos: redimensiona no navegador antes de enviar ---------- */
  function resizeForUpload(file, max = 1280, quality = .82) {
    return new Promise((res, rej) => {
      if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) return rej(new Error('Envie fotos em JPG, PNG ou WEBP.'));
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => rej(new Error('Não foi possível ler esta imagem.'));
        img.src = r.result;
      };
      r.onerror = rej; r.readAsDataURL(file);
    });
  }

  /* ---------- visualizador de fotos ---------- */
  function lightbox(urls, idx = 0, onChange) {
    let i = idx;
    const el = document.createElement('div'); el.className = 'lightbox';
    const draw = () => {
      el.innerHTML = `<button class="icon-btn lb-x" aria-label="Fechar">${UI.close}</button>
        ${urls.length > 1 ? `<button class="lb-nav prev" aria-label="Anterior">${UI.chev}</button><button class="lb-nav next" aria-label="Próxima">${UI.chev}</button>` : ''}
        <img src="${esc(urls[i])}" alt="Foto ${i + 1}"><span class="lb-count">${i + 1} / ${urls.length}</span>`;
    };
    const close = () => { el.classList.remove('on'); document.removeEventListener('keydown', key); setTimeout(() => el.remove(), 250); onChange && onChange(i); };
    const go = (d) => { i = (i + d + urls.length) % urls.length; draw(); };
    let tx = null, swiped = false;
    el.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; swiped = false; }, { passive: true });
    el.addEventListener('touchend', (e) => { if (tx === null || urls.length < 2) return; const dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 45) { swiped = true; go(dx < 0 ? 1 : -1); } }, { passive: true });
    const key = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    el.addEventListener('click', (e) => {
      if (swiped) { swiped = false; return; }
      if (e.target.closest('.prev')) return go(-1);
      if (e.target.closest('.next')) return go(1);
      if (e.target.tagName !== 'IMG') close();
    });
    draw(); document.body.appendChild(el); document.addEventListener('keydown', key);
    requestAnimationFrame(() => el.classList.add('on'));
  }

  /* ---------- janela (sheet) genérica ---------- */
  function openSheet(html) {
    const scrim = document.createElement('div'); scrim.className = 'sheet-scrim';
    scrim.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(scrim); document.body.style.overflow = 'hidden';
    const close = () => { scrim.classList.remove('on'); document.body.style.overflow = ''; setTimeout(() => scrim.remove(), 300); };
    scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(); });
    $$('[data-close]', scrim).forEach((b) => b.addEventListener('click', close));
    requestAnimationFrame(() => scrim.classList.add('on'));
    return { el: $('.sheet', scrim), close };
  }

  const RATING_LABEL = ['', 'Péssimo', 'Ruim', 'Regular', 'Bom', 'Excelente'];
  const fmtDay = (s) => s ? new Date(s.replace(' ', 'T')).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  /* ---------- conta do cliente ---------- */
  function renderAcctBtn() {
    const b = $('#acctBtn');
    b.innerHTML = S.customer ? `<span class="acct-initial">${esc((S.customer.name || '?').trim()[0].toUpperCase())}</span>` : UI.user;
    b.title = S.customer ? `Olá, ${S.customer.name.split(' ')[0]}` : 'Entrar ou criar conta';
  }
  function authSheet(mode = 'login', reason = '', onDone) {
    const sh = openSheet(`
      <div class="sheet-head"><div><span class="eyebrow">Sua conta Aladdin</span><h3 id="auTitle"></h3></div><button class="icon-btn" data-close aria-label="Fechar">${UI.close}</button></div>
      <div class="sheet-body">
        ${reason ? `<div class="auth-reason">${UI.star}<span>${esc(reason)}</span></div>` : ''}
        <div class="seg-tabs" id="auTabs"><button data-m="login">Entrar</button><button data-m="register">Criar conta</button></div>
        <form id="auForm" novalidate style="display:grid;gap:14px"></form>
        <p class="auth-foot">${UI.lock} Seus dados ficam protegidos e nunca são compartilhados.</p>
      </div>`);
    const pwField = (name, label, ac, ph = '') => `<div class="field"><label>${label}</label><div class="pw-wrap"><input name="${name}" type="password" autocomplete="${ac}" required placeholder="${ph}"><button type="button" class="pw-eye" data-eye aria-label="Mostrar senha">${UI.eye || '👁'}</button></div></div>`;
    const draw = () => {
      const titles = { login: 'Que bom ter você <span class="serif gold">de volta</span>', register: 'Crie sua <span class="serif gold">conta</span>', forgot: 'Esqueceu a <span class="serif gold">senha?</span>' };
      $('#auTitle', sh.el).innerHTML = titles[mode];
      $('#auTabs', sh.el).hidden = mode === 'forgot';
      $$('#auTabs button', sh.el).forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
      const F = $('#auForm', sh.el);
      if (mode === 'forgot') {
        F.innerHTML = `<p class="muted" style="margin:0;font-size:13.5px">Digite o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.</p>
          <div class="field"><label>E-mail</label><input name="email" type="email" autocomplete="email" required></div>
          <p class="form-msg" id="auMsg"></p>
          <button class="btn btn-gold btn-block" type="submit">Enviar link</button>
          <button type="button" class="btn-ghost" data-go="login" style="justify-self:center">← Voltar para entrar</button>`;
      } else if (mode === 'register') {
        F.innerHTML = `
          <div class="field"><label>Nome e sobrenome</label><input name="name" autocomplete="name" maxlength="80" required></div>
          <div class="row c2"><div class="field"><label>E-mail</label><input name="email" type="email" autocomplete="email" maxlength="120" required></div>
            <div class="field"><label>Confirme o e-mail</label><input name="email_confirm" type="email" autocomplete="off" maxlength="120" required></div></div>
          <div class="field"><label>WhatsApp</label><input name="phone" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="(00) 00000-0000"></div>
          <div class="row c2">${pwField('password', 'Senha', 'new-password', '8+ letras e números')}${pwField('password_confirm', 'Confirme a senha', 'new-password')}</div>
          <div class="pw-meter"><i id="auBar"></i></div>
          <label class="check"><input type="checkbox" name="marketing"><span>Quero receber ofertas e lançamentos por e-mail</span></label>
          ${getIndica() && S.settings.referral_enabled ? `<div class="auth-reason">${UI.spark}<span>Você foi indicado! Ao criar a conta você ganha <b>${S.settings.referral_friend_pct || 5}% OFF</b> na primeira compra.</span></div>` : ''}
          <p class="form-msg err" id="auMsg"></p>
          <button class="btn btn-gold btn-block" type="submit">Criar minha conta</button>
          <p class="muted" style="font-size:12px;margin:0;text-align:center">Enviaremos um link para confirmar seu e-mail.</p>`;
        const pw = $('[name=password]', F);
        pw.addEventListener('input', () => {
          const v = pw.value; let sc = 0;
          if (v.length >= 8) sc++; if (v.length >= 12) sc++; if (/[a-z]/.test(v) && /[A-Z]/.test(v)) sc++; if (/\d/.test(v)) sc++; if (/[^a-zA-Z0-9]/.test(v)) sc++;
          const bar = $('#auBar', sh.el); bar.style.width = sc * 20 + '%'; bar.style.background = sc <= 2 ? 'var(--err)' : sc <= 3 ? 'var(--gold)' : 'var(--ok)';
        });
      } else {
        F.innerHTML = `<div class="field"><label>E-mail</label><input name="email" type="email" autocomplete="email" maxlength="120" required></div>
          ${pwField('password', 'Senha', 'current-password')}
          <button type="button" class="btn-ghost" data-go="forgot" style="justify-self:end;font-size:13px;color:var(--gold)">Esqueci minha senha</button>
          <p class="form-msg err" id="auMsg"></p>
          <button class="btn btn-gold btn-block" type="submit">Entrar</button>`;
      }
      const first = $('input', F); first && first.focus();
    };
    draw();
    sh.el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-m],[data-go]'); if (t) { mode = t.dataset.m || t.dataset.go; draw(); return; }
      const eye = e.target.closest('[data-eye]'); if (eye) { const i = eye.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; }
    });
    $('#auForm', sh.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const F = e.target, fd = Object.fromEntries(new FormData(F)), btn = $('button[type=submit]', F), msg = $('#auMsg', sh.el);
      msg.className = 'form-msg err'; msg.textContent = '';
      if (mode === 'register') {
        if (fd.email.trim().toLowerCase() !== fd.email_confirm.trim().toLowerCase()) { msg.textContent = 'Os e-mails digitados não conferem.'; return; }
        if (fd.password !== fd.password_confirm) { msg.textContent = 'As senhas digitadas não conferem.'; return; }
        if (fd.password.length < 8 || !/[a-zA-Z]/.test(fd.password) || !/\d/.test(fd.password)) { msg.textContent = 'A senha precisa de 8+ caracteres, com letras e números.'; return; }
        fd.marketing = !!fd.marketing;
        if (getIndica()) fd.indica = getIndica();
      }
      btn.disabled = true;
      try {
        if (mode === 'forgot') {
          const r = await api('/api/account/forgot', { method: 'POST', body: fd });
          msg.className = 'form-msg ok'; msg.textContent = r.message; btn.disabled = false; return;
        }
        const r = await api('/api/account/' + mode, { method: 'POST', body: fd });
        S.customer = r.customer; renderAcctBtn(); sh.close(); syncWish();
        toast(mode === 'login' ? `Olá, ${r.customer.name.split(' ')[0]}!` : getIndica() ? 'Conta criada! Seu cupom de boas-vindas foi para o seu e-mail.' : 'Conta criada! Confira seu e-mail para confirmar.');
        if (mode === 'register') save('at_indica', null);
        onDone && setTimeout(onDone, 320);
        if (location.pathname === '/minha-conta') viewAccount();
      } catch (err) { msg.textContent = err.message; btn.disabled = false; }
    });
  }
  const requireLogin = (reason, fn) => S.customer ? fn() : authSheet('register', reason, fn);
  async function handleVerifyError(err) {
    if (!/confirme seu e-mail/i.test(err.message)) return false;
    toast('Confirme seu e-mail para continuar — reenviamos o link');
    api('/api/account/verify/send', { method: 'POST' }).catch(() => {});
    return true;
  }

  /* ---------- perfil do cliente (estilo rede social) ---------- */
  let acctTab = 'pedidos';
  async function viewAccount() {
    document.title = 'Minha conta — Aladdin Tech';
    if (!S.customer) {
      app.innerHTML = `<div class="wrap success"><div class="seal">${UI.user}</div><span class="eyebrow">Minha conta</span><h1>Entre para ver seu <span class="serif gold">perfil</span></h1>
        <p class="muted">Acompanhe pedidos, salve endereços, avalie produtos com fotos e receba ofertas exclusivas.</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn btn-gold" id="accLogin">Entrar</button><button class="btn btn-line" id="accReg">Criar conta</button></div></div>`;
      $('#accLogin').addEventListener('click', () => authSheet('login'));
      $('#accReg').addEventListener('click', () => authSheet('register'));
      return;
    }
    const me = (await api('/api/account/me')).customer; if (!me) { S.customer = null; renderAcctBtn(); return viewAccount(); }
    S.customer = me; renderAcctBtn();
    const [od, addrs, revs, alerts] = await Promise.all([api('/api/account/orders'), api('/api/account/addresses'), api('/api/account/reviews'), api('/api/account/alerts')]);
    const since = me.created_at ? new Date(me.created_at.replace(' ', 'T')).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '';
    const spent = od.orders.filter((o) => o.status !== 'cancelado').reduce((a, o) => a + o.total, 0);
    if (location.hash === '#indique') acctTab = 'indique';
    const ref = S.settings.referral_enabled ? await api('/api/account/referral').catch(() => null) : null;
    const tplans = await api('/api/account/trade-plans').catch(() => []);
    const club = S.settings.club_enabled !== false ? await api('/api/account/club').catch(() => null) : null;
    if (location.hash === '#clube') acctTab = 'clube';
    if (location.hash === '#troca') acctTab = 'troca';
    const TABS = { pedidos: ['Pedidos', od.orders.length], ...(club ? { clube: ['Clube Aladdin', club.balance > 0 ? brl(club.balance) : ''] } : {}), ...(tplans.length ? { troca: ['Troca Garantida', tplans.filter((t) => t.phase === 'liberado').length || ''] } : {}), ...(ref && ref.enabled ? { indique: ['Indique e ganhe', ref.friends.length || ''] } : {}), avaliacoes: ['Avaliações', revs.length], enderecos: ['Endereços', addrs.length], alertas: ['Desejos & alertas', S.wish.size + alerts.filter((a) => a.active).length], config: ['Configurações', ''] };
    app.innerHTML = `<div class="profile">
      <div class="pf-cover" style="${me.cover ? `background-image:url('${esc(me.cover)}')` : ''}">
        <div class="pf-cover-fx"></div>
        <label class="pf-cover-btn">${UI.plus} ${me.cover ? 'Trocar capa' : 'Adicionar capa'}<input type="file" accept="image/*" hidden data-photo="cover"></label>
      </div>
      <div class="wrap">
        <div class="pf-head">
          <div class="pf-avatar">${me.avatar ? `<img src="${esc(me.avatar)}" alt="">` : `<span>${esc((me.name || '?')[0].toUpperCase())}</span>`}
            <label class="pf-avatar-btn" title="Trocar foto">${UI.plus}<input type="file" accept="image/*" hidden data-photo="avatar"></label></div>
          <div class="pf-id">
            <h1>${esc(me.name)} ${me.email_verified ? `<span class="pf-verified" title="E-mail confirmado">${UI.check}</span>` : ''}</h1>
            <p>${me.bio ? esc(me.bio) + ' · ' : ''}${me.city ? `${UI.pin}${esc(me.city)}${me.uf ? '/' + esc(me.uf) : ''} · ` : ''}Cliente desde ${esc(since)}</p>
          </div>
          <div class="pf-stats"><div><b>${od.orders.length}</b><span>pedidos</span></div><div><b>${revs.length}</b><span>avaliações</span></div><div><b>${brl(spent)}</b><span>em upgrades</span></div></div>
        </div>
        ${!me.email_verified ? `<div class="pf-banner">${UI.lock}<div><b>Confirme seu e-mail</b><span>Enviamos um link para ${esc(me.email)}. Confirmar libera avaliações e protege sua conta.</span></div><button class="btn btn-line btn-sm" id="resendV">Reenviar link</button></div>` : ''}
        <nav class="pf-tabs">${Object.entries(TABS).map(([k, [l, n]]) => `<button data-tab="${k}" class="${acctTab === k ? 'on' : ''}">${l}${n !== '' ? ` <small>${n}</small>` : ''}</button>`).join('')}</nav>
        <div class="pf-body" id="pfBody"></div>
      </div></div>`;

    const ST = { novo: 'Recebido', confirmado: 'Confirmado', separando: 'Em separação', enviado: 'A caminho', pronto: 'Pronto para retirada', entregue: 'Entregue', cancelado: 'Cancelado' };
    const body = $('#pfBody');
    const drawTab = () => {
      $$('.pf-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === acctTab));
      if (acctTab === 'pedidos') {
        body.innerHTML = od.orders.length ? od.orders.map((o) => `<div class="acct-order">
          <div class="ao-head"><div><b>Pedido ${esc(o.code)}</b><small>${fmtDay(o.created_at)} · ${brl(o.total)}${o.pay_status === 'aprovado' ? ' · pago' : ''}</small></div><span class="ao-st ${o.status}">${ST[o.status] || o.status}</span></div>
          ${o.tracking ? `<div class="ao-track">${UI.truck}<span>Rastreio Correios: <b>${esc(o.tracking)}</b></span><button class="btn-ghost" data-copy="${esc(o.tracking)}">Copiar</button><a href="https://rastreamento.correios.com.br/app/index.php" target="_blank" rel="noopener" class="gold">Rastrear →</a></div>` : ''}
          ${o.delivery && o.delivery.address && typeof o.delivery.address === 'object' ? `<small class="muted">${UI.pin} ${esc(addrLine(o.delivery.address))}</small>` : ''}
          ${o.items.map((i) => `<div class="ao-item">${thumb({ image: i.image, category_icon: 'acessorios', name: i.name }, 'sm')}<div><b>${i.qty}x ${esc(i.name)}</b><small>${esc(optsText(i.options))}</small></div>
            ${o.status !== 'cancelado' && od.slugs[i.id] ? (od.reviewed.includes(i.id) ? `<button class="btn btn-line btn-sm" data-rate="${i.id}" data-name="${esc(i.name)}">Editar avaliação</button>` : `<button class="btn btn-gold btn-sm" data-rate="${i.id}" data-name="${esc(i.name)}">${UI.star} Avaliar</button>`) : ''}</div>`).join('')}
          <a class="link-arrow" href="/pedido/${esc(o.code)}" data-link style="font-size:13px">Ver detalhes ${UI.arrow}</a></div>`).join('')
          : `<div class="empty">Você ainda não fez pedidos com esta conta. <a href="/loja" data-link class="gold">Explorar a loja</a></div>`;
      } else if (acctTab === 'avaliacoes') {
        body.innerHTML = `<div style="display:flex;justify-content:flex-end;margin-bottom:12px"><button class="btn btn-line btn-sm" id="rateStore">${UI.star} Avaliar a loja</button></div>` + (revs.length ? revs.map((r) => `<div class="acct-order">
          <div class="ao-head"><div><b>${esc(r.product_name || 'Aladdin Tech (loja)')}</b><small>${fmtDay(r.created_at)}</small></div><span class="ao-st ${r.approved ? 'entregue' : ''}">${r.approved ? 'Publicada' : 'Em análise'}</span></div>
          <div>${stars(r.rating)} ${r.title ? `<b style="font-weight:500">${esc(r.title)}</b>` : ''}</div><p style="margin:0;font-weight:300">${esc(r.comment)}</p>
          ${r.photos.length ? `<div class="rv-photos">${r.photos.map((u) => `<button><img src="${esc(u)}" alt=""></button>`).join('')}</div>` : ''}
          ${r.reply ? `<div class="rv-reply"><span class="brand-lamp">${ICONS.lamp}</span><div><b>Resposta da Aladdin Tech</b><p>${esc(r.reply)}</p></div></div>` : ''}</div>`).join('')
          : '<div class="empty">Você ainda não avaliou nenhum produto.</div>');
        $('#rateStore').addEventListener('click', () => writeReview(null, '', () => viewAccount()));
      } else if (acctTab === 'alertas') {
        body.innerHTML = `<div class="acct-order"><div class="ao-head"><div><b>${UI.heart.replace('<svg', '<svg style="width:16px;height:16px;display:inline;vertical-align:-3px;color:var(--gold)"')} Lista de desejos</b><small>${S.wish.size} produto(s) salvo(s)</small></div><a href="/lista-de-desejos" data-link class="btn btn-line btn-sm">Ver lista</a></div></div>
          <h3 class="acct-h" style="font-size:18px;margin-top:22px">Alertas de preço e de chegada</h3>
          ${alerts.length ? alerts.map((a) => `<div class="ao-item" style="border:1px solid var(--line);border-radius:16px;padding:12px">${thumb({ image: a.image, category_icon: 'acessorios', name: a.name }, 'sm')}
            <div><b>${esc(a.name)}</b><small>${a.type === 'stock' ? 'Avisar quando chegar' : `Avisar se baixar de ${brl(a.base_price)} · hoje ${brl(a.price)}`} · ${a.active ? '<span class="gold">ativo</span>' : a.notified_at ? 'avisado em ' + fmtDay(a.notified_at) : 'cancelado'}</small></div>
            <a href="/produto/${esc(a.slug)}" data-link class="btn-ghost" style="font-size:13px">Ver</a>${a.active ? `<button class="btn-ghost" data-delalert="${a.id}" style="font-size:13px;color:var(--err)">Cancelar</button>` : ''}</div>`).join('')
          : '<div class="empty">Nenhum alerta ainda. Na página de um produto, toque em “Criar alerta” para saber quando o preço baixar.</div>'}`;
      } else if (acctTab === 'clube' && club) {
        const t = club.tier, prog = t.nextAt ? Math.min(100, Math.round((t.spent / t.nextAt) * 100)) : 100;
        const TY = { credito: 'Cashback ganho', uso: 'Usado em compra', estorno: 'Devolvido (pedido cancelado)', expirado: 'Expirou', ajuste: 'Ajuste da loja' };
        body.innerHTML = `<div class="club-card ${t.key}"><div><span class="eyebrow">Clube Aladdin</span><h3>Nível <span class="serif gold">${esc(t.name)}</span></h3><p>Você ganha <b>${t.pct}% de volta</b> em todas as compras.</p></div>
            <div class="club-bal"><small>Seu cashback</small><b>${brl(club.balance)}</b>${club.next_expiry ? `<small>parte vence em ${fmtDay(club.next_expiry)}</small>` : ''}</div></div>
          ${t.next ? `<div class="club-prog"><div class="club-bar"><i style="width:${prog}%"></i></div><small>Faltam <b>${brl(t.missing)}</b> em compras (últimos 12 meses) para o nível <b>${esc(t.next)}</b>.</small></div>` : '<p class="muted">Você está no nível máximo. Obrigado por ser cliente Diamante! 💎</p>'}
          <div class="club-levels">${club.levels.map((l) => `<div class="${l.name === t.name ? 'on' : ''}"><b>${esc(l.name)}</b><span>${l.pct}% de volta</span><small>${l.from ? 'a partir de ' + brl(l.from) + '/ano' : 'na 1ª compra'}</small></div>`).join('')}</div>
          <div class="club-bday"><div><b>${UI.spark} Presente de aniversário</b><span>Cadastre seu aniversário e ganhe <b class="gold">${brl(club.birthday_value)} OFF</b> no seu dia.</span></div>
            ${club.birthday ? `<span class="gold">🎂 ${club.birthday.split('-').reverse().slice(0, 2).join('/')}</span>` : `<div style="display:flex;gap:8px"><input class="input" type="date" id="bdIn" max="${new Date().toISOString().slice(0, 10)}"><button class="btn btn-line btn-sm" id="bdSave">Salvar</button></div>`}</div>
          <div class="club-push" id="pushBox"></div>
          <h3 class="acct-h" style="font-size:18px;margin-top:22px">Extrato</h3>
          ${club.history.length ? club.history.map((h) => `<div class="ref-row"><b>${TY[h.type] || h.type}</b><span class="muted">${h.order_code ? 'pedido ' + esc(h.order_code) + ' · ' : ''}${fmtDay(h.created_at)}</span><span class="${h.amount > 0 ? 'gold' : 'muted'}">${h.amount > 0 ? '+' : '−'} ${brl(Math.abs(h.amount))}</span></div>`).join('') : '<p class="muted">Seu cashback aparece aqui depois da primeira compra paga.</p>'}
          <p class="muted" style="font-size:12.5px;margin-top:14px">O cashback vale por ${club.expiry_days} dias e pode pagar até ${club.cap_pct}% do valor dos produtos em cada compra no site.</p>`;
        $('#bdSave')?.addEventListener('click', async () => { try { await api('/api/account/birthday', { method: 'PUT', body: { birthday: $('#bdIn').value } }); toast('Aniversário salvo 🎂'); viewAccount(); } catch (e) { toast(e.message); } });
        pushBoxUI($('#pushBox'));
      } else if (acctTab === 'troca') {
        const PH = { aguardando: ['Aguardando', 'muted'], liberado: ['Liberada para troca', 'gold'], resgatado: ['Usada', 'muted'], expirado: ['Vencida', 'muted'] };
        body.innerHTML = tplans.map((t) => `<div class="acct-order tg-cert ${t.phase}"><div class="ao-head"><div><b>${esc(t.product_name)}</b><small>Certificado ${esc(t.code)} · compra em ${fmtDay(t.starts_at)}</small></div><span class="ao-st ${PH[t.phase][1]}">${PH[t.phase][0]}</span></div>
          <div class="war-grid"><div><small>Valor na troca</small><b class="gold">até ${brl(t.max_value)}</b></div><div><small>Libera em</small><b>${fmtDay(t.opens_at)}</b></div><div><small>Válida até</small><b>${fmtDay(t.expires_at)}</b></div>
            ${t.phase === 'aguardando' ? `<div><small>Faltam</small><b>${t.days_to_open} dias</b></div>` : t.phase === 'resgatado' ? `<div><small>Crédito gerado</small><b>${brl(t.redeemed_value)}</b></div>` : ''}</div>
          <small class="muted">Estado A: ${brl(t.values.A)} · B: ${brl(t.values.B)} · C: ${brl(t.values.C)}. ${t.phase === 'liberado' ? 'Traga o aparelho na loja com a conta iCloud removida.' : ''}</small>
          ${t.phase === 'liberado' ? `<a class="btn btn-gold btn-sm" target="_blank" rel="noopener" href="${waLink('Olá! Quero usar minha Troca Garantida ' + t.code + ' (' + t.product_name + ').')}">${UI.wa} Agendar minha troca</a>` : ''}</div>`).join('');
      } else if (acctTab === 'indique' && ref) {
        const share = `Olha a Aladdin Tech! Criando a conta pelo meu link você ganha ${ref.friend_pct}% OFF na primeira compra: ${ref.link}`;
        body.innerHTML = `<div class="ref-hero"><div><span class="eyebrow">Indique e ganhe</span><h3>Seu amigo ganha <span class="serif gold">${ref.friend_pct}% OFF</span>. Você ganha <span class="serif gold">${brl(ref.reward)}</span>.</h3>
            <p class="muted">Compartilhe seu link. Quando um amigo criar a conta por ele e fizer a primeira compra${ref.min_order ? ` acima de ${brl(ref.min_order)}` : ''}, você recebe um cupom de ${brl(ref.reward)} por e-mail. Sem limite de amigos.</p></div>
          <div class="ref-link"><code>${esc(ref.link)}</code><div class="ref-act"><button class="btn btn-line btn-sm" id="refCopy">Copiar link</button>
            <a class="btn btn-gold btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(share)}">${UI.wa} Enviar no WhatsApp</a></div></div></div>
          <div class="ref-cols"><div><h3 class="acct-h" style="font-size:18px">Amigos indicados</h3>
            ${ref.friends.length ? ref.friends.map((x) => `<div class="ref-row"><b>${esc(x.name)}</b><span class="muted">desde ${fmtDay(x.since)}</span><span class="${x.bought ? 'gold' : 'muted'}">${x.bought ? '✓ comprou' : 'ainda não comprou'}</span></div>`).join('') : '<p class="muted">Ninguém ainda. Que tal mandar para aquele amigo que vive pedindo dica de celular?</p>'}</div>
          <div><h3 class="acct-h" style="font-size:18px">Seus cupons</h3>
            ${ref.coupons.length ? ref.coupons.map((c) => `<div class="ref-row"><code class="${c.used || c.expired ? 'muted' : 'gold'}">${esc(c.code)}</code><span>${c.type === 'percent' ? c.value + '% OFF' : brl(c.value)}</span><span class="muted">${c.used ? 'usado' : c.expired ? 'expirado' : 'até ' + esc(c.expires_at.split('-').reverse().join('/'))}</span></div>`).join('') : '<p class="muted">Seus cupons de indicação aparecem aqui.</p>'}</div></div>`;
        $('#refCopy').addEventListener('click', () => navigator.clipboard.writeText(ref.link).then(() => toast('Link copiado')).catch(() => toast(ref.link)));
      } else if (acctTab === 'enderecos') {
        body.innerHTML = `<div class="addr-grid">${addrs.map((a) => `<div class="addr-card ${a.is_default ? 'on' : ''}">
            <div class="ao-head"><b>${UI.pin} ${esc(a.label)}</b>${a.is_default ? '<span class="ao-st">Principal</span>' : `<button class="btn-ghost" data-defaddr="${a.id}">Tornar principal</button>`}</div>
            <p>${a.recipient ? esc(a.recipient) + '<br>' : ''}${esc(a.street)}, ${esc(a.number)}${a.complement ? ' — ' + esc(a.complement) : ''}<br>${esc(a.district)} · ${esc(a.city)}/${esc(a.uf)}<br>CEP ${esc(a.cep)}</p>
            <div style="display:flex;gap:8px"><button class="btn btn-line btn-sm" data-editaddr="${a.id}">Editar</button><button class="btn-ghost" data-deladdr="${a.id}">Excluir</button></div></div>`).join('')}
          <button class="addr-card add" id="newAddr">${UI.plus}<b>Novo endereço</b><span>Casa, trabalho, outra cidade…</span></button></div>`;
      } else {
        body.innerHTML = `<div class="cfg-grid">
          <form class="panel-lite" id="cfgProfile"><h4>Dados pessoais</h4>
            <div class="field"><label>Nome</label><input name="name" value="${esc(me.name)}" maxlength="80"></div>
            <div class="field"><label>WhatsApp</label><input name="phone" value="${esc(me.phone || '')}" maxlength="20"></div>
            <div class="row c3"><div class="field" style="grid-column:span 2"><label>Cidade</label><input name="city" value="${esc(me.city || '')}" maxlength="80"></div>
              <div class="field"><label>UF</label><select name="uf"><option value="">—</option>${UFS.map((u) => `<option ${me.uf === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div>
            <div class="field"><label>Sobre você (aparece no perfil)</label><input name="bio" value="${esc(me.bio || '')}" maxlength="160" placeholder="Ex.: Apaixonado por Apple desde o iPhone 4"></div>
            <button class="btn btn-gold btn-sm" type="submit">Salvar</button></form>
          <form class="panel-lite" id="cfgPrefs"><h4>Preferências</h4>
            <label class="check"><input type="checkbox" name="marketing" ${me.marketing ? 'checked' : ''}><span>Receber ofertas, lançamentos e cupons exclusivos por e-mail</span></label>
            <p class="muted" style="font-size:12px;margin:0">Os e-mails do seu pedido (confirmação, envio e rastreio) continuam chegando normalmente.</p>
            <button class="btn btn-line btn-sm" type="submit">Salvar preferências</button></form>
          <form class="panel-lite" id="cfgEmail"><h4>E-mail de acesso</h4>
            <p class="muted" style="margin:0;font-size:13px">Atual: <b style="color:var(--text)">${esc(me.email)}</b> ${me.email_verified ? '<span class="verified">' + UI.check + ' confirmado</span>' : '<span class="gold">não confirmado</span>'}</p>
            <div class="field"><label>Novo e-mail</label><input name="email" type="email" maxlength="120"></div>
            <div class="field"><label>Confirme o novo e-mail</label><input name="email_confirm" type="email" maxlength="120"></div>
            <div class="field"><label>Sua senha</label><input name="password" type="password" autocomplete="current-password"></div>
            <button class="btn btn-line btn-sm" type="submit">Trocar e-mail</button></form>
          <form class="panel-lite" id="cfgPw"><h4>Senha</h4>
            <div class="field"><label>Senha atual</label><input name="current" type="password" autocomplete="current-password"></div>
            <div class="field"><label>Nova senha</label><input name="next" type="password" autocomplete="new-password" placeholder="8+ letras e números"></div>
            <div class="field"><label>Confirme a nova senha</label><input name="next_confirm" type="password" autocomplete="new-password"></div>
            <button class="btn btn-line btn-sm" type="submit">Alterar senha</button></form>
          <div class="panel-lite danger"><h4>Sair ou excluir conta</h4>
            <p class="muted" style="margin:0;font-size:13px">Excluir apaga seu perfil, fotos e endereços. Pedidos ficam guardados por obrigação fiscal.</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-line btn-sm" id="logoutCli">Sair da conta</button><button class="btn-ghost" id="delAcct" style="color:var(--err)">Excluir minha conta</button></div></div>
        </div>`;
        const send = (id, url, method, extra, ok) => $('#' + id).addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = Object.fromEntries(new FormData(e.target));
          try { const r = await api(url, { method, body: { ...fd, ...extra(e.target) } }); toast(ok(r)); if (r.customer) { S.customer = r.customer; viewAccount(); } else e.target.reset && id !== 'cfgPrefs' && e.target.reset(); }
          catch (err) { toast(err.message); }
        });
        send('cfgProfile', '/api/account/profile', 'PUT', () => ({}), () => 'Perfil atualizado');
        send('cfgPrefs', '/api/account/profile', 'PUT', (f) => ({ marketing: f.marketing.checked }), () => 'Preferências salvas');
        send('cfgEmail', '/api/account/email', 'POST', () => ({}), (r) => r.message || 'E-mail alterado');
        send('cfgPw', '/api/account/password', 'POST', () => ({}), () => 'Senha alterada');
        $('#logoutCli').addEventListener('click', async () => { await api('/api/account/logout', { method: 'POST' }); S.customer = null; renderAcctBtn(); toast('Você saiu da conta'); navigate('/'); });
        $('#delAcct').addEventListener('click', async () => {
          const pw = prompt('Para excluir sua conta definitivamente, digite sua senha:'); if (!pw) return;
          try { await api('/api/account', { method: 'DELETE', body: { password: pw } }); S.customer = null; renderAcctBtn(); toast('Conta excluída'); navigate('/'); } catch (err) { toast(err.message); }
        });
      }
    };
    drawTab();
    const rv = $('#resendV');
    rv && rv.addEventListener('click', async () => { try { const r = await api('/api/account/verify/send', { method: 'POST' }); toast(r.mail_ready === false ? 'Envio de e-mails ainda não configurado pela loja' : 'Link reenviado — confira sua caixa de entrada'); } catch (e) { toast(e.message); } });
    app.onclick = async (e) => {
      const t = e.target.closest('[data-tab]'); if (t) { acctTab = t.dataset.tab; drawTab(); return; }
      const r = e.target.closest('[data-rate]'); if (r) return writeReview(+r.dataset.rate, r.dataset.name, () => viewAccount());
      const cp = e.target.closest('[data-copy]'); if (cp) { navigator.clipboard && navigator.clipboard.writeText(cp.dataset.copy); toast('Código copiado'); return; }
      const da = e.target.closest('[data-delalert]'); if (da) { await api('/api/account/alerts/' + da.dataset.delalert, { method: 'DELETE' }); toast('Alerta cancelado'); acctTab = 'alertas'; return viewAccount(); }
      const df = e.target.closest('[data-defaddr]'); if (df) { await api('/api/account/addresses/' + df.dataset.defaddr, { method: 'PUT', body: { make_default: true } }); return viewAccount(); }
      const dl = e.target.closest('[data-deladdr]'); if (dl) { if (!confirm('Excluir este endereço?')) return; await api('/api/account/addresses/' + dl.dataset.deladdr, { method: 'DELETE' }); return viewAccount(); }
      const ed = e.target.closest('[data-editaddr]'); if (ed) return addressSheet(addrs.find((a) => a.id === +ed.dataset.editaddr));
      if (e.target.closest('#newAddr')) return addressSheet();
    };
    app.onchange = async (e) => {
      const inp = e.target.closest('[data-photo]'); if (!inp || !inp.files[0]) return;
      try {
        toast('Enviando foto…');
        const kind = inp.dataset.photo;
        const data = await resizeForUpload(inp.files[0], kind === 'cover' ? 1800 : 600, .85);
        await api('/api/account/photo', { method: 'POST', body: { kind, data } });
        toast(kind === 'cover' ? 'Capa atualizada' : 'Foto de perfil atualizada'); viewAccount();
      } catch (err) { toast(err.message); }
    };
  }
  function addressSheet(a) {
    const isNew = !a; const target = a ? { ...a } : {};
    const sh = openSheet(`<div class="sheet-head"><div><span class="eyebrow">Endereço de entrega</span><h3>${isNew ? 'Novo endereço' : 'Editar endereço'}</h3></div><button class="icon-btn" data-close aria-label="Fechar">${UI.close}</button></div>
      <form class="sheet-body" id="adForm">${addressFormHTML(target, { label: true })}
        <label class="check"><input type="checkbox" name="is_default" ${a && a.is_default ? 'checked' : ''}><span>Usar como endereço principal</span></label>
        <p class="form-msg err" id="adMsg"></p><button class="btn btn-gold btn-block" type="submit">Salvar endereço</button></form>`);
    bindAddressForm($('#adForm', sh.el), target, () => {});
    $('#adForm', sh.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        await api('/api/account/addresses' + (isNew ? '' : '/' + a.id), { method: isNew ? 'POST' : 'PUT', body: { ...fd, is_default: !!fd.is_default, lat: target.lat, lng: target.lng } });
        sh.close(); toast('Endereço salvo'); acctTab = 'enderecos'; viewAccount();
      } catch (err) { $('#adMsg', sh.el).textContent = err.message; }
    });
  }

  /* ---------- links que chegam por e-mail ---------- */
  async function viewVerifyEmail() {
    const token = new URLSearchParams(location.search).get('token');
    let ok = false, msg = '';
    try { await api('/api/account/verify', { method: 'POST', body: { token } }); ok = true; } catch (e) { msg = e.message; }
    if (ok && S.customer) S.customer.email_verified = true;
    history.replaceState({}, '', '/verificar-email');
    app.innerHTML = `<div class="wrap success"><div class="seal">${ok ? UI.check : UI.close}</div><span class="eyebrow">Confirmação de e-mail</span>
      <h1>${ok ? 'E-mail <span class="serif gold">confirmado!</span>' : 'Link inválido'}</h1>
      <p class="muted">${ok ? 'Sua conta está ativa. Agora você pode avaliar produtos e acompanhar seus pedidos.' : esc(msg)}</p>
      <a href="/minha-conta" data-link class="btn btn-gold">Ir para minha conta</a></div>`;
  }
  function viewResetPassword() {
    const token = new URLSearchParams(location.search).get('token');
    app.innerHTML = `<div class="wrap success" style="max-width:460px"><div class="seal">${UI.lock}</div><span class="eyebrow">Nova senha</span><h1>Crie sua <span class="serif gold">nova senha</span></h1>
      <form id="rsForm" style="display:grid;gap:14px;text-align:left;margin-top:20px">
        <div class="field"><label>Nova senha</label><input name="password" type="password" autocomplete="new-password" placeholder="8+ letras e números" required></div>
        <div class="field"><label>Confirme a nova senha</label><input name="password_confirm" type="password" autocomplete="new-password" required></div>
        <p class="form-msg err" id="rsMsg"></p><button class="btn btn-gold btn-block" type="submit">Salvar e entrar</button></form></div>`;
    $('#rsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      if (fd.password !== fd.password_confirm) { $('#rsMsg').textContent = 'As senhas não conferem.'; return; }
      try { const r = await api('/api/account/reset', { method: 'POST', body: { ...fd, token } }); S.customer = r.customer; renderAcctBtn(); history.replaceState({}, '', '/minha-conta'); toast('Senha alterada!'); viewAccount(); }
      catch (err) { $('#rsMsg').textContent = err.message; }
    });
  }
  async function viewUnsubscribe() {
    const t = new URLSearchParams(location.search).get('t');
    let ok = false; try { await api('/api/unsubscribe', { method: 'POST', body: { t } }); ok = true; } catch {}
    app.innerHTML = `<div class="wrap success"><div class="seal">${UI.check}</div><h1>${ok ? 'Pronto, você foi <span class="serif gold">descadastrado</span>' : 'Link inválido'}</h1>
      <p class="muted">${ok ? 'Você não receberá mais e-mails de ofertas. Os avisos dos seus pedidos continuam normalmente.' : 'Você pode ajustar suas preferências em Minha conta → Configurações.'}</p>
      <a href="/" data-link class="btn btn-line">Voltar à loja</a></div>`;
  }

  function writeReview(productId, productName, onDone) {
    if (!S.customer) return authSheet('register', 'Crie sua conta (leva 20 segundos) para avaliar. Se você comprou aqui, sua avaliação ganha o selo “Compra verificada”.', () => writeReview(productId, productName, onDone));
    let rating = 0; const photos = [];
    const sh = openSheet(`
      <div class="sheet-head"><div><span class="eyebrow">Sua opinião</span><h3>${productName ? 'Avaliar ' + esc(productName) : 'Avaliar a Aladdin Tech'}</h3></div><button class="icon-btn" data-close aria-label="Fechar">${UI.close}</button></div>
      <form class="sheet-body" id="wrForm" novalidate>
        <div class="wr-stars"><div class="star-input big" role="radiogroup" aria-label="Nota">${[1, 2, 3, 4, 5].map((i) => `<button type="button" data-star="${i}" aria-label="${i} — ${RATING_LABEL[i]}">${UI.star}</button>`).join('')}</div><span id="wrLabel" class="muted">Toque nas estrelas para dar sua nota</span></div>
        <div class="field"><label>Título da avaliação</label><input name="title" maxlength="80" placeholder="Ex.: Chegou rápido e muito bem embalado"></div>
        <div class="field"><label>Conte como foi sua experiência *</label><textarea name="comment" rows="4" maxlength="1500" placeholder="O que você achou do produto e do atendimento? O que mais gostou?"></textarea><small class="counter" id="wrCount">0 / 1500</small></div>
        <div class="field"><label>Fotos (até 5)</label>
          <div class="wr-photos" id="wrPhotos"></div>
          <small class="muted">Avaliações com fotos ajudam muito outros clientes.</small></div>
        <div class="field"><label>Sua cidade <small class="muted">(opcional)</small></label><input name="city" maxlength="60"></div>
        <p class="muted" style="font-size:12.5px;margin:0">Publicando como <b style="color:var(--text)">${esc(S.customer.name)}</b>. Se você comprou este produto com esta conta, a avaliação recebe o selo <span class="gold">Compra verificada</span>.</p>
        <p class="form-msg err" id="wrMsg"></p>
        <button class="btn btn-gold btn-block" type="submit" id="wrSend">Publicar avaliação</button>
        <p class="muted" style="font-size:12px;margin:0;text-align:center">Ao enviar, você concorda que sua avaliação e fotos sejam exibidas publicamente. Não envie dados pessoais nas fotos.</p>
      </form>`);
    const f = $('#wrForm', sh.el);
    const drawPhotos = () => {
      $('#wrPhotos', sh.el).innerHTML = photos.map((p, i) => `<div class="wr-ph"><img src="${p}" alt=""><button type="button" data-rmph="${i}" aria-label="Remover foto">${UI.close}</button></div>`).join('')
        + (photos.length < 5 ? `<label class="wr-add">${UI.plus}<span>Adicionar</span><input type="file" accept="image/*" multiple></label>` : '');
      const inp = $('input[type=file]', sh.el);
      inp && inp.addEventListener('change', async () => {
        for (const file of [...inp.files].slice(0, 5 - photos.length)) {
          try { photos.push(await resizeForUpload(file)); } catch (e) { $('#wrMsg', sh.el).textContent = e.message; }
        }
        drawPhotos();
      });
    };
    drawPhotos();
    sh.el.addEventListener('click', (e) => {
      const s = e.target.closest('[data-star]');
      if (s) { rating = +s.dataset.star; $$('[data-star]', sh.el).forEach((x) => x.classList.toggle('on', +x.dataset.star <= rating)); $('#wrLabel', sh.el).textContent = RATING_LABEL[rating]; }
      const r = e.target.closest('[data-rmph]'); if (r) { photos.splice(+r.dataset.rmph, 1); drawPhotos(); }
    });
    $('[name=comment]', f).addEventListener('input', (e) => $('#wrCount', sh.el).textContent = `${e.target.value.length} / 1500`);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(f), msg = $('#wrMsg', sh.el), btn = $('#wrSend', sh.el);
      if (!rating) { msg.textContent = 'Escolha de 1 a 5 estrelas.'; return; }
      btn.disabled = true; btn.textContent = 'Enviando…'; msg.textContent = '';
      try {
        const r = await api('/api/reviews', { method: 'POST', body: { product_id: productId || null, rating, title: fd.get('title'), comment: fd.get('comment'), city: fd.get('city'), photos } });
        sh.el.innerHTML = `<div class="sheet-body" style="text-align:center;padding:48px 28px">
          <div class="success" style="padding:0"><div class="seal">${UI.check}</div></div>
          <h3 style="font-weight:300;font-size:26px;margin:0 0 10px">Obrigado pela avaliação!</h3>
          <p class="muted">${esc(r.message)}${r.verified ? '<br><span class="verified">' + UI.check + ' Compra verificada</span>' : ''}</p>
          <button class="btn btn-line" data-close style="margin-top:12px">Fechar</button></div>`;
        $$('[data-close]', sh.el).forEach((b) => b.addEventListener('click', sh.close));
        onDone && onDone();
      } catch (err) { msg.textContent = err.message; btn.disabled = false; btn.textContent = 'Publicar avaliação'; }
    });
  }

  async function reviewsBlock(el, productId, opts = {}) {
    const st = { stars: 0, sort: '', fotos: false };
    const load = async () => {
      const q = new URLSearchParams();
      if (productId) q.set('product', productId);
      if (st.stars) q.set('stars', st.stars);
      if (st.sort) q.set('sort', st.sort);
      if (st.fotos) q.set('fotos', 1);
      const d = await api('/api/reviews?' + q);
      if (!st.base) st.base = d; // números gerais (sem filtro)
      const b = st.base;
      const list = opts.limit ? d.reviews.slice(0, opts.limit) : d.reviews;
      el.innerHTML = `<div class="rv-wrap">
        <aside class="rv-summary reveal">
          <div class="rv-score"><div class="big">${b.avg ? String(b.avg).replace('.', ',') : '—'}</div><div>${stars(b.avg)}<p>${b.count ? `${b.count} avaliaç${b.count > 1 ? 'ões' : 'ão'}` : 'Ainda sem avaliações'}</p></div></div>
          <div class="dist">${[5, 4, 3, 2, 1].map((n) => `<button class="${st.stars === n ? 'on' : ''}" data-fstar="${n}" ${!b.dist[n] ? 'disabled' : ''}><span>${n} ${UI.star}</span><i><b style="width:${b.count ? (b.dist[n] / b.count) * 100 : 0}%"></b></i><em>${b.dist[n]}</em></button>`).join('')}</div>
          <button class="btn btn-gold btn-block" data-write>${UI.star} Escrever avaliação</button>
          <p class="muted" style="font-size:12px;margin:0">Todas as avaliações são de clientes reais e passam por moderação.</p>
        </aside>
        <div class="rv-main">
          ${b.gallery.length ? `<div class="rv-gallery reveal"><h4>Fotos de clientes <small>(${b.photo_count})</small></h4>
            <div class="rv-strip">${b.gallery.slice(0, 10).map((g, i) => `<button data-glb="${i}"><img src="${esc(g.url)}" alt="Foto de cliente" loading="lazy"></button>`).join('')}</div></div>` : ''}
          <div class="rv-filters">
            <div class="chips-inline">
              <button class="chip ${!st.stars && !st.fotos ? 'on' : ''}" data-fall>Todas</button>
              ${b.photo_count ? `<button class="chip ${st.fotos ? 'on' : ''}" data-ffotos>Com fotos</button>` : ''}
              ${[5, 4, 3, 2, 1].filter((n) => b.dist[n]).map((n) => `<button class="chip ${st.stars === n ? 'on' : ''}" data-fstar="${n}">${n} ★</button>`).join('')}
            </div>
            <div class="field"><select data-sort aria-label="Ordenar avaliações">${[['', 'Mais recentes'], ['uteis', 'Mais úteis'], ['melhores', 'Melhor nota'], ['piores', 'Pior nota']].map(([v, l]) => `<option value="${v}" ${st.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          </div>
          <div class="rv-list">${list.length ? list.map((r) => `
            <article class="rv-item reveal">
              <div class="rv-head">${stars(r.rating)}${r.title ? `<b>${esc(r.title)}</b>` : `<b>${RATING_LABEL[r.rating]}</b>`}</div>
              <div class="rv-meta"><span class="avatar sm">${esc((r.name.trim()[0] || '?').toUpperCase())}</span>${esc(r.name)}${r.city ? ' · ' + esc(r.city) : ''} · ${fmtDay(r.created_at)}
                ${r.verified ? `<span class="verified">${UI.check} Compra verificada</span>` : ''}</div>
              ${!productId && r.product_name ? `<a class="rv-about" href="/produto/${esc(r.product_slug)}" data-link>Sobre: ${esc(r.product_name)}</a>` : ''}
              <p>${esc(r.comment)}</p>
              ${r.photos.length ? `<div class="rv-photos">${r.photos.map((u, i) => `<button data-rlb="${r.id}" data-i="${i}"><img src="${esc(u)}" alt="Foto da avaliação" loading="lazy"></button>`).join('')}</div>` : ''}
              ${r.reply ? `<div class="rv-reply"><span class="brand-lamp">${ICONS.lamp}</span><div><b>Resposta da Aladdin Tech</b><p>${esc(r.reply)}</p></div></div>` : ''}
              <div class="rv-actions"><button class="helpful" data-help="${r.id}">${UI.check} Útil <span>${r.helpful || ''}</span></button></div>
            </article>`).join('') : `<div class="empty">${b.count ? 'Nenhuma avaliação com esse filtro.' : `Ainda não há avaliações${productId ? ' para este produto' : ''}. Seja o primeiro a contar sua experiência.`}</div>`}
          </div>
          ${opts.limit && d.reviews.length > opts.limit ? `<a href="/avaliacoes" data-link class="link-arrow" style="margin-top:18px">Ver todas as ${b.count} avaliações ${UI.arrow}</a>` : ''}
        </div></div>`;
      st.list = d.reviews;
      observeReveal();
    };
    el.onclick = async (e) => {
      if (e.target.closest('[data-write]')) return writeReview(productId, opts.productName, () => {});
      const fs = e.target.closest('[data-fstar]'); if (fs) { st.stars = st.stars === +fs.dataset.fstar ? 0 : +fs.dataset.fstar; return load(); }
      if (e.target.closest('[data-fall]')) { st.stars = 0; st.fotos = false; return load(); }
      if (e.target.closest('[data-ffotos]')) { st.fotos = !st.fotos; return load(); }
      const g = e.target.closest('[data-glb]'); if (g) return lightbox(st.base.gallery.map((x) => x.url), +g.dataset.glb);
      const rl = e.target.closest('[data-rlb]');
      if (rl) { const r = st.list.find((x) => x.id === +rl.dataset.rlb); return lightbox(r.photos, +rl.dataset.i); }
      const h = e.target.closest('[data-help]');
      if (h && !h.classList.contains('on')) {
        h.classList.add('on');
        const r = await api(`/api/reviews/${h.dataset.help}/helpful`, { method: 'POST' });
        if (r.ok) $('span', h).textContent = r.helpful; else toast('Você já marcou esta avaliação');
      }
    };
    el.onchange = (e) => { if (e.target.matches('[data-sort]')) { st.sort = e.target.value; load(); } };
    await load();
  }

  /* ---------- perguntas e respostas ---------- */
  async function questionsBlock(el, p) {
    const list = await api('/api/questions?product=' + p.id);
    el.innerHTML = `<div class="qa-wrap">
      <form class="qa-form reveal" id="qaForm">
        <h4>Pergunte ao especialista</h4>
        <p class="muted">Dúvidas sobre compatibilidade, garantia ou entrega? A equipe Aladdin responde aqui.</p>
        <div class="field"><textarea name="question" rows="2" maxlength="500" placeholder="Escreva sua pergunta…" required></textarea></div>
        <button class="btn btn-gold" type="submit">${S.customer ? 'Enviar pergunta' : 'Entrar para perguntar'}</button>
        <p class="form-msg" id="qaMsg"></p>
      </form>
      <div class="qa-list">
        <h4>${list.length ? `Últimas perguntas <small class="muted">(${list.length})</small>` : 'Nenhuma pergunta respondida ainda'}</h4>
        ${list.map((q) => `<div class="qa reveal"><p class="q">${esc(q.question)}</p><div class="a"><span>${UI.chat}</span><p>${esc(q.answer)}<small>${esc(q.name)} perguntou · respondido em ${fmtDay(q.answered_at)}</small></p></div></div>`).join('')}
      </div></div>`;
    $('#qaForm', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target), msg = $('#qaMsg', el);
      if (!S.customer) return authSheet('login', 'Entre na sua conta para enviar sua pergunta — você será avisado na página do produto quando respondermos.', () => questionsBlock(el, p));
      try {
        const r = await api('/api/questions', { method: 'POST', body: { product_id: p.id, question: fd.get('question') } });
        msg.className = 'form-msg ok'; msg.textContent = r.message; e.target.reset();
      } catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; }
    });
    observeReveal();
  }

  /* ---------- contagem regressiva de ofertas ---------- */
  function timeLeft(end) {
    const ms = new Date(end) - new Date();
    if (!(ms > 0)) return '';
    const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    const p = (n) => String(n).padStart(2, '0');
    return d > 0 ? `${d}d ${p(h)}h ${p(m)}m` : `${p(h)}:${p(m)}:${p(s)}`;
  }
  setInterval(() => $$('[data-countdown]').forEach((el) => {
    const t = timeLeft(el.dataset.countdown);
    if (!t) { el.closest('.promo-bar, .cd-wrap') ? el.closest('.promo-bar, .cd-wrap').remove() : el.remove(); return; }
    el.textContent = t;
  }), 1000);

  /* ---------- páginas ---------- */
  async function viewHome() {
    const s = S.settings;
    document.title = `${s.store_name || 'Aladdin Tech'} — ${s.tagline || 'Referência em Upgrade'}`;
    app.innerHTML = `
    <section class="hero hero-legends solo hero-fx" id="heroFx">
      <div class="hero-bg" aria-hidden="true"><img src="/img/hero-loja.jpg" alt=""></div>
      <canvas class="hero-net" id="heroNet" aria-hidden="true"></canvas>
      <div class="legend legend-r edge" aria-hidden="true"><img src="${esc(s.hero_right || '/img/hero-alladin.jpg')}" alt=""></div>
      <div class="wrap hero-center">
        <span class="apple-mark hx" style="--d:0" aria-hidden="true">${ICONS.apple}</span>
        <span class="eyebrow hx" style="--d:1">${esc(s.tagline || 'Referência em Upgrade')}</span>
        <h1><span class="hl"><span class="hx" style="--d:2">O upgrade que</span></span><span class="hl"><span class="hx" style="--d:3">você <span class="serif gold shimmer">merece.</span></span></span></h1>
        <p class="lead hx" style="--d:4">iPhone, Mac, iPad, Apple Watch, JBL e PlayStation com procedência, garantia e um atendimento feito por especialistas.</p>
        <div class="hero-cta hx" style="--d:5">
          <a href="/loja" data-link class="btn btn-gold">Explorar a loja ${UI.arrow}</a>
          <a href="/upgrade" data-link class="btn btn-line">${UI.swap} Avaliar meu usado</a>
        </div>
        <div class="hero-stats hx" style="--d:6">
          <div><b data-count="${s.max_installments || 12}" data-suffix="x">${s.max_installments || 12}x</b><span>no cartão</span></div>
          <div><b data-count="${s.pix_discount || 0}" data-suffix="%">${s.pix_discount || 0}%</b><span>off no Pix</span></div>
          <div><b data-count="1" data-suffix=" ano">1 ano</b><span>de garantia</span></div>
          ${s.always_open ? '<div class="stat-247"><b data-type="24/7">24/7</b><span>sempre aberta</span></div>' : ''}
        </div>
        <p class="hero-wish hx" style="--d:7"><span class="serif">Seu desejo,</span> nossa tecnologia.</p>
      </div>
    </section>

    <div class="tree-zone">
    <section class="section tight"><div class="wrap">
      ${sectionHead('Categorias', 'Escolha seu <span class="serif gold">próximo</span> nível', '')}
      <div class="cats">${S.cats.map((c) => `<a class="cat reveal" href="/categoria/${c.slug}" data-link><div class="art">${ART[c.icon] || ART.acessorios}</div><b>${esc(shortName[c.slug] || c.name)}</b><span>${c.count} ${c.count === 1 ? 'item' : 'itens'}</span></a>`).join('')}</div>
    </div></section>

    <section class="section"><div class="wrap">
      ${sectionHead('Destaques', 'Os mais <span class="serif gold">desejados</span>', 'Seleção da semana, com estoque pronto para entrega ou retirada hoje.', `<a href="/loja" data-link class="link-arrow">Ver toda a loja ${UI.arrow}</a>`)}
      <div class="grid" id="featured">${'<div class="skeleton" style="aspect-ratio:.72"></div>'.repeat(4)}</div>
    </div></section>
    </div>

    <section class="section" id="bestSec" hidden><div class="wrap">
      ${sectionHead('Mais vendidos', 'Os favoritos dos <span class="serif gold">clientes</span>', 'Ranking real, calculado pelos pedidos confirmados na loja e no site.', `<a href="/mais-vendidos" data-link class="link-arrow">Ver o ranking completo ${UI.arrow}</a>`)}
      <div class="grid" id="bestGrid"></div>
    </div></section>

    <section class="section tight"><div class="wrap">${perksHTML()}</div></section>

    <section class="section" id="soonSec" style="display:none"><div class="wrap">
      ${sectionHead('Pré-venda', 'Chegando <span class="serif gold">em breve</span>', 'Entre na fila: quem garante com sinal primeiro, leva primeiro. Ou peça para ser avisado quando chegar.')}
      <div class="grid" id="soonGrid"></div>
    </div></section>

    <section class="section" id="offersSec" style="display:none"><div class="wrap">
      ${sectionHead('Ofertas', 'Preços de <span class="serif gold">gênio</span>', 'Promoções por tempo limitado — quando o relógio zerar, o preço volta ao normal.', `<a href="/ofertas" data-link class="link-arrow">Ver todas as ofertas ${UI.arrow}</a>`)}
      <div class="grid" id="offers"></div>
    </div></section>

    <section class="section"><div class="wrap">
      <div class="upgrade reveal">
        <div>
          <span class="eyebrow">Programa Upgrade</span>
          <h2>Seu aparelho atual vale <span class="serif gold">desconto</span> no novo.</h2>
          <p>Avaliamos seu iPhone, iPad, Mac ou Watch na hora e usamos o valor como parte do pagamento. Simples, transparente e sem burocracia.</p>
          <a href="/upgrade" data-link class="btn btn-gold">Simular meu upgrade ${UI.arrow}</a>
        </div>
        <div class="upgrade-steps">
          <div class="ustep"><em>1</em><div><b>Conte sobre seu aparelho</b><span>Modelo, armazenamento e estado.</span></div></div>
          <div class="ustep"><em>2</em><div><b>Receba a avaliação</b><span>Um consultor retorna com a proposta.</span></div></div>
          <div class="ustep"><em>3</em><div><b>Saia com o novo</b><span>Abatemos o valor e você leva hoje.</span></div></div>
        </div>
      </div>
    </div></section>

    <section class="section"><div class="wrap">
      ${sectionHead('iPhone', 'A linha <span class="serif gold">completa</span>', '', `<a href="/categoria/iphone" data-link class="link-arrow">Ver todos os iPhones ${UI.arrow}</a>`)}
      <div class="grid" id="iphones"></div>
    </div></section>

    <section class="section"><div class="wrap">
      ${sectionHead('Nossa loja', 'Atendimento de <span class="serif gold">alto padrão</span>', 'Um espaço pensado para você testar, comparar e sair com a escolha certa.')}
      <div class="gallery">
        <figure class="reveal"><img src="/img/loja-negociacoes.jpg" alt="Ambiente da loja Aladdin Tech" loading="lazy"><figcaption>Consultoria individual, sem pressa</figcaption></figure>
        <figure class="reveal"><img src="/img/loja-atendimento.jpg" alt="Atendimento na Aladdin Tech" loading="lazy"></figure>
        <figure class="reveal"><img src="/img/loja-iphone.jpg" alt="iPhone na Aladdin Tech" loading="lazy"></figure>
        <figure class="reveal quote"><p>“Superou minhas expectativas! Obrigada pelo ótimo atendimento e pela atenção.”</p><span class="muted" style="font-size:13px">— Cliente Aladdin</span></figure>
        <figure class="reveal"><img src="/img/loja-clientes.jpg" alt="Clientes na Aladdin Tech" loading="lazy"><figcaption>Obrigado por escolher a Aladdin</figcaption></figure>
      </div>
    </div></section>

    ${wallHTML()}

    <section class="section"><div class="wrap">
      ${sectionHead('Avaliações', 'Quem compra, <span class="serif gold">recomenda</span>', '')}
      <div id="gReviews"></div>
      <div id="homeReviews"></div>
    </div></section>

    <section class="section" id="guidesSec" hidden><div class="wrap">
      ${sectionHead('Guias', 'Escolha com <span class="serif gold">certeza</span>', 'Comparativos e dicas de quem vive de tecnologia.', `<a href="/guias" data-link class="link-arrow">Ver todos os guias ${UI.arrow}</a>`)}
      <div class="guides-grid" id="homeGuides"></div>
    </div></section>

    <section class="section"><div class="wrap">${visitHTML(false)}</div></section>

    <section class="section"><div class="wrap">${teamHTML()}</div></section>

    <section class="section rank-sec" id="rankSec" hidden><div class="wrap" id="rankBox"></div></section>

    ${ceoHTML()}

    ${faqHomeHTML()}`;

    heroFx();
    loadRanking();
    const [feat, iph, offers] = await Promise.all([api('/api/products?featured=1&limit=8'), api('/api/products?category=iphone&limit=4'), api('/api/products?ofertas=1&limit=4')]);
    cacheProducts(feat); cacheProducts(iph); cacheProducts(offers);
    if (offers.length) { $('#offersSec').style.display = ''; $('#offers').innerHTML = offers.map(productCard).join(''); }
    api('/api/products?bestsellers=1&limit=8').then((b) => { b = cacheProducts(b); if (b.length && $('#bestSec')) { $('#bestSec').hidden = false; $('#bestGrid').innerHTML = b.map((p, i) => rankedCard(p, i + 1)).join(''); observeReveal(); } }).catch(() => {});
    api('/api/products?soon=1&limit=8').then((soon) => { soon = cacheProducts(soon); if (soon.length && $('#soonSec')) { $('#soonSec').style.display = ''; $('#soonGrid').innerHTML = soon.map(productCard).join(''); observeReveal(); } }).catch(() => {});
    $('#featured').innerHTML = feat.map(productCard).join('') || '<div class="empty" style="grid-column:1/-1">Cadastre produtos em destaque no painel.</div>';
    $('#iphones').innerHTML = iph.map(productCard).join('');
    reviewsBlock($('#homeReviews'), null, { limit: 4 });
    googleReviewsBlock($('#gReviews'));
    api('/api/posts').then((ps) => { if (ps.length && $('#guidesSec')) { $('#guidesSec').hidden = false; $('#homeGuides').innerHTML = ps.slice(0, 3).map(postCardHTML).join(''); observeReveal(); } }).catch(() => {});
    observeReveal();
  }

  async function viewShop(m) {
    const params = new URLSearchParams(location.search);
    const catSlug = m && m[1] ? decodeURIComponent(m[1]) : '';
    const cat = S.cats.find((c) => c.slug === catSlug);
    const q = params.get('q') || '', sort = params.get('ordem') || '', cond = params.get('condicao') || '';
    document.title = `${cat ? cat.name : q ? 'Busca: ' + q : 'Loja'} — Aladdin Tech`;
    const base = cat ? '/categoria/' + cat.slug : '/loja';
    const qs = (o) => { const p = new URLSearchParams(location.search); Object.entries(o).forEach(([k, v]) => v ? p.set(k, v) : p.delete(k)); const s = p.toString(); return base + (s ? '?' + s : ''); };

    app.innerHTML = `<div class="wrap">
      <div class="page-head">
        <div class="crumbs"><a href="/" data-link>Início</a> / <a href="/loja" data-link>Loja</a>${cat ? ' / ' + esc(cat.name) : ''}</div>
        <h1 class="page-title">${cat ? esc(cat.name) : q ? `Resultados para <span class="serif gold">“${esc(q)}”</span>` : 'Toda a <span class="serif gold">loja</span>'}</h1>
      </div>
      <div class="shop">
        <aside class="filters">
          <div><h4>Categorias</h4>
            <a href="/loja" data-link class="${!cat ? 'on' : ''}">Tudo</a>
            ${S.cats.map((c) => `<a href="/categoria/${c.slug}" data-link class="${cat && cat.slug === c.slug ? 'on' : ''}">${esc(c.name)} <small>${c.count}</small></a>`).join('')}
          </div>
          <div><h4>Condição</h4>
            ${['', 'Novo', 'Seminovo'].map((c) => `<a href="${qs({ condicao: c })}" data-link class="${cond === c ? 'on' : ''}">${c || 'Todas'}</a>`).join('')}
          </div>
          <div class="ship-box" style="margin:0"><div><i>${UI.chat}</i><div><b>Não achou?</b><span>Encomendamos para você. <a href="#" data-concierge class="gold">Fale com um consultor</a></span></div></div></div>
        </aside>
        <div>
          <div class="chips"><a class="chip ${!cat ? 'on' : ''}" href="/loja" data-link>Tudo</a>${S.cats.map((c) => `<a class="chip ${cat && cat.slug === c.slug ? 'on' : ''}" href="/categoria/${c.slug}" data-link>${esc(c.name)}</a>`).join('')}</div>
          <div class="toolbar">
            <span class="count" id="count">Carregando…</span>
            <div class="field"><select id="sort" aria-label="Ordenar">
              ${[['', 'Relevância'], ['mais-vendidos', 'Mais vendidos'], ['avaliacao', 'Melhor avaliados'], ['preco-asc', 'Menor preço'], ['preco-desc', 'Maior preço'], ['novos', 'Lançamentos'], ['nome', 'Nome A–Z']].map(([v, l]) => `<option value="${v}" ${sort === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select></div>
          </div>
          <div class="grid g3" id="list"></div>
        </div>
      </div></div>`;
    $('#sort').addEventListener('change', (e) => navigate(qs({ ordem: e.target.value }), true));
    const url = new URLSearchParams();
    if (cat) url.set('category', cat.slug);
    if (q) url.set('q', q);
    if (sort) url.set('sort', sort);
    if (cond) url.set('condition', cond);
    const list = cacheProducts(await api('/api/products?' + url));
    $('#count').textContent = `${list.length} produto${list.length !== 1 ? 's' : ''}`;
    $('#list').innerHTML = list.map(productCard).join('') || `<div class="empty" style="grid-column:1/-1">Nenhum produto encontrado. <a href="#" data-concierge class="gold">Fale com um consultor</a> — podemos encomendar para você.</div>`;
    observeReveal();
  }

  const rankedCard = (p, pos) => `<div class="bs-item"><span class="bs-pos" aria-label="${pos}º lugar">${pos}º</span>${productCard(p)}</div>`;
  async function viewBestSellers() {
    const catSlug = new URLSearchParams(location.search).get('categoria') || '';
    document.title = 'Mais vendidos — Aladdin Tech';
    app.innerHTML = `<div class="wrap">
      <div class="page-head"><div class="crumbs"><a href="/" data-link>Início</a> / Mais vendidos</div>
        <h1 class="page-title">Mais <span class="serif gold">vendidos</span></h1>
        <p class="muted" style="max-width:620px">Ranking atualizado automaticamente com os pedidos confirmados — na loja física e no site. Os mais procurados dos últimos 90 dias sobem primeiro.</p></div>
      <div class="chips" id="bsTabs"></div>
      <div class="grid g3" id="bsList">${'<div class="skeleton" style="aspect-ratio:.72"></div>'.repeat(3)}</div></div>`;
    const all = cacheProducts(await api('/api/products?bestsellers=1'));
    const cats = S.cats.filter((c) => all.some((p) => p.category_slug === c.slug));
    $('#bsTabs').innerHTML = `<a class="chip ${!catSlug ? 'on' : ''}" href="/mais-vendidos" data-link>Todos</a>` + cats.map((c) => `<a class="chip ${catSlug === c.slug ? 'on' : ''}" href="/mais-vendidos?categoria=${c.slug}" data-link>${esc(c.name)}</a>`).join('');
    const list = catSlug ? all.filter((p) => p.category_slug === catSlug).sort((x, y) => x.best_rank - y.best_rank) : all;
    $('#bsList').innerHTML = list.slice(0, 30).map((p, i) => rankedCard(p, i + 1)).join('') ||
      `<div class="empty" style="grid-column:1/-1">O ranking aparece assim que os primeiros pedidos forem confirmados. Enquanto isso, veja os <a href="/loja?ordem=avaliacao" data-link class="gold">produtos mais bem avaliados</a>.</div>`;
    observeReveal();
  }

  const GRADE = { A: ['Estado A', 'Impecável: sem marcas visíveis de uso.'], B: ['Estado B', 'Muito bom: marcas leves, só vistas de perto.'], C: ['Estado C', 'Bom: marcas visíveis de uso, funcionamento perfeito.'] };
  function usedSheetHTML(p) {
    if (!/semi|vitrine/i.test(p.condition || '') || !(p.grade || p.battery_health || p.imei_checked || p.used_notes || p.included)) return '';
    const b = +p.battery_health || 0;
    return `<div class="used-sheet"><div class="us-head"><span class="eyebrow">Ficha do ${esc(p.condition.toLowerCase())}</span>${p.real_photos ? `<span class="us-real">${UI.check} Fotos reais desta unidade</span>` : ''}</div>
      <div class="us-grid">
        ${p.grade ? `<div class="us-cell"><span class="us-grade g${p.grade}">${p.grade}</span><div><b>${GRADE[p.grade][0]}</b><small>${GRADE[p.grade][1]}</small></div></div>` : ''}
        ${b ? `<div class="us-cell"><div class="us-bat"><i style="width:${b}%" class="${b >= 85 ? 'ok' : b >= 80 ? 'mid' : 'low'}"></i></div><div><b>Bateria ${b}%</b><small>Saúde máxima medida em Ajustes › Bateria${b >= 85 ? ' · excelente' : b >= 80 ? ' · boa' : ''}</small></div></div>` : ''}
        ${p.imei_checked ? `<div class="us-cell">${UI.shield}<div><b>IMEI verificado</b><small>Sem restrição de roubo, furto ou bloqueio. Aparelho desbloqueado para qualquer operadora.</small></div></div>` : ''}
        <div class="us-cell">${UI.check}<div><b>Revisado e testado</b><small>${p.warranty_months || S.settings.warranty_used_months || 3} meses de garantia da loja${p.included ? ' · acompanha ' + esc(p.included) : ''}</small></div></div>
      </div>${p.used_notes ? `<p class="us-notes"><b>Observações:</b> ${esc(p.used_notes)}</p>` : ''}<div id="laudoLink"></div></div>`;
  }
  function reserveSheet(p, opts) {
    const s = S.settings, c = S.customer || {}, ck = load('at_ck', {}).customer || {};
    const sh = openSheet(`<div class="sheet-head"><div><span class="eyebrow">Reserva sem pagamento</span><h3>Reservar e <span class="serif gold">retirar na loja</span></h3></div><button class="icon-btn" data-close aria-label="Fechar">${UI.close}</button></div>
      <div class="sheet-body"><div class="rs-prod">${thumb(p, 'sm')}<div><b>${esc(p.name)}</b><small>${esc(optsText(opts))}${optsText(opts) ? ' · ' : ''}${brl(p.price)} · pague na loja (Pix, cartão ou dinheiro)</small></div></div>
        <form id="rsForm" style="display:grid;gap:12px">
          <div class="row c2"><div class="field"><label>Seu nome</label><input name="name" required maxlength="80" value="${esc(c.name || ck.name || '')}" autocomplete="name"></div>
            <div class="field"><label>WhatsApp</label><input name="phone" required inputmode="tel" maxlength="20" value="${esc(c.phone || ck.phone || '')}" placeholder="(00) 00000-0000" autocomplete="tel"></div></div>
          <p class="muted" style="margin:0;font-size:13px">${UI.clock.replace('<svg', '<svg style="width:14px;height:14px;display:inline;vertical-align:-2px"')} Fica separado por <b>${s.reserve_hours || 24} horas</b>. ${esc(s.pickup_eta || '')}. Endereço: ${esc(s.address || '')}.</p>
          <p class="form-msg err" id="rsMsg"></p>
          <button class="btn btn-gold btn-block" type="submit">Confirmar reserva</button></form></div>`);
    $('#rsForm', sh.el).addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target)), btn = $('button[type=submit]', e.target), msg = $('#rsMsg', sh.el);
      if (fd.name.trim().length < 3 || digits(fd.phone).length < 10) { msg.textContent = 'Informe seu nome e WhatsApp com DDD.'; return; }
      btn.disabled = true; btn.textContent = 'Reservando…';
      try {
        const ref = getRef();
        const r = await api('/api/reserve', { method: 'POST', body: { product_id: p.id, options: opts, qty: 1, name: fd.name, phone: fd.phone, seller: ref ? ref.code : '', seller_source: ref ? ref.src : '' } });
        track('purchase', { code: r.code, value: 0, items: [] });
        sh.close(); toast('Reserva confirmada!'); navigate('/pedido/' + r.code);
      } catch (err) { msg.textContent = err.message; btn.disabled = false; btn.textContent = 'Confirmar reserva'; }
    });
  }
  const tradeEligible = (p) => { const s = S.settings; if (s.trade_enabled === false) return false;
    const cats = String(s.trade_categories || 'iphone').split(',').map((x) => x.trim()); if (!cats.includes(p.category_slug)) return false;
    if (s.trade_only_new !== false && /semi|usad|vitrine/i.test(p.condition || '')) return false; return !(p.price > 0) ? !!p.coming_soon : p.price >= (+s.trade_min_price || 0); };
  function preorderBoxHTML(p) {
    return `<div class="pre-box" id="preBox"><div class="pre-head"><span class="pre-pulse"></span><div><b>Pré-venda · ${esc(p.coming_eta || 'chegando em breve')}</b><span id="preStats">Carregando a fila…</span></div></div>
      ${p.preorder_deposit > 0 ? `<button class="btn btn-gold btn-block" id="preWant">Eu quero! Garantir com sinal de ${brl(p.preorder_deposit)}</button>
        <p class="pre-rule">Fila por ordem de pagamento: <b>quem paga o sinal primeiro, leva primeiro</b>. O sinal é descontado do valor final e devolvido integralmente se você desistir antes da chegada.</p>` : ''}
      <button class="btn btn-line btn-block" id="preNotify">${UI.bell || ''} Me avise quando chegar</button>
      <div style="display:flex;gap:10px"><a class="btn btn-wa" style="flex:1" id="askBtn" target="_blank" rel="noopener">${UI.wa} Falar com consultor</a></div></div>`;
  }
  async function bindPreorder(p, sel) {
    const st = await api('/api/preorders/' + p.id + '/stats').catch(() => null);
    if (st && $('#preStats')) $('#preStats').innerHTML = [st.units ? `${st.units} unidade(s) no primeiro lote${st.left !== null ? ` · <b class="gold">${st.left} ainda disponível(is) na fila</b>` : ''}` : 'Quantidade do lote a confirmar',
      st.paid ? `${st.paid} já garantida(s) com sinal` : '', st.interested ? `${st.interested} pessoa(s) esperando o aviso` : ''].filter(Boolean).join(' · ');
    const c = S.customer || {};
    const form = (deposit) => `<form id="pvForm" style="display:grid;gap:12px">
        <div class="rs-prod">${thumb(p, 'sm')}<div><b>${esc(p.name)}</b><small>${esc(optsText(sel))}${deposit ? ' · sinal de ' + brl(p.preorder_deposit) : ' · aviso grátis'}</small></div></div>
        <div class="row c2"><div class="field"><label>Seu nome</label><input name="name" required maxlength="80" value="${esc(c.name || '')}" autocomplete="name"></div>
          <div class="field"><label>WhatsApp</label><input name="phone" required inputmode="tel" maxlength="20" value="${esc(c.phone || '')}" placeholder="(00) 00000-0000" autocomplete="tel"></div></div>
        <div class="field"><label>E-mail ${deposit ? '' : '(opcional)'}</label><input name="email" type="email" maxlength="120" value="${esc(c.email || '')}" autocomplete="email"></div>
        ${deposit ? `<div class="field"><label>Pagamento do sinal</label><div class="seg full" id="pvPay"><button type="button" data-pp="pix" class="on">Pix</button><button type="button" data-pp="card">Cartão</button><button type="button" data-pp="cash">Na loja</button></div></div>
          <p class="muted" style="margin:0;font-size:12.5px">${S.settings.online_payments ? 'Pix e cartão abrem o pagamento seguro do Mercado Pago.' : 'Um consultor envia o Pix ou o link do cartão pelo WhatsApp.'} Sua posição na fila conta a partir da confirmação do pagamento.</p>` : ''}
        <p class="form-msg err" id="pvMsg"></p><button class="btn btn-gold btn-block" type="submit">${deposit ? 'Garantir minha unidade' : 'Quero ser avisado'}</button></form>`;
    const open = (deposit) => {
      const sh = openSheet(`<div class="sheet-head"><div><span class="eyebrow">${deposit ? 'Pré-venda com sinal' : 'Lista de espera'}</span><h3>${deposit ? 'Garantir o meu <span class="serif gold">primeiro</span>' : 'Me avise quando <span class="serif gold">chegar</span>'}</h3></div><button class="icon-btn" data-close aria-label="Fechar">${UI.close}</button></div><div class="sheet-body">${form(deposit)}</div>`);
      let pay = 'pix';
      sh.el.addEventListener('click', (e) => { const b = e.target.closest('[data-pp]'); if (b) { pay = b.dataset.pp; $$('[data-pp]', sh.el).forEach((x) => x.classList.toggle('on', x === b)); } });
      $('#pvForm', sh.el).addEventListener('submit', async (e) => {
        e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target)), msg = $('#pvMsg', sh.el), btn = $('button[type=submit]', e.target);
        btn.disabled = true;
        try {
          const r = await api('/api/preorders', { method: 'POST', body: { product_id: p.id, options: sel, type: deposit ? 'sinal' : 'aviso', payment: pay, ...fd } });
          sh.close();
          if (!deposit) { toast(r.already ? 'Você já está na lista. Avisamos assim que chegar!' : 'Pronto! Você será avisado assim que chegar.'); track('lead', { method: 'pre-venda' }); return; }
          track('purchase', { code: r.code, value: p.preorder_deposit, items: [] });
          if (r.pay_url) { location.href = r.pay_url; return; }
          navigate('/pedido/' + r.code);
        } catch (err) { msg.textContent = err.message; btn.disabled = false; }
      });
    };
    $('#preNotify')?.addEventListener('click', () => open(false));
    $('#preWant')?.addEventListener('click', () => open(true));
  }
  async function viewProduct(m) {
    let p;
    try { p = await api('/api/products/' + encodeURIComponent(m[1])); }
    catch { app.innerHTML = `<div class="wrap success"><h1>Produto não encontrado</h1><a href="/loja" data-link class="btn btn-line">Voltar à loja</a></div>`; return; }
    S.currentProduct = p; cacheProducts([p]); track('view_item', { id: p.id, name: p.name, price: p.price });
    document.title = `${p.name} — Aladdin Tech`;
    const sel = {}; (p.options || []).forEach((o) => { if (o.values && o.values.length) sel[o.name] = o.values[0]; });
    let qty = 1, imgIdx = 0;
    const off = p.old_price > p.price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
    const s = S.settings;
    const stockCls = p.stock <= 0 ? 'out' : p.stock <= 3 ? 'low' : '';
    const stockTxt = p.coming_soon ? 'Pré-venda aberta · ' + (p.coming_eta || 'chegando em breve') : p.stock <= 0 ? 'Esgotado — fale com um consultor para encomendar' : p.stock <= 3 ? `Últimas ${p.stock} unidades` : 'Em estoque · pronto para envio';
    const zone0 = (s.delivery_zones || [])[0];

    app.innerHTML = `<div class="wrap">
      <div class="page-head" style="padding-bottom:20px"><div class="crumbs"><a href="/" data-link>Início</a> / <a href="/categoria/${esc(p.category_slug)}" data-link>${esc(p.category_name || 'Loja')}</a> / ${esc(p.name)}</div></div>
      <div class="pdp">
        <div class="pdp-gallery">
          ${(p.images || []).length > 1 ? `<div class="pdp-main pdp-carousel" id="pdpMain">
            <div class="pdp-track" id="pdpTrack" tabindex="0" aria-roledescription="carrossel" aria-label="Fotos do produto">${p.images.map((src, i) => `<figure class="pdp-slide" aria-label="Foto ${i + 1} de ${p.images.length}"><img src="${esc(src)}" alt="${esc(p.name)} — foto ${i + 1}" ${i ? 'loading="lazy"' : ''} draggable="false"></figure>`).join('')}</div>
            <button class="pdp-arrow prev" aria-label="Foto anterior">${UI.chev}</button><button class="pdp-arrow next" aria-label="Próxima foto">${UI.chev}</button>
            <span class="pdp-count" id="pdpCount">1 / ${p.images.length}</span>
            <div class="pdp-dots">${p.images.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div></div>`
          : `<div class="pdp-main" id="pdpMain" ${(p.images || []).length ? 'data-zoom style="cursor:zoom-in"' : ''}>${thumb(p)}</div>`}
          ${(p.images || []).length > 1 ? `<div class="pdp-thumbs">${p.images.map((src, i) => `<button class="${i === 0 ? 'on' : ''}" data-img="${i}" aria-label="Ver foto ${i + 1}"><img src="${esc(src)}" alt=""></button>`).join('')}</div>` : ''}
        </div>
        <div class="pdp-info">
          <span class="brand-l">${esc(p.brand || p.category_name || '')}${p.condition ? ' · ' + esc(p.condition) : ''}${p.sold_label ? ' <span class="sp-sep">|</span> ' + esc(p.sold_label) : ''}</span>
          ${bestChip(p)}
          <div class="pdp-title-row"><h1>${esc(p.name)}</h1>${heartBtn(p.id, 'big')}</div>
          ${p.short ? `<p class="lead">${esc(p.short)}</p>` : ''}
          <div class="pdp-meta">${p.rating_count ? `<a href="#avaliacoes" class="rating-mini sp-line"><span class="sp-rate"><b>${fmtRate(p.rating)}</b>${stars(p.rating)}<span class="muted">(${p.rating_count} avaliaç${p.rating_count > 1 ? 'ões' : 'ão'})</span></span></a>` : '<a href="#avaliacoes" class="rating-mini">Seja o primeiro a avaliar</a>'}<span class="stock-l ${stockCls}">${stockTxt}</span></div>
          <div class="pdp-price">
            ${p.promo && p.promo_end && timeLeft(p.promo_end) ? `<div class="promo-bar"><span>${UI.spark} Oferta por tempo limitado</span><span>termina em <b data-countdown="${esc(p.promo_end)}">${timeLeft(p.promo_end)}</b></span></div>` : p.promo ? `<div class="promo-bar"><span>${UI.spark} Preço promocional</span></div>` : ''}
            ${off ? `<span class="price-old">${brl(p.old_price)}</span>` : ''}
            ${p.coming_soon && !(p.price > 0) ? `<div class="price soon-price">Preço a confirmar</div><span class="price-inst">Entre na lista para saber o preço em primeira mão.</span>` : `
            <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><span class="price">${brl(p.price)}</span>${off ? `<span class="badge off">−${off}%</span>` : ''}</div>
            <span class="price-inst">em até ${installmentsFor(p.price)}</span>
            <div class="pix-line"><i>${UI.pix}</i><span><b class="gold">${brl(pixPrice(p.price))}</b> à vista no Pix (${s.pix_discount || 0}% off)</span></div>`}
          </div>
          ${S.settings.club_enabled !== false && p.price > 0 && !p.coming_soon ? `<p class="cb-earn">${UI.spark} Ganhe a partir de <b class="gold">${brl(p.price * (S.settings.club_pct_silver || 2) / 100)}</b> de cashback no <a href="/minha-conta#clube" data-link>Clube Aladdin</a>.</p>` : ''}
          ${tradeEligible(p) ? `<a class="tg-badge" href="/troca-garantida" data-link>${UI.swap}<div><b>Troca Garantida incluída</b><span>Em ${s.trade_months || 12} meses, recompramos este aparelho por até <b class="gold">${s.trade_pct_a || 60}%</b>${p.price > 0 ? ` (até ${brl(p.price * (s.trade_pct_a || 60) / 100)})` : ''} para você pegar o próximo.</span></div>${UI.arrow}</a>` : ''}
          <div id="opts">${(p.options || []).map((o) => `
            <div class="opt-group"><h5>${esc(o.name)}: <b data-sel="${esc(o.name)}">${esc(sel[o.name] || '')}</b></h5>
              <div class="opts">${o.values.map((v) => `<button class="opt ${sel[o.name] === v ? 'on' : ''}" data-opt="${esc(o.name)}" data-val="${esc(v)}">${esc(v)}</button>`).join('')}</div></div>`).join('')}</div>
          ${p.coming_soon ? preorderBoxHTML(p) : `<div class="buy-row">
            <div class="qty"><button data-pq="-1" aria-label="Diminuir">${UI.minus}</button><span id="pq">1</span><button data-pq="1" aria-label="Aumentar">${UI.plus}</button></div>
            <button class="btn btn-gold" style="flex:1" id="addBtn" ${p.stock <= 0 ? 'disabled' : ''}>${UI.bag} Adicionar à sacola</button>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-line" style="flex:1" id="buyNow" ${p.stock <= 0 ? 'disabled' : ''}>Comprar agora</button>
            <a class="btn btn-wa" style="flex:1" id="askBtn" target="_blank" rel="noopener">${UI.wa} Falar com consultor</a>
          </div>`}
          ${p.stock > 0 && s.pickup_enabled !== false && s.reserve_enabled !== false ? `<button class="btn btn-line btn-block reserve-btn" id="reserveBtn">${UI.store} Reservar e retirar na loja <small>sem pagar agora</small></button>` : ''}
          ${usedSheetHTML(p)}
          ${p.category_slug === 'iphone' ? `<a class="link-arrow cmp-link" href="/comparar?m=${encodeURIComponent(p.name.replace(/\s*\d+\s*(GB|TB).*$/i, ''))}" data-link>Comparar com outros iPhones ${UI.arrow}</a>` : ''}
          ${alertBoxHTML(p)}
          <div class="ship-box">
            ${zone0 ? `<div><i>${UI.truck}</i><div><b>${zone0.fee > 0 ? `Entrega: a partir de ${brl(zone0.fee)}` : esc(zone0.name)}</b><span>${esc(zone0.eta)}${s.free_shipping_above ? ` · Grátis acima de ${brl(s.free_shipping_above)}` : ''}</span></div></div>` : ''}
            ${s.pickup_enabled !== false ? `<div><i>${UI.store}</i><div><b>Retire grátis na loja</b><span>${esc(s.pickup_eta || '')} · ${esc(s.address || '')}</span></div></div>` : ''}
            <div><i>${UI.swap}</i><div><b>Use seu usado no upgrade</b><span><a href="/upgrade" data-link class="gold">Simule a avaliação do seu aparelho</a></span></div></div>
            <div><i>${UI.shield}</i><div><b>Garantia</b><span>${esc(p.warranty_months ? `${p.warranty_months} ${p.warranty_months === 1 ? 'mês' : 'meses'} de garantia Aladdin Tech, consultável pelo IMEI.` : /semi/i.test(p.condition || '') ? `${s.warranty_used_months || 3} meses de garantia Aladdin Tech, consultável pelo IMEI.` : s.warranty_text || '')}</span></div></div>
          </div>
        </div>
      </div>
      ${videosHTML(p)}
      <div class="tabs-block">
        <div><h3>Sobre o produto</h3><div class="desc">${esc(p.description || p.short || '')}</div></div>
        <div><h3>Especificações</h3>${(p.specs || []).length ? `<table class="specs">${p.specs.map((x) => `<tr><td>${esc(x.k)}</td><td>${esc(x.v)}</td></tr>`).join('')}</table>` : '<p class="muted">Consulte um especialista para detalhes técnicos.</p>'}</div>
      </div>
      <section class="section tight" id="avaliacoes" style="border-top:1px solid var(--line)">
        ${sectionHead('Avaliações', 'O que dizem sobre este <span class="serif gold">produto</span>', '')}
        <div id="pReviews"></div>
      </section>
      <section class="section tight" id="perguntas" style="border-top:1px solid var(--line)">
        ${sectionHead('Perguntas e respostas', 'Tire suas <span class="serif gold">dúvidas</span>', '')}
        <div id="pQuestions"></div>
      </section>
      <section class="section tight" id="relatedWrap" style="display:none">
        ${sectionHead('Você também pode gostar', 'Combina com <span class="serif gold">você</span>', '')}
        <div class="grid" id="related"></div>
      </section>
    </div>`;

    const updateAsk = () => {
      const o = optsText(sel);
      $('#askBtn').href = waLink(`Olá! Tenho interesse no ${p.name}${o ? ' (' + o + ')' : ''} — ${brl(p.price)}.\nPode me ajudar?`);
      S.currentSel = { ...sel };
    };
    updateAsk();
    $('#opts').addEventListener('click', (e) => {
      const b = e.target.closest('[data-opt]'); if (!b) return;
      sel[b.dataset.opt] = b.dataset.val;
      $$(`[data-opt="${CSS.escape(b.dataset.opt)}"]`).forEach((x) => x.classList.toggle('on', x === b));
      $(`[data-sel="${CSS.escape(b.dataset.opt)}"]`).textContent = b.dataset.val;
      updateAsk();
    });
    $$('[data-pq]').forEach((b) => b.addEventListener('click', () => {
      qty = Math.max(1, Math.min(Math.max(1, p.stock), qty + Number(b.dataset.pq)));
      $('#pq').textContent = qty;
    }));
    const gal = $('#pdpTrack');
    if (gal) {
      const n = p.images.length;
      const mark = (i) => { imgIdx = i; $('#pdpCount').textContent = `${i + 1} / ${n}`; $$('.pdp-dots i').forEach((d, k) => d.classList.toggle('on', k === i)); $$('[data-img]').forEach((x) => x.classList.toggle('on', +x.dataset.img === i));
        const tb = $(`[data-img="${i}"]`); tb && tb.scrollIntoView({ block: 'nearest', inline: 'nearest' }); };
      const goTo = (i, smooth = true) => { i = (i + n) % n; gal.scrollTo({ left: i * gal.clientWidth, behavior: smooth ? 'smooth' : 'auto' }); mark(i); };
      let st; gal.addEventListener('scroll', () => { clearTimeout(st); st = setTimeout(() => { const i = Math.round(gal.scrollLeft / gal.clientWidth); if (i !== imgIdx) mark(i); }, 60); }, { passive: true });
      $('.pdp-arrow.prev').addEventListener('click', (e) => { e.stopPropagation(); goTo(imgIdx - 1); });
      $('.pdp-arrow.next').addEventListener('click', (e) => { e.stopPropagation(); goTo(imgIdx + 1); });
      gal.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); goTo(imgIdx + 1); } if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(imgIdx - 1); } });
      $$('[data-img]').forEach((b) => b.addEventListener('click', () => goTo(+b.dataset.img)));
      // arrastar com o mouse no computador (no celular o dedo já desliza)
      let down = null, moved = false;
      gal.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; down = { x: e.clientX, left: gal.scrollLeft }; moved = false; gal.classList.add('drag'); });
      window.addEventListener('pointermove', (e) => { if (!down) return; const dx = e.clientX - down.x; if (Math.abs(dx) > 4) moved = true; gal.scrollLeft = down.left - dx; });
      window.addEventListener('pointerup', (e) => { if (!down) return; const dx = e.clientX - down.x; gal.classList.remove('drag'); down = null;
        if (moved) goTo(imgIdx + (dx < -40 ? 1 : dx > 40 ? -1 : 0)); });
      gal.addEventListener('click', () => { if (!moved) lightbox(p.images, imgIdx, (i) => goTo(i, false)); });
      window.addEventListener('resize', () => goTo(imgIdx, false));
    }
    bindAlertBox(p);
    $('#addBtn')?.addEventListener('click', () => { addToCart(p, { ...sel }, qty); openCart(true); });
    $('#buyNow')?.addEventListener('click', () => { addToCart(p, { ...sel }, qty); navigate('/checkout'); });
    if (p.coming_soon) bindPreorder(p, sel);
    bindVideos(p);
    if ($('#laudoLink')) api('/api/inspections/product/' + p.id).then((r) => { if (r.token) $('#laudoLink').innerHTML = `<a class="laudo-link" href="/laudo/${esc(r.token)}" target="_blank" rel="noopener">${UI.shield} Ver laudo técnico completo (31 itens testados) ${UI.arrow}</a>`; }).catch(() => {});
    $('#reserveBtn')?.addEventListener('click', () => reserveSheet(p, { ...sel }));
    // "Falar com consultor": o cliente escolhe quem vai atender (quem enviou o link já vem marcado)
    $('#askBtn').addEventListener('click', (e) => {
      const people = conciergePeople(); if (people.length < 2 && !people[0]?.ref) return; // só a loja: segue direto pro WhatsApp
      e.preventDefault();
      const r = getRef(), k = r ? people.findIndex((x) => x.ref === r.code) : -1;
      CG.person = k >= 0 ? k : 0; CG.topic = 'Quero comprar um produto';
      renderConcierge(); openConcierge(true);
    });

    if (!gal) $('#pdpMain').addEventListener('click', () => { if ((p.images || []).length) lightbox(p.images, imgIdx); });
    reviewsBlock($('#pReviews'), p.id, { productName: p.name });
    questionsBlock($('#pQuestions'), p);
    const rel = cacheProducts((await api('/api/products?limit=5&category=' + encodeURIComponent(p.category_slug || ''))).filter((x) => x.id !== p.id).slice(0, 4));
    if (rel.length) { $('#relatedWrap').style.display = ''; $('#related').innerHTML = rel.map(productCard).join(''); }
    observeReveal();
  }

  /* checkout */
  /* ---------- endereço: CEP, localização e regras de frete ---------- */
  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
  const UF_NAME = { 'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA', 'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO', 'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', 'para': 'PA', 'paraiba': 'PB', 'parana': 'PR', 'pernambuco': 'PE', 'piaui': 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS', 'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO' };
  const normTxt = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  function zoneMatches(z, ad) {
    const scope = z.scope || 'brasil', vals = String(z.values || '').split(',').map(normTxt).filter(Boolean);
    if (scope === 'brasil') return true;
    if (scope === 'estado') return (vals.length ? vals : [normTxt(S.settings.store_uf)]).filter(Boolean).includes(normTxt(ad.uf));
    if (scope === 'cidade') return vals.includes(normTxt(ad.city));
    return false;
  }
  const addrLine = (a) => [a.street && `${a.street}, ${a.number || 's/n'}`, a.complement, a.district, a.city && `${a.city}/${a.uf || ''}`, a.cep].filter(Boolean).join(' · ');
  function addressFormHTML(a = {}, opts = {}) {
    return `<div class="addr-form">
      <div class="geo-row"><button type="button" class="btn btn-line btn-sm" data-geo>${UI.pin} Usar minha localização</button><small class="muted" data-geomsg>ou digite o CEP que preenchemos o resto</small></div>
      ${opts.label ? `<div class="row c2"><div class="field"><label>Nome do endereço</label><input name="label" value="${esc(a.label || 'Casa')}" maxlength="30" placeholder="Casa, Trabalho…"></div><div class="field"><label>Quem recebe</label><input name="recipient" value="${esc(a.recipient || '')}" maxlength="80"></div></div>` : ''}
      <div class="row c3">
        <div class="field"><label>CEP *</label><input name="cep" value="${esc(a.cep || '')}" inputmode="numeric" placeholder="00000-000" maxlength="9" autocomplete="postal-code"></div>
        <div class="field" style="grid-column:span 2"><label>Rua *</label><input name="street" value="${esc(a.street || '')}" autocomplete="address-line1"></div>
      </div>
      <div class="row c3">
        <div class="field"><label>Número *</label><input name="number" value="${esc(a.number || '')}"></div>
        <div class="field"><label>Complemento</label><input name="complement" value="${esc(a.complement || '')}" placeholder="Apto, bloco…"></div>
        <div class="field"><label>Bairro *</label><input name="district" value="${esc(a.district || '')}"></div>
      </div>
      <div class="row c3">
        <div class="field" style="grid-column:span 2"><label>Cidade *</label><input name="city" value="${esc(a.city || '')}" autocomplete="address-level2"></div>
        <div class="field"><label>UF *</label><select name="uf"><option value="">—</option>${UFS.map((u) => `<option ${a.uf === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      </div>
      ${opts.save ? `<label class="switch"><input type="checkbox" name="save_address" checked><span></span>Salvar este endereço no meu perfil</label>` : ''}
    </div>`;
  }
  function bindAddressForm(el, target, onChange) {
    const f = (n) => $(`[name=${n}]`, el);
    const fillCep = async (v) => {
      try {
        const r = await (await fetch(`https://viacep.com.br/ws/${v}/json/`)).json();
        if (r.erro) return false;
        if (r.logradouro) f('street').value = r.logradouro;
        if (r.bairro) f('district').value = r.bairro;
        f('city').value = r.localidade || ''; f('uf').value = r.uf || '';
        (f('street').value ? f('number') : f('street')).focus();
        return true;
      } catch { return false; }
    };
    f('cep').addEventListener('input', async () => {
      const v = digits(f('cep').value).slice(0, 8);
      f('cep').value = v.length > 5 ? v.slice(0, 5) + '-' + v.slice(5) : v;
      if (v.length === 8 && await fillCep(v)) onChange();
    });
    f('uf').addEventListener('change', onChange);
    f('city').addEventListener('change', onChange);
    $('[data-geo]', el).addEventListener('click', () => {
      const msg = $('[data-geomsg]', el), btn = $('[data-geo]', el);
      if (!navigator.geolocation) { msg.textContent = 'Seu navegador não permite localização.'; return; }
      btn.disabled = true; msg.textContent = 'Localizando…';
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        target.lat = lat; target.lng = lng;
        try {
          const r = await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=pt-BR&lat=${lat}&lon=${lng}`)).json();
          const a = r.address || {};
          const cep = digits(a.postcode || '');
          if (a.road) f('street').value = a.road;
          if (a.house_number) f('number').value = a.house_number;
          f('district').value = a.suburb || a.neighbourhood || a.quarter || f('district').value;
          f('city').value = a.city || a.town || a.municipality || a.village || f('city').value;
          const iso = String(a['ISO3166-2-lvl4'] || '').replace('BR-', '');
          f('uf').value = UFS.includes(iso) ? iso : (UF_NAME[normTxt(a.state)] || f('uf').value);
          if (cep.length === 8) { f('cep').value = cep.slice(0, 5) + '-' + cep.slice(5); await fillCep(cep); }
          msg.textContent = 'Localização encontrada — confira o número e o complemento.';
          onChange();
        } catch { msg.textContent = 'Não conseguimos identificar o endereço. Digite o CEP.'; }
        btn.disabled = false;
      }, () => { msg.textContent = 'Permissão de localização negada. Digite o CEP.'; btn.disabled = false; }, { enableHighAccuracy: true, timeout: 12000 });
    });
  }

  function cpfOk(v) {
    const c = digits(v); if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    for (const n of [9, 10]) { let t = 0; for (let i = 0; i < n; i++) t += +c[i] * (n + 1 - i); if (((t * 10) % 11) % 10 !== +c[n]) return false; }
    return true;
  }
  const CK = load('at_ck', { method: 'delivery', zone: 0, payment: 'pix', installments: 1, customer: {}, address: {}, notes: '' });
  async function viewCheckout() {
    document.title = 'Finalizar compra — Aladdin Tech';
    track('begin_checkout', { value: cartSubtotal(), items: S.cart });
    const s = S.settings;
    const clubInfo = S.customer && s.club_enabled !== false ? await api('/api/account/club').catch(() => null) : null;
    if (!S.cart.length) {
      app.innerHTML = `<div class="wrap success"><div class="seal">${UI.bag}</div><h1>Sua sacola está vazia</h1><p class="muted">Explore nossa seleção e encontre seu próximo upgrade.</p><a href="/loja" data-link class="btn btn-gold">Ir para a loja</a></div>`;
      return;
    }
    if (s.pickup_enabled === false && CK.method === 'pickup') CK.method = 'delivery';
    const zones = s.delivery_zones || [];
    if (!zones.length && CK.method === 'delivery') CK.method = 'pickup';
    if (S.customer && !CK.customer.name) CK.customer = { name: S.customer.name, phone: S.customer.phone, email: S.customer.email, cpf: '' };
    const c = CK.customer;
    const saved = S.customer ? await api('/api/account/addresses').catch(() => []) : [];
    if (saved.length && !saved.some((x) => String(x.id) === String(CK.addressId)) && CK.addressId !== 'new') CK.addressId = (saved.find((x) => x.is_default) || saved[0]).id;
    if (!saved.length) CK.addressId = 'new';

    app.innerHTML = `<div class="wrap">
      <div class="page-head"><div class="crumbs"><a href="/" data-link>Início</a> / Finalizar compra</div><h1 class="page-title">Finalizar <span class="serif gold">compra</span></h1></div>
      <form class="checkout" id="ckForm" novalidate>
        <div>
          <div class="step">
            <h3 class="step-title"><em>1</em> Seus dados</h3>
            <div class="row c2">
              <div class="field"><label>Nome completo *</label><input name="name" value="${esc(c.name || '')}" required autocomplete="name"></div>
              <div class="field"><label>WhatsApp *</label><input name="phone" value="${esc(c.phone || '')}" required inputmode="tel" autocomplete="tel" placeholder="(00) 00000-0000"></div>
              <div class="field"><label>E-mail</label><input name="email" type="email" value="${esc(c.email || '')}" autocomplete="email"></div>
              <div class="field"><label>CPF ${s.nfe_on ? '* <small class="muted">(obrigatório na nota fiscal)</small>' : '(para nota fiscal)'}</label><input name="cpf" value="${esc(c.cpf || '')}" inputmode="numeric" maxlength="14" placeholder="000.000.000-00"></div>
            </div>
            ${S.customer ? '' : `<label class="check" style="margin-top:12px"><input type="checkbox" name="cart_consent" ${CK.cartConsent ? 'checked' : ''}><span>Se eu não terminar agora, quero receber um lembrete do meu carrinho por e-mail</span></label>`}
          </div>

          <div class="step">
            <h3 class="step-title"><em>2</em> Entrega ou retirada</h3>
            <div class="choices">
              ${zones.length ? `<button type="button" class="choice ${CK.method === 'delivery' ? 'on' : ''}" data-method="delivery"><span class="radio"></span><i>${UI.truck}</i><div><b>Receber em casa</b><span>Grátis na região · Correios para todo o Brasil</span></div></button>` : ''}
              ${s.pickup_enabled !== false ? `<button type="button" class="choice ${CK.method === 'pickup' ? 'on' : ''}" data-method="pickup"><span class="radio"></span><i>${UI.store}</i><div><b>Retirar na loja</b><span>${esc(s.pickup_eta || '')}</span></div><div class="right">Grátis</div></button>` : ''}
            </div>
            <div class="sub-panel" id="deliveryPanel"></div>
          </div>

          <div class="step">
            <h3 class="step-title"><em>3</em> Pagamento</h3>
            <div class="choices" id="payChoices"></div>
            <div class="sub-panel" id="payPanel"></div>
            <div class="field" style="margin-top:18px"><label>Observações do pedido</label><textarea name="notes" rows="2" placeholder="Ex.: presente, horário preferido para entrega…">${esc(CK.notes || '')}</textarea></div>
            ${sellerList().length ? (() => { const cur = CK.seller ?? (getRef() || {}).code ?? ''; return `<div class="field" style="margin-top:14px"><label>Quem te atendeu? <small class="muted">(opcional)</small></label>
              <select name="seller"><option value="">Ninguém — comprei por conta própria</option>${sellerList().map((x) => `<option value="${esc(x.ref)}" ${cur === x.ref ? 'selected' : ''}>${esc(x.name)}${x.title ? ' — ' + esc(x.title) : ''}</option>`).join('')}</select></div>`; })() : ''}
          </div>
        </div>

        <aside class="summary" id="summary"></aside>
      </form></div>`;

    const form = $('#ckForm');
    const renderDelivery = () => {
      $$('[data-method]').forEach((b) => b.classList.toggle('on', b.dataset.method === CK.method));
      const p = $('#deliveryPanel');
      if (CK.method === 'pickup') {
        p.innerHTML = `<div class="pickup-card"><i>${UI.pin}</i><div><b>${esc(s.store_name || 'Aladdin Tech')}</b><p>${esc(s.address)} · ${esc(s.city)}</p><p>${s.always_open ? 'Aberto 24 horas, todos os dias — retire quando for melhor para você.' : (s.hours || []).map((h) => esc(h.days + ': ' + h.time)).join(' · ')}</p><a href="/como-chegar" data-link class="link-arrow" style="margin-top:8px;font-size:13px">Como chegar ${UI.arrow}</a></div></div>`;
      } else {
        const useNew = CK.addressId === 'new';
        p.innerHTML = `${saved.length ? `<span class="cg-label">Entregar em</span>
          <div class="choices">${saved.map((ad) => `<button type="button" class="choice ${String(CK.addressId) === String(ad.id) ? 'on' : ''}" data-addr="${ad.id}"><span class="radio"></span><i>${UI.pin}</i>
            <div><b>${esc(ad.label)}${ad.is_default ? ' <small class="gold">· principal</small>' : ''}</b><span>${esc(addrLine(ad))}</span></div></button>`).join('')}
            <button type="button" class="choice ${useNew ? 'on' : ''}" data-addr="new"><span class="radio"></span><i>${UI.plus}</i><div><b>Entregar em outro endereço</b><span>Cadastre um endereço novo</span></div></button></div>` : ''}
          <div id="addrForm" ${useNew ? '' : 'hidden'}>${addressFormHTML(CK.address, { save: !!S.customer })}</div>
          <span class="cg-label" style="margin-top:6px" id="zoneLabel"></span>
          <div class="choices" id="zoneChoices"></div>`;
        if (useNew) bindAddressForm($('#addrForm', p), CK.address, () => { saveForm(); renderZones(); renderSummary(); renderPay(); });
        renderZones();
      }
      renderSummary();
    };
    const curAddr = () => CK.method !== 'delivery' ? null : CK.addressId !== 'new' ? saved.find((x) => String(x.id) === String(CK.addressId)) || null : CK.address;
    let quoted = [], quoteKey = '', quoting = false;
    if (typeof CK.zone === 'number') CK.zone = 'z:' + CK.zone;
    const availZones = () => quoted;
    const fetchQuote = async () => {
      const ad = curAddr();
      if (!ad || !ad.uf || digits(ad.cep).length !== 8) { quoted = []; quoteKey = ''; return; }
      const key = [ad.id || '', digits(ad.cep), ad.uf, ad.city, S.cart.map((i) => i.id + 'x' + i.qty).join(',')].join('|');
      if (key === quoteKey) return;
      quoteKey = key; quoting = true; renderZoneBox();
      try {
        const r = await api('/api/shipping/quote', { method: 'POST', body: { address: ad.id ? {} : ad, address_id: ad.id || null, items: S.cart.map((i) => ({ id: i.id, qty: i.qty })) } });
        if (key === quoteKey) quoted = r.options || [];
      } catch { quoted = []; }
      quoting = false;
      if (quoted.length && !quoted.some((z) => z.key === CK.zone)) { CK.zone = quoted.slice().sort((x, y) => x.fee - y.fee)[0].key; save('at_ck', CK); }
      renderZoneBox(); renderSummary(); renderPay();
    };
    const renderZoneBox = () => {
      const box = $('#zoneChoices'); if (!box) return;
      const ad = curAddr(), list = quoted;
      $('#zoneLabel').innerHTML = ad && ad.uf ? `Opções de entrega para <b style="color:var(--text)">${esc(ad.city || '')}/${esc(ad.uf)}</b>` : 'Opções de entrega';
      box.innerHTML = !ad || !ad.uf || digits(ad.cep).length !== 8 ? `<p class="muted" style="margin:0;font-size:13px">Informe o CEP (ou use sua localização) para ver o frete.</p>`
        : quoting ? `<p class="muted" style="margin:0;font-size:13px">${UI.truck.replace('<svg', '<svg style="width:15px;height:15px;display:inline;vertical-align:-3px"')} Calculando o frete para o seu CEP…</p>`
        : list.length ? list.map((z) => `<button type="button" class="choice ${CK.zone === z.key ? 'on' : ''}" data-zone="${esc(z.key)}"><span class="radio"></span><i>${/correios|pac|sedex|jadlog|loggi|azul|j&t/i.test(z.name) ? UI.truck : UI.spark}</i><div><b>${esc(z.name)}</b><span>${esc(z.eta)}</span></div><div class="right" data-zone-fee="${esc(z.key)}"></div></button>`).join('')
        : `<p class="form-msg err" style="margin:0">Ainda não entregamos neste endereço. Fale com um consultor que encontramos uma solução.</p>`;
    };
    const renderZones = () => { renderZoneBox(); fetchQuote(); };
    const renderPay = () => {
      const max = Number(s.max_installments) || 1, nf = Number(s.installments_no_interest) || max;
      $('#payChoices').innerHTML = `
        <button type="button" class="choice ${CK.payment === 'pix' ? 'on' : ''}" data-pay="pix"><span class="radio"></span><i>${UI.pix}</i><div><b>Pix</b><span>${s.online_payments ? 'QR Code na hora · confirmação automática' : 'Aprovação imediata'} · ${s.pix_discount || 0}% de desconto</span></div><div class="right" id="pixVal"></div></button>
        <button type="button" class="choice ${CK.payment === 'card' ? 'on' : ''}" data-pay="card"><span class="radio"></span><i>${UI.card}</i><div><b>Cartão de crédito</b><span>Em até ${max}x · ${nf}x sem juros${s.online_payments ? ' · ambiente seguro Mercado Pago' : ''}</span></div></button>
        <button type="button" class="choice ${CK.payment === 'cash' ? 'on' : ''}" data-pay="cash"><span class="radio"></span><i>${UI.cash}</i><div><b>Na entrega ou retirada</b><span>Dinheiro, débito ou crédito na maquininha</span></div></button>`;
      const panel = $('#payPanel');
      if (CK.payment === 'card') {
        const t = calc().total;
        panel.innerHTML = `<div class="field"><label>Parcelamento</label><select name="installments">${Array.from({ length: max }, (_, i) => i + 1).map((n) => `<option value="${n}" ${+CK.installments === n ? 'selected' : ''}>${n}x de ${brl(t / n)}${n <= nf ? ' sem juros' : ' (acréscimo da operadora)'}</option>`).join('')}</select></div>
          <p class="muted" style="font-size:12.5px;margin:0">${s.online_payments ? 'Ao confirmar, você vai para o ambiente seguro do Mercado Pago para digitar o cartão e escolher as parcelas.' : 'Um consultor envia o link de pagamento seguro pelo WhatsApp logo após o pedido.'}</p>`;
      } else if (CK.payment === 'pix') {
        panel.innerHTML = `<p class="muted" style="font-size:12.5px;margin:0">${s.online_payments ? 'Ao confirmar, o QR Code Pix aparece na hora (Mercado Pago). Pagou, confirmou: seu pedido é liberado automaticamente.' : 'Após confirmar, você recebe a chave Pix e o valor exato pelo WhatsApp.'}</p>`;
      } else panel.innerHTML = '';
    };
    const calc = () => {
      const sub = cartSubtotal();
      const cp = S.coupon;
      let disc = 0, freeship = false;
      if (cp) { disc = cp.type === 'percent' ? sub * cp.value / 100 : cp.type === 'fixed' ? Math.min(cp.value, sub) : 0; freeship = cp.type === 'freeship'; }
      let ship = 0;
      if (CK.method === 'delivery') {
        const z = availZones().find((x) => x.key === CK.zone);
        const free = freeship || (s.free_shipping_above > 0 && sub - disc >= s.free_shipping_above);
        ship = z ? (free ? 0 : z.fee) : 0;
      }
      const base = Math.max(0, sub - disc);
      const pix = CK.payment === 'pix' ? base * (Number(s.pix_discount) || 0) / 100 : 0;
      const cb = clubInfo && CK.useCashback ? Math.min(clubInfo.balance, (base - pix) * (clubInfo.cap_pct || 30) / 100) : 0;
      return { sub, disc, ship, pix, cb, total: base - pix - cb + ship, freeship };
    };
    const renderSummary = () => {
      const k = calc();
      $$('[data-zone-fee]').forEach((el) => {
        const z = quoted.find((x) => x.key === el.dataset.zoneFee); if (!z) return;
        if (!(z.fee > 0)) { el.innerHTML = '<span class="gold">Grátis</span>'; return; }
        const free = k.freeship || (s.free_shipping_above > 0 && k.sub - k.disc >= s.free_shipping_above);
        el.innerHTML = free ? `<span class="gold">Grátis</span><small style="text-decoration:line-through;color:var(--dim)">${brl(z.fee)}</small>` : brl(z.fee);
      });
      const pv = $('#pixVal'); if (pv) { const base = Math.max(0, k.sub - k.disc) + k.ship; pv.innerHTML = `${brl(base - Math.max(0, k.sub - k.disc) * (Number(s.pix_discount) || 0) / 100)}`; }
      $('#summary').innerHTML = `<h3>Resumo</h3>
        <div>${S.cart.map((i) => lineItemHTML(i)).join('')}</div>
        ${S.coupon ? `<div class="coupon-ok"><span>Cupom <b>${esc(S.coupon.code)}</b> aplicado${S.coupon.description ? ' · ' + esc(S.coupon.description) : ''}</span><button type="button" class="btn-ghost" id="rmCoupon">Remover</button></div>`
        : `<div class="coupon-row"><input class="input" id="couponIn" placeholder="Cupom de desconto" aria-label="Cupom"><button type="button" class="btn btn-line btn-sm" id="applyCoupon">Aplicar</button></div><p class="form-msg err" id="couponMsg"></p>`}
        <div class="sum-row"><span>Subtotal</span><span>${brl(k.sub)}</span></div>
        ${k.disc ? `<div class="sum-row disc"><span>Cupom</span><span>− ${brl(k.disc)}</span></div>` : ''}
        <div class="sum-row"><span>${CK.method === 'pickup' ? 'Retirada na loja' : 'Entrega'}</span><span>${CK.method === 'pickup' || k.ship === 0 ? '<span class="gold">Grátis</span>' : brl(k.ship)}</span></div>
        ${k.pix ? `<div class="sum-row disc"><span>Desconto Pix</span><span>− ${brl(k.pix)}</span></div>` : ''}
        ${clubInfo && clubInfo.balance > 0 ? `<label class="cb-use"><input type="checkbox" id="useCb" ${CK.useCashback ? 'checked' : ''}><span><b>Usar meu cashback</b> · ${brl(clubInfo.balance)} disponível${k.cb ? ` <b class="gold">− ${brl(k.cb)}</b>` : ''}<small>Até ${clubInfo.cap_pct}% do valor dos produtos por compra.</small></span></label>` : ''}
        ${clubInfo && clubInfo.enabled ? `<p class="cb-earn">${UI.spark} Você ganha <b class="gold">${brl(Math.max(0, k.sub - k.disc - k.pix - k.cb) * clubInfo.tier.pct / 100)}</b> de cashback nesta compra (nível ${esc(clubInfo.tier.name)}).</p>` : ''}
        <div class="sum-row total"><span>Total</span><span>${brl(k.total)}</span></div>
        ${CK.method === 'delivery' ? freeBarHTML(k.sub - k.disc) : ''}
        <button class="btn btn-gold btn-block" type="submit" id="placeOrder">Confirmar pedido ${UI.arrow}</button>
        <p class="form-msg err" id="orderMsg"></p>
        <div class="secure"><i>${UI.shield}</i> Seus dados são usados apenas para este pedido.</div>`;
      $('#useCb')?.addEventListener('change', (e) => { CK.useCashback = e.target.checked; save('at_ck', CK); renderSummary(); });
      $('#applyCoupon') && $('#applyCoupon').addEventListener('click', applyCoupon);
      $('#couponIn') && $('#couponIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } });
      $('#rmCoupon') && $('#rmCoupon').addEventListener('click', () => { S.coupon = null; save('at_coupon', null); renderSummary(); renderPay(); });
    };
    const applyCoupon = async () => {
      const code = $('#couponIn').value.trim(); if (!code) return;
      const r = await api('/api/coupons/validate', { method: 'POST', body: { code, subtotal: cartSubtotal() } });
      if (!r.ok) { $('#couponMsg').textContent = r.error; return; }
      S.coupon = r; save('at_coupon', r); toast('Cupom aplicado'); renderSummary(); renderPay();
    };
    const saveForm = () => {
      const f = new FormData(form);
      CK.customer = { name: f.get('name') || '', phone: f.get('phone') || '', email: f.get('email') || '', cpf: f.get('cpf') || '' };
      if (f.has('cart_consent') || !S.customer) { const was = CK.cartConsent; CK.cartConsent = f.get('cart_consent') === 'on'; if (CK.cartConsent && CK.customer.email && (!was || true)) syncCartSoon(); }
      if (CK.method === 'delivery' && CK.addressId === 'new' && f.has('cep')) {
        CK.address = { ...CK.address, cep: f.get('cep') || '', street: f.get('street') || '', number: f.get('number') || '', complement: f.get('complement') || '',
          district: f.get('district') || '', city: f.get('city') || '', uf: f.get('uf') || '', recipient: f.get('recipient') || '', label: f.get('label') || 'Casa' };
        CK.saveAddr = f.get('save_address') === 'on';
      }
      CK.notes = f.get('notes') || '';
      if (f.has('seller')) CK.seller = f.get('seller') || '';
      if (f.get('installments')) CK.installments = +f.get('installments');
      save('at_ck', CK);
    };

    form.addEventListener('input', (e) => { if (e.target.name === 'cpf') { const v = digits(e.target.value).slice(0, 11); e.target.value = v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); } });
    form.addEventListener('input', debounce(saveForm, 300));
    form.addEventListener('change', saveForm);
    form.addEventListener('click', (e) => {
      const m = e.target.closest('[data-method]'); if (m) { saveForm(); CK.method = m.dataset.method; save('at_ck', CK); renderDelivery(); renderPay(); return; }
      const ad = e.target.closest('[data-addr]'); if (ad) { saveForm(); CK.addressId = ad.dataset.addr === 'new' ? 'new' : +ad.dataset.addr; save('at_ck', CK); renderDelivery(); renderPay(); return; }
      const z = e.target.closest('[data-zone]'); if (z) { CK.zone = z.dataset.zone; save('at_ck', CK); $$('[data-zone]').forEach((x) => x.classList.toggle('on', x === z)); renderSummary(); renderPay(); return; }
      const p = e.target.closest('[data-pay]'); if (p) { CK.payment = p.dataset.pay; save('at_ck', CK); renderPay(); renderSummary(); return; }
      if (e.target.closest('.line-item')) cartAction(e);
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); saveForm();
      const msg = $('#orderMsg'), btn = $('#placeOrder');
      msg.textContent = '';
      if (!CK.customer.name || digits(CK.customer.phone).length < 10) { msg.textContent = 'Informe seu nome e um WhatsApp válido com DDD.'; $('[name=name]').focus(); return; }
      if (s.nfe_on && !cpfOk(CK.customer.cpf)) { msg.textContent = 'Informe um CPF válido — ele é obrigatório para emitir a sua nota fiscal.'; $('[name=cpf]').focus(); return; }
      if (CK.method === 'delivery' && !availZones().some((z) => z.key === CK.zone)) { msg.textContent = 'Complete o endereço de entrega e escolha uma opção de frete.'; return; }
      btn.disabled = true; btn.textContent = 'Enviando…';
      try {
        const r = await api('/api/orders', { method: 'POST', body: {
          customer: CK.customer, items: S.cart.map((i) => ({ id: i.id, qty: i.qty, options: i.options })),
          delivery_method: CK.method, zone: CK.zone, address: CK.address, payment: CK.payment,
          address_id: CK.addressId !== 'new' ? CK.addressId : null, save_address: CK.addressId === 'new' && CK.saveAddr, address_label: (CK.address || {}).label,
          installments: CK.installments, coupon: S.coupon ? S.coupon.code : '', notes: CK.notes, cart_token: load('at_cart_token', ''),
          use_cashback: !!(clubInfo && CK.useCashback), seller: CK.seller || '', seller_source: CK.seller && getRef() && getRef().code === CK.seller ? getRef().src : 'checkout' } });
        save('at_ref', null); delete CK.seller; save('at_ck', CK);
        track('purchase', { code: r.code, value: r.total, items: S.cart });
        S.cart = []; S.coupon = null; save('at_coupon', null); save('at_cart_token', ''); clearTimeout(cartSyncT); save('at_cart', []); updateCartBadge(); renderCart();
        if (r.pay_url) { btn.textContent = 'Abrindo pagamento seguro…'; history.pushState({}, '', '/pedido/' + r.code); location.href = r.pay_url; return; }
        navigate('/pedido/' + r.code);
      } catch (err) { msg.textContent = err.message; btn.disabled = false; btn.innerHTML = `Confirmar pedido ${UI.arrow}`; }
    });
    renderDelivery(); renderPay();
  }

  /* ---------- app instalável + notificações ---------- */
  const pushOk = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $$('[data-install]').forEach((b) => b.hidden = false); });
  async function pushSubscribe(extra = {}) {
    if (!pushOk()) throw new Error(isIOS() && !isStandalone() ? 'No iPhone, primeiro instale o app: toque em Compartilhar › Adicionar à Tela de Início.' : 'Seu navegador não aceita notificações.');
    const perm = await Notification.requestPermission(); if (perm !== 'granted') throw new Error('Permissão negada. Você pode liberar nas configurações do navegador.');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) { const { key } = await api('/api/push/key'); sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)) }); }
    await api('/api/push/subscribe', { method: 'POST', body: { ...sub.toJSON(), ...extra } });
    return sub;
  }
  async function pushBoxUI(el, order) {
    if (!el) return;
    const reg = pushOk() ? await navigator.serviceWorker.getRegistration() : null, sub = reg ? await reg.pushManager.getSubscription() : null;
    const on = sub && Notification.permission === 'granted';
    el.hidden = false;
    el.innerHTML = `<div><b>${UI.bell} ${order ? 'Acompanhe pelo celular' : 'Notificações neste aparelho'}</b><span>${order ? 'Receba um aviso quando o pagamento confirmar, sair para entrega ou ficar pronto.' : 'Status dos pedidos, cashback e ofertas da semana — direto na tela do celular.'}</span></div>
      ${on && !order ? '<span class="gold">Ativadas ✓</span>' : `<button class="btn btn-line btn-sm" type="button" data-pushon>${order ? 'Avisar no celular' : 'Ativar'}</button>`}`;
    $('[data-pushon]', el)?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try { await pushSubscribe(order ? { order } : {}); toast('Pronto! Avisaremos por aqui.'); el.innerHTML = `<div><b>${UI.bell} Notificações ativadas</b><span>${order ? 'Você será avisado a cada etapa do pedido.' : 'Você vai receber os avisos neste aparelho.'}</span></div><span class="gold">✓</span>`; }
      catch (err) { toast(err.message); e.target.disabled = false; }
    });
  }
  function installSheet() {
    if (installEvt) { installEvt.prompt(); installEvt.userChoice.finally(() => { installEvt = null; }); return; }
    const sh = openSheet(`<div class="sheet-head"><div><span class="eyebrow">App Aladdin Tech</span><h3>Instale na sua <span class="serif gold">tela de início</span></h3></div><button class="icon-btn" data-close aria-label="Fechar">${UI.close}</button></div>
      <div class="sheet-body"><div class="inst-app"><img src="/img/icon-192.png" alt=""><div><b>Aladdin Tech</b><span>Abre como um app, mais rápido, e avisa do seu pedido.</span></div></div>
      ${isIOS() ? '<ol class="inst-steps"><li>No Safari, toque em <b>Compartilhar</b> (o quadrado com a seta para cima).</li><li>Escolha <b>Adicionar à Tela de Início</b>.</li><li>Toque em <b>Adicionar</b>. Pronto: o ícone da Aladdin Tech aparece junto dos seus apps.</li></ol>'
        : '<ol class="inst-steps"><li>Abra o menu do navegador (⋮).</li><li>Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li><li>Confirme. O ícone aparece junto dos seus apps.</li></ol>'}</div>`);
  }
  async function viewOrder(m) {
    let o;
    try { o = await api('/api/orders/' + encodeURIComponent(m[1])); }
    catch { app.innerHTML = `<div class="wrap success"><h1>Pedido não encontrado</h1><a href="/" data-link class="btn btn-line">Voltar ao início</a></div>`; return; }
    // voltando do Mercado Pago: confirma o pagamento direto com o servidor
    const qp = new URLSearchParams(location.search);
    if (o.online && o.pay_status !== 'aprovado' && (qp.get('payment_id') || qp.get('collection_id') || o.pay_status)) {
      try { const r = await api(`/api/orders/${encodeURIComponent(o.code)}/sync`, { method: 'POST', body: { payment_id: qp.get('payment_id') || qp.get('collection_id') || '' } }); o.pay_status = r.pay_status; } catch {}
      if (qp.toString()) history.replaceState({}, '', '/pedido/' + o.code);
    }
    const paid = o.pay_status === 'aprovado';
    const PAY_MSG = { aprovado: ['ok', 'Pagamento aprovado', 'Recebemos seu pagamento. Nossa equipe já está separando seu pedido.'],
      pendente: ['wait', 'Aguardando pagamento', o.payment === 'pix' ? 'Pague o Pix para confirmar sua reserva. A confirmação é automática.' : 'Finalize o pagamento no ambiente seguro do Mercado Pago.'],
      'em análise': ['wait', 'Pagamento em análise', 'O Mercado Pago está analisando. Avisaremos assim que for aprovado.'],
      recusado: ['err', 'Pagamento recusado', 'Tente novamente com outro cartão ou pague via Pix.'],
      cancelado: ['err', 'Pagamento cancelado', 'Você pode tentar pagar novamente.'] };
    const pm = PAY_MSG[o.pay_status];
    document.title = `Pedido ${o.code} — Aladdin Tech`;
    setTimeout(() => { if (o.status !== 'cancelado' && o.status !== 'entregue') pushBoxUI($('#pushOrder'), o.code); }, 0);
    const reserveBox = o.reserve_until && o.status !== 'cancelado' && o.status !== 'entregue' ? `<div class="rs-banner">${UI.store}<div><b>Reserva confirmada · retire até ${new Date(o.reserve_until.replace(' ', 'T')).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</b><span>O produto fica separado no seu nome. Pague na retirada com Pix, cartão ou dinheiro. Endereço: ${esc(S.settings.address || '')} · ${esc(S.settings.city || '')}</span></div><a class="btn btn-line btn-sm" href="/como-chegar" data-link>Como chegar</a></div>` : '';
    const pay = { pix: 'Pix', card: `Cartão de crédito (${o.installments}x)`, cash: 'Na entrega/retirada' }[o.payment];
    const addr = o.delivery_method === 'pickup' ? `Retirada na loja — ${o.delivery.address || ''}`
      : `${o.delivery.label}: ${[o.delivery.address.street, o.delivery.address.number, o.delivery.address.complement, o.delivery.address.district, o.delivery.address.city, o.delivery.address.cep].filter(Boolean).join(', ')}`;
    const text = `Olá! Acabei de fazer o pedido *${o.code}* no site da Aladdin Tech.\n\n` +
      o.items.map((i) => `• ${i.qty}x ${i.name}${optsText(i.options) ? ' (' + optsText(i.options) + ')' : ''} — ${brl(i.price * i.qty)}`).join('\n') +
      `\n\n${o.discount ? `Cupom ${o.coupon}: −${brl(o.discount)}\n` : ''}${o.pix_discount ? `Desconto Pix: −${brl(o.pix_discount)}\n` : ''}${o.shipping ? `Entrega: ${brl(o.shipping)}\n` : ''}*Total: ${brl(o.total)}*\nPagamento: ${pay}\n${addr}\n\nNome: ${o.customer.name}`;
    app.innerHTML = `<div class="wrap"><div class="success">
      <div class="seal">${UI.check}</div>
      <span class="eyebrow">Pedido recebido</span>
      <h1>Obrigado, ${esc((o.customer.name || '').split(' ')[0])}! <span class="serif gold">Seu pedido está reservado.</span></h1>
      ${o.online ? (pm ? `<div class="pay-state ${pm[0]}"><b>${pm[1]}</b><span>${pm[2]}</span></div>` : '')
        : `<p class="muted">Envie o pedido pelo WhatsApp para um consultor confirmar ${o.payment === 'pix' ? 'e enviar a chave Pix' : o.payment === 'card' ? 'e enviar o link de pagamento' : 'os detalhes'}.</p>`}
      ${reserveBox}
      <div class="push-order" id="pushOrder" hidden></div>
      ${(o.items || []).some((i) => i.deposit) ? `<div class="rs-banner">${UI.clock}<div><b>Sinal de pré-venda</b><span>Assim que o pagamento do sinal for confirmado, você entra na fila. Quando o aparelho chegar, avisamos por WhatsApp. O sinal é descontado do valor final.</span></div></div>` : ''}
      ${(o.trade || []).length ? `<div class="rs-banner">${UI.swap}<div><b>Troca Garantida ativada</b><span>${o.trade.map((t) => `${esc(t.product)}: a partir de ${fmtDay(t.opens_at)} vale até ${brl(t.max_value)} de crédito no próximo.`).join(' ')}</span></div><a class="btn btn-line btn-sm" href="/troca-garantida" data-link>Como funciona</a></div>` : ''}
      <div class="order-card">
        <div class="sum-row"><span>Número do pedido</span><span class="order-code">${esc(o.code)}</span></div>
        <hr class="hairline">
        ${o.items.map((i) => `<div class="sum-row"><span>${i.qty}x ${esc(i.name)}${optsText(i.options) ? ` <small style="color:var(--dim)">(${esc(optsText(i.options))})</small>` : ''}</span><span>${brl(i.price * i.qty)}</span></div>`).join('')}
        ${o.discount ? `<div class="sum-row disc"><span>Cupom ${esc(o.coupon)}</span><span>− ${brl(o.discount)}</span></div>` : ''}
        ${o.pix_discount ? `<div class="sum-row disc"><span>Desconto Pix</span><span>− ${brl(o.pix_discount)}</span></div>` : ''}
        <div class="sum-row"><span>${o.delivery_method === 'pickup' ? 'Retirada' : 'Entrega'}</span><span>${o.shipping ? brl(o.shipping) : 'Grátis'}</span></div>
        <div class="sum-row total"><span>Total</span><span>${brl(o.total)}</span></div>
        <hr class="hairline">
        <div class="sum-row"><span>Pagamento</span><span>${esc(pay)}</span></div>
        ${o.doc_url ? `<div class="sum-row"><span>Recibo e garantia</span><span><a href="${esc(o.doc_url)}" target="_blank" rel="noopener" class="gold">Abrir recibo e termo de garantia</a></span></div>` : ''}
        ${o.nfe_danfe ? `<div class="sum-row"><span>Nota fiscal</span><span><a href="${esc(o.nfe_danfe)}" target="_blank" rel="noopener" class="gold">Baixar NF-e nº ${esc(o.nfe_number || '')} (DANFE)</a></span></div>` : ''}
        ${o.tracking ? `<div class="sum-row"><span>Rastreio Correios</span><span><b class="gold">${esc(o.tracking)}</b> · <a href="https://rastreamento.correios.com.br/app/index.php" target="_blank" rel="noopener" class="gold">rastrear</a></span></div>` : ''}
        ${o.delivery && o.delivery.address && typeof o.delivery.address === 'object' ? `<div class="sum-row" style="gap:20px"><span>Endereço</span><span style="text-align:right">${esc(addrLine(o.delivery.address))}</span></div>` : ''}
        <div class="sum-row" style="gap:20px"><span>${o.delivery_method === 'pickup' ? 'Retirada' : 'Entrega'}</span><span style="text-align:right">${esc(o.delivery.eta || '')}</span></div>
      </div>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        ${o.online && !paid ? `<button class="btn btn-gold" id="payNow">${o.payment === 'pix' ? UI.pix + ' Pagar com Pix' : UI.card + ' Pagar com cartão'}</button>` : ''}
        <a class="btn ${o.online && !paid ? 'btn-line' : 'btn-gold'}" href="${waLink(text)}" target="_blank" rel="noopener">${UI.wa} ${o.online ? 'Falar com consultor' : 'Enviar pedido no WhatsApp'}</a>
        ${o.delivery_method === 'pickup' ? `<a class="btn btn-line" href="/como-chegar" data-link>${UI.pin} Como chegar</a>` : `<a class="btn btn-line" href="/loja" data-link>Continuar comprando</a>`}
      </div>
      ${o.online && !paid ? `<p class="secure" style="margin-top:18px"><i>${UI.lock}</i> Pagamento processado pelo Mercado Pago. A Aladdin Tech não vê nem guarda os dados do seu cartão.</p>` : ''}
    </div></div>`;
    const pn = $('#payNow');
    pn && pn.addEventListener('click', async () => {
      pn.disabled = true; pn.textContent = 'Abrindo pagamento seguro…';
      try { const r = await api(`/api/orders/${encodeURIComponent(o.code)}/pay`, { method: 'POST' }); location.href = r.url; }
      catch (e) { toast(e.message); pn.disabled = false; pn.textContent = 'Tentar novamente'; }
    });
  }

  async function viewVisit() {
    document.title = 'Como chegar — Aladdin Tech';
    app.innerHTML = `<div class="wrap">
      <div class="page-head"><div class="crumbs"><a href="/" data-link>Início</a> / Como chegar</div></div>
      ${visitHTML(true)}
      <section class="section tight">${teamHTML()}</section>
      <section class="section tight">${perksHTML()}</section>
      <div class="gallery" style="margin-bottom:80px">
        <figure class="reveal"><img src="/img/loja-negociacoes.jpg" alt="Interior da loja" loading="lazy"><figcaption>Nosso espaço</figcaption></figure>
        <figure class="reveal"><img src="/img/loja-atendimento.jpg" alt="Atendimento" loading="lazy"></figure>
        <figure class="reveal"><img src="/img/loja-clientes.jpg" alt="Clientes" loading="lazy"></figure>
        <figure class="reveal"><img src="/img/loja-iphone.jpg" alt="Produto em destaque" loading="lazy"></figure>
        <figure class="reveal quote"><p>Retire seu pedido na loja em até 1 hora, sem custo.</p><a href="/loja" data-link class="link-arrow">Comprar agora ${UI.arrow}</a></figure>
      </div></div>`;
    observeReveal();
  }

  async function viewReviews() {
    document.title = 'Avaliações — Aladdin Tech';
    app.innerHTML = `<div class="wrap">
      <div class="page-head"><div class="crumbs"><a href="/" data-link>Início</a> / Avaliações</div><h1 class="page-title">A voz de quem <span class="serif gold">confia</span></h1></div>
      <div id="allReviews" style="padding-bottom:96px"></div></div>`;
    reviewsBlock($('#allReviews'), null);
  }

  async function loadRanking() {
    const sec = $('#rankSec'); if (!sec) return;
    let r; try { r = await api('/api/team/ranking'); } catch { return; }
    if (!r.enabled || (!r.podium.length && !r.last_champion)) return;
    const mes = r.label.split(' de ')[0];
    const score = (p) => r.metric === 'vendas' ? `${p.n} ${p.n === 1 ? 'venda' : 'vendas'}` : r.show_values && p.v != null ? brl(p.v) : '';
    const face = (p) => p.photo ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy">` : `<span>${esc((p.name || '?').trim()[0])}</span>`;
    const crown = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><path d="M3.5 8l4.2 3.6L12 5l4.3 6.6L20.5 8l-1.8 10H5.3z"/><path d="M5.6 15.5h12.8"/></svg>';
    const card = (p) => `<div class="rk-p rk-${p.pos}">
        <div class="rk-face">${p.pos === 1 ? `<i class="rk-crown">${crown}</i>` : ''}${face(p)}<b class="rk-pos">${p.pos}º</b></div>
        <strong>${esc(p.name)}</strong><small>${esc(p.title || 'Consultor')}</small>${score(p) ? `<em>${score(p)}</em>` : ''}
        <div class="rk-base"><span>${p.pos}</span></div></div>`;
    const order = [2, 1, 3].map((n) => r.podium.find((p) => p.pos === n)).filter(Boolean);
    $('#rankBox').innerHTML = r.podium.length ? `
      ${sectionHead('Destaques do mês', `Quem mais <span class="serif gold">brilhou</span> em ${esc(mes)}`, 'O ranking da nossa equipe é atualizado a cada venda confirmada. Atendimento de excelência merece aplauso.')}
      <div class="rk-podium reveal">${order.map(card).join('')}</div>
      <div class="rk-foot reveal">
        ${r.prize ? `<span class="rk-prize">${UI.spark} Prêmio do mês: <b>${esc(r.prize)}</b></span>` : ''}
        ${r.last_champion ? `<span class="rk-last">Campeão de ${esc(r.last_champion.label.split(' de ')[0])}: <b>${esc(r.last_champion.name)}</b></span>` : ''}
      </div>`
      : `${sectionHead('Destaques do mês', `O mês de ${esc(mes)} <span class="serif gold">está começando</span>`, 'A disputa já começou. Enquanto isso, aplausos para quem fechou o mês passado no topo.')}
      <div class="rk-podium solo reveal">${card({ ...r.last_champion, pos: 1 })}</div>
      <div class="rk-foot reveal"><span class="rk-last">Campeão de <b>${esc(r.last_champion.label)}</b></span>${r.prize ? `<span class="rk-prize">${UI.spark} Prêmio do mês: <b>${esc(r.prize)}</b></span>` : ''}</div>`;
    sec.hidden = false; observeReveal();
  }
  function teamHTML() {
    const s = S.settings;
    // sem lista própria da equipe, mostra os consultores do atendimento
    const members = sellerList().length ? sellerList().map((x) => ({ name: x.name, role: x.title || 'Consultor', whatsapp: x.whatsapp, photo: x.photo, ref: x.ref }))
      : (s.team_members || []).length ? s.team_members : (s.consultants || []).map((c) => ({ name: c.name, role: c.role, whatsapp: c.whatsapp }));
    const online = isOpenNow();
    return `<div class="team reveal">
      <figure class="team-photo"><img src="${esc(s.team_photo || '/img/loja-atendimento.jpg')}" alt="Equipe Aladdin Tech" loading="lazy"><figcaption><span class="brand-lamp">${ICONS.lamp}</span>Equipe ${esc(s.store_name || 'Aladdin Tech')}</figcaption></figure>
      <div class="team-info">
        <span class="eyebrow">Atendimento humano</span>
        <h2>Quem é a equipe que irá <span class="serif gold">lhe atender</span></h2>
        <p>${esc(s.team_text || '')}</p>
        ${members.length ? `<ul class="team-list">${members.map((m) => `<li>${avatarHTML(m)}<div><b>${esc(m.name)}</b><small>${esc(m.role || '')}</small></div>
          <a class="team-wa" ${m.ref ? `data-ref-wa="${esc(m.ref)}"` : ''} target="_blank" rel="noopener" href="${waLink(`Olá${m.name ? ', ' + m.name : ''}! Vim pelo site da Aladdin Tech.`, m.whatsapp)}" aria-label="Falar com ${esc(m.name)} no WhatsApp">${UI.wa}</a></li>`).join('')}</ul>` : ''}
        <div class="team-trust">
          <span><i class="${online ? 'on' : ''}"></i>${S.settings.always_open ? 'Equipe online 24h, 7 dias' : online ? 'Equipe online agora' : 'Respondemos assim que abrirmos'}</span>
          <span>${UI.shield} Loja física · nota fiscal · garantia</span>
        </div>
        <a href="#" data-concierge class="btn btn-gold btn-sm">${UI.chat} Falar com a equipe</a>
      </div></div>`;
  }
  /* ---------- animação do topo: rede dourada, contagem, digitação ---------- */
  let stopHeroFx = null;
  function heroFx() {
    if (stopHeroFx) { stopHeroFx(); stopHeroFx = null; }
    const sec = $('#heroFx'); if (!sec) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => requestAnimationFrame(() => sec.classList.add('go')));
    const timers = [];
    if (!reduce) {
      // números contando
      $$('[data-count]', sec).forEach((el) => {
        const to = +el.dataset.count, suf = el.dataset.suffix || '', dur = 1400;
        el.textContent = '0' + suf;
        let t0 = null;
        const step = (t) => { if (t0 === null) t0 = t + 650; const p = Math.min(1, Math.max(0, (t - t0) / dur)); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))) + suf; if (p < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      });
      // 24/7 digitado
      $$('[data-type]', sec).forEach((el) => {
        const txt = el.dataset.type; let i = 0; el.textContent = ' ';
        const tick = () => { el.textContent = txt.slice(0, ++i); if (i < txt.length) timers.push(setTimeout(tick, 150)); };
        timers.push(setTimeout(tick, 1500));
      });
    }
    // rede de pontos e linhas finas (reage ao mouse)
    const cv = $('#heroNet'), ctx = cv.getContext('2d');
    let W = 0, H = 0, pts = [], mouse = null, raf = 0, visible = true;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = sec.clientWidth; H = sec.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.max(24, Math.min(85, (W * H) / 17000)));
      pts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22, r: Math.random() * 1.1 + 0.45 }));
    };
    const LINK = 130;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      if (!reduce) for (const p of pts) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; }
      ctx.lineWidth = 0.6;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < LINK * LINK) { ctx.strokeStyle = `rgba(214,178,110,${(1 - Math.sqrt(d2) / LINK) * 0.16})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        }
        if (mouse) {
          const dx = a.x - mouse.x, dy = a.y - mouse.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < 170) { ctx.strokeStyle = `rgba(243,220,164,${(1 - d / 170) * 0.32})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); }
        }
      }
      ctx.fillStyle = 'rgba(243,220,164,.55)';
      for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill(); }
      if (!reduce && visible && !document.hidden) raf = requestAnimationFrame(draw);
    };
    resize(); draw();
    const onMove = (e) => { const r = sec.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const onLeave = () => { mouse = null; };
    sec.addEventListener('mousemove', onMove); sec.addEventListener('mouseleave', onLeave);
    const restart = () => { cancelAnimationFrame(raf); if (!reduce && visible && !document.hidden) raf = requestAnimationFrame(draw); };
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; restart(); });
    io.observe(sec);
    document.addEventListener('visibilitychange', restart);
    let rz; const ro = new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(() => { resize(); if (reduce) draw(); }, 120); });
    ro.observe(sec);
    stopHeroFx = () => { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); timers.forEach(clearTimeout); document.removeEventListener('visibilitychange', restart); };
  }

  /* perguntas frequentes — versão minimalista no fim da página inicial */
  function faqHomeHTML() {
    const list = faqList().slice(0, 6);
    return `<section class="faq-home"><div class="wrap">
      <div class="fh-head reveal"><span class="eyebrow">Dúvidas comuns</span><h2>Perguntas <span class="serif gold">frequentes</span></h2>
        <p>Tudo o que você precisa saber para fazer o seu upgrade com tranquilidade.</p></div>
      <div class="fh-list">${list.map((q) => `<details class="fh-item reveal"><summary>${esc(q.q)}<span aria-hidden="true">+</span></summary><div class="fh-a">${esc(q.a).replace(/\n/g, '<br>')}</div></details>`).join('')}</div>
      <div class="fh-more"><a href="/perguntas-frequentes" data-link class="link-arrow">Ver todas as perguntas ${UI.arrow}</a></div>
    </div></section>`;
  }
  /* homenagem ao fundador & CEO (fim da página inicial) */
  function ceoHTML() {
    const s = S.settings;
    const name = (s.ceo_name || '').trim(), title = s.ceo_title || 'Fundador & CEO';
    const paras = String(s.ceo_text || '').split(/\n+/).filter(Boolean);
    return `<section class="section ceo-sec"><div class="wrap">
      <div class="ceo reveal">
        <div class="ceo-photos">
          <figure class="cp main"><img src="/img/ceo-1.jpg" alt="${esc(name || title)} na Aladdin Tech" loading="lazy"></figure>
          <figure class="cp side1"><img src="/img/ceo-2.jpg" alt="" loading="lazy"></figure>
          <figure class="cp side2"><img src="/img/ceo-3.jpg" alt="" loading="lazy"></figure>
          <span class="ceo-lamp" aria-hidden="true">${ICONS.lamp}</span>
        </div>
        <div class="ceo-text">
          <span class="eyebrow">Uma homenagem · ${esc(title)}</span>
          <h2>O gênio por trás <span class="serif gold">da lâmpada</span></h2>
          ${name ? `<p class="ceo-name">${esc(name)}<small>${esc(title)} · ${esc(s.store_name || 'Aladdin Tech')}</small></p>` : ''}
          ${s.ceo_quote ? `<blockquote><span>“</span>${esc(s.ceo_quote)}</blockquote>` : ''}
          ${paras.map((p) => `<p>${esc(p)}</p>`).join('')}
          <div class="ceo-sign"><span class="line"></span><em>Com gratidão, equipe ${esc(s.store_name || 'Aladdin Tech')}</em></div>
        </div>
      </div>
    </div></section>`;
  }
  function wallHTML() {
    const photos = S.settings.wall_photos || [];
    if (!photos.length) return '';
    // com muitas fotos: duas faixas em sentidos opostos; com poucas, uma faixa
    const idx = photos.map((u, i) => ({ u, i }));
    const rows = photos.length >= 10 ? [idx.filter((_, k) => k % 2 === 0), idx.filter((_, k) => k % 2 === 1)] : [idx];
    const item = (p) => `<button class="wall-item" data-wall="${p.i}" aria-label="Ver foto"><img src="${esc(p.u)}" alt="Cliente Aladdin Tech" loading="lazy"></button>`;
    const track = (list, rev) => {
      const loop = list.length < 6 ? [...list, ...list, ...list] : list;
      return `<div class="wall-track ${rev ? 'rev' : ''}" style="--dur:${Math.max(40, loop.length * 7)}s"><div class="wall-row">${loop.map(item).join('')}${loop.map(item).join('')}</div></div>`;
    };
    return `<section class="section wall-sec">
      <div class="wrap">${sectionHead('Mural dos Upgrades', 'Clientes <span class="serif gold">realizados</span>', esc(S.settings.wall_text || ''), `<span class="wall-count">${photos.length} momentos · toque para ampliar</span>`)}</div>
      ${rows.map((r, k) => track(r, k === 1)).join('')}
    </section>`;
  }

  /* =========================================================
     Lista de desejos · alertas de preço · FAQ · políticas · cookies
     ========================================================= */
  S.wish = new Set(load('at_wish', []).map(Number));
  function updateWishBadge() { const c = $('#wishCount'); if (c) { c.textContent = S.wish.size; c.classList.toggle('on', S.wish.size > 0); } }
  function refreshHearts() { $$('[data-wish]').forEach((b) => b.classList.toggle('on', S.wish.has(+b.dataset.wish))); updateWishBadge(); }
  const saveWish = () => { save('at_wish', [...S.wish]); refreshHearts(); };
  const heartBtn = (id, cls = '') => `<button type="button" class="wish-btn ${cls} ${S.wish.has(+id) ? 'on' : ''}" data-wish="${id}" aria-label="Adicionar à lista de desejos">${UI.heart}</button>`;
  async function syncWish() {
    if (!S.customer) return;
    try { const ids = await api('/api/account/wishlist', { method: 'POST', body: { ids: [...S.wish] } }); S.wish = new Set(ids.map(Number)); saveWish(); } catch {}
  }
  function toggleWish(id) {
    id = +id; const on = !S.wish.has(id);
    on ? S.wish.add(id) : S.wish.delete(id); saveWish();
    toast(on ? 'Salvo na sua lista de desejos' : 'Removido da lista de desejos');
    if (S.customer) (on ? api('/api/account/wishlist', { method: 'POST', body: { product_id: id } }) : api('/api/account/wishlist/' + id, { method: 'DELETE' })).catch(() => {});
    if (location.pathname === '/lista-de-desejos' && !on) viewWishlist();
  }

  async function viewWishlist() {
    document.title = 'Lista de desejos — Aladdin Tech';
    const ids = [...S.wish];
    const list = ids.length ? cacheProducts(await api('/api/products?ids=' + ids.join(','))) : [];
    app.innerHTML = `<div class="wrap">
      <div class="page-head"><div class="crumbs"><a href="/" data-link>Início</a> / Lista de desejos</div>
        <h1 class="page-title">Seus <span class="serif gold">desejos</span></h1>
        <p class="muted" style="max-width:560px;font-weight:300;margin:10px 0 0">${S.customer ? 'Sua lista fica salva na sua conta, em qualquer aparelho.' : 'Sua lista está salva neste navegador. <a href="#" class="gold" id="wishLogin">Entre na sua conta</a> para guardar em qualquer aparelho.'}
          Ative o <b style="color:var(--text)">alerta de preço</b> na página do produto e avisamos quando baixar.</p></div>
      ${list.length ? `<div class="grid" style="padding-bottom:96px">${list.map(productCard).join('')}</div>`
        : `<div class="empty" style="margin-bottom:96px"><div style="width:44px;height:44px;margin:0 auto 12px;color:var(--gold)">${UI.heart}</div>Sua lista está vazia. Toque no coração dos produtos para guardar o que você deseja.<br><a href="/loja" data-link class="btn btn-line btn-sm" style="margin-top:16px">Explorar a loja</a></div>`}
    </div>`;
    const wl = $('#wishLogin'); wl && wl.addEventListener('click', (e) => { e.preventDefault(); authSheet('login', '', () => syncWish().then(viewWishlist)); });
    observeReveal();
  }

  /* alerta de preço / chegada — bloco da página do produto */
  function alertBoxHTML(p) {
    const out = p.stock <= 0;
    return `<div class="alert-box" id="alertBox">
      <i>${UI.bell}</i>
      <div class="ab-text"><b>${out ? 'Avise-me quando chegar' : 'Alerta de preço'}</b><span>${out ? 'Receba um e-mail assim que este produto voltar ao estoque.' : 'Ainda pensando? Avisamos por e-mail se o preço baixar.'}</span></div>
      <form class="ab-form" id="alertForm">${S.customer ? '' : '<input class="input" name="email" type="email" placeholder="Seu e-mail" required autocomplete="email">'}<button class="btn btn-line btn-sm" type="submit">${out ? 'Avisar quando chegar' : 'Criar alerta'}</button></form>
      <p class="form-msg" id="alertMsg"></p></div>`;
  }
  function bindAlertBox(p) {
    const f = $('#alertForm'); if (!f) return;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('#alertMsg'), btn = $('button', f); btn.disabled = true;
      try {
        const r = await api('/api/alerts', { method: 'POST', body: { product_id: p.id, email: f.email ? f.email.value : '' } });
        msg.className = 'form-msg ok'; msg.textContent = r.message; f.hidden = true;
      } catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; btn.disabled = false; }
    });
  }
  async function viewAlertCancel() {
    const t = new URLSearchParams(location.search).get('t');
    let ok = false; try { await api('/api/alerts/cancel', { method: 'POST', body: { t } }); ok = true; } catch {}
    app.innerHTML = `<div class="wrap success"><div class="seal">${ok ? UI.check : UI.close}</div><h1>${ok ? 'Alerta <span class="serif gold">cancelado</span>' : 'Link inválido'}</h1>
      <p class="muted">${ok ? 'Você não receberá mais avisos sobre este produto.' : 'Este alerta já pode ter sido cancelado.'}</p><a href="/" data-link class="btn btn-line">Voltar à loja</a></div>`;
  }

  /* perguntas frequentes (padrão gerado com os dados reais da loja; editável no painel) */
  function faqList() {
    const s = S.settings;
    if ((s.faq || []).length) return s.faq;
    const zones = (s.delivery_zones || []).map((z) => `${z.name}: ${z.fee > 0 ? brl(z.fee) : 'grátis'} (${z.eta})`).join('; ');
    return [
      { q: 'Quais são as formas de pagamento?', a: `Pix com ${s.pix_discount || 0}% de desconto, cartão de crédito em até ${s.max_installments || 12}x (${s.installments_no_interest || s.max_installments || 12}x sem juros) e pagamento na entrega ou retirada (dinheiro, débito ou crédito).${s.online_payments ? ' Pix e cartão são processados no ambiente seguro do Mercado Pago, e a confirmação é automática.' : ' Após o pedido, um consultor confirma o pagamento com você pelo WhatsApp.'}` },
      { q: 'Quanto custa e quanto tempo demora a entrega?', a: `O frete é calculado pelo seu CEP no carrinho. ${zones ? 'Opções atuais — ' + zones + '.' : ''}${s.free_shipping_above > 0 ? ` Compras acima de ${brl(s.free_shipping_above)} têm frete grátis.` : ''} Enviamos para todo o Brasil e informamos o código de rastreio por e-mail.` },
      ...(s.always_open ? [{ q: 'Qual é o horário de funcionamento?', a: 'A Aladdin Tech funciona 24 horas por dia, 7 dias por semana — inclusive fins de semana e feriados. Você pode visitar a loja, retirar seu pedido ou falar com a equipe a qualquer hora.' }] : []),
      { q: 'Posso retirar na loja?', a: s.pickup_enabled !== false ? `Sim, sem custo. ${s.pickup_eta || ''}. Endereço: ${s.address || ''} — ${s.city || ''}.` : 'No momento a retirada na loja está indisponível.' },
      { q: 'Os produtos têm garantia e nota fiscal?', a: `Sim. Todos os produtos são vendidos com nota fiscal. ${s.warranty_text || ''}` },
      { q: 'O que significa “seminovo”?', a: 'São aparelhos revisados e testados pela nossa equipe, com o estado e a saúde da bateria informados no anúncio e garantia da loja.' },
      { q: 'Como funciona o Upgrade (usar meu aparelho como parte do pagamento)?', a: 'Preencha os dados do seu aparelho na página Upgrade e receba uma proposta pelo WhatsApp. A avaliação final é feita na loja, e o valor é abatido na compra do novo.' },
      { q: 'Posso desistir da compra?', a: 'Sim. Em compras feitas pela internet, você pode desistir em até 7 dias a partir do recebimento do produto (art. 49 do Código de Defesa do Consumidor), com o produto nas condições em que foi entregue. Fale com um consultor para iniciar a devolução.' },
      { q: 'Como acompanho meu pedido?', a: 'Pela página do pedido ou em Minha conta → Pedidos. Você também recebe e-mails a cada etapa e, nos envios pelos Correios, o código de rastreio.' },
      { q: 'Como funcionam a lista de desejos e o alerta de preço?', a: 'Toque no coração de qualquer produto para guardá-lo na sua lista. Na página do produto, ative o alerta de preço e avisamos por e-mail se o valor baixar — ou quando um produto esgotado voltar ao estoque.' },
      { q: 'Meus dados estão seguros?', a: 'Sim. Senhas são guardadas de forma criptografada, os dados do cartão são digitados apenas no ambiente do processador de pagamento e não compartilhamos seus dados para publicidade. Veja a nossa Política de Privacidade.' },
    ];
  }
  function viewFaq() {
    document.title = 'Perguntas frequentes — Aladdin Tech';
    const list = faqList();
    app.innerHTML = `<div class="wrap legal">
      <div class="page-head"><div class="crumbs"><a href="/" data-link>Início</a> / Perguntas frequentes</div>
        <h1 class="page-title">Perguntas <span class="serif gold">frequentes</span></h1>
        <div class="faq-search"><span>${UI.search}</span><input id="faqQ" placeholder="Busque por pagamento, entrega, garantia…" aria-label="Buscar nas perguntas"></div></div>
      <div class="faq" id="faqList">${list.map((f, i) => `<details class="faq-item reveal" ${i === 0 ? 'open' : ''}><summary>${esc(f.q)}<i>${UI.plus}</i></summary><div class="faq-a">${esc(f.a).replace(/\n/g, '<br>')}</div></details>`).join('')}</div>
      <p class="muted" id="faqNone" hidden>Nenhuma pergunta encontrada.</p>
      <div class="faq-cta"><div><b>Não encontrou sua resposta?</b><span>Nossa equipe responde rapidinho pelo WhatsApp.</span></div><a href="#" data-concierge class="btn btn-gold btn-sm">${UI.chat} Falar com um consultor</a></div>
    </div>`;
    $('#faqQ').addEventListener('input', (e) => {
      const q = normTxt(e.target.value); let n = 0;
      $$('.faq-item').forEach((d) => { const show = !q || normTxt(d.textContent).includes(q); d.hidden = !show; if (show) n++; if (q && show) d.open = true; });
      $('#faqNone').hidden = n > 0;
    });
    observeReveal();
  }

  const legalWho = () => {
    const s = S.settings;
    return `${esc(s.legal_name || s.store_name || 'Aladdin Tech')}${s.cnpj ? ', inscrita no CNPJ ' + esc(s.cnpj) : ''}, com endereço em ${esc(s.address || '')} — ${esc(s.city || '')}`;
  };
  const contactEmail = () => esc(S.settings.dpo_email || S.settings.email || '');
  const updated = () => { const d = S.settings.policies_updated; return d ? new Date(d + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : ''; };
  async function googleReviewsBlock(el) {
    if (!el) return; const g = await api('/api/google-reviews').catch(() => null);
    if (!g || !g.total) return;
    el.innerHTML = `<div class="g-rev reveal"><a class="g-head" href="${esc(g.url)}" target="_blank" rel="noopener"><span class="g-logo">G</span><div><b>${String(g.rating).replace('.', ',')} <span class="g-stars">${stars(Math.round(g.rating))}</span></b><span>${g.total} avaliações no Google</span></div>${UI.arrow}</a>
      ${g.reviews.length ? `<div class="g-list">${g.reviews.map((r) => `<figure class="g-item"><div class="g-who">${r.photo ? `<img src="${esc(r.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span>${esc(r.author[0] || '?')}</span>`}<div><b>${r.profile ? `<a href="${esc(r.profile)}" target="_blank" rel="noopener">${esc(r.author)}</a>` : esc(r.author)}</b><small>${stars(r.rating)} · ${esc(r.when)}</small></div></div><blockquote>${esc(r.text)}</blockquote></figure>`).join('')}</div>` : ''}
      <small class="muted g-src">Avaliações públicas do Google, exibidas com atribuição.</small></div>`;
    observeReveal();
  }
  const postCardHTML = (p) => `<a class="guide-card reveal" href="/guias/${esc(p.slug)}" data-link>${p.cover ? `<img src="${esc(p.cover)}" alt="" loading="lazy">` : `<span class="guide-ico">${ICONS.lamp}</span>`}<div><b>${esc(p.title)}</b><span>${esc(p.excerpt || '')}</span><em>Ler guia ${UI.arrow}</em></div></a>`;
  async function viewAbout() {
    const s = S.settings; document.title = 'Nossa história — Aladdin Tech';
    const g = await api('/api/google-reviews').catch(() => null);
    const paras = String(s.about_story || '').split(/\n+/).filter(Boolean);
    const stats = (s.about_stats || []).filter((x) => x.n && x.l), tl = (s.about_timeline || []).filter((x) => x.y && x.t);
    const photos = (s.wall_photos || []).slice(0, 6);
    app.innerHTML = `<div class="wrap about">
      <div class="page-head"><div class="crumbs"><a href="/" data-link>Início</a> / Nossa história</div>
        <h1 class="page-title">Muito mais que uma <span class="serif gold">loja</span></h1></div>
      <div class="about-intro reveal"><div class="about-text">${paras.map((p) => `<p>${esc(p)}</p>`).join('')}
        <div class="about-trust">${g && g.total ? `<a href="${esc(g.url)}" target="_blank" rel="noopener" class="trust-chip"><span class="g-logo">G</span><b>${String(g.rating).replace('.', ',')}</b><span>${g.total} avaliações no Google</span></a>` : ''}
          ${s.reclameaqui_url ? `<a href="${esc(s.reclameaqui_url)}" target="_blank" rel="noopener" class="trust-chip"><span class="ra-logo">RA</span><b>${esc(s.reclameaqui_score || 'Reclame Aqui')}</b><span>reputação no Reclame Aqui</span></a>` : ''}
          <span class="trust-chip">${UI.shield}<b>24h</b><span>loja física aberta todos os dias</span></span></div></div>
        <figure class="about-photo"><img src="${esc(s.team_photo || '/img/loja-atendimento.jpg')}" alt="Equipe Aladdin Tech" loading="lazy"></figure></div>
      ${stats.length ? `<div class="about-stats reveal">${stats.map((x) => `<div><b>${esc(x.n)}</b><span>${esc(x.l)}</span></div>`).join('')}</div>` : ''}
      ${tl.length ? `<section class="section tight"><h2 class="about-h">Nossa trajetória</h2><ol class="about-tl">${tl.map((x) => `<li class="reveal"><b>${esc(x.y)}</b><span>${esc(x.t)}</span></li>`).join('')}</ol></section>` : ''}
    </div>
    ${ceoHTML()}
    <div class="wrap"><section class="section tight">${teamHTML()}</section>
      ${photos.length ? `<section class="section tight"><h2 class="about-h">Nosso dia a dia</h2><div class="about-gal">${photos.map((u) => `<img src="${esc(u)}" alt="" loading="lazy" class="reveal">`).join('')}</div></section>` : ''}
      <section class="section tight" style="margin-bottom:60px">${visitHTML(false)}</section></div>`;
    observeReveal();
  }
  async function viewService(m) {
    const s = S.settings;
    if (m && m[1]) {
      document.title = 'Acompanhar conserto — Aladdin Tech';
      let o; try { o = await api('/api/service/' + encodeURIComponent(m[1])); } catch { app.innerHTML = '<div class="wrap success"><h1>Ordem de serviço não encontrada</h1><a href="/assistencia" data-link class="btn btn-line">Voltar</a></div>'; return; }
      const STEPS = ['recebido', 'em_analise', 'orcamento', 'em_reparo', 'pronto', 'entregue'], cur = STEPS.indexOf(o.status);
      app.innerHTML = `<div class="wrap"><div class="page-head"><div class="crumbs"><a href="/" data-link>Início</a> / <a href="/assistencia" data-link>Assistência</a> / ${esc(o.code)}</div>
        <h1 class="page-title">Olá, ${esc(o.name)}! <span class="serif gold">${esc(o.status_label)}</span></h1><p class="muted">${esc(o.device)} · OS ${esc(o.code)}${o.eta ? ' · previsão: ' + esc(o.eta) : ''}</p></div>
        ${o.status === 'cancelado' ? '<p class="form-msg err">Este serviço foi cancelado. Fale com a loja se precisar de ajuda.</p>' : `<ol class="os-steps">${STEPS.map((k, i) => `<li class="${i < cur ? 'done' : i === cur ? 'on' : ''}"><i></i><span>${{ recebido: 'Recebido', em_analise: 'Análise', orcamento: 'Orçamento', em_reparo: 'Reparo', pronto: 'Pronto', entregue: 'Entregue' }[k]}</span></li>`).join('')}</ol>`}
        ${o.budget > 0 ? `<div class="os-budget ${o.budget_status}"><div><small>Orçamento</small><b>${brl(o.budget)}</b>${o.budget_notes ? `<p>${esc(o.budget_notes)}</p>` : ''}</div>
          ${o.budget_status === 'aguardando' ? '<div class="os-act"><button class="btn btn-gold" data-budget="1">Aprovar o reparo</button><button class="btn btn-line" data-budget="0">Recusar</button></div>' : `<span class="${o.budget_status === 'aprovado' ? 'gold' : 'muted'}">${o.budget_status === 'aprovado' ? '✓ Aprovado' : 'Recusado'}</span>`}</div>` : ''}
        <div class="os-hist"><h3 class="acct-h" style="font-size:18px">Histórico</h3>${o.history.slice().reverse().map((h) => `<div class="ref-row"><b>${esc(h.label || h.status)}</b><span class="muted">${new Date(h.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span><span>${esc(h.note || '')}</span></div>`).join('')}</div>
        <p class="muted" style="font-size:13px;margin:18px 0 80px">O serviço tem garantia de ${o.warranty_days} dias. Dúvidas? <a class="gold" target="_blank" rel="noopener" href="${waLink('Olá! Sobre a minha OS ' + o.code + ' (' + o.device + ').')}">Fale com a assistência no WhatsApp</a>.</p></div>`;
      app.onclick = async (e) => { const b = e.target.closest('[data-budget]'); if (!b) return;
        if (b.dataset.budget === '1' ? !confirm('Aprovar o orçamento de ' + brl(o.budget) + ' e iniciar o reparo?') : !confirm('Recusar o orçamento? O aparelho fica disponível para retirada sem o reparo.')) return;
        try { await api('/api/service/' + encodeURIComponent(m[1]) + '/budget', { method: 'POST', body: { approve: b.dataset.budget === '1' } }); toast(b.dataset.budget === '1' ? 'Orçamento aprovado! Avisaremos quando ficar pronto.' : 'Orçamento recusado.'); viewService(m); } catch (err) { toast(err.message); } };
      return;
    }
    document.title = 'Assistência técnica — Aladdin Tech';
    app.innerHTML = `<div class="wrap"><div class="page-head"><div class="crumbs"><a href="/" data-link>Início</a> / Assistência técnica</div>
      <h1 class="page-title">Assistência <span class="serif gold">técnica</span></h1><p class="muted" style="max-width:640px">Troca de tela, bateria, conector, câmera e reparos em iPhone, iPad, Mac e Apple Watch. Orçamento antes de qualquer serviço, peças de qualidade e acompanhamento online de cada etapa.</p></div>
      <div class="os-wrap"><form class="panel-lite" id="osForm"><h3>Acompanhar meu conserto</h3>
        <div class="field"><label>Número da OS</label><input name="code" placeholder="OS123456" required autocapitalize="characters"></div>
        <div class="field"><label>4 últimos dígitos do seu WhatsApp</label><input name="phone" inputmode="numeric" maxlength="4" placeholder="0000" required></div>
        <p class="form-msg err" id="osMsg"></p><button class="btn btn-gold btn-block" type="submit">Ver andamento</button></form>
        <div class="os-why"><div>${UI.shield}<b>Orçamento antes</b><span>Nada é feito sem a sua aprovação — e você aprova pelo celular.</span></div>
          <div>${UI.clock}<b>Acompanhe online</b><span>Cada etapa aparece aqui e chega no seu WhatsApp.</span></div>
          <div>${UI.check}<b>Garantia do serviço</b><span>90 dias de garantia em todo reparo realizado.</span></div>
          <a class="btn btn-wa" target="_blank" rel="noopener" href="${waLink('Olá! Quero um orçamento de conserto.')}">${UI.wa} Pedir orçamento</a></div></div></div>`;
    $('#osForm').addEventListener('submit', async (e) => { e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target));
      try { const r = await api('/api/service/lookup', { method: 'POST', body: fd }); navigate('/assistencia/' + r.token); } catch (err) { $('#osMsg').textContent = err.message; } });
  }
  async function viewGuides() {
    document.title = 'Guias — Aladdin Tech';
    const ps = await api('/api/posts').catch(() => []);
    app.innerHTML = `<div class="wrap"><div class="page-head"><div class="crumbs"><a href="/" data-link>Início</a> / Guias</div><h1 class="page-title">Guias para escolher <span class="serif gold">melhor</span></h1>
      <p class="muted" style="max-width:620px">Comparativos, dicas e tudo o que a gente explica no balcão — escrito pela equipe da Aladdin Tech.</p></div>
      <div class="guides-grid" style="margin-bottom:90px">${ps.map(postCardHTML).join('') || '<p class="muted">Em breve.</p>'}</div></div>`;
    observeReveal();
  }
  async function viewGuide(m) {
    let g; try { g = await api('/api/posts/' + encodeURIComponent(m[1])); } catch { app.innerHTML = '<div class="wrap success"><h1>Guia não encontrado</h1><a href="/guias" data-link class="btn btn-line">Ver os guias</a></div>'; return; }
    document.title = g.title + ' — Aladdin Tech';
    app.innerHTML = `<div class="wrap"><article class="post">
      <div class="crumbs"><a href="/" data-link>Início</a> / <a href="/guias" data-link>Guias</a></div>
      <h1>${esc(g.title)}</h1><p class="post-meta">Equipe Aladdin Tech · atualizado em ${fmtDay(g.updated_at || g.created_at)}</p>
      ${g.cover ? `<img class="post-cover" src="${esc(g.cover)}" alt="">` : ''}
      <div class="post-body">${g.html}</div>
      <div class="cmp-cta"><div><b>Quer ajuda para decidir?</b><span>Um consultor tira suas dúvidas e avalia o seu usado como parte do pagamento.</span></div>
        <a class="btn btn-line" href="/upgrade" data-link>${UI.swap} Avaliar meu usado</a><a href="#" data-concierge class="btn btn-gold">${UI.chat} Falar com consultor</a></div>
      ${g.more.length ? `<h2 class="post-more">Leia também</h2><div class="guides-grid">${g.more.map(postCardHTML).join('')}</div>` : ''}</article></div>`;
    // produtos citados no guia
    const slots = $$('.post-prod'); if (slots.length) {
      for (const el of slots) { try { const p = await api('/api/products/' + el.dataset.prod); cacheProducts([p]); el.innerHTML = `<div class="grid post-grid">${productCard(p)}</div>`; } catch { el.remove(); } }
    }
    observeReveal();
  }
  // vídeos do produto: só carrega o player quando o cliente toca (página leve e sem cookies de terceiros antes do clique)
  function videoEmbed(u) {
    let m;
    if ((m = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(u))) return { kind: 'YouTube', thumb: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`, src: `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0`, vertical: /shorts\//.test(u) };
    if ((m = /instagram\.com\/(?:reel|reels|p)\/([\w-]+)/.exec(u))) return { kind: 'Instagram', src: `https://www.instagram.com/reel/${m[1]}/embed`, vertical: true };
    if ((m = /tiktok\.com\/@[^/]+\/video\/(\d+)/.exec(u))) return { kind: 'TikTok', src: `https://www.tiktok.com/embed/v2/${m[1]}`, vertical: true };
    return null;
  }
  function videosHTML(p) {
    const vs = (p.videos || []).map(videoEmbed).filter(Boolean); if (!vs.length) return '';
    return `<section class="section tight pv-sec"><h3 class="pv-title">Veja em vídeo</h3><div class="pv-row">${vs.map((v, i) => `<button class="pv-item ${v.vertical ? 'v' : ''}" data-video="${i}" aria-label="Assistir vídeo ${i + 1} (${v.kind})">${v.thumb ? `<img src="${esc(v.thumb)}" alt="" loading="lazy">` : `<span class="pv-ph">${esc(v.kind)}</span>`}<span class="pv-play">${UI.chev}</span><small>${esc(v.kind)}</small></button>`).join('')}</div></section>`;
  }
  function bindVideos(p) {
    const vs = (p.videos || []).map(videoEmbed).filter(Boolean);
    $$('[data-video]').forEach((b) => b.addEventListener('click', () => { const v = vs[+b.dataset.video];
      b.outerHTML = `<div class="pv-item ${v.vertical ? 'v' : ''} on"><iframe src="${esc(v.src)}" title="Vídeo do produto" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>`; }));
  }
  function legalPage(title, html) {
    app.innerHTML = `<div class="wrap legal"><div class="page-head"><div class="crumbs"><a href="/" data-link>Início</a> / ${title.replace(/<[^>]+>/g, '')}</div><h1 class="page-title">${title}</h1>
      <p class="muted">Última atualização: ${updated()}</p></div>
      <nav class="legal-nav"><a href="/privacidade" data-link class="${location.pathname === '/privacidade' ? 'on' : ''}">Privacidade</a><a href="/cookies" data-link class="${location.pathname === '/cookies' ? 'on' : ''}">Cookies</a><a href="/perguntas-frequentes" data-link>Perguntas frequentes</a></nav>
      <article class="legal-body">${html}</article></div>`;
  }
  function viewTradeIn() {
    const s = S.settings, a = s.trade_pct_a || 60, b = s.trade_pct_b || 50, c = s.trade_pct_c || 40, m = s.trade_months || 12, w = s.trade_window_days || 90;
    document.title = 'Troca Garantida — Aladdin Tech';
    app.innerHTML = `<div class="wrap">
      <div class="page-head"><div class="crumbs"><a href="/" data-link>Início</a> / Troca Garantida</div>
        <h1 class="page-title">Troca <span class="serif gold">Garantida</span></h1>
        <p class="muted" style="max-width:640px">Compre seu iPhone hoje e, daqui a ${m} meses, a gente recompra ele por até <b class="gold">${a}% do valor que você pagou</b> — em crédito para o próximo. Incluído na compra, sem custo extra.</p></div>
      <div class="tg-steps">
        <div><em>1</em><b>Compre</b><span>Todo iPhone novo elegível vem com o certificado de Troca Garantida no recibo.</span></div>
        <div><em>2</em><b>Use por ${m} meses</b><span>A partir do mês ${m}, você tem ${w} dias para fazer a troca. A gente avisa por WhatsApp e e-mail.</span></div>
        <div><em>3</em><b>Troque</b><span>Traga o aparelho: avaliamos o estado e o valor vira crédito no novo iPhone.</span></div></div>
      <div class="tg-table"><div class="tg-row head"><span>Estado do aparelho</span><span>Você recebe</span><span>Exemplo: comprou por R$ 8.000</span></div>
        ${[['A', 'Sem marcas de uso', a], ['B', 'Marcas leves, só vistas de perto', b], ['C', 'Marcas visíveis, funcionando perfeitamente', c]].map(([g, d, p]) => `<div class="tg-row"><span><b class="us-grade g${g}">${g}</b>${d}</span><span class="gold">${p}% do valor pago</span><span>${brl(8000 * p / 100)} de crédito</span></div>`).join('')}</div>
      <div class="legal" style="margin:30px 0 90px;max-width:760px"><h2>Condições</h2><ul>
        <li>Vale para iPhones novos comprados na Aladdin Tech${s.trade_min_price ? ` a partir de ${brl(s.trade_min_price)}` : ''}, com o certificado no recibo.</li>
        <li>O aparelho precisa estar funcionando, sem tela ou traseira trincada, sem contato com líquido, sem reparo fora da loja e com a conta iCloud removida.</li>
        <li>O valor é crédito para um novo aparelho na loja (uso único, válido por 30 dias após a avaliação), não dinheiro.</li>
        <li>Prazo: do mês ${m} até ${w} dias depois. Uma troca por aparelho.</li></ul>
        <a class="btn btn-gold" href="/categoria/iphone" data-link>Ver iPhones com Troca Garantida ${UI.arrow}</a></div></div>`;
  }
  async function viewCompare() {
    document.title = 'Comparar iPhones — Aladdin Tech';
    if (!window.IPHONES) await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = '/js/iphones.js'; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); });
    const L = window.IPHONES, names = L.map((x) => x.m);
    const want = (new URLSearchParams(location.search).get('m') || '').split(',').map((x) => x.trim()).filter(Boolean);
    const pick = want.map((w) => names.find((n) => n.toLowerCase() === w.toLowerCase())).filter(Boolean);
    const defaults = ['iPhone 18 Pro Max', 'iPhone 17 Pro Max', 'iPhone 16 Pro Max'];
    const cols = [...new Set([...pick, ...defaults])].slice(0, 3);
    const prods = await api('/api/products?category=iphone&limit=100').catch(() => []);
    const match = (m) => prods.filter((p) => { const n = p.name.toLowerCase(), k = m.toLowerCase(); if (!n.startsWith(k)) return false; return !/^(e\b|\s*(pro|plus|max|mini|air)\b)/.test(n.slice(k.length)); });
    const yes = (v) => v ? `<span class="cmp-yes">${UI.check}</span>` : '<span class="muted">—</span>';
    const ROWS = [['Tela', (x) => esc(x.tela)], ['Chip', (x) => `<b>${esc(x.chip)}</b>`], ['Câmeras traseiras', (x) => esc(x.cam)], ['Zoom', (x) => esc(x.zoom)], ['Câmera frontal', (x) => esc(x.front)],
      ['Bateria (vídeo)', (x, best) => `<b class="${x.bat === best ? 'gold' : ''}">até ${x.bat} h</b>`], ['Armazenamento', (x) => esc(x.sto)], ['Desbloqueio', (x) => esc(x.id)], ['Conector', (x) => esc(x.usb)],
      ['Apple Intelligence', (x) => yes(x.ai)], ['Dynamic Island', (x) => yes(x.di)], ['Tela ProMotion 120 Hz', (x) => yes(x.pm)], ['Botão de Ação', (x) => yes(x.act)], ['Controle da Câmera', (x) => yes(x.cc)], ['5G', (x) => yes(!x.no5g)], ['Lançamento', (x) => x.y]];
    const draw = () => {
      const D = cols.map((c) => L.find((x) => x.m === c)), best = Math.max(...D.map((x) => x.bat));
      $('#cmpBody').innerHTML = `<div class="cmp-table" style="--n:${D.length}">
        <div class="cmp-row cmp-top"><div></div>${D.map((x, i) => { const ps = match(x.m), min = ps.length ? Math.min(...ps.map((p) => p.price)) : 0;
          return `<div class="cmp-head"><select data-col="${i}" aria-label="Modelo ${i + 1}">${names.map((n) => `<option ${n === x.m ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
            ${min ? `<div class="cmp-price"><small>a partir de</small><b>${brl(min)}</b><small>${installmentsFor(min)}</small></div><a class="btn btn-gold btn-sm" href="/produto/${esc(ps.find((p) => p.price === min).slug)}" data-link>Ver na loja</a>`
              : `<div class="cmp-price"><small>Sob encomenda</small><b class="muted">Consulte</b></div><a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="${waLink('Olá! Vocês têm o ' + x.m + '? Vim pelo comparador do site.')}">${UI.wa} Consultar</a>`}</div>`; }).join('')}</div>
        ${ROWS.map(([l, fn]) => `<div class="cmp-row"><div class="cmp-l">${l}</div>${D.map((x) => `<div>${fn(x, best)}</div>`).join('')}</div>`).join('')}
        <div class="cmp-row"><div class="cmp-l"></div>${D.map((x) => `<div>${x.note ? `<small class="muted">${esc(x.note)}</small>` : ''}</div>`).join('')}</div></div>`;
      history.replaceState(null, '', '/comparar?m=' + cols.map(encodeURIComponent).join(','));
    };
    app.innerHTML = `<div class="wrap">
      <div class="page-head"><div class="crumbs"><a href="/" data-link>Início</a> / Comparar iPhones</div><h1 class="page-title">Compare os <span class="serif gold">iPhones</span></h1>
        <p class="muted" style="max-width:620px">Escolha até três modelos e veja lado a lado. Especificações oficiais da Apple; preços e disponibilidade da nossa loja.</p></div>
      <div id="cmpBody"></div>
      <div class="cmp-cta"><div><b>Na dúvida entre dois?</b><span>Um consultor explica a diferença na prática e avalia o seu usado como parte do pagamento.</span></div>
        <a class="btn btn-line" href="/upgrade" data-link>${UI.swap} Avaliar meu usado</a><a href="#" data-concierge class="btn btn-gold">${UI.chat} Falar com consultor</a></div>
      <p class="muted" style="font-size:12px;margin:18px 0 80px">Bateria: tempo de reprodução de vídeo informado pela Apple para os modelos vendidos no Brasil. Recursos podem variar com a versão do iOS.</p></div>`;
    $('#cmpBody').addEventListener('change', (e) => { const sl = e.target.closest('[data-col]'); if (sl) { cols[+sl.dataset.col] = sl.value; draw(); } });
    draw();
  }
  function viewWarranty() {
    document.title = 'Consultar garantia — Aladdin Tech';
    const q = new URLSearchParams(location.search).get('imei') || '';
    app.innerHTML = `<div class="wrap">
      <div class="page-head"><div class="crumbs"><a href="/" data-link>Início</a> / Garantia</div><h1 class="page-title">Consultar <span class="serif gold">garantia</span></h1>
        <p class="muted" style="max-width:560px">Digite o IMEI ou o número de série do aparelho comprado na Aladdin Tech. No iPhone: Ajustes › Geral › Sobre, ou disque <b>*#06#</b>.</p></div>
      <form class="war-q" id="warForm"><input class="input" name="imei" inputmode="text" autocomplete="off" maxlength="24" placeholder="IMEI (15 dígitos) ou nº de série" value="${esc(q)}" required>
        <button class="btn btn-gold" type="submit">${UI.shield} Consultar</button></form>
      <div id="warRes" class="war-res"></div>
      <section class="section tight">${perksHTML()}</section></div>`;
    const run = async (v) => {
      const box = $('#warRes'); box.innerHTML = '<p class="muted">Consultando…</p>';
      try {
        const w = await api('/api/warranty/' + encodeURIComponent(v.replace(/\s/g, '')));
        box.innerHTML = `<div class="war-card ${w.active ? 'ok' : 'off'}"><span class="war-st">${w.active ? '● Garantia ativa' : '● Garantia encerrada'}</span>
          <h3>${esc(w.product)}</h3><p class="muted">${esc(w.condition)} · ${w.serial_type === 'imei' ? 'IMEI' : 'Nº de série'} terminado em <b>${esc(w.serial_end)}</b>${w.customer ? ' · ' + esc(w.customer) : ''}</p>
          <div class="war-grid"><div><small>Compra</small><b>${esc(w.sold_at)}</b></div><div><small>Prazo</small><b>${w.months} ${w.months === 1 ? 'mês' : 'meses'}</b></div><div><small>Válida até</small><b>${esc(w.expires_at)}</b></div>
            ${w.active ? `<div><small>Restam</small><b class="gold">${w.days_left} dias</b></div>` : ''}</div>
          <a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="${waLink(`Olá! Quero acionar a garantia do meu ${w.product} (${w.serial_type === 'imei' ? 'IMEI' : 'série'} final ${w.serial_end}).`)}">${UI.wa} ${w.active ? 'Acionar garantia' : 'Falar com a loja'}</a></div>`;
      } catch (e) { box.innerHTML = `<p class="form-msg err">${esc(e.message)}</p>`; }
    };
    $('#warForm').addEventListener('submit', (e) => { e.preventDefault(); const v = e.target.imei.value.trim(); if (v) { history.replaceState(null, '', '/garantia?imei=' + encodeURIComponent(v)); run(v); } });
    if (q) run(q);
  }
  function viewPrivacy() {
    document.title = 'Política de Privacidade — Aladdin Tech';
    const s = S.settings;
    legalPage('Política de <span class="serif gold">Privacidade</span>', `
      <p>Esta política explica como a ${legalWho()} (“Aladdin Tech”, “nós”) trata os seus dados pessoais, de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).</p>
      <h2>1. Quais dados coletamos</h2>
      <ul>
        <li><b>Cadastro:</b> nome, e-mail, WhatsApp, senha (armazenada de forma criptografada), foto de perfil e capa (opcionais), cidade e uma breve descrição (opcional).</li>
        <li><b>Compras:</b> produtos, valores, forma de pagamento, endereço de entrega, CPF (opcional, para emissão de nota fiscal) e histórico de pedidos.</li>
        <li><b>Localização:</b> somente se você tocar em “Usar minha localização” e autorizar no navegador, para preencher o endereço de entrega.</li>
        <li><b>Conteúdo que você publica:</b> avaliações, fotos de avaliações e perguntas sobre produtos.</li>
        <li><b>Preferências:</b> lista de desejos, alertas de preço e consentimento para receber ofertas.</li>
        <li><b>Dados técnicos:</b> endereço IP e registros de acesso, usados para segurança e prevenção de fraudes.</li>
      </ul>
      <p>Não coletamos os dados do seu cartão: eles são digitados diretamente no ambiente do processador de pagamento.</p>
      <h2>2. Para que usamos e com qual base legal</h2>
      <ul>
        <li><b>Processar pedidos, entregas, trocas e garantia</b> — execução de contrato (art. 7º, V).</li>
        <li><b>Emitir nota fiscal e cumprir obrigações legais e fiscais</b> — obrigação legal (art. 7º, II).</li>
        <li><b>Enviar ofertas, lançamentos e cupons por e-mail</b> — apenas com o seu consentimento (art. 7º, I), que pode ser retirado a qualquer momento.</li>
        <li><b>Alertas de preço e de estoque</b> — a seu pedido, até você cancelar.</li>
        <li><b>Segurança da conta, prevenção a fraudes e melhoria do atendimento</b> — legítimo interesse (art. 7º, IX).</li>
      </ul>
      <h2>3. Com quem compartilhamos</h2>
      <p>Não vendemos nem alugamos seus dados. Compartilhamos apenas o necessário com:</p>
      <ul>
        <li><b>Processador de pagamento</b>${s.online_payments ? ' (Mercado Pago)' : ''}, para processar Pix e cartão;</li>
        <li><b>Correios e transportadoras</b>, para a entrega (nome, endereço e telefone);</li>
        <li><b>Provedor de e-mail</b>, para enviar confirmações, avisos de pedido e ofertas;</li>
        <li><b>Serviços de endereço e mapa</b>: ViaCEP (consulta de CEP), OpenStreetMap (quando você usa a localização) e Google Maps (mapa da página Como chegar);</li>
        <li><b>Autoridades</b>, quando houver obrigação legal ou ordem judicial.</li>
      </ul>
      <h2>4. Por quanto tempo guardamos</h2>
      <p>Mantemos os dados da sua conta enquanto ela estiver ativa. Dados de pedidos e notas fiscais são guardados pelo prazo exigido pela legislação fiscal (em regra, 5 anos). Ao excluir sua conta, apagamos perfil, fotos, endereços, lista de desejos e alertas; pedidos permanecem pelo prazo legal, desvinculados do seu perfil.</p>
      <h2>5. Como protegemos</h2>
      <p>Senhas criptografadas, sessões protegidas, bloqueio após tentativas de acesso suspeitas, conexão segura (HTTPS) e acesso restrito da equipe, com registro de atividades.</p>
      <h2>6. Seus direitos</h2>
      <p>Você pode, a qualquer momento: confirmar se tratamos seus dados; acessar, corrigir ou atualizar dados; pedir a anonimização, o bloqueio ou a exclusão de dados desnecessários; pedir a portabilidade; revogar o consentimento para ofertas; e obter informações sobre com quem compartilhamos (art. 18 da LGPD). Muitas dessas ações você faz sozinho em <a href="/minha-conta" data-link>Minha conta → Configurações</a>, inclusive excluir a conta.</p>
      <h2>7. Contato e encarregado de dados</h2>
      <p>Para exercer seus direitos ou tirar dúvidas, escreva para <a href="mailto:${contactEmail()}">${contactEmail()}</a>. Respondemos em até 15 dias.</p>
      <h2>8. Menores de idade</h2>
      <p>Nossos serviços são destinados a maiores de 18 anos. Compras por menores devem ser feitas pelos responsáveis.</p>
      <h2>9. Alterações</h2>
      <p>Podemos atualizar esta política. A data da última atualização fica no topo da página; mudanças relevantes serão comunicadas por e-mail ou no site.</p>
      <p>Saiba como usamos cookies na <a href="/cookies" data-link>Política de Cookies</a>.</p>`);
  }
  document.addEventListener('click', (e) => { if (e.target.closest('#cookieChange')) { try { localStorage.removeItem('at_cookie_ok'); } catch {} cookieBanner(true); } });
  function viewCookies() {
    document.title = 'Política de Cookies — Aladdin Tech';
    legalPage('Política de <span class="serif gold">Cookies</span>', `
      <p>Cookies e armazenamento local são pequenos arquivos que o navegador guarda para o site funcionar. ${hasTrackers() ? '<b>Os essenciais estão sempre ativos</b>; os de medição (Google Analytics e Meta) só funcionam se você permitir.' : '<b>Usamos apenas o essencial</b>: não usamos cookies de publicidade nem de rastreamento entre sites.'}</p>
      <h2>Cookies e dados que o site usa</h2>
      <div class="cookie-table">
        <div><b>at_cli</b><span>Cookie</span><span>Mantém você conectado à sua conta de cliente.</span><span>30 dias</span></div>
        <div><b>at_sess</b><span>Cookie</span><span>Mantém a equipe conectada ao painel da loja (não é usado para clientes).</span><span>12 horas</span></div>
        <div><b>at_cart · at_coupon · at_ck</b><span>Armazenamento local</span><span>Guarda sua sacola, o cupom aplicado e os dados do checkout para você não perder nada.</span><span>Até você limpar</span></div>
        <div><b>at_wish</b><span>Armazenamento local</span><span>Guarda sua lista de desejos neste navegador.</span><span>Até você limpar</span></div>
        <div><b>at_cookie_ok</b><span>Armazenamento local</span><span>Lembra a sua escolha sobre cookies.</span><span>Até você limpar</span></div>
        ${hasTrackers() ? `${S.settings.ga4_id ? '<div><b>_ga · _ga_*</b><span>Cookie (Google Analytics)</span><span>Medição de visitas e de vendas, de forma agregada. Só com a sua permissão.</span><span>Até 2 anos</span></div>' : ''}
        ${S.settings.meta_pixel_id ? '<div><b>_fbp</b><span>Cookie (Meta)</span><span>Mede o resultado dos anúncios no Instagram e Facebook. Só com a sua permissão.</span><span>3 meses</span></div>' : ''}` : ''}
      </div>
      ${hasTrackers() ? `<p>Sua escolha atual: <b>${consent() === 'todos' ? 'todos os cookies' : 'só essenciais'}</b>. <button type="button" class="btn btn-line btn-sm" id="cookieChange">Mudar minha escolha</button></p>` : ''}
      <h2>Serviços de terceiros</h2>
      <ul>
        <li><b>Google Fonts</b> — carrega as fontes do site.</li>
        <li><b>Google Maps</b> — o mapa da página Como chegar pode definir cookies do Google.</li>
        <li><b>ViaCEP e OpenStreetMap</b> — consultados apenas quando você digita o CEP ou usa sua localização.</li>
        <li><b>Mercado Pago</b> — quando ativado, o pagamento acontece no site deles, com as políticas deles.</li>
      </ul>
      <h2>Como controlar</h2>
      <p>Você pode apagar ou bloquear cookies nas configurações do navegador. Se bloquear os essenciais, o login e a sacola podem não funcionar. Dúvidas: <a href="mailto:${contactEmail()}">${contactEmail()}</a>.</p>`);
  }

  /* aviso de cookies */
  // consentimento: '1' (antigo, só essenciais), 'essenciais' ou 'todos'
  const hasTrackers = () => !!(S.settings.ga4_id || S.settings.meta_pixel_id);
  const consent = () => { try { return localStorage.getItem('at_cookie_ok') || ''; } catch { return ''; } };
  const setConsent = (v) => { try { localStorage.setItem('at_cookie_ok', v); } catch {} if (v === 'todos') startTracking(); };
  function startTracking() { if (hasTrackers() && consent() === 'todos' && window.ATtrack) { ATtrack.start(S.settings); ATtrack.send('page'); } }
  const track = (ev, d) => { if (window.ATtrack && consent() === 'todos') ATtrack.send(ev, d); };
  function cookieBanner(force) {
    const c = consent();
    // sem medição configurada, o aviso antigo ("só essenciais") basta; com medição, pede a escolha
    if (!force && (c === 'todos' || c === 'essenciais' || (c && !hasTrackers()))) return;
    if ($('#cookieBar')) return;
    const t = hasTrackers();
    document.body.insertAdjacentHTML('beforeend', `<div class="cookie-bar" id="cookieBar" role="region" aria-label="Aviso de cookies">
      <p><b>Cookies</b> ${t ? 'Usamos cookies essenciais para login, sacola e lista de desejos e, se você permitir, cookies de medição (Google Analytics e Meta) para entender o que funciona na loja e melhorar nossos anúncios.' : 'Usamos apenas cookies essenciais para seu login, sacola e lista de desejos funcionarem. Nada de publicidade.'} <a href="/cookies" data-link>Saiba mais</a> · <a href="/privacidade" data-link>Privacidade</a></p>
      <div class="cookie-act">${t ? '<button class="btn btn-line btn-sm" id="cookieEss">Só essenciais</button><button class="btn btn-gold btn-sm" id="cookieAll">Aceitar todos</button>' : '<button class="btn btn-gold btn-sm" id="cookieOk">Entendi</button>'}</div></div>`);
    requestAnimationFrame(() => $('#cookieBar').classList.add('on'));
    const close = (v) => { setConsent(v); $('#cookieBar').remove(); };
    $('#cookieOk')?.addEventListener('click', () => close('essenciais'));
    $('#cookieEss')?.addEventListener('click', () => close('essenciais'));
    $('#cookieAll')?.addEventListener('click', () => close('todos'));
  }

  async function viewCartRecover() {
    const t = new URLSearchParams(location.search).get('t');
    let c = null; try { c = await api('/api/cart/' + encodeURIComponent(t || '')); } catch {}
    if (!c || !c.items.length) {
      app.innerHTML = `<div class="wrap success"><div class="seal">${UI.bag}</div><h1>Esse carrinho <span class="serif gold">expirou</span></h1><p class="muted">${c && c.status === 'convertido' ? 'Esse pedido já foi finalizado. Obrigado!' : 'Os itens não estão mais disponíveis.'}</p><a href="/loja" data-link class="btn btn-gold">Ir para a loja</a></div>`;
      return;
    }
    S.cart = c.items.map((i) => ({ key: i.id + '|' + JSON.stringify(i.options || {}), ...i })); save('at_cart_token', t); persistCart();
    if (c.coupon && !S.coupon) { try { const r = await api('/api/coupons/validate', { method: 'POST', body: { code: c.coupon, subtotal: cartSubtotal() } }); if (r.ok) { S.coupon = r; save('at_coupon', r); } } catch {} }
    history.replaceState({}, '', '/checkout');
    toast('Sua sacola foi restaurada'); viewCheckout();
  }
  async function viewCartStop() {
    const t = new URLSearchParams(location.search).get('t');
    let ok = false; try { ok = (await api('/api/cart/stop', { method: 'POST', body: { t } })).ok; } catch {}
    app.innerHTML = `<div class="wrap success"><div class="seal">${UI.check}</div><h1>Lembretes <span class="serif gold">desativados</span></h1><p class="muted">${ok ? 'Você não receberá mais lembretes sobre este carrinho.' : 'Este link não é mais válido.'}</p><a href="/" data-link class="btn btn-line">Voltar à loja</a></div>`;
  }

  async function viewOffers() {
    document.title = 'Ofertas — Aladdin Tech';
    app.innerHTML = `<div class="wrap">
      <div class="page-head"><div class="crumbs"><a href="/" data-link>Início</a> / Ofertas</div>
        <h1 class="page-title">Ofertas <span class="serif gold">relâmpago</span></h1>
        <p class="muted" style="max-width:520px;font-weight:300">Preços especiais por tempo limitado, com a mesma procedência e garantia de sempre.</p></div>
      <div class="grid" id="list" style="padding-bottom:96px"></div></div>`;
    const list = cacheProducts(await api('/api/products?ofertas=1'));
    $('#list').innerHTML = list.map(productCard).join('') || `<div class="empty" style="grid-column:1/-1">Nenhuma oferta ativa agora. Volte em breve — ou <a href="#" data-concierge class="gold">fale com um consultor</a> e peça uma condição especial.</div>`;
    observeReveal();
  }

  /* ---------- seletor com busca (lupa) ---------- */
  function devicePicker(el, { items = [], placeholder = 'Selecione', searchPh = 'Pesquisar modelo…', onChange = () => {}, disabled = false }) {
    let open = false, q = '', value = null;
    const listHTML = () => {
      const f = items.map((it, i) => ({ ...it, i })).filter((it) => !q || normTxt(it.label + ' ' + (it.group || '')).includes(normTxt(q)));
      if (!f.length) return `<p class="dp-empty">Nenhum modelo encontrado.${q ? ` <button type="button" data-other>Usar “${esc(q)}”</button>` : ''}</p>`;
      let last = '', html = '';
      for (const it of f) {
        if (it.group && it.group !== last) { html += `<span class="dp-group">${esc(it.group)}</span>`; last = it.group; }
        html += `<button type="button" class="dp-opt ${value && value.label === it.label ? 'on' : ''}" data-i="${it.i}">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</button>`;
      }
      return html;
    };
    const render = () => {
      el.innerHTML = `<button type="button" class="dp-btn ${value ? 'has' : ''}" ${disabled ? 'disabled' : ''}><span>${value ? esc(value.label) : esc(placeholder)}</span>${UI.search}</button>
        ${open ? `<div class="dp-pop"><label class="dp-search">${UI.search}<input placeholder="${esc(searchPh)}" value="${esc(q)}" aria-label="Pesquisar"></label><div class="dp-list">${listHTML()}</div></div>` : ''}`;
      if (open) { const inp = $('.dp-search input', el); inp.focus(); inp.setSelectionRange(q.length, q.length); }
    };
    el.classList.add('dp');
    el.addEventListener('click', (e) => {
      if (e.target.closest('.dp-btn')) { open = !open; q = ''; render(); return; }
      const o = e.target.closest('.dp-opt'); if (o) { value = items[+o.dataset.i]; open = false; render(); onChange(value); return; }
      if (e.target.closest('[data-other]')) { value = { label: q, custom: true }; open = false; render(); onChange(value); }
    });
    el.addEventListener('input', (e) => { if (e.target.matches('.dp-search input')) { q = e.target.value; $('.dp-list', el).innerHTML = listHTML(); } });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && open) { open = false; render(); }
      if (e.key === 'Enter' && e.target.matches('.dp-search input')) { e.preventDefault(); const first = $('.dp-opt', el); first && first.click(); }
    });
    const outside = (e) => { if (!el.isConnected) return document.removeEventListener('mousedown', outside); if (open && !el.contains(e.target)) { open = false; render(); } };
    document.addEventListener('mousedown', outside);
    render();
    return { setItems(list, opts = {}) { items = list; value = null; q = ''; disabled = !!opts.disabled; if (opts.placeholder) placeholder = opts.placeholder; render(); }, get: () => value };
  }
  const chipsHTML = (key, options, current) => `<div class="up-chips" data-chips="${key}">${options.map((o) => `<button type="button" class="chip ${current === o ? 'on' : ''}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;

  async function viewUpgrade() {
    document.title = 'Simular upgrade — Aladdin Tech';
    const D = window.DEVICES;
    const st = { brand: '', model: null, otherModel: '', storage: '', battery: '', state: '', extras: '', wantTab: 'loja', want: null, cep: '', city: S.customer && S.customer.city ? S.customer.city + (S.customer.uf ? '/' + S.customer.uf : '') : '' };
    app.innerHTML = `<div class="wrap">
      <div class="page-head"><div class="crumbs"><a href="/" data-link>Início</a> / Upgrade</div>
        <h1 class="page-title">Simule seu <span class="serif gold">upgrade</span></h1>
        <p class="muted" style="max-width:600px;font-weight:300;margin:10px 0 0">Escolha seu aparelho atual e o que você deseja. Um consultor responde pelo WhatsApp com a proposta — o valor do seu usado é abatido na compra.</p></div>
      <div class="up-grid">
        <form class="up-form" id="upForm" novalidate>
          <section class="up-step"><header><em>1</em><h3>Marca do seu aparelho</h3></header>
            <div class="up-brands" data-chips="brand">${[...D.brands, 'Outra marca'].map((b) => `<button type="button" class="up-brand" data-v="${b}"><b>${b}</b></button>`).join('')}</div></section>
          <section class="up-step"><header><em>2</em><h3>Modelo</h3></header>
            <div id="modelPick"></div><input class="input" id="otherModel" placeholder="Digite a marca e o modelo" hidden></section>
          <section class="up-step"><header><em>3</em><h3>Armazenamento</h3></header><div id="storageBox"><p class="muted up-hint">Escolha o modelo primeiro.</p></div></section>
          <section class="up-step"><header><em>4</em><h3>Saúde da bateria</h3></header>
            <p class="muted up-hint" id="battHint">No iPhone: Ajustes › Bateria › Saúde e Carregamento.</p>${chipsHTML('battery', D.BATTERY, '')}</section>
          <section class="up-step"><header><em>5</em><h3>Estado do aparelho</h3></header>${chipsHTML('state', D.STATE, '')}</section>
          <section class="up-step"><header><em>6</em><h3>Acompanha</h3></header>${chipsHTML('extras', D.EXTRAS, '')}</section>
          <section class="up-step"><header><em>7</em><h3>Qual aparelho você deseja?</h3></header>
            <div class="up-tabs" id="wantTabs">${[['loja', 'Disponíveis na loja'], ...D.brands.map((b) => [b, b])].map(([k, l]) => `<button type="button" data-tab="${k}" class="${k === 'loja' ? 'on' : ''}">${l}</button>`).join('')}</div>
            <div id="wantPick"></div></section>
          <section class="up-step"><header><em>8</em><h3>Seus dados</h3></header>
            <div class="row c2"><div class="field"><label>Seu nome *</label><input name="name" value="${esc(S.customer ? S.customer.name : '')}" autocomplete="name"></div>
              <div class="field"><label>CEP <small class="muted">(preenche sua cidade)</small></label><input name="cep" id="upCep" inputmode="numeric" maxlength="9" placeholder="00000-000" autocomplete="postal-code"><span class="up-cep-city" id="upCity">${esc(S.customer && S.customer.city ? S.customer.city + (S.customer.uf ? '/' + S.customer.uf : '') : '')}</span></div></div></section>
          <p class="form-msg err" id="upMsg"></p>
          <button class="btn btn-gold btn-block" type="submit">${UI.wa} Receber minha proposta no WhatsApp</button>
          <p class="muted" style="font-size:12px;margin:0;text-align:center">A proposta final depende da conferência do aparelho na loja.</p>
        </form>
        <aside class="up-summary" id="upSummary"></aside>
      </div></div>`;

    const modelPick = devicePicker($('#modelPick'), { placeholder: 'Escolha a marca primeiro', disabled: true, onChange: (v) => { st.model = v; st.storage = ''; drawStorage(); drawSummary(); } });
    const wantPick = devicePicker($('#wantPick'), { placeholder: 'Carregando produtos…', searchPh: 'Pesquisar aparelho…', onChange: (v) => { st.want = v; drawSummary(); } });
    const brandItems = (b) => D.all.filter((d) => d.brand === b).map((d) => ({ label: d.model, group: d.line, storage: d.storage }));
    let storeItems = [];
    api('/api/products').then((list) => {
      storeItems = list.filter((p) => p.stock > 0).map((p) => ({ label: p.name, group: p.category_name || 'Loja', sub: brl(p.price) }));
      if (st.wantTab === 'loja') wantPick.setItems(storeItems, { placeholder: 'Escolha entre os aparelhos da loja' });
    }).catch(() => {});

    const drawStorage = () => {
      const opts = st.model && st.model.storage ? st.model.storage : (st.brand === 'Outra marca' || (st.model && st.model.custom)) ? D.androidStorage : null;
      $('#storageBox').innerHTML = opts ? chipsHTML('storage', opts, st.storage) : '<p class="muted up-hint">Escolha o modelo primeiro.</p>';
    };
    const drawSummary = () => {
      const model = st.brand === 'Outra marca' ? st.otherModel : st.model && st.model.label;
      const rows = [['Aparelho', model], ['Armazenamento', st.storage], ['Bateria', st.battery], ['Estado', st.state], ['Acompanha', st.extras], ['Deseja', st.want && st.want.label]];
      const done = rows.filter((r) => r[1]).length;
      $('#upSummary').innerHTML = `<div class="up-sum-card">
        <span class="eyebrow">Seu upgrade</span>
        <div class="up-swap"><div><small>Você entrega</small><b>${esc(model || '—')}</b></div><i>${UI.swap}</i><div><small>Você leva</small><b>${esc((st.want && st.want.label) || '—')}</b></div></div>
        <ul>${rows.map(([k, v]) => `<li class="${v ? 'ok' : ''}"><span>${k}</span><b>${esc(v || 'pendente')}</b></li>`).join('')}</ul>
        <div class="up-progress"><i style="width:${(done / rows.length) * 100}%"></i></div>
        <p class="muted" style="font-size:12px;margin:0">${done}/${rows.length} informações preenchidas</p></div>`;
    };
    drawSummary();

    const form = $('#upForm');
    form.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-chips] [data-v]'); if (!chip) {
        const tab = e.target.closest('#wantTabs [data-tab]');
        if (tab) {
          st.wantTab = tab.dataset.tab; st.want = null;
          $$('#wantTabs button').forEach((b) => b.classList.toggle('on', b === tab));
          wantPick.setItems(st.wantTab === 'loja' ? storeItems : brandItems(st.wantTab), { placeholder: st.wantTab === 'loja' ? 'Escolha entre os aparelhos da loja' : `Escolha o ${st.wantTab} desejado` });
          drawSummary();
        }
        return;
      }
      const group = chip.closest('[data-chips]'), key = group.dataset.chips;
      $$('[data-v]', group).forEach((b) => b.classList.toggle('on', b === chip));
      st[key] = chip.dataset.v;
      if (key === 'brand') {
        st.model = null; st.storage = '';
        const other = st.brand === 'Outra marca';
        $('#modelPick').hidden = other; $('#otherModel').hidden = !other;
        if (other) $('#otherModel').focus();
        else modelPick.setItems(brandItems(st.brand), { placeholder: `Pesquise seu ${st.brand}` });
        $('#battHint').textContent = st.brand === 'Apple' ? 'No iPhone: Ajustes › Bateria › Saúde e Carregamento.' : 'Se o aparelho não mostra a saúde da bateria, escolha “Não sei informar”.';
        drawStorage();
      }
      drawSummary();
    });
    $('#upCep').addEventListener('input', async (e) => {
      const v = digits(e.target.value).slice(0, 8);
      e.target.value = v.length > 5 ? v.slice(0, 5) + '-' + v.slice(5) : v;
      const out = $('#upCity');
      if (v.length < 8) { st.cep = ''; return; }
      out.textContent = 'Buscando…';
      try {
        const r = await (await fetch('https://viacep.com.br/ws/' + v + '/json/')).json();
        if (r.erro) { out.textContent = 'CEP não encontrado'; return; }
        st.cep = e.target.value; st.city = r.localidade + '/' + r.uf;
        out.textContent = (r.bairro ? r.bairro + ' · ' : '') + st.city;
      } catch { out.textContent = 'Não foi possível consultar o CEP'; }
    });
    $('#otherModel').addEventListener('input', (e) => { st.otherModel = e.target.value.trim(); drawStorage(); drawSummary(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form), msg = $('#upMsg');
      const model = st.brand === 'Outra marca' ? st.otherModel : st.model && st.model.label;
      const miss = !st.brand ? 'a marca' : !model ? 'o modelo' : !st.storage ? 'o armazenamento' : !st.battery ? 'a saúde da bateria' : !st.state ? 'o estado do aparelho' : !String(fd.get('name') || '').trim() ? 'seu nome' : '';
      if (miss) { msg.textContent = `Falta informar ${miss}.`; return; }
      msg.textContent = '';
      const text = `Olá! Quero fazer um *upgrade* na Aladdin Tech.\n\n*Meu aparelho:* ${model}${st.brand !== 'Outra marca' ? ' (' + st.brand + ')' : ''}\nArmazenamento: ${st.storage}\nBateria: ${st.battery}\nEstado: ${st.state}${st.extras ? '\nAcompanha: ' + st.extras : ''}\n\n*Desejo:* ${st.want ? st.want.label : 'ainda decidindo'}\n\nNome: ${fd.get('name')}${st.city ? '\nCidade: ' + st.city : ''}${st.cep ? ' (CEP ' + st.cep + ')' : ''}`;
      window.open(waLink(text), '_blank', 'noopener');
    });
  }

  /* ---------- roteador ---------- */
  const routes = [
    [/^\/$/, viewHome], [/^\/loja\/?$/, viewShop], [/^\/categoria\/([^/]+)\/?$/, viewShop],
    [/^\/produto\/([^/]+)\/?$/, viewProduct], [/^\/checkout\/?$/, viewCheckout], [/^\/pedido\/([^/]+)\/?$/, viewOrder],
    [/^\/como-chegar\/?$/, viewVisit], [/^\/avaliacoes\/?$/, viewReviews], [/^\/upgrade\/?$/, viewUpgrade], [/^\/ofertas\/?$/, viewOffers], [/^\/mais-vendidos\/?$/, viewBestSellers], [/^\/minha-conta\/?$/, viewAccount],
    [/^\/verificar-email\/?$/, viewVerifyEmail], [/^\/redefinir-senha\/?$/, viewResetPassword], [/^\/descadastrar\/?$/, viewUnsubscribe],
    [/^\/lista-de-desejos\/?$/, viewWishlist], [/^\/perguntas-frequentes\/?$/, viewFaq], [/^\/privacidade\/?$/, viewPrivacy], [/^\/garantia\/?$/, viewWarranty], [/^\/comparar\/?$/, viewCompare], [/^\/troca-garantida\/?$/, viewTradeIn], [/^\/guias\/?$/, viewGuides], [/^\/nossa-historia\/?$/, viewAbout], [/^\/assistencia\/?$/, viewService], [/^\/assistencia\/([\w-]+)\/?$/, viewService], [/^\/guias\/([^/]+)\/?$/, viewGuide], [/^\/cookies\/?$/, viewCookies],
    [/^\/alerta-cancelar\/?$/, viewAlertCancel], [/^\/carrinho\/recuperar\/?$/, viewCartRecover], [/^\/carrinho\/parar\/?$/, viewCartStop]
  ];
  function navigate(url, keepScroll) {
    if (url !== location.pathname + location.search) history.pushState({}, '', url);
    render(keepScroll);
  }
  async function render(keepScroll) {
    openCart(false); openSearch(false); $('#mobileNav').classList.remove('open'); $('#menuBtn').innerHTML = UI.menu;
    app.onclick = null; app.onchange = null;
    if (stopHeroFx) { stopHeroFx(); stopHeroFx = null; }
    if (location.pathname !== '/checkout') S.currentProduct = location.pathname.startsWith('/produto/') ? S.currentProduct : null;
    const path = location.pathname;
    const r = routes.find(([re]) => re.test(path));
    const view = r ? r[1] : viewHome;
    $$('#nav a').forEach((a) => a.classList.toggle('active', path !== '/' && path.startsWith(a.getAttribute('href'))));
    if (!keepScroll) window.scrollTo({ top: 0, behavior: 'instant' });
    try { await view(r ? path.match(r[0]) : null); }
    catch (e) { app.innerHTML = `<div class="wrap success"><h1>Ops, algo deu errado</h1><p class="muted">${esc(e.message)}</p><a href="/" data-link class="btn btn-line">Voltar</a></div>`; }
    if (location.hash) { const t = document.getElementById(location.hash.slice(1)); t && t.scrollIntoView(); }
    observeReveal();
    if (render.n++) track('page');
  }
  render.n = 0;

  let io;
  function observeReveal() {
    if (!('IntersectionObserver' in window)) { $$('.reveal').forEach((el) => el.classList.add('in')); return; }
    io = io || new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -40px 0px' });
    $$('.reveal:not(.in)').forEach((el) => io.observe(el));
  }

  /* ---------- eventos globais ---------- */
  document.addEventListener('click', (e) => {
    const wb = e.target.closest('[data-wish]'); if (wb) { e.preventDefault(); e.stopPropagation(); toggleWish(wb.dataset.wish); return; }
    const a = e.target.closest('a[data-link]');
    if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey && a.target !== '_blank') {
      e.preventDefault(); navigate(a.getAttribute('href')); return;
    }
    if (e.target.closest('[data-concierge]')) { e.preventDefault(); openConcierge(true); return; }
    const qa = e.target.closest('[data-add]'); if (qa) { e.preventDefault(); quickAdd(qa); return; }
    const wl = e.target.closest('[data-wall]'); if (wl) { lightbox(S.settings.wall_photos, +wl.dataset.wall); return; }
    if (e.target.closest('#concierge')) conciergeClick(e);
  });
  window.addEventListener('popstate', () => render());
  $('#cartBtn').addEventListener('click', () => openCart(true));
  $('#cartClose').addEventListener('click', () => openCart(false));
  $('#scrim').addEventListener('click', () => openCart(false));
  $('#cartBody').addEventListener('click', cartAction);
  $('#searchBtn').addEventListener('click', () => openSearch(true));
  $('#acctBtn').addEventListener('click', () => S.customer ? navigate('/minha-conta') : authSheet('login'));
  $('#searchClose').addEventListener('click', () => openSearch(false));
  $('#searchInput').addEventListener('input', (e) => doSearch(e.target.value));
  $('#searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.value.trim()) navigate('/loja?q=' + encodeURIComponent(e.target.value.trim())); });
  $('#menuBtn').addEventListener('click', () => {
    const open = $('#mobileNav').classList.toggle('open');
    $('#menuBtn').innerHTML = open ? UI.close : UI.menu;
  });
  $('#conciergeBtn').addEventListener('click', () => openConcierge());
  document.addEventListener('click', (e) => { const i = e.target.closest('[data-install-open]'); if (i) { e.preventDefault(); installSheet(); } });
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  document.addEventListener('click', (e) => { const a = e.target.closest('[data-ref-wa]'); if (a) setRef(a.dataset.refWa, 'whatsapp'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { openCart(false); openSearch(false); openConcierge(false); } });
  window.addEventListener('scroll', () => $('#header').classList.toggle('scrolled', scrollY > 10), { passive: true });

  /* ---------- início ---------- */
  (async function boot() {
    const BOOT_KEY = 'at_boot_v1', cached = load(BOOT_KEY, null);
    const fresh = Promise.all([api('/api/settings'), api('/api/categories')]);
    const meP = api('/api/account/me').catch(() => ({ customer: null }));
    try {
      if (cached && cached.s && Array.isArray(cached.c) && Date.now() - cached.t < 7 * 864e5) {
        S.settings = cached.s; S.cats = cached.c; S.customer = (await meP).customer;
        fresh.then(([st, ct]) => {
          save(BOOT_KEY, { t: Date.now(), s: st, c: ct });
          const changed = JSON.stringify([st, ct]) !== JSON.stringify([cached.s, cached.c]);
          S.settings = st; S.cats = ct; if (changed) renderChrome();
        }).catch(() => {});
      } else {
        [S.settings, S.cats] = await fresh; S.customer = (await meP).customer;
        save(BOOT_KEY, { t: Date.now(), s: S.settings, c: S.cats });
      }
    }
    catch { app.innerHTML = '<div class="wrap success"><h1>Loja temporariamente indisponível</h1><p class="muted">Tente novamente em instantes.</p></div>'; return; }
    renderChrome();
    render();
    syncWish();
    startTracking();
    setTimeout(cookieBanner, 900);
  })();
})();
