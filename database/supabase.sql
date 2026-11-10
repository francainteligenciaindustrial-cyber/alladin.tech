-- =====================================================================
--  Aladdin Tech — banco de dados para SUPABASE (PostgreSQL 15+)
--  Como usar: Supabase → SQL Editor → New query → cole tudo → Run.
--  Pode rodar de novo sem perder dados (tudo é IF NOT EXISTS / ON CONFLICT).
--
--  Segurança
--   • RLS (Row Level Security) LIGADO em todas as tabelas e SEM políticas:
--     a chave pública (anon) e usuários do Supabase Auth NÃO leem nada.
--     Só o servidor da loja acessa, pela conexão direta (DATABASE_URL),
--     que é quem valida login, permissões, preços e estoque.
--   • Senhas: "salt:hash" (scrypt) geradas pelo servidor. Tokens: só o SHA-256.
--   • Dinheiro em NUMERIC(12,2) (sem erro de arredondamento).
-- =====================================================================

create extension if not exists citext;

-- atualiza updated_at automaticamente
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------------
-- CONFIGURAÇÕES DA LOJA (chave → valor JSON)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- EQUIPE (painel /admin)
-- ---------------------------------------------------------------------
create table if not exists public.users (
  id          bigint generated always as identity primary key,
  name        text    not null,
  username    citext  not null unique,
  password    text    not null,                                -- salt:hash (scrypt)
  role        text    not null default 'seller' check (role in ('owner','manager','seller')),
  active      boolean not null default true,
  must_change boolean not null default false,
  last_login  timestamptz,
  photo       text    default '',
  whatsapp    text    default '',
  title       text    default '',
  ref_code    citext  unique,                                  -- link de vendas: /?v=codigo
  in_ranking  boolean not null default false,
  goal        numeric(12,2) not null default 0 check (goal >= 0),
  email       citext  default '',                              -- recuperar senha
  customer_id bigint,                                          -- conta de cliente vinculada (foto)
  created_at  timestamptz not null default now()
);

create table if not exists public.sessions (
  token_hash text primary key,                                  -- SHA-256 do cookie
  user_id    bigint not null references public.users(id) on delete cascade,
  expires    timestamptz not null,
  ip         text default '',
  ua         text default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_sessions_user    on public.sessions(user_id);
create index if not exists idx_sessions_expires on public.sessions(expires);

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  user_name  text,
  action     text not null,
  detail     text default '',
  ip         text default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_created on public.audit_log(created_at desc);

-- ---------------------------------------------------------------------
-- CATÁLOGO
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id   bigint generated always as identity primary key,
  name text not null,
  slug text not null unique,
  icon text not null default 'acessorios',
  sort int  not null default 0
);

create table if not exists public.products (
  id          bigint generated always as identity primary key,
  name        text not null,
  slug        text not null unique,
  category_id bigint references public.categories(id) on delete set null,
  brand       text default '',
  condition   text default 'Novo' check (condition in ('Novo','Lacrado','Seminovo','Vitrine')),
  short       text default '',
  description text default '',
  price       numeric(12,2) not null default 0 check (price >= 0),
  old_price   numeric(12,2) not null default 0 check (old_price >= 0),
  promo_price numeric(12,2) not null default 0 check (promo_price >= 0),
  promo_start timestamptz,
  promo_end   timestamptz,
  cost        numeric(12,2) not null default 0,                -- privado
  stock       int not null default 0 check (stock >= 0),
  sku         text default '',
  warranty    text default '',
  images      jsonb not null default '[]'::jsonb,               -- ["/uploads/…", …] 1ª = capa
  specs       jsonb not null default '[]'::jsonb,               -- [{"k":"Chip","v":"A19"}]
  options     jsonb not null default '[]'::jsonb,               -- [{"name":"Cor","values":[…]}]
  featured    boolean not null default false,
  active      boolean not null default true,
  ncm         text default '',
  weight_kg   numeric(8,3) not null default 0 check (weight_kg >= 0),
  width_cm    numeric(8,1) not null default 0 check (width_cm >= 0),
  height_cm   numeric(8,1) not null default 0 check (height_cm >= 0),
  length_cm   numeric(8,1) not null default 0 check (length_cm >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  warranty_months int not null default 0 check (warranty_months between 0 and 60),
  grade       text default '' check (grade in ('','A','B','C')),
  battery_health int not null default 0 check (battery_health between 0 and 100),
  imei_checked boolean not null default false,
  real_photos boolean not null default false,
  used_notes  text default '',
  included    text default '',
  coming_soon boolean not null default false,
  coming_eta  text default '',
  preorder_deposit numeric(12,2) not null default 0 check (preorder_deposit >= 0),
  preorder_units int not null default 0,
  videos      jsonb not null default '[]'::jsonb,
  gtin        text default '',
  track_units boolean not null default false,
  ml_item_id  text default '',
  shopee_item_id text default '',
  channel_stock int,
  sold_base   int not null default 0 check (sold_base >= 0),
  constraint promo_menor_que_preco check (promo_price = 0 or promo_price < price),
  constraint promo_periodo check (promo_end is null or promo_start is null or promo_end > promo_start)
);
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_products_active   on public.products(active, featured);
create index if not exists idx_products_sku      on public.products(sku) where sku <> '';
drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products for each row execute function public.set_updated_at();

create table if not exists public.coupons (
  id          bigint generated always as identity primary key,
  code        citext not null unique,
  type        text not null default 'percent' check (type in ('percent','fixed','freeship')),
  value       numeric(12,2) not null default 0 check (value >= 0),
  min_order   numeric(12,2) not null default 0,
  max_uses    int not null default 0,                           -- 0 = ilimitado
  uses        int not null default 0,
  expires_at  date,
  description text default '',
  active      boolean not null default true,
  constraint pct_valido check (type <> 'percent' or value <= 90)
);

-- ---------------------------------------------------------------------
-- CLIENTES
-- ---------------------------------------------------------------------
create table if not exists public.customers (
  id             bigint generated always as identity primary key,
  name           text   not null,
  email          citext not null unique,
  phone          text default '',
  password       text   not null,                              -- salt:hash (scrypt)
  avatar         text default '',
  cover          text default '',
  city           text default '',
  uf             char(2),
  bio            text default '',
  email_verified boolean not null default false,
  marketing      boolean not null default false,               -- consentimento LGPD
  unsub_token    text unique,
  ref_code       text unique,                                  -- /?indica=CODIGO
  referred_by    bigint references public.customers(id) on delete set null,
  referral_rewarded boolean not null default false,
  birthday       date,
  created_at     timestamptz not null default now()
);
create index if not exists idx_customers_marketing on public.customers(marketing, email_verified);

create table if not exists public.customer_sessions (
  token_hash  text primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  expires     timestamptz not null
);
create index if not exists idx_csessions_customer on public.customer_sessions(customer_id);

create table if not exists public.customer_tokens (
  token_hash  text primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  type        text not null check (type in ('verify','reset')),
  expires     timestamptz not null,
  data        text default ''
);
create index if not exists idx_ctokens_customer on public.customer_tokens(customer_id, type);

create table if not exists public.customer_addresses (
  id          bigint generated always as identity primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  label       text default 'Casa',
  recipient   text default '',
  cep         text not null check (cep ~ '^\d{5}-?\d{3}$'),
  street      text not null,
  number      text not null,
  complement  text default '',
  district    text not null,
  city        text not null,
  uf          char(2) not null,
  lat         double precision,
  lng         double precision,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_addresses_customer on public.customer_addresses(customer_id);
-- no máximo 1 endereço principal por cliente
create unique index if not exists uq_address_default on public.customer_addresses(customer_id) where is_default;

create table if not exists public.wishlist (
  customer_id bigint not null references public.customers(id) on delete cascade,
  product_id  bigint not null references public.products(id)  on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (customer_id, product_id)
);

create table if not exists public.price_alerts (
  id          bigint generated always as identity primary key,
  product_id  bigint not null references public.products(id) on delete cascade,
  email       citext not null,
  customer_id bigint references public.customers(id) on delete set null,
  type        text not null default 'price' check (type in ('price','stock')),
  base_price  numeric(12,2) not null default 0,
  active      boolean not null default true,
  token       text not null unique,
  created_at  timestamptz not null default now(),
  notified_at timestamptz
);
create index if not exists idx_alerts_active on public.price_alerts(product_id) where active;
create index if not exists idx_alerts_email  on public.price_alerts(email);

-- ---------------------------------------------------------------------
-- PEDIDOS (itens/endereço congelados em JSON — histórico fiscal)
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id              bigint generated always as identity primary key,
  code            text not null unique,
  customer_id     bigint references public.customers(id) on delete set null,
  customer        jsonb not null,                               -- {name, phone, email, cpf}
  items           jsonb not null,                               -- [{id,name,price,qty,options,image}]
  subtotal        numeric(12,2) not null,
  discount        numeric(12,2) not null default 0,
  pix_discount    numeric(12,2) not null default 0,
  shipping        numeric(12,2) not null default 0,
  total           numeric(12,2) not null check (total >= 0),
  coupon          text default '',
  delivery_method text not null check (delivery_method in ('delivery','pickup')),
  delivery        jsonb not null,                               -- {label, eta, address{…}}
  payment         text not null check (payment in ('pix','card','cash')),
  installments    int  not null default 1 check (installments between 1 and 24),
  notes           text default '',
  status          text not null default 'novo'
                  check (status in ('novo','confirmado','separando','enviado','pronto','entregue','cancelado')),
  tracking        text default '',
  pay_status      text default '',
  pay_id          text default '',
  pay_url         text default '',
  nfe_status      text default '' check (nfe_status in ('','processando','autorizado','erro','cancelada')),
  nfe_ref         text default '',
  nfe_key         text default '',
  nfe_number      text default '',
  nfe_danfe       text default '',
  nfe_xml         text default '',
  nfe_error       text default '',
  seller_id       bigint references public.users(id) on delete set null,
  channel         text not null default 'site' check (channel in ('site','loja','marketplace')),
  seller_source   text default '' check (seller_source in ('','link','whatsapp','checkout','painel')),
  doc_token       text default '',                                   -- recibo + termo de garantia
  reserve_until   timestamptz,                                       -- reserva: retirar até
  kind            text default '' check (kind in ('','sinal')),      -- sinal de pré-venda
  cashback_used   numeric(12,2) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_orders_customer on public.orders(customer_id);
create index if not exists idx_orders_status   on public.orders(status);
create index if not exists idx_orders_created  on public.orders(created_at desc);
drop trigger if exists trg_orders_updated on public.orders;
create trigger trg_orders_updated before update on public.orders for each row execute function public.set_updated_at();

create index if not exists idx_orders_nfe on public.orders(nfe_status) where nfe_status = 'processando';
create index if not exists idx_orders_seller on public.orders(seller_id, created_at);

-- ---------------------------------------------------------------------
-- CARRINHOS (lembrete de carrinho abandonado)
-- ---------------------------------------------------------------------
create table if not exists public.carts (
  id               bigint generated always as identity primary key,
  token            text not null unique,
  customer_id      bigint references public.customers(id) on delete set null,
  email            citext default '',
  name             text default '',
  phone            text default '',
  consent          boolean not null default false,
  items            jsonb not null default '[]'::jsonb,
  subtotal         numeric(12,2) not null default 0,
  status           text not null default 'aberto' check (status in ('aberto','lembrado','convertido')),
  reminders        int not null default 0,
  last_reminder_at timestamptz,
  recovered_clicks int not null default 0,
  order_code       text default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_carts_status on public.carts(status, updated_at);
drop trigger if exists trg_carts_updated on public.carts;
create trigger trg_carts_updated before update on public.carts for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- AVALIAÇÕES E PERGUNTAS
-- ---------------------------------------------------------------------
create table if not exists public.reviews (
  id          bigint generated always as identity primary key,
  product_id  bigint references public.products(id) on delete cascade,   -- null = loja
  customer_id bigint references public.customers(id) on delete set null,
  name        text not null,
  city        text default '',
  rating      smallint not null check (rating between 1 and 5),
  title       text default '',
  comment     text not null,
  photos      jsonb not null default '[]'::jsonb,
  verified    boolean not null default false,
  helpful     int not null default 0,
  approved    boolean not null default false,
  reply       text default '',
  reply_at    timestamptz,
  order_code  text default '',
  created_at  timestamptz not null default now()
);
create index if not exists idx_reviews_product  on public.reviews(product_id) where approved;
create index if not exists idx_reviews_customer on public.reviews(customer_id);
-- uma avaliação por cliente por produto
create unique index if not exists uq_review_customer_product on public.reviews(customer_id, coalesce(product_id, 0)) where customer_id is not null;

create table if not exists public.questions (
  id          bigint generated always as identity primary key,
  product_id  bigint not null references public.products(id) on delete cascade,
  customer_id bigint references public.customers(id) on delete set null,
  name        text not null,
  question    text not null,
  answer      text default '',
  answered_by text default '',
  answered_at timestamptz,
  public      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_questions_product on public.questions(product_id);

-- ---------------------------------------------------------------------
-- E-MAILS (caixa de saída)
-- ---------------------------------------------------------------------
create table if not exists public.emails (
  id         bigint generated always as identity primary key,
  to_addr    text not null,
  subject    text not null,
  html       text,
  kind       text,
  status     text not null check (status in ('enviado','simulado','erro')),
  error      text default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_emails_created on public.emails(created_at desc);

-- ---------------------------------------------------------------------
-- EQUIPE: recuperação de senha · COMISSÕES (só o Dono) · GARANTIA · WHATSAPP · CUPOM PESSOAL
-- ---------------------------------------------------------------------
alter table public.coupons add column if not exists customer_id bigint references public.customers(id) on delete cascade;
alter table public.users drop constraint if exists users_customer_fk;
alter table public.users add constraint users_customer_fk foreign key (customer_id) references public.customers(id) on delete set null;
create table if not exists public.staff_tokens ( token_hash text primary key, user_id bigint not null references public.users(id) on delete cascade, expires bigint not null );
create table if not exists public.commission_config ( id int primary key check (id = 1), data jsonb not null default '{}'::jsonb, updated_at timestamptz, updated_by text default '' );
create table if not exists public.commission_payouts (
  month text not null check (month ~ '^\d{4}-\d{2}$'), user_id bigint not null references public.users(id),
  amount numeric(12,2) not null, base numeric(12,2) not null, orders int not null,
  paid_at timestamptz not null default now(), paid_by text default '', note text default '', primary key (month, user_id) );
create table if not exists public.warranties (
  id bigint generated always as identity primary key, order_id bigint not null references public.orders(id) on delete cascade, order_code text not null,
  item_index int not null, product_id bigint references public.products(id) on delete set null, product_name text not null, condition text default 'Novo',
  serial text not null, serial_type text not null default 'imei' check (serial_type in ('imei','serie')), customer_name text default '',
  sold_at date not null, months int not null check (months between 0 and 60), expires_at date not null,
  created_by text default '', created_at timestamptz not null default now() );
create index if not exists idx_warranties_serial on public.warranties(serial);
create index if not exists idx_warranties_order on public.warranties(order_id);
create table if not exists public.wa_messages (
  id bigint generated always as identity primary key, order_code text, phone text, kind text, provider text, status text,
  error text default '', body text default '', created_at timestamptz not null default now() );
create index if not exists idx_orders_reserve on public.orders(reserve_until) where reserve_until is not null;

-- TROCA GARANTIDA · PRÉ-VENDA
create table if not exists public.trade_plans (
  id bigint generated always as identity primary key, code text unique not null, order_id bigint not null references public.orders(id) on delete cascade, order_code text not null,
  item_index int not null, product_id bigint references public.products(id) on delete set null, product_name text not null,
  customer_id bigint references public.customers(id) on delete set null, customer_name text default '', phone text default '', email text default '',
  paid_value numeric(12,2) not null, pct_a numeric(5,2) not null, pct_b numeric(5,2) not null, pct_c numeric(5,2) not null,
  starts_at date not null, opens_at date not null, expires_at date not null,
  status text not null default 'ativo' check (status in ('ativo','resgatado','expirado','cancelado')),
  redeemed_at timestamptz, redeemed_grade text default '' check (redeemed_grade in ('','A','B','C')), redeemed_value numeric(12,2) default 0,
  coupon_code text default '', redeemed_by text default '', notified_open boolean not null default false, notified_expiring boolean not null default false,
  created_at timestamptz not null default now() );
create index if not exists idx_trade_order on public.trade_plans(order_id);
create index if not exists idx_trade_customer on public.trade_plans(customer_id);
create table if not exists public.preorders (
  id bigint generated always as identity primary key, product_id bigint not null references public.products(id) on delete cascade, options jsonb not null default '{}'::jsonb,
  type text not null check (type in ('aviso','sinal')), name text not null, phone text default '', email citext default '',
  customer_id bigint references public.customers(id) on delete set null, deposit numeric(12,2) not null default 0, order_code text default '',
  status text not null default 'aguardando' check (status in ('aguardando','pago','avisado','convertido','cancelado')),
  paid_at timestamptz, notified_at timestamptz, sale_code text default '', created_at timestamptz not null default now() );
create index if not exists idx_preorders_product on public.preorders(product_id, status);

-- GUIAS · CLUBE ALADDIN · LEMBRETES · NOTIFICAÇÕES (app)
create table if not exists public.posts (
  id bigint generated always as identity primary key, slug text unique not null, title text not null, excerpt text default '', body text default '', cover text default '',
  published boolean not null default true, author text default '', views int not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now() );
drop trigger if exists trg_posts_updated on public.posts;
create trigger trg_posts_updated before update on public.posts for each row execute function public.set_updated_at();
create table if not exists public.cashback (
  id bigint generated always as identity primary key, customer_id bigint not null references public.customers(id) on delete cascade,
  order_id bigint references public.orders(id) on delete set null, order_code text default '',
  type text not null check (type in ('credito','uso','estorno','expirado','ajuste')), amount numeric(12,2) not null, note text default '',
  expires_at date, created_at timestamptz not null default now() );
create index if not exists idx_cashback_customer on public.cashback(customer_id);
create table if not exists public.reminders_sent ( key text primary key, customer_id bigint, kind text, sent_at timestamptz not null default now() );
create table if not exists public.push_subs (
  id bigint generated always as identity primary key, endpoint text unique not null, p256dh text not null, auth text not null,
  customer_id bigint references public.customers(id) on delete cascade, orders jsonb not null default '[]'::jsonb, offers boolean not null default true,
  fails int not null default 0, created_at timestamptz not null default now() );

-- LAUDO TÉCNICO · ASSISTÊNCIA TÉCNICA · FINANCEIRO · ESTOQUE POR IMEI · CANAIS
create table if not exists public.inspections (
  id bigint generated always as identity primary key, token text unique not null, product_id bigint references public.products(id) on delete set null,
  model text not null, serial text default '', results jsonb not null default '{}'::jsonb, battery_health int default 0, cycles int default 0,
  grade text default '' check (grade in ('','A','B','C')), notes text default '', technician text default '', created_at timestamptz not null default now() );
create table if not exists public.service_orders (
  id bigint generated always as identity primary key, code text unique not null, token text unique not null, customer_id bigint references public.customers(id) on delete set null,
  name text not null, phone text default '', email citext default '', device text not null, serial text default '', problem text not null, accessories text default '', condition_notes text default '',
  budget numeric(12,2) not null default 0, budget_notes text default '', budget_status text default '' check (budget_status in ('','aguardando','aprovado','recusado')),
  status text not null default 'recebido' check (status in ('recebido','em_analise','orcamento','em_reparo','pronto','entregue','cancelado')),
  history jsonb not null default '[]'::jsonb, technician text default '', warranty_days int not null default 90, eta text default '', created_by text default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), delivered_at timestamptz );
create index if not exists idx_service_status on public.service_orders(status);
create table if not exists public.order_costs ( order_id bigint not null references public.orders(id) on delete cascade, product_id bigint, qty int not null, unit_cost numeric(12,2) not null, primary key (order_id, product_id) );
create table if not exists public.stock_units (
  id bigint generated always as identity primary key, product_id bigint not null references public.products(id), serial text not null, cost numeric(12,2) not null default 0,
  supplier text default '', origin text not null default 'compra' check (origin in ('compra','troca','consignado','outro')), notes text default '',
  status text not null default 'disponivel' check (status in ('disponivel','reservado','vendido','baixa')), order_code text default '',
  entry_date timestamptz not null default now(), sold_at timestamptz, created_by text default '' );
create index if not exists idx_units_product on public.stock_units(product_id, status);
create unique index if not exists uq_units_serial_ativo on public.stock_units(serial) where status <> 'baixa';
create table if not exists public.channel_orders ( channel text not null, ext_id text not null, order_code text default '', status text default '', created_at timestamptz not null default now(), primary key (channel, ext_id) );
create table if not exists public.channel_log ( id bigint generated always as identity primary key, channel text, action text, detail text, ok boolean, created_at timestamptz not null default now() );

-- ---------------------------------------------------------------------
-- RLS: bloqueia acesso pela API pública do Supabase (anon/authenticated)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['settings','users','sessions','audit_log','categories','products','coupons','customers',
    'customer_sessions','customer_tokens','customer_addresses','wishlist','price_alerts','orders','carts','reviews','questions','emails',
    'staff_tokens','commission_config','commission_payouts','warranties','wa_messages','trade_plans','preorders','posts','cashback','reminders_sent','push_subs',
    'inspections','service_orders','order_costs','stock_units','channel_orders','channel_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- DADOS INICIAIS
-- ---------------------------------------------------------------------
insert into public.categories (name, slug, icon, sort) values
  ('iPhone','iphone','iphone',0), ('MacBook','macbook','macbook',1), ('iPad','ipad','ipad',2),
  ('Apple Watch','apple-watch','watch',3), ('AirPods & iPod','airpods','airpods',4), ('JBL','jbl','jbl',5),
  ('PlayStation','playstation','playstation',6), ('Bicicletas elétricas','bicicletas-eletricas','bike',7),
  ('Acessórios','acessorios','acessorios',8)
on conflict (slug) do nothing;

insert into public.coupons (code, type, value, min_order, description) values
  ('BEMVINDO','percent',5,500,'5% na primeira compra'),
  ('FRETEGRATIS','freeship',0,1000,'Frete grátis acima de R$ 1.000')
on conflict (code) do nothing;

insert into public.settings (key, value) values
  ('store_name','"Aladdin Tech"'), ('tagline','"Referência em Upgrade"'),
  ('always_open','true'), ('hours','[{"days":"Todos os dias","time":"24 horas"}]'),
  ('pix_discount','5'), ('max_installments','12'), ('installments_no_interest','10'), ('pickup_enabled','true'),
  ('delivery_zones','[{"name":"Entrega grátis na região","fee":0,"eta":"Em até 2 dias úteis","scope":"estado","values":""},{"name":"Correios — PAC","fee":39.9,"eta":"5 a 12 dias úteis","scope":"brasil","values":""},{"name":"Correios — SEDEX","fee":69.9,"eta":"2 a 5 dias úteis","scope":"brasil","values":""}]'),
  ('zones_v2','true'), ('reviews_moderation','true'), ('require_email_verification','true')
on conflict (key) do nothing;

-- O usuário dono é criado pelo servidor (senha precisa de scrypt).
-- Limpeza periódica (opcional, com a extensão pg_cron do Supabase):
--   select cron.schedule('limpa-sessoes', '0 * * * *',
--     $$ delete from public.sessions where expires < now(); delete from public.customer_sessions where expires < now();
--        delete from public.customer_tokens where expires < now(); $$);
