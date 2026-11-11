/* Worker da ponte do banco (ver db.js): executa as consultas no banco da nuvem
 * (Supabase/Postgres ou Turso) e os envios de fotos ao Vercel Blob */
const { workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { sab, port, url, token, pgUrl, offset, blobToken, blobMockDir } = workerData;
const flag = new Int32Array(sab);

/* ---------- Supabase (Postgres) ---------- */
let pg = null, pgReady = null, identity = null;
const compat = require('./pg-compat');
function pgConnect() {
  if (pgReady) return pgReady;
  const { Client, types } = require('pg');
  types.setTypeParser(20, (v) => Number(v));            // bigint (COUNT, ids) → número
  types.setTypeParser(1700, (v) => parseFloat(v));      // numeric (SUM, AVG) → número
  types.setTypeParser(16, (v) => (v === 't' ? 1 : 0));  // verdadeiro/falso → 1/0, como no SQLite
  const u = new URL(pgUrl);
  const local = /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
  for (const k of ['sslmode', 'supa', 'pgbouncer', 'sslrootcert']) u.searchParams.delete(k);
  const c = new Client({ connectionString: u.toString(), ssl: local ? false : { rejectUnauthorized: false }, statement_timeout: 20000 });
  c.on('error', () => { if (pg === c) { pg = null; pgReady = null; } });
  pgReady = (async () => {
    await c.connect();
    await c.query("SET TIME ZONE 'UTC'");
    const has = await c.query("SELECT to_regproc('sqlite_compat_v1') IS NOT NULL ok");
    if (!has.rows[0].ok) await c.query(compat.SQLITE_FUNCS(offset));
    pg = c;
    return c;
  })().catch((e) => { pgReady = null; throw e; });
  return pgReady;
}
async function loadIdentity(c) {
  const r = await c.query("SELECT table_name FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'id' AND is_identity = 'YES'");
  identity = new Set(r.rows.map((x) => x.table_name));
}
let inTx = false;
async function pgHandle(m) {
  let c;
  try { c = await pgConnect(); }
  catch (e) { throw new Error('Não foi possível conectar ao banco de dados: ' + e.message); }
  if (m.op === 'exec') {
    const s = m.sql.trim();
    if (/^BEGIN\b/i.test(s)) { if (inTx) await c.query('ROLLBACK').catch(() => {}); await c.query('BEGIN'); inTx = true; return null; }
    if (/^COMMIT\b/i.test(s)) { inTx = false; await c.query('COMMIT'); return null; }
    if (/^ROLLBACK\b/i.test(s)) { inTx = false; await c.query('ROLLBACK').catch(() => {}); return null; }
    const stmts = compat.translateScript(m.sql);
    if (!stmts.length) return null;
    await c.query(stmts.map((x) => x.sql).join(';\n'));
    if (stmts.some((x) => /^(CREATE|ALTER)\s+TABLE/i.test(x.sql))) identity = null;
    return null;
  }
  const t = compat.translate(m.sql);
  if (!t.sql) return m.op === 'all' ? [] : m.op === 'get' ? undefined : { changes: 0, lastInsertRowid: 0 };
  let sql = t.sql;
  if (m.op === 'run' && t.insert && !/\bRETURNING\b/i.test(sql)) {
    if (!identity) await loadIdentity(c);
    if (identity.has(t.insert)) sql += ' RETURNING id';
  }
  let rs;
  try { rs = await c.query(sql, m.args || []); }
  catch (e) {
    // texto onde se espera número (ex.: /produto/abc): no SQLite simplesmente não acha nada
    if (e.code === '22P02' && m.op !== 'run' && !inTx) return m.op === 'all' ? [] : undefined;
    if (!e.code && !inTx) { pg = null; pgReady = null; } // conexão caiu: reconecta na próxima
    throw e;
  }
  if (m.op === 'get') return rs.rows[0];
  if (m.op === 'all') return rs.rows;
  const id = rs.rows && rs.rows[0] && rs.rows[0].id;
  return { changes: rs.rowCount || 0, lastInsertRowid: id == null ? 0 : Number(id) };
}

/* ---------- Turso (SQLite hospedado) ---------- */
let client = null;
const getClient = () => {
  if (!client) client = require('@libsql/client').createClient({ url, authToken: token || undefined, intMode: 'number' });
  return client;
};
let tx = null;
const fixTz = (sql) => sql.replace(/'localtime'/g, `'${offset}'`);
const stripPragmas = (sql) => sql.replace(/PRAGMA\s+(journal_mode|synchronous|busy_timeout|temp_store|cache_size|mmap_size)\s*=\s*[^;]+;?/gi, '');
const toRows = (rs) => rs.rows.map((r) => { const o = {}; rs.columns.forEach((c, i) => { o[c] = r[i]; }); return o; });
async function tursoHandle(m) {
  const c = getClient();
  if (m.op === 'exec') {
    const s = m.sql.trim();
    if (/^BEGIN\b/i.test(s)) { if (tx) { try { await tx.rollback(); } catch {} } tx = await c.transaction('write'); return null; }
    if (/^COMMIT\b/i.test(s)) { const t = tx; tx = null; if (t) await t.commit(); return null; }
    if (/^ROLLBACK\b/i.test(s)) { const t = tx; tx = null; if (t) await t.rollback(); return null; }
    const sql = stripPragmas(fixTz(m.sql));
    if (!sql.replace(/--[^\n]*/g, '').trim()) return null;
    await (tx || c).executeMultiple(sql);
    return null;
  }
  const rs = await (tx || c).execute({ sql: fixTz(m.sql), args: m.args || [] });
  if (m.op === 'get') return toRows(rs)[0];
  if (m.op === 'all') return toRows(rs);
  return { changes: rs.rowsAffected, lastInsertRowid: rs.lastInsertRowid == null ? 0 : Number(rs.lastInsertRowid) };
}

async function handle(m) {
  if (m.op === 'blobPut') {
    if (blobMockDir) { // teste local: grava numa pasta e devolve uma URL no formato do Blob
      const f = path.join(blobMockDir, m.pathname); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(m.data));
      return 'https://teste.public.blob.vercel-storage.com/' + m.pathname;
    }
    const { put } = require('@vercel/blob');
    const cred = blobToken ? { token: blobToken } : { oidcToken: m.oidcToken, storeId: m.storeId };
    const r = await put(m.pathname, Buffer.from(m.data), { access: 'public', contentType: m.contentType, addRandomSuffix: false, ...cred });
    return r.url;
  }
  if (m.op === 'blobDel') {
    if (blobMockDir) return null;
    await require('@vercel/blob').del(m.url, blobToken ? { token: blobToken } : { oidcToken: m.oidcToken, storeId: m.storeId });
    return null;
  }
  return pgUrl ? pgHandle(m) : tursoHandle(m);
}

port.on('message', async (m) => {
  let out;
  try { out = { result: await handle(m) }; }
  catch (e) { out = { error: String((e && e.message) || e), code: e && e.code }; }
  port.postMessage(out);
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
});
