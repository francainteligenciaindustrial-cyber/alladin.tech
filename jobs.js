/* Tarefas automáticas (lembretes, reservas, sincronização de estoque, notas fiscais…)
 *
 * Servidor próprio: rodam com setInterval, como sempre.
 * Vercel: não existe processo ligado o tempo todo. As tarefas rodam
 *   1) a cada acesso ao site, em segundo plano, quando já passou o intervalo delas;
 *   2) pelo agendamento da Vercel (Cron) em /api/cron, para não dependerem de visitas.
 */
const SERVERLESS = !!process.env.VERCEL;
const registry = [];

function every(name, ms, fn, { firstDelay } = {}) {
  if (!SERVERLESS) {
    setInterval(() => run(fn, name), ms).unref();
    if (firstDelay != null) setTimeout(() => run(fn, name), firstDelay).unref();
    return;
  }
  registry.push({ name, ms, fn, last: 0, busy: false });
}

async function run(fn, name) {
  try { await fn(); } catch (e) { console.error('tarefa ' + name + ':', e && e.message); }
}

// roda as tarefas vencidas (todas, se force) e devolve quais rodaram
async function runDue(force) {
  const now = Date.now(), ran = [];
  for (const j of registry) {
    if (j.busy || (!force && now - j.last < j.ms)) continue;
    j.busy = true; j.last = now; ran.push(j.name);
    try { await run(j.fn, j.name); } finally { j.busy = false; }
  }
  return ran;
}

let lastCheck = 0;
// middleware: no máximo a cada 30 s, dispara em segundo plano o que estiver vencido
function trigger(req, res, next) {
  if (SERVERLESS && Date.now() - lastCheck > 30000) {
    lastCheck = Date.now();
    const p = runDue(false);
    try { require('@vercel/functions').waitUntil(p); } catch { p.catch(() => {}); }
  }
  next();
}

module.exports = { every, runDue, trigger, SERVERLESS, registry };
