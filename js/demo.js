// =====================================================================
// demo.js — datos de ejemplo para probar la app sin backend.
// Las cifras copian la forma de un caso real: tres tarjetas con dos ciclos
// distintos, cuatro lugares donde vive la plata, sueldo en banco mas sobre,
// y dolares aparte. Los nombres y numeros son inventados.
// =====================================================================

const id = n => `demo-${n}`;

export const DEMO = {
  accounts: [
    { id: id('gal'), nombre: 'Galicia', tipo: 'cuenta', banco: 'Galicia', moneda: 'ARS',
      color: '#1B3A6B', orden: 1, activo: true, saldo_inicial: 0, saldo_al: '2026-09-01' },
    { id: id('mpw'), nombre: 'Mercado Pago', tipo: 'billetera', moneda: 'ARS',
      color: '#00A3E0', orden: 2, activo: true, saldo_inicial: 0, saldo_al: '2026-09-01' },
    { id: id('pp'), nombre: 'Personal Pay', tipo: 'billetera', moneda: 'ARS',
      color: '#7B2FF7', orden: 3, activo: true, saldo_inicial: 32181.28, saldo_al: '2026-09-01' },
    { id: id('efe'), nombre: 'Efectivo', tipo: 'efectivo', moneda: 'ARS',
      color: '#4B7A5B', orden: 4, activo: true, saldo_inicial: 0, saldo_al: '2026-09-01' },

    { id: id('visa'), nombre: 'Galicia Visa', tipo: 'credito', banco: 'Galicia', marca: 'visa',
      ultimos4: '9817', moneda: 'ARS', limite: 7000000, cierre_dia: 27, vencimiento_dia: 4,
      color: '#2A2F52', orden: 5, activo: true,
      ciclos: [{ cierre: '2026-07-30', vence: '2026-08-07' },
               { cierre: '2026-08-27', vence: '2026-09-04' },
               { cierre: '2026-10-01', vence: '2026-10-09' }] },
    { id: id('mc'), nombre: 'Galicia Mastercard', tipo: 'credito', banco: 'Galicia', marca: 'mastercard',
      ultimos4: '6513', moneda: 'ARS', limite: 7000000, cierre_dia: 27, vencimiento_dia: 4,
      color: '#0F5C63', orden: 6, activo: true,
      ciclos: [{ cierre: '2026-07-30', vence: '2026-08-07' },
               { cierre: '2026-08-27', vence: '2026-09-04' },
               { cierre: '2026-10-01', vence: '2026-10-09' }] },
    { id: id('mpc'), nombre: 'Mercado Pago crédito', tipo: 'credito', marca: 'mastercard',
      ultimos4: '4402', moneda: 'ARS', limite: 2555000, cierre_dia: 5, vencimiento_dia: 10,
      color: '#00539C', orden: 7, activo: true,
      ciclos: [{ cierre: '2026-09-05', vence: '2026-09-10' },
               { cierre: '2026-10-05', vence: '2026-10-10' }] },

    { id: id('wb'), nombre: 'Wallbit', tipo: 'cuenta', moneda: 'USD',
      color: '#25382B', orden: 8, activo: true, saldo_inicial: 4840, saldo_al: '2026-09-01' },
    { id: id('usd'), nombre: 'Dólares billete', tipo: 'efectivo', moneda: 'USD',
      color: '#3D5A45', orden: 9, activo: true, saldo_inicial: 1184.45, saldo_al: '2026-09-01' }
  ],

  categories: [
    { id: id('c1'), nombre: 'Supermercado', tipo: 'gasto', color: '#0B7F5A', orden: 1 },
    { id: id('c2'), nombre: 'Gastronomía', tipo: 'gasto', color: '#9A5D00', orden: 2 },
    { id: id('c3'), nombre: 'Combustible', tipo: 'gasto', color: '#0D5470', orden: 3 },
    { id: id('c4'), nombre: 'Servicios', tipo: 'gasto', color: '#5C6272', orden: 4 },
    { id: id('c5'), nombre: 'Salud', tipo: 'gasto', color: '#C1293D', orden: 5 },
    { id: id('c6'), nombre: 'Colegio', tipo: 'gasto', color: '#4B3A8F', orden: 6 },
    { id: id('c7'), nombre: 'Suscripciones', tipo: 'gasto', color: '#2F6F8F', orden: 7 },
    { id: id('c8'), nombre: 'Hogar', tipo: 'gasto', color: '#8A6B4F', orden: 8 },
    { id: id('c9'), nombre: 'Transporte', tipo: 'gasto', color: '#6B7280', orden: 9 },
    { id: id('c10'), nombre: 'Otros', tipo: 'gasto', color: '#868C9B', orden: 10 },
    { id: id('i1'), nombre: 'Sueldo', tipo: 'ingreso', color: '#0B7F5A', orden: 1 },
    { id: id('i2'), nombre: 'Extras', tipo: 'ingreso', color: '#0D5470', orden: 2 }
  ],

  transactions: [
    // ---- el dia que entro el sueldo: ingreso, transferencias y servicios
    { id: id('t1'), fecha: '2026-09-01', descripcion: 'Acreditamiento de haberes', comercio: 'Sueldo',
      monto: 2026665.38, moneda: 'ARS', tipo: 'ingreso', account_id: id('gal'),
      category_id: id('i1'), cuotas: 1, fuente: 'banco', revisado: true },
    { id: id('t2'), fecha: '2026-09-01', descripcion: 'Sueldo en sobre', comercio: 'Sueldo',
      monto: 1532000, moneda: 'ARS', tipo: 'ingreso', account_id: id('efe'),
      category_id: id('i1'), cuotas: 1, fuente: 'manual', revisado: true },
    { id: id('t3'), fecha: '2026-09-01', descripcion: 'A Mercado Pago', monto: 652800, moneda: 'ARS',
      tipo: 'transferencia', account_id: id('gal'), destino_account_id: id('mpw'),
      cuotas: 1, fuente: 'banco', revisado: true },
    { id: id('t4'), fecha: '2026-09-01', descripcion: 'A Personal Pay', monto: 62780, moneda: 'ARS',
      tipo: 'transferencia', account_id: id('gal'), destino_account_id: id('pp'),
      cuotas: 1, fuente: 'banco', revisado: true },
    { id: id('t5'), fecha: '2026-09-01', descripcion: 'Compra de dólares', monto: 23100, moneda: 'ARS',
      tipo: 'transferencia', account_id: id('gal'), destino_account_id: id('usd'),
      monto_destino: 15.55, moneda_destino: 'USD', cuotas: 1, fuente: 'banco', revisado: true },
    // El alquiler se paga en dólares: gastar en dólares también es gastar.
    { id: id('t5b'), fecha: '2026-09-02', descripcion: 'Alquiler', comercio: 'Alquiler',
      monto: 900, moneda: 'USD', tipo: 'gasto', account_id: id('usd'), category_id: id('c8'),
      cuotas: 1, fuente: 'manual', revisado: true },
    { id: id('t6'), fecha: '2026-09-01', descripcion: 'Edesur', comercio: 'Edesur', monto: 20581.06,
      moneda: 'ARS', tipo: 'gasto', account_id: id('gal'), category_id: id('c4'),
      cuotas: 1, fuente: 'banco', revisado: true },
    { id: id('t7'), fecha: '2026-09-01', descripcion: 'Metrogas', comercio: 'Metrogas', monto: 37784,
      moneda: 'ARS', tipo: 'gasto', account_id: id('gal'), category_id: id('c4'),
      cuotas: 1, fuente: 'banco', revisado: true },
    { id: id('t8'), fecha: '2026-09-01', descripcion: 'Aysa', comercio: 'Aysa', monto: 26087.98,
      moneda: 'ARS', tipo: 'gasto', account_id: id('gal'), category_id: id('c4'),
      cuotas: 1, fuente: 'banco', revisado: true },

    // ---- consumos del resumen de la Visa que cerro el 27/08
    { id: id('t9'), fecha: '2026-06-06', descripcion: 'Naked', comercio: 'Naked', monto: 228783,
      moneda: 'ARS', tipo: 'gasto', account_id: id('visa'), category_id: id('c10'),
      cuotas: 3, fuente: 'resumen', revisado: true },
    { id: id('t10'), fecha: '2026-08-04', descripcion: 'Colegio', comercio: 'Colegio Juan Bautista',
      monto: 548589.62, moneda: 'ARS', tipo: 'gasto', account_id: id('visa'),
      category_id: id('c6'), cuotas: 1, fuente: 'resumen', revisado: true },
    { id: id('t11'), fecha: '2026-08-04', descripcion: 'OSDE', comercio: 'OSDE', monto: 302006.09,
      moneda: 'ARS', tipo: 'gasto', account_id: id('visa'), category_id: id('c5'),
      cuotas: 1, fuente: 'resumen', revisado: true },
    { id: id('t12'), fecha: '2026-08-22', descripcion: 'Juguetería', comercio: 'Somos Los Juguetes',
      monto: 37400.04, moneda: 'ARS', tipo: 'gasto', account_id: id('visa'),
      category_id: id('c10'), cuotas: 3, fuente: 'resumen', revisado: true },
    { id: id('t13'), fecha: '2026-08-04', descripcion: 'Xbox Game Pass', comercio: 'Microsoft',
      monto: 12.85, moneda: 'USD', tipo: 'gasto', account_id: id('visa'),
      category_id: id('c7'), cuotas: 1, fuente: 'resumen', revisado: true },

    // ---- consumos del resumen de la Mastercard
    { id: id('t14'), fecha: '2026-08-02', descripcion: 'Old Bridge', comercio: 'Old Bridge',
      monto: 78800.04, moneda: 'ARS', tipo: 'gasto', account_id: id('mc'),
      category_id: id('c8'), cuotas: 3, fuente: 'resumen', revisado: true },
    { id: id('t15'), fecha: '2026-08-10', descripcion: 'Melo', comercio: 'Melo Da Costa',
      monto: 186000, moneda: 'ARS', tipo: 'gasto', account_id: id('mc'),
      category_id: id('c8'), cuotas: 3, fuente: 'resumen', revisado: true },

    // ---- lo que entro solo y esta sin revisar
    { id: id('r1'), fecha: '2026-09-01', descripcion: 'COTO CICSA', comercio: 'Coto', monto: 48200,
      moneda: 'ARS', tipo: 'gasto', account_id: id('visa'), category_id: id('c1'),
      cuotas: 1, fuente: 'gmail', revisado: false, confianza: 92 },
    { id: id('r2'), fecha: '2026-09-01', descripcion: 'YPF FULL', comercio: 'YPF', monto: 52000,
      moneda: 'ARS', tipo: 'gasto', account_id: id('mc'), category_id: id('c3'),
      cuotas: 1, fuente: 'gmail', revisado: false, confianza: 95 },
    { id: id('r3'), fecha: '2026-09-01', descripcion: 'MERPAGO*SPOTIFY', comercio: 'Spotify',
      monto: 8999, moneda: 'ARS', tipo: 'gasto', account_id: id('mpc'), category_id: id('c7'),
      cuotas: 1, fuente: 'gmail', revisado: false, confianza: 88 },
    { id: id('r4'), fecha: '2026-08-31', descripcion: 'FRAVEGA SACIEI', comercio: 'Frávega',
      monto: 1546800, moneda: 'ARS', tipo: 'gasto', account_id: id('visa'), category_id: id('c8'),
      cuotas: 12, fuente: 'gmail', revisado: false, confianza: 74 },
    { id: id('r5'), fecha: '2026-08-31', descripcion: 'OPENAI *CHATGPT', comercio: 'OpenAI',
      monto: 20, moneda: 'USD', tipo: 'gasto', account_id: id('wb'), category_id: id('c7'),
      cuotas: 1, fuente: 'gmail', revisado: false, confianza: 90 },
    { id: id('r6'), fecha: '2026-08-30', descripcion: 'PEDIDOSYA', comercio: 'PedidosYa',
      monto: 22059, moneda: 'ARS', tipo: 'gasto', account_id: id('mc'), category_id: id('c2'),
      cuotas: 1, fuente: 'gmail', revisado: false, confianza: 91 },

    // gastos hechos desde las billeteras despues de recibir la transferencia
    { id: id('w1'), fecha: '2026-09-01', descripcion: 'Supermercado', comercio: 'Coto',
      monto: 154136.23, moneda: 'ARS', tipo: 'gasto', account_id: id('mpw'),
      category_id: id('c1'), cuotas: 1, fuente: 'manual', revisado: true },
    { id: id('w2'), fecha: '2026-09-01', descripcion: 'Nafta', comercio: 'YPF',
      monto: 100000, moneda: 'ARS', tipo: 'gasto', account_id: id('mpw'),
      category_id: id('c3'), cuotas: 1, fuente: 'manual', revisado: true }
  ],

  recurrings: [
    { id: id('rc1'), nombre: 'Colegio', monto_estimado: 548590, moneda: 'ARS', dia_vencimiento: 10,
      category_id: id('c6'), account_id: id('visa'), variable: false, activo: true, orden: 1 },
    { id: id('rc2'), nombre: 'OSDE', monto_estimado: 302006, moneda: 'ARS', dia_vencimiento: 15,
      category_id: id('c5'), account_id: id('visa'), variable: false, activo: true, orden: 2 },
    { id: id('rc3'), nombre: 'Edesur', monto_estimado: 20581, moneda: 'ARS', dia_vencimiento: 1,
      category_id: id('c4'), account_id: id('gal'), variable: true, activo: true, orden: 3 },
    { id: id('rc4'), nombre: 'Metrogas', monto_estimado: 37784, moneda: 'ARS', dia_vencimiento: 1,
      category_id: id('c4'), account_id: id('gal'), variable: true, activo: true, orden: 4 },
    { id: id('rc5'), nombre: 'Aysa', monto_estimado: 26088, moneda: 'ARS', dia_vencimiento: 1,
      category_id: id('c4'), account_id: id('gal'), variable: true, activo: true, orden: 5 },
    // Spotify cae solo en la tarjeta; el colegio y OSDE se pagan a mano, y
    // según el mes salen por transferencia o con la tarjeta.
    { id: id('rc6'), nombre: 'Spotify', monto_estimado: 8999, moneda: 'ARS', dia_vencimiento: 12,
      category_id: id('c7'), account_id: id('mpc'), variable: false, activo: true,
      debito_automatico: true, orden: 6 }
  ],

  recurring_payments: [
    { id: id('rp1'), recurring_id: id('rc3'), periodo: '2026-09', monto: 20581.06,
      pagado_at: '2026-09-01T12:00:00Z', transaction_id: id('t6') },
    { id: id('rp2'), recurring_id: id('rc4'), periodo: '2026-09', monto: 37784,
      pagado_at: '2026-09-01T12:00:00Z', transaction_id: id('t7') },
    { id: id('rp3'), recurring_id: id('rc5'), periodo: '2026-09', monto: 26087.98,
      pagado_at: '2026-09-01T12:00:00Z', transaction_id: id('t8') }
  ],

  budgets: [
    { id: id('b1'), periodo: '2026-09', category_id: id('c1'), monto: 260000, moneda: 'ARS' },
    { id: id('b2'), periodo: '2026-09', category_id: id('c2'), monto: 180000, moneda: 'ARS' },
    { id: id('b3'), periodo: '2026-09', category_id: id('c3'), monto: 140000, moneda: 'ARS' },
    { id: id('b4'), periodo: '2026-09', category_id: id('c7'), monto: 40000, moneda: 'ARS' },
    { id: id('b5'), periodo: '2026-09', category_id: id('c10'), monto: 120000, moneda: 'ARS' }
  ],

  promos: [
    { id: id('p1'), titulo: 'Coto', comercio: 'Coto', rubro: 'supermercado', emisor: 'galicia',
      tipo: 'reintegro', valor: 25, tope: 20000, tope_periodo: 'mensual', dias: [3, 6],
      medio_pago: 'Galicia Visa', canal: 'presencial', activa: true, favorita: true,
      recordar: true, osm_filtro: 'shop=supermarket', marcas: ['Coto'] },
    { id: id('p2'), titulo: 'Shell', comercio: 'Shell', rubro: 'combustible', emisor: 'modo',
      tipo: 'reintegro', valor: 15, tope: 8000, tope_periodo: 'mensual', dias: [],
      medio_pago: 'MODO', canal: 'presencial', activa: true, favorita: false,
      osm_filtro: 'amenity=fuel', marcas: ['Shell'] },
    { id: id('p3'), titulo: 'Farmacity', comercio: 'Farmacity', rubro: 'salud', emisor: 'modo',
      tipo: 'reintegro', valor: 20, tope: 15000, tope_periodo: 'mensual', dias: [4],
      medio_pago: 'MODO', canal: 'presencial', activa: true, favorita: false,
      osm_filtro: 'amenity=pharmacy', marcas: ['Farmacity'] },
    // Una de una vez al mes, como la de combustible de Galicia: cae un solo
    // día y por eso está marcada para que aparezca en Hoy desde antes.
    { id: id('p4'), titulo: 'YPF 25%', comercio: 'YPF', rubro: 'combustible', emisor: 'galicia',
      tipo: 'descuento', valor: 25, tope: 20000, tope_periodo: 'mensual', dias: [4],
      vigencia_desde: '2026-09-10', vigencia_hasta: '2026-09-10',
      medio_pago: 'MODO, Mastercard Platinum', canal: 'presencial', activa: true,
      favorita: false, recordar: true, notas: 'Cuenta Sueldo · Jueves 10/09',
      osm_filtro: 'amenity=fuel', marcas: ['YPF'] }
  ],

  promo_usos: [
    { id: id('pu1'), promo_id: id('p1'), periodo: '2026-09', usado: 12400 }
  ],

  recibos: [
    { id: id('s1'), periodo: '2026-05', basico: 1161167, remunerativo: 2126368.23,
      no_remunerativo: 144295.56, deducciones: 418249.21, neto: 1852414.58,
      pagado_el: '2026-06-01', sobre: 1400000, conceptos: ['SUELDO MENSUAL', 'ADIC. EMPRESA'] },
    { id: id('s2'), periodo: '2026-06', basico: 1179445, remunerativo: 2164862.50,
      no_remunerativo: 144295.56, deducciones: 425755.59, neto: 1883402.47,
      pagado_el: '2026-07-01', sobre: 1440000, conceptos: ['SUELDO MENSUAL', 'DIFERENCIA SAC'] },
    { id: id('s3'), periodo: '2026-07', basico: 1204135, remunerativo: 2429014.35,
      no_remunerativo: 184121.81, deducciones: 477635.84, neto: 2135500.32,
      pagado_el: '2026-08-03', sobre: 1490000, conceptos: ['SUELDO MENSUAL', 'VACACIONES'] },
    { id: id('s4'), periodo: '2026-08', basico: 1228824, remunerativo: 2301786.41,
      no_remunerativo: 172849.90, deducciones: 447970.93, neto: 2026665.38,
      pagado_el: '2026-09-01', sobre: 1532000, conceptos: ['SUELDO MENSUAL', 'VACACIONES'] }
  ],

  paritarias: [
    { id: id('par1'), nombre: 'Acuerdo julio 2026', convenio: 'CCT 130/75',
      base: '2026-06', acumulativo: false, revision_en: '2026-10',
      tramos: [{ periodo: '2026-07', pct: 1.9 },
               { periodo: '2026-08', pct: 1.9 },
               { periodo: '2026-09', pct: 1.9 }],
      url: 'https://www.faecys.org.ar/circular-acuerdo-julio-2026/', activo: true }
  ],

  sumas_nr: [
    { id: id('sn1'), concepto: 'Suma fija no remunerativa', monto: 100000, desde: '2026-01', activo: true },
    { id: id('sn2'), concepto: 'Recomposición', monto: 20000, desde: '2026-01', activo: true },
    { id: id('sn3'), concepto: 'Bono extraordinario', monto: 25000,
      desde: '2026-07', hasta: '2026-08', paritaria_id: id('par1'), activo: true }
  ],

  reglas: [
    { id: id('g1'), patron: 'coto', category_id: id('c1'), prioridad: 10, veces_usada: 14 },
    { id: id('g2'), patron: 'ypf|shell|axion', category_id: id('c3'), prioridad: 10, veces_usada: 9 },
    { id: id('g3'), patron: 'pedidosya|mostaza|mcdonald', category_id: id('c2'), prioridad: 8, veces_usada: 22 }
  ],

  notificaciones: [
    { id: id('n1'), tipo: 'carga_auto', titulo: '6 movimientos para revisar',
      cuerpo: 'Entraron solos desde Gmail', leida: false, created_at: '2026-09-01T14:02:00Z' }
  ],

  integrations: [],
  promo_sucursales: [],

  settings: {
    usd_ref: 1485, alert_pct: 80, dia_cobro: 1, sobre_estimado: 1532000,
    sumas_fijas_nr: 120000, ocultar_montos: false
  }
};
