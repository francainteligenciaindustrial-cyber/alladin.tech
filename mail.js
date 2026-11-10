/* Aladdin Tech — envio de e-mails (SMTP via nodemailer) + modelos visuais
 * Sem SMTP configurado, os e-mails ficam salvos na "caixa de saída" do painel (status "simulado").
 */
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch { /* opcional */ }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function createMailer({ db, getSettings, secret }) {
  const ready = () => {
    const s = getSettings();
    return !!(nodemailer && s.smtp_host && s.smtp_user && secret('smtp_pass') && s.mail_from);
  };
  let transport = null, transportKey = '';
  function getTransport() {
    const s = getSettings();
    const key = [s.smtp_host, s.smtp_port, s.smtp_secure, s.smtp_user, secret('smtp_pass')].join('|');
    if (!transport || key !== transportKey) {
      transport = nodemailer.createTransport({
        host: s.smtp_host, port: Number(s.smtp_port) || 587, secure: !!s.smtp_secure,
        auth: { user: s.smtp_user, pass: secret('smtp_pass') }, pool: true, maxConnections: 3
      });
      transportKey = key;
    }
    return transport;
  }

  async function send(to, subject, html, kind = 'geral') {
    let status = 'simulado', error = '';
    if (ready()) {
      const s = getSettings();
      try {
        await getTransport().sendMail({
          from: `"${String(s.mail_from_name || s.store_name || 'Aladdin Tech').replace(/"/g, '')}" <${s.mail_from}>`,
          to, subject, html, text: html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        });
        status = 'enviado';
      } catch (e) { status = 'erro'; error = String(e.message || e).slice(0, 300); }
    }
    db.prepare('INSERT INTO emails(to_addr,subject,html,kind,status,error) VALUES(?,?,?,?,?,?)').run(String(to), subject, html, kind, status, error);
    return status;
  }

  /* layout base: tabelas + estilos inline (compatível com Gmail/Outlook) */
  function layout({ preheader = '', title, intro = '', body = '', button, note = '', unsubUrl = '' }) {
    const s = getSettings();
    const store = esc(s.store_name || 'Aladdin Tech');
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#0b0b0c;font-family:Helvetica,Arial,sans-serif;color:#e9e9ec">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0c"><tr><td align="center" style="padding:32px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#141416;border:1px solid #2a2a2e;border-radius:18px;overflow:hidden">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #232327;text-align:center">
  <div style="font-size:22px;letter-spacing:.5px;color:#ffffff"><b>Aladdin</b> Tech</div>
  <div style="font-size:9px;letter-spacing:4px;text-transform:uppercase;color:#d6b26e;margin-top:6px">${esc(s.tagline || 'Referência em Upgrade')}</div>
</td></tr>
<tr><td style="padding:32px">
  <h1 style="margin:0 0 14px;font-size:24px;font-weight:300;color:#ffffff;line-height:1.25">${title}</h1>
  ${intro ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#b9b9c0">${intro}</p>` : ''}
  ${body}
  ${button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px"><tr><td style="border-radius:999px;background:#d6b26e;background-image:linear-gradient(135deg,#f6e2ac,#d6b26e 45%,#a07733)">
    <a href="${esc(button.url)}" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:bold;color:#1a1408;text-decoration:none;border-radius:999px">${esc(button.label)}</a></td></tr></table>
    <p style="margin:10px 0 0;font-size:11.5px;color:#77777e;line-height:1.5">Se o botão não funcionar, copie e cole no navegador:<br><span style="color:#d6b26e;word-break:break-all">${esc(button.url)}</span></p>` : ''}
  ${note ? `<p style="margin:22px 0 0;font-size:12.5px;color:#8a8a92;line-height:1.6">${note}</p>` : ''}
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #232327;font-size:11.5px;color:#6e6e76;line-height:1.6;text-align:center">
  ${store} · ${esc(s.address || '')} · ${esc(s.city || '')}<br>
  ${s.phone_display ? 'WhatsApp ' + esc(s.phone_display) + ' · ' : ''}${s.instagram ? '@' + esc(s.instagram) : ''}
  ${unsubUrl ? `<br><br><a href="${esc(unsubUrl)}" style="color:#8a8a92">Não quero mais receber ofertas por e-mail</a>` : ''}
</td></tr></table>
</td></tr></table></body></html>`;
  }

  const itemsTable = (items) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #2a2a2e;margin:6px 0 4px">
    ${items.map((i) => `<tr><td style="padding:10px 0;border-bottom:1px solid #2a2a2e;font-size:14px;color:#e9e9ec">${i.qty}x ${esc(i.name)}${i.options && Object.keys(i.options).length ? `<br><span style="font-size:12px;color:#77777e">${esc(Object.entries(i.options).map(([k, v]) => k + ': ' + v).join(' · '))}</span>` : ''}</td>
      <td align="right" style="padding:10px 0;border-bottom:1px solid #2a2a2e;font-size:14px;color:#e9e9ec;white-space:nowrap">${brl(i.price * i.qty)}</td></tr>`).join('')}</table>`;

  const productGrid = (products, base) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${products.map((p) => `
    <tr><td style="padding:10px 0;border-bottom:1px solid #2a2a2e">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${p.image ? `<td width="76" valign="top"><img src="${esc(base + p.image)}" width="64" height="64" alt="" style="display:block;border-radius:10px;background:#1c1c1f;object-fit:contain"></td>` : ''}
        <td valign="top" style="font-size:14px;color:#ffffff">${esc(p.name)}<br>
          ${p.old_price > p.price ? `<span style="font-size:12px;color:#77777e;text-decoration:line-through">${brl(p.old_price)}</span> ` : ''}<b style="color:#f3dca4">${brl(p.price)}</b></td>
        <td align="right" valign="middle"><a href="${esc(base + '/produto/' + p.slug)}" style="font-size:12.5px;color:#d6b26e;text-decoration:none">Ver oferta →</a></td>
      </tr></table></td></tr>`).join('')}</table>`;

  return { send, ready, layout, itemsTable, productGrid, esc, brl };
}

module.exports = { createMailer };
