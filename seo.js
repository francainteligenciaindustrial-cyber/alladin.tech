// SEO e prévias de link: cada página é entregue com título, descrição, imagem (Open Graph / WhatsApp)
// e dados estruturados (schema.org) já no HTML — o WhatsApp e o Google não executam o JavaScript da loja.
'use strict';
const fs = require('fs');

module.exports = function createSeo({ db, getSettings, J, indexPath, baseUrl, effectivePrice }) {
  let tpl = '', tplMtime = 0;
  const template = () => { const st = fs.statSync(indexPath); if (st.mtimeMs !== tplMtime) { tpl = fs.readFileSync(indexPath, 'utf8'); tplMtime = st.mtimeMs; } return tpl; };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s\S*$/, '') + '…' : s; };
  const money = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const abs = (base, u) => !u ? '' : /^https?:/.test(u) ? u : base + (u.startsWith('/') ? '' : '/') + u;
  const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
  const cond = (c) => /semi|usad/i.test(c || '') ? 'https://schema.org/UsedCondition' : /vitrine|recond|open/i.test(c || '') ? 'https://schema.org/RefurbishedCondition' : 'https://schema.org/NewCondition';

  const STATIC = {
    '/loja': ['Loja', 'Todos os produtos: iPhone, MacBook, iPad, Apple Watch, AirPods, JBL, PlayStation, bikes elétricas e acessórios.'],
    '/mais-vendidos': ['Mais vendidos', 'Os produtos mais vendidos da Aladdin Tech: iPhone, AirPods, Apple Watch e mais — ranking real pelos pedidos confirmados.'],
    '/ofertas': ['Ofertas', 'Ofertas da semana com preço especial, Pix com desconto e parcelamento sem juros.'],
    '/upgrade': ['Simular upgrade', 'Seu usado vale como parte do pagamento. Simule a troca do seu aparelho em poucos cliques.'],
    '/como-chegar': ['Como chegar', 'Endereço, mapa e rota até a loja física. Retire seu pedido em até 1 hora.'],
    '/avaliacoes': ['Avaliações', 'O que os clientes dizem da Aladdin Tech — com fotos reais das compras.'],
    '/perguntas-frequentes': ['Perguntas frequentes', 'Entrega, retirada, garantia, pagamento, upgrade e seminovos: tire suas dúvidas.'],
    '/nossa-historia': ['Nossa história', 'Conheça a Aladdin Tech: quem somos, a equipe que atende você e por que somos referência em upgrade.'],
    '/assistencia': ['Assistência técnica', 'Troca de tela, bateria e reparos em iPhone, iPad e Mac com orçamento antes do serviço e acompanhamento online.'],
    '/guias': ['Guias', 'Guias para escolher melhor: qual iPhone comprar, comparativos, bateria, seminovos e dicas de quem vive de tecnologia.'],
    '/troca-garantida': ['Troca Garantida', 'Compre seu iPhone hoje e, em 12 meses, a gente recompra por até 60% do valor pago para você pegar o próximo.'],
    '/comparar': ['Comparar iPhones', 'Compare iPhones lado a lado: tela, chip, câmeras, bateria e preço.'],
    '/garantia': ['Consultar garantia', 'Digite o IMEI ou o número de série e veja até quando vai a garantia do seu aparelho.'],
    '/privacidade': ['Política de Privacidade', 'Como a Aladdin Tech trata seus dados pessoais (LGPD).'],
    '/cookies': ['Política de Cookies', 'Quais cookies usamos e para quê.']
  };
  const NOINDEX = /^\/(assistencia\/.+|checkout|pedido|minha-conta|verificar-email|redefinir-senha|descadastrar|lista-de-desejos|alerta-cancelar|carrinho)(\/|$)/;

  function storeLd(s, base) {
    const [lat, lng] = String(s.map_query || '').split(',').map(Number);
    return {
      '@context': 'https://schema.org', '@type': 'ElectronicsStore', '@id': base + '/#loja', name: s.store_name || 'Aladdin Tech', slogan: s.tagline || undefined,
      url: base + '/', logo: base + '/img/logo-original.jpg', image: base + '/img/og-aladdin.jpg',
      telephone: s.whatsapp ? '+' + String(s.whatsapp).replace(/\D/g, '') : undefined, email: s.email || undefined,
      address: { '@type': 'PostalAddress', streetAddress: String(s.address || '').split('—')[0].trim(), addressLocality: String(s.city || '').split('—')[0].trim(),
        addressRegion: s.store_uf || undefined, postalCode: s.cep || undefined, addressCountry: 'BR' },
      geo: Number.isFinite(lat) && Number.isFinite(lng) && lat ? { '@type': 'GeoCoordinates', latitude: lat, longitude: lng } : undefined,
      openingHoursSpecification: s.always_open ? [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: '00:00', closes: '23:59' }] : undefined,
      sameAs: s.instagram ? ['https://www.instagram.com/' + String(s.instagram).replace('@', '') + '/'] : undefined,
      priceRange: '$$', paymentAccepted: 'Pix, Cartão de crédito, Cartão de débito, Dinheiro', currenciesAccepted: 'BRL'
    };
  }

  function pageMeta(path, query, base) {
    const s = getSettings(), store = s.store_name || 'Aladdin Tech';
    const m = { title: `${store} — ${s.tagline || 'Referência em Upgrade'}`, desc: 'iPhone, MacBook, iPad, Apple Watch, AirPods, JBL e PlayStation com procedência, garantia e atendimento especializado. Entrega na região, Correios para todo o Brasil ou retire na loja.',
      image: base + '/img/og-aladdin.jpg', type: 'website', url: base + path, ld: [], extra: '', status: 200, robots: 'index,follow' };
    if (NOINDEX.test(path)) m.robots = 'noindex,follow';
    if (path === '/') m.ld.push(storeLd(s, base), { '@context': 'https://schema.org', '@type': 'WebSite', name: store, url: base + '/',
      potentialAction: { '@type': 'SearchAction', target: base + '/loja?q={search_term_string}', 'query-input': 'required name=search_term_string' } });
    else if (STATIC[path.replace(/\/$/, '')]) { const [t, d] = STATIC[path.replace(/\/$/, '')]; m.title = `${t} — ${store}`; m.desc = d; if (path.startsWith('/como-chegar')) m.ld.push(storeLd(s, base)); }
    let mm;
    if ((mm = /^\/guias\/([^/]+)\/?$/.exec(path))) {
      const g = db.prepare('SELECT * FROM posts WHERE slug=? AND published=1').get(decodeURIComponent(mm[1]));
      if (!g) { m.status = 404; m.robots = 'noindex,follow'; }
      else { m.title = `${g.title} — ${store}`; m.desc = clip(g.excerpt || g.body, 200); m.type = 'article'; if (g.cover) m.image = abs(base, g.cover);
        m.ld.push({ '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: clip(g.excerpt || g.body, 300), image: m.image, datePublished: String(g.created_at).replace(' ', 'T'),
          dateModified: String(g.updated_at || g.created_at).replace(' ', 'T'), author: { '@type': 'Organization', name: store }, publisher: { '@type': 'Organization', name: store, logo: { '@type': 'ImageObject', url: base + '/img/logo-original.jpg' } }, mainEntityOfPage: base + path }); }
    }
    if ((mm = /^\/categoria\/([^/]+)\/?$/.exec(path))) {
      const c = db.prepare('SELECT * FROM categories WHERE slug=?').get(decodeURIComponent(mm[1]));
      if (c) { m.title = `${c.name} — ${store}`; m.desc = `${c.name} com procedência e garantia na ${store}. Pix com desconto, parcelamento e entrega na região.`;
        const ps = db.prepare('SELECT images FROM products WHERE category_id=? AND active=1 ORDER BY featured DESC, id DESC LIMIT 1').get(c.id);
        const img = ps && J(ps.images, [])[0]; if (img) m.image = abs(base, img); }
      else m.status = 404;
    }
    if ((mm = /^\/produto\/([^/]+)\/?$/.exec(path))) {
      const p = db.prepare('SELECT p.*, c.name category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.slug=?').get(decodeURIComponent(mm[1]));
      if (!p || !p.active) { m.status = 404; m.robots = 'noindex,follow'; m.title = `Produto não encontrado — ${store}`; }
      else {
        const price = effectivePrice(p), imgs = J(p.images, []).map((u) => abs(base, u)), rv = db.prepare('SELECT COUNT(*) n, AVG(rating) a FROM reviews WHERE product_id=? AND approved=1').get(p.id);
        const nInst = Number(s.installments_no_interest) || Number(s.max_installments) || 1, pix = Number(s.pix_discount) || 0;
        m.title = `${p.name} — R$ ${money(price)} | ${store}`;
        m.desc = clip(`${p.condition && p.condition !== 'Novo' ? p.condition + ' · ' : ''}R$ ${money(price)}${pix ? ` · ${pix}% off no Pix` : ''} · ${nInst}x de R$ ${money(price / nInst)} sem juros. ${p.short || p.description || ''}`, 200);
        m.type = 'product'; if (imgs[0]) m.image = imgs[0];
        m.extra = `<meta property="product:price:amount" content="${price.toFixed(2)}"><meta property="product:price:currency" content="BRL"><meta property="product:availability" content="${p.stock > 0 ? 'in stock' : 'out of stock'}"><meta property="product:condition" content="${/semi|usad/i.test(p.condition || '') ? 'used' : /vitrine|recond/i.test(p.condition || '') ? 'refurbished' : 'new'}">`;
        const valid = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
        m.ld.push({ '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: clip(p.short || p.description || p.name, 500), image: imgs.length ? imgs : undefined,
          sku: p.sku || String(p.id), brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined, category: p.category_name || undefined,
          offers: { '@type': 'Offer', url: base + path, priceCurrency: 'BRL', price: price.toFixed(2), priceValidUntil: p.promo_end ? String(p.promo_end).slice(0, 10) : valid,
            availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', itemCondition: cond(p.condition), seller: { '@type': 'Organization', name: store } },
          aggregateRating: rv.n ? { '@type': 'AggregateRating', ratingValue: (Math.round(rv.a * 10) / 10).toFixed(1), reviewCount: rv.n } : undefined });
        m.ld.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Início', item: base + '/' },
          ...(p.category_name ? [{ '@type': 'ListItem', position: 2, name: p.category_name, item: base + '/loja' }] : []),
          { '@type': 'ListItem', position: p.category_name ? 3 : 2, name: p.name, item: base + path }] });
      }
    }
    // link do vendedor (?v=) e de indicação continuam apontando para a mesma página canônica
    m.canonical = base + (path === '/' ? '/' : path.replace(/\/$/, '')) + (path.startsWith('/loja') && query.q ? '' : '');
    return m;
  }

  function render(req) {
    const base = baseUrl(req), path = req.path, m = pageMeta(path, req.query || {}, base), s = getSettings();
    const head = `<title>${esc(m.title)}</title>
  <meta name="description" content="${esc(m.desc)}">
  <meta name="robots" content="${m.robots}">
  <link rel="canonical" href="${esc(m.canonical)}">
  <meta property="og:site_name" content="${esc(s.store_name || 'Aladdin Tech')}">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:type" content="${m.type}">
  <meta property="og:title" content="${esc(m.title)}">
  <meta property="og:description" content="${esc(m.desc)}">
  <meta property="og:url" content="${esc(m.canonical)}">
  <meta property="og:image" content="${esc(m.image)}">
  <meta property="og:image:alt" content="${esc(m.title)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(m.title)}">
  <meta name="twitter:description" content="${esc(m.desc)}">
  <meta name="twitter:image" content="${esc(m.image)}">
  ${m.extra}
  ${m.ld.map(ld).join('\n  ')}`;
    const html = template()
      .replace(/<title>[\s\S]*?<\/title>\s*/, '')
      .replace(/<meta name="description"[^>]*>\s*/, '')
      .replace('<meta name="theme-color"', head + '\n  <meta name="theme-color"');
    return { status: m.status, html };
  }

  function sitemap(req) {
    const base = baseUrl(req);
    const urls = [['/', '1.0', 'daily'], ['/loja', '0.9', 'daily'], ['/ofertas', '0.8', 'daily'], ['/mais-vendidos', '0.8', 'daily'], ['/upgrade', '0.7', 'monthly'], ['/como-chegar', '0.6', 'monthly'],
      ['/avaliacoes', '0.6', 'weekly'], ['/perguntas-frequentes', '0.5', 'monthly'], ['/garantia', '0.4', 'yearly'], ['/privacidade', '0.2', 'yearly'], ['/cookies', '0.2', 'yearly']]
      .map(([u, p, f]) => ({ loc: base + u, priority: p, changefreq: f }));
    urls.push({ loc: base + '/nossa-historia', priority: '0.6', changefreq: 'monthly' }, { loc: base + '/assistencia', priority: '0.6', changefreq: 'monthly' });
    urls.push({ loc: base + '/guias', priority: '0.7', changefreq: 'weekly' }, { loc: base + '/troca-garantida', priority: '0.6', changefreq: 'monthly' }, { loc: base + '/comparar', priority: '0.7', changefreq: 'monthly' });
    for (const g of db.prepare('SELECT slug, updated_at FROM posts WHERE published=1').all()) urls.push({ loc: `${base}/guias/${encodeURIComponent(g.slug)}`, priority: '0.7', changefreq: 'monthly', lastmod: String(g.updated_at).slice(0, 10) });
    for (const c of db.prepare('SELECT slug FROM categories ORDER BY sort').all()) urls.push({ loc: `${base}/categoria/${encodeURIComponent(c.slug)}`, priority: '0.8', changefreq: 'daily' });
    for (const p of db.prepare("SELECT slug, images, updated_at, created_at FROM products WHERE active=1 ORDER BY id DESC").all()) {
      const img = J(p.images, [])[0];
      urls.push({ loc: `${base}/produto/${encodeURIComponent(p.slug)}`, priority: '0.9', changefreq: 'weekly', lastmod: String(p.updated_at || p.created_at || '').slice(0, 10), image: img ? abs(base, img) : '' });
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority>${u.image ? `<image:image><image:loc>${esc(u.image)}</image:loc></image:image>` : ''}</url>`).join('\n')}
</urlset>`;
  }
  const robots = (req) => `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /checkout
Disallow: /pedido/
Disallow: /documento/
Disallow: /minha-conta
Disallow: /carrinho/

Sitemap: ${baseUrl(req)}/sitemap.xml
`;
  return { render, sitemap, robots, pageMeta };
};
