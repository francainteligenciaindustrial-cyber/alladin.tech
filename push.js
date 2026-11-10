// Notificações no celular (Web Push, padrão aberto: Chrome, Edge, Firefox, Android e iPhone com o site instalado)
// Implementação própria do RFC 8291 (aes128gcm) + VAPID (RFC 8292) usando só o módulo crypto do Node.
'use strict';
const crypto = require('crypto');

module.exports = function createPush({ db, getSettings, setSetting }) {
  db.exec(`CREATE TABLE IF NOT EXISTS push_subs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT UNIQUE NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
    customer_id INTEGER, orders TEXT DEFAULT '[]', offers INTEGER DEFAULT 1, fails INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')) );`);
  const b64u = (b) => Buffer.from(b).toString('base64url');
  const unb64u = (s) => Buffer.from(String(s), 'base64url');

  // chaves VAPID: geradas uma vez e guardadas
  function keys() {
    let s = getSettings();
    if (!s.vapid_public || !s.vapid_private) {
      const e = crypto.createECDH('prime256v1'); e.generateKeys();
      setSetting('vapid_public', b64u(e.getPublicKey())); setSetting('vapid_private', b64u(e.getPrivateKey()));
      s = getSettings();
    }
    return { pub: s.vapid_public, priv: s.vapid_private };
  }
  function vapidJwt(audience, subject) {
    const k = keys(), pub = unb64u(k.pub);
    const jwk = { kty: 'EC', crv: 'P-256', d: k.priv, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) };
    const key = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
    const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const body = b64u(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
    const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key, dsaEncoding: 'ieee-p1363' });
    return `${head}.${body}.${b64u(sig)}`;
  }
  // RFC 8291: criptografa o conteúdo para a assinatura do navegador
  function encrypt(sub, payload) {
    const uaPub = unb64u(sub.p256dh), authSecret = unb64u(sub.auth);
    const as = crypto.createECDH('prime256v1'); as.generateKeys();
    const asPub = as.getPublicKey(), shared = as.computeSecret(uaPub);
    const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32));
    const salt = crypto.randomBytes(16);
    const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
    const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
    const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
    const body = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
    const head = Buffer.alloc(21); salt.copy(head, 0); head.writeUInt32BE(4096, 16); head.writeUInt8(65, 20);
    return Buffer.concat([head, asPub, body]);
  }
  async function sendOne(sub, msg) {
    const url = new URL(sub.endpoint), s = getSettings();
    const jwt = vapidJwt(url.origin, 'mailto:' + (s.email || 'contato@aladdintech.com.br'));
    const r = await fetch(sub.endpoint, { method: 'POST', signal: AbortSignal.timeout(10000), body: encrypt(sub, JSON.stringify(msg)),
      headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: msg.urgent ? 'high' : 'normal', Authorization: `vapid t=${jwt}, k=${keys().pub}` } });
    if (r.status === 404 || r.status === 410) { db.prepare('DELETE FROM push_subs WHERE id=?').run(sub.id); return false; }
    if (!r.ok) { db.prepare('UPDATE push_subs SET fails=fails+1 WHERE id=?').run(sub.id); return false; }
    db.prepare('UPDATE push_subs SET fails=0 WHERE id=?').run(sub.id); return true;
  }
  const safeMsg = (m) => ({ title: String(m.title || '').slice(0, 80), body: String(m.body || '').slice(0, 220), url: /^\/[\w\-./?=&%#]*$/.test(m.url || '') ? m.url : '/', tag: m.tag || undefined, urgent: !!m.urgent });
  function subscribe(b, customerId) {
    const ep = String(b.endpoint || '');
    if (!/^https:\/\/[\w.-]+(:\d+)?\//.test(ep) || ep.length > 800) throw new Error('Assinatura inválida.');
    const p = String((b.keys || {}).p256dh || ''), a = String((b.keys || {}).auth || '');
    if (unb64u(p).length !== 65 || unb64u(a).length !== 16) throw new Error('Chaves inválidas.');
    const ex = db.prepare('SELECT * FROM push_subs WHERE endpoint=?').get(ep);
    const orders = new Set(ex ? JSON.parse(ex.orders || '[]') : []); if (b.order) orders.add(String(b.order).slice(0, 20));
    if (ex) db.prepare('UPDATE push_subs SET p256dh=?, auth=?, customer_id=COALESCE(?,customer_id), orders=?, offers=? WHERE id=?').run(p, a, customerId || null, JSON.stringify([...orders].slice(-20)), b.offers === false ? 0 : 1, ex.id);
    else db.prepare('INSERT INTO push_subs(endpoint,p256dh,auth,customer_id,orders,offers) VALUES(?,?,?,?,?,?)').run(ep, p, a, customerId || null, JSON.stringify([...orders]), b.offers === false ? 0 : 1);
    return true;
  }
  const unsubscribe = (endpoint) => db.prepare('DELETE FROM push_subs WHERE endpoint=?').run(String(endpoint || '')).changes;
  async function toList(list, msg) { let ok = 0; for (const s of list) if (await sendOne(s, safeMsg(msg)).catch(() => false)) ok++; return ok; }
  const toCustomer = (id, msg) => id ? toList(db.prepare('SELECT * FROM push_subs WHERE customer_id=?').all(id), msg) : Promise.resolve(0);
  const toOrder = (code, customerId, msg) => toList(db.prepare("SELECT * FROM push_subs WHERE (customer_id IS NOT NULL AND customer_id=?) OR orders LIKE ?").all(customerId || -1, `%"${code}"%`), msg);
  const broadcast = (msg) => toList(db.prepare('SELECT * FROM push_subs WHERE offers=1 AND fails<5').all(), msg);
  const count = () => db.prepare('SELECT COUNT(*) n, SUM(offers) offers FROM push_subs').get();
  return { publicKey: () => keys().pub, subscribe, unsubscribe, toCustomer, toOrder, broadcast, count, encrypt, vapidJwt };
};
