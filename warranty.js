// Garantia por IMEI / número de série + recibo e termo de garantia (página pronta para imprimir ou salvar em PDF)
'use strict';
const crypto = require('crypto');

module.exports = function createWarranty({ db, getSettings, J, str, round2 }) {
  db.exec(`CREATE TABLE IF NOT EXISTS warranties (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, order_code TEXT NOT NULL, item_index INTEGER NOT NULL,
    product_id INTEGER, product_name TEXT NOT NULL, condition TEXT DEFAULT 'Novo', serial TEXT NOT NULL, serial_type TEXT NOT NULL DEFAULT 'imei',
    customer_name TEXT DEFAULT '', sold_at TEXT NOT NULL, months INTEGER NOT NULL, expires_at TEXT NOT NULL,
    created_by TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime')) );
    CREATE INDEX IF NOT EXISTS idx_warranties_serial ON warranties(serial);
    CREATE INDEX IF NOT EXISTS idx_warranties_order ON warranties(order_id);`);

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (n) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const normSerial = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const luhn = (d) => { let sum = 0; for (let i = 0; i < d.length; i++) { let n = +d[d.length - 1 - i]; if (i % 2) { n *= 2; if (n > 9) n -= 9; } sum += n; } return sum % 10 === 0; };
  const isImei = (s) => /^\d{15}$/.test(s) && luhn(s);
  // IMEI (15 dígitos, com dígito verificador) ou número de série (8 a 20 letras/números)
  function checkSerial(raw) {
    const s = normSerial(raw);
    if (!s) return { error: 'vazio' };
    if (/^\d+$/.test(s)) return isImei(s) ? { serial: s, type: 'imei' } : { error: `IMEI inválido: ${raw} (precisa ter 15 dígitos válidos)` };
    if (s.length < 8 || s.length > 20) return { error: `Número de série inválido: ${raw}` };
    return { serial: s, type: 'serie' };
  }
  const monthsFor = (p, cond) => {
    const s = getSettings();
    if (p && p.warranty_months > 0) return p.warranty_months;
    return /novo/i.test(cond || 'Novo') && !/semi/i.test(cond || '') ? (+s.warranty_new_months || 12) : (+s.warranty_used_months || 3);
  };
  const addMonths = (d, m) => { const x = new Date(d.getTime()); const day = x.getDate(); x.setMonth(x.getMonth() + m); if (x.getDate() < day) x.setDate(0); return x; };
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const br = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };

  function ensureDocToken(orderId) {
    const o = db.prepare('SELECT doc_token FROM orders WHERE id=?').get(orderId);
    if (o && o.doc_token) return o.doc_token;
    const t = crypto.randomBytes(18).toString('base64url');
    db.prepare('UPDATE orders SET doc_token=? WHERE id=?').run(t, orderId);
    return t;
  }

  // registra (substitui) as garantias de um pedido. list = [{ index, serials: [] }]
  function register(order, list, by) {
    const items = J(order.items, []), errors = [], rows = [];
    for (const it of Array.isArray(list) ? list : []) {
      const idx = parseInt(it.index), item = items[idx];
      if (!item) continue;
      const serials = (Array.isArray(it.serials) ? it.serials : String(it.serials || '').split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean);
      if (serials.length > item.qty) { errors.push(`${item.name}: ${serials.length} números para ${item.qty} unidade(s).`); continue; }
      const p = db.prepare('SELECT * FROM products WHERE id=?').get(item.id);
      for (const raw of serials) {
        const c = checkSerial(raw);
        if (c.error) { if (c.error !== 'vazio') errors.push(c.error); continue; }
        rows.push({ idx, item, p, ...c });
      }
    }
    const dup = rows.map((r) => r.serial).filter((s, i, a) => a.indexOf(s) !== i);
    if (dup.length) errors.push('Número repetido no mesmo pedido: ' + [...new Set(dup)].join(', '));
    if (errors.length) throw new Error(errors.join(' '));
    const sold = new Date(String(order.created_at).replace(' ', 'T'));
    const cust = J(order.customer, {});
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM warranties WHERE order_id=?').run(order.id);
      for (const r of rows) {
        const cond = (r.p && r.p.condition) || 'Novo', months = monthsFor(r.p, cond);
        db.prepare(`INSERT INTO warranties(order_id,order_code,item_index,product_id,product_name,condition,serial,serial_type,customer_name,sold_at,months,expires_at,created_by)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(order.id, order.code, r.idx, r.item.id, r.item.name, cond, r.serial, r.type, str(cust.name, 80),
          ymd(sold), months, ymd(addMonths(sold, months)), by || '');
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    if (rows.length) ensureDocToken(order.id);
    return list_(order.id);
  }
  const list_ = (orderId) => db.prepare('SELECT * FROM warranties WHERE order_id=? ORDER BY item_index, id').all(orderId);

  const maskName = (n) => String(n || '').trim().split(/\s+/).filter(Boolean).map((w, i) => i === 0 ? w : w[0] + '.').join(' ');
  function lookup(raw) {
    const s = normSerial(raw);
    if (s.length < 8) return null;
    const w = db.prepare(`SELECT w.*, o.status FROM warranties w JOIN orders o ON o.id=w.order_id WHERE w.serial=? ORDER BY w.sold_at DESC, w.id DESC LIMIT 1`).get(s);
    if (!w || w.status === 'cancelado') return null;
    const today = ymd(new Date()), days = Math.ceil((new Date(w.expires_at + 'T23:59:59') - new Date()) / 864e5);
    return { product: w.product_name, condition: w.condition, serial_type: w.serial_type, serial_end: w.serial.slice(-4), customer: maskName(w.customer_name),
      sold_at: br(w.sold_at), expires_at: br(w.expires_at), months: w.months, active: w.expires_at >= today, days_left: Math.max(0, days) };
  }

  const DEFAULT_TERMS = [
    'A garantia cobre defeitos de fabricação e de funcionamento do aparelho identificado neste termo pelo IMEI ou número de série, pelo prazo indicado, contado da data da compra.',
    'Não estão cobertos: quedas, batidas, trincas ou riscos; contato com líquidos ou umidade; mau uso; uso de carregadores e acessórios não certificados; aparelho aberto, reparado ou alterado por terceiros; desgaste natural da bateria e de peças estéticas.',
    'Para acionar a garantia, apresente este termo (impresso ou no celular) e o aparelho na loja. A análise técnica é feita em até 30 dias, conforme o Código de Defesa do Consumidor.',
    'Aparelhos novos lacrados também têm a garantia do fabricante, acionada diretamente na assistência autorizada.',
    'Este termo não exclui os direitos previstos no Código de Defesa do Consumidor (Lei 8.078/90). Compras feitas pelo site podem ser devolvidas em até 7 dias após o recebimento.'
  ].join('\n');

  // página do recibo + termo de garantia (sem scripts inline: CSP)
  function renderDoc(token, base) {
    const o = token && db.prepare('SELECT * FROM orders WHERE doc_token=?').get(String(token).slice(0, 40));
    if (!o || o.status === 'cancelado') return null;
    const s = getSettings(), c = J(o.customer, {}), items = J(o.items, []), ws = list_(o.id), d = J(o.delivery, {});
    const cpf = String(c.cpf || '').replace(/\D/g, '');
    const cpfM = cpf.length === 11 ? `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**` : '';
    const pay = { pix: 'Pix', card: /débito/.test(o.notes || '') ? 'Cartão de débito' : `Cartão de crédito${o.installments > 1 ? ` em ${o.installments}x` : ''}`, cash: o.channel === 'loja' ? 'Dinheiro' : 'Na entrega/retirada' }[o.payment] || o.payment;
    const date = new Date(String(o.created_at).replace(' ', 'T'));
    const store = esc(s.store_name || 'Aladdin Tech');
    const terms = String(s.warranty_terms || DEFAULT_TERMS).split(/\n+/).filter(Boolean);
    const url = `${base}/documento/${o.doc_token}`;
    const waText = `Olá${c.name ? ', ' + c.name.split(' ')[0] : ''}! Aqui estão o recibo e o termo de garantia da sua compra na ${s.store_name || 'Aladdin Tech'}: ${url}`;
    const phone = String(c.phone || '').replace(/\D/g, '');
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Recibo ${esc(o.code)} — ${store}</title><link rel="stylesheet" href="/css/doc.css"></head><body>
<div class="bar no-print"><button id="printBtn">Imprimir / Salvar em PDF</button>${phone.length >= 10 ? `<a href="https://wa.me/${phone.length <= 11 ? '55' + phone : phone}?text=${encodeURIComponent(waText)}" target="_blank" rel="noopener">Enviar no WhatsApp do cliente</a>` : ''}<a href="https://wa.me/?text=${encodeURIComponent(waText)}" target="_blank" rel="noopener">Compartilhar no WhatsApp</a></div>
<main class="doc">
  <header><div class="brand"><img src="/img/logo-original.jpg" alt=""><div><b>${store}</b><span>${esc(s.tagline || '')}</span></div></div>
    <div class="who">${s.legal_name ? esc(s.legal_name) + '<br>' : ''}${s.cnpj ? 'CNPJ ' + esc(s.cnpj) + '<br>' : ''}${esc(s.address || '')}${s.city ? ' · ' + esc(s.city) : ''}<br>${s.phone_display ? 'WhatsApp ' + esc(s.phone_display) : ''}${s.instagram ? ' · @' + esc(s.instagram) : ''}</div></header>
  <h1>Recibo de venda <span>nº ${esc(o.code)}</span></h1>
  <div class="meta"><div><small>Data</small>${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
    <div><small>Cliente</small>${esc(c.name || 'Consumidor')}${cpfM ? ' · CPF ' + cpfM : ''}</div>
    <div><small>Pagamento</small>${esc(pay)}</div><div><small>${o.channel === 'loja' ? 'Venda' : 'Entrega'}</small>${o.channel === 'loja' ? 'Na loja' : esc(d.label || (o.delivery_method === 'pickup' ? 'Retirada na loja' : 'Entrega'))}</div></div>
  <table><thead><tr><th>Produto</th><th>Qtd</th><th>Unitário</th><th>Total</th></tr></thead><tbody>
    ${items.map((i, k) => `<tr><td>${esc(i.name)}${Object.keys(i.options || {}).length ? `<small>${esc(Object.entries(i.options).map(([a, b]) => a + ': ' + b).join(' · '))}</small>` : ''}${ws.filter((w) => w.item_index === k).map((w) => `<small class="sn">${w.serial_type === 'imei' ? 'IMEI' : 'Nº de série'} ${esc(w.serial)}</small>`).join('')}</td><td>${i.qty}</td><td>${brl(i.price)}</td><td>${brl(i.price * i.qty)}</td></tr>`).join('')}
  </tbody></table>
  <div class="totals"><div><span>Subtotal</span><span>${brl(o.subtotal)}</span></div>
    ${o.discount ? `<div><span>Desconto${o.coupon ? ' (cupom ' + esc(o.coupon) + ')' : ''}</span><span>− ${brl(o.discount)}</span></div>` : ''}
    ${o.pix_discount ? `<div><span>Desconto Pix</span><span>− ${brl(o.pix_discount)}</span></div>` : ''}
    ${o.shipping ? `<div><span>Frete</span><span>${brl(o.shipping)}</span></div>` : ''}
    <div class="grand"><span>Total pago</span><span>${brl(o.total)}</span></div></div>
  ${o.nfe_status === 'autorizado' && o.nfe_number ? `<p class="note">Nota fiscal eletrônica nº ${esc(o.nfe_number)}${o.nfe_danfe ? ` — <a href="${esc(o.nfe_danfe)}">ver DANFE</a>` : ''}</p>` : `<p class="note">Este recibo não substitui a nota fiscal.</p>`}
  ${ws.length ? `<section class="terms"><h2>Termo de garantia</h2>
    <table class="wt"><thead><tr><th>Aparelho</th><th>IMEI / série</th><th>Prazo</th><th>Válida até</th></tr></thead><tbody>
      ${ws.map((w) => `<tr><td>${esc(w.product_name)}<small>${esc(w.condition)}</small></td><td class="mono">${esc(w.serial)}</td><td>${w.months} ${w.months === 1 ? 'mês' : 'meses'}</td><td><b>${br(w.expires_at)}</b></td></tr>`).join('')}
    </tbody></table>
    <ol>${terms.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
    <p class="check">Consulte a garantia a qualquer momento em <b>${esc(base.replace(/^https?:\/\//, ''))}/garantia</b> digitando o IMEI ou o número de série.</p>
    <div class="sign"><div><i></i>${esc(c.name || 'Cliente')}</div><div><i></i>${store}</div></div></section>` : ''}
  <footer>${store} · documento gerado em ${new Date().toLocaleDateString('pt-BR')} · código de verificação ${esc(o.doc_token.slice(0, 8).toUpperCase())}</footer>
</main><script src="/js/doc.js"></script></body></html>`;
  }

  return { checkSerial, register, list: list_, lookup, renderDoc, ensureDocToken, DEFAULT_TERMS, monthsFor };
};
