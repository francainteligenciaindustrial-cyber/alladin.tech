/* Google Analytics 4 + Pixel da Meta — só carregam depois que o cliente aceita os cookies de medição.
   Sem scripts inline (respeita a política de segurança do site). */
(function () {
  'use strict';
  let on = false, cfg = {};
  const q = [];
  function load(src) { const s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); }
  function start(settings) {
    if (on) return; cfg = settings || {};
    const ga = /^G-[A-Z0-9]{4,12}$/.test(cfg.ga4_id || '') ? cfg.ga4_id : '';
    const px = /^\d{10,20}$/.test(cfg.meta_pixel_id || '') ? cfg.meta_pixel_id : '';
    if (!ga && !px) return;
    on = true;
    if (ga) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', ga, { send_page_view: false, anonymize_ip: true });
      load('https://www.googletagmanager.com/gtag/js?id=' + ga);
    }
    if (px) {
      const n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!window._fbq) window._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
      window.fbq('init', px);
      load('https://connect.facebook.net/en_US/fbevents.js');
    }
    cfg.ga = ga; cfg.px = px;
    q.splice(0).forEach((a) => send.apply(null, a));
  }
  const items = (list) => (list || []).map((i) => ({ item_id: String(i.id), item_name: i.name, price: Number(i.price) || 0, quantity: i.qty || 1 }));
  // eventos padronizados → GA4 e Meta
  function send(ev, d) {
    if (!on) { if (q.length < 30) q.push([ev, d]); return; }
    d = d || {};
    try {
      if (ev === 'page') {
        cfg.ga && window.gtag('event', 'page_view', { page_location: location.href, page_path: location.pathname + location.search, page_title: document.title });
        cfg.px && window.fbq('track', 'PageView');
      } else if (ev === 'view_item') {
        cfg.ga && window.gtag('event', 'view_item', { currency: 'BRL', value: d.price, items: items([d]) });
        cfg.px && window.fbq('track', 'ViewContent', { content_ids: [String(d.id)], content_name: d.name, content_type: 'product', value: d.price, currency: 'BRL' });
      } else if (ev === 'add_to_cart') {
        cfg.ga && window.gtag('event', 'add_to_cart', { currency: 'BRL', value: d.price * (d.qty || 1), items: items([d]) });
        cfg.px && window.fbq('track', 'AddToCart', { content_ids: [String(d.id)], content_name: d.name, content_type: 'product', value: d.price * (d.qty || 1), currency: 'BRL' });
      } else if (ev === 'begin_checkout') {
        cfg.ga && window.gtag('event', 'begin_checkout', { currency: 'BRL', value: d.value, items: items(d.items) });
        cfg.px && window.fbq('track', 'InitiateCheckout', { value: d.value, currency: 'BRL', num_items: (d.items || []).reduce((a, i) => a + (i.qty || 1), 0) });
      } else if (ev === 'purchase') {
        cfg.ga && window.gtag('event', 'purchase', { transaction_id: d.code, currency: 'BRL', value: d.value, shipping: d.shipping || 0, items: items(d.items) });
        cfg.px && window.fbq('track', 'Purchase', { value: d.value, currency: 'BRL', content_ids: (d.items || []).map((i) => String(i.id)), content_type: 'product' });
      } else if (ev === 'lead') {
        cfg.ga && window.gtag('event', 'generate_lead', { method: d.method || 'whatsapp' });
        cfg.px && window.fbq('track', 'Contact');
      }
    } catch (e) { /* medição nunca pode quebrar a loja */ }
  }
  window.ATtrack = { start, send };
})();
