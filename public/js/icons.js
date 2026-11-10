/* Ilustrações em traço fino por categoria + ícones de interface */
window.ICONS = (() => {
  const s = (inner, vb = '0 0 200 200') =>
    `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

  const art = {
    iphone: s(`<rect x="60" y="18" width="80" height="164" rx="17"/><rect x="63.5" y="21.5" width="73" height="157" rx="14" opacity=".35"/>
      <rect x="70" y="30" width="40" height="40" rx="11"/><circle cx="81" cy="41" r="7"/><circle cx="81" cy="41" r="3.5" opacity=".5"/>
      <circle cx="99" cy="41" r="7"/><circle cx="99" cy="41" r="3.5" opacity=".5"/><circle cx="90" cy="59" r="7"/><circle cx="90" cy="59" r="3.5" opacity=".5"/>
      <circle cx="104" cy="60" r="1.6"/><line x1="140" y1="58" x2="140" y2="76" stroke-width="2"/><line x1="60" y1="52" x2="60" y2="62" stroke-width="2"/>`),
    macbook: s(`<rect x="34" y="40" width="132" height="92" rx="7"/><rect x="40" y="46" width="120" height="80" rx="3" opacity=".4"/>
      <rect x="92" y="40" width="16" height="4" rx="2"/><path d="M18 136h164l-6 10a6 6 0 0 1-5 3H29a6 6 0 0 1-5-3z"/><path d="M86 136v3h28v-3" opacity=".6"/>`),
    ipad: s(`<rect x="44" y="22" width="112" height="156" rx="13"/><rect x="51" y="29" width="98" height="142" rx="6" opacity=".4"/>
      <circle cx="100" cy="25.5" r="1.3"/><path d="M75 140c12-30 38-30 50-60" opacity=".35"/>`),
    watch: s(`<path d="M76 46V22a6 6 0 0 1 6-6h36a6 6 0 0 1 6 6v24"/><path d="M76 154v24a6 6 0 0 0 6 6h36a6 6 0 0 0 6-6v-24"/>
      <rect x="62" y="46" width="76" height="108" rx="24"/><rect x="68" y="52" width="64" height="96" rx="19" opacity=".4"/>
      <rect x="138" y="80" width="6" height="16" rx="3"/><line x1="140" y1="108" x2="140" y2="122" stroke-width="2"/>
      <path d="M100 100V80M100 100l12 8" opacity=".7"/><circle cx="100" cy="100" r="1.6"/>`),
    airpods: s(`<rect x="56" y="96" width="88" height="76" rx="26"/><path d="M56 118h88" opacity=".5"/><circle cx="100" cy="140" r="2"/>
      <path d="M78 34c-10 0-16 7-16 16s6 16 15 16c3 0 4 2 4 4v20a4 4 0 0 0 8 0V52c0-11-4-18-11-18z"/>
      <path d="M122 34c10 0 16 7 16 16s-6 16-15 16c-3 0-4 2-4 4v20a4 4 0 0 1-8 0V52c0-11 4-18 11-18z"/>`),
    jbl: s(`<rect x="26" y="66" width="148" height="72" rx="36"/><ellipse cx="44" cy="102" rx="10" ry="30" opacity=".5"/><ellipse cx="156" cy="102" rx="10" ry="30" opacity=".5"/>
      <path d="M62 78v48M74 74v56M86 72v60M98 72v60M110 72v60M122 72v60M134 74v56" opacity=".28"/>
      <rect x="88" y="94" width="24" height="12" rx="3"/><path d="M60 138l-6 10M140 138l6 10"/>`),
    playstation: s(`<path d="M84 22h32a6 6 0 0 1 6 6v148a6 6 0 0 1-6 6H84a6 6 0 0 1-6-6V28a6 6 0 0 1 6-6z"/>
      <path d="M78 34C56 46 50 70 50 102s6 58 28 70"/><path d="M122 34c22 12 28 36 28 68s-6 58-28 70"/>
      <path d="M92 40h16" opacity=".5"/><circle cx="100" cy="160" r="3"/><path d="M60 182h80" opacity=".4"/>`),
    bike: s(`<circle cx="50" cy="128" r="32"/><circle cx="50" cy="128" r="3"/><circle cx="152" cy="128" r="32"/><circle cx="152" cy="128" r="3"/>
      <path d="M50 128l30-52h52l20 52M80 76l22 52h-52M102 128l30-52"/><path d="M74 62h16M126 58l6 18 14-6"/>
      <rect x="86" y="84" width="34" height="14" rx="4" opacity=".6"/><path d="M100 88l-3 6h6l-3 6" opacity=".9"/>`),
    acessorios: s(`<rect x="62" y="40" width="60" height="60" rx="10"/><rect x="68" y="46" width="48" height="48" rx="6" opacity=".35"/>
      <path d="M80 40V24M104 40V24" stroke-width="2"/><path d="M92 100v10c0 30 50 20 50 50v6"/>
      <rect x="134" y="166" width="16" height="18" rx="4"/><path d="M139 184v6M145 184v6" opacity=".6"/>`),
  };

  const ui = {
    bag: s(`<path d="M6 8h12l-1 12H7z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>`, '0 0 24 24'),
    search: s(`<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>`, '0 0 24 24'),
    menu: s(`<path d="M4 8h16M4 16h16"/>`, '0 0 24 24'),
    close: s(`<path d="M6 6l12 12M18 6L6 18"/>`, '0 0 24 24'),
    arrow: s(`<path d="M5 12h14M13 6l6 6-6 6"/>`, '0 0 24 24'),
    chev: s(`<path d="M9 6l6 6-6 6"/>`, '0 0 24 24'),
    plus: s(`<path d="M12 5v14M5 12h14"/>`, '0 0 24 24'),
    minus: s(`<path d="M5 12h14"/>`, '0 0 24 24'),
    trash: s(`<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>`, '0 0 24 24'),
    truck: s(`<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>`, '0 0 24 24'),
    store: s(`<path d="M4 9l1.5-4h13L20 9M4 9h16v1.5a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0 2.7 2.7 0 0 1-5.3 0zM5.5 12.5V20h13v-7.5M10 20v-4h4v4"/>`, '0 0 24 24'),
    shield: s(`<path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>`, '0 0 24 24'),
    spark: s(`<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>`, '0 0 24 24'),
    swap: s(`<path d="M4 8h13l-3-3M20 16H7l3 3"/>`, '0 0 24 24'),
    chat: s(`<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5" opacity=".7"/>`, '0 0 24 24'),
    pin: s(`<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>`, '0 0 24 24'),
    clock: s(`<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`, '0 0 24 24'),
    phone: s(`<path d="M6 3h3l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v3a3 3 0 0 1-3 3A16 16 0 0 1 3 6a3 3 0 0 1 3-3z"/>`, '0 0 24 24'),
    pix: s(`<path d="M12 3l4 4-4 4-4-4zM12 13l4 4-4 4-4-4zM3 12l4-4 4 4-4 4zM13 12l4-4 4 4-4 4z"/>`, '0 0 24 24'),
    card: s(`<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/>`, '0 0 24 24'),
    cash: s(`<rect x="3" y="7" width="18" height="10" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>`, '0 0 24 24'),
    tag: s(`<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>`, '0 0 24 24'),
    star: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>`,
    check: s(`<path d="M5 12.5l4.5 4.5L19 7.5"/>`, '0 0 24 24'),
    wa: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3z"/></svg>`,
    ig: s(`<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.8"/><circle cx="17" cy="7" r=".6" fill="currentColor"/>`, '0 0 24 24'),
    nav: s(`<path d="M12 2l7 19-7-4-7 4z"/>`, '0 0 24 24'),
    heart: s(`<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>`, '0 0 24 24'),
    bell: s(`<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>`, '0 0 24 24'),
    help: s(`<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4"/><circle cx="12" cy="16.6" r=".5" fill="currentColor"/>`, '0 0 24 24'),
    eye: s(`<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>`, '0 0 24 24'),
    user: s(`<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c.8-3.9 3.8-6 7.5-6s6.7 2.1 7.5 6"/>`, '0 0 24 24'),
    lock: s(`<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>`, '0 0 24 24'),
    car: s(`<path d="M5 16h14v-4l-2-5H7l-2 5zM3 12h2M19 12h2"/><circle cx="8" cy="16.5" r="1.6"/><circle cx="16" cy="16.5" r="1.6"/>`, '0 0 24 24'),
  };

  const lamp = `<svg viewBox="0 0 64 40" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f7e3ad"/><stop offset=".5" stop-color="#d6b26e"/><stop offset="1" stop-color="#9c7432"/></linearGradient></defs>
    <g fill="url(#lg)"><path d="M34 6.5c.9 0 1.6.9 1.6 2 0 .6-.3 1.1-.6 1.5h-2c-.3-.4-.6-.9-.6-1.5 0-1.1.7-2 1.6-2z"/>
    <path d="M26 13.5c1.6-2.3 4.6-3.6 8-3.6s6.4 1.3 8 3.6z"/>
    <path d="M14.2 16.2c3.4-.6 6.3.2 8.4 1.2 3.6-1.6 7.3-2.3 11.4-2.3 6.4 0 11.4 1.6 14.8 3.7 2.6-1.9 6.2-3.4 11.3-3.2-3.1.7-6.1 2.4-8.2 4.9-1.9 2.3-4.2 6.5-11.4 7.6h-12c-5.5-.6-9.7-3.9-12.6-7.8-1-.1-1.9.3-2.4 1.1-.8 1.4.2 3.2 2.3 3.9-3.8.2-6.1-1.8-6.2-4.3 0-2.2 1.7-4.3 4.6-4.8z"/>
    <path d="M28 29.6h12l1.6 3.2c2.6.4 4.4 1.3 4.4 2.3 0 1.4-5.4 2.4-12 2.4s-12-1-12-2.4c0-1 1.8-1.9 4.4-2.3z"/>
    <rect x="6" y="8" width="2.4" height="2.4"/><rect x="9.6" y="5.6" width="2" height="2"/><rect x="10" y="10" width="2.6" height="2.6"/><rect x="13.6" y="7.4" width="2.2" height="2.2" opacity=".8"/><rect x="3.2" y="11.6" width="1.8" height="1.8" opacity=".7"/></g></svg>`;

  const apple = `<svg viewBox="0 0 384 512" aria-hidden="true"><defs><linearGradient id="ag" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f7e3ad"/><stop offset=".55" stop-color="#d6b26e"/><stop offset="1" stop-color="#9c7432"/></linearGradient></defs>
    <path fill="url(#ag)" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>`;

  return { art, ui, lamp, apple };
})();
