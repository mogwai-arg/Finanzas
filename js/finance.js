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
export const diaDelMes = n => Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= 31;

// Un dia guardado que no es un dia del mes —un 509 de teclear '5/09' en un
// campo numerico— vale lo mismo que no tener nada: si se usara, el ciclo se
// calcularia sobre una fecha que no existe.
const diaCierre = t => (diaDelMes(t.cierre_dia) ? Number(t.cierre_dia) : 1);
const diaVenc = t => (diaDelMes(t.vencimiento_dia) ? Number(t.vencimiento_dia) : 10);
export const tieneCiclo = t =>
  !!((t.ciclos || []).some(c => c && c.cierre) || diaDelMes(t.cierre_dia));

/** Ciclo al que entra una compra: el primero cuyo cierre es posterior. */
export function cicloDeCompra(fecha, tarjeta) {
  for (const c of ciclosOrdenados(tarjeta)) {
    if (fecha < c.cierre) {
      return { cierre: c.cierre,
               vence: c.vence || vencimientoDeCierre(c.cierre, diaVenc(tarjeta)),
               declarado: true };
    }
  }
  // Fuera de los ciclos conocidos: se vuelve al dia fijo, marcando que es
  // una estimacion y no un dato del banco.
  const cierre = cierreDeCompra(fecha, diaCierre(tarjeta));
  return { cierre, vence: vencimientoDeCierre(cierre, diaVenc(tarjeta)),
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
    const vence = c.vence || vencimientoDeCierre(c.cierre, diaVenc(tarjeta));
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
                 vence = sig.vence || vencimientoDeCierre(cierre, diaVenc(tarjeta)); }
      else { cierre = diaSeguro(primero.cierre.getFullYear(), primero.cierre.getMonth() + k, diaBase);
             vence = vencimientoDeCierre(cierre, diaVenc(tarjeta)); declarado = false; }
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

/**
 * Cuanto de un resumen ya estaba comprometido antes de que empezara.
 *
 * Son las cuotas de compras de meses anteriores: el resumen nuevo no arranca
 * en cero, arranca debiendo eso. Saberlo cambia la decision —"me quedan
 * 200.000 de aire", no "puedo gastar todo el limite"— y es lo que hace que un
 * resumen recien pagado no se lea como una tarjeta vacia.
 */
export function comprometidoEnPeriodo(txs, tarjeta, per, moneda = 'ARS') {
  return round2(cuotasComprometidas(txs, tarjeta, per, moneda)
    .reduce((s, c) => s + c.monto, 0));
}

/**
 * Que compras componen ese compromiso, para poder abrirlo.
 *
 * Un total no se puede discutir; una lista si. "88.728 en cuotas" invita a
 * preguntar de que, y la respuesta —la heladera de junio, cuota 2 de 3— es la
 * que deja decidir si conviene adelantar o no comprar nada mas en cuotas.
 */
export function cuotasComprometidas(txs, tarjeta, per, moneda = 'ARS') {
  const out = [];
  for (const tx of txs) {
    if (tx.account_id !== tarjeta.id || tx.tipo !== 'gasto' || tx.moneda !== moneda) continue;
    const cron = cronograma(tx, tarjeta);
    for (const c of cron) {
      // La cuota 1 es la compra de este ciclo; de la 2 en adelante viene de antes.
      if (c.periodoVenc !== per || c.nro <= 1) continue;
      out.push({ tx, monto: round2(c.monto), nro: c.nro, total: c.total,
                 quedan: c.total - c.nro,
                 // Cuando termina de pagarse, que es el dato que uno busca.
                 ultimo: cron[cron.length - 1].periodoVenc });
    }
  }
  return out.sort((a, b) => b.monto - a.monto);
}

/**
 * Lo que ya pagaste de un resumen.
 *
 * Un pago de tarjeta es una movida de plata: sale de la cuenta y entra a la
 * tarjeta. Se cuentan los que caen entre el cierre y unos dias despues del
 * vencimiento, que es la ventana en la que uno paga.
 */
export function pagadoDeResumen(txs, tarjeta, ciclo, moneda = 'ARS') {
  if (!ciclo) return 0;
  const desde = ciclo.cierre;
  const hasta = new Date(ciclo.vence.getTime() + 10 * 86400000);
  let total = 0;
  for (const tx of txs) {
    if (tx.tipo !== 'transferencia') continue;
    if (tx.destino_account_id !== tarjeta.id) continue;
    if ((tx.moneda || 'ARS') !== moneda) continue;
    const f = parseFecha(tx.fecha);
    if (f >= desde && f <= hasta) total += Math.abs(Number(tx.monto) || 0);
  }
  return round2(total);
}

/**
 * Lo que falta pagar de un resumen: el total menos lo ya pagado.
 *
 * Un resto de centavos cuenta como saldado. Uno paga 939.323 de un resumen de
 * 939.323,25 —el banco redondea, el cajero redondea, uno tipea redondo— y si
 * esos veinticinco centavos siguen contando, la tarjeta queda "a pagar en 2
 * dias" para siempre por una moneda de veinticinco.
 */
export function faltaPagarDeResumen(txs, tarjeta, ciclo, moneda = 'ARS') {
  if (!ciclo) return 0;
  const total = totalTarjetaEnPeriodo(txs, tarjeta, periodo(ciclo.vence), moneda);
  const pagado = pagadoDeResumen(txs, tarjeta, ciclo, moneda);
  if (!pagado) return round2(Math.max(0, total));
  const resto = round2(Math.max(0, total - pagado));
  return resto <= (moneda === 'USD' ? 0.05 : 1) ? 0 : resto;
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
export function limiteDeTarjeta(tarjeta, txs, ref = hoy(), moneda = 'ARS', pagado = 0) {
  const limite = Number(tarjeta.limite) || 0;
  let consumido = 0;
  for (const tx of txs) {
    if (tx.account_id !== tarjeta.id || tx.tipo !== 'gasto' || tx.moneda !== moneda) continue;
    for (const c of cronograma(tx, tarjeta, ref)) if (c.pendiente) consumido += c.monto;
  }
  // Pagar el resumen libera el limite en el momento, no cuando vence.
  consumido = round2(Math.max(0, consumido - (Number(pagado) || 0)));
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
    // Comprar dolares es una transferencia en pesos que deja dolares del otro
    // lado. Mirando en dolares, esa plata entro: si solo se mira la moneda de
    // origen, la operacion no existe en ninguna de las dos pantallas.
    if (tx.moneda !== moneda) {
      if (tx.tipo === 'transferencia' && tx.moneda_destino === moneda &&
          tx.monto_destino != null && periodo(parseFecha(tx.fecha)) === per)
        movido += Number(tx.monto_destino) || 0;
      continue;
    }
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
 * Ingresos y gastos de los ultimos N meses, del mas viejo al mas nuevo.
 *
 * Sirve para la unica comparacion que contesta "¿como vengo?": la de un mes
 * contra los de antes. El mes en curso va marcado, porque comparar un mes por
 * la mitad contra meses enteros es la forma mas facil de creer que se esta
 * gastando poco.
 */
export function serieMensual(txs, meses = 6, moneda = 'ARS', ref = hoy()) {
  const out = [];
  const actual = periodo(ref);
  for (let i = meses - 1; i >= 0; i--) {
    const p = periodo(new Date(ref.getFullYear(), ref.getMonth() - i, 1));
    const r = resumenMes(txs, p, moneda);
    out.push({ periodo: p, ingresos: r.ingresos, gastos: r.gastos,
               balance: round2(r.ingresos - r.gastos), enCurso: p === actual });
  }
  return out;
}

/**
 * Lo gastado por categoria en un mes, de mayor a menor y con su parte del
 * total. Sin ordenar no se lee, y sin el porcentaje no se sabe si ese numero
 * grande es grande de verdad.
 */
export function gastoPorCategoria(txs, per, moneda = 'ARS') {
  const r = resumenMes(txs, per, moneda);
  const total = r.gastos;
  return Object.entries(r.porCategoria)
    .map(([id, monto]) => ({ id: id === 'sin' ? null : id, monto: round2(monto),
                             parte: total > 0 ? monto / total : 0 }))
    .sort((a, b) => b.monto - a.monto);
}

/**
 * Lo que se ve en una moneda, con la pata que corresponde a cada movimiento.
 *
 * Una transferencia entre monedas es una sola fila en la base pero dos cosas
 * distintas segun desde donde se mire: en pesos salieron 148.500 y en dolares
 * entraron 100. Antes la lista filtraba por la moneda de origen nada mas, asi
 * que la compra de dolares no aparecia en la pantalla de dolares.
 */
export function movimientosEnMoneda(txs, moneda) {
  const out = [];
  for (const tx of txs) {
    if (tx.moneda === moneda) { out.push({ tx, entrante: false, monto: Number(tx.monto) || 0 }); continue; }
    if (tx.tipo === 'transferencia' && tx.moneda_destino === moneda && tx.monto_destino != null)
      out.push({ tx, entrante: true, monto: Number(tx.monto_destino) || 0 });
  }
  return out;
}

/**
 * Lo gastado en un mes hasta el dia N, para poder comparar meses en curso.
 *
 * Comparar el mes que va por la mitad contra el mes pasado entero no dice
 * nada. Contra el mes pasado al mismo dia, si: es la unica comparacion que
 * responde "¿voy gastando mas o menos que la vez pasada?".
 */
export function gastadoAlDia(txs, per, dia, moneda = 'ARS') {
  let total = 0;
  for (const tx of txs) {
    if (tx.moneda !== moneda || tx.tipo !== 'gasto') continue;
    const f = parseFecha(tx.fecha);
    if (periodo(f) !== per || f.getDate() > dia) continue;
    total += Number(tx.monto);
  }
  return round2(total);
}

/** El mes anterior a 'YYYY-MM'. */
export function mesAnterior(per) {
  const [y, m] = per.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Hace cuantos dias que no se carga nada a mano.
 *
 * La app vive de que le cuenten los gastos: tres dias sin cargar es la
 * diferencia entre un mes que cierra y uno que no. Solo cuenta lo cargado a
 * mano, porque lo que entra solo no dice nada del habito.
 */
export function diasSinCargar(txs, ref = hoy()) {
  let ultima = null;
  for (const tx of txs) {
    if (tx.fuente && tx.fuente !== 'manual') continue;
    const f = parseFecha(tx.created_at ? tx.created_at.slice(0, 10) : tx.fecha);
    if (f > ref) continue;
    if (!ultima || f > ultima) ultima = f;
  }
  return ultima ? dias(ref, ultima) * -1 : null;
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
    const { valor, saldo, sugerido } = aPagarRecurrente(r, pagos, per);
    // El saldo que queda para el mes que viene, ya contando este pago.
    const pagadoMonto = pago && pago.monto != null ? Number(pago.monto) : valor;
    const saldoDespues = pagado ? round2(saldo + pagadoMonto - valor) : saldo;
    return {
      ...r, pago, pagado, vence, valor, saldo, sugerido, saldoDespues,
      // Lo que figura en el mes: si ya se pago, lo que se pago de verdad; si
      // no, lo que conviene pagar teniendo en cuenta lo que sobro de antes.
      monto: pago && pago.monto != null ? Number(pago.monto) : sugerido,
      vencido: !pagado && vence < ref,
      diasRestantes: dias(ref, vence)
    };
  // Los pendientes primero, y entre ellos el que vence antes. Un pagado ya no
  // pide nada: ordenar todo junto por fecha deja lo que hay que hacer
  // desperdigado entre lo que ya esta hecho.
  }).sort((a, b) => (a.pagado - b.pagado) || (a.vence - b.vence));
}

/**
 * Saldo arrastrado de un gasto fijo.
 *
 * El alquiler vale 850 dolares, pero para no romper billetes un mes se pagan
 * 900 y otro 800. Lo que vale no cambia; lo que sobra o falta se lleva al mes
 * siguiente. Positivo = pagaste de mas y tenes a favor.
 *
 * `hasta` excluye el periodo que se esta mirando: el saldo que entra a un mes
 * es el de todos los meses anteriores.
 */
export function saldoRecurrente(recurring, pagos, hasta = null) {
  const valor = Number(recurring.monto_estimado) || 0;
  let saldo = 0;
  for (const p of pagos) {
    if (p.recurring_id !== recurring.id || !p.pagado_at) continue;
    if (hasta && p.periodo >= hasta) continue;
    saldo += (p.monto == null ? valor : Number(p.monto)) - valor;
  }
  return round2(saldo);
}

/**
 * Cuanto conviene pagar este mes: lo que vale, menos lo que sobro de antes.
 * Nunca negativo: si el saldo a favor tapa el mes entero, se paga cero y el
 * resto sigue arrastrandose.
 */
export function aPagarRecurrente(recurring, pagos, per) {
  const valor = Number(recurring.monto_estimado) || 0;
  const saldo = saldoRecurrente(recurring, pagos, per);
  return { valor, saldo, sugerido: round2(Math.max(0, valor - saldo)) };
}

/**
 * Busca un movimiento cargado a mano que sea el mismo que este.
 *
 * POR QUE: anotar un gasto en el momento y despues importarlo del resumen es
 * el uso normal, no un error. Si cada camino crea su propia fila, el mes
 * queda inflado justo cuando uno empieza a confiar en el numero.
 *
 * Se compara importe, fecha y cuenta, no el texto: el nombre que uno escribe
 * ('super') no se parece en nada al del resumen ('COTO CICSA 3456').
 *
 * Solo mira los cargados a mano: entre dos automaticos ya no puede haber
 * repetidos, porque cada uno trae su identificador de origen.
 */
export function duplicadoManual(tx, existentes, { dias = 4, centavos = 1 } = {}) {
  const monto = Math.abs(Number(tx.monto) || 0);
  if (!monto) return null;
  const f = parseFecha(tx.fecha);

  return existentes.find(e => {
    if (e.id === tx.id) return null;
    if ((e.fuente || 'manual') !== 'manual') return false;   // los de origen ya se deduplican solos
    if (e.tipo !== tx.tipo) return false;
    if ((e.moneda || 'ARS') !== (tx.moneda || 'ARS')) return false;
    // Una cuenta distinta es otro movimiento; sin cuenta, se le da el beneficio de la duda.
    if (e.account_id && tx.account_id && e.account_id !== tx.account_id) return false;
    if (Math.abs(Math.abs(Number(e.monto) || 0) - monto) > centavos) return false;
    return Math.abs((parseFecha(e.fecha) - f) / 86400000) <= dias;
  }) || null;
}

// ---------------------------------------------------------------------
// LO QUE SE DEBITA EN LA TARJETA
// ---------------------------------------------------------------------

/**
 * Si un gasto fijo cae SOLO en una tarjeta de credito.
 *
 * Son dos condiciones y hacen falta las dos. Que la cuenta sea una tarjeta no
 * alcanza: el colegio se paga a mano y segun el mes sale por transferencia o
 * con la tarjeta, asi que hay que acordarse de pagarlo igual. Spotify, en
 * cambio, se debita solo: no hay nada que hacer, el consumo va a caer en el
 * resumen si o si, y listarlo aparte lo contaria dos veces.
 */
export function debitoEnTarjeta(recurring, cuentas) {
  if (!recurring.debito_automatico) return false;
  const c = (cuentas || []).find(x => x.id === recurring.account_id);
  return !!c && c.tipo === 'credito';
}

/**
 * Los debitos automaticos de una tarjeta que todavia no llegaron al resumen.
 *
 * Netflix, Spotify, la prepaga: caen todos los meses y son plata que ya esta
 * comprometida aunque el consumo no figure todavia. Preverlos es la
 * diferencia entre saber lo que va a venir y enterarse cuando cierra.
 *
 * Se descuenta el que ya aparecio: si el resumen o la carga a mano ya trajo
 * "Spotify", ese no se suma de nuevo.
 */
export function debitosPrevistos(recurrings, txs, tarjeta, ciclo, ref = hoy()) {
  const moneda = tarjeta.moneda || 'ARS';
  const hasta = ciclo.cierre;
  // La ventana arranca en el cierre anterior. Sin acotarla, un debito de
  // agosto haria creer que el de septiembre ya cayo y no se preveria nunca.
  const desde = ciclo.cierreAnterior ||
    new Date(hasta.getFullYear(), hasta.getMonth() - 1, hasta.getDate());
  const items = [];
  for (const r of recurrings || []) {
    if (r.activo === false || r.account_id !== tarjeta.id) continue;
    // Solo los que caen solos. El que uno paga a mano puede terminar saliendo
    // por transferencia, y darlo por descontado en el resumen es inventar.
    if (!r.debito_automatico) continue;
    if ((r.moneda || 'ARS') !== moneda) continue;
    const nombre = String(r.nombre || '').toLowerCase();
    // ¿Ya cayo en este ciclo?
    const ya = (txs || []).some(tx => {
      if (tx.account_id !== tarjeta.id || tx.tipo !== 'gasto') return false;
      const f = parseFecha(tx.fecha);
      if (f > hasta || (desde && f < desde)) return false;
      const texto = `${tx.descripcion || ''} ${tx.comercio || ''}`.toLowerCase();
      return nombre && texto.includes(nombre);
    });
    if (!ya) items.push({ ...r, monto: Number(r.monto_estimado) || 0 });
  }
  return { items, total: round2(items.reduce((s, r) => s + r.monto, 0)) };
}

/**
 * La plata que de verdad esta libre.
 *
 * El saldo de las cuentas miente por omision: adentro esta el resumen que hay
 * que pagar la semana que viene y los fijos que todavia no vencieron. Restar
 * eso es la diferencia entre "tengo tres millones" y "puedo gastar".
 *
 * Devuelve tambien la version estricta: lo mismo, pero apartando ya lo que se
 * lleva consumido con las tarjetas este ciclo, que es lo que se paga el mes
 * que viene. Es el numero al que hay que apuntar si uno no quiere que la
 * tarjeta le financie el mes.
 */
export function plataLibre(cuentas, txs, recurrings, pagos, ref = hoy(), moneda = 'ARS') {
  const propias = (cuentas || []).filter(c => c.activo !== false && (c.moneda || 'ARS') === moneda);
  let enCuentas = 0;
  for (const c of propias) {
    if (c.tipo === 'credito') continue;
    enCuentas += saldoDeCuenta(c, txs, ref, Number(c.saldo_inicial) || 0, c.saldo_al);
  }

  let resumenes = 0, proximo = 0, debitos = 0;
  for (const t of propias) {
    if (t.tipo !== 'credito') continue;
    const cerrado = resumenAPagar(t, ref);
    if (cerrado) resumenes += faltaPagarDeResumen(txs, t, cerrado, moneda);
    const enCurso = proximoCiclo(t, ref);
    proximo += totalTarjetaEnPeriodo(txs, t, periodo(enCurso.vence), moneda);
    debitos += debitosPrevistos(recurrings, txs, t, enCurso, ref).total;
  }

  // Los que caen solos en una tarjeta NO se cuentan aca: ya estan adentro del
  // resumen, o previstos como debito del ciclo en curso. Los que uno paga a
  // mano si, aunque los termine pagando con la tarjeta: hasta que no los
  // pague, son plata que tiene que estar.
  let fijos = 0;
  for (const r of recurrentesDelMes(recurrings || [], pagos || [], periodo(ref), ref)) {
    if (r.pagado || (r.moneda || 'ARS') !== moneda) continue;
    if (debitoEnTarjeta(r, cuentas)) continue;
    fijos += Number(r.monto) || 0;
  }

  const libre = round2(enCuentas - resumenes - fijos);
  return {
    enCuentas: round2(enCuentas), resumenes: round2(resumenes), fijos: round2(fijos),
    libre,
    // Lo que se lleva consumido con tarjeta este ciclo, mas lo que se sabe que
    // va a caer: eso se paga el mes que viene y conviene tenerlo apartado hoy.
    proximo: round2(proximo + debitos),
    libreEstricta: round2(libre - proximo - debitos)
  };
}

/**
 * Presupuesto vs gastado por categoria, del mas usado al menos.
 *
 * Ordenar por el porcentaje y no por el monto: el que esta al 95 % de un tope
 * chico es el que hay que mirar hoy, no el mas grande. Los que estan en cero
 * van al final, que es donde molestan menos.
 */
export function estadoPresupuesto(budgets, resumen, alertPct = 80) {
  return budgets.filter(b => b.category_id).map(b => {
    const gastado = round2(resumen.porCategoria[b.category_id] || 0);
    const tope = Number(b.monto) || 0;
    const pct = tope > 0 ? Math.round((gastado / tope) * 100) : 0;
    return {
      ...b, gastado, tope, pct,
      estado: pct >= 100 ? 'excedido' : pct >= alertPct ? 'alerta' : 'ok',
      restante: round2(tope - gastado)
    };
  }).sort((a, b) => (b.pct - a.pct) || (b.gastado - a.gastado));
}

/**
 * Topes por cuenta: "que la Visa no me pase de 800.000 este mes".
 *
 * Es la otra forma de ponerse un limite, y la que uno usa con las tarjetas:
 * no importa en que se gasto, importa cuanto va a venir el resumen. Cuenta
 * todo lo cargado a esa cuenta en el mes, en su moneda.
 */
export function estadoPorCuenta(budgets, txs, per, alertPct = 80) {
  return budgets.filter(b => b.account_id).map(b => {
    let gastado = 0;
    for (const tx of txs) {
      if (tx.account_id !== b.account_id || tx.tipo !== 'gasto') continue;
      if ((tx.moneda || 'ARS') !== (b.moneda || 'ARS')) continue;
      if (periodo(parseFecha(tx.fecha)) !== per) continue;
      gastado += Number(tx.monto) || 0;
    }
    const tope = Number(b.monto) || 0;
    const pct = tope > 0 ? Math.round((gastado / tope) * 100) : 0;
    return { ...b, gastado: round2(gastado), tope, pct,
             estado: pct >= 100 ? 'excedido' : pct >= alertPct ? 'alerta' : 'ok',
             restante: round2(tope - gastado) };
  });
}

/**
 * Lo ahorrado en el mes contra lo que uno se propuso.
 *
 * Ahorrar es que suba la PLATA LIBRE: lo que hay en las cuentas menos lo que
 * ya se debe. Se mide como la diferencia entre la plata libre de hoy y la del
 * ultimo dia del mes pasado.
 *
 * La version anterior hacia ingresos menos gastos del mes, y eso miente dos
 * veces. El dia 3, con el sueldo adentro y los gastos todavia sin hacer, daba
 * un millon ahorrado y la app felicitaba a alguien que no tenia plata. Y del
 * otro lado, un ingreso que entro como transferencia —o que todavia no se
 * cargo— dejaba el mes entero en negativo aunque hubiera plata guardada.
 *
 * Medir el cambio de la plata libre no se puede enganar: si al 1 tenias X
 * libre y hoy tenes X mas 100, ahorraste 100, sin importar por donde entro ni
 * como se contabilizo.
 */
export function estadoAhorro(budgets, datos, per, moneda = 'ARS', ref = hoy()) {
  const meta = (budgets || []).find(b => b.clase === 'ahorro' && (b.moneda || 'ARS') === moneda);
  if (!meta || !(Number(meta.monto) > 0)) return null;
  const { cuentas = [], txs = [], recurrings = [], pagos = [] } = datos || {};

  // El mes en curso se mide hasta hoy; uno cerrado, hasta su ultimo dia.
  const [y, m] = per.split('-').map(Number);
  const finDelMes = new Date(y, m, 0);
  const enCurso = periodo(ref) === per;
  const hasta = enCurso ? ref : finDelMes;
  const antesDe = new Date(y, m - 1, 0);          // ultimo dia del mes anterior

  const libre = f => plataLibre(cuentas, txs, recurrings, pagos, f, moneda).libre;
  const desde = libre(antesDe);
  const ahora = libre(hasta);
  const ahorrado = round2(ahora - desde);
  const tope = Number(meta.monto);

  // A mitad de mes el ahorro NO se puede saber: el dia 3, con el sueldo
  // adentro y los gastos sin hacer, la plata libre esta genuinamente arriba.
  // Lo unico honesto es compararlo contra la misma altura del mes pasado.
  let referencia = null;
  if (enCurso) {
    const mismoDia = new Date(y, m - 2, Math.min(ref.getDate(), new Date(y, m - 1, 0).getDate()));
    referencia = round2(libre(mismoDia) - libre(new Date(y, m - 2, 0)));
  }

  return { ...meta, moneda, tope, ahorrado, desde: round2(desde), ahora: round2(ahora),
           enCurso, referencia,
           dias: enCurso ? Math.max(0, dias(ref, finDelMes)) : 0,
           // El porcentaje se acota al 100: una barra que se pasa no dice nada
           // mas que "llego", y mientras el mes corre todavia puede bajar.
           pct: Math.max(0, Math.min(100, Math.round((ahorrado / tope) * 100))),
           logrado: !enCurso && ahorrado >= tope,
           falta: round2(Math.max(0, tope - ahorrado)) };
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
  }).sort(ordenPromo);
}

/**
 * El proximo dia en que la promo aplica, o null si ya no aplica mas.
 *
 * Hay tres formas de que una promo tenga dia y las tres conviven:
 *   - todos los jueves            -> dias: [4]
 *   - una vez al mes, el 10       -> vigencia_desde = vigencia_hasta = ese dia
 *   - todos los dias hasta el 30  -> dias: [], vigencia_hasta
 * Buscar dia por dia dentro de la ventana es mas corto que tratar cada caso
 * aparte, y no se equivoca cuando se combinan.
 */
export function proximaFechaPromo(promo, ref = hoy(), dentroDe = 60) {
  if (!promo || promo.activa === false) return null;
  for (let i = 0; i <= dentroDe; i++) {
    const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + i);
    const iso = fechaISO(d);
    if (promo.vigencia_desde && iso < promo.vigencia_desde) continue;
    if (promo.vigencia_hasta && iso > promo.vigencia_hasta) return null;
    const dias = promo.dias || [];
    if (!dias.length || dias.includes(d.getDay())) return d;
  }
  return null;
}

/**
 * Las promos marcadas que aplican hoy o estan por venir, con su fecha.
 *
 * Solo las marcadas: la gracia de elegir cuales recordar es que Hoy no se
 * llene de las cincuenta que trae el buscador.
 */
export function promosQueSeVienen(promos, ref = hoy(), dentroDe = 14) {
  const limite = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + dentroDe);
  return (promos || [])
    .filter(p => p.recordar && p.activa !== false)
    .map(p => ({ promo: p, fecha: proximaFechaPromo(p, ref, dentroDe) }))
    .filter(x => x.fecha && x.fecha <= limite)
    .sort((a, b) => (a.fecha - b.fecha) || ordenPromo(a.promo, b.promo));
}

/**
 * Primero las marcadas, despues las de reintegro, y recien ahi por porcentaje.
 *
 * Un reintegro vuelve a la cuenta y se puede usar en cualquier cosa; un
 * descuento solo baja el precio de esa compra. A igual porcentaje el reintegro
 * vale mas, y en la practica uno prefiere 15 de reintegro antes que 20 de
 * descuento en algo que iba a comprar igual.
 */
export function ordenPromo(a, b) {
  // Con ternario y no con Number(): una promo sin el campo daba NaN, y una
  // comparacion con NaN deja el orden como estaba.
  const marcada = p => (p.favorita ? 1 : 0);
  const peso = p => p.tipo === 'reintegro' ? 2 : p.tipo === 'descuento' ? 1 : 0;
  return (marcada(b) - marcada(a))
      || (peso(b) - peso(a))
      || ((Number(b.valor) || 0) - (Number(a.valor) || 0));
}

/**
 * De las promos que trae el buscador, cuales son de medios que tenes.
 *
 * El listado completo son cincuenta y pico por rubro, casi todas de bancos
 * ajenos: mostrarlas todas es ruido. Se comparan por palabra clave contra el
 * nombre y el banco de cada cuenta cargada.
 */
export function promosQueTePuedenServir(promos, cuentas) {
  const mios = new Set();
  for (const c of cuentas) {
    if (c.activo === false) continue;
    const t = `${c.nombre || ''} ${c.banco || ''}`.toLowerCase().replace(/[^a-z]/g, '');
    for (const clave of ['galicia', 'mercadopago', 'personalpay', 'modo', 'naranja',
                         'santander', 'bbva', 'macro', 'nacion', 'brubank', 'uala'])
      if (t.includes(clave)) mios.add(clave);
  }
  // MODO paga con las tarjetas del banco, asi que si hay una de un banco que
  // MODO soporta, esas promos tambien sirven.
  if (mios.has('galicia')) mios.add('modo');

  return promos
    .filter(p => mios.has(String(p.emisor || '').toLowerCase().replace(/[^a-z]/g, '')))
    .sort(ordenPromo);
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
