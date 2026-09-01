// =====================================================================
// finance.js — logica pura de calculo. Sin DOM, sin red. Testeable.
// =====================================================================

export const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
  'agosto','septiembre','octubre','noviembre','diciembre'];

export const hoy = () => new Date(new Date().toDateString());

/** 'YYYY-MM' de una fecha */
export function periodo(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function periodoLabel(p) {
  const [y, m] = p.split('-').map(Number);
  return `${MESES[m - 1]} ${y}`;
}
/** suma n meses a un periodo 'YYYY-MM' */
export function periodoSuma(p, n) {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return periodo(d);
}
export function parseFecha(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function fechaISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const ultimoDia = (y, m) => new Date(y, m + 1, 0).getDate();
/** dia del mes acotado a la ultima fecha valida (31 en febrero -> 28/29) */
function diaSeguro(y, m, dia) {
  return new Date(y, m, Math.min(dia, ultimoDia(y, m)));
}

// ---------------------------------------------------------------------
// CICLO DE LA TARJETA
// ---------------------------------------------------------------------

/**
 * Fecha de cierre del resumen al que entra una compra hecha el dia `fecha`.
 * Si la compra cae el mismo dia del cierre o despues, va al resumen siguiente.
 */
export function cierreDeCompra(fecha, cierreDia) {
  const y = fecha.getFullYear(), m = fecha.getMonth();
  let cierre = diaSeguro(y, m, cierreDia);
  if (fecha >= cierre) cierre = diaSeguro(y, m + 1, cierreDia);
  return cierre;
}

/** Vencimiento del resumen que cierra en `cierre`: primer dia `vencDia` posterior al cierre. */
export function vencimientoDeCierre(cierre, vencDia) {
  const y = cierre.getFullYear(), m = cierre.getMonth();
  let v = diaSeguro(y, m, vencDia);
  if (v <= cierre) v = diaSeguro(y, m + 1, vencDia);
  return v;
}

/** Proximo cierre y vencimiento a partir de una fecha de referencia. */
export function proximoCiclo(tarjeta, ref = hoy()) {
  const cierre = cierreDeCompra(ref, tarjeta.cierre_dia || 1);
  const vence = vencimientoDeCierre(cierre, tarjeta.vencimiento_dia || 10);
  return { cierre, vence, diasACierre: dias(ref, cierre), diasAVencimiento: dias(ref, vence) };
}
export const dias = (a, b) => Math.round((b - a) / 86400000);

// ---------------------------------------------------------------------
// CUOTAS
// ---------------------------------------------------------------------

/**
 * Expande una compra en su cronograma de cuotas.
 * Devuelve [{ nro, total, monto, cierre, vence, periodoVenc, pendiente }]
 */
export function cronograma(tx, tarjeta, ref = hoy()) {
  const n = Math.max(1, tx.cuotas || 1);
  const monto = Number(tx.monto) / n;
  const fecha = parseFecha(tx.fecha);
  const out = [];
  if (!tarjeta || tarjeta.tipo !== 'credito') {
    // Debito, efectivo o billetera: impacta el mismo dia, sin cuotas.
    return [{ nro: 1, total: 1, monto: Number(tx.monto), cierre: fecha, vence: fecha,
              periodoVenc: periodo(fecha), pendiente: false }];
  }
  const base = cierreDeCompra(fecha, tarjeta.cierre_dia || 1);
  for (let k = 0; k < n; k++) {
    const cierre = diaSeguro(base.getFullYear(), base.getMonth() + k, tarjeta.cierre_dia || 1);
    const vence = vencimientoDeCierre(cierre, tarjeta.vencimiento_dia || 10);
    out.push({ nro: k + 1, total: n, monto, cierre, vence,
               periodoVenc: periodo(vence), pendiente: vence >= ref });
  }
  return out;
}

/** Total a pagar de una tarjeta en un periodo (mes de vencimiento del resumen). */
export function totalTarjetaEnPeriodo(txs, tarjeta, per, moneda = 'ARS') {
  let total = 0;
  for (const tx of txs) {
    if (tx.account_id !== tarjeta.id) continue;
    if (tx.moneda !== moneda) continue;
    if (tx.tipo !== 'gasto') continue;
    for (const c of cronograma(tx, tarjeta)) {
      if (c.periodoVenc === per) total += c.monto;
    }
  }
  return round2(total);
}

/** Deuda futura: cuotas que todavia no vencieron, agrupadas por periodo. */
export function deudaFutura(txs, tarjetas, moneda = 'ARS', ref = hoy(), meses = 12) {
  const idx = Object.fromEntries(tarjetas.map(t => [t.id, t]));
  const mapa = {};
  const desde = periodo(ref);
  for (const tx of txs) {
    if (tx.tipo !== 'gasto' || tx.moneda !== moneda) continue;
    const t = idx[tx.account_id];
    if (!t || t.tipo !== 'credito') continue;
    for (const c of cronograma(tx, t, ref)) {
      if (!c.pendiente) continue;
      mapa[c.periodoVenc] = (mapa[c.periodoVenc] || 0) + c.monto;
    }
  }
  const out = [];
  for (let i = 0; i < meses; i++) {
    const p = periodoSuma(desde, i);
    if (mapa[p]) out.push({ periodo: p, monto: round2(mapa[p]) });
  }
  return out;
}

// ---------------------------------------------------------------------
// MES CORRIENTE
// ---------------------------------------------------------------------

/** Gastos e ingresos del periodo por fecha de operacion (no de vencimiento). */
export function resumenMes(txs, per, moneda = 'ARS') {
  let gastos = 0, ingresos = 0, reintegros = 0;
  const porCategoria = {};
  for (const tx of txs) {
    if (tx.moneda !== moneda) continue;
    if (periodo(parseFecha(tx.fecha)) !== per) continue;
    const m = Number(tx.monto);
    if (tx.tipo === 'ingreso') { ingresos += m; continue; }
    gastos += m;
    reintegros += Number(tx.reintegro || 0);
    const k = tx.category_id || 'sin';
    porCategoria[k] = (porCategoria[k] || 0) + m;
  }
  return {
    gastos: round2(gastos), ingresos: round2(ingresos), reintegros: round2(reintegros),
    balance: round2(ingresos - gastos), porCategoria
  };
}

/** Recurrentes del periodo con estado de pago. */
export function recurrentesDelMes(recurrings, pagos, per, ref = hoy()) {
  const pagosIdx = {};
  for (const p of pagos) if (p.periodo === per) pagosIdx[p.recurring_id] = p;
  const [y, m] = per.split('-').map(Number);
  return recurrings.filter(r => r.activo).map(r => {
    const pago = pagosIdx[r.id] || null;
    const vence = diaSeguro(y, m - 1, r.dia_vencimiento);
    const pagado = !!(pago && pago.pagado_at);
    return {
      ...r, pago, pagado, vence,
      monto: pago && pago.monto != null ? Number(pago.monto) : Number(r.monto_estimado),
      vencido: !pagado && vence < ref,
      diasRestantes: dias(ref, vence)
    };
  }).sort((a, b) => a.vence - b.vence);
}

/** Presupuesto vs gastado por categoria. */
export function estadoPresupuesto(budgets, resumen, alertPct = 80) {
  return budgets.map(b => {
    const gastado = round2(resumen.porCategoria[b.category_id] || 0);
    const tope = Number(b.monto) || 0;
    const pct = tope > 0 ? Math.round((gastado / tope) * 100) : 0;
    return {
      ...b, gastado, tope, pct,
      estado: pct >= 100 ? 'excedido' : pct >= alertPct ? 'alerta' : 'ok',
      restante: round2(tope - gastado)
    };
  });
}

// ---------------------------------------------------------------------
// PROMOS
// ---------------------------------------------------------------------

/** Promos aplicables hoy (o al dia indicado). */
export function promosDelDia(promos, ref = hoy()) {
  const d = ref.getDay();
  const iso = fechaISO(ref);
  return promos.filter(p => {
    if (!p.activa) return false;
    if (p.vigencia_desde && p.vigencia_desde > iso) return false;
    if (p.vigencia_hasta && p.vigencia_hasta < iso) return false;
    const dias = p.dias || [];
    return dias.length === 0 || dias.includes(d);
  }).sort((a, b) => (b.favorita - a.favorita) || (Number(b.valor) - Number(a.valor)));
}

/** Reintegro estimado de una compra bajo una promo. */
export function reintegroEstimado(monto, promo) {
  if (!promo || promo.tipo === 'cuotas') return 0;
  const bruto = (Number(monto) * Number(promo.valor || 0)) / 100;
  const tope = Number(promo.tope || 0);
  return round2(tope > 0 ? Math.min(bruto, tope) : bruto);
}

// ---------------------------------------------------------------------
export const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function money(n, moneda = 'ARS') {
  const v = Number(n) || 0;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: moneda, maximumFractionDigits: v % 1 === 0 ? 0 : 2
  }).format(v);
}
