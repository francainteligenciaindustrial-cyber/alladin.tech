/* Catálogo de aparelhos para o Simular Upgrade (marca → linha → modelos).
 * iPhone: armazenamentos exatos de cada modelo. Android: opções comuns.
 * Para incluir um modelo novo, basta adicioná-lo na lista da linha certa. */
window.DEVICES = (() => {
  const S = (...v) => v; // armazenamentos
  const A = S('64 GB', '128 GB', '256 GB', '512 GB', '1 TB'); // padrão Android
  const iphone = [
    ['iPhone 18 Pro Max', S('256 GB', '512 GB', '1 TB', '2 TB')], ['iPhone 18 Pro', S('256 GB', '512 GB', '1 TB', '2 TB')],
    ['iPhone 17 Pro Max', S('256 GB', '512 GB', '1 TB', '2 TB')], ['iPhone 17 Pro', S('256 GB', '512 GB', '1 TB')], ['iPhone Air', S('256 GB', '512 GB', '1 TB')], ['iPhone 17', S('256 GB', '512 GB')],
    ['iPhone 16 Pro Max', S('256 GB', '512 GB', '1 TB')], ['iPhone 16 Pro', S('128 GB', '256 GB', '512 GB', '1 TB')], ['iPhone 16 Plus', S('128 GB', '256 GB', '512 GB')], ['iPhone 16', S('128 GB', '256 GB', '512 GB')], ['iPhone 16e', S('128 GB', '256 GB', '512 GB')],
    ['iPhone 15 Pro Max', S('256 GB', '512 GB', '1 TB')], ['iPhone 15 Pro', S('128 GB', '256 GB', '512 GB', '1 TB')], ['iPhone 15 Plus', S('128 GB', '256 GB', '512 GB')], ['iPhone 15', S('128 GB', '256 GB', '512 GB')],
    ['iPhone 14 Pro Max', S('128 GB', '256 GB', '512 GB', '1 TB')], ['iPhone 14 Pro', S('128 GB', '256 GB', '512 GB', '1 TB')], ['iPhone 14 Plus', S('128 GB', '256 GB', '512 GB')], ['iPhone 14', S('128 GB', '256 GB', '512 GB')],
    ['iPhone 13 Pro Max', S('128 GB', '256 GB', '512 GB', '1 TB')], ['iPhone 13 Pro', S('128 GB', '256 GB', '512 GB', '1 TB')], ['iPhone 13', S('128 GB', '256 GB', '512 GB')], ['iPhone 13 mini', S('128 GB', '256 GB', '512 GB')],
    ['iPhone 12 Pro Max', S('128 GB', '256 GB', '512 GB')], ['iPhone 12 Pro', S('128 GB', '256 GB', '512 GB')], ['iPhone 12', S('64 GB', '128 GB', '256 GB')], ['iPhone 12 mini', S('64 GB', '128 GB', '256 GB')],
    ['iPhone SE (3ª geração, 2022)', S('64 GB', '128 GB', '256 GB')], ['iPhone SE (2ª geração, 2020)', S('64 GB', '128 GB', '256 GB')],
    ['iPhone 11 Pro Max', S('64 GB', '256 GB', '512 GB')], ['iPhone 11 Pro', S('64 GB', '256 GB', '512 GB')], ['iPhone 11', S('64 GB', '128 GB', '256 GB')],
    ['iPhone XS Max', S('64 GB', '256 GB', '512 GB')], ['iPhone XS', S('64 GB', '256 GB', '512 GB')], ['iPhone XR', S('64 GB', '128 GB', '256 GB')], ['iPhone X', S('64 GB', '256 GB')],
    ['iPhone 8 Plus', S('64 GB', '128 GB', '256 GB')], ['iPhone 8', S('64 GB', '128 GB', '256 GB')]
  ];
  const lines = {
    Apple: [['iPhone', iphone.map(([m, st]) => ({ m, st }))]],
    Samsung: [
      ['Galaxy S', ['Galaxy S26 Ultra', 'Galaxy S26+', 'Galaxy S26', 'Galaxy S25 Ultra', 'Galaxy S25 Edge', 'Galaxy S25+', 'Galaxy S25', 'Galaxy S25 FE', 'Galaxy S24 Ultra', 'Galaxy S24+', 'Galaxy S24', 'Galaxy S24 FE',
        'Galaxy S23 Ultra', 'Galaxy S23+', 'Galaxy S23', 'Galaxy S23 FE', 'Galaxy S22 Ultra', 'Galaxy S22+', 'Galaxy S22', 'Galaxy S21 Ultra', 'Galaxy S21+', 'Galaxy S21', 'Galaxy S21 FE', 'Galaxy S20 Ultra', 'Galaxy S20+', 'Galaxy S20', 'Galaxy S20 FE']],
      ['Galaxy Z (dobráveis)', ['Galaxy Z Fold7', 'Galaxy Z Flip7', 'Galaxy Z Flip7 FE', 'Galaxy Z Fold6', 'Galaxy Z Flip6', 'Galaxy Z Fold5', 'Galaxy Z Flip5', 'Galaxy Z Fold4', 'Galaxy Z Flip4', 'Galaxy Z Fold3', 'Galaxy Z Flip3']],
      ['Galaxy A', ['Galaxy A57', 'Galaxy A56', 'Galaxy A55', 'Galaxy A54', 'Galaxy A37', 'Galaxy A36', 'Galaxy A35', 'Galaxy A34', 'Galaxy A26', 'Galaxy A25', 'Galaxy A24', 'Galaxy A17', 'Galaxy A16', 'Galaxy A15', 'Galaxy A14',
        'Galaxy A07', 'Galaxy A06', 'Galaxy A05s', 'Galaxy A05', 'Galaxy A04s', 'Galaxy A04', 'Galaxy A73', 'Galaxy A72', 'Galaxy A53', 'Galaxy A52', 'Galaxy A33', 'Galaxy A32', 'Galaxy A23', 'Galaxy A22', 'Galaxy A13', 'Galaxy A12']],
      ['Galaxy M', ['Galaxy M56', 'Galaxy M55', 'Galaxy M36', 'Galaxy M35', 'Galaxy M16', 'Galaxy M15', 'Galaxy M54', 'Galaxy M34', 'Galaxy M14', 'Galaxy M53', 'Galaxy M23', 'Galaxy M13']]
    ],
    Xiaomi: [
      ['Xiaomi (linha principal)', ['Xiaomi 17 Pro Max', 'Xiaomi 17 Pro', 'Xiaomi 17', 'Xiaomi 15T Pro', 'Xiaomi 15T', 'Xiaomi 15 Ultra', 'Xiaomi 15', 'Xiaomi 14T Pro', 'Xiaomi 14T', 'Xiaomi 14 Ultra', 'Xiaomi 14',
        'Xiaomi 13T Pro', 'Xiaomi 13T', 'Xiaomi 13 Ultra', 'Xiaomi 13 Pro', 'Xiaomi 13', 'Xiaomi 13 Lite', 'Xiaomi 12T Pro', 'Xiaomi 12T', 'Xiaomi 12', 'Xiaomi 12 Lite', 'Xiaomi 11T Pro', 'Xiaomi 11T', 'Xiaomi 11 Lite 5G NE']],
      ['Redmi Note', ['Redmi Note 15 Pro+', 'Redmi Note 15 Pro', 'Redmi Note 15', 'Redmi Note 14 Pro+ 5G', 'Redmi Note 14 Pro 5G', 'Redmi Note 14 Pro', 'Redmi Note 14 5G', 'Redmi Note 14',
        'Redmi Note 13 Pro+ 5G', 'Redmi Note 13 Pro 5G', 'Redmi Note 13 Pro', 'Redmi Note 13 5G', 'Redmi Note 13', 'Redmi Note 12 Pro+ 5G', 'Redmi Note 12 Pro 5G', 'Redmi Note 12S', 'Redmi Note 12 5G', 'Redmi Note 12',
        'Redmi Note 11 Pro 5G', 'Redmi Note 11S', 'Redmi Note 11', 'Redmi Note 10 Pro', 'Redmi Note 10S', 'Redmi Note 10']],
      ['Redmi', ['Redmi 15C', 'Redmi 15', 'Redmi 14C', 'Redmi 13C', 'Redmi 13', 'Redmi 12C', 'Redmi 12', 'Redmi 10C', 'Redmi 10', 'Redmi A5', 'Redmi A3', 'Redmi A2', 'Redmi A1']],
      ['POCO', ['POCO F7 Ultra', 'POCO F7 Pro', 'POCO F7', 'POCO F6 Pro', 'POCO F6', 'POCO F5 Pro', 'POCO F5', 'POCO X7 Pro', 'POCO X7', 'POCO X6 Pro', 'POCO X6', 'POCO X5 Pro', 'POCO X5',
        'POCO M7 Pro', 'POCO M7', 'POCO M6 Pro', 'POCO M6', 'POCO M5', 'POCO C75', 'POCO C65']]
    ],
    Motorola: [
      ['Motorola Edge', ['Motorola Edge 60 Pro', 'Motorola Edge 60 Fusion', 'Motorola Edge 60', 'Motorola Edge 50 Ultra', 'Motorola Edge 50 Pro', 'Motorola Edge 50 Fusion', 'Motorola Edge 50 Neo', 'Motorola Edge 50',
        'Motorola Edge 40 Pro', 'Motorola Edge 40 Neo', 'Motorola Edge 40', 'Motorola Edge 30 Ultra', 'Motorola Edge 30 Pro', 'Motorola Edge 30 Fusion', 'Motorola Edge 30 Neo', 'Motorola Edge 30']],
      ['Motorola razr', ['Motorola razr 60 Ultra', 'Motorola razr 60', 'Motorola razr 50 Ultra', 'Motorola razr 50', 'Motorola razr 40 Ultra', 'Motorola razr 40']],
      ['Moto G', ['Moto g86', 'Moto g85', 'Moto g84', 'Moto g75', 'Moto g73', 'Moto g56', 'Moto g55', 'Moto g54', 'Moto g53', 'Moto g35', 'Moto g34', 'Moto g24 Power', 'Moto g24', 'Moto g23', 'Moto g15', 'Moto g14', 'Moto g13',
        'Moto g06', 'Moto g05', 'Moto g04s', 'Moto g04', 'Moto g200', 'Moto g100', 'Moto g82', 'Moto g72', 'Moto g62', 'Moto g52', 'Moto g42', 'Moto g32', 'Moto g22',
        'Moto g Stylus', 'Moto g60s', 'Moto g60', 'Moto g50', 'Moto g41', 'Moto g31', 'Moto g30', 'Moto g20', 'Moto g10']],
      ['Moto E', ['Moto e40', 'Moto e32', 'Moto e22', 'Moto e20', 'Moto e14', 'Moto e13']]
    ]
  };
  const brands = Object.keys(lines);
  // lista achatada: { brand, line, model, storage[] }
  const all = [];
  for (const b of brands) for (const [line, models] of lines[b]) for (const x of models) {
    const o = typeof x === 'string' ? { m: x, st: A } : x;
    all.push({ brand: b, line, model: o.m, storage: o.st });
  }
  const BATTERY = ['100% a 95%', '94% a 90%', '89% a 85%', '84% a 80%', 'Abaixo de 80%', 'Bateria trocada', 'Não sei informar'];
  const STATE = ['Impecável, sem marcas', 'Bom, marcas leves de uso', 'Marcas visíveis', 'Tela ou traseira trincada', 'Com defeito'];
  const EXTRAS = ['Caixa e carregador', 'Somente a caixa', 'Somente o aparelho'];
  return { brands, all, BATTERY, STATE, EXTRAS, androidStorage: A };
})();
