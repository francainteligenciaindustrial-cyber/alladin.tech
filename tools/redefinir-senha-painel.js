// Emergência: o Dono esqueceu a senha e não tem e-mail cadastrado.
// Rode no computador/servidor onde a loja está instalada:
//   node tools/redefinir-senha-painel.js <usuario>
// Loja na nuvem (Supabase): baixe as chaves com "npx vercel env pull .env.local" e acrescente --nuvem
// Gera uma senha provisória (a pessoa cria a própria no primeiro acesso) e encerra as sessões abertas.
const path = require('path'), crypto = require('crypto');
const fs = require('fs');
const args = process.argv.slice(2);
const user = String(args.find((a) => !a.startsWith('--')) || '').toLowerCase();
if (args.includes('--nuvem')) {
  const f = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(f)) for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  delete process.env.VERCEL;
  if (!require('../db').REMOTE_DB) { console.log('Chaves do banco da nuvem não encontradas. Rode: npx vercel env pull .env.local --environment=production'); process.exit(1); }
}
const db = require('../db').openDb(path.join(__dirname, '..', 'data', 'loja.db'));
if (!user) { console.log('Uso: node tools/redefinir-senha-painel.js <usuario>\nUsuários:', db.prepare('SELECT username, role FROM users').all().map((u) => `${u.username} (${u.role})`).join(', ')); process.exit(1); }
const u = db.prepare('SELECT * FROM users WHERE lower(username)=?').get(user);
if (!u) { console.log('Usuário não encontrado:', user); process.exit(1); }
const pw = 'Aladdin-' + crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6) + Math.floor(Math.random() * 90 + 10);
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
db.prepare('UPDATE users SET password=?, must_change=1, active=1 WHERE id=?').run(salt + ':' + hash, u.id);
db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
db.prepare("INSERT INTO audit_log(user_name,action,detail,ip) VALUES(?,?,?,'servidor')").run(`${u.name} (@${u.username})`, 'senha_redefinida', 'pelo comando de emergência no servidor');
console.log(`\nSenha provisória de ${u.username}: ${pw}\nEntre em /admin com ela — o painel vai pedir para criar uma senha nova.\n`);
