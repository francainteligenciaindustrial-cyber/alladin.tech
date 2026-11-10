/* Aladdin Tech — integrações externas
 *  1) Frete em tempo real (Melhor Envio: Correios PAC/SEDEX, Jadlog, Loggi…)
 *  2) Nota fiscal eletrônica (Focus NFe — NF-e modelo 55)
 *  3) Carrinho abandonado (lembretes por e-mail)
 * Os endereços das APIs podem ser trocados por variáveis de ambiente (ME_URL, FOCUS_URL) — usado nos testes.
 */
const crypto = require('crypto');

function createIntegrations(ctx) {
  const { db, getSettings, J, str, round2, mailer, secret } = ctx;
  const digits = (s) => String(s || '').replace(/\D/g, '');

  /* =====================================================================
     1) FRETE — Melhor Envio
     ===================================================================== */
  // medidas padrão por categoria (cm/kg), usadas quando o produto não tem medidas próprias
  const DIM = {
    iphone: [10, 18, 6, 0.6], ipad: [22, 30, 6, 1.2], macbook: [27, 37, 8, 2.4], watch: [12, 14, 10, 0.5],
    airpods: [12, 12, 6, 0.3], jbl: [20, 32, 20, 2.5], playstation: [45, 52, 18, 6.5], bike: [70, 160, 30, 25], acessorios: [12, 16, 5, 0.3]
  };
  const meBase = () => process.env.ME_URL || (getSettings().me_sandbox ? 'https://sandbox.melhorenvio.com.br' : 'https://www.melhorenvio.com.br');
  const shippingLive = () => { const s = getSettings(); return s.shipping_provider === 'melhorenvio' && !!secret('me_token') && digits(s.cep).length === 8; };
  const quoteCache = new Map(); // chave → { at, list }
  function packages(items) {
    return items.map((it) => {
      const p = db.prepare('SELECT p.*, c.icon FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?').get(it.id);
      if (!p) return null;
      const d = DIM[p.icon] || DIM.acessorios;
      const effective = it.price != null ? it.price : p.price;
      return { id: String(p.id), width: p.width_cm || d[0], length: p.length_cm || d[1], height: p.height_cm || d[2], weight: p.weight_kg || d[3],
        insurance_value: round2(effective), quantity: Math.max(1, parseInt(it.qty) || 1) };
    }).filter(Boolean);
  }
  async function quote(cep, items) {
    const s = getSettings();
    const to = digits(cep);
    if (to.length !== 8 || !items.length) return [];
    const pk = packages(items);
    const key = to + '|' + pk.map((p) => `${p.id}x${p.quantity}@${p.insurance_value}`).join(',');
    const hit = quoteCache.get(key);
    if (hit && Date.now() - hit.at < 15 * 60000) return hit.list;
    const ua = `${String(s.store_name || 'Aladdin Tech').replace(/[^\w\s-]/g, '')} (${s.email || 'contato@loja.com.br'})`;
    const r = await fetch(meBase() + '/api/v2/me/shipment/calculate', {
      method: 'POST', signal: AbortSignal.timeout(9000),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret('me_token'), 'User-Agent': ua },
      body: JSON.stringify({ from: { postal_code: digits(s.cep) }, to: { postal_code: to }, products: pk, options: { receipt: false, own_hand: false } })
    });
    if (!r.ok) throw new Error('Melhor Envio respondeu ' + r.status);
    const data = await r.json();
    const allowed = String(s.shipping_services || '').split(',').map((x) => x.trim()).filter(Boolean);
    const extraDays = Math.max(0, parseInt(s.handling_days) || 0);
    const markup = Number(s.shipping_markup) || 0;
    const list = (Array.isArray(data) ? data : []).filter((o) => !o.error && o.price && (!allowed.length || allowed.includes(String(o.id))))
      .map((o) => {
        const days = (parseInt(o.custom_delivery_time ?? o.delivery_time) || 0) + extraDays;
        const company = (o.company && o.company.name) || '';
        return { key: 'me:' + o.id, name: `${company ? company + ' — ' : ''}${o.name}`, fee: round2(Number(o.custom_price || o.price) + markup),
          eta: days ? `${days} dia${days > 1 ? 's' : ''} úte${days > 1 ? 'is' : 'il'}` : '', carrier: company, service_id: o.id, live: true };
      }).sort((a, b) => a.fee - b.fee);
    quoteCache.set(key, { at: Date.now(), list });
    if (quoteCache.size > 500) quoteCache.delete(quoteCache.keys().next().value);
    return list;
  }

  /* =====================================================================
     2) NOTA FISCAL — Focus NFe
     ===================================================================== */
  const nfeEnabled = () => { const s = getSettings(); return !!(s.nfe_enabled && secret('focus_token')); };
  const focusBase = () => process.env.FOCUS_URL || (getSettings().nfe_env === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br');
  const focusAuth = () => 'Basic ' + Buffer.from(secret('focus_token') + ':').toString('base64');
  async function focus(method, path, body) {
    const r = await fetch(focusBase() + path, { method, signal: AbortSignal.timeout(20000),
      headers: { Authorization: focusAuth(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    return { status: r.status, data: d };
  }
  function cpfValid(v) {
    const c = digits(v);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    for (const n of [9, 10]) {
      let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i);
      if (((s * 10) % 11) % 10 !== +c[n]) return false;
    }
    return true;
  }
  function nfePayload(o) {
    const s = getSettings();
    const cust = J(o.customer, {}), d = J(o.delivery, {}), items = J(o.items, []);
    const a = d.address && typeof d.address === 'object' ? d.address
      : { street: str(s.address, 120), number: 'S/N', district: 'Centro', city: String(s.city || '').split(/[—-]/)[0].trim(), uf: s.store_uf || '', cep: s.cep };
    const sameUF = !s.store_uf || String(a.uf || '').toUpperCase() === String(s.store_uf).toUpperCase();
    const cfop = sameUF ? (s.nfe_cfop_in || '5102') : (s.nfe_cfop_out || '6108');
    // desconto (cupom + Pix) rateado entre os itens, proporcional ao valor
    const totalDisc = round2((o.discount || 0) + (o.pix_discount || 0));
    const gross = items.reduce((t, i) => t + i.price * i.qty, 0) || 1;
    let given = 0;
    const nfItems = items.map((i, idx) => {
      const p = db.prepare('SELECT ncm, sku FROM products WHERE id=?').get(i.id) || {};
      const bruto = round2(i.price * i.qty);
      const desc = idx === items.length - 1 ? round2(totalDisc - given) : round2(totalDisc * (bruto / gross));
      given = round2(given + desc);
      const it = {
        numero_item: idx + 1, codigo_produto: p.sku || String(i.id), descricao: str(i.name + (i.options && Object.keys(i.options).length ? ' ' + Object.values(i.options).join(' ') : ''), 120),
        codigo_ncm: digits(p.ncm || s.nfe_ncm_default || '85171300').padEnd(8, '0').slice(0, 8), cfop,
        unidade_comercial: 'UN', quantidade_comercial: i.qty, valor_unitario_comercial: round2(i.price),
        unidade_tributavel: 'UN', quantidade_tributavel: i.qty, valor_unitario_tributavel: round2(i.price), valor_bruto: bruto,
        icms_origem: String(s.nfe_icms_origem || '0'), icms_situacao_tributaria: String(s.nfe_csosn || '102'),
        pis_situacao_tributaria: String(s.nfe_pis_cst || '07'), cofins_situacao_tributaria: String(s.nfe_cofins_cst || '07')
      };
      if (desc > 0) it.valor_desconto = desc;
      return it;
    });
    if (o.shipping > 0) {
      // frete rateado no último item (exigência: soma dos itens + frete = total)
      nfItems[nfItems.length - 1].valor_frete = round2(o.shipping);
    }
    return {
      natureza_operacao: s.nfe_natureza || 'Venda de mercadoria', data_emissao: new Date().toISOString(),
      tipo_documento: 1, finalidade_emissao: 1, consumidor_final: 1, presenca_comprador: 2, // 2 = operação pela internet
      local_destino: sameUF ? 1 : 2, cnpj_emitente: digits(s.cnpj),
      nome_destinatario: str(cust.name, 60), cpf_destinatario: digits(cust.cpf), indicador_inscricao_estadual_destinatario: 9,
      email_destinatario: cust.email || undefined, telefone_destinatario: digits(cust.phone) || undefined,
      logradouro_destinatario: str(a.street, 60), numero_destinatario: str(a.number || 'S/N', 60), complemento_destinatario: a.complement ? str(a.complement, 60) : undefined,
      bairro_destinatario: str(a.district || 'Centro', 60), municipio_destinatario: str(a.city, 60), uf_destinatario: String(a.uf || '').toUpperCase(), cep_destinatario: digits(a.cep),
      pais_destinatario: 'Brasil', modalidade_frete: o.delivery_method === 'pickup' ? 9 : 0,
      informacoes_adicionais_contribuinte: `Pedido ${o.code} — ${s.store_name || 'Aladdin Tech'}`,
      items: nfItems
    };
  }
  async function emitNfe(order, base) {
    const s = getSettings();
    const o = typeof order === 'object' ? order : db.prepare('SELECT * FROM orders WHERE id=?').get(order);
    if (!o) throw new Error('Pedido não encontrado.');
    if (['autorizado', 'processando'].includes(o.nfe_status)) throw new Error('A nota deste pedido já foi emitida ou está em processamento.');
    if (o.status === 'cancelado') throw new Error('Pedido cancelado não pode receber nota.');
    if (!digits(s.cnpj)) throw new Error('Informe o CNPJ da loja em Configurações → Dados legais.');
    const cust = J(o.customer, {});
    if (!cpfValid(cust.cpf)) throw new Error('O pedido não tem um CPF válido do cliente (obrigatório na NF-e).');
    const ref = 'AT' + o.id + '-' + crypto.randomBytes(3).toString('hex');
    db.prepare("UPDATE orders SET nfe_status='processando', nfe_ref=?, nfe_error='' WHERE id=?").run(ref, o.id);
    const r = await focus('POST', '/v2/nfe?ref=' + encodeURIComponent(ref), nfePayload(o));
    if (r.status >= 400) {
      const msg = r.data.mensagem || (r.data.erros && r.data.erros.map((e) => e.mensagem).join('; ')) || 'Erro ' + r.status;
      db.prepare("UPDATE orders SET nfe_status='erro', nfe_error=? WHERE id=?").run(str(msg, 500), o.id);
      throw new Error('Focus NFe: ' + msg);
    }
    return refreshNfe(o.id, base);
  }
  async function refreshNfe(id, base) {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    if (!o || !o.nfe_ref) return o;
    const r = await focus('GET', '/v2/nfe/' + encodeURIComponent(o.nfe_ref));
    const d = r.data || {};
    const fb = focusBase();
    if (d.status === 'autorizado') {
      const first = o.nfe_status !== 'autorizado';
      db.prepare("UPDATE orders SET nfe_status='autorizado', nfe_key=?, nfe_number=?, nfe_danfe=?, nfe_xml=?, nfe_error='' WHERE id=?")
        .run(d.chave_nfe || '', String(d.numero || ''), d.caminho_danfe ? fb + d.caminho_danfe : '', d.caminho_xml_nota_fiscal ? fb + d.caminho_xml_nota_fiscal : '', id);
      if (first) sendNfeEmail(id, base).catch(() => {});
    } else if (d.status === 'erro_autorizacao' || d.status === 'denegado') {
      db.prepare("UPDATE orders SET nfe_status='erro', nfe_error=? WHERE id=?").run(str(d.mensagem_sefaz || d.status, 500), id);
    } else if (d.status === 'cancelado') {
      db.prepare("UPDATE orders SET nfe_status='cancelada' WHERE id=?").run(id);
    }
    return db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  }
  async function cancelNfe(id, justificativa) {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    if (!o || o.nfe_status !== 'autorizado') throw new Error('Só é possível cancelar uma nota autorizada.');
    const j = str(justificativa, 255);
    if (j.length < 15) throw new Error('A justificativa precisa ter pelo menos 15 caracteres.');
    const r = await focus('DELETE', '/v2/nfe/' + encodeURIComponent(o.nfe_ref), { justificativa: j });
    if (r.status >= 400 || (r.data.status && r.data.status !== 'cancelado')) throw new Error('Focus NFe: ' + (r.data.mensagem_sefaz || r.data.mensagem || 'não foi possível cancelar'));
    db.prepare("UPDATE orders SET nfe_status='cancelada' WHERE id=?").run(id);
    return true;
  }
  async function sendNfeEmail(id, base) {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    const cust = J(o.customer, {});
    if (!cust.email || !o.nfe_danfe) return;
    await mailer.send(cust.email, `Nota fiscal do pedido ${o.code}`, mailer.layout({
      preheader: 'Sua nota fiscal eletrônica foi emitida.', title: 'Sua nota fiscal está <span style="color:#d6b26e">pronta</span>',
      intro: `Olá, ${mailer.esc(String(cust.name || '').split(' ')[0])}! A NF-e nº ${mailer.esc(o.nfe_number)} do pedido <b style="color:#fff">${mailer.esc(o.code)}</b> foi autorizada pela Sefaz.`,
      body: `<p style="margin:0;font-size:12.5px;color:#8a8a92;word-break:break-all">Chave de acesso: ${mailer.esc(o.nfe_key)}</p>`,
      button: { label: 'Baixar nota fiscal (DANFE)', url: o.nfe_danfe },
      note: base ? `Você também encontra a nota em <a href="${base}/pedido/${o.code}" style="color:#d6b26e">acompanhar pedido</a>.` : ''
    }), 'nota-fiscal');
  }
  // notas em processamento: consulta a cada 2 minutos
  let nfeBusy = false;
  require('./jobs').every('notas-fiscais', 2 * 60000, async () => {
    if (nfeBusy || !nfeEnabled()) return; nfeBusy = true;
    try { for (const o of db.prepare("SELECT id FROM orders WHERE nfe_status='processando'").all()) await refreshNfe(o.id, process.env.PUBLIC_URL).catch(() => {}); }
    finally { nfeBusy = false; }
  });

  /* =====================================================================
     3) CARRINHO ABANDONADO
     ===================================================================== */
  function cartItems(items) {
    return (Array.isArray(items) ? items : []).slice(0, 50).map((i) => ({ id: parseInt(i.id), qty: Math.min(99, Math.max(1, parseInt(i.qty) || 1)),
      options: i.options && typeof i.options === 'object' ? Object.fromEntries(Object.entries(i.options).slice(0, 6).map(([k, v]) => [str(k, 40), str(v, 40)])) : {} }))
      .filter((i) => i.id && db.prepare('SELECT id FROM products WHERE id=?').get(i.id));
  }
  function syncCart({ token, items, customer, email, name, phone, consent }) {
    const list = cartItems(items);
    let cart = token && db.prepare('SELECT * FROM carts WHERE token=?').get(str(token, 64));
    if (cart && cart.status === 'convertido') cart = null;
    if (!list.length) {
      if (cart) db.prepare("UPDATE carts SET items='[]', subtotal=0, updated_at=datetime('now','localtime') WHERE id=?").run(cart.id);
      return { token: cart ? cart.token : '' };
    }
    const subtotal = round2(list.reduce((t, i) => { const p = db.prepare('SELECT price, promo_price, promo_start, promo_end FROM products WHERE id=?').get(i.id); return t + (ctx.effectivePrice(p) * i.qty); }, 0));
    const em = customer ? customer.email : (ctx.EMAIL_RE.test(String(email || '')) ? String(email).toLowerCase().slice(0, 120) : (cart ? cart.email : ''));
    const cons = customer ? 1 : (consent === undefined ? (cart ? cart.consent : 0) : (consent ? 1 : 0));
    const nm = customer ? customer.name : str(name, 80) || (cart ? cart.name : '');
    const ph = customer ? (customer.phone || str(phone, 20)) : str(phone, 20) || (cart ? cart.phone : '');
    if (cart) {
      const changed = cart.items !== JSON.stringify(list);
      db.prepare(`UPDATE carts SET items=?, subtotal=?, customer_id=?, email=?, name=?, phone=?, consent=?, status='aberto',
        reminders=CASE WHEN ? THEN 0 ELSE reminders END, updated_at=datetime('now','localtime') WHERE id=?`)
        .run(JSON.stringify(list), subtotal, customer ? customer.id : cart.customer_id, em, nm, ph, cons, changed ? 1 : 0, cart.id);
      return { token: cart.token };
    }
    const t = crypto.randomBytes(18).toString('hex');
    db.prepare('INSERT INTO carts(token,customer_id,email,name,phone,consent,items,subtotal) VALUES(?,?,?,?,?,?,?,?)')
      .run(t, customer ? customer.id : null, em, nm, ph, cons, JSON.stringify(list), subtotal);
    return { token: t };
  }
  function convertCart(token, customer, code) {
    if (token) db.prepare("UPDATE carts SET status='convertido', order_code=?, updated_at=datetime('now','localtime') WHERE token=?").run(code, str(token, 64));
    if (customer) db.prepare("UPDATE carts SET status='convertido', order_code=? WHERE customer_id=? AND status IN ('aberto','lembrado')").run(code, customer.id);
  }
  function cartForRestore(token) {
    const c = db.prepare('SELECT * FROM carts WHERE token=?').get(str(token, 64));
    if (!c) return null;
    if (c.status !== 'convertido') db.prepare("UPDATE carts SET recovered_clicks=recovered_clicks+1 WHERE id=?").run(c.id);
    const items = J(c.items, []).map((i) => {
      const p = db.prepare('SELECT p.*, c.icon AS category_icon FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=? AND p.active=1').get(i.id);
      return p && { id: p.id, slug: p.slug, name: p.name, price: ctx.effectivePrice(p), image: J(p.images, [])[0] || '', icon: p.category_icon, options: i.options, qty: Math.min(i.qty, Math.max(1, p.stock)), stock: p.stock };
    }).filter((i) => i && i.stock > 0);
    return { items, status: c.status, coupon: getSettings().cart_coupon || '' };
  }
  async function sendCartReminder(cart, base, nth) {
    const s = getSettings();
    const items = cartForRestore(cart.token).items;
    if (!items.length) return false;
    const url = `${base}/carrinho/recuperar?t=${cart.token}`;
    const coupon = nth >= 2 && s.cart_coupon ? db.prepare('SELECT * FROM coupons WHERE UPPER(code)=UPPER(?) AND active=1').get(s.cart_coupon) : null;
    const first = String(cart.name || '').split(' ')[0];
    await mailer.send(cart.email, nth >= 2 ? (coupon ? `Um presente para você finalizar seu upgrade` : 'Seus itens ainda estão esperando') : 'Você esqueceu algo na sacola ✦', mailer.layout({
      preheader: 'Separamos seus itens — finalize em um clique.',
      title: nth >= 2 ? 'Ainda pensando no seu <span style="color:#d6b26e">upgrade?</span>' : 'Sua sacola está <span style="color:#d6b26e">esperando</span>',
      intro: `${first ? `Olá, ${mailer.esc(first)}! ` : ''}Guardamos os itens que você escolheu. O estoque é limitado — finalize quando quiser, em um clique.`,
      body: mailer.itemsTable(items) + (coupon ? `<p style="margin:18px 0 0;padding:14px;border:1px dashed #6b5a35;border-radius:12px;font-size:14px;color:#f3dca4">Use o cupom <b>${mailer.esc(coupon.code)}</b>${coupon.description ? ' — ' + mailer.esc(coupon.description) : ''}</p>` : ''),
      button: { label: 'Finalizar minha compra', url },
      note: `Dúvidas? Responda este e-mail ou fale com a gente no WhatsApp. <a href="${base}/carrinho/parar?t=${cart.token}" style="color:#8a8a92">Não quero receber lembretes do carrinho</a>.`
    }), 'carrinho');
    db.prepare("UPDATE carts SET reminders=?, last_reminder_at=datetime('now','localtime'), status='lembrado' WHERE id=?").run(nth, cart.id);
    return true;
  }
  let cartBusy = false;
  async function cartJob(base) {
    const s = getSettings();
    if (cartBusy || s.cart_recovery === false) return; cartBusy = true;
    try {
      const h1 = Math.max(0.25, Number(s.cart_delay_hours) || 1), h2 = Math.max(h1 + 1, Number(s.cart_second_hours) || 24);
      const due = db.prepare(`SELECT * FROM carts WHERE status IN ('aberto','lembrado') AND consent=1 AND email<>'' AND items<>'[]'
        AND ((reminders=0 AND updated_at <= datetime('now','localtime', ?)) OR (reminders=1 AND updated_at <= datetime('now','localtime', ?)))
        AND updated_at >= datetime('now','localtime','-7 days') LIMIT 50`).all(`-${Math.round(h1 * 60)} minutes`, `-${Math.round(h2 * 60)} minutes`);
      for (const c of due) {
        // comprou depois de abandonar? não lembra
        if (db.prepare("SELECT id FROM orders WHERE (customer_id=? OR json_extract(customer,'$.email')=?) AND created_at >= ? LIMIT 1").get(c.customer_id || -1, c.email, c.updated_at)) {
          db.prepare("UPDATE carts SET status='convertido' WHERE id=?").run(c.id); continue;
        }
        await sendCartReminder(c, base || process.env.PUBLIC_URL || '', c.reminders + 1).catch(() => {});
      }
    } finally { cartBusy = false; }
  }

  return { quote, shippingLive, packages, nfeEnabled, emitNfe, refreshNfe, cancelNfe, cpfValid, nfePayload,
    syncCart, convertCart, cartForRestore, sendCartReminder, cartJob };
}

module.exports = { createIntegrations };
