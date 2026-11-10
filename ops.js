// Gestão para o dono: lucro real (custo da época da venda), giro, parados, sugestão de compra e estoque por unidade (IMEI)
'use strict';

module.exports = function createOps({ db, J, round2 }) {
  db.exec(`CREATE TABLE IF NOT EXISTS order_costs ( order_id INTEGER NOT NULL, product_id INTEGER, qty INTEGER NOT NULL, unit_cost REAL NOT NULL, PRIMARY KEY (order_id, product_id) );
    CREATE TABLE IF NOT EXISTS stock_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, serial TEXT NOT NULL, cost REAL DEFAULT 0, supplier TEXT DEFAULT '',
      origin TEXT DEFAULT 'compra' CHECK (origin IN ('compra','troca','consignado','outro')), notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'disponivel' CHECK (status IN ('disponivel','reservado','vendido','baixa')), order_code TEXT DEFAULT '',
      entry_date TEXT DEFAULT (datetime('now','localtime')), sold_at TEXT DEFAULT '', created_by TEXT DEFAULT '' );
    CREATE INDEX IF NOT EXISTS idx_units_product ON stock_units(product_id, status);
    CREATE INDEX IF NOT EXISTS idx_units_serial ON stock_units(serial);`);
  const PAID = "('confirmado','separando','enviado','pronto','entregue')";

  /* ---------- custo no momento da venda ---------- */
  function snapshotCosts(orderId) {
    const o = db.prepare('SELECT id, items, kind FROM orders WHERE id=?').get(orderId); if (!o || o.kind === 'sinal') return;
    const agg = new Map(); for (const i of J(o.items, [])) agg.set(i.id, (agg.get(i.id) || 0) + i.qty);
    for (const [pid, qty] of agg) {
      // custo por unidade (IMEI) quando houver unidade vinculada; senão, custo cadastrado no produto
      const unit = db.prepare("SELECT AVG(cost) c FROM stock_units WHERE product_id=? AND order_code=(SELECT code FROM orders WHERE id=?) AND cost>0").get(pid, orderId);
      const cost = unit && unit.c ? unit.c : ((db.prepare('SELECT cost FROM products WHERE id=?').get(pid) || {}).cost || 0);
      db.prepare('INSERT INTO order_costs(order_id,product_id,qty,unit_cost) VALUES(?,?,?,?) ON CONFLICT(order_id,product_id) DO UPDATE SET qty=excluded.qty, unit_cost=excluded.unit_cost').run(orderId, pid, qty, round2(cost));
    }
  }

  /* ---------- painel financeiro ---------- */
  function finance({ from, to }) {
    const orders = db.prepare(`SELECT * FROM orders WHERE status IN ${PAID} AND COALESCE(kind,'')<>'sinal' AND created_at>=? AND created_at<? ORDER BY created_at`).all(from, to);
    const prods = new Map(db.prepare('SELECT id, name, cost, price, stock FROM products').all().map((p) => [p.id, p]));
    const costOf = new Map(db.prepare(`SELECT order_id, product_id, unit_cost FROM order_costs WHERE order_id IN (SELECT id FROM orders WHERE created_at>=? AND created_at<?)`).all(from, to).map((r) => [r.order_id + ':' + r.product_id, r.unit_cost]));
    const per = new Map(); let revenue = 0, cost = 0, shipping = 0, missingCost = new Set(); const ch = { site: { n: 0, v: 0 }, loja: { n: 0, v: 0 }, marketplace: { n: 0, v: 0 } };
    for (const o of orders) {
      const factor = o.subtotal > 0 ? Math.max(0, o.subtotal - (o.discount || 0) - (o.pix_discount || 0)) / o.subtotal : 0;
      const net = round2(o.subtotal * factor); revenue += net; shipping += o.shipping || 0;
      const c = ch[o.channel] || ch.site; c.n++; c.v += net;
      for (const i of J(o.items, [])) {
        const uc = costOf.has(o.id + ':' + i.id) ? costOf.get(o.id + ':' + i.id) : ((prods.get(i.id) || {}).cost || 0);
        if (!uc) missingCost.add(i.id);
        const r = per.get(i.id) || { id: i.id, name: (prods.get(i.id) || {}).name || i.name, units: 0, revenue: 0, cost: 0 };
        r.units += i.qty; r.revenue += i.price * i.qty * factor; r.cost += uc * i.qty; per.set(i.id, r); cost += uc * i.qty;
      }
    }
    const products = [...per.values()].map((r) => ({ ...r, revenue: round2(r.revenue), cost: round2(r.cost), profit: round2(r.revenue - r.cost), margin: r.revenue ? Math.round(((r.revenue - r.cost) / r.revenue) * 1000) / 10 : 0, no_cost: missingCost.has(r.id) }))
      .sort((a, b) => b.profit - a.profit);
    revenue = round2(revenue); cost = round2(cost);
    return { from, to, orders: orders.length, revenue, cost, profit: round2(revenue - cost), margin: revenue ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : 0,
      ticket: orders.length ? round2(revenue / orders.length) : 0, shipping: round2(shipping), channels: Object.fromEntries(Object.entries(ch).map(([k, v]) => [k, { n: v.n, v: round2(v.v) }])),
      products, missing_cost: [...missingCost].map((id) => (prods.get(id) || {}).name).filter(Boolean) };
  }
  function stockInsights() {
    const sold = (days) => new Map(db.prepare(`SELECT items FROM orders WHERE status IN ${PAID} AND COALESCE(kind,'')<>'sinal' AND created_at>=datetime('now','localtime',?)`).all(`-${days} days`)
      .flatMap((o) => J(o.items, [])).reduce((m, i) => m.set(i.id, (m.get(i.id) || 0) + i.qty), new Map()));
    const s30 = sold(30), s60 = sold(60);
    const last = new Map(db.prepare(`SELECT items, created_at FROM orders WHERE status IN ${PAID} ORDER BY created_at`).all().flatMap((o) => J(o.items, []).map((i) => [i.id, o.created_at])));
    const ps = db.prepare("SELECT id, name, stock, cost, price, created_at, coming_soon FROM products WHERE active=1 AND COALESCE(coming_soon,0)=0").all();
    const top = ps.filter((p) => s30.get(p.id)).map((p) => ({ id: p.id, name: p.name, units30: s30.get(p.id), stock: p.stock })).sort((a, b) => b.units30 - a.units30).slice(0, 10);
    const stale = ps.filter((p) => p.stock > 0 && !s60.get(p.id) && (Date.now() - new Date(String(p.created_at).replace(' ', 'T'))) / 864e5 > 60)
      .map((p) => ({ id: p.id, name: p.name, stock: p.stock, last_sale: last.get(p.id) || '', tied: round2(p.stock * (p.cost || 0)), at_price: round2(p.stock * p.price) })).sort((a, b) => b.tied - a.tied);
    const buy = ps.filter((p) => s30.get(p.id)).map((p) => { const v = s30.get(p.id) / 30, days = v ? p.stock / v : 999;
      return { id: p.id, name: p.name, stock: p.stock, per_week: Math.round(v * 7 * 10) / 10, days_left: Math.floor(days), suggest: Math.max(0, Math.ceil(v * 30 - p.stock)), cost_est: round2(Math.max(0, Math.ceil(v * 30 - p.stock)) * (p.cost || 0)) }; })
      .filter((x) => x.days_left < 15 && x.suggest > 0).sort((a, b) => a.days_left - b.days_left);
    const value = db.prepare("SELECT COALESCE(SUM(stock*cost),0) c, COALESCE(SUM(stock*price),0) p, COALESCE(SUM(stock),0) u FROM products WHERE active=1").get();
    return { top, stale, buy, stock_value: { cost: round2(value.c), price: round2(value.p), units: value.u } };
  }

  /* ---------- estoque por unidade (IMEI / série) ---------- */
  const recount = (pid) => { const p = db.prepare('SELECT track_units FROM products WHERE id=?').get(pid); if (!p || !p.track_units) return null;
    const n = db.prepare("SELECT COUNT(*) n FROM stock_units WHERE product_id=? AND status='disponivel'").get(pid).n; db.prepare('UPDATE products SET stock=? WHERE id=?').run(n, pid); return n; };
  function addUnits(pid, b, by, checkSerial) {
    const p = db.prepare('SELECT id, name FROM products WHERE id=?').get(pid); if (!p) throw new Error('Produto não encontrado.');
    const raw = (Array.isArray(b.serials) ? b.serials : String(b.serials || '').split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean);
    if (!raw.length) throw new Error('Informe pelo menos um IMEI ou número de série.');
    const errors = [], ok = [];
    for (const r of raw) { const c = checkSerial(r); if (c.error) { errors.push(c.error); continue; }
      const ex = db.prepare("SELECT s.status, p.name FROM stock_units s JOIN products p ON p.id=s.product_id WHERE s.serial=? AND s.status<>'baixa'").get(c.serial);
      if (ex) errors.push(`${r} já está cadastrado (${ex.name} · ${ex.status}).`); else if (ok.includes(c.serial)) errors.push(`${r} repetido na lista.`); else ok.push(c.serial); }
    if (errors.length) throw new Error(errors.join(' '));
    const origin = ['compra', 'troca', 'consignado', 'outro'].includes(b.origin) ? b.origin : 'compra';
    const ins = db.prepare('INSERT INTO stock_units(product_id,serial,cost,supplier,origin,notes,created_by) VALUES(?,?,?,?,?,?,?)');
    db.exec('BEGIN'); try { for (const sn of ok) ins.run(pid, sn, Math.max(0, round2(b.cost) || 0), String(b.supplier || '').slice(0, 80), origin, String(b.notes || '').slice(0, 200), by || ''); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { added: ok.length, stock: recount(pid) };
  }
  // pedido do site/reserva: separa as unidades mais antigas (primeiro que entra, primeiro que sai)
  function reserveForOrder(orderId) {
    const o = db.prepare('SELECT id, code, items, kind FROM orders WHERE id=?').get(orderId); if (!o || o.kind === 'sinal') return;
    for (const i of J(o.items, [])) {
      const p = db.prepare('SELECT track_units FROM products WHERE id=?').get(i.id); if (!p || !p.track_units) continue;
      const have = db.prepare("SELECT COUNT(*) n FROM stock_units WHERE product_id=? AND order_code=? AND status IN ('reservado','vendido')").get(i.id, o.code).n;
      for (const u of db.prepare("SELECT id FROM stock_units WHERE product_id=? AND status='disponivel' ORDER BY entry_date, id LIMIT ?").all(i.id, Math.max(0, i.qty - have)))
        db.prepare("UPDATE stock_units SET status='reservado', order_code=? WHERE id=?").run(o.code, u.id);
      recount(i.id);
    }
  }
  function releaseForOrder(orderId) {
    const o = db.prepare('SELECT code FROM orders WHERE id=?').get(orderId); if (!o) return;
    const pids = db.prepare("SELECT DISTINCT product_id FROM stock_units WHERE order_code=? AND status IN ('reservado','vendido')").all(o.code).map((r) => r.product_id);
    db.prepare("UPDATE stock_units SET status='disponivel', order_code='', sold_at='' WHERE order_code=? AND status IN ('reservado','vendido')").run(o.code);
    pids.forEach(recount);
  }
  // confere se os IMEIs podem ser vendidos (antes de registrar a venda no balcão)
  function checkSale(items, checkSerial) {
    const errs = [];
    for (const it of items) {
      const p = db.prepare('SELECT id, name, track_units FROM products WHERE id=?').get(parseInt(it.id)); if (!p || !p.track_units) continue;
      const ser = (it.serials || []).map((x) => checkSerial(x)).filter((c) => !c.error).map((c) => c.serial);
      if (ser.length !== (parseInt(it.qty) || 1)) { errs.push(`${p.name}: informe ${parseInt(it.qty) || 1} IMEI(s) — este produto é controlado por unidade.`); continue; }
      for (const sn of ser) { const u = db.prepare('SELECT status, product_id FROM stock_units WHERE serial=? AND status<>\'baixa\' ORDER BY id DESC').get(sn);
        if (!u || u.product_id !== p.id) errs.push(`${sn} não está no estoque de ${p.name}.`); else if (u.status !== 'disponivel') errs.push(`${sn} já foi ${u.status === 'vendido' ? 'vendido' : 'reservado para outro pedido'}.`); }
    }
    if (errs.length) throw new Error(errs.join(' '));
  }
  // venda confirmada com IMEI: marca a unidade exata como vendida (libera a reservada no lugar dela)
  function sellSerials(orderId, serials) {
    const o = db.prepare('SELECT code FROM orders WHERE id=?').get(orderId); if (!o) return;
    for (const sn of serials) {
      const u = db.prepare("SELECT * FROM stock_units WHERE serial=? AND status<>'baixa' ORDER BY id DESC").get(sn); if (!u) continue;
      if (u.status === 'vendido' && u.order_code !== o.code) throw new Error(`${sn} já foi vendido no pedido ${u.order_code}.`);
      if (u.status === 'reservado' && u.order_code !== o.code) throw new Error(`${sn} está reservado para o pedido ${u.order_code}.`);
      if (u.status === 'disponivel') { const r = db.prepare("SELECT id FROM stock_units WHERE product_id=? AND order_code=? AND status='reservado' ORDER BY id LIMIT 1").get(u.product_id, o.code);
        if (r) db.prepare("UPDATE stock_units SET status='disponivel', order_code='' WHERE id=?").run(r.id); }
      db.prepare("UPDATE stock_units SET status='vendido', order_code=?, sold_at=datetime('now','localtime') WHERE id=?").run(o.code, u.id);
      recount(u.product_id);
    }
  }
  function finalizeOrder(orderId) { const o = db.prepare('SELECT code FROM orders WHERE id=?').get(orderId); if (o) db.prepare("UPDATE stock_units SET status='vendido', sold_at=datetime('now','localtime') WHERE order_code=? AND status='reservado'").run(o.code); }
  const units = (pid) => db.prepare('SELECT * FROM stock_units WHERE product_id=? ORDER BY CASE status WHEN \'disponivel\' THEN 0 WHEN \'reservado\' THEN 1 WHEN \'vendido\' THEN 2 ELSE 3 END, entry_date DESC LIMIT 500').all(pid);
  const findSerial = (sn) => db.prepare('SELECT s.*, p.name product FROM stock_units s JOIN products p ON p.id=s.product_id WHERE s.serial LIKE ? ORDER BY s.id DESC LIMIT 20').all('%' + String(sn).toUpperCase().replace(/[^A-Z0-9]/g, '') + '%');
  function writeOff(id, notes) { const u = db.prepare('SELECT * FROM stock_units WHERE id=?').get(id); if (!u) throw new Error('Unidade não encontrada.'); if (u.status !== 'disponivel') throw new Error('Só unidades disponíveis podem ser baixadas.');
    db.prepare("UPDATE stock_units SET status='baixa', notes=trim(notes || ' · ' || ?) WHERE id=?").run(String(notes || 'baixa').slice(0, 120), id); return recount(u.product_id); }
  return { snapshotCosts, finance, stockInsights, recount, addUnits, reserveForOrder, releaseForOrder, checkSale, sellSerials, finalizeOrder, units, findSerial, writeOff };
};
