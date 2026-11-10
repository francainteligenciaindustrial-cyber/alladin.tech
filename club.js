// Clube Aladdin (cashback + níveis + aniversário) e lembretes automáticos que viram venda
'use strict';
const crypto = require('crypto');

module.exports = function createClub({ db, getSettings, J, round2, mailer, wa, push }) {
  db.exec(`CREATE TABLE IF NOT EXISTS cashback (
      id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL, order_id INTEGER, order_code TEXT DEFAULT '',
      type TEXT NOT NULL CHECK (type IN ('credito','uso','estorno','expirado','ajuste')), amount REAL NOT NULL, note TEXT DEFAULT '',
      expires_at TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime')) );
    CREATE INDEX IF NOT EXISTS idx_cashback_customer ON cashback(customer_id);
    CREATE TABLE IF NOT EXISTS reminders_sent ( key TEXT PRIMARY KEY, customer_id INTEGER, kind TEXT, sent_at TEXT DEFAULT (datetime('now','localtime')) );`);
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const PAID = "('confirmado','separando','enviado','pronto','entregue')";
  const cfg = () => { const s = getSettings(); return {
    on: s.club_enabled !== false, silver: +s.club_pct_silver || 2, gold: +s.club_pct_gold || 3, diamond: +s.club_pct_diamond || 5,
    goldAt: +s.club_gold_at || 5000, diamondAt: +s.club_diamond_at || 15000, days: +s.club_expiry_days || 180, cap: +s.club_max_use_pct || 30,
    bday: +s.club_birthday_value || 50 }; };

  /* ---------- nível e saldo ---------- */
  function tier(customerId, excludeOrderId = 0) {
    const c = cfg();
    const spent = db.prepare(`SELECT COALESCE(SUM(subtotal - discount),0) v FROM orders WHERE customer_id=? AND id<>? AND status IN ${PAID} AND COALESCE(kind,'')<>'sinal' AND created_at >= datetime('now','localtime','-365 days')`).get(customerId, excludeOrderId).v;
    const [key, name, pct, next, nextAt] = spent >= c.diamondAt ? ['diamante', 'Diamante', c.diamond, null, null]
      : spent >= c.goldAt ? ['ouro', 'Ouro', c.gold, 'Diamante', c.diamondAt] : ['prata', 'Prata', c.silver, 'Ouro', c.goldAt];
    return { key, name, pct, spent: round2(spent), next, nextAt, missing: nextAt ? round2(Math.max(0, nextAt - spent)) : 0 };
  }
  function expire() {
    // créditos vencidos: lança a parte não usada como "expirado" (FIFO simples por crédito)
    const today = ymd(new Date());
    for (const c of db.prepare("SELECT * FROM cashback WHERE type='credito' AND expires_at<>'' AND expires_at<? AND id NOT IN (SELECT CAST(note AS INTEGER) FROM cashback WHERE type='expirado')").all(today)) {
      const bal = balance(c.customer_id); if (bal <= 0) { db.prepare("INSERT INTO cashback(customer_id,type,amount,note) VALUES(?,'expirado',0,?)").run(c.customer_id, String(c.id)); continue; }
      const usedAfter = -db.prepare("SELECT COALESCE(SUM(amount),0) v FROM cashback WHERE customer_id=? AND type IN ('uso','expirado') AND id>?").get(c.customer_id, c.id).v;
      const left = Math.max(0, Math.min(bal, c.amount - usedAfter));
      db.prepare("INSERT INTO cashback(customer_id,type,amount,note) VALUES(?,'expirado',?,?)").run(c.customer_id, -round2(left), String(c.id));
    }
  }
  const balance = (customerId) => round2(Math.max(0, db.prepare('SELECT COALESCE(SUM(amount),0) v FROM cashback WHERE customer_id=?').get(customerId).v));
  function summary(customerId) {
    const c = cfg(), t = tier(customerId), bal = balance(customerId);
    const hist = db.prepare('SELECT type,amount,order_code,note,expires_at,created_at FROM cashback WHERE customer_id=? AND amount<>0 ORDER BY id DESC LIMIT 40').all(customerId);
    const soon = db.prepare("SELECT MIN(expires_at) d FROM cashback WHERE customer_id=? AND type='credito' AND expires_at>=?").get(customerId, ymd(new Date())).d;
    return { enabled: c.on, tier: t, balance: bal, cap_pct: c.cap, expiry_days: c.days, next_expiry: soon || '', history: hist,
      levels: [{ name: 'Prata', pct: c.silver, from: 0 }, { name: 'Ouro', pct: c.gold, from: c.goldAt }, { name: 'Diamante', pct: c.diamond, from: c.diamondAt }], birthday_value: c.bday };
  }
  // quanto do cashback pode ser usado neste pedido
  const usable = (customerId, base) => { const c = cfg(); if (!c.on || !customerId) return 0; return round2(Math.min(balance(customerId), base * c.cap / 100)); };
  function spend(customerId, orderId, code, amount) { if (amount > 0) db.prepare("INSERT INTO cashback(customer_id,order_id,order_code,type,amount,note) VALUES(?,?,?,'uso',?,'usado no pedido')").run(customerId, orderId, code, -round2(amount)); }
  function refund(orderId) {
    const used = db.prepare("SELECT customer_id, COALESCE(SUM(amount),0) v, MAX(order_code) code FROM cashback WHERE order_id=? AND type='uso' GROUP BY customer_id").get(orderId);
    if (used && used.v < 0 && !db.prepare("SELECT id FROM cashback WHERE order_id=? AND type='estorno'").get(orderId))
      db.prepare("INSERT INTO cashback(customer_id,order_id,order_code,type,amount,note) VALUES(?,?,?,'estorno',?,'pedido cancelado')").run(used.customer_id, orderId, used.code, -used.v);
    // crédito ganho com um pedido cancelado é retirado
    const earned = db.prepare("SELECT customer_id, amount FROM cashback WHERE order_id=? AND type='credito'").get(orderId);
    if (earned && !db.prepare("SELECT id FROM cashback WHERE order_id=? AND type='ajuste' AND note='pedido cancelado'").get(orderId))
      db.prepare("INSERT INTO cashback(customer_id,order_id,type,amount,note) VALUES(?,?,'ajuste',?,'pedido cancelado')").run(earned.customer_id, orderId, -earned.amount);
  }
  // crédito quando o pedido é pago (uma vez), sobre o valor dos produtos menos descontos e cashback usado
  function earn(orderId) {
    const c = cfg(); if (!c.on) return 0;
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
    if (!o || !o.customer_id || o.kind === 'sinal' || db.prepare("SELECT id FROM cashback WHERE order_id=? AND type='credito'").get(o.id)) return 0;
    const base = Math.max(0, o.subtotal - (o.discount || 0) - (o.pix_discount || 0));
    const t = tier(o.customer_id, o.id), amount = round2(base * t.pct / 100);
    if (amount <= 0) return 0;
    const exp = ymd(new Date(Date.now() + c.days * 864e5));
    db.prepare("INSERT INTO cashback(customer_id,order_id,order_code,type,amount,note,expires_at) VALUES(?,?,?,'credito',?,?,?)").run(o.customer_id, o.id, o.code, amount, `${t.pct}% · nível ${t.name}`, exp);
    return amount;
  }
  function adjust(customerId, amount, note) { db.prepare("INSERT INTO cashback(customer_id,type,amount,note) VALUES(?,'ajuste',?,?)").run(customerId, round2(amount), String(note || 'ajuste manual').slice(0, 120)); return balance(customerId); }

  /* ---------- envios (e-mail + WhatsApp + notificação no app) ---------- */
  async function notify(c, { subject, title, intro, button, wa: waText, pushMsg, kind }) {
    if (c.email) await mailer.send(c.email, subject, mailer.layout({ preheader: title, title, intro, button, unsubUrl: c.unsub_token ? button.base + '/descadastrar?t=' + c.unsub_token : '' }), kind).catch(() => {});
    if (c.phone && wa && wa.waReady() && getSettings().reminders_whatsapp) await wa.waSend(c.phone, waText, { kind }).catch(() => {});
    if (push) await push.toCustomer(c.id, pushMsg).catch(() => {});
  }
  const once = (key, customerId, kind) => { try { db.prepare('INSERT INTO reminders_sent(key,customer_id,kind) VALUES(?,?,?)').run(key, customerId, kind); return true; } catch { return false; } };

  async function birthdayJob(base) {
    const c = cfg(); if (!c.on || !(c.bday > 0)) return 0;
    const now = new Date(), md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`, year = now.getFullYear();
    let n = 0;
    for (const cu of db.prepare("SELECT * FROM customers WHERE birthday<>'' AND substr(birthday,6,5)=?").all(md)) {
      if (!once(`aniv:${cu.id}:${year}`, cu.id, 'aniversario')) continue;
      let code; do { code = 'ANIV-' + crypto.randomBytes(3).toString('hex').toUpperCase(); } while (db.prepare('SELECT id FROM coupons WHERE code=?').get(code));
      db.prepare("INSERT INTO coupons(code,type,value,min_order,max_uses,expires_at,description,active,customer_id) VALUES(?,'fixed',?,?,1,?,?,1,?)")
        .run(code, c.bday, c.bday * 4, ymd(new Date(Date.now() + 30 * 864e5)), 'Presente de aniversário — Clube Aladdin', cu.id);
      const first = cu.name.split(' ')[0];
      await notify(cu, { kind: 'aniversario', subject: `Feliz aniversário, ${first}! Seu presente chegou 🎁`, title: 'Feliz aniversário!',
        intro: `Parabéns, ${mailer.esc(first)}! O Clube Aladdin preparou um presente: <b>${mailer.brl(c.bday)} OFF</b> com o cupom <b>${code}</b> (compras acima de ${mailer.brl(c.bday * 4)}, válido por 30 dias).`,
        button: { label: 'Escolher meu presente', url: base + '/loja', base }, wa: `Feliz aniversário, ${first}! 🎉 Presente do Clube Aladdin: ${mailer.brl(c.bday)} OFF com o cupom ${code} (30 dias). ${base}/loja`,
        pushMsg: { title: `Feliz aniversário, ${first}! 🎁`, body: `Seu presente: ${mailer.brl(c.bday)} OFF com o cupom ${code}.`, url: '/loja' } });
      n++;
    }
    return n;
  }
  // lembretes: garantia acabando (aviso de serviço) · 2 anos de iPhone (troca) · película a cada 6 meses (só com consentimento de ofertas)
  async function remindersJob(base) {
    const s = getSettings(); if (s.reminders_enabled === false) return { sent: 0 };
    const today = ymd(new Date()), in30 = ymd(new Date(Date.now() + 30 * 864e5)); let sent = 0;
    const cust = (id) => id ? db.prepare('SELECT * FROM customers WHERE id=?').get(id) : null;
    // 1) garantia acaba em 30 dias
    for (const w of db.prepare(`SELECT w.*, o.customer_id, o.customer FROM warranties w JOIN orders o ON o.id=w.order_id WHERE o.status<>'cancelado' AND w.expires_at=?`).all(in30)) {
      const c = cust(w.customer_id) || { id: 0, ...J(w.customer, {}) }; if (!c.email && !c.phone) continue;
      if (!once(`gar30:${w.id}`, c.id || null, 'garantia')) continue;
      const first = String(c.name || '').split(' ')[0] || 'cliente';
      await notify(c, { kind: 'lembrete', subject: `A garantia do seu ${w.product_name} acaba em 30 dias`, title: 'Sua garantia acaba em 30 dias',
        intro: `Olá, ${mailer.esc(first)}! A garantia da loja do seu <b>${mailer.esc(w.product_name)}</b> vai até <b>${w.expires_at.split('-').reverse().join('/')}</b>. Se notou qualquer problema, traga agora para avaliarmos sem custo. E se estiver pensando no próximo, seu aparelho ainda vale bem na troca.`,
        button: { label: 'Ver quanto vale na troca', url: base + '/upgrade', base }, wa: `Olá, ${first}! A garantia do seu ${w.product_name} vai até ${w.expires_at.split('-').reverse().join('/')}. Notou algum problema? Traga para avaliarmos sem custo. ${base}/garantia`,
        pushMsg: { title: 'Sua garantia acaba em 30 dias', body: `${w.product_name}: garantia até ${w.expires_at.split('-').reverse().join('/')}.`, url: '/garantia' } });
      sent++;
    }
    // 2) e 3) — marketing: só clientes com conta e que aceitaram ofertas
    const rows = db.prepare(`SELECT o.id AS oid, o.code, o.items, o.created_at AS ocreated, c.id, c.name, c.email, c.phone, c.unsub_token FROM orders o JOIN customers c ON c.id=o.customer_id
      WHERE o.status IN ${PAID} AND COALESCE(o.kind,'')<>'sinal' AND c.marketing=1 AND o.created_at >= datetime('now','localtime','-800 days')`).all();
    for (const r of rows) {
      const age = Math.floor((Date.now() - new Date(String(r.ocreated).replace(' ', 'T'))) / 864e5);
      const phones = J(r.items, []).filter((i) => /iphone/i.test(i.name || '') && !i.deposit);
      if (!phones.length) continue;
      const first = r.name.split(' ')[0], model = phones[0].name;
      if (age >= 730 && age <= 760 && once(`2anos:${r.oid}`, r.id, 'troca')) {
        await notify(r, { kind: 'lembrete', subject: `Faz 2 anos do seu ${model}: veja quanto ele vale`, title: 'Dois anos juntos!',
          intro: `Olá, ${mailer.esc(first)}! Seu <b>${mailer.esc(model)}</b> completou 2 anos. Ele ainda vale um bom dinheiro como parte do pagamento do próximo — faça a avaliação em 1 minuto.`,
          button: { label: 'Avaliar meu iPhone', url: base + '/upgrade', base }, wa: `Olá, ${first}! Seu ${model} fez 2 anos 🎂 Ele ainda vale bem na troca: ${base}/upgrade`,
          pushMsg: { title: 'Seu iPhone fez 2 anos', body: 'Veja quanto ele vale na troca pelo próximo.', url: '/upgrade' } });
        sent++;
      }
      const sixm = Math.floor(age / 182);
      if (age % 182 <= 3 && sixm >= 1 && sixm <= 4 && once(`pelicula:${r.oid}:${sixm}`, r.id, 'pelicula')) {
        await notify(r, { kind: 'lembrete', subject: 'Hora de trocar a película do seu iPhone?', title: 'Hora de renovar a proteção',
          intro: `Olá, ${mailer.esc(first)}! Películas costumam riscar e perder a aderência depois de alguns meses. Passe na loja: a gente troca a película do seu <b>${mailer.esc(model)}</b> na hora.`,
          button: { label: 'Ver películas e capas', url: base + '/categoria/acessorios', base }, wa: `Olá, ${first}! Hora de renovar a película do seu ${model}? A gente aplica na hora: ${base}/categoria/acessorios`,
          pushMsg: { title: 'Hora de trocar a película?', body: 'Passe na loja: aplicamos na hora.', url: '/categoria/acessorios' } });
        sent++;
      }
    }
    return { sent };
  }
  return { tier, balance, summary, usable, spend, refund, earn, adjust, expire, birthdayJob, remindersJob, cfg };
};
