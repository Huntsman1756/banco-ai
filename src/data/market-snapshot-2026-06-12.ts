export type MarketProductKind = "cuenta_remunerada" | "deposito" | "cuenta_nomina";

export type MarketConditionProfile = "sin_condiciones" | "con_condiciones" | "mejora_nomina";

export type MarketSection =
  | "cuentas_remuneradas_sin_condiciones"
  | "cuentas_remuneradas_con_condiciones"
  | "depositos_sin_condiciones"
  | "depositos_con_condiciones"
  | "mejores_cuentas_nomina"
  | "remuneradas_otro_pa\u00eds_sin_sucursal"
  | "depositos_otro_pa\u00eds_sin_sucursal";

export type MarketOffer = {
  id: string;
  bank: string;
  productKind: MarketProductKind;
  section: MarketSection;
  conditionProfile: MarketConditionProfile;
  hasSpanishIban: boolean;
  sourceUrl: string;
  offerText: string;
  requiresVerification?: boolean;
  evidenceNotes?: string;
};

export type MarketScrapeTarget = {
  bankName: string;
  productKind: MarketProductKind;
  sourceUrl: string;
  hasSpanishIban: boolean;
  offerCount: number;
  sectionSummary: string;
};

export const MARKET_SNAPSHOT_2026_06_12 = {
  asOfDate: "2026-06-12",
  nextUpdateExpected: "2026-06-26",
  scopeNote:
    "Rentabilidades en bruto y TAE, para comparativa informativa. Revisar cambios en condiciones y URLs antes de aprobar.",
  offers: [
    // Entidades con sucursal en Espa\u00f1a - Cuentas remuneradas SIN condiciones
    {
      id: "es-cuenta-rem-sinc-001",
      bank: "Renault Bank",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://renaultbank.es/productos/",
      offerText: "Cuenta remunerada al 2,02%.",
    },
    {
      id: "es-cuenta-rem-sinc-002",
      bank: "Grupo Cooperativo Cajamar",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl:
        "https://www.grupocooperativocajamar.es/es/particulares/productos-y-servicios/cuentas/cuenta-wefferent-ahorro/",
      offerText:
        "Cuenta remunerada al 1,76% los primeros 50k€ y al 1,00% a partir de 50k€.",
    },
    {
      id: "es-cuenta-rem-sinc-003",
      bank: "Pibank",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.pichincha.com/",
      offerText: "Cuenta remunerada al 1,76%.",
      evidenceNotes: "Pibank es marca comercial de Banco Pichincha.",
    },
    {
      id: "es-cuenta-rem-sinc-004",
      bank: "Banco BiG",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.bancobig.es/cuentas-big/gran-cuenta-remunerada/",
      offerText: "Cuenta remunerada al 1,51%.",
    },
    {
      id: "es-cuenta-rem-sinc-005",
      bank: "Banco Pichincha",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.pichincha.com/",
      offerText: "Cuenta remunerada al 1,51%.",
    },
    {
      id: "es-cuenta-rem-sinc-006",
      bank: "Indexa Capital",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://indexacapital.com/es/esp/yield",
      offerText:
        "Cuenta remunerada al 1,50% (referencia BCE - 0,50%), im\u00e1ximo con 20k€.",
    },
    {
      id: "es-cuenta-rem-sinc-007",
      bank: "Wizink",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.wizink.es/public/productos-ahorro/cuenta-ahorro",
      offerText: "Cuenta remunerada al 1,20%.",
    },
    {
      id: "es-cuenta-rem-sinc-008",
      bank: "Revolut",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.revolut.com/es-ES/instant-access-savings/",
      offerText: "Cuenta remunerada al 1,15%.",
      evidenceNotes: "La remuneraci\u00f3n puede aumentar cumpliendo condiciones.",
    },
    {
      id: "es-cuenta-rem-sinc-009",
      bank: "Self Bank",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.selfbank.es/ahorrar/cuenta-ahorro-self",
      offerText: "Cuenta remunerada al 1,00% hasta 60k€.",
      evidenceNotes: "Puede subir por condiciones en secci\u00f3n de condiciones.",
    },
    {
      id: "es-cuenta-rem-sinc-010",
      bank: "EBN Banco",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.ebnbanco.com/ahorro/cuenta-remunerada-ahorro/",
      offerText:
        "Cuenta remunerada al 1,00% hasta 50k€ con saldo medio diario trimestral > 3k€.",
    },
    {
      id: "es-cuenta-rem-sinc-011",
      bank: "N26",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://n26.com/es-es/cuenta-ahorro",
      offerText: "Cuenta remunerada al 0,50%.",
      evidenceNotes: "Puede subir con condiciones.",
    },
    {
      id: "es-cuenta-rem-sinc-012",
      bank: "ING",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.ing.es/cuenta-naranja",
      offerText: "Cuenta remunerada al 0,30%.",
      evidenceNotes: "Puede subir con condiciones.",
    },
    {
      id: "es-cuenta-rem-sinc-013",
      bank: "MyInvestor",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://myinvestor.es/cuentas-tarjetas/cuentas/",
      offerText: "Cuenta remunerada al 0,30% hasta 70k€.",
      evidenceNotes: "Puede subir con condiciones.",
    },

    // Entidades con sucursal en Espa\u00f1a - Cuentas remuneradas CON condiciones
    {
      id: "es-cuenta-rem-cond-001",
      bank: "Grupo Cooperativo Cajamar",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl:
        "https://www.grupocooperativocajamar.es/es/particulares/productos-y-servicios/cuentas/abrir-cuenta-online/",
      offerText:
        "Cuenta remunerada al 3,04% hasta 50k€ durante 6 meses para nuevos clientes con Bizum activo; sin condiciones posterior a 6 meses: no remunera.",
      evidenceNotes: "Compatible con cuenta n\u00f3mina de Cajamar.",
    },
    {
      id: "es-cuenta-rem-cond-002",
      bank: "Trade Republic",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://traderepublic.com/es-es/interes/",
      offerText:
        "Cuenta remunerada al 3,04% para nuevos clientes. El saldo se deposita en cuenta colectiva en banco asociado (FGD).",
    },
    {
      id: "es-cuenta-rem-cond-003",
      bank: "Bankinter",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.bankinter.com/banca/cuentas-tarjetas/cuentas/cuenta-no-nomina",
      offerText:
        "Opci\u00f3n 1: 5,00% hasta 10k€ durante 1er a\u00f1o + 2,00% hasta 10k€ durante 2\u00ba a\u00f1o. Requiere 10 recibos trimestrales, 3.000€ en compras/a\u00f1o y 633€ ingresados en primeros 2 meses.",
      evidenceNotes: "Opciones 1 y 3 compatibles.",
    },
    {
      id: "es-cuenta-rem-cond-004",
      bank: "Openbank",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.openbank.es/cuenta-ahorro-bienvenida",
      offerText:
        "2,50% durante 1 a\u00f1o para nuevos clientes con Bizum + hasta 200€ por recibir 2 recibos en 10 meses (incentivo 20€/mes). Despu\u00e9s se aplica tipo vigente.",
    },
    {
      id: "es-cuenta-rem-cond-005",
      bank: "Bankinter",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl:
        "https://www.bankinter.com/banca/nav/cuenta-corriente-digital-landing?gclsrc=aw.ds&gad_source=1&gad_campaignid=23224596211&gbraid=0AAAAADwy45k0nDp4WicNpS3gW4c4ZB4xl&gclid=CjwKCAiAlfvIBhA6EiwAcErpyX0RCuh8ezY-6ejnhsVdSRDlYX-L6CkNSVzB0ad-rrrS3proATAJ3xoCSawQAvD_BwE",
      offerText: "Opci\u00f3n 2: 2,50% hasta 100k€ para nuevos clientes.",
    },
    {
      id: "es-cuenta-rem-cond-006",
      bank: "B100",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://b100.es/es/banco/cuentas/cuenta-online/",
      offerText:
        "Opci\u00f3n 1: 2,50% hasta 100k€ para nuevos clientes y dinero nuevo (desde 01/06/26).",
    },
    {
      id: "es-cuenta-rem-cond-007",
      bank: "B100",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://b100.es/es/banco/cuentas/cuenta-online/",
      offerText:
        "Opci\u00f3n 2: 3,00% hasta 50k€. Requiere traspaso diario hasta 60€, objetivos de pasos/tiempo social y 8 compras/mes 200€.",
    },
    {
      id: "es-cuenta-rem-cond-008",
      bank: "Cetelem",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.cetelem.es/cuenta-ahorro-cetelem",
      offerText: "Cuenta remunerada al 2,30% para nuevos clientes.",
    },
    {
      id: "es-cuenta-rem-cond-009",
      bank: "Banco Sabadell",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://cuentaonline.bancsabadell.com/",
      offerText:
        "2,00% hasta 50k€ para nuevos clientes + 400€ si se domicilia Bizum y n\u00f3mina + 3% devoluci\u00f3n recibos luz/gas.",
    },
    {
      id: "es-cuenta-rem-cond-010",
      bank: "Volkswagen Bank",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.vwfs.es/banca/cuenta-de-alta-remuneracion.html",
      offerText: "2,12% durante 6 meses para nuevos clientes, luego 1,10%.",
    },
    {
      id: "es-cuenta-rem-cond-011",
      bank: "Banca March",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://avantio.bancamarch.es/es/cuentas-y-depositos/cuenta-online/",
      offerText:
        "2,02% para saldos hasta 60k€ con n\u00f3mina > 1.500€; resto condiciones base 1,00% hasta 30k€ con saldo o inversiones \u2265 10k€.",
    },
    {
      id: "es-cuenta-rem-cond-012",
      bank: "Globalcaja",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.globalcaja.es/es/hazte-cliente",
      offerText: "2,00% hasta 100k€ durante 1 a\u00f1o para nuevos clientes.",
    },
    {
      id: "es-cuenta-rem-cond-013",
      bank: "Abanca",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.abanca.com/es/cuentas/cuenta-remunerada/",
      offerText: "2,00% durante 1 a\u00f1o si domicilia n\u00f3mina.",
    },
    {
      id: "es-cuenta-rem-cond-014",
      bank: "Kutxabank",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl:
        "https://portal.kutxabank.es/cs/Satellite/kb/es/particulares/cuenta-remunerada/pys?c=PyS&cid=1306601848440&d=Touch&hizkuntza=es&localizador=1298547039252&pagename=PortalBBK%2FPortalKutxabank%2FPyS%2FPK_PyS&sitio=PortalBBK%2FPortalKutxabank",
      offerText: "2,00% para saldos hasta 30k€ durante 1 a\u00f1o para nuevos clientes.",
    },
    {
      id: "es-cuenta-rem-cond-015",
      bank: "EBN Banco",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.ebnbanco.com/ahorro/cuenta-remunerada-ahorro/",
      offerText:
        "2,50% para saldos 3k€-10k€ y 1,50% para el excedente \u2265 10k€, con inversi\u00f3n m\u00ednima (2,5k o 10k en carteras) gestionadas por EBN Banco.",
    },
    {
      id: "es-cuenta-rem-cond-016",
      bank: "Bankinter",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.bankinter.com/banca/cuentas-tarjetas/cuentas/cuenta-inteligente-digital",
      offerText:
        "2,00% hasta 50k€ durante 1 a\u00f1o para nuevos clientes con n\u00f3mina y Bizum; 1,62% sin n\u00f3mina/Bizum. Cuenta corriente asociado al 0% como tr\u00e1nsito.",
      evidenceNotes: "Compatible con opci\u00f3n 1.",
    },
    {
      id: "es-cuenta-rem-cond-017",
      bank: "Revolut",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.revolut.com/es-ES/instant-access-savings/",
      offerText: "2,27% contratando plan Ultra (55,00€/mes); 1,25% sin condiciones.",
    },
    {
      id: "es-cuenta-rem-cond-018",
      bank: "MyInvestor",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://myinvestor.es/cuentas-tarjetas/cuentas/",
      offerText:
        "2,10% hasta 70k€ con plan premium (7,99€/mes). Sin plan: 0,75% hasta 70k€ para nuevos clientes o 300€ mensuales en productos o seguro AXA.",
    },
    {
      id: "es-cuenta-rem-cond-019",
      bank: "Self Bank",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.selfbank.es/ahorrar/cuenta-ahorro-self",
      offerText:
        "1,50% hasta 60k€ si hay 20.000 € o m\u00e1s en fondos/ETFs; 1,00% sin condiciones.",
      evidenceNotes: "Etiqueta ETFs en condiciones: revisar que no contradiga categorizaci\u00f3n regulatoria.",
    },
    {
      id: "es-cuenta-rem-cond-020",
      bank: "Unicaja",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.unicajabanco.es/es/cuenta-online",
      offerText:
        "1,25% hasta 20k€ + 450€ o 350€ por n\u00f3mina + 1% devoluci\u00f3n de recibos hasta 200€/a\u00f1o.",
    },
    {
      id: "es-cuenta-rem-cond-021",
      bank: "ING",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.ing.es/cuenta-naranja",
      offerText: "1,00% domiciliando n\u00f3mina/ingresos recurrentes o 1er a\u00f1o para nuevos clientes.",
    },
    {
      id: "es-cuenta-rem-cond-022",
      bank: "N26",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://n26.com/es-es/cuenta-ahorro",
      offerText:
        "0,50% sin condiciones o 1,30% con plan Metal (16,90€/mes / 91,30€/6m / 162,20€/año).",
    },
    {
      id: "es-cuenta-rem-cond-023",
      bank: "Cetelem",
      productKind: "cuenta_remunerada",
      section: "cuentas_remuneradas_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.cetelem.es/cuenta-remunerada-suma",
      offerText:
        "Devoluci\u00f3n del 1,5% de compras con tarjeta (tope 10€/mes), con saldo medio mensual > 600€ y compra m\u00edn. 20€ en supermercado/gasolineras.",
    },

    // Dep\u00f3sitos SIN condiciones
    {
      id: "es-dep-sinc-001",
      bank: "Banco Finantia",
      productKind: "deposito",
      section: "depositos_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl:
        "https://www.finantia.es/es/banca-personal/depositos-a-plazo/?gclid=CjwKCAjws--ZBhAXEiwAv-RNL8utJeUX-WvYnFv6x3fodHCUAM9rqy8k8YBaWNJPYjRk2JWPBIbrERoCyqkQAvD_BwE",
      offerText:
        "Dep\u00f3sitos no cancelables 12m 2,85%, 18m 2,65%, 24m 2,85%, 36m 2,90%; cancelables 12m 2,45%, 18m 2,45%, 24m 2,45%, 36m 2,65%. M\u00ednimo 50k€.",
    },
    {
      id: "es-dep-sinc-002",
      bank: "Volkswagen Bank",
      productKind: "deposito",
      section: "depositos_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.vwfs.es/banca/deposito-vw-bank.html",
      offerText: "Dep\u00f3sitos cancelables: 1,90% 6m y 2,80% 12m.",
    },
    {
      id: "es-dep-sinc-003",
      bank: "Renault Bank",
      productKind: "deposito",
      section: "depositos_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://renaultbank.es/productos/",
      offerText:
        "Dep\u00f3sitos al 2,63% 1 a\u00f1o, 2,98% 2 a\u00f1os, 3,19% 3 a\u00f1os. M\u00ednimo 500€.",
    },
    {
      id: "es-dep-sinc-004",
      bank: "EBN Banco",
      productKind: "deposito",
      section: "depositos_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.ebnbanco.com/ahorro/deposito-sinycon-plus/",
      offerText:
        "Dep\u00f3sito 3m 2,00%, 6m 2,25%, 12m 2,50%, 18m 2,50%, 24m 2,60%, 36m 2,60%, 42m 2,65%. M\u00ednimo 5k€.",
    },
    {
      id: "es-dep-sinc-005",
      bank: "BFF (Cuenta Facto)",
      productKind: "deposito",
      section: "depositos_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.cuentafacto.es/",
      offerText:
        "Dep\u00f3sito: 2,218% de 90-92d, 2,422% de 93-209d, 2,626% de 210-449d, 2,015% de 450-1827d. M\u00ednimo 5k€.",
    },
    {
      id: "es-dep-sinc-006",
      bank: "Banco BiG",
      productKind: "deposito",
      section: "depositos_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.bancobig.es/ahorrar/depositos-a-plazo-fijo/",
      offerText:
        "Cancelables: 3m 2,25%, 6m 2,35%, 12m 2,50% (min 1k). No cancelables: 6m 2,35%, 12m 2,50% (min 10k).",
      evidenceNotes: "Banco Big informa t\u00e9rminos adicionales; revis\u00f3n de condiciones necesaria.",
    },
    {
      id: "es-dep-sinc-007",
      bank: "Pibank",
      productKind: "deposito",
      section: "depositos_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.pichincha.com/",
      offerText: "Dep\u00f3sito cancelable al 2,37% a 1 a\u00f1o. Sin m\u00ednimo. Marca comercial de Banco Pichincha.",
    },
    {
      id: "es-dep-sinc-008",
      bank: "Cetelem",
      productKind: "deposito",
      section: "depositos_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.cetelem.es/ahorro-y-depositos-cetelem/",
      offerText: "2,00% 3m, 2,20% 6m, 2,27% 12m, 2,78% 24m. M\u00ednimo 1€.",
    },
    {
      id: "es-dep-sinc-009",
      bank: "Cajamar Caja Rural",
      productKind: "deposito",
      section: "depositos_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl:
        "https://www.cajamar.es/es/particulares/productos-y-servicios/ahorro-e-inversion/depositos/deposito-hola/",
      offerText: "Dep\u00f3sito cancelable 2,27% 1 a\u00f1o. M\u00ednimo 6k€.",
    },
    {
      id: "es-dep-sinc-010",
      bank: "Deutsche Bank",
      productKind: "deposito",
      section: "depositos_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl:
        "https://www.deutsche-bank.es/es/soluciones-db/deposito-confianza.html?&utm_source=web&utm_medium=cardweb&utm_campaign=depositoconfianza&utm_content=carddepositoconfianza",
      offerText:
        "Dep\u00f3sito base cancelable 2,25% 1a\u00f1o. Otras opciones cancelables: 3m 1,51%, 6m 1,51%, 12m 2,25%. M\u00ednimo 3k€ máx 100k€.",
      evidenceNotes: "Indica mejora de remuneraci\u00f3n con condiciones en otras secciones.",
    },
    {
      id: "es-dep-sinc-011",
      bank: "Banco Pichincha",
      productKind: "deposito",
      section: "depositos_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.pichincha.com/",
      offerText: "Dep\u00f3sitos cancelables 2,02% a 1 a\u00f1o. URL de origen aportada incompleta en texto fuente.",
      requiresVerification: true,
    },
    {
      id: "es-dep-sinc-012",
      bank: "Wizink",
      productKind: "deposito",
      section: "depositos_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.wizink.es/public/productos-ahorro/deposito-plazo-fijo",
      offerText: "Dep\u00f3sitos cancelables 12m 2,05% y 25m 2,10%. M\u00ednimo 5k€.",
    },
    {
      id: "es-dep-sinc-013",
      bank: "ING",
      productKind: "deposito",
      section: "depositos_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.ing.es/depositos-naranja",
      offerText:
        "Dep\u00f3sito cancelable 12m 1,45% (<50k), 1,70% (50k-100k), 1,90% (>100k); 18m 1,80%/1,90%/2,20%; 24m 2,15%/2,25%/2,30%.",
    },
    {
      id: "es-dep-sinc-014",
      bank: "MyInvestor",
      productKind: "deposito",
      section: "depositos_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://myinvestor.es/cuentas-tarjetas/depositos/",
      offerText:
        "Dep\u00f3sitos cancelables 1m 2,05%, 3m 1,75%, 6m 1,75%, 12m 1,75%. M\u00ednimo 10k€. Mejora con condiciones.",
    },
    {
      id: "es-dep-sinc-015",
      bank: "Self Bank",
      productKind: "deposito",
      section: "depositos_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.selfbank.es/ahorrar/depositos",
      offerText: "Dep\u00f3sitos cancelables: 3m 1,70%, 6m 1,75%, 12m 1,80%. M\u00ednimo 1k€, m\u00e1x 1M€.",
    },
    {
      id: "es-dep-sinc-016",
      bank: "CBNK",
      productKind: "deposito",
      section: "depositos_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://cbnk.es/personas/depositos/deposito-variable",
      offerText:
        "Dep\u00f3sito cancelable EURIBOR 12M - 0,75%. M\u00ednimo 20k€. Otras opciones con condiciones se listan abajo.",
      evidenceNotes: "Texto sugiere ofertas con condiciones adicionales.",
    },
    {
      id: "es-dep-sinc-017",
      bank: "Openbank",
      productKind: "deposito",
      section: "depositos_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.openbank.es/deposito-a-plazo-fijo",
      offerText: "Dep\u00f3sito cancelable 1,25% a 12 meses.",
      evidenceNotes: "Hay mejora condicional en secci\u00f3n posterior.",
    },
    {
      id: "es-dep-sinc-018",
      bank: "Caixabank",
      productKind: "deposito",
      section: "depositos_sin_condiciones",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: true,
      sourceUrl:
        "https://www.caixabank.es/particular/ahorro/deposito-plazo-fijo.html?loce=sh-part-Ahorro-DescubreNuestrasFormasAhorro-4-destacado-Ahorro-DepositoBonificadoPlazoFijo-NA",
      offerText: "Dep\u00f3sito cancelable 0,10% a 12 meses. M\u00ednimo 5k€.",
      evidenceNotes: "La entidad indica mejoras de tipo con condiciones.",
    },

    // Dep\u00f3sitos CON condiciones
    {
      id: "es-dep-cond-001",
      bank: "Deutsche Bank",
      productKind: "deposito",
      section: "depositos_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl:
        "https://www.deutsche-bank.es/es/soluciones-db/deposito-confianza.html?&utm_source=web&utm_medium=cardweb&utm_campaign=depositoconfianza&utm_content=carddepositoconfianza",
      offerText:
        "Dep\u00f3sito cancelable 1a\u00f1o 3,25%. Base 2,25% +0,20% domiciliando n\u00f3mina 2k+, +0,20% con tarjeta +6k/a\u00f1o, +0,60% con 15k fondo inversión.",
    },
    {
      id: "es-dep-cond-002",
      bank: "ING",
      productKind: "deposito",
      section: "depositos_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.ing.es/cuenta-naranja",
      offerText: "Dep\u00f3sito 3 meses al 3,00% para nuevos clientes.",
    },
    {
      id: "es-dep-cond-003",
      bank: "Cajamar Caja Rural",
      productKind: "deposito",
      section: "depositos_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl:
        "https://www.cajamar.es/es/particulares/productos-y-servicios/ahorro-e-inversion/depositos/deposito-nueva-pension/",
      offerText:
        "Dep\u00f3sito cancelable 2,78% a 1 a\u00f1o para nuevos clientes domiciliando pensi\u00f3n. Min 6k€, m\u00e1x 50k€.",
    },
    {
      id: "es-dep-cond-004",
      bank: "Self Bank",
      productKind: "deposito",
      section: "depositos_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.selfbank.es/ahorrar/depositos/deposito-12-meses-nuevos-clientes",
      offerText: "Dep\u00f3sito cancelable 2,75% a 12 meses para nuevos clientes (6k€-100k€).",
    },
    {
      id: "es-dep-cond-005",
      bank: "Wizink",
      productKind: "deposito",
      section: "depositos_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.wizink.es/public/productos-ahorro/deposito-plazo-fijo",
      offerText: "Dep\u00f3sito cancelable 2,85% a 18 meses y 2,60% a 36 meses para dinero nuevo. M\u00ednimo 5k€.",
    },
    {
      id: "es-dep-cond-006",
      bank: "CBNK",
      productKind: "deposito",
      section: "depositos_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://cbnk.es/personas/depositos/deposito-nomina",
      offerText:
        "Dep\u00f3sito cancelable 2,50% a 12 meses con n\u00f3mina > 2k€/mes o 10k fondos de pensiones. Min 10k€.",
    },
    {
      id: "es-dep-cond-007",
      bank: "Arquia",
      productKind: "deposito",
      section: "depositos_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.arquia.com/particulares/depositos",
      offerText:
        "Dep\u00f3sito 2,50% a 12 meses para n\u00f3minas >900€ (o autónomos >275), o fondo de inversi\u00f3n/plan pensi\u00f3n >10k. Tambi\u00e9n 2,50% a 18m para dinero nuevo.",
      evidenceNotes: "Requiere validar tramos (6m 30k, 18m 200k).",
    },
    {
      id: "es-dep-cond-008",
      bank: "Banca March",
      productKind: "deposito",
      section: "depositos_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl:
        "https://avantio.bancamarch.es/es/cuentas-y-depositos/deposito-6-meses/",
      offerText:
        "Nuevos clientes: 2,01% a 6 meses y 2,50% a 12 meses. Para 12m: ver URL, m\u00ednimo 30k€.",
      evidenceNotes: "URL de 6 meses y 12 meses distinta en el texto original.",
    },
    {
      id: "es-dep-cond-009",
      bank: "Banco BiG",
      productKind: "deposito",
      section: "depositos_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.bancobig.es/ahorrar/depositos-a-plazo-fijo/",
      offerText:
        "Deposito nuevos clientes 1m 4,00%, 3m 3,25%, 6m 2,75%; no cancelable 3m 2,25%, 6m 2,25%, 9m 2,50% para dinero nuevo.",
    },
    {
      id: "es-dep-cond-010",
      bank: "Openbank",
      productKind: "deposito",
      section: "depositos_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://www.openbank.es/deposito-a-plazo-fijo",
      offerText:
        "Dep\u00f3sito cancelable 2,25% a 1 año con ingresos mensuales de 900€; sin condici\u00f3n baja a 1,25%.",
    },
    {
      id: "es-dep-cond-011",
      bank: "MyInvestor",
      productKind: "deposito",
      section: "depositos_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl: "https://myinvestor.es/cuentas-tarjetas/depositos/",
      offerText:
        "Cancelable 1m 2,25%, 3m 2,00%, 6m 2,00%, 12m 2,00% con inversi\u00f3n 150€/mes salvo 1m (4.000€). Premium: 1m 4,00% hasta 5k€, 3m 3,00% hasta 25k€.",
      evidenceNotes: "La base sin condici\u00f3n se deja en 2,10% 1m y 1,75% resto (seg\u00fan texto fuente).",
    },
    {
      id: "es-dep-cond-012",
      bank: "Caixabank",
      productKind: "deposito",
      section: "depositos_con_condiciones",
      conditionProfile: "con_condiciones",
      hasSpanishIban: true,
      sourceUrl:
        "https://www.caixabank.es/particular/ahorro/deposito-plazo-fijo.html?loce=sh-part-Ahorro-DescubreNuestrasFormasAhorro-4-destacado-Ahorro-DepositoBonificadoPlazoFijo-NA",
      offerText: "Cancelable hasta 1,10% con determinados productos/servicios. M\u00ednimo 5k€.",
      evidenceNotes: "Debe confirmarse tramo exacto por condiciones del canal digital.",
    },

    // Mejores cuentas n\u00f3mina (promocionales)
    {
      id: "es-nomina-001",
      bank: "Ibercaja",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl: "https://www.ibercaja.es/particulares/cuentas-tarjetas/cuentas/cuenta-vamos/",
      offerText:
        "5,09% hasta 12k€ durante 1er a\u00f1o + 2,01% hasta 12k€ durante 2o a\u00f1o. Requisitos: nuevo cliente, n\u00f3mina m\u00edn 600€/mes, 6 recibos/semestre, 6 pagos con tarjeta/semestre.",
    },
    {
      id: "es-nomina-002",
      bank: "Cajamar Caja Rural",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl: "https://www.cajamar.es/es/comun/eventos/promo-nominas/",
      offerText:
        "750/500/300€ por domiciliar n\u00f3mina (primer alta), m\u00edn 36 meses permanencia. Escala depende de n\u00f3mina entre 1.200€ y >4.000€.",
    },
    {
      id: "es-nomina-003",
      bank: "Kutxabank",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl:
        "https://portal.kutxabank.es/cs/Satellite/kb/es/particulares/trae-tu-nomina-1/pys?utm_campaign=cuentas-tarjetas_trae-tu-nomina_2026&utm_source=kutxabank&utm_medium=portal-banner-lateral&utm_content=banner_cas",
      offerText:
        "600€ o 300€ por n\u00f3mina + tarjeta + Bizum. Condici\u00f3n: n\u00f3mina 2.500€ (1.800€ <=30 a\u00f1os), o 800€ para incentivo 300.",
    },
    {
      id: "es-nomina-004",
      bank: "Abanca",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl: "https://www.abanca.com/es/cuentas/cuenta-online/#cuenta-nomina",
      offerText:
        "500€ (o 185€) por nuevos clientes domiciliando n\u00f3mina/pensi\u00f3n: 1.200€/més m\u00edn para 500€, permanencia 24 meses.",
    },
    {
      id: "es-nomina-005",
      bank: "Deutsche Bank",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl: "https://www.deutsche-bank.es/es/particulares/cuentas-tarjetas/cuentas/mas-db.html",
      offerText:
        "500€ brutos + 1,50% remuneraci\u00f3n en saldos 10.000-150.000€ durante 1er a\u00f1o. Requisitos: nueva domiciliaci\u00f3n 2.000€/mes y saldo medio 3.000€ durante 12 meses.",
    },
    {
      id: "es-nomina-006",
      bank: "Bankinter",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl:
        "https://www.bankinter.com/banca/nav/cuenta-nomina-sin-comisiones-remunerada-landing?gclid=Cj0KCQiAjbagBhD3ARIsANRrqEucDQ5WRhkexl8_89ZiG0rzpFhKI-soDjFOFdH0VhQ-h-Hw_7805RYaAu1lEALw_wcB&gclsrc=aw.ds",
      offerText:
        "5,00% hasta 10k\u20ac 1er a\u00f1o + 2,00% 2o a\u00f1o; requiere n\u00f3mina 800€, 3 recibos y 3 movimientos con tarjeta/trimestre.",
    },
    {
      id: "es-nomina-007",
      bank: "Globalcaja",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl: "https://www.globalcaja.es/es/particulares/nominas",
      offerText:
        "380€/180€ por n\u00f3mina + 120€ si se activa y usa Bizum 1 vez/mes. N\u00f3mina >=2.000€ o 700-1.999€ seg\u00fan tramo.",
    },
    {
      id: "es-nomina-008",
      bank: "Unicaja",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl: "https://www.unicajabanco.es/es/cuenta-online",
      offerText:
        "Opci\u00f3n 1: 450/350€ por n\u00f3mina >1.200/600-1.200€ + 1,25% hasta 25k + 1% recibos (max 200€).",
    },
    {
      id: "es-nomina-009",
      bank: "Unicaja",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl: "https://www.unicajabanco.es/es/cuentas-y-tarjetas/cuentas/servicio-nomina/promo-nomina",
      offerText:
        "Opci\u00f3n 2: 450/350€ por nueva n\u00f3mina >2.000/800-2.000€, requerir Bizum, hasta 12 meses devoluci\u00f3n 15€/mes de recibos.",
    },
    {
      id: "es-nomina-010",
      bank: "BBVA",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl: "https://www.bbva.es/personas/productos/cuentas/cuenta-nomina.html",
      offerText:
        "400€ por n\u00f3mina 33,33€/mes + 100€ recibos (hasta 8,33€/mes) + 100€ pagos con tarjeta + hasta 600€ extra si saldo mantiene 20k€.",
    },
    {
      id: "es-nomina-011",
      bank: "Banco de Santander",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl: "https://www.bancosantander.es/particulares/cuentas-tarjetas/cuentas-corrientes/cuentas-nomina",
      offerText:
        "Opci\u00f3n 1: hasta 840€ (n\u00f3mina, bizum y recibos) para nuevos clientes; requiere n\u00f3mina/ingresos recurrentes >=800€.",
    },
    {
      id: "es-nomina-012",
      bank: "Banco de Santander",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl: "https://www.bancosantander.es/particulares/cuentas-tarjetas/cuentas-corrientes/cuenta-online-iphone",
      offerText:
        "Opci\u00f3n 2: Renting 36 meses smartphone (Iphone17 Pro). Requiere n\u00f3mina >3.000€/mes, 2 recibos/mes, bizum activo y permanencia 36 meses.",
    },
    {
      id: "es-nomina-013",
      bank: "Cajaviva Caja Rural",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl: "https://www.cajaviva.es/particulares/programa-nomina-pension",
      offerText:
        "400€ por n\u00f3mina y 5 compras/de una de condiciones (tarjeta, operaciones valor, recibos o Bizum). Sin tener n\u00f3mina en 12 meses previos.",
    },
    {
      id: "es-nomina-014",
      bank: "Banco Sabadell",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl: "https://cuentaonline.bancsabadell.com/",
      offerText:
        "400€ + 2% remuneraci\u00f3n hasta 50k€ + 3% devoluci\u00f3n recibos luz/gas al domiciliar n\u00f3mina + Bizum por primera vez.",
    },
    {
      id: "es-nomina-015",
      bank: "ING",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl: "https://www.ing.es/cuenta-nomina-ing",
      offerText:
        "400€ por domiciliar n\u00f3mina/ingreso recurrente >=700€/mes para nuevos clientes. Exige traer Bizum antes del 31/07/2026.",
    },
    {
      id: "es-nomina-016",
      bank: "Caixabank",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl:
        "https://www.caixabank.es/particular/domiciliar-nomina.html",
      offerText:
        "Entre 185,19€ y 308,64€ por domiciliar n\u00f3mina + ofertas TV/smartphone/cup\u00f3n (200€-400€). Requiere n\u00f3mina 900/1.500/2.500€, 3 recibos y 3 pagos trimestrales.",
    },
    {
      id: "es-nomina-017",
      bank: "Imagin",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl: "https://www.imagin.com/",
      offerText: "308,64€ o 185,19€ por domiciliar n\u00f3mina por primera vez. 300€ para n\u00f3minas >=1500€, 185,19€ para 900-1500€.",
    },
    {
      id: "es-nomina-018",
      bank: "Pibank",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl: "https://www.pichincha.com/",
      offerText:
        "0,00% primeros 5k€ y 2,27% por importe superior a 5k€. Requiere n\u00f3mina/pensi\u00f3n/ingresos recurrentes >=1.000€/mes.",
    },
    {
      id: "es-nomina-019",
      bank: "Banca March",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl: "https://avantio.bancamarch.es/es/cuentas-y-depositos/cuenta-online/",
      offerText: "Cuenta remunerada 2,02% hasta 60k€ con n\u00f3mina >1.500€, 1,00% hasta 30k€ si hay saldo o inversiones >=10k€.",
      evidenceNotes: "Regla repetida en secci\u00f3n de cuentas remuneradas condicionales.",
    },
    {
      id: "es-nomina-020",
      bank: "Openbank",
      productKind: "cuenta_nomina",
      section: "mejores_cuentas_nomina",
      conditionProfile: "mejora_nomina",
      hasSpanishIban: true,
      sourceUrl: "https://www.openbank.es/ofertas-bancarias/hasta-360-euros-trae-tu-nomina",
      offerText:
        "360€ por domiciliar n\u00f3mina/pensi\u00f3n/SEPE + devoluci\u00f3n 0,5% recibos luz/gas/tel\u00e9fono/m\u00f3vil/internet.",
    },

    // Entidades sin sucursal en Espa\u00f1a - Cuentas remuneradas
    {
      id: "global-cuenta-001",
      bank: "Bank Norwegian",
      productKind: "cuenta_remunerada",
      section: "remuneradas_otro_pa\u00eds_sin_sucursal",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: false,
      sourceUrl: "https://www.banknorwegian.es/cuenta-de-ahorro/",
      offerText:
        "Opción 1: 2,30% con 6 transferencias al a\u00f1o, luego 0,5% del importe transferido.",
    },
    {
      id: "global-cuenta-002",
      bank: "Bank Norwegian",
      productKind: "cuenta_remunerada",
      section: "remuneradas_otro_pa\u00eds_sin_sucursal",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: false,
      sourceUrl: "https://www.banknorwegian.es/cuenta-de-ahorro/",
      offerText: "Opción 2: 2,05% hasta 1M€.",
    },
    {
      id: "global-cuenta-003",
      bank: "Nordax Bank AB / Banca CF+",
      productKind: "cuenta_remunerada",
      section: "remuneradas_otro_pa\u00eds_sin_sucursal",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: false,
      sourceUrl: "https://www.raisin.es/",
      offerText: "Cuenta remunerada 2,07% via Raisin.",
    },

    // Entidades sin sucursal en Espa\u00f1a - Dep\u00f3sitos
    {
      id: "global-dep-001",
      bank: "ProCredit Bank SA",
      productKind: "deposito",
      section: "depositos_otro_pa\u00eds_sin_sucursal",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: false,
      sourceUrl: "https://www.raisin.es/",
      offerText: "Dep\u00f3sito no cancelable 6 meses 2,44% (via Raisin).",
    },
    {
      id: "global-dep-002",
      bank: "BluOr Bank AS",
      productKind: "deposito",
      section: "depositos_otro_pa\u00eds_sin_sucursal",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: false,
      sourceUrl: "https://www.raisin.es/",
      offerText: "Dep\u00f3sito no cancelable 9 meses 2,73% (via Raisin).",
    },
    {
      id: "global-dep-003",
      bank: "Haitong Bank SA Sucursal en Espa\u00f1a",
      productKind: "deposito",
      section: "depositos_otro_pa\u00eds_sin_sucursal",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: false,
      sourceUrl: "https://www.raisin.es/",
      offerText: "Dep\u00f3sito no cancelable 1 a\u00f1o 2,96% (via Raisin).",
    },
    {
      id: "global-dep-004",
      bank: "Fjord Bank",
      productKind: "deposito",
      section: "depositos_otro_pa\u00eds_sin_sucursal",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: false,
      sourceUrl: "https://www.raisin.es/",
      offerText: "Dep\u00f3sito no cancelable 2 a\u00f1os 2,96% (via Raisin).",
    },
    {
      id: "global-dep-005",
      bank: "Fjord Bank / Haitong Bank SA Sucursal en Espa\u00f1a",
      productKind: "deposito",
      section: "depositos_otro_pa\u00eds_sin_sucursal",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: false,
      sourceUrl: "https://www.raisin.es/",
      offerText: "Dep\u00f3sito no cancelable 3 a\u00f1os 2,91% (via Raisin).",
    },
    {
      id: "global-dep-006",
      bank: "BankB",
      productKind: "deposito",
      section: "depositos_otro_pa\u00eds_sin_sucursal",
      conditionProfile: "sin_condiciones",
      hasSpanishIban: false,
      sourceUrl: "https://www.raisin.es/",
      offerText: "Dep\u00f3sito no cancelable 5 a\u00f1os 3,00% (via Raisin).",
    },
  ] as const satisfies readonly MarketOffer[],
} as const;

export function getMarketOffers(): readonly MarketOffer[] {
  return MARKET_SNAPSHOT_2026_06_12.offers;
}

export function getScrapeTargets(): readonly MarketScrapeTarget[] {
  const acc = new Map<string, MarketScrapeTarget>();
  for (const offer of MARKET_SNAPSHOT_2026_06_12.offers) {
    const key = `${offer.bank}|${offer.sourceUrl}|${offer.productKind}`;
    if (!acc.has(key)) {
      acc.set(key, {
        bankName: offer.bank,
        productKind: offer.productKind,
        sourceUrl: offer.sourceUrl,
        hasSpanishIban: offer.hasSpanishIban,
        offerCount: 1,
        sectionSummary: offer.section,
      });
      continue;
    }
    const existing = acc.get(key);
    if (existing) {
      existing.offerCount += 1;
      if (!existing.sectionSummary.includes(offer.section)) {
        existing.sectionSummary = `${existing.sectionSummary},${offer.section}`;
      }
    }
  }
  return Array.from(acc.values());
}
