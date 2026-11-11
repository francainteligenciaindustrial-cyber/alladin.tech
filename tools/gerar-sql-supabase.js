/* Gera UM arquivo SQL com a loja inteira (tabelas + dados) para colar no Supabase.
 *
 * Uso:  node tools/gerar-sql-supabase.js
 * Saída: data/supabase-instalar.sql  (fica fora do GitHub: contém os dados da loja)
 *
 * No Supabase: SQL Editor → New query → cole o conteúdo do arquivo → Run.
 * Pode rodar de novo sem problema: as tabelas são recriadas do zero com os dados atuais.
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const compat = require('../pg-compat');

const ROOT = path.join(__dirname, '..');
const SRC = process.env.SOURCE_DB || path.join(ROOT, 'data', 'loja.db');
const OUT = process.argv[2] || path.join(ROOT, 'data', 'supabase-instalar.sql');
const OFFSET = process.env.STORE_UTC_OFFSET || '-4 hours';
// sessões e códigos temporários não vão para a nuvem (todos entram de novo)
const SKIP_DATA = new Set(['sessions', 'customer_sessions', 'staff_tokens', 'customer_tokens']);

const src = new DatabaseSync(SRC, { readOnly: true });
const lit = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (v instanceof Uint8Array) return `'\\x${Buffer.from(v).toString('hex')}'::bytea`;
  return "'" + String(v).replace(/'/g, "''") + "'";
};

const objs = src.prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type='table' DESC, name").all();
const tables = objs.filter((o) => o.type === 'table').map((o) => o.name);
const out = [];
out.push('-- Aladdin Tech — instalação completa no Supabase (gerado em ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ')');
out.push('-- Cole tudo no SQL Editor do Supabase e clique em Run.\n');
out.push('BEGIN;');
out.push(compat.SQLITE_FUNCS(OFFSET).trim());
for (const t of tables) out.push(`DROP TABLE IF EXISTS "${t}" CASCADE;`);
for (const o of objs) for (const s of compat.translateScript(o.sql)) out.push(s.sql + ';');
// segurança: ninguém acessa as tabelas pela API pública do Supabase; só o servidor da loja
for (const t of tables) out.push(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;`);
let total = 0;
for (const t of tables) {
  if (SKIP_DATA.has(t)) continue;
  let rows = src.prepare(`SELECT * FROM "${t}"`).all();
  if (t === 'users') rows = rows.filter((u) => u.username !== 'dono'); // conta usada só nos testes deste computador
  if (!rows.length) continue;
  const cols = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += 100) {
    out.push(`INSERT INTO "${t}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES\n` +
      rows.slice(i, i + 100).map((r) => '(' + cols.map((c) => lit(r[c])).join(',') + ')').join(',\n') + ';');
  }
  total += rows.length;
}
// as próximas numerações (pedidos, produtos…) continuam de onde pararam
out.push(`DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT table_name FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'id' AND is_identity = 'YES' LOOP
    EXECUTE format('SELECT setval(pg_get_serial_sequence(%L, ''id''), GREATEST((SELECT COALESCE(MAX(id), 0) FROM %I), 1), (SELECT COUNT(*) > 0 FROM %I))', r.table_name, r.table_name, r.table_name);
  END LOOP;
END $$;`);
out.push('COMMIT;');
out.push("SELECT 'Pronto! ' || (SELECT COUNT(*) FROM products) || ' produtos e ' || (SELECT COUNT(*) FROM users) || ' usuários da equipe.' AS resultado;");
fs.writeFileSync(OUT, out.join('\n\n') + '\n');
console.log(`Arquivo gerado: ${OUT}\n${tables.length} tabelas, ${total} registros, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
