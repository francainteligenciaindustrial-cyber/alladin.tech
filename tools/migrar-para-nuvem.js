/* Leva os dados da loja do computador para a nuvem (Turso + Vercel Blob).
 *
 * Uso (PowerShell), com as chaves que a Vercel mostra em Storage:
 *   $env:TURSO_DATABASE_URL="libsql://...turso.io"; $env:TURSO_AUTH_TOKEN="..."; $env:BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
 *   node tools/migrar-para-nuvem.js
 *
 * O que faz:
 *   1) envia as fotos de public/uploads para o Vercel Blob;
 *   2) cria as tabelas no Turso e copia todos os dados de data/loja.db,
 *      trocando os endereços das fotos pelos do Blob.
 * Segurança: só roda num banco da nuvem VAZIO (sem produtos). Use --substituir para apagar e copiar de novo.
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { createClient } = require('@libsql/client');

const ROOT = path.join(__dirname, '..');
// lê as chaves baixadas com "vercel env pull" (.env.local), sem mostrar nada na tela
for (const envFile of ['.env.local', '.env']) {
  const p = path.join(ROOT, envFile); if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line); if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
}
const SRC = process.env.SOURCE_DB || path.join(ROOT, 'data', 'loja.db');
const UPLOADS = path.join(ROOT, 'public', 'uploads');
const OFFSET = process.env.STORE_UTC_OFFSET || '-4 hours';
const REPLACE = process.argv.includes('--substituir');

async function putFile(rel, buf, type) {
  if (process.env.BLOB_MOCK_DIR) { const f = path.join(process.env.BLOB_MOCK_DIR, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); return 'https://teste.public.blob.vercel-storage.com/' + rel; }
  const { put } = require('@vercel/blob');
  const cred = process.env.BLOB_READ_WRITE_TOKEN ? { token: process.env.BLOB_READ_WRITE_TOKEN } : {}; // sem chave antiga, o SDK usa a chave temporária (OIDC) do .env.local
  return (await put(rel, buf, { access: 'public', contentType: type, addRandomSuffix: false, allowOverwrite: true, ...cred })).url;
}

(async () => {
  if (!process.env.TURSO_DATABASE_URL) throw new Error('Defina TURSO_DATABASE_URL e TURSO_AUTH_TOKEN (Vercel → Storage → Turso → .env).');
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID && !process.env.BLOB_MOCK_DIR) throw new Error('Conecte o Blob ao projeto na Vercel e rode "vercel env pull".');
  if (!fs.existsSync(SRC)) throw new Error('Banco local não encontrado: ' + SRC);

  const src = new DatabaseSync(SRC, { readOnly: true });
  const dst = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN || undefined, intMode: 'number' });

  const has = await dst.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='products'");
  if (has.rows.length) {
    const n = (await dst.execute('SELECT COUNT(*) n FROM products')).rows[0].n;
    if (n && !REPLACE) throw new Error(`O banco da nuvem já tem ${n} produtos. Para apagar e copiar de novo, rode com --substituir.`);
  }

  // 1) fotos → Blob
  const map = new Map();
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
  const fixUrls = (v) => typeof v === 'string' && v.includes('/uploads/') ? v.replace(/\/uploads\/[\w\-./]+/g, (u) => map.get(u) || u) : v;

  // 2) estrutura + dados
  const objs = src.prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type='table' DESC, name").all();
  const tables = objs.filter((o) => o.type === 'table').map((o) => o.name);
  if (REPLACE) for (const t of tables) await dst.execute(`DROP TABLE IF EXISTS "${t}"`);
  for (const o of objs) {
    const sql = o.sql.replace(/'localtime'/g, `'${OFFSET}'`).replace(/^CREATE (TABLE|INDEX|UNIQUE INDEX)\s+(?!IF NOT EXISTS)/i, 'CREATE $1 IF NOT EXISTS ');
    await dst.execute(sql);
  }
  for (const t of tables) {
    const rows = src.prepare(`SELECT * FROM "${t}"`).all();
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    const ins = `INSERT INTO "${t}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
    for (let i = 0; i < rows.length; i += 200) {
      await dst.batch(rows.slice(i, i + 200).map((r) => ({ sql: ins, args: cols.map((c) => { const v = fixUrls(r[c]); return typeof v === 'bigint' ? Number(v) : v; }) })), 'write');
    }
    console.log(`${t}: ${rows.length}`);
  }
  // sequências de numeração (para os próximos pedidos/produtos continuarem do mesmo ponto)
  try { for (const s of src.prepare('SELECT name, seq FROM sqlite_sequence').all()) {
    await dst.execute({ sql: 'DELETE FROM sqlite_sequence WHERE name=?', args: [s.name] });
    await dst.execute({ sql: 'INSERT INTO sqlite_sequence(name, seq) VALUES(?, ?)', args: [s.name, s.seq] });
  } } catch (e) { console.log('aviso (sequências):', e.message); }

  const check = (await dst.execute('SELECT (SELECT COUNT(*) FROM products) p, (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM settings) s')).rows[0];
  console.log(`\nPronto. Na nuvem: ${check.p} produtos, ${check.u} usuários da equipe, ${check.s} configurações.`);
})().catch((e) => { console.error('\nERRO:', e.message); process.exit(1); });
