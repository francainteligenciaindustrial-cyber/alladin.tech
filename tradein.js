// Troca Garantida: em N meses a loja recompra o aparelho por até X% do valor pago (crédito para o próximo)
'use strict';
const crypto = require('crypto');

module.exports = function createTradeIn({ db, getSettings, J, round2, mailer, wa }) {
  db.exec(`CREATE TABLE IF NOT EXISTS trade_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, order_id INTEGER NOT NULL, order_code TEXT NOT NULL, item_index INTEGER NOT NULL,
    product_id INTEGER, product_name TEXT NOT NULL, customer_id INTEGER, customer_name TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '',
    paid_value REAL NOT NULL, pct_a REAL NOT NULL, pct_b REAL NOT NULL, pct_c REAL NOT NULL,
    starts_at TEXT NOT NULL, opens_at TEXT NOT NULL, expires_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','resgatado','expirado','cancelado')),
    redeemed_at TEXT DEFAULT '', redeemed_grade TEXT DEFAULT '', redeemed_value REAL DEFAULT 0, coupon_code TEXT DEFAULT '', redeemed_by TEXT DEFAULT '',
    notified_open INTEGER DEFAULT 0, notified_expiring INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now','localtime')) );
    CREATE INDEX IF NOT EXISTS idx_trade_order ON trade_plans(order_id);
    CREATE INDEX IF NOT EXISTS idx_trade_customer ON trade_plans(customer_id);`);

  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addMonths = (d, m) => { const x = new Date(d.getTime()); const day = x.getDate(); x.setMonth(x.getMonth() + m); if (x.getDate() < day) x.setDate(0); return x; };
  const br = (s) => String(s || '').slice(0, 10).split('-').reverse().join('/');
  const cfg = () => { const s = getSettings(); return {
    enabled: s.trade_enabled !== false, a: +s.trade_pct_a || 60, b: +s.trade_pct_b || 50, c: +s.trade_pct_c || 40, months: +s.trade_months || 12,
    window: +s.trade_window_days || 90, cats: String(s.trade_categories || 'iphone').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean),
    min: +s.trade_min_price || 0, onlyNew: s.trade_only_new !== false }; };
  function eligible(p) {
    const c = cfg(); if (!c.enabled || !p) return false;
    const cat = db.prepare('SELECT slug FROM categories WHERE id=?').get(p.category_id);
    if (!cat || !c.cats.includes(cat.slug)) return false;
    if (c.onlyNew && /semi|usad|vitrine/i.test(p.condition || '')) return false;
    return (p.price || 0) >= c.min;
  }
  // cria os certificados quando o pedido passa a contar como pago (uma vez por pedido)
  function createForOrder(orderId) {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
    if (!o || o.kind === 'sinal' || db.prepare('SELECT id FROM trade_plans WHERE order_id=?').get(o.id)) return [];
    const c = cfg(); if (!c.enabled) return [];
    const items = J(o.items, []), cust = J(o.customer, {});
    const factor = o.subtotal > 0 ? Math.max(0, o.subtotal - (o.discount || 0) - (o.pix_discount || 0)) / o.subtotal : 1;
    const start = new Date(String(o.created_at).replace(' ', 'T')), opens = addMonths(start, c.months), exp = new Date(opens.getTime() + c.window * 864e5);
    const out = [];
    items.forEach((it, idx) => {
      const p = db.prepare('SELECT * FROM products WHERE id=?').get(it.id);
      if (!eligible(p)) return;
      for (let k = 0; k < it.qty; k++) {
        const code = 'TG' + crypto.randomBytes(4).toString('hex').toUpperCase();
        db.prepare(`INSERT INTO trade_plans(code,order_id,order_code,item_index,product_id,product_name,customer_id,customer_name,phone,email,paid_value,pct_a,pct_b,pct_c,starts_at,opens_at,expires_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(code, o.id, o.code, idx, it.id, it.name, o.customer_id || null, cust.name || '', cust.phone || '', cust.email || '',
          round2(it.price * factor), c.a, c.b, c.c, ymd(start), ymd(opens), ymd(exp));
        out.push(code);
      }
    });
    return out;
  }
  const cancelForOrder = (orderId) => db.prepare("UPDATE trade_plans SET status='cancelado' WHERE order_id=? AND status='ativo'").run(orderId).changes;
  const decorate = (t) => {
    const today = ymd(new Date());
    const phase = t.status !== 'ativo' ? t.status : today < t.opens_at ? 'aguardando' : today <= t.expires_at ? 'liberado' : 'expirado';
    return { ...t, phase, max_value: round2(t.paid_value * t.pct_a / 100), values: { A: round2(t.paid_value * t.pct_a / 100), B: round2(t.paid_value * t.pct_b / 100), C: round2(t.paid_value * t.pct_c / 100) },
      days_to_open: Math.max(0, Math.ceil((new Date(t.opens_at + 'T00:00:00') - new Date()) / 864e5)) };
  };
  const forCustomer = (customerId) => db.prepare("SELECT * FROM trade_plans WHERE customer_id=? AND status<>'cancelado' ORDER BY id DESC").all(customerId).map(decorate);
  const forOrder = (orderId) => db.prepare("SELECT * FROM trade_plans WHERE order_id=? AND status<>'cancelado' ORDER BY item_index, id").all(orderId).map(decorate);
  function search(q, phase) {
    let rows = db.prepare('SELECT * FROM trade_plans ORDER BY id DESC LIMIT 500').all().map(decorate);
    if (q) { const k = String(q).toLowerCase().replace(/\s/g, ''); rows = rows.filter((t) => (t.code + t.order_code + t.customer_name + t.phone + t.email + t.product_name).toLowerCase().replace(/\s/g, '').includes(k)); }
    if (phase) rows = rows.filter((t) => t.phase === phase);
    return rows;
  }
  // resgate na loja: avalia o estado e gera o crédito (cupom de uso único) para o próximo aparelho
  function redeem(id, grade, by) {
    const t = db.prepare('SELECT * FROM trade_plans WHERE id=?').get(id);
    if (!t) throw new Error('Certificado não encontrado.');
    const d = decorate(t);
    if (d.phase !== 'liberado') throw new Error(d.phase === 'aguardando' ? `A troca libera em ${br(t.opens_at)}.` : d.phase === 'expirado' ? 'O prazo para usar a troca terminou.' : 'Este certificado já foi usado ou cancelado.');
    if (!['A', 'B', 'C'].includes(grade)) throw new Error('Informe o estado do aparelho (A, B ou C).');
    const value = d.values[grade];
    let code; do { code = 'TROCA-' + crypto.randomBytes(3).toString('hex').toUpperCase(); } while (db.prepare('SELECT id FROM coupons WHERE code=?').get(code));
    const exp = ymd(new Date(Date.now() + 30 * 864e5));
    db.exec('BEGIN');
    try {
      db.prepare("INSERT INTO coupons(code,type,value,min_order,max_uses,expires_at,description,active,customer_id) VALUES(?,'fixed',?,?,1,?,?,1,?)")
        .run(code, value, round2(value + 1), exp, `Troca Garantida ${t.code} · ${t.product_name} · estado ${grade}`, null);
      db.prepare("UPDATE trade_plans SET status='resgatado', redeemed_at=datetime('now','localtime'), redeemed_grade=?, redeemed_value=?, coupon_code=?, redeemed_by=? WHERE id=?").run(grade, value, code, by || '', id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { code, value, expires: exp };
  }
  // avisos: troca liberada e 20 dias antes de vencer
  async function job(base) {
    const s = getSettings(), store = s.store_name || 'Aladdin Tech', today = ymd(new Date());
    const send = async (t, subject, title, intro) => {
      if (t.email) await mailer.send(t.email, subject, mailer.layout({ preheader: title, title, intro, button: { label: 'Ver os lançamentos', url: base + '/loja' },
        note: `Certificado ${t.code} · aparelho ${t.product_name} · comprado em ${br(t.starts_at)}. Traga o aparelho com a conta iCloud removida.` }), 'troca').catch(() => {});
      if (t.phone && wa && wa.waReady()) await wa.waSend(t.phone, `${intro.replace(/<[^>]+>/g, '')}\nCertificado ${t.code}. Fale com a gente para agendar: ${base}`, { kind: 'troca' }).catch(() => {});
    };
    for (const t of db.prepare("SELECT * FROM trade_plans WHERE status='ativo' AND notified_open=0 AND opens_at<=? AND expires_at>=?").all(today, today)) {
      const d = decorate(t);
      await send(t, `Sua Troca Garantida está liberada — até ${mailer.brl(d.max_value)} — ${store}`, 'Hora do upgrade!',
        `Olá, ${(t.customer_name || '').split(' ')[0]}! Já faz ${cfg().months} meses do seu ${t.product_name}. Pela Troca Garantida, a gente recompra o seu aparelho por até <b>${mailer.brl(d.max_value)}</b> como crédito no próximo iPhone. Vale até ${br(t.expires_at)}.`);
      db.prepare('UPDATE trade_plans SET notified_open=1 WHERE id=?').run(t.id);
    }
    const soon = ymd(new Date(Date.now() + 20 * 864e5));
    for (const t of db.prepare("SELECT * FROM trade_plans WHERE status='ativo' AND notified_expiring=0 AND opens_at<=? AND expires_at<=? AND expires_at>=?").all(today, soon, today)) {
      const d = decorate(t);
      await send(t, `Últimos dias da sua Troca Garantida — ${store}`, 'Sua Troca Garantida vence logo',
        `Olá, ${(t.customer_name || '').split(' ')[0]}! Sua Troca Garantida do ${t.product_name} (até <b>${mailer.brl(d.max_value)}</b> de crédito) vence em ${br(t.expires_at)}. Passe na loja para fazer o upgrade.`);
      db.prepare('UPDATE trade_plans SET notified_expiring=1 WHERE id=?').run(t.id);
    }
    db.prepare("UPDATE trade_plans SET status='expirado' WHERE status='ativo' AND expires_at<?").run(today);
  }
  // certificado dentro do recibo
  function certificateHtml(orderId, esc, brl) {
    const list = forOrder(orderId); if (!list.length) return '';
    return `<section class="terms tg"><h2>Certificado de Troca Garantida</h2>
      <table class="wt"><thead><tr><th>Aparelho</th><th>Certificado</th><th>Troca liberada</th><th>Válida até</th><th>Valor na troca</th></tr></thead><tbody>
      ${list.map((t) => `<tr><td>${esc(t.product_name)}</td><td class="mono">${esc(t.code)}</td><td>${br(t.opens_at)}</td><td>${br(t.expires_at)}</td><td><b>até ${brl(t.values.A)}</b><small>A ${t.pct_a}% · B ${t.pct_b}% · C ${t.pct_c}%</small></td></tr>`).join('')}
      </tbody></table>
      <ol><li>A partir da data de liberação, a loja recompra o aparelho deste certificado pelo percentual do valor pago indicado para o estado em que ele estiver: <b>A</b> (sem marcas), <b>B</b> (marcas leves) ou <b>C</b> (marcas visíveis), com funcionamento perfeito.</li>
      <li>O valor vira crédito para a compra de um novo aparelho na loja (uso único, válido por 30 dias após a avaliação). Não é convertido em dinheiro.</li>
      <li>Condições: aparelho original, sem tela ou traseira trincada, sem contato com líquido, sem reparo fora da loja, com a conta iCloud removida e o IMEI deste certificado.</li>
      <li>O benefício é pessoal e vale para uma troca por aparelho, dentro do prazo indicado.</li></ol></section>`;
  }
  return { cfg, eligible, createForOrder, cancelForOrder, forCustomer, forOrder, search, redeem, job, certificateHtml, decorate };
};
