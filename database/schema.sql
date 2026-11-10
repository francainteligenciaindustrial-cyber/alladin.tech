-- =====================================================================
--  Aladdin Tech — esquema completo do banco de dados (SQLite 3)
--  Mesmo banco usado pelo site (data/loja.db). Execute em um arquivo vazio:
--      sqlite3 data/loja.db < database/schema.sql
--  Ou deixe o próprio servidor criar tudo sozinho na primeira execução.
--
--  Convenções
--   • Datas: TEXT 'AAAA-MM-DD HH:MM:SS' (hora local); promoções 'AAAA-MM-DDTHH:MM'
--   • Valores em reais: REAL (2 casas, arredondado pelo servidor)
--   • Booleanos: INTEGER 0/1
--   • Listas (fotos, itens do pedido…): TEXT com JSON
--   • Senhas: NUNCA em texto — formato "salt:hash" (scrypt, 64 bytes)
--   • Tokens de sessão/links: só o hash SHA-256 é salvo
-- =====================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

BEGIN;

-- ---------------------------------------------------------------------
-- CONFIGURAÇÕES DA LOJA (chave → valor JSON)
-- Ex.: store_name, whatsapp, address, delivery_zones, pix_discount,
--      smtp_*, mp_access_token, always_open, faq, ceo_*, team_*, wall_photos…
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ---------------------------------------------------------------------
-- EQUIPE (acesso ao painel /admin)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  username    TEXT    NOT NULL UNIQUE,
  password    TEXT    NOT NULL,                       -- salt:hash (scrypt)
  role        TEXT    NOT NULL DEFAULT 'seller'
              CHECK (role IN ('owner','manager','seller')),  -- Dono, Gerente, Vendedor
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  must_change INTEGER NOT NULL DEFAULT 0 CHECK (must_change IN (0,1)), -- obriga trocar senha
  last_login  TEXT    DEFAULT '',
  photo       TEXT    DEFAULT '',                     -- foto (pódio e atendimento do site)
  whatsapp    TEXT    DEFAULT '',                     -- WhatsApp de atendimento
  title       TEXT    DEFAULT '',                     -- cargo exibido
  ref_code    TEXT    DEFAULT '',                     -- link de vendas: /?v=codigo
  in_ranking  INTEGER NOT NULL DEFAULT 0 CHECK (in_ranking IN (0,1)),
  goal        REAL    DEFAULT 0,                      -- meta do mês (R$)
  email       TEXT    DEFAULT '',                     -- recuperar senha
  customer_id INTEGER,                                -- conta de cliente vinculada (foto de perfil)
  created_at  TEXT    DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (               -- sessões do painel
  token_hash TEXT    PRIMARY KEY,                    -- SHA-256 do cookie at_sess
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires    INTEGER NOT NULL,                       -- epoch em milissegundos
  ip         TEXT    DEFAULT '',
  ua         TEXT    DEFAULT '',
  created_at TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);

CREATE TABLE IF NOT EXISTS audit_log (              -- quem fez o quê no painel
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_name  TEXT,
  action     TEXT,
  detail     TEXT DEFAULT '',
  ip         TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- ---------------------------------------------------------------------
-- CATÁLOGO
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL,
  slug TEXT    NOT NULL UNIQUE,                       -- usado na URL /categoria/<slug>
  icon TEXT    DEFAULT 'acessorios',                  -- iphone, macbook, ipad, watch, airpods, jbl, playstation, bike, acessorios
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  slug        TEXT    NOT NULL UNIQUE,               -- URL /produto/<slug>
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  brand       TEXT    DEFAULT '',
  condition   TEXT    DEFAULT 'Novo',                -- Novo, Lacrado, Seminovo, Vitrine
  short       TEXT    DEFAULT '',                    -- frase do cartão
  description TEXT    DEFAULT '',
  price       REAL    NOT NULL DEFAULT 0 CHECK (price >= 0),
  old_price   REAL    DEFAULT 0 CHECK (old_price >= 0),    -- preço “de” riscado
  promo_price REAL    DEFAULT 0 CHECK (promo_price >= 0),  -- 0 = sem promoção
  promo_start TEXT    DEFAULT '',                    -- vazio = já começou
  promo_end   TEXT    DEFAULT '',                    -- vazio = sem prazo
  cost        REAL    DEFAULT 0,                     -- custo (privado, nunca vai à loja)
  stock       INTEGER DEFAULT 0 CHECK (stock >= 0),
  sku         TEXT    DEFAULT '',
  warranty    TEXT    DEFAULT '',
  images      TEXT    DEFAULT '[]',                  -- JSON ["/uploads/produtos/x.jpg", …] (1ª = capa)
  specs       TEXT    DEFAULT '[]',                  -- JSON [{"k":"Chip","v":"A19"}, …]
  options     TEXT    DEFAULT '[]',                  -- JSON [{"name":"Cor","values":["Preto","Branco"]}, …]
  featured    INTEGER DEFAULT 0 CHECK (featured IN (0,1)),
  active      INTEGER DEFAULT 1 CHECK (active IN (0,1)),   -- 0 = pausado
  created_at  TEXT    DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    DEFAULT '',
  ncm         TEXT    DEFAULT '',                    -- código fiscal (nota fiscal)
  weight_kg   REAL    DEFAULT 0,                     -- peso com embalagem (frete)
  width_cm    REAL    DEFAULT 0,
  height_cm   REAL    DEFAULT 0,
  length_cm   REAL    DEFAULT 0,
  warranty_months INTEGER DEFAULT 0,                 -- 0 = padrão da loja (novo/seminovo)
  grade       TEXT    DEFAULT '' CHECK (grade IN ('','A','B','C')),   -- estado do seminovo
  battery_health INTEGER DEFAULT 0 CHECK (battery_health BETWEEN 0 AND 100),
  imei_checked INTEGER DEFAULT 0 CHECK (imei_checked IN (0,1)),
  real_photos INTEGER DEFAULT 0 CHECK (real_photos IN (0,1)),
  used_notes  TEXT    DEFAULT '',
  included    TEXT    DEFAULT '',
  coming_soon INTEGER DEFAULT 0 CHECK (coming_soon IN (0,1)),   -- pré-venda / em breve
  coming_eta  TEXT    DEFAULT '',
  preorder_deposit REAL DEFAULT 0,                  -- sinal para entrar na fila
  preorder_units INTEGER DEFAULT 0,
  videos      TEXT    DEFAULT '[]',                 -- links YouTube/Instagram/TikTok
  gtin        TEXT    DEFAULT '',                   -- código de barras (Google Shopping)
  track_units INTEGER DEFAULT 0 CHECK (track_units IN (0,1)),   -- estoque por unidade (IMEI)
  ml_item_id  TEXT    DEFAULT '',                   -- anúncio no Mercado Livre (MLB...)
  shopee_item_id TEXT DEFAULT '',                   -- item na Shopee
  channel_stock INTEGER,                            -- último estoque enviado aos canais
  sold_base   INTEGER DEFAULT 0                     -- vendas reais anteriores ao site ("+N vendidos")
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active   ON products(active, featured);
CREATE INDEX IF NOT EXISTS idx_products_sku      ON products(sku);

CREATE TABLE IF NOT EXISTS coupons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT    NOT NULL UNIQUE,               -- sempre MAIÚSCULO
  type        TEXT    NOT NULL DEFAULT 'percent'
              CHECK (type IN ('percent','fixed','freeship')),
  value       REAL    DEFAULT 0 CHECK (value >= 0),
  min_order   REAL    DEFAULT 0,
  max_uses    INTEGER DEFAULT 0,                     -- 0 = ilimitado
  uses        INTEGER DEFAULT 0,
  expires_at  TEXT    DEFAULT '',                    -- 'AAAA-MM-DD' ou vazio
  description TEXT    DEFAULT '',
  active      INTEGER DEFAULT 1 CHECK (active IN (0,1)),
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE  -- cupom pessoal (indique e ganhe)
);

-- ---------------------------------------------------------------------
-- CLIENTES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  email          TEXT    NOT NULL UNIQUE,            -- sempre minúsculo
  phone          TEXT    DEFAULT '',
  password       TEXT    NOT NULL,                   -- salt:hash (scrypt)
  avatar         TEXT    DEFAULT '',                 -- foto de perfil
  cover          TEXT    DEFAULT '',                 -- capa do perfil
  city           TEXT    DEFAULT '',
  uf             TEXT    DEFAULT '',
  bio            TEXT    DEFAULT '',
  email_verified INTEGER DEFAULT 0 CHECK (email_verified IN (0,1)),
  marketing      INTEGER DEFAULT 0 CHECK (marketing IN (0,1)),   -- aceita e-mails de oferta (LGPD)
  unsub_token    TEXT    DEFAULT '',                 -- link “descadastrar”
  ref_code       TEXT    DEFAULT '',                 -- link “indique e ganhe”: /?indica=CODIGO
  referred_by    INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  referral_rewarded INTEGER DEFAULT 0 CHECK (referral_rewarded IN (0,1)),
  birthday       TEXT    DEFAULT '',                 -- AAAA-MM-DD (presente de aniversário)
  created_at     TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_customers_marketing ON customers(marketing, email_verified);
CREATE INDEX IF NOT EXISTS idx_customers_unsub     ON customers(unsub_token);

CREATE TABLE IF NOT EXISTS customer_sessions (       -- login do cliente (cookie at_cli)
  token_hash  TEXT    PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_csessions_customer ON customer_sessions(customer_id);

CREATE TABLE IF NOT EXISTS customer_tokens (         -- links de uso único
  token_hash  TEXT    PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type        TEXT    NOT NULL CHECK (type IN ('verify','reset')),  -- confirmar e-mail / nova senha
  expires     INTEGER NOT NULL,
  data        TEXT    DEFAULT ''                     -- e-mail novo (na troca de e-mail)
);
CREATE INDEX IF NOT EXISTS idx_ctokens_customer ON customer_tokens(customer_id, type);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label       TEXT    DEFAULT 'Casa',
  recipient   TEXT    DEFAULT '',
  cep         TEXT,
  street      TEXT,
  number      TEXT,
  complement  TEXT    DEFAULT '',
  district    TEXT,
  city        TEXT,
  uf          TEXT,
  lat         REAL,                                  -- “usar minha localização”
  lng         REAL,
  is_default  INTEGER DEFAULT 0 CHECK (is_default IN (0,1)),
  created_at  TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_addresses_customer ON customer_addresses(customer_id);

CREATE TABLE IF NOT EXISTS wishlist (                -- lista de desejos
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
  created_at  TEXT    DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (customer_id, product_id)
);

CREATE TABLE IF NOT EXISTS price_alerts (            -- “baixou o preço” / “chegou no estoque”
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  email       TEXT    NOT NULL,                      -- visitante pode criar sem conta
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  type        TEXT    NOT NULL DEFAULT 'price' CHECK (type IN ('price','stock')),
  base_price  REAL    DEFAULT 0,                     -- preço quando o alerta foi criado
  active      INTEGER DEFAULT 1 CHECK (active IN (0,1)),
  token       TEXT    NOT NULL UNIQUE,               -- link “cancelar alerta”
  created_at  TEXT    DEFAULT (datetime('now','localtime')),
  notified_at TEXT    DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON price_alerts(active, product_id);
CREATE INDEX IF NOT EXISTS idx_alerts_email  ON price_alerts(email);

-- ---------------------------------------------------------------------
-- PEDIDOS
-- (itens e endereço ficam “congelados” em JSON: o pedido não muda se o
--  produto for editado ou excluído depois — exigência fiscal)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT    NOT NULL UNIQUE,           -- ex.: ATSI9S519124
  customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer        TEXT,                              -- JSON {name, phone, email, cpf}
  items           TEXT,                              -- JSON [{id, name, price, qty, options, image}]
  subtotal        REAL,
  discount        REAL    DEFAULT 0,                 -- cupom
  pix_discount    REAL    DEFAULT 0,
  shipping        REAL    DEFAULT 0,
  total           REAL,
  coupon          TEXT    DEFAULT '',
  delivery_method TEXT    CHECK (delivery_method IN ('delivery','pickup')),
  delivery        TEXT,                              -- JSON {label, eta, address{…,uf,lat,lng}}
  payment         TEXT    CHECK (payment IN ('pix','card','cash')),
  installments    INTEGER DEFAULT 1,
  notes           TEXT    DEFAULT '',
  status          TEXT    DEFAULT 'novo'
                  CHECK (status IN ('novo','confirmado','separando','enviado','pronto','entregue','cancelado')),
  tracking        TEXT    DEFAULT '',                -- código de rastreio dos Correios
  pay_status      TEXT    DEFAULT '',                -- pagamento online: pendente, aprovado, recusado…
  pay_id          TEXT    DEFAULT '',                -- id do pagamento no Mercado Pago
  pay_url         TEXT    DEFAULT '',                -- link do checkout do Mercado Pago
  nfe_status      TEXT    DEFAULT '',                -- '', processando, autorizado, erro, cancelada
  nfe_ref         TEXT    DEFAULT '',                -- referência na Focus NFe
  nfe_key         TEXT    DEFAULT '',                -- chave de acesso (44 dígitos)
  nfe_number      TEXT    DEFAULT '',
  nfe_danfe       TEXT    DEFAULT '',                -- link do PDF
  nfe_xml         TEXT    DEFAULT '',                -- link do XML
  nfe_error       TEXT    DEFAULT '',
  seller_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- vendedor (ranking)
  channel         TEXT    DEFAULT 'site' CHECK (channel IN ('site','loja','marketplace')),
  seller_source   TEXT    DEFAULT '',                -- link, whatsapp, checkout, painel
  doc_token       TEXT    DEFAULT '',                -- link do recibo + termo de garantia
  reserve_until   TEXT    DEFAULT '',                -- reserva: retirar até
  kind            TEXT    DEFAULT '',                -- '' venda · 'sinal' pré-venda
  cashback_used   REAL    DEFAULT 0,                 -- cashback do Clube usado (já incluso em discount)
  created_at      TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders(created_at);

CREATE INDEX IF NOT EXISTS idx_orders_nfe ON orders(nfe_status);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id, created_at);

-- ---------------------------------------------------------------------
-- CARRINHOS (lembrete de carrinho abandonado)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS carts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  token            TEXT    NOT NULL UNIQUE,           -- link “recuperar carrinho”
  customer_id      INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  email            TEXT    DEFAULT '',
  name             TEXT    DEFAULT '',
  phone            TEXT    DEFAULT '',
  consent          INTEGER DEFAULT 0 CHECK (consent IN (0,1)),   -- autorizou lembrete por e-mail
  items            TEXT    DEFAULT '[]',              -- JSON [{id, qty, options}]
  subtotal         REAL    DEFAULT 0,
  status           TEXT    DEFAULT 'aberto' CHECK (status IN ('aberto','lembrado','convertido')),
  reminders        INTEGER DEFAULT 0,
  last_reminder_at TEXT    DEFAULT '',
  recovered_clicks INTEGER DEFAULT 0,
  order_code       TEXT    DEFAULT '',
  created_at       TEXT    DEFAULT (datetime('now','localtime')),
  updated_at       TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_carts_status ON carts(status, updated_at);

-- ---------------------------------------------------------------------
-- AVALIAÇÕES E PERGUNTAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER REFERENCES products(id) ON DELETE CASCADE,   -- NULL = avaliação da loja
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  name        TEXT    NOT NULL,
  city        TEXT    DEFAULT '',
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       TEXT    DEFAULT '',
  comment     TEXT    NOT NULL,
  photos      TEXT    DEFAULT '[]',                  -- JSON (até 5 fotos)
  verified    INTEGER DEFAULT 0 CHECK (verified IN (0,1)),          -- compra verificada
  helpful     INTEGER DEFAULT 0,                     -- votos “útil”
  approved    INTEGER DEFAULT 0 CHECK (approved IN (0,1)),          -- moderação
  reply       TEXT    DEFAULT '',                    -- resposta pública da loja
  reply_at    TEXT    DEFAULT '',
  order_code  TEXT    DEFAULT '',
  created_at  TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_reviews_product  ON reviews(product_id, approved);
CREATE INDEX IF NOT EXISTS idx_reviews_customer ON reviews(customer_id);

CREATE TABLE IF NOT EXISTS questions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  name        TEXT    NOT NULL,
  question    TEXT    NOT NULL,
  answer      TEXT    DEFAULT '',
  answered_by TEXT    DEFAULT '',
  answered_at TEXT    DEFAULT '',
  public      INTEGER DEFAULT 1 CHECK (public IN (0,1)),
  created_at  TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_questions_product ON questions(product_id, answer);

-- ---------------------------------------------------------------------
-- E-MAILS (caixa de saída: tudo o que foi enviado ou simulado)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS emails (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  to_addr    TEXT,
  subject    TEXT,
  html       TEXT,
  kind       TEXT,      -- verificacao, senha, pedido, oferta, alerta, teste
  status     TEXT,      -- enviado, simulado (sem SMTP), erro
  error      TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_emails_created ON emails(created_at);

-- =====================================================================
-- DADOS INICIAIS
-- =====================================================================
INSERT OR IGNORE INTO categories (name, slug, icon, sort) VALUES
  ('iPhone',               'iphone',               'iphone',      0),
  ('MacBook',              'macbook',              'macbook',     1),
  ('iPad',                 'ipad',                 'ipad',        2),
  ('Apple Watch',          'apple-watch',          'watch',       3),
  ('AirPods & iPod',       'airpods',              'airpods',     4),
  ('JBL',                  'jbl',                  'jbl',         5),
  ('PlayStation',          'playstation',          'playstation', 6),
  ('Bicicletas elétricas', 'bicicletas-eletricas', 'bike',        7),
  ('Acessórios',           'acessorios',           'acessorios',  8);

INSERT OR IGNORE INTO coupons (code, type, value, min_order, description) VALUES
  ('BEMVINDO',    'percent',  5, 500,  '5% na primeira compra'),
  ('FRETEGRATIS', 'freeship', 0, 1000, 'Frete grátis acima de R$ 1.000');

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('store_name',   '"Aladdin Tech"'),
  ('tagline',      '"Referência em Upgrade"'),
  ('always_open',  'true'),
  ('hours',        '[{"days":"Todos os dias","time":"24 horas"}]'),
  ('pix_discount', '5'),
  ('max_installments', '12'),
  ('installments_no_interest', '10'),
  ('pickup_enabled', 'true'),
  ('delivery_zones', '[{"name":"Entrega grátis na região","fee":0,"eta":"Em até 2 dias úteis","scope":"estado","values":""},{"name":"Correios — PAC","fee":39.9,"eta":"5 a 12 dias úteis","scope":"brasil","values":""},{"name":"Correios — SEDEX","fee":69.9,"eta":"2 a 5 dias úteis","scope":"brasil","values":""}]'),
  ('zones_v2',     'true'),
  ('reviews_moderation', 'true'),
  ('require_email_verification', 'true');

-- O usuário dono (login “admin”) NÃO é criado aqui de propósito: a senha
-- precisa ser gerada com scrypt. O servidor cria “admin / aladdin2026” na
-- primeira execução e obriga a troca no primeiro acesso.

COMMIT;

-- ---------------------------------------------------------------------
-- EQUIPE: recuperação de senha · COMISSÕES (só o Dono) · GARANTIA · WHATSAPP
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_tokens ( token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL );
CREATE TABLE IF NOT EXISTS commission_config ( id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL DEFAULT '{}', updated_at TEXT DEFAULT '', updated_by TEXT DEFAULT '' );
CREATE TABLE IF NOT EXISTS commission_payouts (
  month TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id), amount REAL NOT NULL, base REAL NOT NULL, orders INTEGER NOT NULL,
  paid_at TEXT DEFAULT (datetime('now','localtime')), paid_by TEXT DEFAULT '', note TEXT DEFAULT '', PRIMARY KEY (month, user_id) );
CREATE TABLE IF NOT EXISTS warranties (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, order_code TEXT NOT NULL, item_index INTEGER NOT NULL,
  product_id INTEGER, product_name TEXT NOT NULL, condition TEXT DEFAULT 'Novo', serial TEXT NOT NULL, serial_type TEXT NOT NULL DEFAULT 'imei' CHECK (serial_type IN ('imei','serie')),
  customer_name TEXT DEFAULT '', sold_at TEXT NOT NULL, months INTEGER NOT NULL, expires_at TEXT NOT NULL,
  created_by TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime')) );
CREATE INDEX IF NOT EXISTS idx_warranties_serial ON warranties(serial);
CREATE INDEX IF NOT EXISTS idx_warranties_order ON warranties(order_id);
CREATE TABLE IF NOT EXISTS wa_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_code TEXT, phone TEXT, kind TEXT, provider TEXT, status TEXT, error TEXT DEFAULT '', body TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')) );
CREATE INDEX IF NOT EXISTS idx_orders_reserve ON orders(reserve_until);
CREATE INDEX IF NOT EXISTS idx_customers_ref ON customers(ref_code);

-- TROCA GARANTIDA · PRÉ-VENDA
CREATE TABLE IF NOT EXISTS trade_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, order_code TEXT NOT NULL, item_index INTEGER NOT NULL,
  product_id INTEGER, product_name TEXT NOT NULL, customer_id INTEGER, customer_name TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '',
  paid_value REAL NOT NULL, pct_a REAL NOT NULL, pct_b REAL NOT NULL, pct_c REAL NOT NULL, starts_at TEXT NOT NULL, opens_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','resgatado','expirado','cancelado')),
  redeemed_at TEXT DEFAULT '', redeemed_grade TEXT DEFAULT '', redeemed_value REAL DEFAULT 0, coupon_code TEXT DEFAULT '', redeemed_by TEXT DEFAULT '',
  notified_open INTEGER DEFAULT 0, notified_expiring INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now','localtime')) );
CREATE INDEX IF NOT EXISTS idx_trade_order ON trade_plans(order_id);
CREATE INDEX IF NOT EXISTS idx_trade_customer ON trade_plans(customer_id);
CREATE TABLE IF NOT EXISTS preorders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL REFERENCES products(id), options TEXT DEFAULT '{}', type TEXT NOT NULL CHECK (type IN ('aviso','sinal')),
  name TEXT NOT NULL, phone TEXT DEFAULT '', email TEXT DEFAULT '', customer_id INTEGER, deposit REAL DEFAULT 0, order_code TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','pago','avisado','convertido','cancelado')),
  paid_at TEXT DEFAULT '', notified_at TEXT DEFAULT '', sale_code TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime')) );
CREATE INDEX IF NOT EXISTS idx_preorders_product ON preorders(product_id, status);

-- GUIAS · CLUBE ALADDIN · LEMBRETES · NOTIFICAÇÕES (app)
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, excerpt TEXT DEFAULT '', body TEXT DEFAULT '', cover TEXT DEFAULT '',
  published INTEGER DEFAULT 1, author TEXT DEFAULT '', views INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')) );
CREATE TABLE IF NOT EXISTS cashback (
  id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE, order_id INTEGER, order_code TEXT DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('credito','uso','estorno','expirado','ajuste')), amount REAL NOT NULL, note TEXT DEFAULT '',
  expires_at TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime')) );
CREATE INDEX IF NOT EXISTS idx_cashback_customer ON cashback(customer_id);
CREATE TABLE IF NOT EXISTS reminders_sent ( key TEXT PRIMARY KEY, customer_id INTEGER, kind TEXT, sent_at TEXT DEFAULT (datetime('now','localtime')) );
CREATE TABLE IF NOT EXISTS push_subs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT UNIQUE NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
  customer_id INTEGER, orders TEXT DEFAULT '[]', offers INTEGER DEFAULT 1, fails INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now','localtime')) );

-- LAUDO TÉCNICO · ASSISTÊNCIA TÉCNICA · FINANCEIRO · ESTOQUE POR IMEI · CANAIS (Mercado Livre / Shopee)
CREATE TABLE IF NOT EXISTS inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT UNIQUE NOT NULL, product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, model TEXT NOT NULL, serial TEXT DEFAULT '',
  results TEXT NOT NULL DEFAULT '{}', battery_health INTEGER DEFAULT 0, cycles INTEGER DEFAULT 0, grade TEXT DEFAULT '', notes TEXT DEFAULT '', technician TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')) );
CREATE TABLE IF NOT EXISTS service_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, token TEXT UNIQUE NOT NULL, customer_id INTEGER, name TEXT NOT NULL, phone TEXT DEFAULT '', email TEXT DEFAULT '',
  device TEXT NOT NULL, serial TEXT DEFAULT '', problem TEXT NOT NULL, accessories TEXT DEFAULT '', condition_notes TEXT DEFAULT '',
  budget REAL DEFAULT 0, budget_notes TEXT DEFAULT '', budget_status TEXT DEFAULT '' CHECK (budget_status IN ('','aguardando','aprovado','recusado')),
  status TEXT NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido','em_analise','orcamento','em_reparo','pronto','entregue','cancelado')),
  history TEXT NOT NULL DEFAULT '[]', technician TEXT DEFAULT '', warranty_days INTEGER DEFAULT 90, eta TEXT DEFAULT '', created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')), delivered_at TEXT DEFAULT '' );
CREATE TABLE IF NOT EXISTS order_costs ( order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id INTEGER, qty INTEGER NOT NULL, unit_cost REAL NOT NULL, PRIMARY KEY (order_id, product_id) );
CREATE TABLE IF NOT EXISTS stock_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL REFERENCES products(id), serial TEXT NOT NULL, cost REAL DEFAULT 0, supplier TEXT DEFAULT '',
  origin TEXT DEFAULT 'compra' CHECK (origin IN ('compra','troca','consignado','outro')), notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'disponivel' CHECK (status IN ('disponivel','reservado','vendido','baixa')), order_code TEXT DEFAULT '',
  entry_date TEXT DEFAULT (datetime('now','localtime')), sold_at TEXT DEFAULT '', created_by TEXT DEFAULT '' );
CREATE INDEX IF NOT EXISTS idx_units_product ON stock_units(product_id, status);
CREATE INDEX IF NOT EXISTS idx_units_serial ON stock_units(serial);
CREATE TABLE IF NOT EXISTS channel_orders ( channel TEXT NOT NULL, ext_id TEXT NOT NULL, order_code TEXT DEFAULT '', status TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime')), PRIMARY KEY (channel, ext_id) );
CREATE TABLE IF NOT EXISTS channel_log ( id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, action TEXT, detail TEXT, ok INTEGER, created_at TEXT DEFAULT (datetime('now','localtime')) );
