// Vender mais: avisos do pedido pelo WhatsApp, indique e ganhe, reservar para retirar
'use strict';
const crypto = require('crypto');

module.exports = function createExtras({ db, getSettings, J, str, round2, mailer, secret, EMAIL_RE }) {
  db.exec(`CREATE TABLE IF NOT EXISTS wa_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_code TEXT, phone TEXT, kind TEXT, provider TEXT, status TEXT, error TEXT DEFAULT '', body TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')) );`);
  const brl = (n) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const intl = (p) => { p = digits(p); return p.length === 10 || p.length === 11 ? '55' + p : p; };

  /* ================= WhatsApp ================= */
  const STATUS_WA = {
    novo: (o, n) => `Olá, ${n}! Recebemos seu pedido *${o.code}* na ${o.store} 🎉\nTotal: ${brl(o.total)}.${o.reserve ? `\nSua reserva fica separada até *${o.reserve}* — é só vir retirar e pagar na loja.` : ''}\nAcompanhe: ${o.link}`,
    confirmado: (o, n) => `${n}, seu pedido *${o.code}* foi confirmado ✅\nJá estamos separando tudo para você.\nAcompanhe: ${o.link}`,
    separando: (o, n) => `${n}, seu pedido *${o.code}* está sendo separado e conferido pela nossa equipe 📦`,
    enviado: (o, n) => `${n}, seu pedido *${o.code}* saiu para entrega 🚚${o.tracking ? `\nRastreio: ${o.tracking} — https://rastreamento.correios.com.br/app/index.php?objetos=${o.tracking}` : ''}\nAcompanhe: ${o.link}`,
    pronto: (o, n) => `${n}, seu pedido *${o.code}* está pronto para retirada 🛍️\nEndereço: ${o.address}\nEstamos abertos ${o.hours}.`,
    entregue: (o, n) => `${n}, pedido *${o.code}* entregue! Obrigado pela confiança 💛\nConta pra gente como foi? Sua avaliação ajuda muito: ${o.review}`,
    cancelado: (o, n) => `${n}, o pedido *${o.code}* foi cancelado.${o.reserveExpired ? ' O prazo da reserva terminou.' : ''} Se precisar de algo, é só responder esta mensagem.`
  };
  function waText(order, status, base, extra = {}) {
    const s = getSettings(), c = J(order.customer, {}), first = (c.name || '').split(' ')[0] || 'cliente';
    const f = STATUS_WA[status]; if (!f) return '';
    return f({ code: order.code, total: order.total, store: s.store_name || 'Aladdin Tech', link: `${base}/pedido/${order.code}`, tracking: order.tracking,
      address: `${s.address || ''}${s.city ? ' · ' + s.city : ''}`, hours: s.always_open ? '24h, todos os dias' : 'no horário da loja', review: `${base}/minha-conta`,
      reserve: order.reserve_until ? fmtDT(order.reserve_until) : '', ...extra }, first);
  }
  const fmtDT = (s) => { const d = new Date(String(s).replace(' ', 'T')); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const waReady = () => { const s = getSettings(); return s.wa_provider === 'meta' ? !!(secret('wa_token') && s.wa_phone_id && s.wa_template) : s.wa_provider === 'zapi' ? !!(s.zapi_instance && secret('zapi_token')) : false; };
  async function waSend(phone, text, { kind = 'aviso', order_code = '', templateParams } = {}) {
    const s = getSettings(), to = intl(phone);
    if (to.length < 12) return { ok: false, error: 'telefone inválido' };
    const log = (status, error = '') => db.prepare('INSERT INTO wa_messages(order_code,phone,kind,provider,status,error,body) VALUES(?,?,?,?,?,?,?)').run(order_code, to, kind, s.wa_provider || '', status, String(error).slice(0, 300), text.slice(0, 1000));
    if (!waReady()) { log('manual', 'integração desligada'); return { ok: false, error: 'integração desligada' }; }
    try {
      let r;
      if (s.wa_provider === 'meta') {
        // fora da janela de 24h a Meta só aceita mensagem de modelo aprovado: {{1}} = texto do aviso
        const url = (process.env.WA_META_URL || 'https://graph.facebook.com/v21.0') + `/${encodeURIComponent(s.wa_phone_id)}/messages`;
        r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + secret('wa_token'), 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000),
          body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template: { name: s.wa_template, language: { code: s.wa_template_lang || 'pt_BR' },
            components: [{ type: 'body', parameters: (templateParams || [text.replace(/\n+/g, ' · ').slice(0, 1000)]).map((t) => ({ type: 'text', text: t })) }] } }) });
      } else {
        const url = (process.env.ZAPI_URL || 'https://api.z-api.io') + `/instances/${encodeURIComponent(s.zapi_instance)}/token/${encodeURIComponent(secret('zapi_token'))}/send-text`;
        r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(secret('zapi_client_token') ? { 'Client-Token': secret('zapi_client_token') } : {}) },
          signal: AbortSignal.timeout(12000), body: JSON.stringify({ phone: to, message: text }) });
      }
      const body = await r.json().catch(() => ({}));
      if (!r.ok || body.error) { const e = (body.error && (body.error.message || body.error)) || body.message || 'HTTP ' + r.status; log('erro', e); return { ok: false, error: String(e) }; }
      log('enviado'); return { ok: true };
    } catch (e) { log('erro', e.message); return { ok: false, error: e.message }; }
  }
  async function notifyOrder(code, status, base, extra) {
    const s = getSettings();
    if (!s.wa_notify || !waReady()) return { ok: false, skipped: true };
    const o = db.prepare('SELECT * FROM orders WHERE code=?').get(code);
    if (!o || o.channel === 'loja') return { ok: false, skipped: true };
    const phone = J(o.customer, {}).phone, text = waText(o, status, base, extra);
    if (!text || !phone) return { ok: false, skipped: true };
    return waSend(phone, text, { kind: 'pedido:' + status, order_code: o.code });
  }

  /* ================= Indique e ganhe ================= */
  const refCode = () => { let c; do { c = crypto.randomBytes(4).toString('base64url').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6); } while (c.length < 6 || db.prepare('SELECT id FROM customers WHERE ref_code=?').get(c)); return c; };
  function ensureRefCode(customerId) {
    const c = db.prepare('SELECT ref_code FROM customers WHERE id=?').get(customerId);
    if (c && c.ref_code) return c.ref_code;
    const code = refCode(); db.prepare('UPDATE customers SET ref_code=? WHERE id=?').run(code, customerId); return code;
  }
  function personalCoupon(customerId, prefix, type, value, minOrder, days, description) {
    let code; do { code = prefix + '-' + crypto.randomBytes(3).toString('hex').toUpperCase(); } while (db.prepare('SELECT id FROM coupons WHERE code=?').get(code));
    const exp = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
    db.prepare('INSERT INTO coupons(code,type,value,min_order,max_uses,expires_at,description,active,customer_id) VALUES(?,?,?,?,1,?,?,1,?)')
      .run(code, type, value, minOrder, exp, description, customerId);
    return { code, expires: exp };
  }
  // chamado no cadastro: liga o amigo a quem indicou e dá o cupom de boas-vindas
  async function attachReferral(customer, rawCode, base) {
    const s = getSettings(); if (!s.referral_enabled) return null;
    const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10); if (!code) return null;
    const ref = db.prepare('SELECT id,name,email FROM customers WHERE ref_code=?').get(code);
    if (!ref || ref.id === customer.id) return null;
    // mesmo telefone de quem indicou = autoindicação
    if (customer.phone && digits(customer.phone).length >= 10 && db.prepare('SELECT id FROM customers WHERE id=? AND phone<>\'\'').get(ref.id)
      && digits(db.prepare('SELECT phone FROM customers WHERE id=?').get(ref.id).phone).slice(-9) === digits(customer.phone).slice(-9)) return null;
    db.prepare('UPDATE customers SET referred_by=? WHERE id=? AND referred_by IS NULL').run(ref.id, customer.id);
    const pct = Number(s.referral_friend_pct) || 5;
    const cp = personalCoupon(customer.id, 'BEMVINDO', 'percent', pct, Number(s.referral_min_order) || 0, 60, `Boas-vindas: indicação de ${ref.name.split(' ')[0]}`);
    mailer.send(customer.email, `Seu presente de boas-vindas: ${pct}% OFF — ${s.store_name || 'Aladdin Tech'}`, mailer.layout({
      preheader: `${ref.name.split(' ')[0]} indicou você. Aqui está seu cupom.`, title: `${pct}% OFF na sua primeira compra`,
      intro: `Olá, ${mailer.esc(customer.name.split(' ')[0])}! <b>${mailer.esc(ref.name.split(' ')[0])}</b> indicou a ${mailer.esc(s.store_name || 'Aladdin Tech')} para você. Use o cupom abaixo na sua primeira compra.`,
      body: `<p style="text-align:center;margin:18px 0"><span style="display:inline-block;padding:14px 26px;border:1px dashed #d6b26e;border-radius:12px;font-size:22px;letter-spacing:.12em;color:#f3dca4"><b>${cp.code}</b></span></p>
        <p style="text-align:center;font-size:13px;color:#b9b9c0">Válido até ${cp.expires.split('-').reverse().join('/')}${Number(s.referral_min_order) ? ` · compras acima de ${mailer.brl(s.referral_min_order)}` : ''} · uso único, só na sua conta.</p>`,
      button: { label: 'Ver a loja', url: base + '/loja' }
    }), 'indicacao').catch(() => {});
    return cp;
  }
  // chamado quando um pedido passa a contar como pago: recompensa quem indicou (uma vez por amigo)
  async function referralPaid(orderId, base) {
    const s = getSettings(); if (!s.referral_enabled) return null;
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
    if (!o || !o.customer_id) return null;
    const f = db.prepare('SELECT * FROM customers WHERE id=?').get(o.customer_id);
    if (!f || !f.referred_by || f.referral_rewarded) return null;
    if (Number(s.referral_min_order) && o.subtotal < Number(s.referral_min_order)) return null;
    const ref = db.prepare('SELECT * FROM customers WHERE id=?').get(f.referred_by); if (!ref) return null;
    const upd = db.prepare('UPDATE customers SET referral_rewarded=1 WHERE id=? AND referral_rewarded=0').run(f.id);
    if (!upd.changes) return null;
    const val = Number(s.referral_reward_value) || 50;
    const cp = personalCoupon(ref.id, 'INDICOU', 'fixed', val, val * 2, 90, `Recompensa: ${f.name.split(' ')[0]} comprou pela sua indicação`);
    mailer.send(ref.email, `Você ganhou ${mailer.brl(val)} — ${f.name.split(' ')[0]} comprou pela sua indicação`, mailer.layout({
      preheader: 'Obrigado por indicar!', title: `Você ganhou ${mailer.brl(val)} 🎁`,
      intro: `Olá, ${mailer.esc(ref.name.split(' ')[0])}! <b>${mailer.esc(f.name.split(' ')[0])}</b> fez a primeira compra pela sua indicação. Como agradecimento, aqui está o seu cupom.`,
      body: `<p style="text-align:center;margin:18px 0"><span style="display:inline-block;padding:14px 26px;border:1px dashed #d6b26e;border-radius:12px;font-size:22px;letter-spacing:.12em;color:#f3dca4"><b>${cp.code}</b></span></p>
        <p style="text-align:center;font-size:13px;color:#b9b9c0">${mailer.brl(val)} de desconto em compras acima de ${mailer.brl(val * 2)} · válido até ${cp.expires.split('-').reverse().join('/')} · uso único.</p>`,
      button: { label: 'Indicar mais amigos', url: base + '/minha-conta#indique' }
    }), 'indicacao').catch(() => {});
    return cp;
  }
  function referralInfo(customerId, base) {
    const s = getSettings(), code = ensureRefCode(customerId);
    const friends = db.prepare(`SELECT name, created_at, referral_rewarded FROM customers WHERE referred_by=? ORDER BY id DESC LIMIT 50`).all(customerId)
      .map((f) => ({ name: f.name.split(' ')[0] + ' ' + ((f.name.split(' ')[1] || '')[0] || '') + '.', since: f.created_at.slice(0, 10), bought: !!f.referral_rewarded }));
    const coupons = db.prepare(`SELECT code,type,value,min_order,expires_at,uses,max_uses,description FROM coupons WHERE customer_id=? ORDER BY id DESC`).all(customerId)
      .map((c) => ({ ...c, used: c.uses >= c.max_uses, expired: c.expires_at && c.expires_at < new Date().toISOString().slice(0, 10) }));
    return { enabled: !!s.referral_enabled, code, link: `${base}/?indica=${code}`, friend_pct: Number(s.referral_friend_pct) || 5, reward: Number(s.referral_reward_value) || 50,
      min_order: Number(s.referral_min_order) || 0, friends, coupons };
  }

  /* ================= Reservar para retirar ================= */
  // reservas não retiradas no prazo: cancela, devolve o estoque e avisa
  function reservationJob(base, onCancel) {
    const due = db.prepare("SELECT * FROM orders WHERE reserve_until<>'' AND reserve_until < datetime('now','localtime') AND status IN ('novo','confirmado','separando','pronto')").all();
    for (const o of due) {
      db.exec('BEGIN');
      try {
        const cur = db.prepare('SELECT status FROM orders WHERE id=?').get(o.id);
        if (!cur || !['novo', 'confirmado', 'separando', 'pronto'].includes(cur.status)) { db.exec('ROLLBACK'); continue; }
        for (const i of J(o.items, [])) db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(i.qty, i.id);
        db.prepare("UPDATE orders SET status='cancelado', notes=trim(notes || ' [reserva expirada]') WHERE id=?").run(o.id);
        db.prepare("INSERT INTO audit_log(user_name,action,detail) VALUES('sistema','reserva_expirada',?)").run(o.code);
        db.exec('COMMIT');
        onCancel && onCancel(o);
      } catch (e) { try { db.exec('ROLLBACK'); } catch {} }
    }
    return due.length;
  }

  return { waText, waSend, waReady, notifyOrder, ensureRefCode, attachReferral, referralPaid, referralInfo, reservationJob, intl };
};
