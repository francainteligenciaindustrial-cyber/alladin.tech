/* Aladdin Tech — servidor da loja (API + arquivos estáticos)
 * Banco: SQLite embutido do Node (node:sqlite), arquivo em ./data/loja.db
 *        ou Supabase (Postgres) na nuvem (Vercel) — ver db.js e pg-compat.js
 */
// na Vercel o relógio é UTC: datas e horários seguem o fuso da loja (Cuiabá, UTC−4)
if (process.env.VERCEL && !process.env.TZ_KEEP) process.env.TZ = process.env.STORE_TZ || 'America/Cuiaba';
const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const store = require('./db');
const jobs = require('./jobs');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!store.REMOTE_DB || !store.SERVERLESS) for (const d of [DATA_DIR, UPLOAD_DIR, path.join(UPLOAD_DIR, 'produtos'), path.join(UPLOAD_DIR, 'avaliacoes'), path.join(UPLOAD_DIR, 'loja'), path.join(UPLOAD_DIR, 'clientes')]) fs.mkdirSync(d, { recursive: true });

const db = store.openDb(path.join(DATA_DIR, 'loja.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;
PRAGMA cache_size = -16000;
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
  icon TEXT DEFAULT 'acessorios', sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, category_id INTEGER,
  brand TEXT DEFAULT '', condition TEXT DEFAULT 'Novo', short TEXT DEFAULT '', description TEXT DEFAULT '',
  price REAL NOT NULL DEFAULT 0, old_price REAL DEFAULT 0, stock INTEGER DEFAULT 0,
  images TEXT DEFAULT '[]', specs TEXT DEFAULT '[]', options TEXT DEFAULT '[]',
  featured INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, type TEXT NOT NULL DEFAULT 'percent', value REAL DEFAULT 0,
  min_order REAL DEFAULT 0, max_uses INTEGER DEFAULT 0, uses INTEGER DEFAULT 0, expires_at TEXT DEFAULT '',
  description TEXT DEFAULT '', active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, customer TEXT, items TEXT, subtotal REAL, discount REAL,
  pix_discount REAL DEFAULT 0, shipping REAL, total REAL, coupon TEXT DEFAULT '', delivery_method TEXT, delivery TEXT,
  payment TEXT, installments INTEGER DEFAULT 1, notes TEXT DEFAULT '', status TEXT DEFAULT 'novo',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER, name TEXT NOT NULL, city TEXT DEFAULT '', rating INTEGER NOT NULL,
  comment TEXT NOT NULL, approved INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, name TEXT NOT NULL, question TEXT NOT NULL,
  answer TEXT DEFAULT '', answered_by TEXT DEFAULT '', answered_at TEXT DEFAULT '', public INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'seller', active INTEGER DEFAULT 1, must_change INTEGER DEFAULT 0,
  last_login TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL, ip TEXT DEFAULT '', ua TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_name TEXT, action TEXT, detail TEXT DEFAULT '', ip TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT );
`);

// migrações (colunas novas em bancos existentes)
const colCache = new Map();
function addCol(table, col, def) {
  if (!colCache.has(table)) colCache.set(table, new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)));
  const cols = colCache.get(table);
  if (!cols.has(col)) { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); cols.add(col); return true; }
  return false;
}
[['promo_price', 'REAL DEFAULT 0'], ['promo_start', "TEXT DEFAULT ''"], ['promo_end', "TEXT DEFAULT ''"], ['sku', "TEXT DEFAULT ''"],
  ['cost', 'REAL DEFAULT 0'], ['warranty', "TEXT DEFAULT ''"], ['updated_at', "TEXT DEFAULT ''"]].forEach(([c, d]) => addCol('products', c, d));
[['title', "TEXT DEFAULT ''"], ['photos', "TEXT DEFAULT '[]'"], ['verified', 'INTEGER DEFAULT 0'], ['helpful', 'INTEGER DEFAULT 0'],
  ['reply', "TEXT DEFAULT ''"], ['reply_at', "TEXT DEFAULT ''"], ['order_code', "TEXT DEFAULT ''"]].forEach(([c, d]) => addCol('reviews', c, d));
db.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT DEFAULT '',
  password TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS customer_sessions ( token_hash TEXT PRIMARY KEY, customer_id INTEGER NOT NULL, expires INTEGER NOT NULL );
`);
addCol('orders', 'customer_id', 'INTEGER');
addCol('orders', 'pay_status', "TEXT DEFAULT ''");
addCol('orders', 'pay_id', "TEXT DEFAULT ''");
addCol('orders', 'pay_url', "TEXT DEFAULT ''");
addCol('reviews', 'customer_id', 'INTEGER');
addCol('questions', 'customer_id', 'INTEGER');
[['avatar', "TEXT DEFAULT ''"], ['cover', "TEXT DEFAULT ''"], ['email_verified', 'INTEGER DEFAULT 0'], ['marketing', 'INTEGER DEFAULT 0'],
  ['unsub_token', "TEXT DEFAULT ''"], ['city', "TEXT DEFAULT ''"], ['uf', "TEXT DEFAULT ''"], ['bio', "TEXT DEFAULT ''"]].forEach(([c, d]) => addCol('customers', c, d));
addCol('orders', 'tracking', "TEXT DEFAULT ''");
[['ncm', "TEXT DEFAULT ''"], ['weight_kg', 'REAL DEFAULT 0'], ['width_cm', 'REAL DEFAULT 0'], ['height_cm', 'REAL DEFAULT 0'], ['length_cm', 'REAL DEFAULT 0']].forEach(([c, d]) => addCol('products', c, d));
[['nfe_status', "TEXT DEFAULT ''"], ['nfe_ref', "TEXT DEFAULT ''"], ['nfe_key', "TEXT DEFAULT ''"], ['nfe_number', "TEXT DEFAULT ''"], ['nfe_danfe', "TEXT DEFAULT ''"],
  ['nfe_xml', "TEXT DEFAULT ''"], ['nfe_error', "TEXT DEFAULT ''"]].forEach(([c, d]) => addCol('orders', c, d));
/* ranking de vendedores */
{
  const newRank = addCol('users', 'in_ranking', 'INTEGER DEFAULT 0');
  [['photo', "TEXT DEFAULT ''"], ['whatsapp', "TEXT DEFAULT ''"], ['title', "TEXT DEFAULT ''"], ['ref_code', "TEXT DEFAULT ''"], ['goal', 'REAL DEFAULT 0']].forEach(([c, d]) => addCol('users', c, d));
  if (newRank) db.exec("UPDATE users SET in_ranking=1 WHERE role='seller'");
  addCol('users', 'email', "TEXT DEFAULT ''");
  addCol('users', 'customer_id', 'INTEGER');
  addCol('orders', 'doc_token', "TEXT DEFAULT ''");
  addCol('products', 'warranty_months', 'INTEGER DEFAULT 0');
  // seminovos: ficha completa
  [['grade', "TEXT DEFAULT ''"], ['battery_health', 'INTEGER DEFAULT 0'], ['imei_checked', 'INTEGER DEFAULT 0'], ['real_photos', 'INTEGER DEFAULT 0'],
    ['used_notes', "TEXT DEFAULT ''"], ['included', "TEXT DEFAULT ''"]].forEach(([c, d]) => addCol('products', c, d));
  // indique e ganhe + cupom pessoal + reserva
  [['ref_code', "TEXT DEFAULT ''"], ['referred_by', 'INTEGER'], ['referral_rewarded', 'INTEGER DEFAULT 0']].forEach(([c, d]) => addCol('customers', c, d));
  addCol('coupons', 'customer_id', 'INTEGER');
  addCol('orders', 'reserve_until', "TEXT DEFAULT ''");
  addCol('orders', 'kind', "TEXT DEFAULT ''");   // '' = venda normal · 'sinal' = sinal de pré-venda
  addCol('products', 'videos', "TEXT DEFAULT '[]'");
  addCol('customers', 'birthday', "TEXT DEFAULT ''");
  [['track_units', 'INTEGER DEFAULT 0'], ['ml_item_id', "TEXT DEFAULT ''"], ['shopee_item_id', "TEXT DEFAULT ''"], ['channel_stock', 'INTEGER']].forEach(([c, d]) => addCol('products', c, d));
  addCol('orders', 'cashback_used', 'REAL DEFAULT 0');
  addCol('products', 'gtin', "TEXT DEFAULT ''");
  addCol('products', 'sold_base', 'INTEGER DEFAULT 0');   // vendas reais feitas antes do site (histórico da loja)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, approved);
    CREATE INDEX IF NOT EXISTS idx_questions_product ON questions(product_id);
    CREATE INDEX IF NOT EXISTS idx_products_cat ON products(active, category_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires);
    CREATE INDEX IF NOT EXISTS idx_csessions_exp ON customer_sessions(expires);`);
  [['coming_soon', 'INTEGER DEFAULT 0'], ['coming_eta', "TEXT DEFAULT ''"], ['preorder_deposit', 'REAL DEFAULT 0'], ['preorder_units', 'INTEGER DEFAULT 0']].forEach(([c, d]) => addCol('products', c, d));
  db.exec('CREATE TABLE IF NOT EXISTS staff_tokens ( token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL )');
  // comissões: regras e fechamentos (visíveis só para o Dono)
  db.exec(`CREATE TABLE IF NOT EXISTS commission_config ( id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL DEFAULT '{}', updated_at TEXT DEFAULT '', updated_by TEXT DEFAULT '' );
    CREATE TABLE IF NOT EXISTS commission_payouts ( month TEXT NOT NULL, user_id INTEGER NOT NULL, amount REAL NOT NULL, base REAL NOT NULL, orders INTEGER NOT NULL,
      paid_at TEXT DEFAULT (datetime('now','localtime')), paid_by TEXT DEFAULT '', note TEXT DEFAULT '', PRIMARY KEY (month, user_id) );`);
  [['seller_id', 'INTEGER'], ['channel', "TEXT DEFAULT 'site'"], ['seller_source', "TEXT DEFAULT ''"]].forEach(([c, d]) => addCol('orders', c, d));
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id, created_at)');
}
db.exec(`
CREATE TABLE IF NOT EXISTS carts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT UNIQUE NOT NULL, customer_id INTEGER, email TEXT DEFAULT '', name TEXT DEFAULT '', phone TEXT DEFAULT '',
  consent INTEGER DEFAULT 0, items TEXT DEFAULT '[]', subtotal REAL DEFAULT 0, status TEXT DEFAULT 'aberto', reminders INTEGER DEFAULT 0,
  last_reminder_at TEXT DEFAULT '', recovered_clicks INTEGER DEFAULT 0, order_code TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_carts_status ON carts(status, updated_at);
`);
db.exec(`
CREATE TABLE IF NOT EXISTS customer_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL, label TEXT DEFAULT 'Casa', recipient TEXT DEFAULT '',
  cep TEXT, street TEXT, number TEXT, complement TEXT DEFAULT '', district TEXT, city TEXT, uf TEXT,
  lat REAL, lng REAL, is_default INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS customer_tokens ( token_hash TEXT PRIMARY KEY, customer_id INTEGER NOT NULL, type TEXT NOT NULL, expires INTEGER NOT NULL, data TEXT DEFAULT '' );
CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT, to_addr TEXT, subject TEXT, html TEXT, kind TEXT, status TEXT, error TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS wishlist (
  customer_id INTEGER NOT NULL, product_id INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (customer_id, product_id)
);
CREATE TABLE IF NOT EXISTS price_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, email TEXT NOT NULL, customer_id INTEGER,
  type TEXT NOT NULL DEFAULT 'price', base_price REAL DEFAULT 0, active INTEGER DEFAULT 1, token TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')), notified_at TEXT DEFAULT ''
);
`);

/* ---------- utilidades ---------- */
const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item';
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) =>
  salt + ':' + crypto.scryptSync(String(pw), salt, 64).toString('hex');
const checkPw = (pw, stored) => {
  const [salt, h] = String(stored || '').split(':');
  if (!salt || !h) { crypto.scryptSync(String(pw), 'dummy-salt', 64); return false; }
  const test = crypto.scryptSync(String(pw), salt, 64);
  const ref = Buffer.from(h, 'hex');
  return ref.length === test.length && crypto.timingSafeEqual(test, ref);
};
const COMMON_PW = new Set(['12345678a', 'a12345678', 'a1234567', 'abc12345', 'abcd1234', 'qwerty123', 'qwerty12', 'password1', 'passw0rd', 'senha123', 'senha1234', 'senha12345',
  'mudar123', 'admin123', 'admin1234', 'aladdin123', 'aladdin2026', 'aladdin1', 'iphone123', 'iphone12', 'brasil123', 'brasil2026', 'teste123', 'teste1234', '123mudar', 'abc123456',
  'q1w2e3r4', '1q2w3e4r', '1q2w3e4r5t', 'trocar123', 'loja1234', 'apple123', 'mudar1234', 'senha2026', 'flamengo1', 'corinthians1']);
const strongPw = (pw) => typeof pw === 'string' && pw.length >= 8 && pw.length <= 128 && /[a-zA-Z]/.test(pw) && /\d/.test(pw) && !COMMON_PW.has(pw.toLowerCase());
const localNow = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function getSettings() {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = J(r.value, r.value);
  return out;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
}
function uniqueSlug(table, base, ignoreId = 0) {
  let slug = slugify(base), i = 2;
  while (db.prepare(`SELECT id FROM ${table} WHERE slug=? AND id<>?`).get(slug, ignoreId)) slug = slugify(base) + '-' + i++;
  return slug;
}

/* preço efetivo (promoção agendada) */
function promoActive(p) {
  if (!(p.promo_price > 0 && p.promo_price < p.price)) return false;
  const now = localNow();
  if (p.promo_start && now < p.promo_start) return false;
  if (p.promo_end && now > p.promo_end) return false;
  return true;
}
const effectivePrice = (p) => (promoActive(p) ? p.promo_price : p.price);
/* vendas por produto ("+100 vendidos", "Mais vendido") — só pedidos efetivados; cache curto e invalidado a cada alteração */
const SOLD_STATUSES = ['confirmado', 'separando', 'enviado', 'pronto', 'entregue'];
const BEST_MIN = 3; // mínimo de vendas para receber o selo "Mais vendido"
const SOLD_STEPS = [5, 10, 25, 50, 100, 150, 200, 300, 500, 1000, 2000, 5000, 10000, 50000];
const soldLabel = (n) => { let x = 0; for (const t of SOLD_STEPS) if (n >= t) x = t; return x ? '+' + x.toLocaleString('pt-BR') + ' vendido' + (x > 1 ? 's' : '') : ''; };
let salesCache = { t: 0, data: null };
function salesStats() {
  if (salesCache.data && Date.now() - salesCache.t < 60000) return salesCache.data;
  const total = new Map(), recent = new Map(), since = Date.now() - 90 * 864e5;
  const rows = db.prepare(`SELECT items, created_at FROM orders WHERE status IN (${SOLD_STATUSES.map(() => '?').join(',')}) AND COALESCE(kind,'')<>'sinal'`).all(...SOLD_STATUSES);
  for (const o of rows) {
    const ts = Date.parse(String(o.created_at || '').replace(' ', 'T'));
    for (const i of J(o.items, [])) {
      const id = parseInt(i.id), q = Math.max(0, parseInt(i.qty) || 0); if (!id || !q) continue;
      total.set(id, (total.get(id) || 0) + q); if (ts >= since) recent.set(id, (recent.get(id) || 0) + q);
    }
  }
  const byId = new Map(), byCat = new Map();
  for (const p of db.prepare('SELECT p.id, p.category_id, p.sold_base, c.name cat, c.slug cat_slug FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.active=1').all()) {
    const sold = (total.get(p.id) || 0) + (p.sold_base || 0), r90 = recent.get(p.id) || 0;
    byId.set(p.id, { sold, recent: r90, score: r90 * 3 + sold, cat: p.cat || '', cat_slug: p.cat_slug || '', rank: 0 });
    if (!byCat.has(p.category_id)) byCat.set(p.category_id, []); byCat.get(p.category_id).push(p.id);
  }
  for (const ids of byCat.values()) ids.filter((id) => byId.get(id).sold >= BEST_MIN)
    .sort((a, b) => byId.get(b).score - byId.get(a).score || byId.get(b).sold - byId.get(a).sold).forEach((id, i) => { byId.get(id).rank = i + 1; });
  salesCache = { t: Date.now(), data: byId };
  return byId;
}
function productPublic(p) {
  if (!p) return p;
  if (typeof p.videos === 'string') p = { ...p, videos: J(p.videos, []) };
  const promo = promoActive(p);
  const out = {
    ...p, images: J(p.images, []), specs: J(p.specs, []), options: J(p.options, []), featured: !!p.featured, active: !!p.active,
    promo, promo_end: promo ? p.promo_end : '', price: promo ? p.promo_price : p.price,
    old_price: promo ? Math.max(p.old_price || 0, p.price) : p.old_price
  };
  delete out.cost; delete out.promo_price; delete out.promo_start;
  // dados internos nunca vão para a vitrine
  ['sold_base', 'channel_stock', 'ml_item_id', 'shopee_item_id', 'track_units', 'ncm'].forEach((k) => delete out[k]);
  const st = p.id ? salesStats().get(p.id) : null;
  out.sold_label = st ? soldLabel(st.sold) : '';
  out.best_rank = st && st.rank && st.rank <= 5 ? st.rank : 0;
  out.best_cat = out.best_rank ? st.cat : ''; out.best_cat_slug = out.best_rank ? st.cat_slug : '';
  return out;
}
function productAdmin(p) {
  return { ...p, videos: J(p.videos, []), images: J(p.images, []), specs: J(p.specs, []), options: J(p.options, []), featured: !!p.featured,
    active: !!p.active, promo_active: promoActive(p) };
}

/* imagens: valida pelo conteúdo (assinatura), não pela extensão declarada */
function saveImage(dataUrl, sub, maxBytes) {
  const m = /^data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Imagem inválida.');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > maxBytes) throw new Error(`Imagem muito grande (máx. ${Math.round(maxBytes / 1048576)} MB).`);
  let ext = null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) ext = 'jpg';
  else if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ext = 'png';
  else if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') ext = 'webp';
  if (!ext) throw new Error('Formato não suportado. Use JPG, PNG ou WEBP.');
  const name = Date.now().toString(36) + crypto.randomBytes(6).toString('hex') + '.' + ext;
  if (store.REMOTE_FILES) return store.blobPut(`uploads/${sub}/${name}`, buf, ext === 'jpg' ? 'image/jpeg' : 'image/' + ext);
  fs.writeFileSync(path.join(UPLOAD_DIR, sub, name), buf);
  return `/uploads/${sub}/${name}`;
}
const isUpload = (u) => typeof u === 'string' && (u.startsWith('/uploads/') || store.BLOB_URL_RE.test(u));
function deleteUpload(url) {
  if (typeof url === 'string' && store.BLOB_URL_RE.test(url)) return store.blobDel(url);
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return;
  const f = path.normalize(path.join(__dirname, 'public', url));
  if (f.startsWith(UPLOAD_DIR)) { fs.rm(f, { force: true }, () => {}); fs.rm(f.replace(/\.(jpe?g|png)$/i, '.webp'), { force: true }, () => {}); }
}

/* limitador de requisições em memória */
const hits = new Map();
function allow(key, max, windowMs) {
  const now = Date.now(), h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return true; }
  h.n++; return h.n <= max;
}
jobs.every('limpa-limitador', 60000, () => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); });
const ipOf = (req) => req.ip || req.socket.remoteAddress || '';
function limit(name, max, windowMs, msg) {
  return (req, res, next) => allow(name + ':' + ipOf(req), max, windowMs) ? next()
    : res.status(429).json({ error: msg || 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
}

/* ---------- dados iniciais ---------- */
const DEFAULT_SETTINGS = {
  store_name: 'Aladdin Tech', tagline: 'Referência em Upgrade', whatsapp: '5500000000000', phone_display: '(00) 00000-0000',
  instagram: 'aladdintech.br', email: 'contato@aladdintech.com.br', address: 'Av. São Benedito, 704 — São Sebastião', city: 'Barra do Bugres — MT',
  cep: '78390-000', map_query: '-15.072278,-57.180550',
  hours: [{ days: 'Segunda a Sexta', time: '09h às 19h' }, { days: 'Sábado', time: '09h às 14h' }, { days: 'Domingo', time: 'Fechado' }],
  open_hours: { weekdays: [9, 19], saturday: [9, 14], sunday: null },
  announcement: 'Entrega grátis em toda a região · 5% OFF no Pix · Parcele em até 12x',
  pix_discount: 5, max_installments: 12, installments_no_interest: 10,
  pickup_enabled: true, pickup_eta: 'Pronto para retirada em até 1 hora', free_shipping_above: 3000,
  store_uf: 'MT',
  ranking_public: true, ranking_metric: 'valor', ranking_show_values: false, ranking_prize: '',
  warranty_new_months: 12, warranty_used_months: 3, warranty_terms: '',
  ga4_id: '', meta_pixel_id: '',
  wa_provider: '', wa_notify: true, wa_token: '', wa_phone_id: '', wa_template: '', wa_template_lang: 'pt_BR', zapi_instance: '', zapi_token: '', zapi_client_token: '',
  referral_enabled: true, referral_friend_pct: 5, referral_reward_value: 50, referral_min_order: 300,
  reserve_enabled: true, reserve_hours: 24,
  google_places_key: '', google_place_id: '',
  ml_client_id: '', ml_client_secret: '', ml_tokens: '', ml_oauth_state: '', shopee_partner_id: '', shopee_partner_key: '', shopee_shop_id: '', shopee_access_token: '',
  about_story: 'A Aladdin Tech nasceu em Barra do Bugres com uma ideia simples: tecnologia premium com procedência, preço justo e um atendimento que faz a diferença.\nHoje somos referência em upgrade na região — novos e seminovos selecionados, o seu usado valendo como parte do pagamento e uma loja que não fecha: atendemos 24 horas, todos os dias.',
  about_stats: [], about_timeline: [], reclameaqui_url: '', reclameaqui_score: '',
  club_enabled: true, club_pct_silver: 2, club_pct_gold: 3, club_pct_diamond: 5, club_gold_at: 5000, club_diamond_at: 15000, club_expiry_days: 180, club_max_use_pct: 30, club_birthday_value: 50,
  reminders_enabled: true, reminders_whatsapp: false,
  trade_enabled: true, trade_pct_a: 60, trade_pct_b: 50, trade_pct_c: 40, trade_months: 12, trade_window_days: 90, trade_categories: 'iphone', trade_min_price: 2000, trade_only_new: true,
  delivery_zones: DEFAULT_ZONES(),
  consultants: [
    { name: 'Thiago', role: 'Especialista Apple', whatsapp: '' },
    { name: 'Equipe Aladdin', role: 'Vendas & Upgrade', whatsapp: '' },
    { name: 'Pós-venda', role: 'Pedidos & Garantia', whatsapp: '' }
  ],
  warranty_text: 'Garantia de 1 ano Apple em aparelhos novos e 90 dias em seminovos.',
  reviews_moderation: true,
  team_photo: '',
  team_text: 'Especialistas apaixonados por tecnologia, prontos para encontrar o upgrade certo para você.',
  team_members: [],
  wall_photos: [],
  wall_text: 'Cada upgrade merece um registro. Esse é o nosso cantinho favorito da loja — e o seu também.',
  hero_left: '',
  hero_right: '',
  ceo_name: '',
  ceo_title: 'Fundador & CEO',
  ceo_quote: '',
  legal_name: '', cnpj: '', dpo_email: '', policies_updated: '2026-11-08',
  always_open: true,
  faq: [],
  ceo_text: 'Toda lâmpada precisa de alguém que acredite no que existe dentro dela. A Aladdin Tech nasceu da visão do nosso fundador: transformar a compra de tecnologia em uma experiência de confiança, proximidade e realização. Cada cliente atendido, cada upgrade entregue e cada sorriso registrado no nosso mural carregam um pouco dessa visão. Esta página é a nossa forma de dizer obrigado.',
  online_payments: false,
  mp_access_token: '',
  mp_webhook_secret: '',
  smtp_host: '', smtp_port: 587, smtp_secure: false, smtp_user: '', smtp_pass: '',
  mail_from: '', mail_from_name: 'Aladdin Tech',
  require_email_verification: true,
  shipping_provider: 'fixo', me_token: '', me_sandbox: false, shipping_markup: 0, handling_days: 1, shipping_services: '',
  nfe_enabled: false, nfe_auto: true, focus_token: '', nfe_env: 'homologacao', nfe_natureza: 'Venda de mercadoria',
  nfe_cfop_in: '5102', nfe_cfop_out: '6108', nfe_csosn: '102', nfe_pis_cst: '07', nfe_cofins_cst: '07', nfe_icms_origem: '0', nfe_ncm_default: '85171300',
  cart_recovery: true, cart_delay_hours: 1, cart_second_hours: 24, cart_coupon: ''
};
function DEFAULT_ZONES() {
  return [
    { name: 'Entrega grátis na região', fee: 0, eta: 'Em até 2 dias úteis', scope: 'estado', values: '' },
    { name: 'Correios — PAC', fee: 39.9, eta: '5 a 12 dias úteis', scope: 'brasil', values: '' },
    { name: 'Correios — SEDEX', fee: 69.9, eta: '2 a 5 dias úteis', scope: 'brasil', values: '' }
  ];
}
/* regra de frete: qual opção vale para qual endereço */
const normTxt = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
function zoneMatches(z, addr, s) {
  const scope = z.scope || 'brasil';
  const vals = String(z.values || '').split(',').map(normTxt).filter(Boolean);
  if (scope === 'brasil') return true;
  if (scope === 'estado') return (vals.length ? vals : [normTxt(s.store_uf)]).filter(Boolean).includes(normTxt(addr.uf));
  if (scope === 'cidade') return vals.includes(normTxt(addr.city));
  return false;
}
const SECRET_KEYS = ['ml_client_secret', 'ml_tokens', 'ml_oauth_state', 'shopee_partner_key', 'shopee_access_token', 'vapid_private', 'google_places_key', 'admin_password', 'mp_access_token', 'mp_webhook_secret', 'smtp_pass', 'me_token', 'focus_token', 'wa_token', 'zapi_token', 'zapi_client_token'];
const OWNER_KEYS = ['mp_access_token', 'mp_webhook_secret', 'online_payments', 'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'mail_from', 'mail_from_name',
  'shipping_provider', 'me_token', 'me_sandbox', 'nfe_enabled', 'nfe_auto', 'focus_token', 'nfe_env', 'nfe_natureza', 'nfe_cfop_in', 'nfe_cfop_out',
  'nfe_csosn', 'nfe_pis_cst', 'nfe_cofins_cst', 'nfe_icms_origem', 'nfe_ncm_default',
  'ml_client_id', 'ml_client_secret', 'ml_tokens', 'shopee_partner_id', 'shopee_partner_key', 'shopee_shop_id', 'shopee_access_token',
  'google_places_key', 'google_place_id', 'wa_provider', 'wa_token', 'wa_phone_id', 'wa_template', 'wa_template_lang', 'zapi_instance', 'zapi_token', 'zapi_client_token'];
const mask = (v) => v ? '••••••••' + String(v).slice(-4) : '';
const UPLOAD_URL = (u) => typeof u === 'string' && (/^\/uploads\/[a-z]+\/[a-z0-9]+\.(jpg|png|webp)$/.test(u) || store.BLOB_URL_RE.test(u));

(function seed() {
  const s = getSettings();
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) if (!(k in s)) setSetting(k, v);
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c === 0) {
    // migra a senha antiga (se existir) para o usuário dono
    // na nuvem nunca existe senha padrão conhecida: usa ADMIN_INITIAL_PASSWORD ou gera uma aleatória (aparece só no log privado da Vercel)
    let initial = 'aladdin2026';
    if (store.SERVERLESS) {
      initial = process.env.ADMIN_INITIAL_PASSWORD || ('Aladdin-' + crypto.randomBytes(6).toString('base64url'));
      if (!process.env.ADMIN_INITIAL_PASSWORD) console.log('Senha provisória do usuário admin: ' + initial);
    }
    db.prepare('INSERT INTO users(name,username,password,role,must_change) VALUES(?,?,?,?,1)')
      .run('Dono', 'admin', s.admin_password || hashPw(initial), 'owner');
  }
  if (db.prepare('SELECT COUNT(*) c FROM categories').get().c === 0) {
    const cats = [['iPhone', 'iphone', 'iphone'], ['MacBook', 'macbook', 'macbook'], ['iPad', 'ipad', 'ipad'],
      ['Apple Watch', 'apple-watch', 'watch'], ['AirPods & iPod', 'airpods', 'airpods'], ['JBL', 'jbl', 'jbl'],
      ['PlayStation', 'playstation', 'playstation'], ['Acessórios', 'acessorios', 'acessorios']];
    const st = db.prepare('INSERT INTO categories(name,slug,icon,sort) VALUES(?,?,?,?)');
    cats.forEach((c, i) => st.run(c[0], c[1], c[2], i));
  }
  if (db.prepare('SELECT COUNT(*) c FROM products').get().c === 0) {
    const cat = (slug) => db.prepare('SELECT id FROM categories WHERE slug=?').get(slug).id;
    const P = [
      ['iPhone 17 Pro Max', 'iphone', 'Apple', 'Novo', 'Titânio. Chip A19 Pro. A câmera mais avançada.', 10499, 11299, 4, 1,
        [['Tela', '6,9" Super Retina XDR ProMotion'], ['Chip', 'A19 Pro'], ['Câmera', 'Sistema Pro 48 MP triplo'], ['Garantia', '1 ano Apple']],
        [{ name: 'Armazenamento', values: ['256 GB', '512 GB', '1 TB'] }, { name: 'Cor', values: ['Laranja Cósmico', 'Azul Profundo', 'Prata'] }]],
      ['iPhone 17', 'iphone', 'Apple', 'Novo', 'Tela ProMotion 120 Hz. Mais brilho, mais bateria.', 7299, 7999, 6, 1,
        [['Tela', '6,3" Super Retina XDR'], ['Chip', 'A19'], ['Câmera', 'Dupla 48 MP'], ['Garantia', '1 ano Apple']],
        [{ name: 'Armazenamento', values: ['256 GB', '512 GB'] }, { name: 'Cor', values: ['Branco', 'Preto', 'Lavanda', 'Sálvia'] }]],
      ['iPhone 16', 'iphone', 'Apple', 'Novo', 'Botão de Ação, Controle da Câmera e Apple Intelligence.', 5499, 5999, 8, 0,
        [['Tela', '6,1" Super Retina XDR'], ['Chip', 'A18'], ['Garantia', '1 ano Apple']],
        [{ name: 'Armazenamento', values: ['128 GB', '256 GB'] }, { name: 'Cor', values: ['Preto', 'Branco', 'Ultramarino'] }]],
      ['iPhone 15 Pro — Seminovo', 'iphone', 'Apple', 'Seminovo', 'Revisado, bateria acima de 88%, com garantia Aladdin.', 4299, 4999, 3, 0,
        [['Tela', '6,1" ProMotion'], ['Chip', 'A17 Pro'], ['Bateria', 'Acima de 88%'], ['Garantia', '90 dias Aladdin']],
        [{ name: 'Armazenamento', values: ['128 GB', '256 GB'] }]],
      ['MacBook Air 13" M4', 'macbook', 'Apple', 'Novo', 'Leve como sempre. Mais rápido do que nunca.', 9299, 9999, 3, 1,
        [['Chip', 'Apple M4'], ['Memória', '16 GB unificada'], ['SSD', '256 GB'], ['Bateria', 'Até 18 h']], [{ name: 'Cor', values: ['Azul Céu', 'Prateado', 'Meia-noite'] }]],
      ['iPad Air 11" M3', 'ipad', 'Apple', 'Novo', 'Potência do M3 em um design fino e versátil.', 5799, 6299, 4, 0,
        [['Tela', '11" Liquid Retina'], ['Chip', 'Apple M3'], ['Conexão', 'Wi-Fi 6E']], [{ name: 'Armazenamento', values: ['128 GB', '256 GB'] }]],
      ['Apple Watch Series 11', 'apple-watch', 'Apple', 'Novo', 'Seu parceiro de saúde mais completo.', 3999, 4499, 5, 1,
        [['Caixa', 'Alumínio 46 mm'], ['Saúde', 'ECG, oxigênio no sangue, sono'], ['Resistência', 'Água até 50 m']],
        [{ name: 'Tamanho', values: ['42 mm', '46 mm'] }, { name: 'Cor', values: ['Preto Brilhante', 'Prateado', 'Ouro Rosa'] }]],
      ['AirPods Pro 3', 'airpods', 'Apple', 'Novo', 'Cancelamento ativo de ruído de outro nível.', 2499, 2799, 10, 1,
        [['Cancelamento', 'Ativo de ruído'], ['Áudio', 'Espacial personalizado'], ['Estojo', 'USB‑C com MagSafe']], []],
      ['JBL Charge 6', 'jbl', 'JBL', 'Novo', 'Som potente, à prova d’água e com power bank.', 1299, 1499, 7, 1,
        [['Bateria', 'Até 24 h'], ['Proteção', 'IP68'], ['Conexão', 'Bluetooth 5.4']], [{ name: 'Cor', values: ['Preto', 'Azul', 'Vermelho'] }]],
      ['JBL Flip 7', 'jbl', 'JBL', 'Novo', 'Portátil, robusta e com graves profundos.', 849, 999, 9, 0,
        [['Bateria', 'Até 14 h'], ['Proteção', 'IP68']], [{ name: 'Cor', values: ['Preto', 'Azul', 'Camuflado'] }]],
      ['PlayStation 5 Pro', 'playstation', 'Sony', 'Novo', 'Gráficos mais nítidos e taxas de quadros mais altas.', 6299, 6999, 2, 1,
        [['Armazenamento', 'SSD 2 TB'], ['Resolução', 'Até 8K'], ['Inclui', 'Controle DualSense']], []],
      ['PlayStation 5 Slim', 'playstation', 'Sony', 'Novo', 'Velocidade de carregamento ultrarrápida.', 3899, 4299, 5, 0,
        [['Armazenamento', 'SSD 1 TB'], ['Versão', 'Com leitor de disco']], [{ name: 'Versão', values: ['Mídia física', 'Digital'] }]],
      ['Carregador USB‑C 20W Apple', 'acessorios', 'Apple', 'Novo', 'Carregamento rápido original.', 199, 249, 30, 0, [['Potência', '20 W']], []],
      ['Capa MagSafe Silicone', 'acessorios', 'Apple', 'Novo', 'Toque macio, encaixe perfeito.', 299, 399, 25, 0,
        [['Compatível', 'iPhone 16 e 17']], [{ name: 'Cor', values: ['Preto', 'Pedra', 'Azul'] }]]
    ];
    const st = db.prepare(`INSERT INTO products(name,slug,category_id,brand,condition,short,description,price,old_price,stock,featured,specs,options)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const p of P) st.run(p[0], uniqueSlug('products', p[0]), cat(p[1]), p[2], p[3], p[4],
      p[4] + ' Produto com nota fiscal, procedência garantida e atendimento especializado Aladdin Tech.',
      p[5], p[6], p[7], p[8], JSON.stringify(p[9].map(([k, v]) => ({ k, v }))), JSON.stringify(p[10]));
  }
  if (db.prepare('SELECT COUNT(*) c FROM coupons').get().c === 0) {
    db.prepare(`INSERT INTO coupons(code,type,value,min_order,description) VALUES
      ('BEMVINDO','percent',5,500,'5% na primeira compra'), ('FRETEGRATIS','freeship',0,1000,'Frete grátis acima de R$ 1.000')`).run();
  }
  if (db.prepare('SELECT COUNT(*) c FROM reviews').get().c === 0) {
    db.prepare(`INSERT INTO reviews(product_id,name,city,rating,comment,approved) VALUES(NULL,?,?,5,?,1)`)
      .run('Cliente Aladdin', '', 'Obrigada de verdade! Superou minhas expectativas! Obrigada pelo ótimo atendimento e pela atenção, os meninos também foram incríveis!');
  }
})();

// categoria Bicicletas elétricas (adicionada depois da criação da loja)
if (!db.prepare("SELECT id FROM categories WHERE slug='bicicletas-eletricas'").get()) {
  const sort = (db.prepare('SELECT MAX(sort) m FROM categories').get().m || 0);
  const acc = db.prepare("SELECT sort FROM categories WHERE slug='acessorios'").get();
  if (acc) db.prepare('UPDATE categories SET sort=sort+1 WHERE sort>=?').run(acc.sort);
  db.prepare('INSERT INTO categories(name,slug,icon,sort) VALUES(?,?,?,?)').run('Bicicletas elétricas', 'bicicletas-eletricas', 'bike', acc ? acc.sort : sort + 1);
}

// migração única: novas regras de frete (entrega grátis na região + Correios)
(function migrateZones() {
  const s = getSettings();
  if (s.zones_v2) return;
  setSetting('delivery_zones', DEFAULT_ZONES());
  if (String(s.announcement || '').startsWith('Frete grátis acima de R$ 3.000')) setSetting('announcement', DEFAULT_SETTINGS.announcement);
  setSetting('zones_v2', true);
})();

/* ---------- e-mails ---------- */
const mailer = require('./mail').createMailer({ db, getSettings, secret: (k) => getSettings()[k] || '' });
const EMAIL_RE_G = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const extras = require('./extras')({ db, getSettings, J, str, round2, mailer, EMAIL_RE: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  secret: (k) => (k === 'wa_token' && process.env.WA_TOKEN) || (k === 'zapi_token' && process.env.ZAPI_TOKEN) || getSettings()[k] || '' });
const integ = require('./integrations').createIntegrations({ db, getSettings, J, str, round2, mailer, secret: (k) => (k === 'me_token' && process.env.ME_TOKEN) || (k === 'focus_token' && process.env.FOCUS_TOKEN) || getSettings()[k] || '',
  effectivePrice: (p) => effectivePrice(p), EMAIL_RE: EMAIL_RE_G });

/* ---------- app ---------- */
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// na nuvem: guarda a chave temporária do Vercel Blob que chega em cada acesso
app.use((req, res, next) => { const t = req.headers['x-vercel-oidc-token']; if (t) store.setOidc(String(t)); next(); });
// tarefas automáticas: na nuvem, rodam em segundo plano a cada acesso
app.use(jobs.trigger);
app.get('/api/cron', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== 'Bearer ' + secret) return res.status(401).json({ error: 'Não autorizado.' });
  res.json({ ok: true, ran: await jobs.runDue(true) });
});

// compressão Brotli/Gzip (texto, JSON, CSS, JS)
app.use(compression({ threshold: 1024 }));


// cabeçalhos de segurança
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self' https://www.googletagmanager.com https://connect.facebook.net", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://*.googleusercontent.com https://i.ytimg.com https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://www.facebook.com", "connect-src 'self' https://viacep.com.br https://nominatim.openstreetmap.org https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.facebook.com https://connect.facebook.net",
    "frame-src 'self' https://www.youtube-nocookie.com https://www.instagram.com https://www.tiktok.com https://www.facebook.com https://maps.google.com https://www.google.com https://*.google.com https://www.google.com.br https://maps.google.com.br", "object-src 'none'", "base-uri 'self'",
    "form-action 'self'", "frame-ancestors 'none'"
  ].join('; '));
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  if (req.path.startsWith('/api/')) res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  // dados pessoais e painel: nunca guardados em cache de navegador ou proxy
  if (/^\/api\/(admin|account|orders|cart|service|preorders|reserve|warranty|alerts|push)\b/.test(req.path) || /^\/(documento|laudo|os)\//.test(req.path)) res.setHeader('Cache-Control', 'no-store');
  next();
});
// tamanho máximo do corpo: grande só onde há envio de fotos; 200 KB no resto (protege contra abuso)
const rawKeep = (req, res, buf) => { if (req.url.startsWith('/api/shopee/')) req.rawBody = buf.toString('utf8'); };
const jsonBig = express.json({ limit: '15mb', verify: rawKeep }), jsonSmall = express.json({ limit: '200kb', verify: rawKeep });
const BIG_BODY = /^\/api\/(admin\/|account\/photo$|reviews$)/;
app.use((req, res, next) => (BIG_BODY.test(req.path) ? jsonBig : jsonSmall)(req, res, next));

// proteção CSRF: alterações via API só a partir do próprio site (webhooks externos ficam de fora — eles têm assinatura própria)
const ORIGIN_EXEMPT = /^\/api\/(payments\/mp\/webhook|ml\/notify|shopee\/notify)$/;
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.path.startsWith('/api/') || ORIGIN_EXEMPT.test(req.path)) return next();
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
  next();
});

// cache rápido da vitrine (20 s) — limpo automaticamente a cada pedido, cadastro ou alteração
const apiCache = new Map();
const CACHEABLE = /^\/api\/(products|categories|reviews|settings)(\/|$)/;
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.on('finish', () => { if (res.statusCode < 400) { apiCache.clear(); salesCache.t = 0; } });
    return next();
  }
  if (!CACHEABLE.test(req.path)) return next();
  const k = req.originalUrl, hit = apiCache.get(k);
  if (hit && Date.now() - hit.t < 20000) { res.setHeader('X-Cache', 'HIT'); return res.json(hit.body); }
  const orig = res.json.bind(res);
  res.json = (body) => { if (res.statusCode === 200) { if (apiCache.size > 500) apiCache.clear(); apiCache.set(k, { t: Date.now(), body }); } res.setHeader('X-Cache', 'MISS'); return orig(body); };
  next();
});

/* ---- autenticação da equipe ---- */
const ROLES = {
  owner: { label: 'Dono', perms: ['*'] },
  manager: { label: 'Gerente', perms: ['dashboard', 'orders', 'products', 'categories', 'coupons', 'promos', 'reviews', 'questions', 'settings'] },
  seller: { label: 'Vendedor', perms: ['dashboard', 'orders', 'products', 'reviews', 'questions'] }
};
const can = (user, perm) => { const r = ROLES[user.role]; return !!r && (r.perms.includes('*') || r.perms.includes(perm)); };
const SESSION_MS = 1000 * 60 * 60 * 12;
const readCookie = (req, name) => {
  const m = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
};
const cookieStr = (req, val, maxAge) =>
  `at_sess=${val}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}${req.secure ? '; Secure' : ''}`;
function audit(req, action, detail = '') {
  db.prepare('INSERT INTO audit_log(user_name,action,detail,ip) VALUES(?,?,?,?)')
    .run(req.user ? `${req.user.name} (@${req.user.username})` : '—', action, String(detail).slice(0, 300), ipOf(req));
}
function auth(perm) {
  return (req, res, next) => {
    const token = readCookie(req, 'at_sess');
    const s = token && db.prepare(`SELECT s.*, u.id uid, u.name, u.username, u.role, u.active, u.must_change FROM sessions s
      JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).get(sha(token));
    if (!s || s.expires < Date.now() || !s.active) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
    // proteção CSRF: mutações só a partir do próprio site
    if (req.method !== 'GET') {
      const origin = req.headers.origin || req.headers.referer || '';
      try { if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Origem não permitida.' }); }
      catch { return res.status(403).json({ error: 'Origem não permitida.' }); }
    }
    req.user = { id: s.uid, name: s.name, username: s.username, role: s.role, must_change: !!s.must_change, token_hash: s.token_hash };
    if (s.expires - Date.now() < SESSION_MS / 2) {
      db.prepare('UPDATE sessions SET expires=? WHERE token_hash=?').run(Date.now() + SESSION_MS, s.token_hash);
      res.setHeader('Set-Cookie', cookieStr(req, token, SESSION_MS / 1000));
    }
    if (req.user.must_change && !['/api/admin/me', '/api/admin/password', '/api/admin/logout'].includes(req.path))
      return res.status(403).json({ error: 'Troque sua senha para continuar.', must_change: true });
    if (perm && !can(req.user, perm)) return res.status(403).json({ error: 'Seu perfil não tem permissão para esta área.' });
    next();
  };
}
jobs.every('limpa-sessoes', 3600000, () => db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now()));

app.post('/api/admin/login', limit('login-ip', 20, 15 * 60000), (req, res) => {
  const username = str((req.body || {}).username, 60).toLowerCase(), password = String((req.body || {}).password || '');
  if (!allow('login-user:' + username, 6, 15 * 60000))
    return res.status(429).json({ error: 'Muitas tentativas para este usuário. Aguarde 15 minutos.' });
  const u = db.prepare('SELECT * FROM users WHERE LOWER(username)=?').get(username);
  const ok = checkPw(password, u ? u.password : '');
  if (!u || !ok || !u.active) {
    db.prepare('INSERT INTO audit_log(user_name,action,detail,ip) VALUES(?,?,?,?)').run('@' + username, 'login_falhou', '', ipOf(req));
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires,ip,ua) VALUES(?,?,?,?,?)')
    .run(sha(token), u.id, Date.now() + SESSION_MS, ipOf(req), str(req.headers['user-agent'], 200));
  db.prepare("UPDATE users SET last_login=datetime('now','localtime') WHERE id=?").run(u.id);
  req.user = u; audit(req, 'login');
  res.setHeader('Set-Cookie', cookieStr(req, token, SESSION_MS / 1000));
  res.json({ user: { name: u.name, username: u.username, role: u.role, must_change: !!u.must_change } });
});
app.post('/api/admin/logout', auth(), (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.user.token_hash);
  res.setHeader('Set-Cookie', cookieStr(req, '', 0));
  res.json({ ok: true });
});
app.get('/api/admin/me', auth(), (req, res) => {
  const r = ROLES[req.user.role];
  const u = db.prepare(`SELECT u.photo,${STAFF_PHOTO} photo_shown,u.whatsapp,u.title,u.ref_code,u.in_ranking,u.goal,u.email FROM users u WHERE u.id=?`).get(req.user.id) || {};
  res.json({ ...req.user, ...u, token_hash: undefined, role_label: r.label, perms: r.perms, nfe_on: integ.nfeEnabled() });
});
app.post('/api/admin/password', auth(), (req, res) => {
  const { current, next } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!checkPw(current || '', u.password)) return res.status(400).json({ error: 'Senha atual incorreta.' });
  if (!strongPw(next)) return res.status(400).json({ error: 'A nova senha precisa ter 8+ caracteres, com letras e números.' });
  if (next === current) return res.status(400).json({ error: 'A nova senha deve ser diferente da atual.' });
  db.prepare('UPDATE users SET password=?, must_change=0 WHERE id=?').run(hashPw(next), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(u.id, req.user.token_hash);
  audit(req, 'senha_alterada');
  res.json({ ok: true });
});

/* ---- contas de clientes ---- */
const CLI_MS = 1000 * 60 * 60 * 24 * 30;
const cliCookie = (req, val, maxAge) => `at_cli=${val}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${req.secure ? '; Secure' : ''}`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function getCustomer(req) {
  const t = readCookie(req, 'at_cli');
  if (!t) return null;
  const c = db.prepare(`SELECT c.*, s.expires, s.token_hash FROM customer_sessions s
    JOIN customers c ON c.id=s.customer_id WHERE s.token_hash=?`).get(sha(t));
  return c && c.expires > Date.now() ? c : null;
}
function sameOrigin(req) {
  const o = req.headers.origin || req.headers.referer || '';
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}
function customerAuth(req, res, next) {
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
  const c = getCustomer(req);
  if (!c) return res.status(401).json({ error: 'Entre na sua conta para continuar.', need_login: true });
  req.customer = c; next();
}
function verifiedOnly(req, res, next) {
  if (needsVerification(req.customer)) return res.status(403).json({ error: 'Confirme seu e-mail para continuar. Enviamos o link na criação da conta — você pode reenviar em “Minha conta”.', need_verify: true });
  next();
}
function startCustomerSession(req, res, id) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO customer_sessions(token_hash,customer_id,expires) VALUES(?,?,?)').run(sha(token), id, Date.now() + CLI_MS);
  res.setHeader('Set-Cookie', cliCookie(req, token, CLI_MS / 1000));
}
const custOut = (c) => c && { name: c.name, email: c.email, phone: c.phone, avatar: c.avatar || '', cover: c.cover || '',
  city: c.city || '', uf: c.uf || '', bio: c.bio || '', email_verified: !!c.email_verified, marketing: !!c.marketing, created_at: c.created_at };
const custPwOk = (pw) => typeof pw === 'string' && pw.length >= 8 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);

/* tokens de uso único (verificação de e-mail / redefinição de senha) */
function makeToken(customerId, type, ttlMs, data = '') {
  db.prepare('DELETE FROM customer_tokens WHERE customer_id=? AND type=?').run(customerId, type);
  const t = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO customer_tokens(token_hash,customer_id,type,expires,data) VALUES(?,?,?,?,?)').run(sha(t), customerId, type, Date.now() + ttlMs, data);
  return t;
}
function useToken(token, type) {
  const row = db.prepare('SELECT * FROM customer_tokens WHERE token_hash=? AND type=?').get(sha(String(token || '')), type);
  if (!row) return null;
  db.prepare('DELETE FROM customer_tokens WHERE token_hash=?').run(row.token_hash);
  return row.expires > Date.now() ? row : null;
}
function unsubToken(c) {
  if (c.unsub_token) return c.unsub_token;
  const t = crypto.randomBytes(18).toString('hex');
  db.prepare('UPDATE customers SET unsub_token=? WHERE id=?').run(t, c.id);
  return t;
}
function sendVerification(req, c, email = c.email) {
  const t = makeToken(c.id, 'verify', 48 * 3600000, email);
  const url = `${baseUrl(req)}/verificar-email?token=${t}`;
  return mailer.send(email, 'Confirme seu e-mail — Aladdin Tech', mailer.layout({
    preheader: 'Falta só um clique para ativar sua conta.',
    title: `Bem-vindo(a), ${mailer.esc(c.name.split(' ')[0])}!`,
    intro: 'Confirme seu e-mail para ativar sua conta, avaliar produtos e receber o status dos seus pedidos.',
    button: { label: 'Confirmar meu e-mail', url },
    note: 'O link vale por 48 horas. Se você não criou esta conta, ignore este e-mail.'
  }), 'verificacao');
}
const needsVerification = (c) => getSettings().require_email_verification !== false && mailer.ready() && !c.email_verified;

app.post('/api/account/register', limit('register', 5, 3600000, 'Muitos cadastros a partir desta conexão. Tente mais tarde.'), (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
  const b = req.body || {};
  const name = str(b.name, 80), email = str(b.email, 120).toLowerCase(), phone = str(b.phone, 20), pw = String(b.password || '');
  if (name.length < 3 || !name.includes(' ')) return res.status(400).json({ error: 'Informe seu nome e sobrenome.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
  if (str(b.email_confirm, 120).toLowerCase() !== email) return res.status(400).json({ error: 'Os e-mails digitados não conferem.' });
  if (!custPwOk(pw)) return res.status(400).json({ error: 'A senha precisa ter 8+ caracteres, com letras e números.' });
  if (String(b.password_confirm || '') !== pw) return res.status(400).json({ error: 'As senhas digitadas não conferem.' });
  if (db.prepare('SELECT id FROM customers WHERE email=?').get(email)) return res.status(400).json({ error: 'Este e-mail já tem cadastro. Use “Entrar” ou “Esqueci minha senha”.' });
  const r = db.prepare('INSERT INTO customers(name,email,phone,password,marketing) VALUES(?,?,?,?,?)')
    .run(name, email, phone, hashPw(pw), b.marketing ? 1 : 0);
  const c = db.prepare('SELECT * FROM customers WHERE id=?').get(Number(r.lastInsertRowid));
  startCustomerSession(req, res, c.id);
  sendVerification(req, c).catch(() => {});
  if (b.indica) extras.attachReferral(c, b.indica, baseUrl(req)).catch(() => {});
  res.json({ customer: custOut(c), verification_sent: true, mail_ready: mailer.ready() });
});
app.post('/api/account/verify/send', customerAuth, limit('verify-send', 4, 3600000, 'Aguarde alguns minutos para reenviar.'), async (req, res) => {
  if (req.customer.email_verified) return res.json({ ok: true, already: true });
  await sendVerification(req, req.customer);
  res.json({ ok: true, mail_ready: mailer.ready() });
});
app.post('/api/account/verify', limit('verify', 20, 600000), (req, res) => {
  const row = useToken((req.body || {}).token, 'verify');
  if (!row) return res.status(400).json({ error: 'Link inválido ou expirado. Peça um novo na sua conta.' });
  const email = row.data;
  if (email && db.prepare('SELECT id FROM customers WHERE email=? AND id<>?').get(email, row.customer_id)) return res.status(400).json({ error: 'Este e-mail já está em uso por outra conta.' });
  db.prepare('UPDATE customers SET email_verified=1' + (email ? ', email=?' : '') + ' WHERE id=?').run(...(email ? [email, row.customer_id] : [row.customer_id]));
  res.json({ ok: true });
});
app.post('/api/account/forgot', limit('forgot', 5, 3600000, 'Muitas solicitações. Tente mais tarde.'), async (req, res) => {
  const email = str((req.body || {}).email, 120).toLowerCase();
  const generic = { ok: true, message: 'Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha em instantes.' };
  if (!EMAIL_RE.test(email) || !allow('forgot-email:' + email, 3, 3600000)) return res.json(generic);
  const c = db.prepare('SELECT * FROM customers WHERE email=?').get(email);
  if (c) {
    const t = makeToken(c.id, 'reset', 3600000);
    await mailer.send(c.email, 'Redefinir sua senha — Aladdin Tech', mailer.layout({
      preheader: 'Crie uma nova senha para sua conta.', title: 'Vamos criar uma nova senha',
      intro: `Olá, ${mailer.esc(c.name.split(' ')[0])}. Recebemos um pedido para redefinir a senha da sua conta.`,
      button: { label: 'Criar nova senha', url: `${baseUrl(req)}/redefinir-senha?token=${t}` },
      note: 'O link vale por 1 hora e só pode ser usado uma vez. Se não foi você, ignore este e-mail — sua senha continua a mesma.'
    }), 'senha');
  }
  res.json(generic);
});
app.post('/api/account/reset', limit('reset', 10, 600000), (req, res) => {
  const b = req.body || {};
  if (!custPwOk(b.password)) return res.status(400).json({ error: 'A senha precisa ter 8+ caracteres, com letras e números.' });
  if (b.password !== b.password_confirm) return res.status(400).json({ error: 'As senhas não conferem.' });
  const row = useToken(b.token, 'reset');
  if (!row) return res.status(400).json({ error: 'Link inválido ou expirado. Peça um novo em “Esqueci minha senha”.' });
  db.prepare('UPDATE customers SET password=?, email_verified=1 WHERE id=?').run(hashPw(b.password), row.customer_id);
  db.prepare('DELETE FROM customer_sessions WHERE customer_id=?').run(row.customer_id);
  startCustomerSession(req, res, row.customer_id);
  res.json({ ok: true, customer: custOut(db.prepare('SELECT * FROM customers WHERE id=?').get(row.customer_id)) });
});
app.put('/api/account/profile', customerAuth, (req, res) => {
  const b = req.body || {}, c = req.customer;
  const name = 'name' in b ? str(b.name, 80) : c.name;
  if (name.length < 3) return res.status(400).json({ error: 'Informe seu nome.' });
  db.prepare('UPDATE customers SET name=?, phone=?, city=?, uf=?, bio=?, marketing=? WHERE id=?').run(name,
    'phone' in b ? str(b.phone, 20) : c.phone, 'city' in b ? str(b.city, 80) : c.city, 'uf' in b ? str(b.uf, 2).toUpperCase() : c.uf,
    'bio' in b ? str(b.bio, 160) : c.bio, 'marketing' in b ? (b.marketing ? 1 : 0) : c.marketing, c.id);
  res.json({ customer: custOut(db.prepare('SELECT * FROM customers WHERE id=?').get(c.id)) });
});
app.post('/api/account/photo', customerAuth, limit('cli-photo', 20, 3600000), (req, res) => {
  const kind = (req.body || {}).kind === 'cover' ? 'cover' : 'avatar';
  try {
    const url = saveImage((req.body || {}).data, 'clientes', 4 * 1048576);
    deleteUpload(req.customer[kind]);
    db.prepare(`UPDATE customers SET ${kind}=? WHERE id=?`).run(url, req.customer.id);
    res.json({ url });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/account/password', customerAuth, limit('cli-pw', 8, 3600000), (req, res) => {
  const b = req.body || {};
  const c = db.prepare('SELECT * FROM customers WHERE id=?').get(req.customer.id);
  if (!checkPw(String(b.current || ''), c.password)) return res.status(400).json({ error: 'Senha atual incorreta.' });
  if (!custPwOk(b.next)) return res.status(400).json({ error: 'A nova senha precisa ter 8+ caracteres, com letras e números.' });
  if (b.next !== b.next_confirm) return res.status(400).json({ error: 'As novas senhas não conferem.' });
  db.prepare('UPDATE customers SET password=? WHERE id=?').run(hashPw(b.next), c.id);
  db.prepare('DELETE FROM customer_sessions WHERE customer_id=? AND token_hash<>?').run(c.id, req.customer.token_hash);
  res.json({ ok: true });
});
app.post('/api/account/email', customerAuth, limit('cli-email', 5, 3600000), async (req, res) => {
  const b = req.body || {};
  const email = str(b.email, 120).toLowerCase();
  const c = db.prepare('SELECT * FROM customers WHERE id=?').get(req.customer.id);
  if (!checkPw(String(b.password || ''), c.password)) return res.status(400).json({ error: 'Senha incorreta.' });
  if (!EMAIL_RE.test(email) || email !== str(b.email_confirm, 120).toLowerCase()) return res.status(400).json({ error: 'Os e-mails não conferem.' });
  if (db.prepare('SELECT id FROM customers WHERE email=? AND id<>?').get(email, c.id)) return res.status(400).json({ error: 'Este e-mail já está em uso.' });
  if (mailer.ready()) {
    await sendVerification(req, c, email);
    return res.json({ ok: true, pending: true, message: `Enviamos um link para ${email}. A troca vale quando você confirmar.` });
  }
  db.prepare('UPDATE customers SET email=?, email_verified=0 WHERE id=?').run(email, c.id);
  res.json({ ok: true, customer: custOut(db.prepare('SELECT * FROM customers WHERE id=?').get(c.id)) });
});
app.delete('/api/account', customerAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM customers WHERE id=?').get(req.customer.id);
  if (!checkPw(String((req.body || {}).password || ''), c.password)) return res.status(400).json({ error: 'Senha incorreta.' });
  deleteUpload(c.avatar); deleteUpload(c.cover);
  // mantém pedidos (obrigação fiscal), mas desvincula; avaliações ficam anônimas
  db.prepare('UPDATE orders SET customer_id=NULL WHERE customer_id=?').run(c.id);
  db.prepare("UPDATE reviews SET customer_id=NULL, name='Cliente' WHERE customer_id=?").run(c.id);
  db.prepare('UPDATE questions SET customer_id=NULL WHERE customer_id=?').run(c.id);
  ['customer_addresses', 'customer_sessions', 'customer_tokens', 'wishlist'].forEach((t) => db.prepare(`DELETE FROM ${t} WHERE customer_id=?`).run(c.id));
  db.prepare('DELETE FROM price_alerts WHERE customer_id=? OR email=?').run(c.id, c.email);
  db.prepare('DELETE FROM customers WHERE id=?').run(c.id);
  res.setHeader('Set-Cookie', cliCookie(req, '', 0));
  res.json({ ok: true });
});
app.get('/api/account/reviews', customerAuth, (req, res) => {
  res.json(db.prepare(`SELECT r.id, r.rating, r.title, r.comment, r.photos, r.approved, r.verified, r.reply, r.created_at, p.name AS product_name, p.slug AS product_slug
    FROM reviews r LEFT JOIN products p ON p.id=r.product_id WHERE r.customer_id=? ORDER BY r.id DESC`).all(req.customer.id).map((r) => ({ ...r, photos: J(r.photos, []) })));
});
/* endereços */
function addrFields(b) {
  const lat = Number(b.lat), lng = Number(b.lng);
  return { label: str(b.label, 30) || 'Casa', recipient: str(b.recipient, 80), cep: str(b.cep, 9), street: str(b.street, 120), number: str(b.number, 20),
    complement: str(b.complement, 80), district: str(b.district, 80), city: str(b.city, 80), uf: str(b.uf, 2).toUpperCase(),
    lat: Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : null, lng: Number.isFinite(lng) && Math.abs(lng) <= 180 ? lng : null };
}
const addrValid = (a) => a.cep.replace(/\D/g, '').length === 8 && a.street && a.number && a.district && a.city && /^[A-Z]{2}$/.test(a.uf);
app.get('/api/account/addresses', customerAuth, (req, res) => res.json(db.prepare('SELECT * FROM customer_addresses WHERE customer_id=? ORDER BY is_default DESC, id DESC').all(req.customer.id)));
app.post('/api/account/addresses', customerAuth, (req, res) => {
  const a = addrFields(req.body || {});
  if (!addrValid(a)) return res.status(400).json({ error: 'Preencha CEP, rua, número, bairro, cidade e UF.' });
  if (db.prepare('SELECT COUNT(*) n FROM customer_addresses WHERE customer_id=?').get(req.customer.id).n >= 10) return res.status(400).json({ error: 'Limite de 10 endereços.' });
  const first = !db.prepare('SELECT id FROM customer_addresses WHERE customer_id=?').get(req.customer.id);
  const isDef = first || (req.body || {}).is_default ? 1 : 0;
  if (isDef) db.prepare('UPDATE customer_addresses SET is_default=0 WHERE customer_id=?').run(req.customer.id);
  const k = Object.keys(a);
  const r = db.prepare(`INSERT INTO customer_addresses(customer_id,${k},is_default) VALUES(?,${k.map(() => '?')},?)`).run(req.customer.id, ...k.map((x) => a[x]), isDef);
  res.json({ ok: true, id: Number(r.lastInsertRowid) });
});
app.put('/api/account/addresses/:id', customerAuth, (req, res) => {
  const id = parseInt(req.params.id);
  if (!db.prepare('SELECT id FROM customer_addresses WHERE id=? AND customer_id=?').get(id, req.customer.id)) return res.status(404).json({ error: 'Endereço não encontrado.' });
  if ((req.body || {}).make_default) {
    db.prepare('UPDATE customer_addresses SET is_default=0 WHERE customer_id=?').run(req.customer.id);
    db.prepare('UPDATE customer_addresses SET is_default=1 WHERE id=?').run(id);
    return res.json({ ok: true });
  }
  const a = addrFields(req.body || {});
  if (!addrValid(a)) return res.status(400).json({ error: 'Preencha CEP, rua, número, bairro, cidade e UF.' });
  const k = Object.keys(a);
  db.prepare(`UPDATE customer_addresses SET ${k.map((x) => x + '=?')} WHERE id=?`).run(...k.map((x) => a[x]), id);
  res.json({ ok: true });
});
app.delete('/api/account/addresses/:id', customerAuth, (req, res) => {
  db.prepare('DELETE FROM customer_addresses WHERE id=? AND customer_id=?').run(parseInt(req.params.id), req.customer.id);
  const d = db.prepare('SELECT id FROM customer_addresses WHERE customer_id=? AND is_default=1').get(req.customer.id);
  if (!d) { const f = db.prepare('SELECT id FROM customer_addresses WHERE customer_id=? ORDER BY id DESC').get(req.customer.id); if (f) db.prepare('UPDATE customer_addresses SET is_default=1 WHERE id=?').run(f.id); }
  res.json({ ok: true });
});
/* descadastrar de ofertas (link do e-mail, sem login) */
app.post('/api/unsubscribe', limit('unsub', 20, 600000), (req, res) => {
  const t = str((req.body || {}).t, 60);
  const c = t && db.prepare('SELECT id FROM customers WHERE unsub_token=?').get(t);
  if (!c) return res.status(400).json({ error: 'Link inválido.' });
  db.prepare('UPDATE customers SET marketing=0 WHERE id=?').run(c.id);
  res.json({ ok: true });
});
app.post('/api/account/login', limit('cli-login', 15, 15 * 60000), (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
  const email = str((req.body || {}).email, 120).toLowerCase();
  if (!allow('cli-login-email:' + email, 6, 15 * 60000)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' });
  const c = db.prepare('SELECT * FROM customers WHERE email=?').get(email);
  if (!checkPw(String((req.body || {}).password || ''), c ? c.password : '') || !c) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  startCustomerSession(req, res, c.id);
  res.json({ customer: custOut(c) });
});
app.post('/api/account/logout', (req, res) => {
  const t = readCookie(req, 'at_cli');
  if (t) db.prepare('DELETE FROM customer_sessions WHERE token_hash=?').run(sha(t));
  res.setHeader('Set-Cookie', cliCookie(req, '', 0));
  res.json({ ok: true });
});
app.get('/api/account/me', (req, res) => res.json({ customer: custOut(getCustomer(req)) }));
app.get('/api/account/orders', customerAuth, (req, res) => {
  const orders = db.prepare('SELECT code,items,total,status,payment,delivery_method,delivery,tracking,pay_status,created_at FROM orders WHERE customer_id=? ORDER BY id DESC').all(req.customer.id)
    .map((o) => ({ ...o, items: J(o.items, []), delivery: J(o.delivery, {}) }));
  const ids = [...new Set(orders.flatMap((o) => o.items.map((i) => i.id)))];
  const slugs = {}; ids.forEach((id) => { const p = db.prepare('SELECT slug FROM products WHERE id=?').get(id); if (p) slugs[id] = p.slug; });
  const reviewed = db.prepare('SELECT product_id FROM reviews WHERE customer_id=?').all(req.customer.id).map((r) => r.product_id);
  res.json({ orders, slugs, reviewed });
});
jobs.every('limpa-sessoes-clientes', 3600000, () => db.prepare('DELETE FROM customer_sessions WHERE expires<?').run(Date.now()));

/* ---- públicos ---- */
app.get('/api/settings', (req, res) => {
  const s = getSettings();
  [...SECRET_KEYS, ...OWNER_KEYS, 'require_email_verification', 'zones_v2'].forEach((k) => delete s[k]);
  s.online_payments = onlinePay();
  s.email_verification = getSettings().require_email_verification !== false && mailer.ready();
  s.shipping_live = integ.shippingLive(); s.nfe_on = integ.nfeEnabled(); s.wa_auto = extras.waReady();
  s.sellers = publicSellers();
  ['nfe_auto', 'nfe_natureza', 'nfe_cfop_in', 'nfe_cfop_out', 'nfe_csosn', 'nfe_pis_cst', 'nfe_cofins_cst', 'nfe_icms_origem', 'nfe_ncm_default', 'cart_coupon', 'shipping_markup', 'shipping_services'].forEach((k) => delete s[k]);
  res.json(s);
});
app.get('/api/categories', (req, res) => {
  res.json(db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.active=1) AS count
    FROM categories c ORDER BY sort, name`).all());
});

const ratingSub = `(SELECT ROUND(AVG(rating),1) FROM reviews r WHERE r.product_id=p.id AND r.approved=1) AS rating,
  (SELECT COUNT(*) FROM reviews r WHERE r.product_id=p.id AND r.approved=1) AS rating_count`;
app.get('/api/products', (req, res) => {
  const { category, q, sort, featured, condition, limit: lim, ofertas, ids } = req.query;
  const where = ['p.active=1'], params = [];
  if (ids) {
    const list = String(ids).split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 100);
    if (!list.length) return res.json([]);
    where.push(`p.id IN (${list.map(() => '?').join(',')})`); params.push(...list);
  }
  if (category) { where.push('c.slug=?'); params.push(String(category)); }
  if (featured) where.push('p.featured=1');
  if (req.query.soon) where.push('p.coming_soon=1');
  if (condition) { where.push('p.condition=?'); params.push(String(condition)); }
  if (q) { where.push('(p.name LIKE ? OR p.brand LIKE ? OR p.short LIKE ? OR c.name LIKE ? OR p.sku LIKE ?)'); const l = `%${String(q).slice(0, 80)}%`; params.push(l, l, l, l, l); }
  let rows = db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon, ${ratingSub}
    FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${where.join(' AND ')} ORDER BY p.featured DESC, p.id ASC`).all(...params).map(productPublic);
  if (ofertas) rows = rows.filter((p) => p.promo).sort((a, b) => (b.old_price - b.price) / b.old_price - (a.old_price - a.price) / a.old_price);
  const sorters = { 'preco-asc': (a, b) => a.price - b.price, 'preco-desc': (a, b) => b.price - a.price, novos: (a, b) => b.id - a.id,
    nome: (a, b) => a.name.localeCompare(b.name, 'pt-BR'),
    'mais-vendidos': (a, b) => { const st = salesStats(); return ((st.get(b.id) || {}).score || 0) - ((st.get(a.id) || {}).score || 0); },
    avaliacao: (a, b) => (b.rating || 0) - (a.rating || 0) || (b.rating_count || 0) - (a.rating_count || 0), desconto: (a, b) => ((b.old_price || b.price) - b.price) / (b.old_price || 1) - ((a.old_price || a.price) - a.price) / (a.old_price || 1) };
  if (sorters[sort]) rows.sort(sorters[sort]);
  if (req.query.bestsellers) { const st = salesStats(); rows = rows.filter((p) => (st.get(p.id) || {}).rank).sort(sorters['mais-vendidos']); }
  res.json(rows.slice(0, Math.min(parseInt(lim) || 200, 200)));
});
app.get('/api/products/:slug', (req, res) => {
  const p = db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon, ${ratingSub}
    FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.slug=? AND p.active=1`).get(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Produto não encontrado' });
  res.json(productPublic(p));
});

/* ---- avaliações (com fotos, compra verificada, útil, resposta da loja) ---- */
app.get('/api/reviews', (req, res) => {
  const pid = req.query.product ? parseInt(req.query.product) : null;
  const scope = pid ? 'r.product_id=?' : '1=1';
  const sp = pid ? [pid] : [];
  const where = ['r.approved=1', scope], params = [...sp];
  const stars = parseInt(req.query.stars);
  if (stars >= 1 && stars <= 5) { where.push('r.rating=?'); params.push(stars); }
  if (req.query.fotos) where.push("r.photos<>'[]'");
  const order = { uteis: 'r.helpful DESC, r.id DESC', melhores: 'r.rating DESC, r.id DESC', piores: 'r.rating ASC, r.id DESC' }[req.query.sort] || 'r.id DESC';
  const rows = db.prepare(`SELECT r.id,r.name,r.city,r.rating,r.title,r.comment,r.photos,r.verified,r.helpful,r.reply,r.reply_at,r.created_at,
      p.name AS product_name, p.slug AS product_slug FROM reviews r LEFT JOIN products p ON p.id=r.product_id
      WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 100`).all(...params).map((r) => ({ ...r, photos: J(r.photos, []), verified: !!r.verified }));
  const agg = db.prepare(`SELECT ROUND(AVG(rating),1) avg, COUNT(*) count FROM reviews r WHERE r.approved=1 AND ${scope}`).get(...sp);
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  db.prepare(`SELECT rating, COUNT(*) n FROM reviews r WHERE r.approved=1 AND ${scope} GROUP BY rating`).all(...sp).forEach((d) => dist[d.rating] = d.n);
  const gallery = [];
  db.prepare(`SELECT id, photos FROM reviews r WHERE r.approved=1 AND ${scope} AND photos<>'[]' ORDER BY id DESC LIMIT 30`).all(...sp)
    .forEach((r) => J(r.photos, []).forEach((url) => gallery.push({ url, review_id: r.id })));
  res.json({ reviews: rows, avg: agg.avg, count: agg.count, dist, gallery: gallery.slice(0, 24), photo_count: gallery.length });
});

app.post('/api/reviews', customerAuth, verifiedOnly, limit('review', 6, 3600000, 'Você já enviou várias avaliações. Tente novamente mais tarde.'), (req, res) => {
  const b = req.body || {}, cust = req.customer;
  const rating = parseInt(b.rating);
  const comment = str(b.comment, 1500), title = str(b.title, 80), city = str(b.city, 60);
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Escolha uma nota de 1 a 5 estrelas.' });
  if (comment.length < 10) return res.status(400).json({ error: 'Conte um pouco mais (mínimo de 10 caracteres).' });
  const photosIn = Array.isArray(b.photos) ? b.photos.slice(0, 5) : [];
  const pid = b.product_id ? parseInt(b.product_id) : null;
  if (pid && !db.prepare('SELECT id FROM products WHERE id=?').get(pid)) return res.status(400).json({ error: 'Produto inválido.' });
  // compra verificada: o cliente tem um pedido (não cancelado) com este produto
  const orders = db.prepare("SELECT items FROM orders WHERE customer_id=? AND status<>'cancelado'").all(cust.id);
  const verified = orders.some((o) => !pid || J(o.items, []).some((i) => i.id === pid)) ? 1 : 0;
  let photos = [];
  try { photos = photosIn.map((d) => saveImage(d, 'avaliacoes', 3 * 1048576)); }
  catch (e) { photos.forEach(deleteUpload); return res.status(400).json({ error: e.message }); }
  const auto = getSettings().reviews_moderation === false;
  // uma avaliação por cliente por produto: se já existe, é atualizada (e volta para moderação)
  const prev = db.prepare(`SELECT id, photos FROM reviews WHERE customer_id=? AND ${pid ? 'product_id=?' : 'product_id IS NULL'}`).get(...(pid ? [cust.id, pid] : [cust.id]));
  if (prev) {
    J(prev.photos, []).forEach(deleteUpload);
    db.prepare("UPDATE reviews SET name=?,city=?,rating=?,title=?,comment=?,photos=?,verified=?,approved=?,created_at=datetime('now','localtime') WHERE id=?")
      .run(cust.name, city, rating, title, comment, JSON.stringify(photos), verified, auto ? 1 : 0, prev.id);
  } else {
    db.prepare('INSERT INTO reviews(product_id,customer_id,name,city,rating,title,comment,photos,verified,approved) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(pid, cust.id, cust.name, city, rating, title, comment, JSON.stringify(photos), verified, auto ? 1 : 0);
  }
  res.json({ ok: true, verified: !!verified, updated: !!prev,
    message: auto ? 'Obrigado! Sua avaliação foi publicada.' : 'Obrigado! Sua avaliação será publicada após uma rápida revisão da nossa equipe.' });
});
app.post('/api/reviews/:id/helpful', (req, res) => {
  const id = parseInt(req.params.id);
  if (!allow(`helpful:${ipOf(req)}:${id}`, 1, 86400000)) return res.json({ ok: false });
  db.prepare('UPDATE reviews SET helpful=helpful+1 WHERE id=? AND approved=1').run(id);
  res.json({ ok: true, helpful: (db.prepare('SELECT helpful FROM reviews WHERE id=?').get(id) || {}).helpful || 0 });
});

/* ---- perguntas e respostas ---- */
app.get('/api/questions', (req, res) => {
  const pid = parseInt(req.query.product);
  res.json(db.prepare(`SELECT id,name,question,answer,answered_at,created_at FROM questions
    WHERE product_id=? AND public=1 AND answer<>'' ORDER BY id DESC LIMIT 50`).all(pid || 0));
});
app.post('/api/questions', customerAuth, verifiedOnly, limit('question', 6, 3600000, 'Você enviou várias perguntas. Tente novamente mais tarde.'), (req, res) => {
  const b = req.body || {};
  const pid = parseInt(b.product_id), q = str(b.question, 500);
  if (!db.prepare('SELECT id FROM products WHERE id=? AND active=1').get(pid || 0)) return res.status(400).json({ error: 'Produto inválido.' });
  if (q.length < 5) return res.status(400).json({ error: 'Escreva sua pergunta.' });
  db.prepare('INSERT INTO questions(product_id,customer_id,name,question) VALUES(?,?,?,?)').run(pid, req.customer.id, req.customer.name.split(' ')[0], q);
  res.json({ ok: true, message: 'Pergunta enviada! Você verá a resposta aqui assim que nossa equipe responder.' });
});

/* ---- pagamento online (Mercado Pago) ---- */
function mpToken() { return process.env.MP_ACCESS_TOKEN || getSettings().mp_access_token || ''; }
function onlinePay() { return !!(getSettings().online_payments && mpToken()); }
const baseUrl = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
async function mpFetch(p, opts = {}) {
  const r = await fetch('https://api.mercadopago.com' + p, { ...opts,
    headers: { Authorization: 'Bearer ' + mpToken(), 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || 'Mercado Pago respondeu com erro ' + r.status);
  return d;
}
async function createPreference(req, code) {
  const o = db.prepare('SELECT * FROM orders WHERE code=?').get(code);
  const s = getSettings(), base = baseUrl(req), https = base.startsWith('https://');
  const cust = J(o.customer, {}), items = J(o.items, []);
  const body = {
    items: [{ id: o.code, title: `Pedido ${o.code} — ${s.store_name || 'Aladdin Tech'}`,
      description: items.map((i) => `${i.qty}x ${i.name}`).join(', ').slice(0, 250), quantity: 1, unit_price: o.total, currency_id: 'BRL' }],
    external_reference: o.code,
    payer: { name: cust.name, ...(EMAIL_RE.test(cust.email || '') ? { email: cust.email } : {}) },
    back_urls: { success: `${base}/pedido/${o.code}`, pending: `${base}/pedido/${o.code}`, failure: `${base}/pedido/${o.code}` },
    statement_descriptor: 'ALADDINTECH',
    payment_methods: o.payment === 'pix'
      ? { excluded_payment_types: [{ id: 'credit_card' }, { id: 'debit_card' }, { id: 'ticket' }, { id: 'prepaid_card' }, { id: 'atm' }], installments: 1 }
      : { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }, { id: 'bank_transfer' }], installments: Math.min(24, Number(s.max_installments) || 12) },
    expires: true, expiration_date_to: new Date(Date.now() + 48 * 3600000).toISOString()
  };
  if (https) { body.auto_return = 'approved'; body.notification_url = `${base}/api/payments/mp/webhook`; }
  const pref = await mpFetch('/checkout/preferences', { method: 'POST', body: JSON.stringify(body), headers: { 'X-Idempotency-Key': 'pref-' + o.code } });
  const url = String(mpToken()).startsWith('TEST-') && pref.sandbox_init_point ? pref.sandbox_init_point : pref.init_point;
  db.prepare("UPDATE orders SET pay_status='pendente', pay_url=? WHERE id=?").run(url, o.id);
  return url;
}
// aplica o status vindo do Mercado Pago (sempre consultado direto na API, nunca confiando no navegador)
function autoNfe(id, base) {
  const s = getSettings();
  if (!integ.nfeEnabled() || s.nfe_auto === false) return;
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (o && o.kind === 'sinal') return;
  if (!o || o.nfe_status === 'autorizado' || o.nfe_status === 'processando') return;
  integ.emitNfe(o, base).catch((e) => console.error('NF-e automática:', e.message));
}
function applyPayment(p) {
  if (!p || !p.external_reference) return null;
  const o = db.prepare('SELECT * FROM orders WHERE code=?').get(String(p.external_reference));
  if (!o) return null;
  const map = { approved: 'aprovado', authorized: 'pendente', pending: 'pendente', in_process: 'em análise', in_mediation: 'em disputa',
    rejected: 'recusado', cancelled: 'cancelado', refunded: 'estornado', charged_back: 'estornado' };
  let st = map[p.status] || p.status;
  if (st === 'aprovado' && Number(p.transaction_amount) + 0.01 < o.total) st = 'valor divergente';
  db.prepare('UPDATE orders SET pay_status=?, pay_id=? WHERE id=?').run(st, String(p.id), o.id);
  if (st === 'aprovado' && o.status === 'novo') db.prepare("UPDATE orders SET status='confirmado' WHERE id=?").run(o.id);
  if (st === 'aprovado') { try { tradein.createForOrder(o.id); preorder.onOrderPaid(o); club.earn(o.id); } catch {} autoNfe(o.id); extras.referralPaid(o.id, process.env.PUBLIC_URL || lastBase || '').catch(() => {}); if (o.status === 'novo') extras.notifyOrder(o.code, 'confirmado', process.env.PUBLIC_URL || lastBase || '').catch(() => {}); }
  if (o.pay_status !== st) db.prepare('INSERT INTO audit_log(user_name,action,detail,ip) VALUES(?,?,?,?)').run('Mercado Pago', 'pagamento', `${o.code}: ${st} (R$ ${p.transaction_amount})`, '');
  return st;
}
app.post('/api/payments/mp/webhook', async (req, res) => {
  res.sendStatus(200); // responde rápido; processa em seguida
  try {
    const id = String(req.query['data.id'] || (req.body && req.body.data && req.body.data.id) || req.query.id || '');
    const type = req.query.type || req.query.topic || (req.body && req.body.type);
    if (!id || !/^\d+$/.test(id) || (type && type !== 'payment')) return;
    const secret = process.env.MP_WEBHOOK_SECRET || getSettings().mp_webhook_secret;
    if (secret) { // valida a assinatura x-signature do Mercado Pago
      const sig = Object.fromEntries(String(req.headers['x-signature'] || '').split(',').map((x) => x.trim().split('=')));
      const manifest = `id:${id};request-id:${req.headers['x-request-id'] || ''};ts:${sig.ts};`;
      const h = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
      if (!sig.v1 || sig.v1.length !== h.length || !crypto.timingSafeEqual(Buffer.from(h), Buffer.from(sig.v1))) return;
    }
    if (!mpToken()) return;
    applyPayment(await mpFetch('/v1/payments/' + id));
  } catch (e) { console.error('webhook MP:', e.message); }
});
app.post('/api/orders/:code/sync', limit('pay-sync', 30, 600000), async (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE code=?').get(String(req.params.code).slice(0, 20));
  if (!o || !mpToken()) return res.json({ pay_status: o ? o.pay_status : '' });
  try {
    const pid = String((req.body || {}).payment_id || '');
    let p = null;
    if (/^\d+$/.test(pid)) p = await mpFetch('/v1/payments/' + pid);
    else { const s = await mpFetch(`/v1/payments/search?external_reference=${encodeURIComponent(o.code)}&sort=date_created&criteria=desc`); p = (s.results || [])[0]; }
    const st = p && p.external_reference === o.code ? applyPayment(p) : null;
    res.json({ pay_status: st || o.pay_status });
  } catch { res.json({ pay_status: o.pay_status }); }
});
app.post('/api/orders/:code/pay', limit('pay-link', 20, 600000), async (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE code=?').get(String(req.params.code).slice(0, 20));
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado.' });
  if (o.pay_status === 'aprovado') return res.status(400).json({ error: 'Este pedido já está pago.' });
  if (o.status === 'cancelado' || !['pix', 'card'].includes(o.payment) || !onlinePay()) return res.status(400).json({ error: 'Pagamento online indisponível para este pedido.' });
  try { res.json({ url: await createPreference(req, o.code) }); }
  catch (e) { res.status(502).json({ error: 'Não foi possível abrir o pagamento agora. Fale com um consultor.' }); }
});

/* ---- e-mails de pedido ---- */
const STATUS_MAIL = {
  novo: ['Recebemos seu pedido', 'Seu pedido foi reservado. Assim que o pagamento for confirmado, começamos a separar tudo com cuidado.'],
  confirmado: ['Pedido confirmado', 'Pagamento confirmado! Seu pedido já está sendo preparado.'],
  enviado: ['Seu pedido está a caminho', 'Seu pedido saiu para entrega.'],
  pronto: ['Pronto para retirada', 'Seu pedido está separado esperando por você na loja.'],
  entregue: ['Pedido entregue', 'Esperamos que você ame seu upgrade! Que tal contar como foi?'],
  cancelado: ['Pedido cancelado', 'Seu pedido foi cancelado. Se tiver dúvidas, fale com a nossa equipe.']
};
async function sendOrderEmail(req, code, status) {
  const o = db.prepare('SELECT * FROM orders WHERE code=?').get(code);
  if (!o || !STATUS_MAIL[status]) return;
  const cust = J(o.customer, {});
  const email = cust.email || (o.customer_id && (db.prepare('SELECT email FROM customers WHERE id=?').get(o.customer_id) || {}).email);
  if (!email || !EMAIL_RE.test(email)) return;
  const d = J(o.delivery, {}), base = baseUrl(req);
  const [title, intro] = STATUS_MAIL[status];
  const addr = d.address && typeof d.address === 'object'
    ? [d.address.street, d.address.number, d.address.complement, d.address.district, `${d.address.city}/${d.address.uf || ''}`, d.address.cep].filter(Boolean).join(', ') : d.address || '';
  const body = mailer.itemsTable(J(o.items, [])) + `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;font-size:14px">
      ${o.discount ? `<tr><td style="padding:4px 0;color:#b9b9c0">Cupom</td><td align="right" style="color:#f3dca4">− ${mailer.brl(o.discount)}</td></tr>` : ''}
      ${o.pix_discount ? `<tr><td style="padding:4px 0;color:#b9b9c0">Desconto Pix</td><td align="right" style="color:#f3dca4">− ${mailer.brl(o.pix_discount)}</td></tr>` : ''}
      <tr><td style="padding:4px 0;color:#b9b9c0">${o.delivery_method === 'pickup' ? 'Retirada' : 'Entrega'}</td><td align="right" style="color:#e9e9ec">${o.shipping ? mailer.brl(o.shipping) : 'Grátis'}</td></tr>
      <tr><td style="padding:10px 0 4px;color:#ffffff;font-size:16px"><b>Total</b></td><td align="right" style="padding-top:10px;color:#ffffff;font-size:16px"><b>${mailer.brl(o.total)}</b></td></tr>
    </table>
    <p style="margin:18px 0 0;font-size:13px;color:#b9b9c0;line-height:1.6"><b style="color:#e9e9ec">${mailer.esc(d.label || '')}</b> · ${mailer.esc(d.eta || '')}<br>${mailer.esc(addr)}</p>
    ${o.tracking && status === 'enviado' ? `<p style="margin:16px 0 0;padding:14px;border:1px dashed #6b5a35;border-radius:12px;font-size:14px;color:#f3dca4">Código de rastreio: <b>${mailer.esc(o.tracking)}</b></p>` : ''}`;
  await mailer.send(email, `${title} · Pedido ${o.code}`, mailer.layout({
    preheader: `${title} — pedido ${o.code}`, title: `${title} <span style="color:#d6b26e">#${mailer.esc(o.code)}</span>`,
    intro: `Olá, ${mailer.esc(String(cust.name || '').split(' ')[0])}! ${intro}`, body,
    button: { label: status === 'entregue' ? 'Avaliar minha compra' : 'Acompanhar pedido', url: status === 'entregue' ? `${base}/minha-conta` : `${base}/pedido/${o.code}` }
  }), 'pedido');
}

/* ---- lista de desejos ---- */
app.get('/api/account/wishlist', customerAuth, (req, res) => {
  res.json(db.prepare('SELECT product_id FROM wishlist WHERE customer_id=? ORDER BY created_at DESC').all(req.customer.id).map((r) => r.product_id));
});
app.post('/api/account/wishlist', customerAuth, limit('wish', 120, 600000), (req, res) => {
  const b = req.body || {};
  // sincroniza a lista do navegador (visitante) com a conta
  const ids = (Array.isArray(b.ids) ? b.ids : [b.product_id]).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 100);
  const exists = db.prepare('SELECT id FROM products WHERE id=?');
  const ins = db.prepare('INSERT OR IGNORE INTO wishlist(customer_id, product_id) VALUES(?,?)');
  ids.forEach((id) => { if (exists.get(id)) ins.run(req.customer.id, id); });
  if (db.prepare('SELECT COUNT(*) n FROM wishlist WHERE customer_id=?').get(req.customer.id).n > 200)
    return res.status(400).json({ error: 'Sua lista de desejos atingiu o limite.' });
  res.json(db.prepare('SELECT product_id FROM wishlist WHERE customer_id=?').all(req.customer.id).map((r) => r.product_id));
});
app.delete('/api/account/wishlist/:id', customerAuth, (req, res) => {
  db.prepare('DELETE FROM wishlist WHERE customer_id=? AND product_id=?').run(req.customer.id, parseInt(req.params.id));
  res.json({ ok: true });
});

/* ---- alertas: baixou o preço / chegou no estoque ---- */
app.post('/api/alerts', limit('alert', 15, 3600000, 'Muitos alertas criados. Tente mais tarde.'), async (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
  const b = req.body || {}, cust = getCustomer(req);
  const email = (cust ? cust.email : str(b.email, 120)).toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
  const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(parseInt(b.product_id));
  if (!p) return res.status(400).json({ error: 'Produto inválido.' });
  const type = p.stock <= 0 ? 'stock' : 'price';
  if (db.prepare('SELECT id FROM price_alerts WHERE product_id=? AND email=? AND type=? AND active=1').get(p.id, email, type))
    return res.json({ ok: true, type, message: 'Você já tem um alerta ativo para este produto.' });
  if (db.prepare('SELECT COUNT(*) n FROM price_alerts WHERE email=? AND active=1').get(email).n >= 30) return res.status(400).json({ error: 'Limite de alertas ativos atingido.' });
  const token = crypto.randomBytes(18).toString('hex');
  db.prepare('INSERT INTO price_alerts(product_id,email,customer_id,type,base_price,token) VALUES(?,?,?,?,?,?)').run(p.id, email, cust ? cust.id : null, type, effectivePrice(p), token);
  const base = baseUrl(req);
  mailer.send(email, type === 'stock' ? `Vamos te avisar quando o ${p.name} chegar` : `Alerta de preço criado: ${p.name}`, mailer.layout({
    preheader: 'Seu alerta está ativo.', title: type === 'stock' ? 'Alerta de chegada ativado' : 'Alerta de preço ativado',
    intro: type === 'stock'
      ? `Assim que o <b style="color:#fff">${mailer.esc(p.name)}</b> voltar ao estoque, você recebe um e-mail.`
      : `Hoje o <b style="color:#fff">${mailer.esc(p.name)}</b> está por <b style="color:#f3dca4">${mailer.brl(effectivePrice(p))}</b>. Se o preço baixar, você é o primeiro a saber.`,
    button: { label: 'Ver produto', url: `${base}/produto/${p.slug}` },
    note: `Não quer mais este alerta? <a href="${base}/alerta-cancelar?t=${token}" style="color:#d6b26e">Cancelar alerta</a>.`
  }), 'alerta').catch(() => {});
  res.json({ ok: true, type, message: type === 'stock' ? 'Pronto! Avisaremos por e-mail assim que chegar.' : 'Pronto! Avisaremos por e-mail se o preço baixar.' });
});
app.post('/api/alerts/cancel', limit('alert-cancel', 30, 600000), (req, res) => {
  const t = str((req.body || {}).t, 60);
  const a = t && db.prepare('SELECT id FROM price_alerts WHERE token=?').get(t);
  if (!a) return res.status(400).json({ error: 'Link inválido.' });
  db.prepare('UPDATE price_alerts SET active=0 WHERE id=?').run(a.id);
  res.json({ ok: true });
});
app.get('/api/account/alerts', customerAuth, (req, res) => {
  res.json(db.prepare(`SELECT a.id, a.type, a.base_price, a.active, a.created_at, a.notified_at, p.name, p.slug, p.images, p.price, p.promo_price, p.promo_start, p.promo_end, p.stock
    FROM price_alerts a JOIN products p ON p.id=a.product_id WHERE a.customer_id=? OR a.email=? ORDER BY a.active DESC, a.id DESC LIMIT 100`).all(req.customer.id, req.customer.email)
    .map((a) => ({ id: a.id, type: a.type, base_price: a.base_price, active: !!a.active, created_at: a.created_at, notified_at: a.notified_at, name: a.name, slug: a.slug,
      image: J(a.images, [])[0] || '', price: effectivePrice(a), stock: a.stock })));
});
app.delete('/api/account/alerts/:id', customerAuth, (req, res) => {
  db.prepare('UPDATE price_alerts SET active=0 WHERE id=? AND (customer_id=? OR email=?)').run(parseInt(req.params.id), req.customer.id, req.customer.email);
  res.json({ ok: true });
});
// verifica os alertas: após edições de produto/promoção e a cada 10 minutos (promoções agendadas)
let alertBusy = false;
async function checkAlerts(req) {
  if (alertBusy) return; alertBusy = true;
  try {
    const base = req ? baseUrl(req) : (process.env.PUBLIC_URL || `http://localhost:${PORT}`);
    const rows = db.prepare('SELECT a.*, p.name, p.slug, p.images, p.price, p.promo_price, p.promo_start, p.promo_end, p.stock, p.active AS p_active FROM price_alerts a JOIN products p ON p.id=a.product_id WHERE a.active=1').all();
    for (const a of rows) {
      if (!a.p_active) continue;
      const now = effectivePrice(a);
      const hit = a.type === 'stock' ? a.stock > 0 : now < a.base_price - 0.009;
      if (!hit) continue;
      db.prepare("UPDATE price_alerts SET active=0, notified_at=datetime('now','localtime') WHERE id=?").run(a.id);
      const img = J(a.images, [])[0];
      await mailer.send(a.email, a.type === 'stock' ? `Chegou! ${a.name} disponível na Aladdin Tech` : `Baixou! ${a.name} agora por ${mailer.brl(now)}`, mailer.layout({
        preheader: a.type === 'stock' ? 'O produto que você esperava voltou ao estoque.' : `De ${mailer.brl(a.base_price)} por ${mailer.brl(now)}.`,
        title: a.type === 'stock' ? 'O que você esperava <span style="color:#d6b26e">chegou</span>' : 'O preço <span style="color:#d6b26e">baixou</span>',
        intro: a.type === 'stock' ? `O <b style="color:#fff">${mailer.esc(a.name)}</b> está disponível novamente. As unidades são limitadas.`
          : `O <b style="color:#fff">${mailer.esc(a.name)}</b> saiu de <span style="text-decoration:line-through">${mailer.brl(a.base_price)}</span> para <b style="color:#f3dca4;font-size:18px">${mailer.brl(now)}</b>.`,
        body: img ? `<img src="${mailer.esc(base + img)}" alt="" width="220" style="display:block;margin:6px auto 0;border-radius:14px;max-width:100%">` : '',
        button: { label: 'Quero aproveitar', url: `${base}/produto/${a.slug}` }
      }), 'alerta');
    }
  } finally { alertBusy = false; }
}
jobs.every('alertas-preco', 10 * 60000, () => checkAlerts());

/* ---- frete em tempo real ---- */
app.post('/api/shipping/quote', limit('ship-quote', 60, 600000), async (req, res) => {
  const b = req.body || {}, s = getSettings(), cust = getCustomer(req);
  let a = b.address || {};
  if (b.address_id && cust) { const sv = db.prepare('SELECT * FROM customer_addresses WHERE id=? AND customer_id=?').get(parseInt(b.address_id), cust.id); if (sv) a = sv; }
  const addr = { cep: str(a.cep, 10), city: str(a.city, 80), uf: str(a.uf, 2).toUpperCase() };
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 50).map((i) => {
    const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(parseInt(i.id));
    return p && { id: p.id, qty: Math.min(99, Math.max(1, parseInt(i.qty) || 1)), price: effectivePrice(p) };
  }).filter(Boolean);
  // zonas fixas (ex.: entrega grátis na região) que atendem o endereço
  const fixed = (s.delivery_zones || []).map((z, i) => ({ key: 'z:' + i, name: z.name, fee: round2(z.fee), eta: z.eta, scope: z.scope || 'brasil' }))
    .filter((z) => addr.uf && zoneMatches(s.delivery_zones[+z.key.slice(2)], addr, s));
  let live = null;
  if (integ.shippingLive() && items.length && addr.cep.replace(/\D/g, '').length === 8) live = await liveOptions(addr, items);
  // com frete em tempo real, as opções fixas "todo o Brasil" saem (substituídas pela cotação); se a cotação falhar, elas voltam
  const options = live && live.length ? [...fixed.filter((z) => z.scope !== 'brasil'), ...live] : fixed;
  res.json({ options, live: !!(live && live.length) });
});

/* ---- carrinho (para lembrete de carrinho abandonado) ---- */
let lastBase = '';
app.post('/api/cart/sync', limit('cart-sync', 120, 600000), (req, res) => {
  lastBase = baseUrl(req);
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
  const b = req.body || {};
  try { res.json(integ.syncCart({ token: b.token, items: b.items, customer: getCustomer(req), email: b.email, name: b.name, phone: b.phone, consent: b.consent })); }
  catch (e) { res.status(400).json({ error: 'Não foi possível salvar o carrinho.' }); }
});
app.get('/api/cart/:token', limit('cart-get', 60, 600000), (req, res) => {
  const c = integ.cartForRestore(req.params.token);
  if (!c) return res.status(404).json({ error: 'Carrinho não encontrado.' });
  res.json(c);
});
app.post('/api/cart/stop', limit('cart-stop', 20, 600000), (req, res) => {
  const r = db.prepare('UPDATE carts SET consent=0 WHERE token=?').run(str((req.body || {}).t, 64));
  res.json({ ok: r.changes > 0 });
});
jobs.every('carrinho-abandonado', 5 * 60000, () => integ.cartJob(lastBase || process.env.PUBLIC_URL));

/* ---- painel: carrinhos abandonados ---- */
app.get('/api/admin/carts', auth('orders'), (req, res) => {
  const rows = db.prepare("SELECT * FROM carts WHERE items<>'[]' ORDER BY updated_at DESC LIMIT 300").all().map((c) => ({ ...c, items: J(c.items, []).map((i) => {
    const p = db.prepare('SELECT name, slug FROM products WHERE id=?').get(i.id); return { ...i, name: p ? p.name : 'Produto removido', slug: p ? p.slug : '' }; }) }));
  const sum = (st) => round2(rows.filter((r) => st.includes(r.status)).reduce((t, r) => t + r.subtotal, 0));
  res.json({ carts: rows, open_value: sum(['aberto', 'lembrado']), recovered_value: round2(rows.filter((r) => r.status === 'convertido' && r.reminders > 0).reduce((t, r) => t + r.subtotal, 0)) });
});
app.post('/api/admin/carts/:id/remind', auth('orders'), async (req, res) => {
  const c = db.prepare('SELECT * FROM carts WHERE id=?').get(parseInt(req.params.id));
  if (!c || !c.email) return res.status(400).json({ error: 'Este carrinho não tem e-mail.' });
  if (!c.consent) return res.status(400).json({ error: 'O cliente não autorizou lembretes por e-mail. Use o WhatsApp.' });
  const ok = await integ.sendCartReminder(c, baseUrl(req), (c.reminders || 0) + 1);
  audit(req, 'carrinho_lembrete', c.email);
  res.json({ ok });
});

/* ---- painel: nota fiscal ---- */
app.post('/api/admin/orders/:id/nfe', auth('orders'), async (req, res) => {
  if (!integ.nfeEnabled()) return res.status(400).json({ error: 'Ative a nota fiscal em Configurações (token da Focus NFe).' });
  try { const o = await integ.emitNfe(parseInt(req.params.id), baseUrl(req)); audit(req, 'nfe_emitida', o.code + ' · ' + o.nfe_status); res.json({ ok: true, nfe_status: o.nfe_status, nfe_error: o.nfe_error }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/admin/orders/:id/nfe/refresh', auth('orders'), async (req, res) => {
  try { const o = await integ.refreshNfe(parseInt(req.params.id), baseUrl(req)); res.json({ ok: true, nfe_status: o.nfe_status, nfe_number: o.nfe_number, nfe_danfe: o.nfe_danfe, nfe_error: o.nfe_error }); }
  catch (e) { res.status(400).json({ error: 'Não foi possível consultar a Focus NFe agora.' }); }
});
app.post('/api/admin/orders/:id/nfe/cancel', auth('users'), async (req, res) => {
  try { await integ.cancelNfe(parseInt(req.params.id), (req.body || {}).justificativa); audit(req, 'nfe_cancelada', '#' + req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/admin/integrations/test', auth('users'), async (req, res) => {
  const which = (req.body || {}).which;
  try {
    if (which === 'frete') {
      const p = db.prepare('SELECT id, price FROM products WHERE active=1 LIMIT 1').get();
      const list = await integ.quote(String((req.body || {}).cep || '01310100'), [{ id: p.id, qty: 1, price: p.price }]);
      return res.json({ ok: true, message: list.length ? list.slice(0, 4).map((o) => `${o.name}: R$ ${o.fee.toFixed(2).replace('.', ',')} (${o.eta})`).join(' · ') : 'Conectado, mas nenhuma opção para esse CEP.' });
    }
    if (which === 'nfe') {
      const r = await fetch((process.env.FOCUS_URL || (getSettings().nfe_env === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br')) + '/v2/nfe/teste-conexao-aladdin',
        { headers: { Authorization: 'Basic ' + Buffer.from(((process.env.FOCUS_TOKEN || getSettings().focus_token) || '') + ':').toString('base64') }, signal: AbortSignal.timeout(10000) });
      if (r.status === 401 || r.status === 403) return res.status(400).json({ error: 'Token recusado pela Focus NFe.' });
      return res.json({ ok: true, message: 'Token aceito pela Focus NFe (' + (getSettings().nfe_env === 'producao' ? 'produção' : 'homologação') + ').' });
    }
    res.status(400).json({ error: 'Teste desconhecido.' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ---- cupom + pedido ---- */
function evalCoupon(code, subtotal, customer) {
  if (!code) return { ok: false };
  const c = db.prepare('SELECT * FROM coupons WHERE UPPER(code)=UPPER(?)').get(String(code).trim().slice(0, 40));
  if (!c || !c.active) return { ok: false, error: 'Cupom inválido ou inativo.' };
  if (c.customer_id && (!customer || customer.id !== c.customer_id)) return { ok: false, error: customer ? 'Este cupom é pessoal e pertence a outra conta.' : 'Este cupom é pessoal: entre na sua conta para usar.' };
  if (c.expires_at && new Date(c.expires_at + 'T23:59:59') < new Date()) return { ok: false, error: 'Este cupom expirou.' };
  if (c.max_uses > 0 && c.uses >= c.max_uses) return { ok: false, error: 'Este cupom atingiu o limite de usos.' };
  if (subtotal < c.min_order) return { ok: false, error: `Válido para compras acima de R$ ${c.min_order.toFixed(2).replace('.', ',')}.` };
  let discount = 0;
  if (c.type === 'percent') discount = subtotal * (c.value / 100);
  else if (c.type === 'fixed') discount = Math.min(c.value, subtotal);
  return { ok: true, coupon: c, discount: round2(discount), freeship: c.type === 'freeship' };
}
app.post('/api/coupons/validate', limit('coupon', 30, 600000), (req, res) => {
  const { code, subtotal } = req.body || {};
  const r = evalCoupon(code, Number(subtotal) || 0, getCustomer(req));
  if (!r.ok) return res.json({ ok: false, error: r.error || 'Cupom inválido.' });
  res.json({ ok: true, code: r.coupon.code, type: r.coupon.type, value: r.coupon.value, discount: r.discount, freeship: r.freeship, description: r.coupon.description });
});

async function liveOptions(addr, items) {
  if (!integ.shippingLive()) return null;
  try { return await integ.quote(addr.cep, items); } catch (e) { console.error('Frete:', e.message); return null; }
}
async function computeOrder(body, customer) {
  const s = getSettings();
  const items = [];
  for (const it of (body.items || []).slice(0, 50)) {
    const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(parseInt(it.id));
    if (!p) throw new Error('Um dos produtos do carrinho não está mais disponível.');
    const qty = Math.min(99, Math.max(1, parseInt(it.qty) || 1));
    if (p.stock < qty) throw new Error(`Estoque insuficiente para ${p.name} (disponível: ${p.stock}).`);
    const opts = {};
    const valid = J(p.options, []);
    for (const o of valid) { const v = it.options && it.options[o.name]; if (v && o.values.includes(v)) opts[o.name] = v; }
    if (p.coming_soon) throw new Error(`${p.name} ainda está em pré-venda.`);
    items.push({ id: p.id, name: p.name, price: effectivePrice(p), qty, options: opts, image: J(p.images, [])[0] || '' });
  }
  if (!items.length) throw new Error('Seu carrinho está vazio.');
  const subtotal = round2(items.reduce((a, i) => a + i.price * i.qty, 0));
  const cp = body.coupon ? evalCoupon(body.coupon, subtotal, customer) : { ok: false };
  if (body.coupon && !cp.ok) throw new Error(cp.error || 'Cupom inválido.');
  const discount = cp.ok ? cp.discount : 0;
  let shipping = 0, delivery = {};
  if (body.delivery_method === 'pickup') {
    if (s.pickup_enabled === false) throw new Error('Retirada na loja indisponível no momento.');
    delivery = { label: 'Retirar na loja', address: `${s.address} · ${s.city}`, eta: s.pickup_eta };
  } else {
    // endereço salvo no perfil (somente do próprio cliente) ou digitado no checkout
    let a = body.address || {};
    if (body.address_id && customer) {
      const saved = db.prepare('SELECT * FROM customer_addresses WHERE id=? AND customer_id=?').get(parseInt(body.address_id), customer.id);
      if (saved) a = saved;
    }
    const addr = { cep: str(a.cep, 10), street: str(a.street, 120), number: str(a.number, 20), complement: str(a.complement, 80),
      district: str(a.district, 80), city: str(a.city, 80), uf: str(a.uf, 2).toUpperCase(), recipient: str(a.recipient, 80) };
    const lat = Number(a.lat), lng = Number(a.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat && lng) { addr.lat = lat; addr.lng = lng; }
    if (!addr.cep || !addr.street || !addr.number || !addr.district || !addr.city || !/^[A-Z]{2}$/.test(addr.uf)) throw new Error('Preencha o endereço de entrega completo (com UF).');
    let zone = null;
    const zkey = String(body.zone ?? '');
    if (zkey.startsWith('me:')) {
      const live = await liveOptions(addr, items);
      zone = live && live.find((o) => o.key === zkey);
      if (!zone) throw new Error('Essa opção de frete não está mais disponível. Escolha outra.');
    } else {
      zone = (s.delivery_zones || [])[parseInt(zkey.replace('z:', ''))];
      if (!zone) throw new Error('Selecione uma opção de entrega.');
      if (!zoneMatches(zone, addr, s)) throw new Error('Essa opção de entrega não atende o seu endereço. Escolha outra.');
      if (zone.scope === 'brasil' && integ.shippingLive() && (await liveOptions(addr, items) || []).length) throw new Error('Atualize a página para ver o frete calculado em tempo real.');
    }
    const free = cp.freeship || (s.free_shipping_above > 0 && subtotal - discount >= s.free_shipping_above);
    shipping = free ? 0 : round2(zone.fee);
    delivery = { label: zone.name, eta: zone.eta, address: addr, correios: /correios|pac|sedex/i.test(zone.name), service_id: zone.service_id || null, carrier: zone.carrier || '' };
  }
  const base = Math.max(0, subtotal - discount);
  const pix_discount = body.payment === 'pix' ? round2(base * (Number(s.pix_discount) || 0) / 100) : 0;
  // cashback do Clube: até X% do valor dos produtos; entra como desconto (nota fiscal e totais continuam batendo)
  const cashback = body.use_cashback && customer ? club.usable(customer.id, base - pix_discount) : 0;
  return { items, subtotal, discount: round2(discount + cashback), cashback_used: cashback, pix_discount, shipping, total: round2(base - pix_discount - cashback + shipping), delivery, coupon: cp.ok ? cp.coupon : null };
}
app.post('/api/orders', limit('order', 10, 600000, 'Muitos pedidos em sequência. Aguarde alguns minutos.'), async (req, res) => {
  const b = req.body || {}, c = b.customer || {};
  if (!str(c.name) || String(c.phone || '').replace(/\D/g, '').length < 10) return res.status(400).json({ error: 'Informe nome e WhatsApp com DDD.' });
  if (!['pix', 'card', 'cash'].includes(b.payment)) return res.status(400).json({ error: 'Selecione a forma de pagamento.' });
  if (integ.nfeEnabled() && !integ.cpfValid(c.cpf)) return res.status(400).json({ error: 'Informe um CPF válido — ele é obrigatório para emitir a sua nota fiscal.' });
  const cust = getCustomer(req);
  let o;
  try { o = await computeOrder(b, cust); } catch (e) { return res.status(400).json({ error: e.message }); }
  try {
    db.exec('BEGIN');
    // revalida estoque dentro da transação (outra compra pode ter acontecido durante a cotação do frete)
    for (const i of o.items) { const p = db.prepare('SELECT stock FROM products WHERE id=?').get(i.id); if (!p || p.stock < i.qty) throw new Error('Estoque insuficiente para ' + i.name + '.'); }
    const code = 'AT' + Date.now().toString(36).toUpperCase().slice(-4) + crypto.randomBytes(3).toString('hex').toUpperCase();
    const s = getSettings();
    const inst = b.payment === 'card' ? Math.min(Math.max(1, parseInt(b.installments) || 1), s.max_installments || 12) : 1;
    if (cust && !str(c.email)) c.email = cust.email;
    db.prepare(`INSERT INTO orders(customer_id,code,customer,items,subtotal,discount,pix_discount,shipping,total,coupon,delivery_method,delivery,payment,installments,notes)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(cust ? cust.id : null, code,
      JSON.stringify({ name: str(c.name, 80), phone: str(c.phone, 20), email: str(c.email, 120), cpf: str(c.cpf, 14) }),
      JSON.stringify(o.items), o.subtotal, o.discount, o.pix_discount, o.shipping, o.total, o.coupon ? o.coupon.code : '',
      b.delivery_method === 'pickup' ? 'pickup' : 'delivery', JSON.stringify(o.delivery), b.payment, inst, str(b.notes, 500));
    for (const i of o.items) db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(i.qty, i.id);
    if (o.coupon) db.prepare('UPDATE coupons SET uses=uses+1 WHERE id=?').run(o.coupon.id);
    if (o.cashback_used > 0) { const oid = db.prepare('SELECT id FROM orders WHERE code=?').get(code).id; db.prepare('UPDATE orders SET cashback_used=? WHERE id=?').run(o.cashback_used, oid); club.spend(cust.id, oid, code, o.cashback_used); }
    const seller = sellerByRef(b.seller);
    if (seller) db.prepare('UPDATE orders SET seller_id=?, seller_source=? WHERE code=?')
      .run(seller.id, ['link', 'whatsapp', 'checkout'].includes(b.seller_source) ? b.seller_source : 'checkout', code);
    db.exec('COMMIT');
    let pay_url = '';
    if (onlinePay() && ['pix', 'card'].includes(b.payment)) {
      try { pay_url = await createPreference(req, code); } catch (e) { console.error('Mercado Pago:', e.message); }
    }
    // salva o endereço novo no perfil, se o cliente pediu
    if (cust && b.save_address && b.delivery_method !== 'pickup' && !b.address_id) {
      try {
        const a = addrFields({ ...o.delivery.address, label: b.address_label || 'Casa' });
        if (addrValid(a) && db.prepare('SELECT COUNT(*) n FROM customer_addresses WHERE customer_id=?').get(cust.id).n < 10) {
          const first = !db.prepare('SELECT id FROM customer_addresses WHERE customer_id=?').get(cust.id);
          const k = Object.keys(a);
          db.prepare(`INSERT INTO customer_addresses(customer_id,${k},is_default) VALUES(?,${k.map(() => '?')},?)`).run(cust.id, ...k.map((x) => a[x]), first ? 1 : 0);
        }
      } catch {}
    }
    sendOrderEmail(req, code, 'novo').catch(() => {});
    extras.notifyOrder(code, 'novo', baseUrl(req)).catch(() => {});
    try { const oid = db.prepare('SELECT id FROM orders WHERE code=?').get(code).id; ops.snapshotCosts(oid); ops.reserveForOrder(oid); } catch (e) { console.error('custos/unidades', e.message); }
    try { integ.convertCart(b.cart_token, cust, code); } catch {}
    res.json({ ok: true, code, total: o.total, pay_url });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    res.status(400).json({ error: e.message });
  }
});
app.get('/api/orders/:code', limit('order-view', 60, 600000), (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE code=?').get(String(req.params.code).slice(0, 20));
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado' });
  const cust = J(o.customer, {});
  res.json({ ...o, customer: { name: cust.name }, customer_id: undefined, pay_id: undefined,
    pay_url: o.pay_status === 'aprovado' ? '' : o.pay_url, online: onlinePay() && ['pix', 'card'].includes(o.payment),
    nfe_ref: undefined, nfe_xml: undefined, nfe_error: undefined, seller_id: undefined, seller_source: undefined, doc_token: undefined, trade: tradein.forOrder(o.id).map((t) => ({ product: t.product_name, opens_at: t.opens_at, max_value: t.max_value })),
    doc_url: o.doc_token && ['confirmado', 'separando', 'enviado', 'pronto', 'entregue'].includes(o.status) ? '/documento/' + o.doc_token : '', nfe_danfe: o.nfe_status === 'autorizado' ? o.nfe_danfe : '',
    items: J(o.items, []), delivery: J(o.delivery, {}) });
});

/* ---- admin: painel ---- */
app.get('/api/admin/stats', auth('dashboard'), (req, res) => {
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const promos = db.prepare('SELECT * FROM products WHERE active=1 AND promo_price>0').all().filter(promoActive).length;
  res.json({
    revenue_month: one(`SELECT COALESCE(SUM(total),0) v FROM orders WHERE status<>'cancelado' AND strftime('%Y-%m',created_at)=strftime('%Y-%m','now','localtime')`).v,
    orders_month: one(`SELECT COUNT(*) v FROM orders WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now','localtime')`).v,
    orders_new: one(`SELECT COUNT(*) v FROM orders WHERE status='novo'`).v,
    products: one('SELECT COUNT(*) v FROM products WHERE active=1').v,
    low_stock: db.prepare('SELECT id,name,stock FROM products WHERE active=1 AND stock<=2 ORDER BY stock').all(),
    reviews_pending: one('SELECT COUNT(*) v FROM reviews WHERE approved=0').v,
    questions_pending: one("SELECT COUNT(*) v FROM questions WHERE answer=''").v,
    promos_active: promos,
    rating: one('SELECT ROUND(AVG(rating),1) v FROM reviews WHERE approved=1').v,
    recent: db.prepare('SELECT id,code,customer,total,status,created_at,delivery_method,payment FROM orders ORDER BY id DESC LIMIT 8').all().map((o) => ({ ...o, customer: J(o.customer, {}) })),
    daily: db.prepare(`SELECT date(created_at) d, SUM(total) v, COUNT(*) n FROM orders WHERE status<>'cancelado'
      AND created_at >= date('now','localtime','-13 day') GROUP BY d ORDER BY d`).all()
  });
});

// produtos
app.get('/api/admin/products', auth('products'), (req, res) => {
  res.json(db.prepare(`SELECT p.*, c.name AS category_name, c.icon AS category_icon,
    (SELECT COUNT(*) FROM questions q WHERE q.product_id=p.id AND q.answer='') AS open_questions
    FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY p.id DESC`).all().map(productAdmin));
});
function productFields(b) {
  const imgs = (Array.isArray(b.images) ? b.images : []).filter(isUpload).slice(0, 10);
  const specs = (Array.isArray(b.specs) ? b.specs : []).map((s) => ({ k: str(s.k, 60), v: str(s.v, 200) })).filter((s) => s.k).slice(0, 40);
  const options = (Array.isArray(b.options) ? b.options : []).map((o) => ({ name: str(o.name, 40),
    values: (Array.isArray(o.values) ? o.values : []).map((v) => str(v, 40)).filter(Boolean).slice(0, 20) })).filter((o) => o.name && o.values.length).slice(0, 6);
  const dt = (v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v || '') ? v : '';
  return {
    name: str(b.name, 120), category_id: parseInt(b.category_id) || null, brand: str(b.brand, 60), condition: str(b.condition, 30) || 'Novo',
    short: str(b.short, 160), description: str(b.description, 8000), price: round2(b.price), old_price: round2(b.old_price),
    promo_price: round2(b.promo_price), promo_start: dt(b.promo_start), promo_end: dt(b.promo_end),
    stock: Math.max(0, parseInt(b.stock) || 0), sku: str(b.sku, 40), cost: round2(b.cost), warranty: str(b.warranty, 120), warranty_months: Math.min(60, Math.max(0, parseInt(b.warranty_months) || 0)),
    grade: ['A', 'B', 'C'].includes(b.grade) ? b.grade : '', battery_health: Math.min(100, Math.max(0, parseInt(b.battery_health) || 0)),
    imei_checked: b.imei_checked ? 1 : 0, real_photos: b.real_photos ? 1 : 0, used_notes: str(b.used_notes, 300), included: str(b.included, 160),
    videos: JSON.stringify((Array.isArray(b.videos) ? b.videos : String(b.videos || '').split(/\s+/)).map((u) => String(u).trim())
      .filter((u) => /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|instagram\.com|tiktok\.com|vm\.tiktok\.com)\//i.test(u)).slice(0, 6)),
    gtin: String(b.gtin || '').replace(/\D/g, '').slice(0, 14),
    track_units: b.track_units ? 1 : 0,
    ml_item_id: /^ML[A-Z]\d{6,14}$/i.test(String(b.ml_item_id || '').trim()) ? String(b.ml_item_id).trim().toUpperCase() : '',
    shopee_item_id: String(b.shopee_item_id || '').replace(/\D/g, '').slice(0, 20),
    coming_soon: b.coming_soon ? 1 : 0, coming_eta: str(b.coming_eta, 80), preorder_deposit: Math.max(0, round2(b.preorder_deposit) || 0), preorder_units: Math.max(0, parseInt(b.preorder_units) || 0),
    sold_base: Math.min(1000000, Math.max(0, parseInt(b.sold_base) || 0)),
    ncm: String(b.ncm || '').replace(/\D/g, '').slice(0, 8), weight_kg: Math.max(0, Number(b.weight_kg) || 0),
    width_cm: Math.max(0, Number(b.width_cm) || 0), height_cm: Math.max(0, Number(b.height_cm) || 0), length_cm: Math.max(0, Number(b.length_cm) || 0),
    images: JSON.stringify(imgs), specs: JSON.stringify(specs), options: JSON.stringify(options),
    featured: b.featured ? 1 : 0, active: b.active === false ? 0 : 1, updated_at: localNow().replace('T', ' ')
  };
}
function validateProduct(f) {
  if (f.name.length < 3) return 'Informe o título do produto.';
  if (!(f.price > 0) && !f.coming_soon) return 'Informe o preço de venda (em pré-venda pode ficar “a confirmar”).';
  if (f.promo_price && f.promo_price >= f.price) return 'O preço promocional precisa ser menor que o preço de venda.';
  if (f.promo_start && f.promo_end && f.promo_end <= f.promo_start) return 'O fim da promoção deve ser depois do início.';
  return null;
}
app.post('/api/admin/products', auth('products'), (req, res) => {
  const f = productFields(req.body || {});
  const err = validateProduct(f); if (err) return res.status(400).json({ error: err });
  f.slug = uniqueSlug('products', f.name);
  const keys = Object.keys(f);
  const r = db.prepare(`INSERT INTO products(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...keys.map((k) => f[k]));
  audit(req, 'produto_criado', f.name);
  ops.recount(Number(r.lastInsertRowid));
  res.json({ ok: true, id: Number(r.lastInsertRowid), slug: f.slug });
});
app.put('/api/admin/products/:id', auth('products'), (req, res) => {
  const id = parseInt(req.params.id);
  const before = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  if (!before) return res.status(404).json({ error: 'Produto não encontrado.' });
  const f = productFields(req.body || {});
  const err = validateProduct(f); if (err) return res.status(400).json({ error: err });
  f.slug = uniqueSlug('products', f.name, id);
  const keys = Object.keys(f);
  db.prepare(`UPDATE products SET ${keys.map((k) => k + '=?').join(',')} WHERE id=?`).run(...keys.map((k) => f[k]), id);
  const changes = ['price', 'promo_price', 'stock', 'active'].filter((k) => before[k] !== f[k]).map((k) => `${k}: ${before[k]} → ${f[k]}`);
  audit(req, 'produto_editado', f.name + (changes.length ? ' · ' + changes.join(', ') : ''));
  ops.recount(id);
  setImmediate(() => checkAlerts(req).catch(() => {}));
  res.json({ ok: true, slug: f.slug });
});
app.post('/api/admin/products/:id/duplicate', auth('products'), (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(parseInt(req.params.id));
  if (!p) return res.status(404).json({ error: 'Produto não encontrado.' });
  delete p.id; p.name = p.name + ' (cópia)'; p.slug = uniqueSlug('products', p.name); p.active = 0; p.created_at = localNow().replace('T', ' ');
  const keys = Object.keys(p).filter((k) => !['rating', 'rating_count'].includes(k));
  const r = db.prepare(`INSERT INTO products(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...keys.map((k) => p[k]));
  audit(req, 'produto_duplicado', p.name);
  res.json({ ok: true, id: Number(r.lastInsertRowid) });
});
app.delete('/api/admin/products/:id', auth('products'), (req, res) => {
  const p = db.prepare('SELECT name FROM products WHERE id=?').get(parseInt(req.params.id));
  db.prepare('DELETE FROM products WHERE id=?').run(parseInt(req.params.id));
  audit(req, 'produto_excluido', p ? p.name : req.params.id);
  res.json({ ok: true });
});
app.post('/api/admin/upload', auth(), (req, res) => {
  if (!can(req.user, 'products') && !can(req.user, 'settings')) return res.status(403).json({ error: 'Sem permissão para enviar imagens.' });
  try { res.json({ url: saveImage((req.body || {}).data, (req.body || {}).folder === 'loja' ? 'loja' : 'produtos', 8 * 1048576) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// promoções em massa
app.post('/api/admin/promos/bulk', auth('promos'), (req, res) => {
  const b = req.body || {};
  const pct = Number(b.percent);
  if (!(pct > 0 && pct < 90)) return res.status(400).json({ error: 'Informe um desconto entre 1% e 89%.' });
  const dt = (v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v || '') ? v : '';
  const start = dt(b.start), end = dt(b.end);
  if (start && end && end <= start) return res.status(400).json({ error: 'O fim deve ser depois do início.' });
  let ids = Array.isArray(b.product_ids) ? b.product_ids.map(Number).filter(Boolean) : [];
  if (b.category_id) ids = db.prepare('SELECT id FROM products WHERE category_id=?').all(parseInt(b.category_id)).map((r) => r.id);
  if (b.all) ids = db.prepare('SELECT id FROM products').all().map((r) => r.id);
  if (!ids.length) return res.status(400).json({ error: 'Selecione os produtos da promoção.' });
  const st = db.prepare('UPDATE products SET promo_price=ROUND(price*(1-?/100.0),2), promo_start=?, promo_end=? WHERE id=?');
  db.exec('BEGIN'); ids.forEach((id) => st.run(pct, start, end, id)); db.exec('COMMIT');
  audit(req, 'promocao_aplicada', `${pct}% em ${ids.length} produto(s)`);
  setImmediate(() => checkAlerts(req).catch(() => {}));
  res.json({ ok: true, count: ids.length });
});
app.post('/api/admin/promos/clear', auth('promos'), (req, res) => {
  const ids = Array.isArray((req.body || {}).product_ids) ? req.body.product_ids.map(Number).filter(Boolean) : [];
  const st = db.prepare("UPDATE products SET promo_price=0, promo_start='', promo_end='' WHERE id=?");
  ids.forEach((id) => st.run(id));
  audit(req, 'promocao_encerrada', `${ids.length} produto(s)`);
  res.json({ ok: true });
});

// categorias
app.post('/api/admin/categories', auth('categories'), (req, res) => {
  const { name, icon, sort } = req.body || {};
  if (!str(name)) return res.status(400).json({ error: 'Informe o nome.' });
  db.prepare('INSERT INTO categories(name,slug,icon,sort) VALUES(?,?,?,?)').run(str(name, 60), uniqueSlug('categories', name), str(icon, 30) || 'acessorios', parseInt(sort) || 0);
  audit(req, 'categoria_criada', name); res.json({ ok: true });
});
app.put('/api/admin/categories/:id', auth('categories'), (req, res) => {
  const { name, icon, sort } = req.body || {};
  const id = parseInt(req.params.id);
  if (!str(name)) return res.status(400).json({ error: 'Informe o nome.' });
  db.prepare('UPDATE categories SET name=?, slug=?, icon=?, sort=? WHERE id=?').run(str(name, 60), uniqueSlug('categories', name, id), str(icon, 30) || 'acessorios', parseInt(sort) || 0, id);
  audit(req, 'categoria_editada', name); res.json({ ok: true });
});
app.delete('/api/admin/categories/:id', auth('categories'), (req, res) => {
  const id = parseInt(req.params.id);
  if (db.prepare('SELECT COUNT(*) c FROM products WHERE category_id=?').get(id).c > 0)
    return res.status(400).json({ error: 'Mova ou exclua os produtos desta categoria antes de removê-la.' });
  db.prepare('DELETE FROM categories WHERE id=?').run(id);
  audit(req, 'categoria_excluida', id); res.json({ ok: true });
});

// cupons
app.get('/api/admin/coupons', auth('coupons'), (req, res) => res.json(db.prepare('SELECT * FROM coupons ORDER BY id DESC').all()));
function couponFields(b) {
  return { code: str(b.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, ''), type: ['percent', 'fixed', 'freeship'].includes(b.type) ? b.type : 'percent',
    value: Math.max(0, Number(b.value) || 0), min_order: Math.max(0, Number(b.min_order) || 0), max_uses: Math.max(0, parseInt(b.max_uses) || 0),
    expires_at: /^\d{4}-\d{2}-\d{2}$/.test(b.expires_at || '') ? b.expires_at : '', description: str(b.description, 120), active: b.active === false ? 0 : 1 };
}
function validCoupon(f) {
  if (f.code.length < 3) return 'O código precisa de pelo menos 3 letras ou números.';
  if (f.type === 'percent' && !(f.value > 0 && f.value <= 90)) return 'O percentual deve ficar entre 1% e 90%.';
  if (f.type === 'fixed' && !(f.value > 0)) return 'Informe o valor do desconto.';
  return null;
}
app.post('/api/admin/coupons', auth('coupons'), (req, res) => {
  const f = couponFields(req.body || {}); const err = validCoupon(f); if (err) return res.status(400).json({ error: err });
  try { const k = Object.keys(f); db.prepare(`INSERT INTO coupons(${k}) VALUES(${k.map(() => '?')})`).run(...k.map((x) => f[x])); audit(req, 'cupom_criado', f.code); res.json({ ok: true }); }
  catch { res.status(400).json({ error: 'Já existe um cupom com esse código.' }); }
});
app.put('/api/admin/coupons/:id', auth('coupons'), (req, res) => {
  const f = couponFields(req.body || {}); const err = validCoupon(f); if (err) return res.status(400).json({ error: err });
  try { const k = Object.keys(f); db.prepare(`UPDATE coupons SET ${k.map((x) => x + '=?')} WHERE id=?`).run(...k.map((x) => f[x]), parseInt(req.params.id)); audit(req, 'cupom_editado', f.code); res.json({ ok: true }); }
  catch { res.status(400).json({ error: 'Já existe um cupom com esse código.' }); }
});
app.delete('/api/admin/coupons/:id', auth('coupons'), (req, res) => {
  db.prepare('DELETE FROM coupons WHERE id=?').run(parseInt(req.params.id)); audit(req, 'cupom_excluido', req.params.id); res.json({ ok: true });
});

// pedidos
app.get('/api/admin/orders', auth('orders'), (req, res) => {
  res.json(db.prepare('SELECT o.*, u.name seller_name FROM orders o LEFT JOIN users u ON u.id=o.seller_id ORDER BY o.id DESC LIMIT 1000').all()
    .map((o) => ({ ...o, customer: J(o.customer, {}), items: J(o.items, []), delivery: J(o.delivery, {}) })));
});
app.put('/api/admin/orders/:id', auth('orders'), async (req, res) => {
  const allowed = ['novo', 'confirmado', 'separando', 'enviado', 'pronto', 'entregue', 'cancelado'];
  const { status, notify } = req.body || {};
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  const id = parseInt(req.params.id);
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado.' });
  const tracking = 'tracking' in (req.body || {}) ? str(req.body.tracking, 40).toUpperCase().replace(/[^A-Z0-9]/g, '') : o.tracking;
  db.exec('BEGIN');
  if (o.kind !== 'sinal' && status === 'cancelado' && o.status !== 'cancelado') for (const i of J(o.items, [])) db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(i.qty, i.id);
  if (o.kind !== 'sinal' && o.status === 'cancelado' && status !== 'cancelado') for (const i of J(o.items, [])) db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(i.qty, i.id);
  db.prepare('UPDATE orders SET status=?, tracking=? WHERE id=?').run(status, tracking, id);
  db.exec('COMMIT');
  audit(req, 'pedido_status', `${o.code}: ${o.status} → ${status}${tracking !== o.tracking ? ' · rastreio ' + tracking : ''}`);
  let mailed = false;
  if (notify !== false && (status !== o.status || (status === 'enviado' && tracking !== o.tracking))) { sendOrderEmail(req, o.code, status).catch(() => {}); mailed = true; }
  if (status === 'confirmado' && o.status !== 'confirmado') autoNfe(id, baseUrl(req));
  if (['entregue', 'cancelado'].includes(status) && o.reserve_until) db.prepare("UPDATE orders SET reserve_until='' WHERE id=?").run(id);
  const PAID = ['confirmado', 'separando', 'enviado', 'pronto', 'entregue'];
  if (PAID.includes(status) && !PAID.includes(o.status)) { extras.referralPaid(id, baseUrl(req)).catch(() => {}); try { tradein.createForOrder(id); preorder.onOrderPaid(o); club.earn(id); } catch (e) { console.error('pago', e.message); } }
  if (status === 'cancelado' && o.status !== 'cancelado') ops.releaseForOrder(id);
  if (status === 'entregue' && o.status !== 'entregue') ops.finalizeOrder(id);
  if (status === 'cancelado' && o.status !== 'cancelado') { tradein.cancelForOrder(id); preorder.onOrderCancelled(o); club.refund(id); }
  if (status !== o.status && PUSH_TEXT[status]) push.toOrder(o.code, o.customer_id, { title: PUSH_TEXT[status][0], body: `Pedido ${o.code}: ${PUSH_TEXT[status][1]}`, url: '/pedido/' + o.code, tag: 'pedido-' + o.code, urgent: true }).catch(() => {});
  let whatsapp = null;
  if (notify !== false && (status !== o.status || (status === 'enviado' && tracking !== o.tracking))) whatsapp = await extras.notifyOrder(o.code, status, baseUrl(req)).catch(() => null);
  res.json({ ok: true, mailed, whatsapp: whatsapp && whatsapp.ok ? 'enviado' : extras.waReady() ? (whatsapp && whatsapp.error) || '' : 'manual' });
});

// clientes cadastrados
app.get('/api/admin/customers', auth('orders'), (req, res) => {
  res.json(db.prepare(`SELECT c.id, c.name, c.email, c.phone, c.created_at, c.avatar, c.city, c.uf, c.email_verified, c.marketing,
    (SELECT city || '/' || uf FROM customer_addresses a WHERE a.customer_id=c.id ORDER BY is_default DESC LIMIT 1) AS address_city,
    (SELECT COUNT(*) FROM orders o WHERE o.customer_id=c.id) AS orders,
    (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.customer_id=c.id AND o.status<>'cancelado') AS spent,
    (SELECT COUNT(*) FROM reviews r WHERE r.customer_id=c.id) AS reviews,
    (SELECT COALESCE(SUM(amount),0) FROM cashback cb WHERE cb.customer_id=c.id) AS cashback
    FROM customers c ORDER BY c.id DESC LIMIT 1000`).all().map((c) => ({ ...c, cashback: round2(Math.max(0, c.cashback)), tier: club.tier(c.id).name })));
});

// avaliações
app.get('/api/admin/reviews', auth('reviews'), (req, res) => {
  res.json(db.prepare(`SELECT r.*, p.name AS product_name, p.slug AS product_slug FROM reviews r LEFT JOIN products p ON p.id=r.product_id
    ORDER BY r.approved ASC, r.id DESC LIMIT 500`).all().map((r) => ({ ...r, photos: J(r.photos, []) })));
});
app.put('/api/admin/reviews/:id', auth('reviews'), (req, res) => {
  const b = req.body || {}, id = parseInt(req.params.id);
  if ('approved' in b) db.prepare('UPDATE reviews SET approved=? WHERE id=?').run(b.approved ? 1 : 0, id);
  if ('reply' in b) db.prepare("UPDATE reviews SET reply=?, reply_at=CASE WHEN ?='' THEN '' ELSE datetime('now','localtime') END WHERE id=?").run(str(b.reply, 1000), str(b.reply, 1000), id);
  if ('remove_photo' in b) {
    const r = db.prepare('SELECT photos FROM reviews WHERE id=?').get(id);
    if (r) { const ph = J(r.photos, []); deleteUpload(b.remove_photo); db.prepare('UPDATE reviews SET photos=? WHERE id=?').run(JSON.stringify(ph.filter((u) => u !== b.remove_photo)), id); }
  }
  audit(req, 'avaliacao_moderada', `#${id} ${JSON.stringify(Object.keys(b))}`);
  res.json({ ok: true });
});
app.delete('/api/admin/reviews/:id', auth('reviews'), (req, res) => {
  const r = db.prepare('SELECT photos FROM reviews WHERE id=?').get(parseInt(req.params.id));
  if (r) J(r.photos, []).forEach(deleteUpload);
  db.prepare('DELETE FROM reviews WHERE id=?').run(parseInt(req.params.id));
  audit(req, 'avaliacao_excluida', '#' + req.params.id); res.json({ ok: true });
});

// perguntas
app.get('/api/admin/questions', auth('questions'), (req, res) => {
  res.json(db.prepare(`SELECT q.*, p.name AS product_name, p.slug AS product_slug, p.images AS product_images FROM questions q
    LEFT JOIN products p ON p.id=q.product_id ORDER BY (q.answer='') DESC, q.id DESC LIMIT 500`).all()
    .map((q) => ({ ...q, product_image: J(q.product_images, [])[0] || '', product_images: undefined })));
});
app.put('/api/admin/questions/:id', auth('questions'), (req, res) => {
  const b = req.body || {}, id = parseInt(req.params.id);
  if ('answer' in b) db.prepare("UPDATE questions SET answer=?, answered_by=?, answered_at=datetime('now','localtime') WHERE id=?").run(str(b.answer, 1500), req.user.name, id);
  if ('public' in b) db.prepare('UPDATE questions SET public=? WHERE id=?').run(b.public ? 1 : 0, id);
  audit(req, 'pergunta_respondida', '#' + id); res.json({ ok: true });
});
app.delete('/api/admin/questions/:id', auth('questions'), (req, res) => {
  db.prepare('DELETE FROM questions WHERE id=?').run(parseInt(req.params.id)); audit(req, 'pergunta_excluida', '#' + req.params.id); res.json({ ok: true });
});

// configurações
app.get('/api/admin/settings', auth('settings'), (req, res) => {
  const s = getSettings(); delete s.admin_password; delete s.vapid_private;
  for (const k of SECRET_KEYS) if (k in s) s[k] = mask(s[k]);
  if (req.user.role !== 'owner') for (const k of OWNER_KEYS) delete s[k];
  s.shipping_live = integ.shippingLive(); s.nfe_on = integ.nfeEnabled();
  s.mp_env_token = !!process.env.MP_ACCESS_TOKEN;
  s.mail_ready = mailer.ready();
  res.json(s);
});

/* ---- e-mails: caixa de saída, teste e campanhas de ofertas ---- */
app.get('/api/admin/emails', auth('coupons'), (req, res) => {
  res.json({ ready: mailer.ready(),
    audience: db.prepare('SELECT COUNT(*) n FROM customers WHERE marketing=1').get().n,
    audience_verified: db.prepare('SELECT COUNT(*) n FROM customers WHERE marketing=1 AND email_verified=1').get().n,
    alerts: db.prepare(`SELECT p.name, a.type, COUNT(*) n FROM price_alerts a JOIN products p ON p.id=a.product_id WHERE a.active=1 GROUP BY p.id, p.name, a.type ORDER BY n DESC LIMIT 20`).all(),
    list: db.prepare('SELECT id,to_addr,subject,kind,status,error,created_at FROM emails ORDER BY id DESC LIMIT 300').all() });
});
app.get('/api/admin/emails/:id/preview', auth('coupons'), (req, res) => {
  const e = db.prepare('SELECT html FROM emails WHERE id=?').get(parseInt(req.params.id));
  if (!e) return res.status(404).end();
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src * data:; style-src 'unsafe-inline'; frame-ancestors 'self'");
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.type('html').send(e.html);
});
app.post('/api/admin/emails/test', auth('users'), limit('mail-test', 10, 600000), async (req, res) => {
  const to = str((req.body || {}).to, 120);
  if (!EMAIL_RE.test(to)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
  const st = await mailer.send(to, 'Teste de e-mail — Aladdin Tech', mailer.layout({ title: 'Tudo certo por aqui ✦', intro: 'Se você recebeu esta mensagem, os e-mails da loja estão configurados corretamente.' }), 'teste');
  const last = db.prepare('SELECT error FROM emails ORDER BY id DESC LIMIT 1').get();
  if (st === 'erro') return res.status(400).json({ error: 'Falha no envio: ' + (last ? last.error : '') });
  res.json({ ok: true, status: st });
});
app.post('/api/admin/campaign', auth('coupons'), limit('campaign', 10, 3600000), async (req, res) => {
  const b = req.body || {};
  const subject = str(b.subject, 120), title = str(b.title, 140), message = str(b.message, 3000);
  if (subject.length < 3 || title.length < 3) return res.status(400).json({ error: 'Preencha assunto e título.' });
  const ids = (Array.isArray(b.product_ids) ? b.product_ids : []).map(Number).filter(Boolean).slice(0, 8);
  const base = baseUrl(req);
  const products = ids.map((id) => db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(id)).filter(Boolean).map(productPublic)
    .map((p) => ({ ...p, image: p.images[0] || '' }));
  const build = (c) => mailer.layout({
    preheader: subject, title: mailer.esc(title),
    intro: mailer.esc(message).replace(/\n/g, '<br>'),
    body: products.length ? mailer.productGrid(products, base) : '',
    button: { label: str(b.button_label, 40) || 'Ver ofertas', url: `${base}/ofertas` },
    unsubUrl: c ? `${base}/descadastrar?t=${unsubToken(c)}` : `${base}/descadastrar`
  });
  if (b.test_to) {
    if (!EMAIL_RE.test(String(b.test_to))) return res.status(400).json({ error: 'E-mail de teste inválido.' });
    await mailer.send(String(b.test_to), '[TESTE] ' + subject, build(null), 'oferta-teste');
    return res.json({ ok: true, sent: 1, test: true });
  }
  const list = db.prepare(`SELECT * FROM customers WHERE marketing=1 ${b.only_verified === false ? '' : 'AND email_verified=1'}`).all();
  audit(req, 'campanha_email', `${subject} → ${list.length} cliente(s)`);
  res.json({ ok: true, sent: list.length, ready: mailer.ready() });
  for (const c of list) { await mailer.send(c.email, subject, build(c), 'oferta'); } // envia em segundo plano, um a um
});
app.post('/api/admin/payments/test', auth('users'), async (req, res) => {
  const token = (req.body || {}).token && !String(req.body.token).startsWith('••') ? String(req.body.token).trim() : mpToken();
  if (!token) return res.status(400).json({ error: 'Informe o Access Token do Mercado Pago.' });
  try {
    const r = await fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: 'Bearer ' + token } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(400).json({ error: 'Token recusado pelo Mercado Pago. Confira se copiou o Access Token de produção.' });
    res.json({ ok: true, account: d.nickname || d.email || String(d.id), test: String(token).startsWith('TEST-') });
  } catch { res.status(502).json({ error: 'Não foi possível falar com o Mercado Pago agora.' }); }
});
app.put('/api/admin/settings', auth('settings'), (req, res) => {
  const b = req.body || {};
  for (const k of ['team_photo', 'hero_left', 'hero_right'])
    if (k in b && b[k] && !UPLOAD_URL(b[k])) return res.status(400).json({ error: 'Imagem inválida.' });
  if ('wall_photos' in b) b.wall_photos = (Array.isArray(b.wall_photos) ? b.wall_photos : []).filter(UPLOAD_URL).slice(0, 60);
  if ('team_members' in b) b.team_members = (Array.isArray(b.team_members) ? b.team_members : []).map((m) => ({ name: str(m.name, 60), role: str(m.role, 60) })).filter((m) => m.name).slice(0, 30);
  // chaves de pagamento e e-mail: só o Dono altera; valor mascarado = manter o atual
  if ('delivery_zones' in b) b.delivery_zones = (Array.isArray(b.delivery_zones) ? b.delivery_zones : []).map((z) => ({
    name: str(z.name, 60), fee: Math.max(0, round2(z.fee)), eta: str(z.eta, 60),
    scope: ['cidade', 'estado', 'brasil'].includes(z.scope) ? z.scope : 'brasil', values: str(z.values, 300) })).filter((z) => z.name).slice(0, 12);
  if ('store_uf' in b) b.store_uf = str(b.store_uf, 2).toUpperCase();
  if ('about_story' in b) b.about_story = String(b.about_story || '').slice(0, 4000);
  if ('about_stats' in b) b.about_stats = (Array.isArray(b.about_stats) ? b.about_stats : []).map((x) => ({ n: str(x.n, 20), l: str(x.l, 60) })).filter((x) => x.n && x.l).slice(0, 4);
  if ('about_timeline' in b) b.about_timeline = (Array.isArray(b.about_timeline) ? b.about_timeline : []).map((x) => ({ y: str(x.y, 10), t: str(x.t, 200) })).filter((x) => x.y && x.t).slice(0, 10);
  if ('reclameaqui_url' in b) b.reclameaqui_url = /^https:\/\/(www\.)?reclameaqui\.com\.br\//.test(String(b.reclameaqui_url || '')) ? str(b.reclameaqui_url, 200) : '';
  if ('reclameaqui_score' in b) b.reclameaqui_score = str(b.reclameaqui_score, 40);
  ['club_pct_silver', 'club_pct_gold', 'club_pct_diamond', 'club_max_use_pct'].forEach((k) => { if (k in b) b[k] = Math.max(0, Math.min(k === 'club_max_use_pct' ? 100 : 30, Number(b[k]) || 0)); });
  ['club_gold_at', 'club_diamond_at', 'club_expiry_days', 'club_birthday_value'].forEach((k) => { if (k in b) b[k] = Math.max(0, Math.min(1000000, Number(b[k]) || 0)); });
  ['club_enabled', 'reminders_enabled', 'reminders_whatsapp'].forEach((k) => { if (k in b) b[k] = !!b[k]; });
  ['trade_pct_a', 'trade_pct_b', 'trade_pct_c'].forEach((k) => { if (k in b) b[k] = Math.max(0, Math.min(90, Number(b[k]) || 0)); });
  ['trade_months', 'trade_window_days', 'trade_min_price'].forEach((k) => { if (k in b) b[k] = Math.max(k === 'trade_min_price' ? 0 : 1, Math.min(k === 'trade_months' ? 36 : k === 'trade_window_days' ? 365 : 100000, Number(b[k]) || 0)); });
  ['trade_enabled', 'trade_only_new'].forEach((k) => { if (k in b) b[k] = !!b[k]; });
  if ('trade_categories' in b) b.trade_categories = str(b.trade_categories, 200).toLowerCase();
  ['referral_friend_pct', 'referral_reward_value', 'referral_min_order', 'reserve_hours'].forEach((k) => { if (k in b) b[k] = Math.max(0, Math.min(k === 'referral_friend_pct' ? 50 : k === 'reserve_hours' ? 168 : 100000, Number(b[k]) || 0)); });
  ['referral_enabled', 'reserve_enabled', 'wa_notify'].forEach((k) => { if (k in b) b[k] = !!b[k]; });
  if ('wa_provider' in b && !['', 'meta', 'zapi'].includes(b.wa_provider)) b.wa_provider = '';
  if ('ga4_id' in b) { b.ga4_id = str(b.ga4_id, 20).toUpperCase(); if (b.ga4_id && !/^G-[A-Z0-9]{4,12}$/.test(b.ga4_id)) return res.status(400).json({ error: 'ID do Google Analytics inválido (formato G-XXXXXXXXXX).' }); }
  if ('meta_pixel_id' in b) { b.meta_pixel_id = String(b.meta_pixel_id || '').replace(/\D/g, '').slice(0, 20); if (b.meta_pixel_id && b.meta_pixel_id.length < 10) return res.status(400).json({ error: 'ID do Pixel da Meta inválido (só números, 15 ou 16 dígitos).' }); }
  ['warranty_new_months', 'warranty_used_months'].forEach((k) => { if (k in b) b[k] = Math.min(60, Math.max(0, parseInt(b[k]) || 0)); });
  if ('warranty_terms' in b) b.warranty_terms = String(b.warranty_terms || '').slice(0, 4000);
  if ('ranking_metric' in b) b.ranking_metric = b.ranking_metric === 'vendas' ? 'vendas' : 'valor';
  if ('ranking_prize' in b) b.ranking_prize = str(b.ranking_prize, 120);
  ['ranking_public', 'ranking_show_values'].forEach((k) => { if (k in b) b[k] = !!b[k]; });
  if ('faq' in b) b.faq = (Array.isArray(b.faq) ? b.faq : []).map((x) => ({ q: str(x.q, 200), a: str(x.a, 2000) })).filter((x) => x.q && x.a).slice(0, 40);
  ['legal_name', 'cnpj', 'dpo_email', 'policies_updated'].forEach((k) => { if (k in b) b[k] = str(b[k], 120); });
  delete b.ml_tokens; delete b.ml_oauth_state;
  for (const k of OWNER_KEYS) {
    if (!(k in b)) continue;
    if (req.user.role !== 'owner' || (typeof b[k] === 'string' && b[k].startsWith('••'))) delete b[k];
    else if (typeof b[k] === 'string') b[k] = b[k].trim().slice(0, 300);
  }
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in b) setSetting(k, b[k]);
  audit(req, 'configuracoes_salvas', Object.keys(b).filter((k) => k in DEFAULT_SETTINGS).join(', '));
  res.json({ ok: true });
});

// equipe (somente dono)
app.get('/api/admin/users', auth('users'), (req, res) => {
  res.json(db.prepare(`SELECT id,name,username,role,active,must_change,last_login,created_at,photo,${STAFF_PHOTO} photo_shown,whatsapp,title,ref_code,in_ranking,goal,email,
    (SELECT c.email FROM customers c WHERE c.id=u.customer_id) customer_email,
    (SELECT COUNT(*) FROM sessions s WHERE s.user_id=u.id AND s.expires>?) AS sessions FROM users u ORDER BY id`).all(Date.now()));
});
app.post('/api/admin/users', auth('users'), (req, res) => {
  const b = req.body || {};
  const username = str(b.username, 40).toLowerCase().replace(/[^a-z0-9._-]/g, '');
  if (username.length < 3) return res.status(400).json({ error: 'Usuário precisa ter 3+ caracteres (letras, números, ponto).' });
  if (!ROLES[b.role]) return res.status(400).json({ error: 'Perfil inválido.' });
  if (!strongPw(b.password)) return res.status(400).json({ error: 'Senha provisória: 8+ caracteres, com letras e números.' });
  try {
    const r = db.prepare('INSERT INTO users(name,username,password,role,must_change,in_ranking) VALUES(?,?,?,?,1,?)').run(str(b.name, 60) || username, username, hashPw(b.password), b.role, b.role === 'seller' ? 1 : 0);
    db.prepare('UPDATE users SET ref_code=? WHERE id=?').run(uniqueRef(username, r.lastInsertRowid), r.lastInsertRowid);
    const err = applySellerFields(r.lastInsertRowid, b); if (err) return res.status(400).json({ error: err });
    audit(req, 'usuario_criado', `@${username} (${b.role})`); res.json({ ok: true });
  } catch { res.status(400).json({ error: 'Este nome de usuário já existe.' }); }
});
app.put('/api/admin/users/:id', auth('users'), (req, res) => {
  const id = parseInt(req.params.id), b = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const owners = db.prepare("SELECT COUNT(*) c FROM users WHERE role='owner' AND active=1").get().c;
  const demoting = u.role === 'owner' && ((b.role && b.role !== 'owner') || b.active === false);
  if (demoting && owners <= 1) return res.status(400).json({ error: 'A loja precisa de pelo menos um Dono ativo.' });
  if (b.role && ROLES[b.role]) db.prepare('UPDATE users SET role=? WHERE id=?').run(b.role, id);
  if ('name' in b) db.prepare('UPDATE users SET name=? WHERE id=?').run(str(b.name, 60) || u.username, id);
  { const err = applySellerFields(id, b); if (err) return res.status(400).json({ error: err }); }
  if ('active' in b) { db.prepare('UPDATE users SET active=? WHERE id=?').run(b.active ? 1 : 0, id); if (!b.active) db.prepare('DELETE FROM sessions WHERE user_id=?').run(id); }
  if (b.password) {
    if (!strongPw(b.password)) return res.status(400).json({ error: 'Senha provisória: 8+ caracteres, com letras e números.' });
    db.prepare('UPDATE users SET password=?, must_change=1 WHERE id=?').run(hashPw(b.password), id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
  }
  audit(req, 'usuario_editado', `@${u.username} ${Object.keys(b).filter((k) => k !== 'password').join(',')}${b.password ? ' +senha' : ''}`);
  res.json({ ok: true });
});
app.delete('/api/admin/users/:id', auth('users'), (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'Você não pode excluir o próprio usuário.' });
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (u.role === 'owner' && db.prepare("SELECT COUNT(*) c FROM users WHERE role='owner'").get().c <= 1) return res.status(400).json({ error: 'A loja precisa de pelo menos um Dono.' });
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
  db.prepare('DELETE FROM users WHERE id=?').run(id);
  audit(req, 'usuario_excluido', '@' + u.username); res.json({ ok: true });
});
app.get('/api/admin/audit', auth('users'), (req, res) => res.json(db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200').all()));
app.post('/api/admin/sessions/revoke-others', auth(), (req, res) => {
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(req.user.id, req.user.token_hash);
  audit(req, 'sessoes_encerradas'); res.json({ ok: true });
});

/* ---- comissões (somente Dono) ---- */
const ownerOnly = (req, res, next) => req.user.role === 'owner' ? next() : res.status(403).json({ error: 'Somente o Dono pode ver as comissões.' });
const pct = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 50 ? Math.round(n * 100) / 100 : null; };
function commissionCfg() {
  const row = db.prepare('SELECT * FROM commission_config WHERE id=1').get();
  const d = J(row && row.data, {});
  return { default_pct: pct(d.default_pct) ?? 1, by_category: d.by_category || {}, by_seller: d.by_seller || {}, updated_at: row ? row.updated_at : '', updated_by: row ? row.updated_by : '' };
}
function commissionReport(month) {
  const cfg = commissionCfg();
  const catOf = new Map(db.prepare('SELECT id, category_id FROM products').all().map((p) => [p.id, p.category_id]));
  const catName = new Map(db.prepare('SELECT id, name FROM categories').all().map((c) => [c.id, c.name]));
  const users = new Map(db.prepare(`SELECT u.id,u.name,u.title,${STAFF_PHOTO} photo,u.active,u.in_ranking FROM users u`).all().map((u) => [u.id, u]));
  const orders = db.prepare(`SELECT id,code,created_at,items,subtotal,discount,pix_discount,total,channel,seller_id FROM orders
    WHERE seller_id IS NOT NULL AND status IN ${COUNTED} AND substr(created_at,1,7)=? ORDER BY created_at`).all(month);
  const paid = new Map(db.prepare('SELECT * FROM commission_payouts WHERE month=?').all(month).map((p) => [p.user_id, p]));
  const by = new Map();
  const ensure = (id) => { if (!by.has(id)) { const u = users.get(id) || { name: 'Usuário removido' }; by.set(id, { id, name: u.name, title: u.title || '', photo: u.photo || '', active: !!u.active, orders: [], n: 0, sales: 0, base: 0, amount: 0 }); } return by.get(id); };
  for (const u of users.values()) if (u.in_ranking && u.active) ensure(u.id);
  for (const o of orders) {
    const r = ensure(o.seller_id);
    const factor = o.subtotal > 0 ? Math.max(0, o.subtotal - (o.discount || 0) - (o.pix_discount || 0)) / o.subtotal : 0; // cupom/Pix/desconto do balcão, sem frete
    const lines = J(o.items, []).map((i) => {
      const cat = catOf.get(i.id);
      const rate = cfg.by_category[cat] != null ? cfg.by_category[cat] : cfg.by_seller[o.seller_id] != null ? cfg.by_seller[o.seller_id] : cfg.default_pct;
      const base = round2(i.price * i.qty * factor);
      return { name: i.name, qty: i.qty, category: catName.get(cat) || '—', rate, base, amount: round2(base * rate / 100) };
    });
    const base = round2(lines.reduce((a, l) => a + l.base, 0)), amount = round2(lines.reduce((a, l) => a + l.amount, 0));
    r.orders.push({ code: o.code, date: o.created_at, channel: o.channel, total: o.total, base, amount, lines });
    r.n++; r.sales = round2(r.sales + o.total); r.base = round2(r.base + base); r.amount = round2(r.amount + amount);
  }
  const rows = [...by.values()].map((r) => {
    const p = paid.get(r.id);
    return { ...r, eff_pct: r.base ? Math.round((r.amount / r.base) * 10000) / 100 : 0,
      paid: p ? { amount: p.amount, paid_at: p.paid_at, paid_by: p.paid_by, changed: Math.abs(p.amount - r.amount) >= 0.01 } : null };
  }).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  return { month, label: monthLabel(month), cfg, rows, total: round2(rows.reduce((a, r) => a + r.amount, 0)),
    total_paid: round2(rows.reduce((a, r) => a + (r.paid ? r.paid.amount : 0), 0)), sales: round2(rows.reduce((a, r) => a + r.sales, 0)) };
}
app.get('/api/admin/commissions', auth(), ownerOnly, (req, res) => {
  const m = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : monthKey();
  const months = []; const d = new Date(); for (let i = 0; i < 12; i++) { const k = monthKey(new Date(d.getFullYear(), d.getMonth() - i, 1)); months.push({ key: k, label: monthLabel(k) }); }
  res.json({ ...commissionReport(m), months,
    sellers: db.prepare('SELECT id,name FROM users WHERE active=1 AND in_ranking=1 ORDER BY id').all(),
    categories: db.prepare('SELECT id,name FROM categories ORDER BY sort, name').all() });
});
app.put('/api/admin/commissions/config', auth(), ownerOnly, (req, res) => {
  const b = req.body || {};
  const def = pct(b.default_pct); if (def == null) return res.status(400).json({ error: 'Percentual padrão inválido (0 a 50%).' });
  const clean = (o, table) => { const out = {}; for (const [k, v] of Object.entries(o || {})) { if (v === '' || v == null) continue; const p = pct(v), id = parseInt(k);
    if (p == null) throw new Error('Percentual inválido (0 a 50%).'); if (db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(id)) out[id] = p; } return out; };
  let data; try { data = { default_pct: def, by_category: clean(b.by_category, 'categories'), by_seller: clean(b.by_seller, 'users') }; } catch (e) { return res.status(400).json({ error: e.message }); }
  db.prepare("INSERT INTO commission_config(id,data,updated_at,updated_by) VALUES(1,?,datetime('now','localtime'),?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at, updated_by=excluded.updated_by")
    .run(JSON.stringify(data), req.user.name);
  audit(req, 'comissao_regras', `padrão ${def}% · ${Object.keys(data.by_category).length} categoria(s) · ${Object.keys(data.by_seller).length} vendedor(es)`);
  res.json({ ok: true });
});
app.post('/api/admin/commissions/pay', auth(), ownerOnly, (req, res) => {
  const b = req.body || {}, m = String(b.month || ''), uid = parseInt(b.user_id);
  if (!/^\d{4}-\d{2}$/.test(m)) return res.status(400).json({ error: 'Mês inválido.' });
  const r = commissionReport(m).rows.find((x) => x.id === uid);
  if (!r) return res.status(404).json({ error: 'Vendedor sem comissão neste mês.' });
  if (b.undo) { db.prepare('DELETE FROM commission_payouts WHERE month=? AND user_id=?').run(m, uid); audit(req, 'comissao_reaberta', `${r.name} · ${m}`); return res.json({ ok: true }); }
  db.prepare("INSERT INTO commission_payouts(month,user_id,amount,base,orders,paid_by,paid_at) VALUES(?,?,?,?,?,?,datetime('now','localtime')) ON CONFLICT(month,user_id) DO UPDATE SET amount=excluded.amount, base=excluded.base, orders=excluded.orders, paid_by=excluded.paid_by, paid_at=excluded.paid_at")
    .run(m, uid, r.amount, r.base, r.n, req.user.name);
  audit(req, 'comissao_paga', `${r.name} · ${m} · R$ ${r.amount.toFixed(2)}`);
  res.json({ ok: true, amount: r.amount });
});

/* ---- equipe: esqueci minha senha ---- */
app.post('/api/admin/forgot', limit('staff-forgot', 5, 3600000, 'Muitas solicitações. Tente novamente em 1 hora.'), async (req, res) => {
  const login = str((req.body || {}).login, 120).toLowerCase();
  const generic = { ok: true, message: 'Se este usuário tiver um e-mail cadastrado, enviamos um link para criar uma nova senha. Confira a caixa de entrada e o spam.' };
  if (login.length < 3 || !allow('staff-forgot-login:' + login, 3, 3600000)) return res.json(generic);
  const u = db.prepare("SELECT * FROM users WHERE active=1 AND (lower(username)=? OR (email<>'' AND lower(email)=?))").get(login, login);
  if (!u) return res.json(generic);
  const base = baseUrl(req);
  if (u.email) {
    const t = crypto.randomBytes(32).toString('hex');
    db.prepare('DELETE FROM staff_tokens WHERE user_id=? OR expires<?').run(u.id, Date.now());
    db.prepare('INSERT INTO staff_tokens(token_hash,user_id,expires) VALUES(?,?,?)').run(sha(t), u.id, Date.now() + 30 * 60000);
    await mailer.send(u.email, 'Nova senha do painel — Aladdin Tech', mailer.layout({
      preheader: 'Link para criar uma nova senha do painel.', title: 'Criar uma nova senha',
      intro: `Olá, ${mailer.esc(u.name.split(' ')[0])}. Recebemos um pedido para redefinir a senha do seu acesso à Central do lojista (usuário <b>${mailer.esc(u.username)}</b>).`,
      button: { label: 'Criar nova senha', url: `${base}/admin#redefinir=${t}` },
      note: 'O link vale por 30 minutos e só pode ser usado uma vez. Se não foi você, ignore este e-mail — sua senha continua a mesma.'
    }), 'senha-equipe').catch(() => {});
  } else {
    // sem e-mail cadastrado: avisa o(s) Dono(s), que podem redefinir em Equipe
    for (const o of db.prepare("SELECT email FROM users WHERE role='owner' AND active=1 AND email<>'' AND id<>?").all(u.id))
      await mailer.send(o.email, 'Pedido de nova senha da equipe — Aladdin Tech', mailer.layout({
        preheader: u.name + ' esqueceu a senha do painel.', title: 'Alguém da equipe esqueceu a senha',
        intro: `<b>${mailer.esc(u.name)}</b> (usuário ${mailer.esc(u.username)}) pediu uma nova senha, mas não tem e-mail cadastrado. Para liberar, abra o painel em <b>Equipe</b>, clique na pessoa e use “Redefinir senha”.`,
        button: { label: 'Abrir a Equipe', url: `${base}/admin#equipe` }
      }), 'senha-equipe').catch(() => {});
  }
  db.prepare('INSERT INTO audit_log(user_name,action,detail,ip) VALUES(?,?,?,?)').run(`${u.name} (@${u.username})`, 'senha_esquecida', u.email ? 'link enviado por e-mail' : 'sem e-mail: Dono avisado', ipOf(req));
  res.json(generic);
});
app.post('/api/admin/reset', limit('staff-reset', 10, 600000), (req, res) => {
  const b = req.body || {};
  if (!strongPw(b.password)) return res.status(400).json({ error: 'A senha precisa ter 8+ caracteres, com letras e números.' });
  if (b.password !== b.confirm) return res.status(400).json({ error: 'As senhas não conferem.' });
  const row = db.prepare('SELECT * FROM staff_tokens WHERE token_hash=?').get(sha(String(b.token || '')));
  if (!row || row.expires < Date.now()) return res.status(400).json({ error: 'Link inválido ou expirado. Peça um novo em “Esqueci minha senha”.' });
  const u = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(row.user_id);
  db.prepare('DELETE FROM staff_tokens WHERE user_id=?').run(row.user_id);
  if (!u) return res.status(400).json({ error: 'Acesso bloqueado. Fale com o Dono da loja.' });
  db.prepare('UPDATE users SET password=?, must_change=0 WHERE id=?').run(hashPw(b.password), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
  db.prepare('INSERT INTO audit_log(user_name,action,detail,ip) VALUES(?,?,?,?)').run(`${u.name} (@${u.username})`, 'senha_redefinida', 'pelo link do e-mail', ipOf(req));
  if (u.email) mailer.send(u.email, 'Sua senha do painel foi alterada — Aladdin Tech', mailer.layout({
    preheader: 'Aviso de segurança.', title: 'Senha alterada',
    intro: `Olá, ${mailer.esc(u.name.split(' ')[0])}. A senha do seu acesso à Central do lojista acabou de ser alterada. Todas as sessões abertas foram encerradas.`,
    note: 'Se não foi você, avise o Dono da loja imediatamente.'
  }), 'senha-equipe').catch(() => {});
  res.json({ ok: true, username: u.username });
});

/* ---- foto do consultor ---- */
// compatível com o SQLite do Node e com o do Turso (3.45): sem coluna externa no ORDER BY de subconsulta
const STAFF_PHOTO = `COALESCE(NULLIF(u.photo,''), (SELECT c.avatar FROM customers c WHERE c.id=u.customer_id),
  (SELECT c.avatar FROM customers c WHERE u.customer_id IS NULL AND u.email<>'' AND lower(c.email)=lower(u.email) AND c.email_verified=1 LIMIT 1), '')`;

/* ---- gestão: financeiro, estoque por IMEI, Mercado Livre e Shopee ---- */
const ops = require('./ops')({ db, J, round2 });
const channels = require('./channels')({ db, getSettings, setSetting, round2, secret: (k) => getSettings()[k] || '' });
const ownerOnly2 = (req, res, next) => req.user.role === 'owner' ? next() : res.status(403).json({ error: 'Somente o Dono.' });
app.get('/api/admin/finance', auth(), ownerOnly2, (req, res) => {
  const days = Math.min(730, Math.max(1, parseInt(req.query.days) || 30));
  const to = new Date(Date.now() + 864e5), from = new Date(Date.now() - days * 864e5);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  res.json({ days, ...ops.finance({ from: iso(from), to: iso(to) }), stock: ops.stockInsights() });
});
app.get('/api/admin/units', auth('products'), (req, res) => res.json(req.query.q ? ops.findSerial(str(req.query.q, 20)) : ops.units(parseInt(req.query.product_id))));
app.post('/api/admin/units', auth('products'), (req, res) => {
  try { const b = req.body || {}; const r = ops.addUnits(parseInt(b.product_id), b, req.user.name, warranty.checkSerial); audit(req, 'estoque_entrada', `produto ${b.product_id}: +${r.added} unidade(s)`); res.json({ ok: true, ...r }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/admin/units/:id/writeoff', auth('products'), (req, res) => {
  try { const st = ops.writeOff(parseInt(req.params.id), str((req.body || {}).notes, 120)); audit(req, 'estoque_baixa', 'unidade ' + req.params.id); res.json({ ok: true, stock: st }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/admin/channels', auth(), ownerOnly2, (req, res) => res.json(channels.status()));
app.get('/api/admin/ml/connect', auth(), ownerOnly2, (req, res) => {
  if (!getSettings().ml_client_id || !getSettings().ml_client_secret) return res.status(400).send('Salve o App ID e a chave secreta do Mercado Livre antes de conectar.');
  res.redirect(channels.mlAuthUrl(baseUrl(req)));
});
// volta do Mercado Livre (sem cookie da equipe: a navegação vem de outro site; protegido pelo "state" de uso único)
app.get('/api/ml/callback', limit('ml-cb', 10, 600000), async (req, res) => {
  try { await channels.mlCallback(String(req.query.code || ''), String(req.query.state || ''), baseUrl(req)); res.redirect('/admin#config'); }
  catch (e) { res.status(400).type('html').send('<p style="font-family:sans-serif;padding:40px">Não foi possível conectar ao Mercado Livre: ' + String(e.message).replace(/[<>&]/g, '') + '</p>'); }
});
app.post('/api/ml/notify', async (req, res) => {
  res.sendStatus(200);
  const b = req.body || {}; if (!/orders/.test(String(b.topic || '')) || !channels.mlReady()) return;
  try { const o = await channels.mlOrder(b.resource); if (!o) return; const r = channels.applyOrder('ml', o); if (r.applied) await channels.syncJob(); }
  catch (e) { console.error('ML notify', e.message); }
});
app.post('/api/shopee/notify', async (req, res) => {
  const url = (process.env.PUBLIC_URL || baseUrl(req)) + req.originalUrl;
  if (!channels.shVerify(url, req.rawBody || '', req.headers.authorization)) return res.status(401).end();
  res.sendStatus(200);
  const b = req.body || {}, sn = b.data && (b.data.ordersn || b.data.order_sn); if (!sn || !channels.shReady()) return;
  try { const o = await channels.shOrder(sn); const r = channels.applyOrder('shopee', o); if (r.applied) await channels.syncJob(); }
  catch (e) { console.error('Shopee notify', e.message); }
});
app.post('/api/admin/channels/sync', auth(), ownerOnly2, async (req, res) => { try { res.json({ ok: true, synced: await channels.syncJob() }); } catch (e) { res.status(400).json({ error: e.message }); } });
jobs.every('canais-estoque', 2 * 60000, () => channels.syncJob());

/* ---- laudo técnico + assistência técnica ---- */
const service = require('./service')({ db, getSettings, J, str, round2, mailer, wa: extras });
const htmlPage = (res, html) => { if (!html) return res.status(404).type('html').send('<p style="font-family:sans-serif;padding:40px">Documento não encontrado.</p>'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex'); res.type('html').send(html); };
app.get('/laudo/:token', limit('doc', 60, 600000), (req, res) => htmlPage(res, service.renderInspection(req.params.token, baseUrl(req))));
app.get('/os/:token', limit('doc', 60, 600000), (req, res) => htmlPage(res, service.renderReceipt(req.params.token, baseUrl(req))));
app.get('/api/inspections/product/:id', (req, res) => res.json(service.latestForProduct(parseInt(req.params.id)) || {}));
app.get('/api/admin/inspections/checklist', auth('products'), (req, res) => res.json(service.CHECKLIST));
app.post('/api/admin/inspections', auth('products'), (req, res) => {
  try { const r = service.saveInspection(req.body || {}, req.user.name); audit(req, 'laudo_emitido', `${(req.body || {}).model} · ${r.token.slice(0, 8)}`); res.json({ ok: true, ...r }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/admin/service', auth('orders'), (req, res) => res.json(db.prepare('SELECT * FROM service_orders ORDER BY id DESC LIMIT 500').all().map(service.decorate)));
app.post('/api/admin/service', auth('orders'), (req, res) => {
  try { const o = service.createOS(req.body || {}, req.user.name); audit(req, 'os_aberta', `${o.code} · ${o.device}`); res.json({ ok: true, os: o }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/admin/service/:id', auth('orders'), async (req, res) => {
  try {
    const { before, after } = service.updateOS(parseInt(req.params.id), req.body || {}, req.user.name);
    let msg = ''; if (after.status !== before.status && (req.body || {}).notify !== false) msg = await service.notify(after, baseUrl(req)) || '';
    audit(req, 'os_atualizada', `${after.code}: ${before.status} → ${after.status}`); res.json({ ok: true, os: after, message: msg, wa_auto: extras.waReady() });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/service/lookup', limit('os-lookup', 20, 600000, 'Muitas tentativas. Aguarde alguns minutos.'), (req, res) => {
  const r = service.lookup((req.body || {}).code, (req.body || {}).phone);
  if (!r) return res.status(404).json({ error: 'Não encontramos essa OS. Confira o número e os 4 últimos dígitos do WhatsApp informado na entrada.' });
  res.json(r);
});
app.get('/api/service/:token', limit('os-view', 60, 600000), (req, res) => { const o = service.byToken(req.params.token); if (!o) return res.status(404).json({ error: 'OS não encontrada.' }); res.json(o); });
app.post('/api/service/:token/budget', limit('os-budget', 10, 600000), (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
  try { const o = service.answerBudget(req.params.token, !!(req.body || {}).approve); db.prepare("INSERT INTO audit_log(user_name,action,detail,ip) VALUES('cliente','os_orcamento',?,?)").run(`${o.code}: ${o.budget_status}`, ipOf(req)); res.json({ ok: true, status: o.status, budget_status: o.budget_status }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

/* ---- app instalável: notificações + Clube Aladdin + lembretes ---- */
const push = require('./push')({ db, getSettings, setSetting });
const club = require('./club')({ db, getSettings, J, round2, mailer, wa: extras, push });
const PUSH_TEXT = { confirmado: ['Pagamento confirmado ✅', 'já estamos separando tudo.'], enviado: ['Saiu para entrega 🚚', 'seu pedido está a caminho.'],
  pronto: ['Pronto para retirada 🛍️', 'pode vir buscar na loja.'], entregue: ['Pedido entregue 💛', 'obrigado pela confiança! Conta pra gente como foi?'], cancelado: ['Pedido cancelado', 'se precisar de algo, fale com a gente.'] };
app.get('/manifest.webmanifest', (req, res) => { res.type('application/manifest+json'); res.sendFile(path.join(__dirname, 'public', 'manifest.webmanifest')); });
app.get('/sw.js', (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Service-Worker-Allowed', '/'); res.type('application/javascript'); res.sendFile(path.join(__dirname, 'public', 'sw.js')); });
app.get('/api/push/key', (req, res) => res.json({ key: push.publicKey() }));
app.post('/api/push/subscribe', limit('push-sub', 30, 600000), (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
  try { const cust = getCustomer(req), b = req.body || {}; if (b.order && !db.prepare('SELECT id FROM orders WHERE code=?').get(String(b.order).slice(0, 20))) delete b.order; push.subscribe(b, cust && cust.id); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/push/unsubscribe', (req, res) => { if (!sameOrigin(req)) return res.status(403).end(); push.unsubscribe((req.body || {}).endpoint); res.json({ ok: true }); });
app.get('/api/admin/push/stats', auth('promos'), (req, res) => res.json(push.count()));
app.post('/api/admin/push/broadcast', auth('promos'), limit('push-bc', 10, 3600000), async (req, res) => {
  const b = req.body || {}; if (str(b.title, 80).length < 3 || str(b.body, 220).length < 3) return res.status(400).json({ error: 'Preencha título e mensagem.' });
  const n = await push.broadcast({ title: str(b.title, 80), body: str(b.body, 220), url: str(b.url, 200) || '/' });
  audit(req, 'notificacao_enviada', `${str(b.title, 80)} → ${n} aparelho(s)`); res.json({ ok: true, sent: n });
});
app.get('/api/account/club', customerAuth, (req, res) => res.json({ ...club.summary(req.customer.id), birthday: req.customer.birthday || '' }));
app.put('/api/account/birthday', customerAuth, (req, res) => {
  const v = String((req.body || {}).birthday || '');
  if (v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(v) > new Date() || new Date(v) < new Date('1900-01-01'))) return res.status(400).json({ error: 'Data de nascimento inválida.' });
  if (req.customer.birthday && v !== req.customer.birthday) return res.status(400).json({ error: 'A data de aniversário só pode ser cadastrada uma vez. Fale com a loja para corrigir.' });
  db.prepare('UPDATE customers SET birthday=? WHERE id=?').run(v, req.customer.id); res.json({ ok: true });
});
app.post('/api/admin/customers/:id/cashback', auth(), (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Somente o Dono ajusta cashback.' });
  const amount = round2(Number((req.body || {}).amount)); if (!amount || Math.abs(amount) > 100000) return res.status(400).json({ error: 'Valor inválido.' });
  const bal = club.adjust(parseInt(req.params.id), amount, str((req.body || {}).note, 120) || 'ajuste manual'); audit(req, 'cashback_ajuste', `cliente ${req.params.id}: ${amount}`); res.json({ ok: true, balance: bal });
});
app.get('/api/admin/reminders/log', auth('promos'), (req, res) => res.json(db.prepare('SELECT * FROM reminders_sent ORDER BY sent_at DESC LIMIT 200').all()));
const clubJobs = () => { const base = process.env.PUBLIC_URL || lastBase || ''; try { club.expire(); } catch (e) { console.error('clube', e.message); }
  club.birthdayJob(base).catch((e) => console.error('aniversário', e.message)); club.remindersJob(base).catch((e) => console.error('lembretes', e.message)); };
jobs.every('clube-lembretes', 6 * 3600000, clubJobs, { firstDelay: 90000 });

/* ---- vitrine (catálogo), guias, avaliações do Google ---- */
const content = require('./content')({ db, getSettings, J, str, effectivePrice: (p) => effectivePrice(p), secret: (k) => (k === 'google_places_key' && process.env.GOOGLE_PLACES_KEY) || getSettings()[k] || '' });
if (!db.prepare('SELECT COUNT(*) n FROM posts').get().n) {
  try { for (const g of require('./database/guias-iniciais')) content.savePost(g, null, 'Equipe Aladdin Tech'); } catch (e) { console.error('guias', e.message); }
}
const sendFeed = (req, res) => { res.setHeader('Cache-Control', 'public, max-age=3600'); res.type('application/xml').send(content.feed(baseUrl(req))); };
app.get('/feed/google.xml', sendFeed);
app.get('/feed/meta.xml', sendFeed);
const postCard = (slug) => `<div class="post-prod" data-prod="${slug}"></div>`;
app.get('/api/posts', (req, res) => res.json(db.prepare('SELECT slug,title,excerpt,cover,created_at,updated_at FROM posts WHERE published=1 ORDER BY id DESC LIMIT 50').all()));
app.get('/api/posts/:slug', limit('post', 120, 600000), (req, res) => {
  const p = db.prepare('SELECT * FROM posts WHERE slug=? AND published=1').get(String(req.params.slug).slice(0, 90));
  if (!p) return res.status(404).json({ error: 'Guia não encontrado.' });
  db.prepare('UPDATE posts SET views=views+1 WHERE id=?').run(p.id);
  res.json({ ...p, html: content.render(p.body, postCard), body: undefined,
    more: db.prepare('SELECT slug,title,excerpt,cover FROM posts WHERE published=1 AND id<>? ORDER BY id DESC LIMIT 3').all(p.id) });
});
app.get('/api/admin/posts', auth('settings'), (req, res) => res.json(db.prepare('SELECT * FROM posts ORDER BY id DESC').all()));
app.post('/api/admin/posts', auth('settings'), (req, res) => { try { const id = content.savePost(req.body || {}, null, req.user.name); audit(req, 'guia_criado', (req.body || {}).title); res.json({ ok: true, id }); } catch (e) { res.status(400).json({ error: e.message }); } });
app.put('/api/admin/posts/:id', auth('settings'), (req, res) => { try { content.savePost(req.body || {}, parseInt(req.params.id), req.user.name); audit(req, 'guia_editado', (req.body || {}).title); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); } });
app.delete('/api/admin/posts/:id', auth('settings'), (req, res) => { db.prepare('DELETE FROM posts WHERE id=?').run(parseInt(req.params.id)); audit(req, 'guia_excluido', req.params.id); res.json({ ok: true }); });
app.post('/api/admin/posts/preview', auth('settings'), (req, res) => res.json({ html: content.render(String((req.body || {}).body || '').slice(0, 60000), postCard) }));
app.get('/api/google-reviews', async (req, res) => { try { res.json(await content.googleReviews()); } catch (e) { res.json(null); } });
app.post('/api/admin/google-reviews/test', auth(), async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Somente o Dono.' });
  try { const r = await content.googleReviews(true); if (!r) return res.status(400).json({ error: 'Preencha a chave e o ID do lugar e salve.' }); res.json({ ok: true, message: `${r.name || 'Loja'}: nota ${r.rating} com ${r.total} avaliações (${r.reviews.length} exibidas)` }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

/* ---- troca garantida + pré-venda ---- */
const tradein = require('./tradein')({ db, getSettings, J, round2, mailer, wa: extras });
const preorder = require('./preorder')({ db, getSettings, J, str, round2, mailer, wa: extras });
jobs.every('troca-garantida', 6 * 3600000, () => tradein.job(process.env.PUBLIC_URL || lastBase || ''), { firstDelay: 60000 });
app.get('/api/account/trade-plans', customerAuth, (req, res) => res.json(tradein.forCustomer(req.customer.id)));
app.get('/api/admin/trade-plans', auth('orders'), (req, res) => res.json(tradein.search(str(req.query.q, 60), str(req.query.phase, 20))));
app.post('/api/admin/trade-plans/:id/redeem', auth('orders'), (req, res) => {
  try { const r = tradein.redeem(parseInt(req.params.id), String((req.body || {}).grade || ''), req.user.name); audit(req, 'troca_resgatada', `${r.code} · R$ ${r.value.toFixed(2)}`); res.json({ ok: true, ...r }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/preorders/:productId/stats', (req, res) => res.json(preorder.stats(parseInt(req.params.productId))));
app.post('/api/preorders', limit('preorder', 8, 3600000, 'Muitas solicitações. Fale com um consultor.'), async (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
  const b = req.body || {}, p = db.prepare('SELECT * FROM products WHERE id=? AND active=1 AND coming_soon=1').get(parseInt(b.product_id));
  if (!p) return res.status(400).json({ error: 'Este produto não está em pré-venda.' });
  const cust = getCustomer(req);
  try {
    if (b.type === 'aviso') return res.json(preorder.addNotice(p, b, cust));
    const r = preorder.addDeposit(p, b, cust);
    let pay_url = '';
    if (onlinePay() && ['pix', 'card'].includes(b.payment)) { try { pay_url = await createPreference(req, r.code); } catch (e) { console.error('MP sinal', e.message); } }
    sendOrderEmail(req, r.code, 'novo').catch(() => {});
    extras.notifyOrder(r.code, 'novo', baseUrl(req)).catch(() => {});
    audit(req, 'prevenda_sinal', `${r.code} · ${p.name}`);
    res.json({ ok: true, code: r.code, pay_url });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/admin/preorders', auth('orders'), (req, res) => res.json(preorder.overview()));
app.get('/api/admin/preorders/:productId', auth('orders'), (req, res) => res.json(preorder.queue(parseInt(req.params.productId))));
app.post('/api/admin/preorders/:productId/release', auth('products'), async (req, res) => {
  try { const r = await preorder.release(parseInt(req.params.productId), req.body || {}, baseUrl(req)); audit(req, 'prevenda_liberada', `produto ${req.params.productId}: ${r.paid} sinal(is), ${r.notified} aviso(s)`); res.json({ ok: true, ...r }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/admin/preorders/item/:id', auth('orders'), (req, res) => {
  try { const r = preorder.setStatus(parseInt(req.params.id), String((req.body || {}).status || ''), (req.body || {}).sale_code); audit(req, 'prevenda_' + req.body.status, `${r.name} · ${r.order_code || 'aviso'}`); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

/* ---- indique e ganhe ---- */
app.get('/api/account/referral', customerAuth, (req, res) => res.json(extras.referralInfo(req.customer.id, baseUrl(req))));

/* ---- reservar para retirar (paga na loja) ---- */
app.post('/api/reserve', limit('reserve', 6, 3600000, 'Muitas reservas a partir desta conexão. Fale com um consultor.'), async (req, res) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
  const s = getSettings(), b = req.body || {};
  if (!s.reserve_enabled || s.pickup_enabled === false) return res.status(400).json({ error: 'Reservas indisponíveis no momento.' });
  const cust = getCustomer(req);
  const name = str(b.name, 80) || (cust && cust.name) || '', phone = str(b.phone, 20) || (cust && cust.phone) || '';
  if (name.length < 3 || phone.replace(/\D/g, '').length < 10) return res.status(400).json({ error: 'Informe seu nome e WhatsApp com DDD.' });
  const tail = phone.replace(/\D/g, '').slice(-9);
  const active = db.prepare("SELECT customer FROM orders WHERE reserve_until > datetime('now','localtime') AND status IN ('novo','confirmado','separando','pronto')").all()
    .filter((o) => String(J(o.customer, {}).phone || '').replace(/\D/g, '').slice(-9) === tail);
  if (active.length >= 2) return res.status(400).json({ error: 'Você já tem reservas ativas. Retire-as ou fale com um consultor.' });
  let o;
  try { o = await computeOrder({ items: [{ id: parseInt(b.product_id), qty: Math.min(2, Math.max(1, parseInt(b.qty) || 1)), options: b.options || {} }], delivery_method: 'pickup', payment: 'cash' }, cust); }
  catch (e) { return res.status(400).json({ error: e.message }); }
  const hours = Number(s.reserve_hours) || 24;
  try {
    db.exec('BEGIN');
    for (const i of o.items) { const p = db.prepare('SELECT stock FROM products WHERE id=? AND active=1').get(i.id); if (!p || p.stock < i.qty) throw new Error('Este produto acabou de esgotar.'); }
    const code = 'RS' + Date.now().toString(36).toUpperCase().slice(-4) + crypto.randomBytes(3).toString('hex').toUpperCase();
    db.prepare(`INSERT INTO orders(customer_id,code,customer,items,subtotal,discount,pix_discount,shipping,total,coupon,delivery_method,delivery,payment,installments,notes,reserve_until)
      VALUES(?,?,?,?,?,0,0,0,?,'','pickup',?,'cash',1,?,datetime('now','localtime',?))`).run(cust ? cust.id : null, code,
      JSON.stringify({ name, phone, email: (cust && cust.email) || str(b.email, 120), cpf: '' }), JSON.stringify(o.items), o.subtotal, o.subtotal,
      JSON.stringify({ label: 'Reserva — retirar na loja', address: `${s.address} · ${s.city}`, eta: s.pickup_eta }),
      `RESERVA: pagar na retirada. Segura por ${hours}h.`, `+${hours} hours`);
    for (const i of o.items) db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(i.qty, i.id);
    db.exec('COMMIT');
    const row = db.prepare('SELECT id, reserve_until FROM orders WHERE code=?').get(code);
    try { ops.snapshotCosts(row.id); ops.reserveForOrder(row.id); } catch {}
    sendOrderEmail(req, code, 'novo').catch(() => {});
    extras.notifyOrder(code, 'novo', baseUrl(req)).catch(() => {});
    const seller = sellerByRef(b.seller); if (seller) db.prepare("UPDATE orders SET seller_id=?, seller_source=? WHERE code=?").run(seller.id, ['link', 'whatsapp'].includes(b.seller_source) ? b.seller_source : 'checkout', code);
    res.json({ ok: true, code, until: row.reserve_until, hours });
  } catch (e) { try { db.exec('ROLLBACK'); } catch {} res.status(400).json({ error: e.message }); }
});
jobs.every('reservas', 5 * 60000, () => { try { extras.reservationJob(process.env.PUBLIC_URL || lastBase || '', (o) => { extras.notifyOrder(o.code, 'cancelado', process.env.PUBLIC_URL || lastBase || '', { reserveExpired: true }).catch(() => {}); }); } catch (e) { console.error('reservas', e.message); } });

/* ---- WhatsApp: texto pronto (manual) e teste da integração ---- */
app.get('/api/admin/orders/:id/wa', auth('orders'), (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(parseInt(req.params.id));
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado.' });
  const st = String(req.query.status || o.status);
  res.json({ text: extras.waText(o, st, baseUrl(req)), phone: extras.intl(J(o.customer, {}).phone), auto: extras.waReady() });
});
app.post('/api/admin/whatsapp/test', auth(), limit('wa-test', 10, 600000), async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Somente o Dono.' });
  const r = await extras.waSend(String((req.body || {}).phone || ''), `Teste da integração de WhatsApp da ${getSettings().store_name || 'Aladdin Tech'} ✅`, { kind: 'teste' });
  res.json(r.ok ? { ok: true } : { ok: false, error: r.error });
});
app.get('/api/admin/whatsapp/log', auth('orders'), (req, res) => res.json(db.prepare('SELECT * FROM wa_messages ORDER BY id DESC LIMIT 100').all()));

/* ---- garantia por IMEI / série ---- */
const warranty = require('./warranty')({ db, getSettings, J, str, round2 });
app.get('/api/admin/orders/:id/warranty', auth('orders'), (req, res) => {
  const o = db.prepare('SELECT id,doc_token FROM orders WHERE id=?').get(parseInt(req.params.id));
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado.' });
  res.json({ list: warranty.list(o.id), doc_token: o.doc_token || '' });
});
app.post('/api/admin/orders/:id/warranty', auth('orders'), (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(parseInt(req.params.id));
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado.' });
  if (o.status === 'cancelado') return res.status(400).json({ error: 'Pedido cancelado não tem garantia.' });
  try {
    const sers = ((req.body || {}).items || []).flatMap((it) => (Array.isArray(it.serials) ? it.serials : String(it.serials || '').split(/[\s,;]+/))).map((x) => warranty.checkSerial(x)).filter((c) => !c.error).map((c) => c.serial);
    ops.sellSerials(o.id, sers);
    const list = warranty.register(o, (req.body || {}).items, req.user.name);
    if (!list.length && tradein.forOrder(o.id).length) warranty.ensureDocToken(o.id);
    audit(req, 'garantia_registrada', `${o.code}: ${list.map((w) => w.serial).join(', ') || 'removidas'}`);
    res.json({ ok: true, list, doc_token: warranty.ensureDocToken(o.id) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/admin/orders/:id/doc', auth('orders'), (req, res) => {
  const o = db.prepare('SELECT id,status FROM orders WHERE id=?').get(parseInt(req.params.id));
  if (!o || o.status === 'cancelado') return res.status(400).json({ error: 'Pedido inválido.' });
  res.json({ doc_token: warranty.ensureDocToken(o.id) });
});
app.get('/api/warranty/:serial', limit('warranty', 20, 600000, 'Muitas consultas. Aguarde alguns minutos.'), (req, res) => {
  const w = warranty.lookup(req.params.serial);
  if (!w) return res.status(404).json({ error: 'Não encontramos uma garantia para este número. Confira o IMEI (15 dígitos) ou fale com a loja.' });
  res.json(w);
});
app.get('/documento/:token', limit('doc', 60, 600000), (req, res) => {
  let html = warranty.renderDoc(req.params.token, baseUrl(req));
  if (html) { const od = db.prepare('SELECT id FROM orders WHERE doc_token=?').get(String(req.params.token).slice(0, 40));
    const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const cert = od ? tradein.certificateHtml(od.id, esc, (n) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : '';
    if (cert) html = html.replace('  <footer>', () => cert + '\n  <footer>'); }
  if (!html) return res.status(404).type('html').send('<p style="font-family:sans-serif;padding:40px">Documento não encontrado.</p>');
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex');
  res.type('html').send(html);
});

/* ---- ranking de vendedores ---- */
const COUNTED = "('confirmado','separando','enviado','pronto','entregue')";
const slugRef = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);
function uniqueRef(base, id) {
  let r = slugRef(base) || 'vendedor' + id, n = 1;
  while (db.prepare('SELECT id FROM users WHERE ref_code=? AND id<>?').get(r, id)) r = (slugRef(base) || 'vendedor') + (++n);
  return r;
}
db.prepare("SELECT id, username FROM users WHERE ref_code=''").all().forEach((u) => db.prepare('UPDATE users SET ref_code=? WHERE id=?').run(uniqueRef(u.username, u.id), u.id));
function applySellerFields(id, b) {
  if ('customer_email' in b) {
    const e = str(b.customer_email, 120).toLowerCase();
    if (!e) db.prepare('UPDATE users SET customer_id=NULL WHERE id=?').run(id);
    else { const c = db.prepare('SELECT id FROM customers WHERE lower(email)=?').get(e); if (!c) return 'Não há conta de cliente no site com o e-mail ' + e + '.'; db.prepare('UPDATE users SET customer_id=? WHERE id=?').run(c.id, id); }
  }
  if ('email' in b) {
    const e = str(b.email, 120).toLowerCase();
    if (e && !EMAIL_RE.test(e)) return 'E-mail inválido.';
    if (e && db.prepare('SELECT id FROM users WHERE lower(email)=? AND id<>?').get(e, id)) return 'Este e-mail já é de outra pessoa da equipe.';
    db.prepare('UPDATE users SET email=? WHERE id=?').run(e, id);
  }
  if ('title' in b) db.prepare('UPDATE users SET title=? WHERE id=?').run(str(b.title, 50), id);
  if ('whatsapp' in b) db.prepare('UPDATE users SET whatsapp=? WHERE id=?').run(String(b.whatsapp || '').replace(/\D/g, '').slice(0, 15), id);
  if ('in_ranking' in b) db.prepare('UPDATE users SET in_ranking=? WHERE id=?').run(b.in_ranking ? 1 : 0, id);
  if ('goal' in b) db.prepare('UPDATE users SET goal=? WHERE id=?').run(Math.max(0, round2(b.goal) || 0), id);
  if ('ref_code' in b) {
    const r = slugRef(b.ref_code);
    if (r.length < 3) return 'O código do link precisa ter 3+ letras ou números.';
    if (db.prepare('SELECT id FROM users WHERE ref_code=? AND id<>?').get(r, id)) return 'Este código de link já é de outra pessoa.';
    db.prepare('UPDATE users SET ref_code=? WHERE id=?').run(r, id);
  }
  if ('photo' in b) {
    const old = db.prepare('SELECT photo FROM users WHERE id=?').get(id)?.photo;
    let url = '';
    if (b.photo && String(b.photo).startsWith('data:')) { try { url = saveImage(b.photo, 'loja', 6 * 1048576); } catch (e) { return e.message; } }
    else if (b.photo && UPLOAD_URL(b.photo)) url = b.photo;
    if (url !== old) { db.prepare('UPDATE users SET photo=? WHERE id=?').run(url, id); if (old) deleteUpload(old); }
  }
  return '';
}
const sellerByRef = (ref) => { const r = slugRef(ref); return r ? db.prepare('SELECT id,name FROM users WHERE ref_code=? AND active=1 AND in_ranking=1').get(r) : null; };
const publicSellers = () => db.prepare(`SELECT u.name,u.title,${STAFF_PHOTO} photo,u.whatsapp,u.ref_code ref FROM users u WHERE u.active=1 AND u.in_ranking=1 ORDER BY u.id`).all();
const monthKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const monthLabel = (m) => { const [y, mm] = m.split('-').map(Number); return MONTHS[mm - 1] + ' de ' + y; };
function ranking(month, { all = false } = {}) {
  const metric = getSettings().ranking_metric === 'vendas' ? 'n' : 'v';
  const rows = db.prepare(`SELECT u.id, u.name, u.title, ${STAFF_PHOTO} photo, u.goal, u.active, u.ref_code,
      COUNT(o.id) n, COALESCE(SUM(o.total),0) v,
      SUM(CASE WHEN o.channel='loja' THEN 1 ELSE 0 END) n_loja, SUM(CASE WHEN o.channel='loja' THEN 0 ELSE 1 END) * (CASE WHEN COUNT(o.id)>0 THEN 1 ELSE 0 END) n_site
    FROM users u LEFT JOIN orders o ON o.seller_id=u.id AND o.status IN ${COUNTED} AND substr(o.created_at,1,7)=?
    WHERE u.in_ranking=1 OR o.id IS NOT NULL GROUP BY u.id`).all(month)
    .filter((r) => all ? (r.active || r.n) : r.active)
    .map((r) => ({ ...r, v: round2(r.v), n_site: r.n ? r.n - r.n_loja : 0, ticket: r.n ? round2(r.v / r.n) : 0, goal_pct: r.goal ? Math.round((r.v / r.goal) * 100) : null }));
  const other = metric === 'n' ? 'v' : 'n';
  rows.sort((a, b) => b[metric] - a[metric] || b[other] - a[other] || a.name.localeCompare(b.name));
  let pos = 0, prev = null;
  rows.forEach((r, i) => { const key = r[metric] + '|' + r[other]; if (key !== prev) pos = i + 1; prev = key; r.pos = r.n ? pos : null; });
  return { month, label: monthLabel(month), metric: metric === 'n' ? 'vendas' : 'valor', rows };
}
app.get('/api/team/ranking', limit('ranking', 120, 600000), (req, res) => {
  const s = getSettings();
  if (s.ranking_public === false) return res.json({ enabled: false });
  const now = new Date(), m = monthKey(now), pm = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const strip = (r) => ({ pos: r.pos, name: r.name, title: r.title, photo: r.photo, n: r.n, v: s.ranking_show_values ? r.v : undefined });
  const cur = ranking(m), prev = ranking(pm);
  const champ = prev.rows.find((r) => r.pos === 1);
  res.json({ enabled: true, label: cur.label, metric: cur.metric, prize: s.ranking_prize || '', show_values: !!s.ranking_show_values,
    podium: cur.rows.filter((r) => r.pos && r.pos <= 3).slice(0, 3).map(strip),
    others: cur.rows.filter((r) => !r.pos || r.pos > 3).map((r) => ({ name: r.name, photo: r.photo, title: r.title })),
    last_champion: champ ? { ...strip(champ), label: prev.label } : null });
});
app.get('/api/admin/ranking', auth('dashboard'), (req, res) => {
  const m = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : monthKey();
  const r = ranking(m, { all: true });
  const un = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total),0) v FROM orders WHERE seller_id IS NULL AND status IN ${COUNTED} AND substr(created_at,1,7)=?`).get(m);
  const months = []; const d = new Date(); for (let i = 0; i < 12; i++) { const k = monthKey(new Date(d.getFullYear(), d.getMonth() - i, 1)); months.push({ key: k, label: monthLabel(k) }); }
  res.json({ ...r, unassigned: { n: un.n, v: round2(un.v) }, months, me: req.user.id, counted: 'Pedidos confirmados, em separação, enviados, prontos ou entregues. Cancelados e não pagos não contam.' });
});
// trocar o vendedor de um pedido (Dono/Gerente)
app.put('/api/admin/orders/:id/seller', auth('orders'), (req, res) => {
  if (!['owner', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Só o Dono ou o Gerente pode trocar o vendedor de um pedido.' });
  const o = db.prepare('SELECT o.id,o.code,u.name prev FROM orders o LEFT JOIN users u ON u.id=o.seller_id WHERE o.id=?').get(parseInt(req.params.id));
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado.' });
  const sid = parseInt((req.body || {}).seller_id) || null;
  const u = sid ? db.prepare('SELECT id,name FROM users WHERE id=? AND active=1').get(sid) : null;
  if (sid && !u) return res.status(400).json({ error: 'Vendedor inválido.' });
  db.prepare("UPDATE orders SET seller_id=?, seller_source=CASE WHEN ? IS NULL THEN '' ELSE 'painel' END WHERE id=?").run(u ? u.id : null, u ? u.id : null, o.id);
  audit(req, 'pedido_vendedor', `${o.code}: ${o.prev || 'sem vendedor'} → ${u ? u.name : 'sem vendedor'}`);
  res.json({ ok: true });
});
// venda feita no balcão da loja
app.post('/api/admin/sales', auth('orders'), limit('sale', 60, 600000), (req, res) => {
  const b = req.body || {}, c = b.customer || {};
  const list = (Array.isArray(b.items) ? b.items : []).slice(0, 30);
  if (!list.length) return res.status(400).json({ error: 'Adicione pelo menos um produto.' });
  if (!['pix', 'card', 'debit', 'cash'].includes(b.payment)) return res.status(400).json({ error: 'Selecione a forma de pagamento.' });
  let sellerId = req.user.id;
  if (req.user.role !== 'seller' && b.seller_id) {
    const u = db.prepare('SELECT id FROM users WHERE id=? AND active=1').get(parseInt(b.seller_id));
    if (!u) return res.status(400).json({ error: 'Vendedor inválido.' });
    sellerId = u.id;
  }
  try { ops.checkSale(list.map((it) => ({ ...it, serials: Array.isArray(it.serials) ? it.serials : [] })), warranty.checkSerial); } catch (e) { return res.status(400).json({ error: e.message }); }
  try {
    db.exec('BEGIN');
    const items = []; let subtotal = 0;
    for (const it of list) {
      const p = db.prepare('SELECT * FROM products WHERE id=?').get(parseInt(it.id));
      const qty = Math.min(Math.max(1, parseInt(it.qty) || 1), 99);
      if (!p) throw new Error('Produto não encontrado.');
      if (p.stock < qty) throw new Error(`Estoque insuficiente para ${p.name} (há ${p.stock}).`);
      const price = round2(effectivePrice(p));
      items.push({ id: p.id, name: p.name, price, qty, image: (J(p.images, [])[0]) || '', options: {} });
      subtotal += price * qty;
      db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(qty, p.id);
    }
    subtotal = round2(subtotal);
    let couponDisc = 0, couponCode = '';
    if (b.coupon) { const cp = evalCoupon(b.coupon, subtotal, null); if (!cp.ok) throw new Error(cp.error || 'Cupom inválido.'); couponDisc = cp.discount; couponCode = cp.coupon.code; db.prepare('UPDATE coupons SET uses=uses+1 WHERE id=?').run(cp.coupon.id); }
    const discount = Math.min(Math.max(0, round2(b.discount) || 0) + couponDisc, subtotal);
    const total = round2(subtotal - discount);
    const code = 'LJ' + Date.now().toString(36).toUpperCase().slice(-4) + crypto.randomBytes(3).toString('hex').toUpperCase();
    db.prepare(`INSERT INTO orders(code,customer,items,subtotal,discount,pix_discount,shipping,total,coupon,delivery_method,delivery,payment,installments,notes,status,channel,seller_id,seller_source)
      VALUES(?,?,?,?,?,0,0,?,?,'pickup',?,?,?,?,'entregue','loja',?,'painel')`).run(code,
      JSON.stringify({ name: str(c.name, 80) || 'Cliente da loja', phone: str(c.phone, 20), email: str(c.email, 120), cpf: str(c.cpf, 14) }),
      JSON.stringify(items), subtotal, discount, total, couponCode, JSON.stringify({ label: 'Venda na loja', address: '' }),
      b.payment === 'debit' ? 'card' : b.payment, b.payment === 'card' ? Math.min(Math.max(1, parseInt(b.installments) || 1), 18) : 1,
      str(b.notes, 300) + (b.payment === 'debit' ? ' [débito]' : ''), sellerId);
    db.exec('COMMIT');
    const who = db.prepare('SELECT name FROM users WHERE id=?').get(sellerId).name;
    let warrantyErr = '';
    const serials = list.map((it, k) => ({ index: k, serials: it.serials || [] })).filter((x) => x.serials.length);
    const ord = db.prepare('SELECT * FROM orders WHERE code=?').get(code);
    if (serials.length) { try { warranty.register(ord, serials, req.user.name); } catch (e) { warrantyErr = e.message; } }
    const doc_token = warranty.ensureDocToken(ord.id);
    const ph = String(c.phone || '').replace(/\D/g, '');
    if (ph.length >= 10) { const cu = db.prepare('SELECT id, phone FROM customers').all().find((x) => String(x.phone || '').replace(/\D/g, '').slice(-9) === ph.slice(-9)); if (cu) db.prepare('UPDATE orders SET customer_id=? WHERE id=?').run(cu.id, ord.id); }
    try { tradein.createForOrder(ord.id); club.earn(ord.id); } catch (e) { console.error('troca/clube', e.message); }
    try { ops.sellSerials(ord.id, list.flatMap((it) => (it.serials || []).map((x) => warranty.checkSerial(x)).filter((c) => !c.error).map((c) => c.serial))); ops.snapshotCosts(ord.id); } catch (e) { console.error('unidades', e.message); }
    if (b.preorder_id) try { preorder.setStatus(parseInt(b.preorder_id), 'convertido', code); } catch {}
    audit(req, 'venda_loja', `${code} · R$ ${total.toFixed(2)} · vendedor ${who}${discount ? ' · desconto R$ ' + discount.toFixed(2) : ''}`);
    res.json({ ok: true, code, total, doc_token, coupon: couponCode, trade: tradein.forOrder(ord.id).length, warning: warrantyErr ? 'Venda registrada, mas a garantia não foi salva: ' + warrantyErr + ' Corrija no pedido.' : '' });
  } catch (e) { try { db.exec('ROLLBACK'); } catch {} res.status(400).json({ error: e.message }); }
});
// o próprio vendedor atualiza foto, cargo e WhatsApp
app.put('/api/admin/me/profile', auth(), (req, res) => {
  const b = req.body || {}, pick = {};
  ['photo', 'whatsapp', 'title', 'email'].forEach((k) => { if (k in b) pick[k] = b[k]; });
  const err = applySellerFields(req.user.id, pick); if (err) return res.status(400).json({ error: err });
  audit(req, 'perfil_vendedor', Object.keys(pick).join(','));
  res.json({ ok: true });
});

/* ---- fotos em WebP: versão leve ao lado de cada JPG/PNG, entregue a quem suporta ---- */
const WEBP_DIRS = [path.join(__dirname, 'public', 'img'), UPLOAD_DIR];
const webpOf = (file) => file.replace(/\.(jpe?g|png)$/i, '.webp');
const webpCache = new Map();
const hasWebp = (file) => { const c = webpCache.get(file); if (c && Date.now() - c.t < 60000) return c.v; const v = fs.existsSync(webpOf(file)); webpCache.set(file, { v, t: Date.now() }); return v; };
const urlToFile = (u) => { if (typeof u !== 'string' || !/^\/(img|uploads)\/[\w\-./]+\.(jpe?g|png)$/i.test(u) || u.includes('..')) return null;
  const f = path.normalize(path.join(__dirname, 'public', u)); return WEBP_DIRS.some((d) => f.startsWith(d + path.sep)) ? f : null; };
app.get(/^\/(img|uploads)\/.+\.(jpe?g|png)$/i, (req, res, next) => {
  if (!/image\/webp/.test(req.headers.accept || '')) return next();
  const f = urlToFile(decodeURIComponent(req.path)); if (!f || !hasWebp(f)) return next();
  res.setHeader('Vary', 'Accept'); res.setHeader('Cache-Control', 'public, max-age=2592000');
  if (req.path.startsWith('/uploads/')) res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  res.type('image/webp'); res.sendFile(webpOf(f));
});
function listImages() {
  const out = [];
  const walk = (dir, base) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base + '/' + e.name);
    else if (/\.(jpe?g|png)$/i.test(e.name) && !/^(favicon|og-)/i.test(e.name)) out.push({ url: base + '/' + e.name, file: full });
  } };
  walk(path.join(__dirname, 'public', 'img'), '/img'); walk(UPLOAD_DIR, '/uploads');
  return out;
}
app.get('/api/admin/webp/pending', auth(), (req, res) => {
  if (!['owner', 'manager'].includes(req.user.role) && !can(req.user, 'products')) return res.status(403).json({ error: 'Sem permissão.' });
  const all = listImages(), pending = all.filter((x) => !fs.existsSync(webpOf(x.file)) && !fs.existsSync(webpOf(x.file) + '.skip'));
  res.json({ total: all.length, pending: pending.slice(0, 400).map((x) => x.url), pending_count: pending.length });
});
app.post('/api/admin/webp', auth(), (req, res) => {
  if (store.REMOTE_FILES) return res.status(400).json({ error: 'Na nuvem as fotos já são entregues pelo Vercel Blob.' });
  if (!['owner', 'manager'].includes(req.user.role) && !can(req.user, 'products')) return res.status(403).json({ error: 'Sem permissão.' });
  const b = req.body || {}, f = urlToFile(b.url);
  if (!f || !fs.existsSync(f)) return res.status(400).json({ error: 'Imagem inválida.' });
  const m = /^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || ''));
  if (!m) return res.status(400).json({ error: 'Conversão inválida.' });
  const buf = Buffer.from(m[1], 'base64');
  if (buf.slice(0, 4).toString() !== 'RIFF' || buf.slice(8, 12).toString() !== 'WEBP' || buf.length > 8 * 1048576) return res.status(400).json({ error: 'Arquivo WebP inválido.' });
  const orig = fs.statSync(f).size;
  // se a versão WebP não ficou menor, guarda uma cópia do original com extensão .webp? não — grava só se valer a pena
  if (buf.length >= orig) { fs.writeFileSync(webpOf(f) + '.skip', ''); return res.json({ ok: true, skipped: true }); }
  fs.writeFileSync(webpOf(f), buf); webpCache.delete(f);
  res.json({ ok: true, saved: orig - buf.length });
});

/* ---- SEO: prévias de link (WhatsApp/Instagram), Google, sitemap ---- */
const seo = require('./seo')({ db, getSettings, J, indexPath: path.join(__dirname, 'public', 'index.html'), baseUrl, effectivePrice: (p) => effectivePrice(p) });
/* arquivos com impressão digital: /js/app.js?v=hash — o navegador guarda por 1 ano e baixa de novo só quando o arquivo muda */
const assetVer = new Map();
function verOf(rel) {
  const f = path.join(__dirname, 'public', rel);
  try { const st = fs.statSync(f), c = assetVer.get(rel); if (c && c.m === st.mtimeMs) return c.v;
    const v = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 10); assetVer.set(rel, { m: st.mtimeMs, v }); return v; } catch { return ''; }
}
const versionAssets = (html) => html.replace(/(<(?:script|link)\b[^>]*?\s(?:src|href)=")(\/(?:js|css)\/[\w.-]+\.(?:js|css))(")/g, (m, a, u, b) => { const v = verOf(u.slice(1)); return a + u + (v ? '?v=' + v : '') + b; });
app.use((req, res, next) => {
  if (/^\/(js|css)\//.test(req.path)) res.setHeader('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache');
  else if (/^\/img\//.test(req.path)) res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
  next();
});

/* backup automático do banco: cópia consistente (VACUUM INTO) 1x por dia, guarda os 14 últimos */
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
if (!store.REMOTE_DB) fs.mkdirSync(BACKUP_DIR, { recursive: true });
const BACKUP_RE = /^loja-\d{4}-\d{2}-\d{2}(-\d{6})?\.db$/;
// cópia completa em JSON (todas as tabelas) — usada na nuvem
function exportJson() {
  const out = { exported_at: new Date().toISOString(), tables: {} };
  for (const t of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE 'libsql_%'").all())
    out.tables[t.name] = db.prepare(`SELECT * FROM "${t.name.replace(/"/g, '')}"`).all();
  return out;
}
function backupDb(force) {
  const d = new Date(), p = (n) => String(n).padStart(2, '0'), day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const name = force ? `loja-${day}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.db` : `loja-${day}.db`;
  const f = path.join(BACKUP_DIR, name);
  if (fs.existsSync(f)) return null;
  db.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`);
  fs.readdirSync(BACKUP_DIR).filter((n) => BACKUP_RE.test(n)).sort().reverse().slice(14).forEach((n) => fs.rmSync(path.join(BACKUP_DIR, n), { force: true }));
  return name;
}
const backupSafe = () => { try { backupDb(); } catch (e) { console.error('backup:', e.message); } };
if (!store.REMOTE_DB) jobs.every('backup', 3600000, backupSafe, { firstDelay: 20000 });
app.get('/api/admin/backups', auth(), ownerOnly2, (req, res) => {
  if (store.REMOTE_DB) { const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return res.json([{ name: `loja-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`, size: 0, created_at: d.toISOString(), cloud: true }]); }
  res.json(fs.readdirSync(BACKUP_DIR).filter((n) => BACKUP_RE.test(n)).sort().reverse()
    .map((n) => { const st = fs.statSync(path.join(BACKUP_DIR, n)); return { name: n, size: st.size, created_at: st.mtime.toISOString() }; }));
});
app.post('/api/admin/backups', auth(), ownerOnly2, limit('backup-now', 10, 3600000), (req, res) => {
  if (store.REMOTE_DB) return res.json({ ok: true, name: 'nuvem', note: 'Na nuvem o Supabase guarda cópias diárias automaticamente. Use Baixar para levar uma cópia completa.' });
  try { const n = backupDb(true); audit(req, 'backup_manual', n || ''); res.json({ ok: true, name: n }); } catch (e) { res.status(500).json({ error: 'Falha no backup: ' + e.message }); }
});
app.get('/api/admin/backups/:name', auth(), ownerOnly2, (req, res) => {
  if (store.REMOTE_DB) { const n = String(req.params.name); if (!/^loja-\d{4}-\d{2}-\d{2}\.json$/.test(n)) return res.status(404).json({ error: 'Backup não encontrado.' });
    audit(req, 'backup_baixado', n); res.setHeader('Content-Disposition', `attachment; filename="${n}"`); return res.type('application/json').send(JSON.stringify(exportJson())); }
  const n = String(req.params.name); if (!BACKUP_RE.test(n) || !fs.existsSync(path.join(BACKUP_DIR, n))) return res.status(404).json({ error: 'Backup não encontrado.' });
  audit(req, 'backup_baixado', n); res.download(path.join(BACKUP_DIR, n), n);
});

/* contato para relatar falhas de segurança (padrão RFC 9116) */
app.get('/.well-known/security.txt', (req, res) => {
  const st = getSettings();
  res.type('text/plain').send(`Contact: mailto:${st.email || 'contato@aladdintech.com.br'}\nExpires: ${new Date(Date.now() + 365 * 864e5).toISOString()}\nPreferred-Languages: pt-BR, en\nCanonical: ${baseUrl(req)}/.well-known/security.txt\n`);
});

app.get('/sitemap.xml', (req, res) => { res.setHeader('Cache-Control', 'public, max-age=3600'); res.type('application/xml').send(seo.sitemap(req)); });
app.get('/robots.txt', (req, res) => res.type('text/plain').send(seo.robots(req)));
app.get(/^\/(?!api\/|uploads\/|admin|documento\/)[^.]*$/, (req, res, next) => {
  try { const r = seo.render(req); res.setHeader('Cache-Control', 'no-cache'); res.status(r.status).type('html').send(versionAssets(r.html)); } catch (e) { console.error('seo', e.message); next(); }
});

/* ---- estáticos ---- */
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', setHeaders: (res) => res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'") }));
app.get('/admin', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.type('html').send(versionAssets(fs.readFileSync(path.join(__dirname, 'public', 'admin.html'), 'utf8'))); });
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], index: false, cacheControl: false }));
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Rota não encontrada' });
  if (req.path.startsWith('/uploads/')) return res.status(404).end();
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(versionAssets(fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8')));
});
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Arquivo grande demais.' });
  console.error(err);
  res.status(500).json({ error: 'Erro interno. Tente novamente.' });
});

module.exports = app;
if (!store.SERVERLESS) app.listen(PORT, () => {
  console.log(`\n  Aladdin Tech no ar: http://localhost:${PORT}`);
  console.log(`  Painel: http://localhost:${PORT}/admin  (usuario: admin / senha inicial: aladdin2026)\n`);
});
