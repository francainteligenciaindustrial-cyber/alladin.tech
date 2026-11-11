/* Leva os dados da loja do computador para a nuvem (Supabase + Vercel Blob).
 *
 * Uso: na pasta do projeto, baixe as chaves da Vercel e rode:
 *   npx vercel env pull .env.local --environment=production
 *   node tools/migrar-para-nuvem.js
 *
 * O que faz:
 *   1) envia as fotos de public/uploads para o Vercel Blob;
 *   2) cria as tabelas no Supabase e copia todos os dados de data/loja.db,
 *      trocando os endereços das fotos pelos do Blob.
 * Segurança: só roda num banco da nuvem VAZIO (sem produtos). Use --substituir para apagar e copiar de novo.
 * (Também funciona com Turso, se TURSO_DATABASE_URL estiver definido em vez do Supabase.)
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
// lê as chaves baixadas com "vercel env pull" (.env.local), sem mostrar nada na tela
for (const envFile of ['.env.local', '.env']) {
  const p = path.join(ROOT, envFile); if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line); if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
}
const PG_URL = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const SRC = process.env.SOURCE_DB || path.join(ROOT, 'data', 'loja.db');
const UPLOADS = path.join(ROOT, 'public', 'uploads');
const OFFSET = process.env.STORE_UTC_OFFSET || '-4 hours';
const REPLACE = process.argv.includes('--substituir');
const NO_FILES = process.argv.includes('--sem-fotos');

async function putFile(rel, buf, type) {
  if (process.env.BLOB_MOCK_DIR) { const f = path.join(process.env.BLOB_MOCK_DIR, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); return 'https://teste.public.blob.vercel-storage.com/' + rel; }
  const { put } = require('@vercel/blob');
  const cred = process.env.BLOB_READ_WRITE_TOKEN ? { token: process.env.BLOB_READ_WRITE_TOKEN } : {}; // sem chave antiga, o SDK usa a chave temporária (OIDC) do .env.local
  return (await put(rel, buf, { access: 'public', contentType: type, addRandomSuffix: false, allowOverwrite: true, ...cred })).url;
}

// destino: Supabase (Postgres) ou Turso — mesma interface
async function openTarget() {
  if (PG_URL) {
    const { Client } = require('pg');
    const compat = require('../pg-compat');
    const u = new URL(PG_URL);
    const local = /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
    for (const k of ['sslmode', 'supa', 'pgbouncer', 'sslrootcert']) u.searchParams.delete(k);
    const c = new Client({ connectionString: u.toString(), ssl: local ? false : { rejectUnauthorized: false } });
    await c.connect();
    await c.query("SET TIME ZONE 'UTC'");
    await c.query(compat.SQLITE_FUNCS(OFFSET));
    return {
      kind: 'Supabase',
      run: async (sql, args = []) => (await c.query(sql, args)).rows,
      ddl: async (sql) => { for (const s of compat.translateScript(sql)) await c.query(s.sql.replace(/^CREATE (TABLE|INDEX|UNIQUE INDEX)\s+(?!IF NOT EXISTS)/i, 'CREATE $1 IF NOT EXISTS ')); },
      drop: (t) => c.query(`DROP TABLE IF EXISTS "${t}" CASCADE`),
      insertMany: async (t, cols, rows) => {
        await c.query('BEGIN');
        try {
          for (const r of rows) await c.query(`INSERT INTO "${t}" (${cols.map((x) => `"${x}"`).join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')})`, r);
          await c.query('COMMIT');
        } catch (e) { await c.query('ROLLBACK'); throw new Error(`tabela ${t}: ${e.message}`); }
      },
      // as próximas numerações (pedidos, produtos…) continuam de onde pararam
      sequences: async (tables) => {
        for (const t of tables) {
          const has = await c.query("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = 'id' AND is_identity = 'YES'", [t]);
          if (has.rows.length) await c.query(`SELECT setval(pg_get_serial_sequence('"${t}"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "${t}"), 1), (SELECT COUNT(*) > 0 FROM "${t}"))`);
        }
      },
      close: () => c.end()
    };
  }
  if (!process.env.TURSO_DATABASE_URL) throw new Error('Conecte o Supabase ao projeto na Vercel (Storage) e rode "vercel env pull .env.local".');
  const dst = require('@libsql/client').createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN || undefined, intMode: 'number' });
  return {
    kind: 'Turso',
    run: async (sql, args = []) => (await dst.execute({ sql, args })).rows,
    ddl: (sql) => dst.execute(sql.replace(/'localtime'/g, `'${OFFSET}'`).replace(/^CREATE (TABLE|INDEX|UNIQUE INDEX)\s+(?!IF NOT EXISTS)/i, 'CREATE $1 IF NOT EXISTS ')),
    drop: (t) => dst.execute(`DROP TABLE IF EXISTS "${t}"`),
    insertMany: (t, cols, rows) => dst.batch(rows.map((r) => ({ sql: `INSERT INTO "${t}" (${cols.map((x) => `"${x}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`, args: r })), 'write'),
    sequences: async (tables, src) => {
      try { for (const s of src.prepare('SELECT name, seq FROM sqlite_sequence').all()) {
        await dst.execute({ sql: 'DELETE FROM sqlite_sequence WHERE name=?', args: [s.name] });
        await dst.execute({ sql: 'INSERT INTO sqlite_sequence(name, seq) VALUES(?, ?)', args: [s.name, s.seq] });
      } } catch (e) { console.log('aviso (sequências):', e.message); }
    },
    close: () => {}
  };
}

(async () => {
  if (!NO_FILES && !process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID && !process.env.BLOB_MOCK_DIR) throw new Error('Conecte o Blob ao projeto na Vercel e rode "vercel env pull".');
  if (!fs.existsSync(SRC)) throw new Error('Banco local não encontrado: ' + SRC);

  const src = new DatabaseSync(SRC, { readOnly: true });
  const dst = await openTarget();
  console.log('destino:', dst.kind);

  const tablesNow = await dst.run(PG_URL
    ? "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'products'"
    : "SELECT name FROM sqlite_master WHERE type='table' AND name='products'");
  if (tablesNow.length) {
    const n = Number((await dst.run('SELECT COUNT(*) AS n FROM products'))[0].n);
    if (n && !REPLACE) throw new Error(`O banco da nuvem já tem ${n} produtos. Para apagar e copiar de novo, rode com --substituir.`);
  }

  // 1) fotos → Blob
  const map = new Map();
  if (!NO_FILES) {
    const files = [];
    const walk = (dir) => { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); e.isDirectory() ? walk(f) : files.push(f); } };
    walk(UPLOADS);
    for (const f of files) {
      if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
      const rel = 'uploads/' + path.relative(UPLOADS, f).split(path.sep).join('/');
      const ext = path.extname(f).slice(1).toLowerCase();
      const url = await putFile(rel, fs.readFileSync(f), ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/' + ext);
      map.set('/' + rel, url);
      process.stdout.write('.');
    }
    console.log(`\nfotos enviadas: ${map.size}`);
  }
  const fixUrls = (v) => typeof v === 'string' && v.includes('/uploads/') ? v.replace(/\/uploads\/[\w\-./]+/g, (u) => map.get(u) || u) : v;

  // 2) estrutura + dados
  const objs = src.prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type='table' DESC, name").all();
  const tables = objs.filter((o) => o.type === 'table').map((o) => o.name);
  if (REPLACE) for (const t of tables) await dst.drop(t);
  for (const o of objs) await dst.ddl(o.sql);
  for (const t of tables) {
    const rows = src.prepare(`SELECT * FROM "${t}"`).all();
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    for (let i = 0; i < rows.length; i += 200) {
      await dst.insertMany(t, cols, rows.slice(i, i + 200).map((r) => cols.map((c) => { const v = fixUrls(r[c]); return typeof v === 'bigint' ? Number(v) : v; })));
    }
    console.log(`${t}: ${rows.length}`);
  }
  await dst.sequences(tables, src);

  const check = (await dst.run('SELECT (SELECT COUNT(*) FROM products) AS p, (SELECT COUNT(*) FROM users) AS u, (SELECT COUNT(*) FROM settings) AS s'))[0];
  console.log(`\nPronto. Na nuvem (${dst.kind}): ${check.p} produtos, ${check.u} usuários da equipe, ${check.s} configurações.`);
  await dst.close();
})().catch((e) => { console.error('\nERRO:', e.message); process.exit(1); });
