/* Aladdin Tech — acesso ao banco de dados
 *
 * Local (computador / servidor próprio): SQLite do Node, arquivo em ./data/loja.db
 * Nuvem (Vercel): Supabase (Postgres) — ativado por POSTGRES_URL; o SQL é traduzido em pg-compat.js
 *                (ou Turso, o SQLite hospedado — TURSO_DATABASE_URL)
 *
 * O sistema inteiro usa a interface síncrona db.prepare(sql).get/all/run e db.exec(sql).
 * Na nuvem, uma "ponte" mantém essa mesma interface: um worker conversa com o banco
 * (que é assíncrono) e a linha principal espera a resposta (Atomics.wait).
 * Assim as ~520 consultas do sistema funcionam sem reescrita.
 *
 * Fotos: na nuvem vão para o Vercel Blob (variável BLOB_READ_WRITE_TOKEN).
 */
const path = require('path');

// Supabase: a integração da Vercel cria POSTGRES_URL (conexão pelo pooler). Também aceita DATABASE_URL / SUPABASE_DB_URL.
const PG_URL = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const REMOTE_DB = !!(PG_URL || process.env.TURSO_DATABASE_URL);
const REMOTE_FILES = !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID || process.env.BLOB_MOCK_DIR);
const SERVERLESS = !!process.env.VERCEL;

let bridgeCall = null;
function bridge() {
  if (bridgeCall) return bridgeCall;
  const { Worker, MessageChannel, receiveMessageOnPort } = require('worker_threads');
  const sab = new SharedArrayBuffer(4), flag = new Int32Array(sab);
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(require.resolve('./db-worker.js'), {
    workerData: {
      sab, port: port2,
      url: process.env.TURSO_DATABASE_URL || '', token: process.env.TURSO_AUTH_TOKEN || '', pgUrl: PG_URL,
      offset: process.env.STORE_UTC_OFFSET || '-4 hours',            // Mato Grosso (Cuiabá): UTC−4, sem horário de verão
      blobToken: process.env.BLOB_READ_WRITE_TOKEN || '', blobMockDir: process.env.BLOB_MOCK_DIR || ''
    },
    transferList: [port2]
  });
  worker.unref();
  const TIMEOUT = 25000;
  bridgeCall = (msg) => {
    Atomics.store(flag, 0, 0);
    port1.postMessage(msg);
    if (Atomics.wait(flag, 0, 0, TIMEOUT) === 'timed-out') throw new Error('O banco de dados não respondeu a tempo. Tente novamente.');
    const m = receiveMessageOnPort(port1);
    if (!m) throw new Error('Resposta vazia do banco de dados.');
    if (m.message.error) { const e = new Error(m.message.error); e.code = m.message.code; throw e; }
    return m.message.result;
  };
  return bridgeCall;
}

// valores aceitos pelo Turso: undefined → null, true/false → 1/0
const norm = (args) => args.map((v) => v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

function remoteDb() {
  const call = bridge();
  return {
    remote: true,
    prepare(sql) {
      return {
        get: (...a) => call({ op: 'get', sql, args: norm(a) }),
        all: (...a) => call({ op: 'all', sql, args: norm(a) }),
        run: (...a) => call({ op: 'run', sql, args: norm(a) })
      };
    },
    exec(sql) { call({ op: 'exec', sql }); }
  };
}

function openDb(localFile) {
  if (REMOTE_DB) return remoteDb();
  const { DatabaseSync } = require('node:sqlite');
  return new DatabaseSync(localFile);
}

// arquivos na nuvem (Vercel Blob). Modo novo: chave temporária (OIDC) que a Vercel envia em cada acesso
// (cabeçalho x-vercel-oidc-token) — o servidor guarda a mais recente e entrega a cada envio.
let oidc = '';
const setOidc = (t) => { if (t) oidc = t; };
const auth = () => ({ oidcToken: oidc || process.env.VERCEL_OIDC_TOKEN || '', storeId: process.env.BLOB_STORE_ID || '' });
const blobPut = (pathname, buf, contentType) => bridge()({ op: 'blobPut', pathname, data: new Uint8Array(buf), contentType, ...auth() });
const blobDel = (url) => { try { bridge()({ op: 'blobDel', url, ...auth() }); } catch (e) { console.error('blob del', e.message); } };
const BLOB_URL_RE = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/uploads\/[\w\-./]+$/i;

module.exports = { openDb, PG_URL, REMOTE_DB, REMOTE_FILES, SERVERLESS, blobPut, blobDel, setOidc, BLOB_URL_RE, bridge };
