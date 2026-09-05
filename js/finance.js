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
/**
 * La moneda de un movimiento, con pesos por omision.
 *
 * La base pone 'ARS' por omision, pero una fila vieja o traida por un
 * importador puede llegar sin nada. Comparando con === , esa fila no era ni
 * de pesos ni de dolares: desaparecia de TODAS las pantallas —no aparecia en
 * Gastos, no sumaba al mes, no contaba en las estadisticas— sin que nada
 * dijera que existia. Plata invisible es peor que plata mal sumada.
 */
export const monedaDe = tx => tx.moneda || 'ARS';

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
 *
 * El dia del cierre entra ENTERO en el resumen que cierra. "Cierra el 5"
 * quiere decir que el resumen llega hasta el 5 inclusive, no hasta el 4: una
 * compra del 5 a la mañana sale en ese resumen. Con `>=` se iba al siguiente,
 * y ademas el resumen que acababa de cerrar desaparecia de la pantalla el
 * mismo dia que habia que empezar a pagarlo.
 */
export function cierreDeCompra(fecha, cierreDia) {
  const y = fecha.getFullYear(), m = fecha.getMonth();
  let cierre = diaSeguro(y, m, cierreDia);
  if (fecha > cierre) cierre = diaSeguro(y, m + 1, cierreDia);
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

/** Ciclo al que entra una compra: el primero que cierra ese dia o despues. */
export function cicloDeCompra(fecha, tarjeta) {
  for (const c of ciclosOrdenados(tarjeta)) {
    // <= y no <: el dia del cierre entra entero en el resumen que cierra.
    if (fecha <= c.cierre) {
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
  const cs = ciclosOrdenados(tarjeta);
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (c.cierre > ref) break;
    // Hasta que cierre el SIGUIENTE, no hasta que venza. Un resumen impago
    // el dia despues del vencimiento es lo mas urgente que hay, y con
    // `vence >= ref` desaparecia de la pantalla justo ahi. Si se pago, lo
    // saca `faltaPagarDeResumen`, que es quien sabe de pagos.
    const proximo = cs[i + 1] ? cs[i + 1].cierre : null;
    if (!proximo || ref < proximo) {
      return { cierre: c.cierre,
               vence: c.vence || vencimientoDeCierre(c.cierre, diaVenc(tarjeta)),
               declarado: true };
    }
  }
  // Sin ciclos declarados que cubran hoy, con el dia fijo.
  //
  // Antes esta funcion SOLO miraba los ciclos declarados, asi que una tarjeta
  // cargada a mano —cierra el 5, vence el 10— no tenia nunca un resumen a
  // pagar: el dia del cierre el ciclo en curso saltaba al mes siguiente y lo
  // que habia que pagar el 10 no aparecia en ningun lado.
  if (!diaDelMes(tarjeta.cierre_dia)) return null;
  const d = diaCierre(tarjeta);
  let cierre = diaSeguro(ref.getFullYear(), ref.getMonth(), d);
  if (cierre > ref) cierre = diaSeguro(ref.getFullYear(), ref.getMonth() - 1, d);
  const siguiente = diaSeguro(cierre.getFullYear(), cierre.getMonth() + 1, d);
  if (ref >= siguiente) return null;
  return { cierre, vence: vencimientoDeCierre(cierre, diaVenc(tarjeta)), declarado: false };
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
    if (monedaDe(tx) !== moneda) continue;
    if (tx.tipo !== 'gasto') continue;
    for (const c of cronograma(tx, tarjeta)) {
      if (c.periodoVenc === per) total += c.monto;
    }
  }
  return round2(total);
}

/**
 * Lo que dice el banco de un resumen que todavia no cerro.
 *
 * El resumen no se puede bajar hasta que cierra, pero el saldo en curso la
 * app del banco lo muestra desde el dia uno, y no siempre coincide con lo
 * cargado: un consumo que no llego por correo, un ajuste, una compra vieja
 * que cayo en este ciclo. Cien mil pesos de diferencia y ninguna forma de
 * encontrar donde estan.
 *
 * Anotarlo NO cambia lo cargado ni le agrega una fila: eso seria plata sin
 * comprobante, y despues el mes cierra con un movimiento que nadie hizo. El
 * numero del banco pasa a ser el total —porque es el que se paga— y la
 * diferencia queda escrita al lado, con nombre, hasta que llegue el resumen.
 */
export function saldoDeclarado(declarados, tarjetaId, per, moneda = 'ARS') {
  const del = declarados && declarados[tarjetaId] && declarados[tarjetaId][per];
  // Una tarjeta argentina tiene DOS saldos y los dos se pueden anotar: el de
  // pesos y el de dolares. Se guardan por moneda.
  //
  // La forma vieja colgaba el importe directo del periodo y era siempre en
  // pesos. Se sigue leyendo, para no perder lo que alguien ya haya anotado.
  const d = !del ? null
    : del.monto !== undefined ? (moneda === 'ARS' ? del : null)
    : del[moneda];
  const crudo = d && d.monto;
  // Number('') es CERO, no NaN. Sin esto, un campo que se abrio y se cerro
  // sin escribir nada se guardaba como "el banco dice que no debes nada" y la
  // tarjeta pasaba a valer cero.
  if (crudo === null || crudo === undefined || crudo === '') return null;
  const monto = Number(crudo);
  if (!Number.isFinite(monto) || monto < 0) return null;
  return { monto: round2(monto), cuando: (d && d.cuando) || null };
}

/**
 * Lo cargado, lo que dice el banco, y el agujero entre los dos.
 *
 * `dif` positivo es lo que falta cargar; negativo, lo que sobra —dos veces el
 * mismo consumo, o un pago que el banco todavia no acredito—. Los dos casos
 * importan y por eso no se recorta a cero: un total que sobra tambien es un
 * error, y silenciarlo lo deja adentro para siempre.
 */
export function brechaDeTarjeta(txs, tarjeta, per, declarados, moneda = 'ARS') {
  const app = totalTarjetaEnPeriodo(txs, tarjeta, per, moneda);
  const dec = saldoDeclarado(declarados, tarjeta.id, per, moneda);
  if (!dec) return { app, banco: null, cuando: null, dif: 0, total: app };
  return { app, banco: dec.monto, cuando: dec.cuando,
           dif: round2(dec.monto - app),
           // El que se paga es el del banco. Es todo el punto de anotarlo.
           total: dec.monto };
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
 * Lo que va gastado con las tarjetas contra el mismo tramo del mes pasado.
 *
 * La comparacion obvia —este mes contra el mes pasado entero— miente todos
 * los meses: el dia 5 siempre vas "barbaro" y el 28 siempre vas mal, y lo
 * unico que estas midiendo es que dia es hoy. Se compara CONTRA EL MISMO
 * TRAMO: si hoy es 14, los primeros 14 dias de uno contra los primeros 14
 * del otro.
 *
 * Se mide por COMPRA y no por cuota: una compra en doce cuentea entera el dia
 * que la hiciste, porque eso es lo que decidiste ese dia. Lo que vas a pagar
 * mes a mes es otra pregunta y tiene su propia pantalla —las cuotas
 * comprometidas—; mezclarlas haria que un mes sin comprar nada se viera igual
 * que uno con tres compras chicas.
 *
 * Tambien vuelve el mes pasado COMPLETO, que es contra lo que uno se compara
 * de verdad: "voy 486.000 y el mes pasado terminaste en 892.000" dice a donde
 * vas, y el tramo dice si vas mas rapido o mas lento que entonces.
 */
export function gastoDeTarjetas(txs, tarjetas, ref = hoy(), moneda = 'ARS') {
  const ids = new Set((tarjetas || []).filter(t => t && t.id).map(t => t.id));
  if (!ids.size) return null;

  const per = periodo(ref);
  const previo = periodoSuma(per, -1);
  const dia = ref.getDate();
  // Febrero contra enero: el dia 30 no existe en febrero. Se corta en el
  // ultimo dia que los dos meses tienen, para que el tramo sea el mismo.
  const [y, m] = previo.split('-').map(Number);
  const largoPrevio = new Date(y, m, 0).getDate();
  const corte = Math.min(dia, largoPrevio);

  const sumar = (p, hastaDia) => {
    let total = 0, cuantos = 0;
    for (const tx of txs || []) {
      if (tx.tipo !== 'gasto' || !ids.has(tx.account_id)) continue;
      if (monedaDe(tx) !== moneda) continue;
      const f = parseFecha(tx.fecha);
      if (periodo(f) !== p || f.getDate() > hastaDia) continue;
      total += Math.abs(Number(tx.monto) || 0);
      cuantos++;
    }
    return { total: round2(total), cuantos };
  };

  const ahora = sumar(per, dia);
  const tramo = sumar(previo, corte);
  const completo = sumar(previo, 31);

  return {
    per, previo, dia, corte,
    ahora, tramo, completo,
    dif: round2(ahora.total - tramo.total),
    // Sin nada el mes pasado no hay porcentaje que calcular: "infinito por
    // ciento mas" no es un dato. Se devuelve null y la pantalla lo dice.
    difPct: tramo.total > 0 ? (ahora.total - tramo.total) / tramo.total : null,
    // Que parte del mes pasado ENTERO ya llevas gastada.
    delTotalPrevio: completo.total > 0 ? ahora.total / completo.total : null
  };
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
    if (tx.account_id !== tarjeta.id || tx.tipo !== 'gasto' || monedaDe(tx) !== moneda) continue;
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
    if (tx.tipo !== 'gasto' || monedaDe(tx) !== moneda) continue;
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
export function limiteDeTarjeta(tarjeta, txs, ref = hoy(), moneda = 'ARS', pagado = 0,
                                extra = 0) {
  const limite = Number(tarjeta.limite) || 0;
  let consumido = 0;
  for (const tx of txs) {
    if (tx.account_id !== tarjeta.id || tx.tipo !== 'gasto' || monedaDe(tx) !== moneda) continue;
    for (const c of cronograma(tx, tarjeta, ref)) if (c.pendiente) consumido += c.monto;
  }
  // Pagar el resumen libera el limite en el momento, no cuando vence.
  // `extra` es lo que el banco dice de mas que lo cargado: son consumos que
  // existen y ya estan comiendo el limite aunque todavia no se sepa cuales.
  consumido = round2(Math.max(0, consumido - (Number(pagado) || 0) + (Number(extra) || 0)));
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
    if (monedaDe(tx) !== moneda) {
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
    if (monedaDe(tx) === moneda) { out.push({ tx, entrante: false, monto: Number(tx.monto) || 0 }); continue; }
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
    if (monedaDe(tx) !== moneda || tx.tipo !== 'gasto') continue;
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
  // Un gasto variable no arrastra nada: la luz de este mes no es "de mas" ni
  // "de menos" contra la del anterior, es lo que salio. El monto estimado es
  // una expectativa, no una deuda, y restarselo daba cosas como "$ 26.220 a
  // favor" en una retencion de ingresos brutos.
  if (recurring.variable) return 0;
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
/** Los dias `dia` que caen entre dos fechas. Casi siempre uno; a veces dos. */
function vueltasEntre(desde, hasta, dia) {
  const d = Math.min(31, Math.max(1, Number(dia) || 1));
  const out = [];
  const primero = new Date(desde.getFullYear(), desde.getMonth(), 1);
  for (let k = 0; k < 4; k++) {
    const f = diaSeguro(primero.getFullYear(), primero.getMonth() + k, d);
    if (f > hasta) break;
    if (f >= desde) out.push(f);
  }
  return out;
}

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

    // Cada vuelta del debito que cae DENTRO de la ventana, no una sola.
    //
    // Un resumen dura un mes y entonces una sola vuelta alcanza. Pero cuando
    // la tarjeta cambia de dia de cierre, hay un resumen en el medio que dura
    // mas: si cerraba el 27 y pasa a cerrar el 1, ese va del 27 de agosto al
    // 1 de octubre y adentro caen DOS debitos del dia 28. Dando por hecho que
    // era uno, el resumen quedaba corto por el importe entero del segundo, y
    // encima al ver el primero ya cargado dejaba de prever nada.
    for (const cuando of vueltasEntre(desde, hasta, r.dia_vencimiento)) {
      const ya = (txs || []).some(tx => {
        if (tx.account_id !== tarjeta.id || tx.tipo !== 'gasto') return false;
        const f = parseFecha(tx.fecha);
        // Contra la vuelta que corresponde y no contra la ventana entera: si
        // no, el debito de agosto tapa al de septiembre.
        if (Math.abs((f - cuando) / 86400000) > 6) return false;
        const texto = `${tx.descripcion || ''} ${tx.comercio || ''}`.toLowerCase();
        return nombre && texto.includes(nombre);
      });
      if (!ya) items.push({ ...r, monto: Number(r.monto_estimado) || 0, cuando });
    }
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
export function plataLibre(cuentas, txs, recurrings, pagos, ref = hoy(), moneda = 'ARS',
                           fondos = [], declarados = {}) {
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
    if (cerrado) {
      const falta = faltaPagarDeResumen(txs, t, cerrado, moneda);
      // Si se anoto lo que dice el banco, ESE es el que se paga: sumar el de
      // la app seria apartar cien mil pesos menos de los que van a salir.
      const b = brechaDeTarjeta(txs, t, periodo(cerrado.vence), declarados, moneda);
      resumenes += b.banco != null && falta > 0
        ? Math.max(0, round2(falta + b.dif)) : falta;
    }
    const enCurso = proximoCiclo(t, ref);
    proximo += brechaDeTarjeta(txs, t, periodo(enCurso.vence), declarados, moneda).total;
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

  // Lo apartado en fondos ya tiene dueno. Sigue en la cuenta —la app no mueve
  // nada— pero contarlo como libre es la forma exacta de gastarse la patente:
  // un fondo que no descuenta es una planilla que no cambia ninguna decision.
  const guardado = apartado(fondos, moneda);

  const libre = round2(enCuentas - resumenes - fijos - guardado);
  return {
    enCuentas: round2(enCuentas), resumenes: round2(resumenes), fijos: round2(fijos),
    apartado: guardado,
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

/**
 * De donde sale el "entro y salio" de un mes, fila por fila.
 *
 * Existe porque un total que no cierra con la cabeza de uno no se puede
 * discutir: o se le cree a la app o no se le cree, y cuando no se le cree la
 * app deja de servir. Esto abre el numero: cada ingreso, cada gasto agrupado
 * por categoria, lo que quedo AFUERA a proposito, y los movimientos que
 * parecen cargados dos veces.
 *
 * Lo que queda afuera es la mitad de la explicacion: una transferencia entre
 * cuentas propias y un pago de tarjeta no son gasto —el gasto ya se conto el
 * dia de la compra— y son justo los importes grandes que uno espera ver.
 */
export function deDondeSale(txs, per, moneda = 'ARS', cuentas = []) {
  const esCredito = id => (cuentas.find(a => a.id === id) || {}).tipo === 'credito';
  const delMes = txs.filter(tx => periodo(parseFecha(tx.fecha)) === per &&
                                  monedaDe(tx) === moneda);

  const ingresos = delMes.filter(tx => tx.tipo === 'ingreso');
  const gastos = delMes.filter(tx => tx.tipo !== 'ingreso' && tx.tipo !== 'transferencia');
  const movidas = delMes.filter(tx => tx.tipo === 'transferencia' &&
                                      !esCredito(tx.destino_account_id));
  const pagosTarjeta = delMes.filter(tx => tx.tipo === 'transferencia' &&
                                           esCredito(tx.destino_account_id));

  const suma = l => round2(l.reduce((s, tx) => s + (Number(tx.monto) || 0), 0));

  // Por categoria, de mayor a menor: la suma de estas filas es exactamente el
  // total de arriba, y eso es lo que lo hace verificable.
  const porCat = new Map();
  for (const tx of gastos) {
    const k = tx.category_id || 'sin';
    const c = porCat.get(k) || { id: tx.category_id || null, monto: 0, cuantos: 0 };
    c.monto = round2(c.monto + (Number(tx.monto) || 0));
    c.cuantos++;
    porCat.set(k, c);
  }

  return {
    ingresos: ingresos.map(tx => ({ tx, monto: Number(tx.monto) || 0 }))
                      .sort((a, b) => b.monto - a.monto),
    totalIngresos: suma(ingresos),
    categorias: [...porCat.values()].sort((a, b) => b.monto - a.monto),
    totalGastos: suma(gastos),
    cuantosGastos: gastos.length,
    movidas: { cuantas: movidas.length, monto: suma(movidas) },
    pagosTarjeta: { cuantos: pagosTarjeta.length, monto: suma(pagosTarjeta) },
    repetidos: repetidos(delMes)
  };
}

/**
 * Movimientos que parecen cargados dos veces: mismo dia, mismo importe.
 *
 * Es lo que pasa cuando el mismo consumo entra por el correo y ademas se
 * importa del resumen, o cuando uno lo anota a mano y despues aparece solo.
 * No se borran solos —dos cafes de 4.500 el mismo dia existen— pero un total
 * que no cierra casi siempre empieza aca.
 */
export function repetidos(txs) {
  const grupos = new Map();
  for (const tx of txs) {
    if (tx.tipo === 'transferencia') continue;
    const k = `${String(tx.fecha).slice(0, 10)}|${Math.round(Number(tx.monto) * 100)}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(tx);
  }
  return [...grupos.values()].filter(g => g.length > 1)
    .map(g => ({ fecha: String(g[0].fecha).slice(0, 10), monto: Number(g[0].monto) || 0,
                 cuantos: g.length, txs: g }))
    .sort((a, b) => (b.monto * b.cuantos) - (a.monto * a.cuantos));
}

/**
 * El extracto de una cuenta: de donde salio cada peso que tiene adentro.
 *
 * "Eso estaba en efectivo antes, en algun momento ingreso ese monto y no lo
 * veo": una movida entre cuentas propias no es un ingreso —la plata solo
 * cambia de bolsillo— asi que no aparece en lo que entro en el mes. Entonces
 * la pregunta es de donde salio, y la contesta esta cuenta: arranco en tanto,
 * entro tanto, salio tanto.
 *
 * Y si la cuenta queda en negativo sin ser una tarjeta, falta algo cargado: o
 * el saldo con el que arranco, o un ingreso que nunca se anoto. Eso no es un
 * detalle: es plata que la app cree que no existe.
 */
export function extractoDeCuenta(cuenta, txs, ref = hoy()) {
  const inicial = Number(cuenta.saldo_inicial) || 0;
  const corte = cuenta.saldo_al ? parseFecha(cuenta.saldo_al) : null;
  const filas = [];
  let entradas = 0, salidas = 0;

  for (const tx of txs) {
    const f = parseFecha(tx.fecha);
    if (f > ref) continue;
    if (corte && f < corte) continue;
    const propio = tx.account_id === cuenta.id;
    const destino = tx.destino_account_id === cuenta.id;
    if (!propio && !destino) continue;

    if (tx.tipo === 'transferencia') {
      if (propio) { const m = Number(tx.monto) || 0; salidas += m; filas.push({ tx, entra: false, monto: m }); }
      if (destino) {
        const m = Number(tx.monto_destino != null ? tx.monto_destino : tx.monto) || 0;
        entradas += m; filas.push({ tx, entra: true, monto: m });
      }
      continue;
    }
    if (!propio) continue;
    // En una tarjeta de credito la compra no mueve saldo: sale cuando se paga
    // el resumen. Su extracto son los pagos, no los consumos.
    if (cuenta.tipo === 'credito') continue;
    const m = Number(tx.monto) || 0;
    if (tx.tipo === 'ingreso') { entradas += m; filas.push({ tx, entra: true, monto: m }); }
    else { salidas += m; filas.push({ tx, entra: false, monto: m }); }
  }

  filas.sort((a, b) => (a.tx.fecha < b.tx.fecha ? 1 : a.tx.fecha > b.tx.fecha ? -1 : 0));
  const saldo = round2(inicial + entradas - salidas);
  return {
    inicial: round2(inicial), desde: cuenta.saldo_al || null,
    entradas: round2(entradas), salidas: round2(salidas), saldo, filas,
    // Sin saldo inicial y sin ingresos, todo lo que salio es plata que la app
    // no sabe de donde vino.
    faltaOrigen: cuenta.tipo !== 'credito' && saldo < 0
  };
}

/**
 * Como cerro un mes.
 *
 * Es lo que le falta a la app para que valga la pena cargar todos los dias.
 * Uno anota gastos durante treinta dias y no pasa nada: el dia 1 tiene que
 * pasar algo. Y es el unico momento en que un numero se puede pintar de verde
 * sin mentir, porque el mes ya no se mueve.
 *
 * Las reglas del tono, que son las mismas de Bishu: una cosa por vez, sin
 * retar, y nada de medallas. En una app de plata la racha rota se lee como
 * culpa, y la culpa es la razon numero uno por la que se abandonan.
 *
 * `ref` es el dia desde el que se mira: un mes cerrado de verdad es el que ya
 * termino.
 */
export function cierreDeMes(datos, per, moneda = 'ARS', ref = hoy()) {
  const { cuentas = [], txs = [], recurrings = [], pagos = [], budgets = [],
          categorias = [] } = datos || {};
  const [y, m] = per.split('-').map(Number);
  const finDelMes = new Date(y, m, 0);
  if (ref <= finDelMes) return null;              // todavia no cerro

  const previo = mesAnterior(per);
  const res = resumenMes(txs, per, moneda);
  const antes = resumenMes(txs, previo, moneda);

  // Lo que de verdad quedo: la plata libre subio o bajo. No "ingresos menos
  // gastos", que el dia 1 da un superavit enorme porque el sueldo ya entro y
  // los gastos todavia no salieron.
  const libre = f => plataLibre(cuentas, txs, recurrings, pagos, f, moneda).libre;
  const desde = libre(new Date(y, m - 1, 0));
  const hasta = libre(finDelMes);
  const quedo = round2(hasta - desde);

  // Por categoria, este mes contra el anterior. Sirve la que mas se movio,
  // para arriba y para abajo: una sola de cada lado.
  const nombre = id => (categorias.find(c => c.id === id) || {}).nombre || 'Sin categoría';
  const deAntes = new Map(gastoPorCategoria(txs, previo, moneda).map(c => [c.id || 'sin', c.monto]));
  const cats = gastoPorCategoria(txs, per, moneda).map(c => {
    const previoMonto = deAntes.get(c.id || 'sin') || 0;
    return { id: c.id, nombre: nombre(c.id), monto: c.monto, parte: c.parte,
             antes: previoMonto, cambio: round2(c.monto - previoMonto) };
  });
  // Solo se compara lo que existia antes: una categoria nueva "subio" todo su
  // valor y eso no dice nada.
  const comparables = cats.filter(c => c.antes > 0);
  const subio = comparables.filter(c => c.cambio > 0).sort((a, b) => b.cambio - a.cambio)[0] || null;
  const bajo = comparables.filter(c => c.cambio < 0).sort((a, b) => a.cambio - b.cambio)[0] || null;

  // Los mismos topes que regian ese mes, heredados incluidos: si no cargaste
  // los de septiembre, el cierre de septiembre se mide contra los de agosto,
  // que es contra lo que de verdad estabas midiendo.
  const delMes = topesDelMes(budgets, per).topes;
  const presu = estadoPresupuesto(delMes, res).map(b => ({ ...b, nombre: nombre(b.category_id) }));
  const pasadas = presu.filter(b => b.gastado > b.tope);
  const dentro = presu.filter(b => b.tope > 0 && b.gastado <= b.tope);

  const mayor = txs
    .filter(tx => tx.tipo === 'gasto' && monedaDe(tx) === moneda &&
                  periodo(parseFecha(tx.fecha)) === per)
    .sort((a, b) => Number(b.monto) - Number(a.monto))[0] || null;

  const delMesTxs = txs.filter(tx => periodo(parseFecha(tx.fecha)) === per);
  const cargados = delMesTxs.length;
  const aMano = delMesTxs.filter(tx => !tx.fuente || tx.fuente === 'manual').length;

  return {
    periodo: per, moneda, previo,
    entro: res.ingresos, salio: res.gastos,
    antesSalio: antes.gastos,
    // Positivo = gastaste menos que el mes pasado.
    gastasteMenos: round2(antes.gastos - res.gastos),
    hayConQueComparar: antes.gastos > 0,
    quedo, desde: round2(desde), hasta: round2(hasta),
    ahorro: estadoAhorro(delMes, { cuentas, txs, recurrings, pagos }, per, moneda, ref),
    categorias: cats, subio, bajo,
    presupuesto: presu, pasadas, dentro,
    mayor: mayor ? { nombre: mayor.comercio || mayor.descripcion || 'un gasto',
                     monto: round2(Number(mayor.monto)), categoria: nombre(mayor.category_id) } : null,
    cargados, aMano,
    // Lo unico que se propone para el mes que arranca: la categoria que mas
    // subio, con un tope. Una cosa, no una lista de propositos.
    proponer: subio && !delMes.some(b => b.category_id === subio.id)
      ? { categoria: subio.id, nombre: subio.nombre, tope: redondearTope(subio.antes) }
      : null
  };
}

/** Un tope que se pueda leer: 137.482 no es un tope, 140.000 si. */
function redondearTope(n) {
  const v = Math.abs(Number(n) || 0);
  if (v <= 0) return 0;
  const paso = v >= 1000000 ? 50000 : v >= 100000 ? 10000 : v >= 10000 ? 1000 : 100;
  return Math.round(v / paso) * paso;
}

/** El ultimo mes cerrado a la fecha: el anterior al que corre. */
export const ultimoMesCerrado = (ref = hoy()) => mesAnterior(periodo(ref));

// ---------------------------------------------------------------------
// AUMENTOS QUE VALE LA PENA MIRAR
// ---------------------------------------------------------------------

/**
 * Lo que pagaste de un gasto fijo en un mes, si lo pagaste.
 *
 * Solo sirve lo pagado de verdad. El `monto_estimado` se pisa cuando uno lo
 * actualiza, asi que no tiene historia: usarlo seria comparar el precio de
 * hoy contra el precio de hoy.
 */
export function pagadoEn(recurringId, pagos, per) {
  const p = (pagos || []).find(x => x.recurring_id === recurringId && x.periodo === per &&
                                    x.pagado_at && x.monto != null);
  return p ? Number(p.monto) : null;
}

/** La mediana de una lista de numeros. */
export function mediana(nums) {
  const l = [...nums].sort((a, b) => a - b);
  if (!l.length) return null;
  const m = Math.floor(l.length / 2);
  return l.length % 2 ? l[m] : round2((l[m - 1] + l[m]) / 2);
}

/**
 * Que gasto fijo subio MAS DE LO NORMAL.
 *
 * En Argentina todo sube todos los meses. Avisar por cualquier aumento es
 * avisar por todo, que es lo mismo que no avisar: la regla tiene que medir
 * contra la inflacion del periodo y no contra cero.
 *
 * Y la inflacion no hace falta ir a buscarla afuera: sale de los datos que la
 * app ya tiene. Si TODOS tus fijos subieron 6 % y uno subio 22 %, ese uno no
 * es la inflacion, es otra cosa —casi siempre una promo que se vencio— y es
 * justo el que se puede discutir. La mediana de tus propios aumentos es una
 * medida mejor que el indice del pais, porque es la canasta que pagas vos.
 *
 * Con menos de tres fijos comparables la mediana no dice nada, y entonces se
 * usa la referencia que se le haya puesto a mano. Sin ninguna de las dos, no
 * se opina: no avisar es mejor que avisar cualquier cosa.
 */
export function aumentosSospechosos(recurrings, pagos, per, {
  meses = 3, margen = 10, minimo = 0, referencia = null
} = {}) {
  let desdePer = per;
  for (let i = 0; i < meses; i++) desdePer = mesAnterior(desdePer);

  const cambios = [];
  for (const r of recurrings || []) {
    if (r.activo === false) continue;
    const desde = pagadoEn(r.id, pagos, desdePer);
    const hasta = pagadoEn(r.id, pagos, per);
    if (!(desde > 0) || !(hasta > 0)) continue;
    cambios.push({ r, desde, hasta,
                   subio: round2(((hasta - desde) / desde) * 100),
                   diferencia: round2(hasta - desde) });
  }
  if (!cambios.length) return { normal: null, desdePer, hastaPer: per, comparados: 0, casos: [] };

  const normal = cambios.length >= 3 ? mediana(cambios.map(c => c.subio))
               : (referencia != null ? Number(referencia) : null);
  if (normal == null) {
    return { normal: null, desdePer, hastaPer: per, comparados: cambios.length, casos: [] };
  }

  const casos = cambios
    .filter(c => c.subio - normal >= margen && c.diferencia >= minimo)
    // Ordenado por lo que cuesta en plata, no por el porcentaje: 40 % de una
    // suscripcion de 9.000 no es un problema, 18 % del internet si.
    .sort((a, b) => b.diferencia - a.diferencia)
    .map(c => ({
      id: c.r.id, nombre: c.r.nombre, moneda: c.r.moneda || 'ARS',
      desde: c.desde, hasta: c.hasta, subio: c.subio, diferencia: c.diferencia,
      exceso: round2(c.subio - normal),
      // Lo que costaria si hubiera subido como el resto: es la plata que hay
      // sobre la mesa, y es el numero que decide si vale la pena llamar.
      deberia: round2(c.desde * (1 + normal / 100)),
      demas: round2(c.hasta - c.desde * (1 + normal / 100)),
      queEs: queServicio(c.r.nombre)
    }));

  return { normal: round2(normal), desdePer, hastaPer: per,
           comparados: cambios.length, casos,
           // Con menos de tres, "lo normal" viene de la referencia puesta a
           // mano y hay que decirlo: no es un dato, es un supuesto.
           mediaPropia: cambios.length >= 3 };
}

/**
 * Que clase de servicio es, para saber si tiene con quien discutirse.
 *
 * Internet, cable y celular tienen area de retencion y precio de retencion:
 * el descuento ya existe, solo esta condicionado a que uno se queje. Los
 * otros no, y prometerlo seria mentir.
 */
export function queServicio(nombre = '') {
  const t = String(nombre).toLowerCase();
  if (/flow|cablevis|telecentro|fibertel|internet|wifi|directv|cable/.test(t)) return 'internet';
  if (/personal|movistar|claro|tuenti|celular|linea|línea/.test(t)) return 'celular';
  if (/osde|swiss|galeno|medicus|prepaga|omint|premedic/.test(t)) return 'prepaga';
  if (/seguro|zurich|sancor|federacion|federación|rivadavia|allianz/.test(t)) return 'seguro';
  if (/netflix|spotify|disney|hbo|max|prime|youtube|apple|suscrip/.test(t)) return 'suscripcion';
  return null;
}

// ---------------------------------------------------------------------
// LO QUE VIENE: LOS MESES QUE TODAVIA NO LLEGARON
// ---------------------------------------------------------------------

/**
 * Como queda cada uno de los proximos meses, mes por mes.
 *
 * La app sabe decir cuanto debes AHORA. Lo que no decia —y es el problema de
 * fondo— es que una compra en cuotas no se paga hoy: se paga con plata de un
 * mes que todavia no llego. Una cuota de 80.000 a doce meses no son 80.000,
 * son 80.000 de agosto, de septiembre y de otros diez meses que ya estan
 * comprometidos antes de empezar.
 *
 * Para cada mes: lo que se espera que entre, lo que ya esta comprometido
 * —cuotas de compras viejas y gastos fijos— y lo que queda. `pct` es que
 * parte de lo que entra ya tiene dueno.
 *
 * `entra` se pasa de afuera porque la proyeccion del sueldo vive en
 * sueldo.js, que sabe de paritarias y de meses atipicos. Sin ese dato se usa
 * el promedio de lo que entro, que es peor pero no miente sobre si mismo.
 */
export function proyeccionMeses(datos, { meses = 6, entra = null, extra = null } = {},
                                ref = hoy()) {
  const { cuentas = [], txs = [], recurrings = [] } = datos || {};
  const tarjetas = cuentas.filter(a => a.tipo === 'credito' && a.activo !== false);
  const esperado = entra != null ? Number(entra) : ingresoTipico(txs, ref);

  const out = [];
  for (let i = 1; i <= meses; i++) {
    const d = new Date(ref.getFullYear(), ref.getMonth() + i, 1);
    const per = periodo(d);

    // Cuotas de compras ya hechas que vencen ese mes, tarjeta por tarjeta.
    let cuotas = 0;
    const detalle = [];
    for (const t of tarjetas) {
      if ((t.moneda || 'ARS') !== 'ARS') continue;
      for (const c of cuotasComprometidas(txs, t, per, 'ARS')) {
        cuotas = round2(cuotas + c.monto);
        detalle.push({ nombre: c.tx.comercio || c.tx.descripcion || 'una compra',
                       monto: c.monto, nro: c.nro, total: c.total, tarjeta: t.nombre });
      }
    }

    // Los gastos fijos se repiten: es plata que ya tiene dueno todos los meses.
    const fijos = round2((recurrings || [])
      .filter(r => r.activo !== false && (r.moneda || 'ARS') === 'ARS')
      .reduce((s, r) => s + (Number(r.monto_estimado) || 0), 0));

    // Lo que sumaria una compra que todavia no hiciste.
    const dela = extra ? cuotaDe(extra, i) : 0;

    const comprometido = round2(cuotas + fijos + dela);
    out.push({
      periodo: per, entra: esperado, cuotas, fijos, extra: dela, comprometido,
      libre: round2(esperado - comprometido),
      pct: esperado > 0 ? Math.round((comprometido / esperado) * 100) : null,
      detalle: detalle.sort((a, b) => b.monto - a.monto)
    });
  }
  return out;
}

/** Lo que aporta al mes `i` una compra de `monto` en `cuotas`. */
function cuotaDe({ monto = 0, cuotas = 1 } = {}, i) {
  const n = Math.max(1, Number(cuotas) || 1);
  // La primera cuota cae el mes que viene: lo que se compra hoy entra en el
  // resumen que se paga despues.
  return i <= n ? round2(Number(monto) / n) : 0;
}

/**
 * Lo que suele entrar por mes, cuando no hay proyeccion de sueldo.
 *
 * La mediana de los ultimos meses cerrados y no el promedio: un mes con
 * aguinaldo levanta el promedio y hace parecer que entra mas de lo que entra
 * todos los meses.
 */
export function ingresoTipico(txs, ref = hoy(), meses = 6) {
  const valores = [];
  // Desde 0 y no desde 1: el sueldo cae el 1, asi que el mes en curso ya
  // suele tener el dato. Los meses sin ingresos quedan afuera igual, asi que
  // un mes en curso todavia vacio no arrastra la mediana para abajo.
  for (let i = 0; i <= meses; i++) {
    const p = periodo(new Date(ref.getFullYear(), ref.getMonth() - i, 1));
    const r = resumenMes(txs, p, 'ARS');
    if (r.ingresos > 0) valores.push(r.ingresos);
  }
  return valores.length ? (mediana(valores) || 0) : 0;
}

/**
 * El mes que aprieta, si hay uno.
 *
 * Avisar por cada compra en cuotas seria avisar por todo. Lo que importa es
 * el mes en que lo comprometido se come una parte grande de lo que entra: ese
 * es el mes en el que uno vuelve a usar la tarjeta para llegar, que es
 * justamente el circulo que hay que cortar.
 */
export function mesQueAprieta(proyeccion, umbral = 70) {
  const conDato = (proyeccion || []).filter(m => m.pct != null);
  if (!conDato.length) return null;
  const peor = conDato.reduce((a, b) => (b.pct > a.pct ? b : a));
  return peor.pct >= umbral ? peor : null;
}

// ---------------------------------------------------------------------
// CUENTA REMUNERADA
// ---------------------------------------------------------------------

/**
 * Lo que rinde la plata quieta.
 *
 * Mercado Pago, Personal Pay y el FIMA de Galicia pagan todos los dias sobre
 * el saldo. Es plata que se gana sin hacer nada, y con inflacion es la
 * diferencia entre perder poder de compra despacio o rapido.
 *
 * DECISION IMPORTANTE: esto NO crea movimientos.
 *
 * Devengar el rendimiento como transacciones haria que el saldo de la app
 * suba solo, con plata que la app se inventa a partir de una tasa que uno
 * escribio a mano y que cambia cada semana. Un saldo inventado se cree igual
 * que uno real, y el dia que no coincide con el banco ya no se sabe cual de
 * los dos esta mal. El rendimiento de verdad entra como entra todo lo demas:
 * por el resumen o por el aviso del banco.
 *
 * Asi que esto estima y lo dice: cuanto esta rindiendo, cuanto va del mes, y
 * —lo unico que se puede decidir— cual de tus cuentas rinde mas.
 */
export function rinde(cuenta) {
  const tna = Number(cuenta?.tna);
  return Number.isFinite(tna) && tna > 0 ? tna : null;
}

/** Lo que gana por dia un saldo a esa tasa. */
export function porDia(saldo, tna) {
  const t = Number(tna);
  if (!(t > 0) || !(Number(saldo) > 0)) return 0;
  return round2((Number(saldo) * (t / 100)) / 365);
}

/**
 * Lo que rindio en el mes, dia por dia y no sobre el saldo de hoy.
 *
 * Importa: si el sueldo entro el 5 y se fue el 20, el saldo de hoy no dice
 * nada de lo que hubo adentro del mes. Se toma el saldo de cada dia hasta
 * hoy —el mes que corre no rinde por adelantado— y se suma.
 */
export function rindioEnElMes(cuenta, txs, per, ref = hoy()) {
  const tna = rinde(cuenta);
  if (!tna) return 0;
  const [y, m] = per.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  const corre = periodo(ref) === per;
  const hasta = corre ? Math.min(ref.getDate(), ultimo) : ultimo;

  let total = 0;
  for (let d = 1; d <= hasta; d++) {
    const saldo = saldoDeCuenta(cuenta, txs, new Date(y, m - 1, d),
                                cuenta.saldo_inicial, cuenta.saldo_al);
    total += porDia(saldo, tna);
  }
  return round2(total);
}

/**
 * Lo que de verdad te acreditaron por rendimiento en el mes.
 *
 * Es contra esto que se compara la estimacion. Si la tasa que cargaste esta
 * vieja, la diferencia lo grita sola y no hay que salir a buscarla.
 */
const DICE_RENDIMIENTO =
  /rendimiento|remunerad|intereses|inter[eé]s|ganancia|fima|fondo com[uú]n|rescate/i;

/**
 * Si esta fila es un rendimiento de cuenta remunerada.
 *
 * Vive aca y no en cada pantalla porque las tres que lo necesitan tenian su
 * propia lista de palabras, ligeramente distinta: una reconocia "intereses"
 * y otra no, y el mismo movimiento se plegaba en una pantalla y en la otra
 * no.
 */
export function esRendimiento(tx) {
  return tx?.tipo === 'ingreso' &&
    DICE_RENDIMIENTO.test(`${tx.comercio || ''} ${tx.descripcion || ''}`);
}

export function acreditadoEnElMes(cuenta, txs, per) {
  let total = 0;
  for (const tx of txs || []) {
    if (tx.tipo !== 'ingreso') continue;
    if (tx.account_id !== cuenta.id) continue;
    if (periodo(parseFecha(tx.fecha)) !== per) continue;
    if (!DICE_RENDIMIENTO.test(`${tx.comercio || ''} ${tx.descripcion || ''}`)) continue;
    total += Math.abs(Number(tx.monto) || 0);
  }
  return round2(total);
}

/**
 * Donde esta rindiendo tu plata, y cuanto perdes por tenerla en otro lado.
 *
 * Es la unica pregunta accionable de todo esto. Cuanto rindio el mes pasado
 * lo dice el banco; lo que el banco no te dice nunca es que la misma plata,
 * en la cuenta de al lado, rendiria el doble.
 *
 * La comparacion se hace solo entre cuentas de la misma moneda y solo con
 * plata que se puede mover: el efectivo no rinde en ningun lado y una tarjeta
 * no tiene saldo que rinda.
 */
export function dondeRinde(cuentas, txs, { moneda = 'ARS', per = null } = {}, ref = hoy()) {
  const p = per || periodo(ref);
  const mias = (cuentas || []).filter(c =>
    c.activo !== false && c.tipo !== 'credito' && (c.moneda || 'ARS') === moneda);

  const filas = mias.map(c => {
    const saldo = saldoDeCuenta(c, txs, ref, c.saldo_inicial, c.saldo_al);
    const tna = rinde(c);
    return {
      cuenta: c, saldo: round2(saldo), tna,
      porDia: porDia(saldo, tna),
      estimado: rindioEnElMes(c, txs, p, ref),
      acreditado: acreditadoEnElMes(c, txs, p),
      // Cuando la tasa se cargo. Una de hace tres meses no sirve para decidir
      // nada, y callarlo seria hacerla pasar por actual.
      tnaAl: c.tna_al || null
    };
  }).sort((a, b) => (b.tna || 0) - (a.tna || 0) || b.saldo - a.saldo);

  const mejor = filas.find(f => f.tna) || null;
  // Lo que estaria ganando de mas si la plata quieta estuviera en la que mas
  // rinde. Solo cuenta lo que rinde MENOS que la mejor: mover plata de una
  // cuenta que rinde igual no cambia nada.
  // El efectivo queda afuera de la recomendacion. Rinde cero, si, pero uno
  // tiene efectivo por razones que la app no ve —la feria, el service, lo que
  // no quiere que pase por ningun lado— y decirle todos los dias que lo
  // deposite es la clase de consejo que hace apagar la seccion.
  const quieta = filas.filter(f => mejor && f.cuenta.id !== mejor.cuenta.id &&
                                   f.cuenta.tipo !== 'efectivo' &&
                                   f.saldo > 0 && (f.tna || 0) < mejor.tna);
  const dejasDeGanar = round2(quieta.reduce((s, f) =>
    s + porDia(f.saldo, mejor.tna) - f.porDia, 0));

  return {
    filas, mejor, moneda,
    porDia: round2(filas.reduce((s, f) => s + f.porDia, 0)),
    estimado: round2(filas.reduce((s, f) => s + f.estimado, 0)),
    acreditado: round2(filas.reduce((s, f) => s + f.acreditado, 0)),
    dejasDeGanar,
    // Las que tendrian la plata mal puesta, de la que mas plata tiene.
    mover: quieta.sort((a, b) => b.saldo - a.saldo)
  };
}

/** Una tasa de hace mucho no sirve para decidir: se avisa en vez de usarla callado. */
export const tasaVieja = (fila, ref = hoy(), dias = 60) =>
  !!fila.tna && (!fila.tnaAl ||
    (ref - parseFecha(fila.tnaAl)) / 86400000 > dias);

/**
 * Los topes que rigen este mes, aunque nadie los haya vuelto a cargar.
 *
 * El presupuesto se guarda por periodo, asi que el dia 1 de cada mes no habia
 * ninguno: la seccion decia "sin topes cargados" y con eso se apagaban solas
 * la deteccion de excedidos, el aviso al telefono y el color del hero. No se
 * veia como un error, se veia como que la app dejo de opinar.
 *
 * Un tope no caduca el 31. Si en agosto decidiste no pasarte de 400.000 en
 * supermercado, en septiembre sigue siendo tu numero hasta que digas otra
 * cosa. Asi que se heredan del ultimo mes que los tenga.
 *
 * Se heredan pero no se esconden: vienen marcados con el mes del que salieron
 * para que la pantalla lo diga. Heredar en silencio seria peor que no
 * heredar, porque un tope de hace cuatro meses no se discute solo.
 */
export function topesDelMes(budgets, per, { meses = 6 } = {}) {
  const propios = (budgets || []).filter(b => b.periodo === per);
  if (propios.length) return { topes: propios, heredados: false, de: null };

  let p = per;
  for (let i = 0; i < meses; i++) {
    p = mesAnterior(p);
    const viejos = (budgets || []).filter(b => b.periodo === p);
    if (viejos.length) {
      // Con el periodo cambiado: lo que se devuelve tiene que poder usarse
      // como si fuera de este mes. El id se deja para poder rastrearlo, pero
      // guardarlos crea filas nuevas, no pisa las de aquel mes.
      return { topes: viejos.map(b => ({ ...b, periodo: per, heredadoDe: p })),
               heredados: true, de: p };
    }
  }
  return { topes: [], heredados: false, de: null };
}

// ---------------------------------------------------------------------
// FONDOS: lo que no cae todos los meses
// ---------------------------------------------------------------------

/**
 * Como viene un fondo contra su objetivo.
 *
 * El seguro del auto, la patente, la matricula, las vacaciones. Se saben desde
 * enero y aparecen como una sorpresa igual, porque no hay ningun lugar donde
 * la plata este esperandolos.
 *
 * El numero que importa no es cuanto llevas sino CUANTO POR MES: "faltan
 * 340.000 y cinco meses" no se puede decidir; "68.000 por mes" si.
 *
 * Y no inventa plata: lo guardado son los aportes que anotaste, uno por uno.
 * La app no mueve nada sola —esa plata sigue en tu cuenta— lo que hace es
 * decir que ya tiene dueño.
 */
export function estadoFondo(fondo, ref = hoy()) {
  const aportes = Array.isArray(fondo.aportes) ? fondo.aportes : [];
  const guardado = round2(aportes.reduce((s, a) => s + (Number(a.monto) || 0), 0));
  const objetivo = Number(fondo.objetivo) || 0;
  const falta = round2(Math.max(0, objetivo - guardado));
  const pct = objetivo > 0 ? Math.min(100, Math.round((guardado / objetivo) * 100)) : 0;

  const fecha = fondo.fecha_objetivo ? parseFecha(fondo.fecha_objetivo) : null;
  // Meses enteros que quedan, contando el que corre: si es 4 de septiembre y
  // vence en diciembre, hay cuatro sueldos por delante, no tres.
  const meses = fecha
    ? Math.max(0, (fecha.getFullYear() - ref.getFullYear()) * 12 +
                  (fecha.getMonth() - ref.getMonth()) + 1)
    : null;
  const porMes = meses && meses > 0 ? round2(falta / meses) : null;

  // Si hubieras venido apartando parejo desde el primer aporte, cuanto
  // tendrias hoy. Es contra eso que se dice si vas atrasado, y no contra una
  // regla inventada.
  const primero = aportes.map(a => String(a.fecha).slice(0, 10)).sort()[0] || null;
  let deberia = null;
  if (fecha && primero && objetivo > 0) {
    const desde = parseFecha(primero);
    const total = Math.max(1, (fecha.getFullYear() - desde.getFullYear()) * 12 +
                              (fecha.getMonth() - desde.getMonth()) + 1);
    const pasados = Math.min(total, Math.max(0,
      (ref.getFullYear() - desde.getFullYear()) * 12 + (ref.getMonth() - desde.getMonth()) + 1));
    deberia = round2((objetivo / total) * pasados);
  }

  return {
    fondo, guardado, objetivo, falta, pct, meses, porMes, deberia,
    listo: objetivo > 0 && guardado >= objetivo,
    // Atrasado solo si hay con que compararlo. Sin fecha o sin aportes no se
    // opina: decir "vas atrasado" sin saberlo es peor que no decir nada.
    atraso: deberia != null ? round2(Math.max(0, deberia - guardado)) : null,
    // Se paso la fecha y no llego.
    vencido: !!(fecha && fecha < ref && objetivo > 0 && guardado < objetivo)
  };
}

/**
 * Lo apartado en fondos, que ya no es plata libre.
 *
 * Es toda la idea del sobre: la plata sigue en la cuenta, pero tiene dueno.
 * Si no se descuenta, el fondo es una planilla que mira uno y no cambia
 * ninguna decision.
 */
export function apartado(fondos, moneda = 'ARS') {
  return round2((fondos || [])
    .filter(f => f.activo !== false && (f.moneda || 'ARS') === moneda)
    .reduce((s, f) => s + estadoFondo(f).guardado, 0));
}

// ---------------------------------------------------------------------
// DEUDAS: lo que se debe, en las dos direcciones
// ---------------------------------------------------------------------

/**
 * Lo que debes y lo que te deben, en una moneda.
 *
 * Solo deudas: los bienes quedan afuera a proposito. Un auto tasado a mano
 * envejece mal y termina inflando un patrimonio que nadie puede gastar. Una
 * deuda, en cambio, es un numero exacto que alguien mas tambien conoce.
 */
export function estadoDeudas(deudas, moneda = 'ARS', ref = hoy()) {
  const vivas = (deudas || []).filter(d => !d.saldada && (d.moneda || 'ARS') === moneda);
  const debo = vivas.filter(d => d.direccion !== 'medeben');
  const meDeben = vivas.filter(d => d.direccion === 'medeben');
  const suma = l => round2(l.reduce((s, d) => s + (Number(d.monto) || 0), 0));

  const vencidas = vivas.filter(d => d.vence && parseFecha(d.vence) < ref);
  return {
    debo: suma(debo), meDeben: suma(meDeben),
    neto: round2(suma(meDeben) - suma(debo)),
    lista: [...debo, ...meDeben].sort((a, b) =>
      (a.vence || '9999') < (b.vence || '9999') ? -1 : 1),
    vencidas
  };
}

/**
 * Suscripciones que conviene revisar, sin adivinar si las usas.
 *
 * Es el negocio entero de las apps que "cancelan suscripciones por vos", y la
 * parte que ninguna puede resolver: la app ve que pagas Netflix todos los
 * meses; lo que no puede ver es si lo mirás. Adivinarlo por el monto o por la
 * antiguedad seria inventar.
 *
 * Asi que no adivina: pregunta, una vez por ano por cada una, y se acuerda de
 * la respuesta. Preguntar una vez al ano es un costo bajisimo; equivocarse
 * diciendo "esto no lo usas" es la clase de cosa que hace desinstalar.
 *
 * `revisadas` es { [id]: 'YYYY-MM-DD' }, la ultima vez que se contesto.
 */
export function suscripcionesARevisar(recurrings, pagos, revisadas = {}, ref = hoy(),
                                      { meses = 12 } = {}) {
  const per = periodo(ref);
  const out = [];
  for (const r of recurrings || []) {
    if (r.activo === false) continue;
    // Solo las que parecen suscripcion: un alquiler no se "deja de usar".
    if (!/suscrip|streaming|netflix|spotify|disney|hbo|max\b|prime|youtube|icloud|dropbox|gym|gimnasio|club|revista|diario|plan\b/i
        .test(`${r.nombre || ''}`)) continue;

    const ultima = revisadas[r.id] ? parseFecha(revisadas[r.id]) : null;
    const meses12 = new Date(ref.getFullYear(), ref.getMonth() - meses, ref.getDate());
    if (ultima && ultima > meses12) continue;

    // Cuanto sale por ano, que es el numero con el que uno decide de verdad:
    // "9.000 por mes" no suena a nada, "108.000 por ano" si.
    const ultimoPago = pagadoEn(r.id, pagos || [], per) ??
                       pagadoEn(r.id, pagos || [], mesAnterior(per));
    const mensual = Number(ultimoPago ?? r.monto_estimado) || 0;
    out.push({ recurring: r, nombre: r.nombre, mensual,
               alAno: round2(mensual * 12), moneda: r.moneda || 'ARS',
               desdeUltimaRevision: ultima ? Math.round((ref - ultima) / 86400000) : null });
  }
  return out.sort((a, b) => b.alAno - a.alAno);
}
