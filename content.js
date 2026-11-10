// Trazer clientes de graça: catálogo para Google Shopping / Instagram-Facebook Shop, guias (blog), avaliações do Google
'use strict';

module.exports = function createContent({ db, getSettings, J, str, effectivePrice, secret }) {
  db.exec(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, excerpt TEXT DEFAULT '', body TEXT DEFAULT '', cover TEXT DEFAULT '',
    published INTEGER DEFAULT 1, author TEXT DEFAULT '', views INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')) );`);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const abs = (base, u) => !u ? '' : /^https?:/.test(u) ? u : base + (u.startsWith('/') ? '' : '/') + u;
  const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  /* ===== catálogo (feed) — formato RSS 2.0 com namespace g: (Google Merchant e Meta Commerce aceitam) ===== */
  function feed(base) {
    const s = getSettings(), store = s.store_name || 'Aladdin Tech';
    const rows = db.prepare(`SELECT p.*, c.name category_name, c.icon category_icon FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.active=1 AND p.price>0 ORDER BY p.id`).all();
    const GCAT = { iphone: 267, ipad: 4745, mac: 328, watch: 201, airpods: 505771, jbl: 249, playstation: 1270, bike: 1026, acessorios: 2353 };
    const items = rows.map((p) => {
      const imgs = J(p.images, []); if (!imgs.length) return '';
      const price = effectivePrice(p), promo = price < p.price;
      const cond = /semi|usad/i.test(p.condition || '') ? 'used' : /vitrine|recond/i.test(p.condition || '') ? 'refurbished' : 'new';
      const avail = p.coming_soon ? 'preorder' : p.stock > 0 ? 'in_stock' : 'out_of_stock';
      const n = Number(s.installments_no_interest) || Number(s.max_installments) || 1;
      return `<item>
  <g:id>${p.id}</g:id><g:title>${esc(clip(p.name + (cond !== 'new' ? ' — ' + p.condition : ''), 150))}</g:title>
  <g:description>${esc(clip(p.description || p.short || p.name, 4900))}</g:description>
  <g:link>${esc(base + '/produto/' + encodeURIComponent(p.slug))}</g:link>
  <g:image_link>${esc(abs(base, imgs[0]))}</g:image_link>${imgs.slice(1, 10).map((u) => `\n  <g:additional_image_link>${esc(abs(base, u))}</g:additional_image_link>`).join('')}
  <g:availability>${avail}</g:availability>${p.coming_soon && p.coming_eta ? '' : ''}
  <g:price>${(promo ? p.price : price).toFixed(2)} BRL</g:price>${promo ? `\n  <g:sale_price>${price.toFixed(2)} BRL</g:sale_price>` : ''}
  <g:installment><g:months>${n}</g:months><g:amount>${(price / n).toFixed(2)} BRL</g:amount></g:installment>
  <g:condition>${cond}</g:condition><g:brand>${esc(p.brand || store)}</g:brand>
  ${p.gtin ? `<g:gtin>${esc(p.gtin)}</g:gtin>` : `<g:mpn>${esc(p.sku || 'AT' + p.id)}</g:mpn><g:identifier_exists>no</g:identifier_exists>`}
  <g:google_product_category>${GCAT[p.category_icon] || 222}</g:google_product_category><g:product_type>${esc(p.category_name || 'Eletrônicos')}</g:product_type>
  ${p.weight_kg ? `<g:shipping_weight>${p.weight_kg} kg</g:shipping_weight>` : ''}
</item>`;
    }).filter(Boolean);
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>
<title>${esc(store)}</title><link>${esc(base)}</link><description>${esc(s.tagline || store)}</description>
${items.join('\n')}
</channel></rss>`;
  }

  /* ===== guias (blog) ===== */
  // formatação simples e segura: ## título, ### subtítulo, - lista, 1. lista, **negrito**, [texto](link), > destaque, [produto:slug]
  function render(md, productCard) {
    const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\((\/[^)\s]*|https?:\/\/[^)\s]+)\)/g, (m, a, h) => `<a href="${h}"${h.startsWith('/') ? ' data-link' : ' target="_blank" rel="noopener"'}>${a}</a>`);
    const out = []; let list = null;
    const flush = () => { if (list) { out.push(`<${list.t}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.t}>`); list = null; } };
    for (const raw of String(md || '').split(/\r?\n/)) {
      const l = raw.trim(); let m;
      if (!l) { flush(); continue; }
      if ((m = /^\[produto:([a-z0-9-]+)\]$/.exec(l))) { flush(); out.push(productCard(m[1])); continue; }
      if ((m = /^(#{2,3})\s+(.+)/.exec(l))) { flush(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
      if ((m = /^[-•]\s+(.+)/.exec(l))) { if (!list || list.t !== 'ul') { flush(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); continue; }
      if ((m = /^\d+[.)]\s+(.+)/.exec(l))) { if (!list || list.t !== 'ol') { flush(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); continue; }
      if ((m = /^>\s?(.+)/.exec(l))) { flush(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
      flush(); out.push(`<p>${inline(l)}</p>`);
    }
    flush(); return out.join('\n');
  }
  const slugify = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  function savePost(b, id, author) {
    const title = str(b.title, 140); if (title.length < 8) throw new Error('O título precisa ter pelo menos 8 caracteres.');
    let slug = slugify(b.slug || title); if (!slug) throw new Error('Endereço inválido.');
    if (db.prepare('SELECT id FROM posts WHERE slug=? AND id<>?').get(slug, id || 0)) slug += '-' + Date.now().toString(36).slice(-3);
    const f = { slug, title, excerpt: str(b.excerpt, 300), body: String(b.body || '').slice(0, 60000), cover: (/^\/(uploads|img)\/[\w\-./]+$/.test(b.cover || '') || require('./db').BLOB_URL_RE.test(b.cover || '')) ? b.cover : '', published: b.published === false ? 0 : 1 };
    if (id) { db.prepare("UPDATE posts SET slug=?,title=?,excerpt=?,body=?,cover=?,published=?,updated_at=datetime('now','localtime') WHERE id=?").run(f.slug, f.title, f.excerpt, f.body, f.cover, f.published, id); return id; }
    return Number(db.prepare('INSERT INTO posts(slug,title,excerpt,body,cover,published,author) VALUES(?,?,?,?,?,?,?)').run(f.slug, f.title, f.excerpt, f.body, f.cover, f.published, author || '').lastInsertRowid);
  }

  /* ===== avaliações do Google (Places API New) — cache de 12h ===== */
  let gcache = { at: 0, data: null };
  async function googleReviews(force) {
    const s = getSettings(), key = secret('google_places_key'), place = s.google_place_id;
    if (!key || !place) return null;
    if (!force && gcache.data && Date.now() - gcache.at < 12 * 3600000) return gcache.data;
    const url = (process.env.GPLACES_URL || 'https://places.googleapis.com/v1') + '/places/' + encodeURIComponent(place) + '?languageCode=pt-BR';
    const r = await fetch(url, { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'rating,userRatingCount,reviews,googleMapsUri,displayName' }, signal: AbortSignal.timeout(10000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || 'Google respondeu ' + r.status);
    const data = { rating: j.rating || 0, total: j.userRatingCount || 0, url: j.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${place}`, name: j.displayName && j.displayName.text,
      reviews: (j.reviews || []).filter((x) => (x.rating || 0) >= 4 && x.text && x.text.text).slice(0, 6).map((x) => ({
        author: (x.authorAttribution && x.authorAttribution.displayName) || 'Cliente Google', photo: (x.authorAttribution && x.authorAttribution.photoUri) || '',
        profile: (x.authorAttribution && x.authorAttribution.uri) || '', rating: x.rating, text: clip(x.text.text, 420), when: x.relativePublishTimeDescription || '' })) };
    gcache = { at: Date.now(), data };
    return data;
  }
  return { feed, render, savePost, slugify, googleReviews };
};
