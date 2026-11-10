/* Worker da ponte do banco (ver db.js): executa as consultas no Turso e os envios ao Vercel Blob */
const { workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { sab, port, url, token, offset, blobToken, blobMockDir } = workerData;
const flag = new Int32Array(sab);

let client = null;
const getClient = () => {
  if (!client) client = require('@libsql/client').createClient({ url, authToken: token || undefined, intMode: 'number' });
  return client;
};
let tx = null; // transação aberta (BEGIN … COMMIT)

// o servidor do Turso roda em UTC: 'localtime' vira o fuso da loja
const fixTz = (sql) => sql.replace(/'localtime'/g, `'${offset}'`);
// ajustes de desempenho locais do SQLite não se aplicam ao banco hospedado
const stripPragmas = (sql) => sql.replace(/PRAGMA\s+(journal_mode|synchronous|busy_timeout|temp_store|cache_size|mmap_size)\s*=\s*[^;]+;?/gi, '');
const toRows = (rs) => rs.rows.map((r) => { const o = {}; rs.columns.forEach((c, i) => { o[c] = r[i]; }); return o; });

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

port.on('message', async (m) => {
  let out;
  try { out = { result: await handle(m) }; }
  catch (e) { out = { error: String((e && e.message) || e), code: e && e.code }; }
  port.postMessage(out);
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
});
