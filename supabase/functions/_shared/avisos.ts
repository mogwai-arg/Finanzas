// =====================================================================
// avisos.ts — qué tiene para avisar Bishu hoy.
//
// Es una funcion pura: entran los datos del usuario, salen los mensajes.
// Toda la decision —que avisar, en que orden, con que palabras— se prueba
// aca, y la funcion de cron solo hace la parte aburrida de ir a buscar los
// datos y mandar los avisos.
//
// El tono es el mismo que el de js/bishu.js, y las reglas tambien: una cosa
// por vez, sin retar, corto. Estan escritas dos veces porque de un lado
// corre el navegador y del otro Deno, pero si cambia una tiene que cambiar
// la otra.
// =====================================================================

export type Cuenta = {
  id: string; nombre: string; tipo: string; moneda?: string; activo?: boolean;
  cierre_dia?: number | null; vencimiento_dia?: number | null;
  // Las seis fechas que publica el resumen. Estaban en la base y no en este
  // tipo, asi que el aviso de cierre las ignoraba y calculaba con el dia
  // fijo: en Galicia el cierre no cae un dia fijo, asi que avisaba el dia
  // equivocado o no avisaba.
  ciclos?: { cierre: string; vence?: string | null }[] | null;
  saldo_inicial?: number | null; saldo_al?: string | null;
};
export type Tx = {
  tipo: string; monto: number; moneda?: string; fecha: string;
  account_id?: string | null; destino_account_id?: string | null;
  monto_destino?: number | null;
};
export type Mensaje = { tipo: string; titulo: string; cuerpo: string; url: string; tag: string };

const plata = (n: number, moneda = 'ARS') =>
  `${moneda === 'USD' ? 'US$' : '$'} ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
    .format(Math.abs(Math.round(Number(n) || 0)))}`;

const aFecha = (s: string) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};
const dias = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);
const ultimoDia = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const diaSeguro = (y: number, m: number, d: number) => new Date(y, m, Math.min(d, ultimoDia(y, m)));

/**
 * Saldo de una cuenta hoy. Es la misma regla que en finance.js: una
 * transferencia resta en el origen y suma en el destino —con monto_destino si
 * cambia de moneda— y una compra con tarjeta de credito no toca la cuenta.
 */
export function saldoDeCuenta(cuenta: Cuenta, txs: Tx[], ref: Date): number {
  let saldo = Number(cuenta.saldo_inicial) || 0;
  const corte = cuenta.saldo_al ? aFecha(cuenta.saldo_al) : null;
  for (const tx of txs) {
    const f = aFecha(tx.fecha);
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
    if (cuenta.tipo === 'credito') continue;
    saldo += tx.tipo === 'ingreso' ? Number(tx.monto) : -Number(tx.monto);
  }
  return Math.round(saldo * 100) / 100;
}

/** Si la promo aplica ese dia, con la misma regla que usa la app. */
export function promoAplica(p: any, ref: Date): boolean {
  if (p.activa === false) return false;
  const iso = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-${String(ref.getDate()).padStart(2, '0')}`;
  if (p.vigencia_desde && p.vigencia_desde > iso) return false;
  if (p.vigencia_hasta && p.vigencia_hasta < iso) return false;
  const d: number[] = p.dias || [];
  return d.length === 0 || d.includes(ref.getDay());
}

export type Datos = {
  prefs?: Record<string, boolean>;
  saldoMinimo?: number;
  cuentas?: Cuenta[];
  txs?: Tx[];
  recurrings?: any[];
  pagos?: any[];
  promos?: any[];
  aumentos?: any[];          // notificaciones tipo 'aumento' sin leer
  // Pagos de gastos fijos de los ultimos meses, para ver cual se despego.
  pagosViejos?: any[];
  inflacionRef?: number | null;
  gastadoEsteMes?: number;   // hasta hoy
  gastadoMesPasado?: number; // hasta el mismo dia del mes pasado
  // Para el cierre del dia 1: el mes que acaba de terminar, entero.
  salioMesCerrado?: number;
  salioMesAnterior?: number;
  movimientosMesCerrado?: number;
  // La foto de los meses que vienen, calculada por la app. Ver proyeccion.js.
  proyeccion?: { calculada?: string; meses?: any[] } | null;
  // Los topes del mes y lo gastado contra cada uno. Los arma el cron con la
  // misma regla de herencia que la app: un tope no vence el 31.
  topes?: { id: string; nombre: string; gastado: number; tope: number }[];
  // Las claves de tope ya avisadas, para no repetir el mismo todos los días.
  topesAvisados?: string[];
  alertPct?: number;
};

/**
 * Los avisos de hoy, del mas urgente al menos.
 *
 * El orden importa: de aca salen a lo sumo dos al telefono. Lo que hay que
 * pagar va primero porque es lo unico que tiene multa; lo que Bishu opina va
 * ultimo porque puede esperar a que abras la app.
 */
export function avisosDelDia(d: Datos, ref = new Date()): Mensaje[] {
  const on = (k: string) => d.prefs?.[k] !== false;
  const out: Mensaje[] = [];
  const hoy = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const dia = hoy.getDate();
  const per = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

  // ------------------------------------------------------------ vencimientos
  if (on('pagos')) {
    for (const r of d.recurrings ?? []) {
      if (r.activo === false) continue;
      const pago = (d.pagos ?? []).find(p => p.recurring_id === r.id && p.periodo === per && p.pagado_at);
      if (pago) continue;
      const vence = diaSeguro(hoy.getFullYear(), hoy.getMonth(), r.dia_vencimiento || 1);
      const n = dias(hoy, vence);
      const monto = plata(r.monto_estimado, r.moneda);
      if (n === 0) out.push(msg('pagos', `Hoy vence ${r.nombre}`, `${monto}. Cuando lo pagues, tildalo y yo hago la cuenta.`, `fijo-${r.id}`));
      else if (n === 2) out.push(msg('pagos', `${r.nombre} vence en 2 días`, `${monto}.`, `fijo-${r.id}`));
      else if (n === -1) out.push(msg('pagos', `${r.nombre} venció ayer`, `${monto} y sigue impago.`, `fijo-${r.id}`));
    }
    for (const t of d.cuentas ?? []) {
      if (t.tipo !== 'credito' || t.activo === false || !t.vencimiento_dia) continue;
      const n = dias(hoy, diaSeguro(hoy.getFullYear(), hoy.getMonth(), t.vencimiento_dia));
      if (n === 0) out.push(msg('pagos', `Hoy vence ${t.nombre}`, 'Mirá en Hoy cuánto quedó por pagar.', `tj-${t.id}`));
      else if (n === 2) out.push(msg('pagos', `${t.nombre} vence en 2 días`, 'Mirá en Hoy cuánto quedó por pagar.', `tj-${t.id}`));
    }
  }

  // ------------------------------------------------------------------ saldo
  if (on('saldo')) {
    const minimo = Number(d.saldoMinimo) || 0;
    for (const c of d.cuentas ?? []) {
      if (c.tipo === 'credito' || c.activo === false) continue;
      const saldo = saldoDeCuenta(c, d.txs ?? [], hoy);
      if (saldo < 0)
        out.push(msg('saldo', `${c.nombre} quedó en rojo`, `${plata(saldo, c.moneda)} en contra.`, `saldo-${c.id}`));
      else if (minimo > 0 && saldo < minimo && (c.moneda || 'ARS') === 'ARS')
        out.push(msg('saldo', `Queda poco en ${c.nombre}`, `${plata(saldo)}, por debajo del mínimo que pusiste.`, `saldo-${c.id}`));
    }
  }

  // ----------------------------------------------------------------- promos
  if (on('promos')) {
    for (const p of d.promos ?? []) {
      if (!p.recordar || !promoAplica(p, hoy)) continue;
      const detalle = [`${Number(p.valor) || 0}% de ${p.tipo || 'descuento'}`,
                       p.medio_pago, p.tope ? `tope ${plata(p.tope)}` : null]
        .filter(Boolean).join(' · ');
      out.push(msg('promos', `Hoy: ${p.titulo || p.comercio}`, detalle, `promo-${p.id}`, './#/promos'));
    }
  }

  // ------------------------------------------------------------ cierre de tarjeta
  //
  // Dos avisos y no uno. El de la vispera sirve para decidir con que pagar
  // —una compra de hoy entra en este resumen y una de pasado en el que
  // viene—. El del dia del cierre sirve para otra cosa: ya no se puede
  // decidir nada sobre lo que entro, lo que hay que saber es HASTA CUANDO
  // hay tiempo de pagarlo. Antes solo existia el primero.
  if (on('resumen')) {
    for (const t of d.cuentas ?? []) {
      if (t.tipo !== 'credito' || t.activo === false) continue;
      const c = cierreCercano(t, hoy);
      if (!c) continue;
      const cuando = `${c.vence.getDate()}/${c.vence.getMonth() + 1}`;
      const faltan = dias(hoy, c.vence);
      if (c.dias === 0) {
        out.push(msg('resumen', `${t.nombre} cerró hoy`,
          `Vence el ${cuando}: ${faltan <= 0 ? 'se paga hoy'
            : `tenés ${faltan} ${faltan === 1 ? 'día' : 'días'}`}. ` +
          'Lo que compres a partir de mañana entra en el resumen siguiente.' +
          (c.declarado ? '' : ' (fecha estimada: falta cargar el cierre del resumen)'),
          `cerro-${t.id}`, './#/mes'));
      } else {
        out.push(msg('resumen', `${t.nombre} cierra mañana`,
          `Lo que compres desde pasado mañana entra en el resumen siguiente. ` +
          `Este vence el ${cuando}.`, `cierre-${t.id}`, './#/mes'));
      }
    }
  }

  // --------------------------------------------------------------- aumentos
  if (on('aumentos')) {
    for (const a of d.aumentos ?? []) {
      out.push(msg('aumentos', a.titulo || 'Subió un gasto fijo',
        a.cuerpo || 'Miralo en El mes y confirmá si lo actualizo.', `aum-${a.id}`, './#/mes'));
    }
  }

  // ------------------------------------------------- subio mas que el resto
  //
  // Una vez por mes y no todos los dias: es plata sobre la mesa, pero de las
  // que se resuelven con una llamada, no en el momento. El dia 5, cuando los
  // fijos del mes ya se pagaron.
  //
  // La regla que lo hace util es que compara contra lo que subio EL RESTO de
  // tus fijos, no contra cero: en Argentina avisar por cualquier aumento es
  // avisar por todo, que es lo mismo que no avisar.
  const despegado = dia === 5
    ? seDespegoDelResto(d.recurrings ?? [], d.pagosViejos ?? [], per, d.inflacionRef ?? null)
    : null;
  if (on('aumentos') && despegado) {
    const a = despegado;
    out.push(msg('aumentos', `${a.nombre} subió ${Math.round(a.subio)} % en tres meses`,
      `El resto de tus fijos subió ${Math.round(a.normal)} %. Son ${plata(a.demas, a.moneda)} ` +
      'de más por mes: casi siempre es una promo que se venció.',
      `despego-${a.nombre}`, './#/mes'));
  }

  // ------------------------------------------------------------- cómo venís
  // Una vez por semana y no todos los días: es una opinión, no una urgencia.
  if (on('bishu') && hoy.getDay() === 1 && dia > 7) {
    const antes = Number(d.gastadoMesPasado) || 0;
    const ahora = Number(d.gastadoEsteMes) || 0;
    if (antes > 0 && ahora > 0) {
      const dif = ahora - antes;
      if (Math.abs(dif) / antes >= 0.08 && Math.abs(dif) >= 1000) {
        out.push(dif < 0
          ? msg('bishu', `Vas ${plata(dif)} menos que el mes pasado`, 'A esta altura del mes. Bien ahí.', 'bishu')
          : msg('bishu', `Vas ${plata(dif)} más que el mes pasado`, 'A esta altura del mes. Por si querés mirarlo.', 'bishu'));
      }
    }
  }

  // ----------------------------------------------------------- cierre del mes
  //
  // El dia 1, una vez, y solo si hubo mes: es lo unico que la app le devuelve
  // a treinta dias de cargar gastos. Y es el unico aviso que puede decir algo
  // en positivo sin mentir, porque el mes ya no se mueve.
  if (on('cierre') && dia === 1) {
    const salio = Number(d.salioMesCerrado) || 0;
    const antes = Number(d.salioMesAnterior) || 0;
    const cuantos = Number(d.movimientosMesCerrado) || 0;
    const cerrado = mesAnterior(per);
    if (salio > 0 || cuantos > 0) {
      const menos = antes - salio;
      const cuerpo = antes > 0 && Math.abs(menos) >= 1000
        ? (menos > 0 ? `Gastaste ${plata(menos)} menos que el mes anterior.`
                     : `Gastaste ${plata(-menos)} más que el mes anterior.`)
        : `Salieron ${plata(salio)} en ${cuantos} ${cuantos === 1 ? 'movimiento' : 'movimientos'}.`;
      out.push(msg('cierre', `Cerró ${nombreDeMes(cerrado)}`, cuerpo,
                   `cierre-${cerrado}`, `./#/cierre/${cerrado}`));
    }
  }

  // -------------------------------------------------------------- los topes
  //
  // Es el aviso que sirve el dia que sirve y ningun otro: enterarse el 30 de
  // que te pasaste de supermercado no cambia nada; enterarte el 18 de que vas
  // por el 85 % te deja doce dias para hacer algo.
  //
  // Por eso no tiene dia fijo como los demas —se dispara cuando se cruza— y
  // por eso necesita acordarse de lo que ya dijo: repetir "vas por el 85 %"
  // todas las mananas durante dos semanas es la forma mas rapida de que
  // alguien apague los avisos para siempre.
  if (on('tope')) {
    const alerta = Number(d.alertPct) || 80;
    const ya = new Set(d.topesAvisados ?? []);
    const casos = (d.topes ?? [])
      .filter(t => t.tope > 0)
      .map(t => ({ ...t, pct: Math.round((t.gastado / t.tope) * 100) }))
      .filter(t => t.pct >= alerta)
      // Uno por vez y el peor: dos avisos de tope el mismo dia son ruido, y
      // el que importa es el que mas se paso.
      .sort((a, b) => b.pct - a.pct);

    for (const t of casos) {
      const paso = t.pct >= 100;
      const clave = `${per}-${t.id}-${paso ? 'paso' : 'cerca'}`;
      if (ya.has(clave)) continue;
      const queda = Math.round(t.tope - t.gastado);
      out.push(paso
        ? msg('tope', `Te pasaste de ${t.nombre}`,
              `Van ${plata(t.gastado)} de ${plata(t.tope)}: ${plata(-queda)} de más.`,
              clave, './#/estadisticas')
        : msg('tope', `Vas por el ${t.pct} % de ${t.nombre}`,
              `Te quedan ${plata(queda)} para lo que falta del mes.`,
              clave, './#/estadisticas'));
      break;
    }
  }

  // -------------------------------------------------------- lo que ya viene
  //
  // El dia 10 y una vez por mes: lejos del sueldo, lejos de los vencimientos y
  // lejos del cierre, que es cuando uno tiene la cabeza en el mes que corre.
  // El dato es sobre meses futuros y no cambia de un dia para el otro; lo que
  // hace util avisarlo es que llegue ANTES de firmar la proxima compra en
  // cuotas, no despues.
  if (on('viene') && dia === 10) {
    const a = mesApretado(d.proyeccion, hoy);
    if (a) {
      out.push(msg('viene', `En ${nombreDeMes(a.periodo)} te queda poco aire`,
        `Lo que ya está comprometido se lleva el ${a.pct} % de lo que entra: ` +
        `te quedarían ${plata(a.libre)} para todo el mes.`,
        `viene-${a.periodo}`, './#/estadisticas'));
    }
  }

  // Lo que tiene fecha primero, y lo que es una oportunidad al final.
  //
  // Solo salen DOS avisos por vez —tres notificaciones a la mañana no las lee
  // nadie— y hasta ahora los dos eran los primeros de esta lista, que esta
  // escrita en el orden en que se fue programando. Una promo del super podia
  // dejar afuera "la tarjeta cerró hoy, vence el 10": una es una oportunidad
  // y la otra tiene multa.
  const PESO: Record<string, number> = {
    pagos: 0,      // vence un gasto fijo: tiene multa
    resumen: 1,    // cerró la tarjeta: hay una fecha para pagarla
    saldo: 2,      // la cuenta en rojo
    tope: 3,       // te pasaste de lo que te pusiste
    aumentos: 4,   // subió algo y se puede llamar
    cierre: 5,     // cómo cerró el mes
    viene: 6,      // un mes futuro apretado
    promos: 7,     // una oportunidad de hoy
    bishu: 8       // la opinión, que puede esperar a mañana
  };
  return out
    .map((m, i) => ({ m, i }))
    .sort((a, b) => ((PESO[a.m.tipo] ?? 9) - (PESO[b.m.tipo] ?? 9)) || (a.i - b.i))
    .map(x => x.m);
}

/**
 * El primer mes que viene con poco aire, segun la foto que dejo la app.
 *
 * La foto la calcula el navegador —ahi vive el cronograma de cuotas y los
 * ciclos de cada tarjeta— y este lado solo la lee. Si esta vieja no se avisa:
 * un numero de hace dos meses es peor que ningun aviso, porque se cree.
 *
 * El umbral es 70 %: arriba de ahi es el mes en que se vuelve a usar la
 * tarjeta para llegar a fin de mes, que es justo el circulo que hay que
 * cortar. Y se avisa del primero, no del peor: es el que todavia se puede
 * evitar.
 */
export function mesApretado(proy: any, ref: Date, { umbral = 70, vigencia = 20 } = {}) {
  const meses = proy?.meses;
  if (!Array.isArray(meses) || !meses.length) return null;
  if (!proy.calculada) return null;
  const edad = (ref.getTime() - new Date(proy.calculada).getTime()) / 86400000;
  if (!(edad >= 0) || edad > vigencia) return null;

  const per = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
  return meses
    .filter((m: any) => m.periodo > per && Number(m.entra) > 0 && Number(m.pct) >= umbral)
    .sort((a: any, b: any) => String(a.periodo).localeCompare(String(b.periodo)))[0] ?? null;
}

/**
 * El gasto fijo que subio mas que el resto de tus gastos fijos.
 *
 * Es la misma regla que aumentosSospechosos() en finance.js, escrita de nuevo
 * porque de un lado corre el navegador y del otro Deno. Si cambia una tiene
 * que cambiar la otra.
 *
 * Lo que la hace util: mide contra la mediana de TUS propios aumentos, no
 * contra cero. En Argentina todo sube todos los meses; avisar por cualquier
 * aumento es avisar por todo. Con menos de tres fijos comparables la mediana
 * no dice nada y se usa la referencia puesta a mano; sin ninguna de las dos
 * no se opina.
 */
export function seDespegoDelResto(recurrings: any[], pagos: any[], per: string,
                                  referencia: number | null = null, meses = 3, margen = 10) {
  let desdePer = per;
  for (let i = 0; i < meses; i++) desdePer = mesAnterior(desdePer);

  const pagado = (id: string, p: string) => {
    const x = pagos.find(v => v.recurring_id === id && v.periodo === p &&
                              v.pagado_at && v.monto != null);
    return x ? Number(x.monto) : null;
  };

  const cambios: any[] = [];
  for (const r of recurrings) {
    if (r.activo === false) continue;
    const desde = pagado(r.id, desdePer), hasta = pagado(r.id, per);
    if (!(desde! > 0) || !(hasta! > 0)) continue;
    cambios.push({ r, desde, hasta, subio: ((hasta! - desde!) / desde!) * 100 });
  }
  if (!cambios.length) return null;

  const orden = cambios.map(c => c.subio).sort((a, b) => a - b);
  const m = Math.floor(orden.length / 2);
  const normal = cambios.length >= 3
    ? (orden.length % 2 ? orden[m] : (orden[m - 1] + orden[m]) / 2)
    : (referencia != null ? Number(referencia) : null);
  if (normal == null) return null;

  // Ordenado por lo que cuesta en plata y no por el porcentaje: 40 % de una
  // suscripcion de 9.000 no es un problema, 18 % del internet si.
  const casos = cambios
    .filter(c => c.subio - normal >= margen)
    .map(c => ({ nombre: c.r.nombre, moneda: c.r.moneda || 'ARS', subio: c.subio, normal,
                 demas: c.hasta - c.desde * (1 + normal / 100) }))
    .sort((a, b) => b.demas - a.demas);
  return casos[0] ?? null;
}

/**
 * Los topes que rigen ese mes, heredados incluidos.
 *
 * La misma regla que topesDelMes() en finance.js, escrita de nuevo porque de
 * un lado corre el navegador y del otro Deno. Si cambia una tiene que cambiar
 * la otra. Sin esto, el aviso de topes se apagaba solo el 1 de cada mes, que
 * es justo cuando mas sirve.
 */
export function topesQueRigen(budgets: any[], per: string, meses = 6) {
  const propios = (budgets ?? []).filter(b => b.periodo === per);
  if (propios.length) return propios;
  let p = per;
  for (let i = 0; i < meses; i++) {
    p = mesAnterior(p);
    const viejos = (budgets ?? []).filter(b => b.periodo === p);
    if (viejos.length) return viejos;
  }
  return [];
}

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                      'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreDeMes = (per: string) => MESES_LARGOS[Number(per.slice(5, 7)) - 1];
const mesAnterior = (per: string) => {
  const [y, m] = per.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const msg = (tipo: string, titulo: string, cuerpo: string, tag: string, url = './#/hoy'): Mensaje =>
  ({ tipo, titulo, cuerpo, tag, url });

/** Vencimiento del resumen que cierra en `cierre`: el primer dia `vencDia` posterior. */
function vencDe(cierre: Date, vencDia: number): Date {
  const y = cierre.getFullYear(), m = cierre.getMonth();
  let v = diaSeguro(y, m, vencDia);
  if (v <= cierre) v = diaSeguro(y, m + 1, vencDia);
  return v;
}

/**
 * Si esta tarjeta cierra hoy o mañana, y cuando vence ese resumen.
 *
 * Misma regla que finance.js: primero las fechas que publica el resumen del
 * banco, y solo si ninguna cubre el dia de hoy, el dia fijo del mes. En
 * Galicia el cierre no cae un dia fijo —en agosto de 2026 fueron 30-jul,
 * 27-ago y 1-oct— asi que calcular con `cierre_dia` avisa el dia equivocado.
 */
export function cierreCercano(t: Cuenta, hoy: Date):
    { cierre: Date; vence: Date; dias: number; declarado: boolean } | null {
  const vencDia = Number(t.vencimiento_dia) >= 1 && Number(t.vencimiento_dia) <= 31
    ? Number(t.vencimiento_dia) : 10;

  const decl = (t.ciclos ?? []).filter(c => c && c.cierre)
    .map(c => ({ cierre: aFecha(c.cierre), vence: c.vence ? aFecha(c.vence) : null }))
    .sort((a, b) => a.cierre.getTime() - b.cierre.getTime());
  const futuros = decl.filter(c => dias(hoy, c.cierre) >= 0);
  if (futuros.length) {
    const c = futuros[0];
    const dd = dias(hoy, c.cierre);
    // Las fechas del banco mandan: si el proximo cierre no es hoy ni mañana,
    // no se avisa. Caer al dia fijo aca seria avisar dos veces por el mismo
    // resumen, en dos dias distintos.
    return dd <= 1
      ? { cierre: c.cierre, vence: c.vence || vencDe(c.cierre, vencDia), dias: dd, declarado: true }
      : null;
  }

  const cierreDia = Number(t.cierre_dia);
  if (!(cierreDia >= 1 && cierreDia <= 31)) return null;
  for (const m of [0, 1]) {
    const cierre = diaSeguro(hoy.getFullYear(), hoy.getMonth() + m, cierreDia);
    const dd = dias(hoy, cierre);
    if (dd === 0 || dd === 1) {
      return { cierre, vence: vencDe(cierre, vencDia), dias: dd, declarado: false };
    }
  }
  return null;
}
