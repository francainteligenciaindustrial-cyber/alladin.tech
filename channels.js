// Estoque unificado com Mercado Livre e Shopee: vendeu num canal, baixa em todos
'use strict';
const crypto = require('crypto');

module.exports = function createChannels({ db, getSettings, setSetting, secret, round2 }) {
  db.exec(`CREATE TABLE IF NOT EXISTS channel_orders ( channel TEXT NOT NULL, ext_id TEXT NOT NULL, order_code TEXT DEFAULT '', status TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime')), PRIMARY KEY (channel, ext_id) );
    CREATE TABLE IF NOT EXISTS channel_log ( id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, action TEXT, detail TEXT, ok INTEGER, created_at TEXT DEFAULT (datetime('now','localtime')) );`);
  const ML_API = () => process.env.ML_API_URL || 'https://api.mercadolibre.com';
  const ML_AUTH = () => process.env.ML_AUTH_URL || 'https://auth.mercadolivre.com.br';
  const SH_API = () => process.env.SHOPEE_API_URL || 'https://partner.shopeemobile.com';
  const log = (channel, action, detail, ok) => { db.prepare('INSERT INTO channel_log(channel,action,detail,ok) VALUES(?,?,?,?)').run(channel, action, String(detail).slice(0, 300), ok ? 1 : 0); db.exec('DELETE FROM channel_log WHERE id NOT IN (SELECT id FROM channel_log ORDER BY id DESC LIMIT 300)'); };
  const json = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { raw: t }; } };

  /* ================= Mercado Livre ================= */
  const mlTok = () => { try { return JSON.parse(secret('ml_tokens') || '{}'); } catch { return {}; } };
  const mlReady = () => !!(getSettings().ml_client_id && secret('ml_client_secret') && mlTok().access_token);
  function mlAuthUrl(base) {
    const state = crypto.randomBytes(12).toString('hex'); setSetting('ml_oauth_state', state);
    return `${ML_AUTH()}/authorization?response_type=code&client_id=${encodeURIComponent(getSettings().ml_client_id)}&redirect_uri=${encodeURIComponent(base + '/api/ml/callback')}&state=${state}`;
  }
  async function mlToken(body) {
    const r = await fetch(ML_API() + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(body), signal: AbortSignal.timeout(12000) });
    const j = await json(r); if (!r.ok || !j.access_token) throw new Error(j.message || j.error || 'Mercado Livre recusou a autorização.');
    setSetting('ml_tokens', JSON.stringify({ access_token: j.access_token, refresh_token: j.refresh_token, user_id: j.user_id, expires: Date.now() + (j.expires_in || 21600) * 1000 - 120000 }));
    return j;
  }
  async function mlCallback(code, state, base) {
    if (!state || state !== getSettings().ml_oauth_state) throw new Error('Autorização inválida (state).');
    setSetting('ml_oauth_state', '');
    await mlToken({ grant_type: 'authorization_code', client_id: getSettings().ml_client_id, client_secret: secret('ml_client_secret'), code, redirect_uri: base + '/api/ml/callback' });
    log('ml', 'conectado', 'conta conectada', true);
  }
  async function mlAccess() {
    const t = mlTok(); if (!t.access_token) throw new Error('Mercado Livre não conectado.');
    if (Date.now() > t.expires) await mlToken({ grant_type: 'refresh_token', client_id: getSettings().ml_client_id, client_secret: secret('ml_client_secret'), refresh_token: t.refresh_token });
    return mlTok().access_token;
  }
  async function mlSetStock(itemId, qty) {
    const r = await fetch(`${ML_API()}/items/${encodeURIComponent(itemId)}`, { method: 'PUT', headers: { Authorization: 'Bearer ' + await mlAccess(), 'Content-Type': 'application/json' }, body: JSON.stringify({ available_quantity: Math.max(0, qty) }), signal: AbortSignal.timeout(12000) });
    const j = await json(r); if (!r.ok) throw new Error(j.message || 'HTTP ' + r.status); return true;
  }
  async function mlOrder(resource) {
    const id = String(resource || '').replace(/\D/g, ''); if (!id) return null;
    const r = await fetch(`${ML_API()}/orders/${id}`, { headers: { Authorization: 'Bearer ' + await mlAccess() }, signal: AbortSignal.timeout(12000) });
    const j = await json(r); if (!r.ok) throw new Error(j.message || 'HTTP ' + r.status);
    return { ext_id: String(j.id), status: j.status === 'cancelled' ? 'cancelado' : ['paid', 'confirmed'].includes(j.status) ? 'pago' : 'pendente', buyer: (j.buyer && j.buyer.nickname) || 'Comprador ML',
      total: Number(j.total_amount || j.paid_amount || 0), items: (j.order_items || []).map((x) => ({ ext_item: String(x.item && x.item.id), qty: x.quantity, price: x.unit_price, title: x.item && x.item.title })) };
  }

  /* ================= Shopee (Open Platform v2) ================= */
  const shReady = () => { const s = getSettings(); return !!(s.shopee_partner_id && secret('shopee_partner_key') && s.shopee_shop_id && secret('shopee_access_token')); };
  function shSign(path, ts) { const s = getSettings(); return crypto.createHmac('sha256', secret('shopee_partner_key')).update(`${s.shopee_partner_id}${path}${ts}${secret('shopee_access_token')}${s.shopee_shop_id}`).digest('hex'); }
  function shUrl(path, extra = '') { const s = getSettings(), ts = Math.floor(Date.now() / 1000);
    return `${SH_API()}${path}?partner_id=${s.shopee_partner_id}&timestamp=${ts}&access_token=${encodeURIComponent(secret('shopee_access_token'))}&shop_id=${s.shopee_shop_id}&sign=${shSign(path, ts)}${extra}`; }
  async function shSetStock(itemId, qty) {
    const r = await fetch(shUrl('/api/v2/product/update_stock'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000),
      body: JSON.stringify({ item_id: Number(itemId), stock_list: [{ model_id: 0, seller_stock: [{ stock: Math.max(0, qty) }] }] }) });
    const j = await json(r); if (!r.ok || j.error) throw new Error(j.message || j.error || 'HTTP ' + r.status); return true;
  }
  // a Shopee assina o webhook: HMAC-SHA256(partner_key, url + '|' + corpo)
  const shVerify = (url, raw, sig) => { const k = secret('shopee_partner_key'); if (!k || !sig) return false; const h = crypto.createHmac('sha256', k).update(url + '|' + raw).digest('hex'); try { return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(String(sig))); } catch { return false; } };
  async function shOrder(sn) {
    const r = await fetch(shUrl('/api/v2/order/get_order_detail', `&order_sn_list=${encodeURIComponent(sn)}&response_optional_fields=item_list,total_amount,buyer_username,order_status`), { signal: AbortSignal.timeout(12000) });
    const j = await json(r); const o = j.response && j.response.order_list && j.response.order_list[0]; if (!o) throw new Error(j.message || 'pedido não encontrado');
    return { ext_id: String(o.order_sn), status: o.order_status === 'CANCELLED' ? 'cancelado' : ['UNPAID'].includes(o.order_status) ? 'pendente' : 'pago', buyer: o.buyer_username || 'Comprador Shopee',
      total: Number(o.total_amount || 0), items: (o.item_list || []).map((x) => ({ ext_item: String(x.item_id), qty: x.model_quantity_purchased, price: x.model_discounted_price || x.model_original_price, title: x.item_name })) };
  }

  /* ================= comum ================= */
  // registra um pedido do canal: baixa o estoque local (uma vez) e devolve se for cancelado
  function applyOrder(channel, o) {
    const field = channel === 'ml' ? 'ml_item_id' : 'shopee_item_id', label = channel === 'ml' ? 'Mercado Livre' : 'Shopee';
    const seen = db.prepare('SELECT * FROM channel_orders WHERE channel=? AND ext_id=?').get(channel, o.ext_id);
    const lines = o.items.map((x) => ({ ...x, p: db.prepare(`SELECT * FROM products WHERE ${field}=?`).get(x.ext_item) })).filter((x) => x.p);
    if (o.status === 'pago' && !seen) {
      const code = (channel === 'ml' ? 'ML' : 'SP') + o.ext_id.slice(-8);
      db.exec('BEGIN');
      try {
        for (const x of lines) db.prepare('UPDATE products SET stock=MAX(0, stock-?) WHERE id=?').run(x.qty, x.p.id);
        const items = lines.map((x) => ({ id: x.p.id, name: x.p.name, price: round2(x.price), qty: x.qty, options: {}, image: '' }));
        const sub = round2(items.reduce((a, i) => a + i.price * i.qty, 0));
        if (items.length) db.prepare(`INSERT INTO orders(code,customer,items,subtotal,discount,pix_discount,shipping,total,coupon,delivery_method,delivery,payment,installments,notes,status,channel)
          VALUES(?,?,?,?,0,0,0,?,'','delivery',?,'card',1,?,'confirmado','marketplace')`).run(code, JSON.stringify({ name: o.buyer, phone: '', email: '' }), JSON.stringify(items), sub, sub,
          JSON.stringify({ label: 'Enviado pelo ' + label }), `${label} · pedido ${o.ext_id}`);
        db.prepare('INSERT INTO channel_orders(channel,ext_id,order_code,status) VALUES(?,?,?,?)').run(channel, o.ext_id, items.length ? code : '', 'pago');
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      log(channel, 'venda', `${label} ${o.ext_id}: ${lines.map((x) => x.qty + 'x ' + x.p.name).join(', ') || 'sem produto vinculado'}`, true);
      return { applied: true, products: lines.map((x) => x.p.id) };
    }
    if (o.status === 'cancelado' && seen && seen.status === 'pago') {
      for (const x of lines) db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(x.qty, x.p.id);
      db.prepare("UPDATE channel_orders SET status='cancelado' WHERE channel=? AND ext_id=?").run(channel, o.ext_id);
      if (seen.order_code) db.prepare("UPDATE orders SET status='cancelado' WHERE code=?").run(seen.order_code);
      log(channel, 'cancelamento', `${label} ${o.ext_id}: estoque devolvido`, true);
      return { applied: true, products: lines.map((x) => x.p.id) };
    }
    return { applied: false };
  }
  // empurra o estoque atual para os canais (só o que mudou)
  async function syncProduct(p) {
    const out = [];
    if (p.ml_item_id && mlReady()) { try { await mlSetStock(p.ml_item_id, p.stock); out.push('ml'); } catch (e) { log('ml', 'estoque', `${p.name}: ${e.message}`, false); } }
    if (p.shopee_item_id && shReady()) { try { await shSetStock(p.shopee_item_id, p.stock); out.push('shopee'); } catch (e) { log('shopee', 'estoque', `${p.name}: ${e.message}`, false); } }
    if (out.length) { db.prepare('UPDATE products SET channel_stock=? WHERE id=?').run(p.stock, p.id); log(out.join('+'), 'estoque', `${p.name} → ${p.stock} un.`, true); }
    return out;
  }
  async function syncJob() {
    if (!mlReady() && !shReady()) return 0; let n = 0;
    for (const p of db.prepare("SELECT * FROM products WHERE (ml_item_id<>'' OR shopee_item_id<>'') AND (channel_stock IS NULL OR channel_stock<>stock)").all()) if ((await syncProduct(p)).length) n++;
    return n;
  }
  const status = () => ({ ml: { configured: !!getSettings().ml_client_id, connected: mlReady(), user_id: mlTok().user_id || null }, shopee: { connected: shReady() },
    linked: db.prepare("SELECT COUNT(*) n FROM products WHERE ml_item_id<>'' OR shopee_item_id<>''").get().n, log: db.prepare('SELECT * FROM channel_log ORDER BY id DESC LIMIT 30').all() });
  return { mlAuthUrl, mlCallback, mlOrder, mlReady, shReady, shVerify, shOrder, applyOrder, syncProduct, syncJob, status, mlSetStock, shSetStock };
};
