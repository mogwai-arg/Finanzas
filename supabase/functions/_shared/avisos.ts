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
  gastadoEsteMes?: number;   // hasta hoy
  gastadoMesPasado?: number; // hasta el mismo dia del mes pasado
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
  if (on('resumen')) {
    for (const t of d.cuentas ?? []) {
      if (t.tipo !== 'credito' || t.activo === false || !t.cierre_dia) continue;
      if (dias(hoy, diaSeguro(hoy.getFullYear(), hoy.getMonth(), t.cierre_dia)) !== 1) continue;
      out.push(msg('resumen', `${t.nombre} cierra mañana`,
        'Lo que compres después entra en el resumen siguiente.', `cierre-${t.id}`, './#/tarjetas'));
    }
  }

  // --------------------------------------------------------------- aumentos
  if (on('aumentos')) {
    for (const a of d.aumentos ?? []) {
      out.push(msg('aumentos', a.titulo || 'Subió un gasto fijo',
        a.cuerpo || 'Miralo en El mes y confirmá si lo actualizo.', `aum-${a.id}`, './#/mes'));
    }
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

  return out;
}

const msg = (tipo: string, titulo: string, cuerpo: string, tag: string, url = './#/hoy'): Mensaje =>
  ({ tipo, titulo, cuerpo, tag, url });
