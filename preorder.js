// Pré-venda / "Em breve": lista de aviso e fila por sinal (quem paga primeiro leva)
'use strict';
const crypto = require('crypto');

module.exports = function createPreorder({ db, getSettings, J, str, round2, mailer, wa }) {
  db.exec(`CREATE TABLE IF NOT EXISTS preorders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, options TEXT DEFAULT '{}', type TEXT NOT NULL CHECK (type IN ('aviso','sinal')),
    name TEXT NOT NULL, phone TEXT DEFAULT '', email TEXT DEFAULT '', customer_id INTEGER, deposit REAL DEFAULT 0, order_code TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','pago','avisado','convertido','cancelado')),
    paid_at TEXT DEFAULT '', notified_at TEXT DEFAULT '', sale_code TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime')) );
    CREATE INDEX IF NOT EXISTS idx_preorders_product ON preorders(product_id, status);`);
  const digits = (s) => String(s || '').replace(/\D/g, '');

  function stats(productId) {
    const p = db.prepare('SELECT preorder_units FROM products WHERE id=?').get(productId) || {};
    const paid = db.prepare("SELECT COUNT(*) n FROM preorders WHERE product_id=? AND type='sinal' AND status='pago'").get(productId).n;
    const interested = db.prepare("SELECT COUNT(*) n FROM preorders WHERE product_id=? AND type='aviso' AND status='aguardando'").get(productId).n;
    const units = +p.preorder_units || 0;
    return { paid, interested, units, left: units ? Math.max(0, units - paid) : null };
  }
  function addNotice(product, b, customer) {
    const phone = digits(b.phone), email = str(b.email, 120).toLowerCase();
    if (str(b.name, 80).length < 2 || (phone.length < 10 && !email.includes('@'))) throw new Error('Informe seu nome e WhatsApp (ou e-mail).');
    const dup = db.prepare("SELECT id FROM preorders WHERE product_id=? AND type='aviso' AND status='aguardando' AND ((phone<>'' AND phone=?) OR (email<>'' AND email=?))").get(product.id, phone, email);
    if (dup) return { ok: true, already: true };
    db.prepare("INSERT INTO preorders(product_id,options,type,name,phone,email,customer_id) VALUES(?,?,'aviso',?,?,?,?)")
      .run(product.id, JSON.stringify(b.options || {}), str(b.name, 80), phone, email, customer ? customer.id : null);
    return { ok: true };
  }
  // sinal: vira um pedido próprio (kind='sinal'); a posição na fila é a hora em que o pagamento é confirmado
  function addDeposit(product, b, customer) {
    const dep = round2(product.preorder_deposit);
    if (!(dep > 0)) throw new Error('Este lançamento ainda não aceita reserva com sinal.');
    const phone = digits(b.phone);
    if (str(b.name, 80).length < 3 || phone.length < 10) throw new Error('Informe seu nome completo e WhatsApp com DDD.');
    if (!['pix', 'card', 'cash'].includes(b.payment)) throw new Error('Escolha a forma de pagamento do sinal.');
    const open = db.prepare("SELECT COUNT(*) n FROM preorders WHERE product_id=? AND type='sinal' AND status IN ('aguardando','pago') AND phone=?").get(product.id, phone).n;
    if (open >= 2) throw new Error('Você já tem reservas para este lançamento. Fale com um consultor para mais unidades.');
    const s = getSettings();
    const opts = {}; for (const o of J(product.options, [])) { const v = (b.options || {})[o.name]; if (v && o.values.includes(v)) opts[o.name] = v; }
    const code = 'PV' + Date.now().toString(36).toUpperCase().slice(-4) + crypto.randomBytes(3).toString('hex').toUpperCase();
    const item = { id: product.id, name: `Sinal de pré-venda — ${product.name}`, price: dep, qty: 1, options: opts, image: J(product.images, [])[0] || '', deposit: true };
    db.exec('BEGIN');
    try {
      db.prepare(`INSERT INTO orders(customer_id,code,customer,items,subtotal,discount,pix_discount,shipping,total,coupon,delivery_method,delivery,payment,installments,notes,kind)
        VALUES(?,?,?,?,?,0,0,0,?,'','pickup',?,?,1,?,'sinal')`).run(customer ? customer.id : null, code,
        JSON.stringify({ name: str(b.name, 80), phone: str(b.phone, 20), email: str(b.email, 120) || (customer && customer.email) || '', cpf: str(b.cpf, 14) }),
        JSON.stringify([item]), dep, dep, JSON.stringify({ label: 'Pré-venda — retirada na loja quando chegar', address: `${s.address || ''} · ${s.city || ''}`, eta: product.coming_eta || '' }),
        b.payment, `PRÉ-VENDA: sinal de ${dep.toFixed(2)} descontado no valor final. Devolução integral se desistir antes da chegada.`);
      db.prepare("INSERT INTO preorders(product_id,options,type,name,phone,email,customer_id,deposit,order_code) VALUES(?,?,'sinal',?,?,?,?,?,?)")
        .run(product.id, JSON.stringify(opts), str(b.name, 80), phone, str(b.email, 120).toLowerCase(), customer ? customer.id : null, dep, code);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { code, deposit: dep };
  }
  const onOrderPaid = (o) => { if (o && o.kind === 'sinal') db.prepare("UPDATE preorders SET status='pago', paid_at=datetime('now','localtime') WHERE order_code=? AND status='aguardando'").run(o.code); };
  const onOrderCancelled = (o) => { if (o && o.kind === 'sinal') db.prepare("UPDATE preorders SET status='cancelado' WHERE order_code=? AND status IN ('aguardando','pago')").run(o.code); };
  function queue(productId) {
    const rows = db.prepare('SELECT * FROM preorders WHERE product_id=? ORDER BY id').all(productId).map((r) => ({ ...r, options: J(r.options, {}) }));
    const rank = { pago: 0, aguardando: 1, avisado: 2, convertido: 3, cancelado: 4 };
    rows.sort((a, b) => (a.type === b.type ? 0 : a.type === 'sinal' ? -1 : 1) || rank[a.status] - rank[b.status] || String(a.paid_at || a.created_at).localeCompare(String(b.paid_at || b.created_at)));
    let pos = 0; rows.forEach((r) => { r.pos = r.type === 'sinal' && r.status === 'pago' ? ++pos : null; });
    return rows;
  }
  function overview() {
    return db.prepare(`SELECT p.id, p.name, p.slug, p.price, p.stock, p.active, p.coming_soon, p.coming_eta, p.preorder_deposit, p.preorder_units, p.images
      FROM products p WHERE p.coming_soon=1 OR p.id IN (SELECT product_id FROM preorders WHERE status IN ('aguardando','pago')) ORDER BY p.coming_soon DESC, p.id DESC`).all()
      .map((p) => ({ ...p, images: J(p.images, []), ...stats(p.id) }));
  }
  // chegou: libera o produto e avisa a fila (primeiro quem pagou, na ordem; depois a lista de interessados)
  async function release(productId, { stock, price }, base) {
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(productId);
    if (!p) throw new Error('Produto não encontrado.');
    const st = Math.max(0, parseInt(stock) || 0), pr = round2(price) || p.price;
    if (!(pr > 0)) throw new Error('Informe o preço de venda antes de liberar.');
    db.prepare("UPDATE products SET coming_soon=0, stock=?, price=?, active=1, updated_at=datetime('now','localtime') WHERE id=?").run(st, pr, p.id);
    const s = getSettings(), store = s.store_name || 'Aladdin Tech', link = `${base}/produto/${p.slug}`;
    const q = queue(p.id), paid = q.filter((r) => r.type === 'sinal' && r.status === 'pago'), avisos = q.filter((r) => r.type === 'aviso' && r.status === 'aguardando');
    const contact = [];
    for (const r of paid) {
      const first = r.name.split(' ')[0];
      const text = `Olá, ${first}! Chegou o seu ${p.name} 🎉 Você é o nº ${r.pos} da fila e sua unidade está garantida. O sinal de R$ ${r.deposit.toFixed(2).replace('.', ',')} já está descontado. Venha retirar ou responda para combinarmos a entrega.`;
      if (r.email) mailer.send(r.email, `Chegou o seu ${p.name}! — ${store}`, mailer.layout({ preheader: 'Sua unidade está garantida.', title: `Chegou o seu ${p.name}`, intro: text, button: { label: 'Ver o produto', url: link } }), 'prevenda').catch(() => {});
      let auto = false; if (r.phone && wa && wa.waReady()) auto = !!(await wa.waSend(r.phone, text, { kind: 'prevenda' }).catch(() => ({}))).ok;
      contact.push({ id: r.id, name: r.name, phone: r.phone, type: 'sinal', pos: r.pos, text, auto });
    }
    for (const r of avisos) {
      const text = `Olá, ${r.name.split(' ')[0]}! O ${p.name} chegou na ${store} e está à venda agora: ${link} — as primeiras unidades costumam acabar rápido.`;
      if (r.email) mailer.send(r.email, `Chegou: ${p.name} — ${store}`, mailer.layout({ preheader: 'O lançamento que você pediu chegou.', title: `${p.name} chegou`, intro: text, button: { label: 'Comprar agora', url: link } }), 'prevenda').catch(() => {});
      let auto = false; if (r.phone && wa && wa.waReady()) auto = !!(await wa.waSend(r.phone, text, { kind: 'prevenda' }).catch(() => ({}))).ok;
      db.prepare("UPDATE preorders SET status='avisado', notified_at=datetime('now','localtime') WHERE id=?").run(r.id);
      contact.push({ id: r.id, name: r.name, phone: r.phone, type: 'aviso', text, auto });
    }
    return { paid: paid.length, notified: avisos.length, contact };
  }
  function setStatus(id, status, saleCode) {
    if (!['convertido', 'cancelado'].includes(status)) throw new Error('Ação inválida.');
    const r = db.prepare('SELECT * FROM preorders WHERE id=?').get(id); if (!r) throw new Error('Registro não encontrado.');
    db.prepare('UPDATE preorders SET status=?, sale_code=? WHERE id=?').run(status, str(saleCode, 20), id);
    return r;
  }
  return { stats, addNotice, addDeposit, onOrderPaid, onOrderCancelled, queue, overview, release, setStatus };
};
