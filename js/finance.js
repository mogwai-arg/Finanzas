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

/**
 * Ciclos leidos del resumen o del mail, en vez de calculados.
 *
 * POR QUE: en Galicia el cierre NO cae un dia fijo del mes. En el resumen de
 * agosto/26 los cierres son 30-jul, 27-ago y 1-oct — todos jueves, con el
 * vencimiento ocho dias despues, pero separados 28 y 35 dias. Con un
 * `cierre_dia` fijo la cuenta da mal casi todos los meses.
 *
 * Cada resumen publica seis fechas, incluido el ciclo QUE VIENE. Guardarlas
 * es mas barato y mas exacto que adivinar la regla.
 *
 * `tarjeta.ciclos` = [{ cierre:'YYYY-MM-DD', vence:'YYYY-MM-DD' }, ...]
 * Si no hay ciclos que cubran la fecha, se cae a `cierre_dia` como antes.
 */
export function ciclosOrdenados(tarjeta) {
  return (tarjeta.ciclos || [])
    .filter(c => c && c.cierre)
    .map(c => ({ cierre: parseFecha(c.cierre), vence: c.vence ? parseFecha(c.vence) : null }))
    .sort((a, b) => a.cierre - b.cierre);
}

/**
 * Si la tarjeta tiene con que calcular su ciclo: fechas leidas del resumen o,
 * en su defecto, un dia fijo de cierre.
 *
 * Sin ninguna de las dos cosas se cae en 'cierra el 1, vence el 10', que es
 * una invencion: las compras van a parar a un resumen y la pantalla muestra
 * otro, asi que la tarjeta dice cero teniendo consumos. Preguntar es mejor que
 * adivinar.
 */
export const tieneCiclo = t => !!((t.ciclos || []).some(c => c && c.cierre) || t.cierre_dia);

/** Ciclo al que entra una compra: el primero cuyo cierre es posterior. */
export function cicloDeCompra(fecha, tarjeta) {
  for (const c of ciclosOrdenados(tarjeta)) {
    if (fecha < c.cierre) {
      return { cierre: c.cierre,
               vence: c.vence || vencimientoDeCierre(c.cierre, tarjeta.vencimiento_dia || 10),
               declarado: true };
    }
  }
  // Fuera de los ciclos conocidos: se vuelve al dia fijo, marcando que es
  // una estimacion y no un dato del banco.
  const cierre = cierreDeCompra(fecha, tarjeta.cierre_dia || 1);
  return { cierre, vence: vencimientoDeCierre(cierre, tarjeta.vencimiento_dia || 10),
           declarado: false };
}

/**
 * El resumen CERRADO que todavia no vencio, si hay uno.
 *
 * No es lo mismo que el proximo ciclo: el 1 de septiembre el resumen que hay
 * que pagar cerro el 27 de agosto y vence el 4 de septiembre, mientras el
 * ciclo en curso recien cierra el 1 de octubre. Mostrar solo el segundo
 * esconde justamente la plata que hay que pagar esta semana.
 */
export function resumenAPagar(tarjeta, ref = hoy()) {
  for (const c of ciclosOrdenados(tarjeta)) {
    const vence = c.vence || vencimientoDeCierre(c.cierre, tarjeta.vencimiento_dia || 10);
    if (c.cierre <= ref && vence >= ref) return { cierre: c.cierre, vence, declarado: true };
  }
  return null;
}

/** Proximo cierre y vencimiento a partir de una fecha de referencia. */
export function proximoCiclo(tarjeta, ref = hoy()) {
  const { cierre, vence, declarado } = cicloDeCompra(ref, tarjeta);
  return { cierre, vence, declarado,
           diasACierre: dias(ref, cierre), diasAVencimiento: dias(ref, vence) };
}
export const dias = (a, b) => Math.round((b - a) / 86400000);

/** Cierre de la cuota anterior, para buscar el ciclo siguiente. */
const cierre0 = (out, primero, k) => out.length ? out[out.length - 1].cierre : primero.cierre;

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
  // La primera cuota cae en el ciclo que corresponda; de ahi en adelante se
  // avanza de a un mes desde ESE cierre, no desde el dia fijo de la tarjeta.
  const primero = cicloDeCompra(fecha, tarjeta);
  const diaBase = primero.cierre.getDate();
  for (let k = 0; k < n; k++) {
    let cierre, vence, declarado;
    if (k === 0) {
      ({ cierre, vence, declarado } = primero);
    } else {
      const sig = ciclosOrdenados(tarjeta).find(c => c.cierre > cierre0(out, primero, k));
      if (sig) { cierre = sig.cierre; declarado = true;
                 vence = sig.vence || vencimientoDeCierre(cierre, tarjeta.vencimiento_dia || 10); }
      else { cierre = diaSeguro(primero.cierre.getFullYear(), primero.cierre.getMonth() + k, diaBase);
             vence = vencimientoDeCierre(cierre, tarjeta.vencimiento_dia || 10); declarado = false; }
    }
    out.push({ nro: k + 1, total: n, monto, cierre, vence, declarado,
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
// LIMITE Y FINANCIACION
// ---------------------------------------------------------------------

/**
 * Limite consumido y disponible de una tarjeta.
 *
 * "Consumido" no es el proximo resumen: incluye TODAS las cuotas que todavia
 * no vencieron. En la app de Mercado Pago se ve la diferencia — limite
 * consumido $595.729 contra un proximo resumen de $394.463: los $201.266 de
 * mas son cuotas de meses siguientes que ya tienen el limite tomado.
 */
export function limiteDeTarjeta(tarjeta, txs, ref = hoy(), moneda = 'ARS') {
  const limite = Number(tarjeta.limite) || 0;
  let consumido = 0;
  for (const tx of txs) {
    if (tx.account_id !== tarjeta.id || tx.tipo !== 'gasto' || tx.moneda !== moneda) continue;
    for (const c of cronograma(tx, tarjeta, ref)) if (c.pendiente) consumido += c.monto;
  }
  consumido = round2(consumido);
  return { limite, consumido, disponible: round2(limite - consumido),
           usado: limite > 0 ? Math.round((consumido / limite) * 100) : 0 };
}

/**
 * Cuantos dias de aire da cada tarjeta para una compra hecha hoy.
 *
 * Es el motor de "¿con que pago?". Con tarjetas de ciclos distintos la
 * diferencia es enorme: las de Galicia cierran el 27 y Mercado Pago el 5, asi
 * que una compra del 4 de septiembre entra en el resumen de Mercado Pago que
 * cierra al dia siguiente, y en el de Galicia recien el 1 de octubre. Un mes
 * de financiacion depende de con cual pagues.
 *
 * Devuelve las tarjetas ordenadas de mas a menos dias de aire.
 */
export function financiacion(fecha, tarjetas) {
  return tarjetas
    .filter(t => t.tipo === 'credito' && t.activo !== false)
    .map(t => {
      const c = cicloDeCompra(fecha, t);
      return { tarjeta: t, cierre: c.cierre, vence: c.vence, declarado: c.declarado,
               diasDeAire: dias(fecha, c.vence) };
    })
    .sort((a, b) => b.diasDeAire - a.diasDeAire);
}

// ---------------------------------------------------------------------
// MES CORRIENTE
// ---------------------------------------------------------------------

/**
 * Gastos e ingresos del periodo por fecha de operacion (no de vencimiento).
 *
 * Las TRANSFERENCIAS quedan afuera y no es un detalle: el extracto del 01/09
 * muestra $ 823.133 saliendo de la cuenta, pero solo $ 84.453 son gasto. Los
 * $ 715.580 de "transferencia a cuentas propias" y los $ 23.100 de compra de
 * dolares siguen siendo plata suya, solo cambio de lugar. Contarlas infla el
 * gasto del dia diez veces, y despues se cuentan DE NUEVO cuando esa plata se
 * gasta desde la billetera.
 */
export function resumenMes(txs, per, moneda = 'ARS') {
  let gastos = 0, ingresos = 0, reintegros = 0, movido = 0;
  const porCategoria = {};
  for (const tx of txs) {
    if (tx.moneda !== moneda) continue;
    if (periodo(parseFecha(tx.fecha)) !== per) continue;
    const m = Number(tx.monto);
    if (tx.tipo === 'transferencia') { movido += m; continue; }
    if (tx.tipo === 'ingreso') { ingresos += m; continue; }
    gastos += m;
    reintegros += Number(tx.reintegro || 0);
    const k = tx.category_id || 'sin';
    porCategoria[k] = (porCategoria[k] || 0) + m;
  }
  return {
    gastos: round2(gastos), ingresos: round2(ingresos), reintegros: round2(reintegros),
    movido: round2(movido),          // transferencias: informativo, no es gasto
    balance: round2(ingresos - gastos), porCategoria
  };
}

/**
 * Saldo de una cuenta a una fecha.
 *
 * Una transferencia resta en la cuenta de origen y suma en la de destino. Si
 * cambia de moneda —comprar dolares es una transferencia de una cuenta en pesos
 * a una en dolares— el destino usa `monto_destino`, y de ahi sale el tipo de
 * cambio real de la operacion sin tener que preguntarlo.
 *
 * `inicial` es un saldo tomado del banco y `desde` la fecha de ese saldo. Los
 * movimientos anteriores a esa fecha NO se suman: ya estan adentro del numero.
 */
export function saldoDeCuenta(cuenta, txs, ref = hoy(), inicial = 0, desde = null) {
  let saldo = Number(inicial) || 0;
  // `desde` es la fecha del saldo declarado. Todo lo anterior ya esta contado
  // adentro de ese numero; volver a sumarlo duplica el saldo.
  const corte = desde ? parseFecha(desde) : null;
  for (const tx of txs) {
    const f = parseFecha(tx.fecha);
    if (f > ref) continue;
    if (corte && f < corte) continue;
    const propio = tx.account_id === cuenta.id;
    const destino = tx.destino_account_id === cuenta.id;
    if (!propio && !destino) continue;

    if (tx.tipo === 'transferencia') {
      if (propio) saldo -= Number(tx.monto);
      if (destino) saldo += Number(tx.monto_destino != null ? tx.monto_destino : tx.monto);
      continue;
    }
    if (!propio) continue;
    // Una compra con tarjeta de credito no toca el saldo de la cuenta: sale
    // cuando se paga el resumen, no cuando se compra.
    if (cuenta.tipo === 'credito') continue;
    if (tx.tipo === 'ingreso') saldo += Number(tx.monto);
    else saldo -= Number(tx.monto);
  }
  return round2(saldo);
}

/** Tipo de cambio implicito de una transferencia entre monedas. */
export function tipoDeCambio(tx) {
  if (tx.tipo !== 'transferencia' || !tx.monto_destino) return null;
  if (!tx.moneda_destino || tx.moneda_destino === tx.moneda) return null;
  const a = Number(tx.monto), b = Number(tx.monto_destino);
  if (!a || !b) return null;
  return { de: tx.moneda, a: tx.moneda_destino, valor: round2(a / b) };
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
