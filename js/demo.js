// =====================================================================
// demo.js — datos de ejemplo para probar la app sin Supabase.
// Se activa con DEMO:true en config.js. Todo queda en este navegador.
// =====================================================================
const hoy = new Date();
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dias = n => { const d = new Date(hoy); d.setDate(d.getDate() + n); return iso(d); };
/** Dia `k` del mes corriente, sin pasarse de hoy: asi la demo siempre muestra numeros. */
const esteMes = k => {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), Math.min(k, hoy.getDate()));
  return iso(d);
};

const CAT = {
  super: 'c1', serv: 'c2', cole: 'c3', comb: 'c4', gastro: 'c5', salud: 'c6',
  hogar: 'c7', entre: 'c8', sueldo: 'c9'
};

export const DEMO = {
  accounts: [
    { id: 'a1', nombre: 'Visa Galicia', tipo: 'credito', banco: 'Galicia', marca: 'visa',
      ultimos4: '4821', moneda: 'ARS', cierre_dia: 20, vencimiento_dia: 30, limite: 2400000, activo: true },
    { id: 'a2', nombre: 'Mastercard Galicia', tipo: 'credito', banco: 'Galicia', marca: 'mastercard',
      ultimos4: '7310', moneda: 'ARS', cierre_dia: 8, vencimiento_dia: 18, limite: 900000, activo: true },
    { id: 'a3', nombre: 'Mercado Pago', tipo: 'billetera', moneda: 'ARS', activo: true },
    { id: 'a4', nombre: 'Efectivo', tipo: 'efectivo', moneda: 'ARS', activo: true }
  ],
  categories: [
    { id: CAT.super, nombre: 'Supermercado', tipo: 'gasto', color: '#2fa96b', presupuesto: 450000 },
    { id: CAT.serv, nombre: 'Servicios', tipo: 'gasto', color: '#e0a83b', presupuesto: 180000 },
    { id: CAT.cole, nombre: 'Colegio / Educacion', tipo: 'gasto', color: '#7a5cf0' },
    { id: CAT.comb, nombre: 'Combustible / Transporte', tipo: 'gasto', color: '#2f6fed', presupuesto: 120000 },
    { id: CAT.gastro, nombre: 'Gastronomia', tipo: 'gasto', color: '#e0603b', presupuesto: 150000 },
    { id: CAT.salud, nombre: 'Salud', tipo: 'gasto', color: '#3bb6e0' },
    { id: CAT.hogar, nombre: 'Hogar', tipo: 'gasto', color: '#9a6b4f' },
    { id: CAT.entre, nombre: 'Entretenimiento', tipo: 'gasto', color: '#d13b8a', presupuesto: 60000 },
    { id: CAT.sueldo, nombre: 'Sueldo', tipo: 'ingreso', color: '#2fa96b' }
  ],
  transactions: [
    { id: 't1', fecha: esteMes(28), descripcion: 'Coto', comercio: 'Coto Caballito', monto: 86400, moneda: 'ARS',
      tipo: 'gasto', account_id: 'a1', category_id: CAT.super, cuotas: 1, reintegro: 17280,
      fuente: 'gmail', revisado: false, confianza: 90, created_at: esteMes(28) },
    { id: 't2', fecha: esteMes(26), descripcion: 'Shell', comercio: 'Shell Rivadavia', monto: 42000, moneda: 'ARS',
      tipo: 'gasto', account_id: 'a1', category_id: CAT.comb, cuotas: 1, fuente: 'gmail', revisado: false,
      confianza: 88, created_at: esteMes(26) },
    { id: 't3', fecha: esteMes(22), descripcion: 'Frávega', comercio: 'Frávega', monto: 720000, moneda: 'ARS',
      tipo: 'gasto', account_id: 'a1', category_id: CAT.hogar, cuotas: 12, fuente: 'manual', revisado: true,
      created_at: esteMes(22) },
    { id: 't4', fecha: esteMes(19), descripcion: 'Farmacity', comercio: 'Farmacity', monto: 31500, moneda: 'ARS',
      tipo: 'gasto', account_id: 'a2', category_id: CAT.salud, cuotas: 1, fuente: 'gmail', revisado: true,
      created_at: esteMes(19) },
    { id: 't5', fecha: esteMes(15), descripcion: 'Netflix', comercio: 'Netflix', monto: 12.99, moneda: 'USD',
      tipo: 'gasto', account_id: 'a1', category_id: CAT.entre, cuotas: 1, fuente: 'gmail', revisado: true,
      created_at: esteMes(15) },
    { id: 't6', fecha: esteMes(24), descripcion: 'Rappi', comercio: 'Rappi', monto: 28900, moneda: 'ARS',
      tipo: 'gasto', account_id: 'a3', category_id: CAT.gastro, cuotas: 1, fuente: 'mercadopago',
      revisado: true, created_at: esteMes(24) },
    { id: 't7', fecha: esteMes(12), descripcion: 'Carrefour', comercio: 'Carrefour Express', monto: 43800,
      moneda: 'ARS', tipo: 'gasto', account_id: 'a2', category_id: CAT.super, cuotas: 1, fuente: 'gmail',
      revisado: true, created_at: esteMes(12) },
    { id: 't8', fecha: esteMes(5), descripcion: 'Sueldo', comercio: 'Sueldo', monto: 2350000, moneda: 'ARS',
      tipo: 'ingreso', account_id: null, category_id: CAT.sueldo, cuotas: 1, fuente: 'manual',
      revisado: true, created_at: esteMes(5) },
    { id: 't9', fecha: esteMes(27), descripcion: 'Kiosco', comercio: 'Kiosco', monto: 4500, moneda: 'ARS',
      tipo: 'gasto', account_id: 'a4', category_id: CAT.gastro, cuotas: 1, fuente: 'manual',
      revisado: true, created_at: esteMes(27) },
    { id: 't10', fecha: dias(-40), descripcion: 'Dexter', comercio: 'Dexter', monto: 189000, moneda: 'ARS',
      tipo: 'gasto', account_id: 'a1', category_id: CAT.hogar, cuotas: 6, fuente: 'manual',
      revisado: true, created_at: dias(-40) }
  ],
  recurrings: [
    { id: 'r1', nombre: 'Colegio', monto_estimado: 340000, moneda: 'ARS', dia_vencimiento: 10,
      category_id: CAT.cole, variable: false, activo: true },
    { id: 'r2', nombre: 'Luz (Edesur)', monto_estimado: 78000, moneda: 'ARS', dia_vencimiento: 18,
      category_id: CAT.serv, variable: true, activo: true },
    { id: 'r3', nombre: 'Gas (Metrogas)', monto_estimado: 45000, moneda: 'ARS', dia_vencimiento: 22,
      category_id: CAT.serv, variable: true, activo: true },
    { id: 'r4', nombre: 'Internet + cable', monto_estimado: 62000, moneda: 'ARS', dia_vencimiento: 5,
      category_id: CAT.serv, variable: false, activo: true },
    { id: 'r5', nombre: 'Prepaga', monto_estimado: 290000, moneda: 'ARS', dia_vencimiento: 12,
      category_id: CAT.salud, variable: false, activo: true }
  ],
  recurring_payments: [
    { id: 'p1', recurring_id: 'r4', periodo: iso(hoy).slice(0, 7), monto: 62000, pagado_at: dias(-2) }
  ],
  budgets: [],
  promos: [
    { id: 'pr1', titulo: '20% de reintegro en supermercados', comercio: 'Coto', rubro: 'supermercado',
      emisor: 'galicia', tipo: 'reintegro', valor: 20, tope: 20000, tope_periodo: 'semanal',
      dias: [3], medio_pago: 'Tarjeta Galicia Visa', canal: 'presencial', activa: true, favorita: true,
      marcas: ['Coto'], osm_filtro: 'shop=supermarket' },
    { id: 'pr2', titulo: '25% de ahorro en Rappi los sábados', comercio: 'Rappi', rubro: 'gastronomia',
      emisor: 'galicia', tipo: 'descuento', valor: 25, tope: 12000, dias: [6],
      medio_pago: 'Tarjeta de crédito Galicia Visa', canal: 'online', activa: true, marcas: [] },
    { id: 'pr3', titulo: '20% de reintegro en farmacias online', comercio: 'Farmacias adheridas',
      rubro: 'farmacia', emisor: 'modo', tipo: 'reintegro', valor: 20, tope: 16000, tope_periodo: 'semanal',
      dias: [], medio_pago: 'MODO con tarjeta de crédito', canal: 'online', activa: true,
      vigencia_hasta: '2026-09-29', marcas: [], osm_filtro: 'amenity=pharmacy' },
    { id: 'pr4', titulo: '15% en farmacias del barrio', comercio: 'Farmacity', rubro: 'farmacia',
      emisor: 'galicia', tipo: 'reintegro', valor: 15, tope: 10000, dias: [1, 2, 3, 4, 5],
      medio_pago: 'Tarjeta Galicia', canal: 'presencial', activa: true,
      marcas: ['Farmacity', 'Simplicity'], osm_filtro: 'amenity=pharmacy' },
    { id: 'pr5', titulo: '20% de reintegro en combustible', comercio: 'YPF', rubro: 'combustible',
      emisor: 'modo', tipo: 'reintegro', valor: 20, tope: 15000, dias: [1, 2],
      medio_pago: 'MODO', canal: 'presencial', activa: true, marcas: ['YPF'], osm_filtro: 'amenity=fuel' },
    { id: 'pr6', titulo: '12 cuotas sin interés en electro', comercio: 'Frávega', rubro: 'electro',
      emisor: 'galicia', tipo: 'cuotas', valor: 12, dias: [], medio_pago: 'Tarjeta Galicia',
      canal: 'ambos', activa: true, marcas: ['Frávega'], osm_filtro: 'shop=electronics' }
  ],
  promo_sucursales: [], reglas: [], integrations: [], notificaciones: [],
  settings: { usd_ref: 0, alert_pct: 80 }
};
