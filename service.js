// Confiança e marca: laudo técnico do seminovo (30 itens) e assistência técnica com acompanhamento online
'use strict';
const crypto = require('crypto');

module.exports = function createService({ db, getSettings, J, str, round2, mailer, wa }) {
  db.exec(`CREATE TABLE IF NOT EXISTS inspections (
      id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT UNIQUE NOT NULL, product_id INTEGER, model TEXT NOT NULL, serial TEXT DEFAULT '',
      results TEXT NOT NULL DEFAULT '{}', battery_health INTEGER DEFAULT 0, cycles INTEGER DEFAULT 0, grade TEXT DEFAULT '', notes TEXT DEFAULT '',
      technician TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime')) );
    CREATE INDEX IF NOT EXISTS idx_inspections_product ON inspections(product_id);
    CREATE TABLE IF NOT EXISTS service_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, token TEXT UNIQUE NOT NULL, customer_id INTEGER, name TEXT NOT NULL, phone TEXT DEFAULT '', email TEXT DEFAULT '',
      device TEXT NOT NULL, serial TEXT DEFAULT '', problem TEXT NOT NULL, accessories TEXT DEFAULT '', condition_notes TEXT DEFAULT '',
      budget REAL DEFAULT 0, budget_notes TEXT DEFAULT '', budget_status TEXT DEFAULT '' CHECK (budget_status IN ('','aguardando','aprovado','recusado')),
      status TEXT NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido','em_analise','orcamento','em_reparo','pronto','entregue','cancelado')),
      history TEXT NOT NULL DEFAULT '[]', technician TEXT DEFAULT '', warranty_days INTEGER DEFAULT 90, eta TEXT DEFAULT '',
      created_by TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')), delivered_at TEXT DEFAULT '' );
    CREATE INDEX IF NOT EXISTS idx_service_status ON service_orders(status);`);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (n) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tok = () => crypto.randomBytes(16).toString('base64url');
  const dt = (s) => { const d = new Date(String(s).replace(' ', 'T')); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };

  /* ================= laudo técnico ================= */
  const CHECKLIST = [
    ['Tela e toque', [['tela', 'Tela sem manchas, pixels mortos ou queimados'], ['toque', 'Toque responde em todas as áreas'], ['truetone', 'True Tone e brilho automático'], ['biometria', 'Face ID / Touch ID funcionando'], ['vidro', 'Vidro da tela sem trincas']]],
    ['Câmeras', [['cam_principal', 'Câmera traseira principal (foto e vídeo)'], ['cam_ultra', 'Ultra-angular / teleobjetiva'], ['cam_frontal', 'Câmera frontal'], ['foco', 'Foco automático e estabilização'], ['flash', 'Flash e lanterna'], ['lente', 'Lentes sem riscos ou poeira interna']]],
    ['Áudio e chamadas', [['som_sup', 'Alto-falante superior (chamada)'], ['som_inf', 'Alto-falante inferior (música)'], ['microfone', 'Microfones (chamada, vídeo e Siri)'], ['chamada', 'Ligação de teste com áudio dos dois lados']]],
    ['Conectividade', [['chip', 'Chip / eSIM e sinal 4G/5G'], ['wifi', 'Wi-Fi'], ['bluetooth', 'Bluetooth'], ['nfc', 'NFC / Apple Pay'], ['gps', 'GPS e localização']]],
    ['Sensores e botões', [['proximidade', 'Sensor de proximidade'], ['giro', 'Acelerômetro, giroscópio e bússola'], ['vibracao', 'Vibração (Taptic Engine)'], ['botoes', 'Botões de volume e lateral'], ['acao', 'Botão de Ação / chave de silencioso']]],
    ['Energia', [['conector', 'Conector de carregamento'], ['magsafe', 'Carregamento sem fio / MagSafe'], ['bateria', 'Saúde da bateria conferida em Ajustes']]],
    ['Segurança e procedência', [['icloud', 'Conta iCloud e “Buscar” desativados'], ['imei', 'IMEI sem restrição (roubo, furto ou bloqueio)'], ['pecas', 'Histórico de peças: sem peças desconhecidas']]]
  ];
  const ITEMS = CHECKLIST.flatMap(([, it]) => it.map(([k]) => k));
  function saveInspection(b, technician) {
    const res = {}; for (const k of ITEMS) { const v = (b.results || {})[k]; res[k] = ['ok', 'falha', 'na'].includes(v) ? v : 'na'; }
    if (!Object.values(res).some((v) => v !== 'na')) throw new Error('Preencha o checklist.');
    const model = str(b.model, 80); if (model.length < 3) throw new Error('Informe o modelo do aparelho.');
    const pid = parseInt(b.product_id) || null, t = tok();
    db.prepare('INSERT INTO inspections(token,product_id,model,serial,results,battery_health,cycles,grade,notes,technician) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(t, pid, model, str(b.serial, 20).toUpperCase().replace(/[^A-Z0-9]/g, ''), JSON.stringify(res), Math.min(100, Math.max(0, parseInt(b.battery_health) || 0)),
        Math.max(0, parseInt(b.cycles) || 0), ['A', 'B', 'C'].includes(b.grade) ? b.grade : '', str(b.notes, 600), technician || '');
    return { token: t };
  }
  const latestForProduct = (pid) => db.prepare('SELECT token, created_at FROM inspections WHERE product_id=? ORDER BY id DESC LIMIT 1').get(pid);
  function renderInspection(token, base) {
    const r = token && db.prepare('SELECT * FROM inspections WHERE token=?').get(String(token).slice(0, 40)); if (!r) return null;
    const s = getSettings(), res = J(r.results, {}), store = esc(s.store_name || 'Aladdin Tech');
    const okN = Object.values(res).filter((v) => v === 'ok').length, failN = Object.values(res).filter((v) => v === 'falha').length, tested = okN + failN;
    const mark = (v) => v === 'ok' ? '<span class="ck ok">✓ Aprovado</span>' : v === 'falha' ? '<span class="ck no">✕ Atenção</span>' : '<span class="ck na">— Não se aplica</span>';
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Laudo técnico — ${esc(r.model)} — ${store}</title><link rel="stylesheet" href="/css/doc.css"></head><body>
<div class="bar no-print"><button id="printBtn">Imprimir / Salvar em PDF</button><a href="https://wa.me/?text=${encodeURIComponent(`Laudo técnico do ${r.model} — ${s.store_name || 'Aladdin Tech'}: ${base}/laudo/${r.token}`)}" target="_blank" rel="noopener">Compartilhar no WhatsApp</a></div>
<main class="doc">
  <header><div class="brand"><img src="/img/logo-original.jpg" alt=""><div><b>${store}</b><span>${esc(s.tagline || '')}</span></div></div>
    <div class="who">${s.cnpj ? 'CNPJ ' + esc(s.cnpj) + '<br>' : ''}${esc(s.address || '')}${s.city ? ' · ' + esc(s.city) : ''}</div></header>
  <h1>Laudo técnico <span>· ${esc(r.model)}</span></h1>
  <div class="meta"><div><small>Data da inspeção</small>${dt(r.created_at)}</div><div><small>${/^\d{15}$/.test(r.serial) ? 'IMEI' : 'Nº de série'}</small>${r.serial ? '•••••' + esc(r.serial.slice(-5)) : '—'}</div>
    <div><small>Saúde da bateria</small>${r.battery_health ? r.battery_health + '%' : '—'}${r.cycles ? ` · ${r.cycles} ciclos` : ''}</div><div><small>Estado</small>${r.grade ? 'Estado ' + r.grade : '—'}</div></div>
  <div class="score"><b>${okN} de ${tested}</b> itens testados aprovados${failN ? ` · <span class="no">${failN} com observação</span>` : ''}</div>
  ${CHECKLIST.map(([g, it]) => `<h2 class="grp">${esc(g)}</h2><table class="ckl"><tbody>${it.map(([k, l]) => `<tr><td>${esc(l)}</td><td>${mark(res[k])}</td></tr>`).join('')}</tbody></table>`).join('')}
  ${r.notes ? `<p class="note"><b>Observações:</b> ${esc(r.notes)}</p>` : ''}
  <div class="sign"><div><i></i>${esc(r.technician || 'Técnico responsável')}<br>Técnico responsável</div><div><i></i>${store}</div></div>
  <footer>Laudo emitido por ${store} · código ${esc(r.token.slice(0, 8).toUpperCase())} · confira a autenticidade em ${esc(base.replace(/^https?:\/\//, ''))}/laudo/${esc(r.token)}</footer>
</main><script src="/js/doc.js"></script></body></html>`;
  }

  /* ================= assistência técnica ================= */
  const ST = { recebido: 'Aparelho recebido', em_analise: 'Em análise técnica', orcamento: 'Orçamento enviado', em_reparo: 'Em reparo', pronto: 'Pronto para retirada', entregue: 'Entregue', cancelado: 'Cancelado' };
  const decorate = (o) => o && { ...o, history: J(o.history, []), status_label: ST[o.status] };
  function createOS(b, by) {
    const name = str(b.name, 80), device = str(b.device, 80), problem = str(b.problem, 800);
    if (name.length < 3 || device.length < 3 || problem.length < 5) throw new Error('Preencha cliente, aparelho e defeito relatado.');
    let code; do { code = 'OS' + String(Math.floor(Math.random() * 900000) + 100000); } while (db.prepare('SELECT id FROM service_orders WHERE code=?').get(code));
    const t = tok(), hist = [{ status: 'recebido', at: new Date().toISOString(), note: 'Aparelho recebido na loja', by }];
    const phone = String(b.phone || '').replace(/\D/g, '');
    const cu = phone.length >= 10 ? db.prepare('SELECT id, phone FROM customers').all().find((x) => String(x.phone || '').replace(/\D/g, '').slice(-9) === phone.slice(-9)) : null;
    db.prepare(`INSERT INTO service_orders(code,token,customer_id,name,phone,email,device,serial,problem,accessories,condition_notes,eta,history,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(code, t, cu ? cu.id : null, name, phone, str(b.email, 120), device, str(b.serial, 20).toUpperCase(), problem, str(b.accessories, 200), str(b.condition_notes, 400), str(b.eta, 60), JSON.stringify(hist), by || '');
    return decorate(db.prepare('SELECT * FROM service_orders WHERE code=?').get(code));
  }
  function updateOS(id, b, by) {
    const o = db.prepare('SELECT * FROM service_orders WHERE id=?').get(id); if (!o) throw new Error('OS não encontrada.');
    const hist = J(o.history, []), status = ST[b.status] ? b.status : o.status;
    const budget = 'budget' in b ? Math.max(0, round2(b.budget) || 0) : o.budget;
    let bstatus = o.budget_status;
    if (status === 'orcamento' && o.status !== 'orcamento') { if (!(budget > 0)) throw new Error('Informe o valor do orçamento.'); bstatus = 'aguardando'; }
    if (status !== o.status || str(b.note, 300)) hist.push({ status, at: new Date().toISOString(), note: str(b.note, 300), by });
    db.prepare(`UPDATE service_orders SET status=?, budget=?, budget_notes=?, budget_status=?, technician=?, eta=?, warranty_days=?, history=?, updated_at=datetime('now','localtime'), delivered_at=CASE WHEN ?='entregue' THEN datetime('now','localtime') ELSE delivered_at END WHERE id=?`)
      .run(status, budget, 'budget_notes' in b ? str(b.budget_notes, 600) : o.budget_notes, bstatus, 'technician' in b ? str(b.technician, 60) : o.technician, 'eta' in b ? str(b.eta, 60) : o.eta,
        'warranty_days' in b ? Math.max(0, parseInt(b.warranty_days) || 0) : o.warranty_days, JSON.stringify(hist), status, id);
    return { before: o, after: decorate(db.prepare('SELECT * FROM service_orders WHERE id=?').get(id)) };
  }
  // cliente aprova ou recusa o orçamento pelo link
  function answerBudget(token, approve) {
    const o = db.prepare('SELECT * FROM service_orders WHERE token=?').get(String(token).slice(0, 40));
    if (!o || o.status !== 'orcamento' || o.budget_status !== 'aguardando') throw new Error('Este orçamento não está aguardando resposta.');
    const hist = J(o.history, []); hist.push({ status: approve ? 'em_reparo' : 'orcamento', at: new Date().toISOString(), note: approve ? 'Orçamento aprovado pelo cliente pelo site' : 'Orçamento recusado pelo cliente pelo site', by: 'cliente' });
    db.prepare("UPDATE service_orders SET budget_status=?, status=?, history=?, updated_at=datetime('now','localtime') WHERE id=?").run(approve ? 'aprovado' : 'recusado', approve ? 'em_reparo' : 'orcamento', JSON.stringify(hist), o.id);
    return decorate(db.prepare('SELECT * FROM service_orders WHERE id=?').get(o.id));
  }
  const publicView = (o) => o && { code: o.code, device: o.device, status: o.status, status_label: ST[o.status], problem: o.problem, budget: o.budget_status ? o.budget : 0, budget_notes: o.budget_status ? o.budget_notes : '',
    budget_status: o.budget_status, eta: o.eta, warranty_days: o.warranty_days, created_at: o.created_at, delivered_at: o.delivered_at, name: o.name.split(' ')[0],
    history: J(o.history, []).map((h) => ({ status: h.status, label: ST[h.status], at: h.at, note: h.by === 'cliente' || /recebido/i.test(h.note) ? h.note : (h.note || '') })) };
  const byToken = (t) => publicView(db.prepare('SELECT * FROM service_orders WHERE token=?').get(String(t).slice(0, 40)));
  function lookup(code, phoneEnd) {
    const o = db.prepare('SELECT * FROM service_orders WHERE code=?').get(String(code || '').toUpperCase().replace(/\s/g, ''));
    if (!o || String(phoneEnd || '').replace(/\D/g, '').slice(-4) !== o.phone.slice(-4) || String(phoneEnd || '').replace(/\D/g, '').length < 4) return null;
    return { token: o.token };
  }
  async function notify(o, base) {
    const link = `${base}/assistencia/${o.token}`, first = o.name.split(' ')[0], store = getSettings().store_name || 'Aladdin Tech';
    const T = { em_analise: `seu ${o.device} está em análise técnica.`, orcamento: `o orçamento do seu ${o.device} ficou em ${brl(o.budget)}. Aprove ou recuse pelo link`, em_reparo: `o reparo do seu ${o.device} começou.`,
      pronto: `seu ${o.device} está pronto para retirada! 🎉`, entregue: `seu ${o.device} foi entregue. Garantia do serviço: ${o.warranty_days} dias.`, cancelado: `o serviço do seu ${o.device} foi cancelado.` };
    const msg = T[o.status]; if (!msg) return;
    const text = `Olá, ${first}! Assistência ${store} — OS ${o.code}: ${msg} Acompanhe: ${link}`;
    if (o.email) mailer.send(o.email, `OS ${o.code}: ${ST[o.status]} — ${store}`, mailer.layout({ preheader: ST[o.status], title: ST[o.status], intro: mailer.esc(text.replace(` Acompanhe: ${link}`, '')), button: { label: o.status === 'orcamento' ? 'Ver e aprovar o orçamento' : 'Acompanhar o serviço', url: link } }), 'assistencia').catch(() => {});
    if (o.phone && wa && wa.waReady()) await wa.waSend(o.phone, text, { kind: 'assistencia', order_code: o.code }).catch(() => {});
    return text;
  }
  function renderReceipt(token, base) {
    const o = db.prepare('SELECT * FROM service_orders WHERE token=?').get(String(token || '').slice(0, 40)); if (!o) return null;
    const s = getSettings(), store = esc(s.store_name || 'Aladdin Tech');
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>OS ${esc(o.code)} — ${store}</title><link rel="stylesheet" href="/css/doc.css"></head><body>
<div class="bar no-print"><button id="printBtn">Imprimir / Salvar em PDF</button>${o.phone ? `<a href="https://wa.me/${o.phone.length <= 11 ? '55' + o.phone : o.phone}?text=${encodeURIComponent(`Olá, ${o.name.split(' ')[0]}! Comprovante da sua ordem de serviço ${o.code} na ${s.store_name || 'Aladdin Tech'}. Acompanhe o conserto por aqui: ${base}/assistencia/${o.token}`)}" target="_blank" rel="noopener">Enviar no WhatsApp do cliente</a>` : ''}</div>
<main class="doc">
  <header><div class="brand"><img src="/img/logo-original.jpg" alt=""><div><b>${store}</b><span>Assistência técnica</span></div></div>
    <div class="who">${s.cnpj ? 'CNPJ ' + esc(s.cnpj) + '<br>' : ''}${esc(s.address || '')}${s.city ? ' · ' + esc(s.city) : ''}<br>${s.phone_display ? 'WhatsApp ' + esc(s.phone_display) : ''}</div></header>
  <h1>Ordem de serviço <span>nº ${esc(o.code)}</span></h1>
  <div class="meta"><div><small>Entrada</small>${dt(o.created_at)}</div><div><small>Cliente</small>${esc(o.name)}</div><div><small>Aparelho</small>${esc(o.device)}</div><div><small>IMEI / série</small>${esc(o.serial || '—')}</div></div>
  <table><tbody><tr><td><b>Defeito relatado</b><small>${esc(o.problem)}</small></td></tr>${o.accessories ? `<tr><td><b>Acessórios deixados</b><small>${esc(o.accessories)}</small></td></tr>` : ''}
    ${o.condition_notes ? `<tr><td><b>Estado na entrada</b><small>${esc(o.condition_notes)}</small></td></tr>` : ''}${o.eta ? `<tr><td><b>Previsão</b><small>${esc(o.eta)}</small></td></tr>` : ''}</tbody></table>
  <section class="terms"><h2>Condições</h2><ol>
    <li>Acompanhe cada etapa em <b>${esc(base.replace(/^https?:\/\//, ''))}/assistencia</b> com o número da OS e os 4 últimos dígitos do seu WhatsApp. O orçamento é enviado antes de qualquer reparo e só é feito com a sua aprovação.</li>
    <li>Faça backup dos seus dados antes de deixar o aparelho. A loja não acessa nem guarda a sua senha.</li>
    <li>O serviço realizado tem garantia de ${o.warranty_days} dias, conforme o Código de Defesa do Consumidor. Aparelhos não retirados em 90 dias após o aviso de “pronto” seguem a legislação aplicável.</li>
    <li>Apresente este comprovante (impresso ou no celular) para retirar o aparelho.</li></ol>
    <div class="sign"><div><i></i>${esc(o.name)}</div><div><i></i>${store}</div></div></section>
  <footer>${store} · OS ${esc(o.code)} · ${dt(o.created_at)}</footer>
</main><script src="/js/doc.js"></script></body></html>`;
  }
  return { CHECKLIST, saveInspection, latestForProduct, renderInspection, createOS, updateOS, answerBudget, byToken, lookup, notify, renderReceipt, decorate, ST };
};
