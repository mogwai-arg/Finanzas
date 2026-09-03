// =====================================================================
// vistas/hoy.js — la pantalla principal.
//
// Responde tres preguntas en orden de urgencia, que es como se usan:
//   1. ¿Cómo vengo este mes?      -> el carrusel de arriba
//   2. ¿Qué tengo que pagar ya?   -> lo que se viene, los tres primeros
//   3. ¿Qué me estoy perdiendo?   -> lo que dice Bishu
//   4. ¿Con qué me conviene pagar? -> antes de comprar
//
// Lo que NO va acá: el presupuesto entero, la proyección del sueldo y la
// lista completa de vencimientos. Cada una tiene su pantalla y ninguna es
// una decisión de hoy. Hoy tiene que leerse de una sola mirada.
// =====================================================================
import { h, frag, icono, iconoDe, hoja, campo, select, aviso } from '../ui.js';
import { state, guardar, fallidas, sincronizar } from '../db.js';
import * as F from '../finance.js';
import { plataPartida, plata, cuandoVence, diasHasta, hoyISO, aFecha, nombreDe,
         aNumero, etiquetaCuenta } from '../formato.js';
import { irA } from '../ruteo.js';
import { formPago } from './mes.js';
import { bishu, frasesDeBishu as F_frases } from '../bishu.js';
import { nombreDelMes } from './cierre.js';

const per = () => hoyISO().slice(0, 7);

/**
 * `arranca` dice en qué ficha del carrusel abrir. Existe para que el link
 * viejo de dólares siga llevando a los dólares, ahora que no son una pestaña
 * aparte sino la tercera ficha.
 */
export function vistaHoy(root, { arranca = 0 } = {}) {
  const hoy = new Date();
  const p = per();
  const res = F.resumenMes(state.transactions, p, 'ARS');

  root.append(
    h('div.flow',
      noSeGuardo(),
      cerroElMes(hoy),
      sinRevisar(),
      conexionCaida(),
      carrusel(arranca, heroMes(res, hoy, p), plataLibre(hoy), heroDolares()),
      loQueSeViene(hoy),
      // Bishu arriba del presupuesto: es la voz de la app, y al fondo de la
      // pantalla no la lee nadie.
      tiraBishu(hoy),
      // Presupuesto y proyección del sueldo se fueron a Números. Ninguno de
      // los dos es una decisión de hoy, los dos estaban también en otra
      // pantalla, y entre los dos Hoy medía dos pantallas y media con 36
      // cifras. Lo que Bishu tenga que decir de una categoría pasada de tope
      // lo dice él, que para eso está arriba.
      antesDeComprar()
    )
  );
}

/**
 * Los dos números del mes, de a uno y con el dedo.
 *
 * Lo consumido y lo que queda libre contestan preguntas distintas y las dos
 * hacen falta. Puestos uno debajo del otro, el segundo no se mira; puestos
 * uno al lado del otro, ninguno se lee. Así cada uno tiene la pantalla
 * entera y cambiar cuesta un gesto.
 */
function carrusel(arranca, ...paneles) {
  const vivos = paneles.filter(Boolean);
  if (vivos.length < 2) return vivos[0]?.nodo || null;
  const inicio = Math.min(Math.max(0, arranca), vivos.length - 1);

  const via = h('div.heroes', ...vivos.map(v => v.nodo));
  const solapas = vivos.map((v, i) =>
    h('button', { role: 'tab', 'aria-selected': String(i === inicio),
                  onclick: () => via.scrollTo({ left: i * via.clientWidth,
                                                behavior: 'smooth' }) }, v.nombre));
  const barra = h('div.seg', { role: 'tablist', 'aria-label': 'Qué número mirar' }, ...solapas);

  // La solapa sigue al dedo, no al revés: se marca la que quedó a la vista.
  let pendiente = null;
  via.addEventListener('scroll', () => {
    cancelAnimationFrame(pendiente);
    pendiente = requestAnimationFrame(() => {
      const i = Math.round(via.scrollLeft / Math.max(1, via.clientWidth));
      solapas.forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
    });
  }, { passive: true });

  // Sin animación y después de pintar: al abrir hay que estar en la ficha
  // pedida, no verla pasar.
  if (inicio) setTimeout(() => { via.scrollLeft = inicio * via.clientWidth; }, 0);

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    barra, via);
}

/**
 * La plata que de verdad está libre.
 *
 * El saldo de las cuentas miente por omisión: adentro está el resumen que hay
 * que pagar la semana que viene y los fijos que todavía no vencieron. Y el
 * gasto del mes miente al revés —cuenta lo que consumiste, no lo que salió—,
 * así que ninguno de los dos contesta "¿puedo gastar?".
 *
 * Abajo va la versión estricta, que es la que enseña la regla: lo que llevás
 * consumido con las tarjetas este ciclo se paga el mes que viene, y conviene
 * tenerlo apartado desde hoy y no desde el día del vencimiento.
 */
function plataLibre(hoy) {
  const pl = F.plataLibre(state.accounts, state.transactions, state.recurrings,
                          state.recurring_payments, hoy, 'ARS');
  if (!pl.enCuentas && !pl.resumenes && !pl.fijos) return null;

  const rojo = pl.libre < 0;
  const { simbolo, numero } = plataPartida(Math.round(pl.libre), 'ARS');
  const resta = [
    pl.resumenes > 0 ? `resúmenes ${plata(Math.round(pl.resumenes))}` : null,
    pl.fijos > 0 ? `fijos ${plata(Math.round(pl.fijos))}` : null
  ].filter(Boolean).join(' − ');

  return { nombre: 'Plata libre', nodo: h('div.grp.pad',
    h('div', { class: 'cifra' + (state.ocultarMontos ? ' oculto' : '') +
                      (rojo ? ' neg' : '') }, h('em', simbolo), numero),
    h('div.small.mut', { style: { marginTop: '5px', lineHeight: '1.45' } },
      `en cuentas ${plata(Math.round(pl.enCuentas))}`, resta ? ` − ${resta}` : ''),

    pl.proximo > 0 && h('div', {
      style: { marginTop: '13px', paddingTop: '13px', borderTop: '1px solid var(--line)',
               fontSize: '13.5px', color: 'var(--tx2)', lineHeight: '1.45' } },
      'Con las tarjetas llevás ',
      h('b', { style: { color: 'var(--tx)' } }, plata(Math.round(pl.proximo))),
      ' de este ciclo, que se pagan el mes que viene. Apartándolos te quedan ',
      h('b', { style: { color: pl.libreEstricta < 0 ? 'var(--amb)' : 'var(--tx)' } },
        plata(Math.round(pl.libreEstricta))),
      '.'),

    rojo && h('div.small', { style: { marginTop: '10px', color: 'var(--neg)',
                                      fontWeight: '600', lineHeight: '1.45' } },
      'Debés más de lo que tenés en las cuentas: ya estás usando plata del mes que viene.'),
    !rojo && pl.libreEstricta < 0 && h('div.small', {
      style: { marginTop: '10px', color: 'var(--amb)', lineHeight: '1.45' } },
      'La tarjeta te está financiando el mes: lo que consumiste con ella no entra ',
      'en lo que te queda.')
  ) };
}

// ------------------------------------------------- lo que entro solo
function sinRevisar() {
  const n = state.transactions.filter(t => t.revisado === false).length;
  if (!n) return null;
  return h('button.aviso', {
    style: { width: '100%', textAlign: 'left', border: '0', cursor: 'pointer' },
    onclick: () => irA('/revisar')
  },
    h('div.av.bra', icono('campana', 17)),
    h('div.txt',
      h('div.tt', n === 1 ? '1 movimiento para revisar' : `${n} movimientos para revisar`),
      h('div.ds', 'Entraron solos. Confirmarlos toma menos de un minuto.')),
    h('span.chev', icono('chev', 16))
  );
}

/**
 * El permiso de Gmail se puede caer, y cuando se cae la mayoria de la gente
 * abandona la app en vez de reconectar. Por eso el aviso es un bloque de
 * primer nivel y no un renglon perdido en Ajustes.
 */
function conexionCaida() {
  const g = (state.integrations || []).find(i => i.proveedor === 'gmail');
  if (!g || (g.activo && !g.ultimo_error)) return null;
  const dias = g.ultima_sync ? diasHasta(g.ultima_sync.slice(0, 10)) : null;
  return h('div.aviso.amb',
    h('div.av.amb', icono('rayo', 17)),
    h('div.txt',
      h('div.tt', 'Se cortó la lectura de mails'),
      h('div.ds', dias != null
        ? `Puede haber consumos sin cargar desde hace ${Math.abs(dias)} días.`
        : 'Puede haber consumos sin cargar.'),
      h('button.btn', { onclick: () => irA('/ajustes') }, 'Reconectar'))
  );
}

/**
 * Cambios que no se pudieron guardar.
 *
 * Es el aviso más importante de la app y no existía. Cuando una escritura
 * falla, la pantalla ya se pintó como si hubiera andado —así se siente
 * rápida— y el cambio queda en un cajón de fallidas que está en Ajustes,
 * cuatro toques adentro. La siguiente sincronización trae la fila vieja del
 * servidor y lo que habías hecho desaparece sin decir nada: un gasto fijo
 * pagado vuelve a aparecer pendiente.
 *
 * En una app de plata eso es lo peor que puede pasar, así que va arriba de
 * todo, con el nombre de lo que no se guardó.
 */
function noSeGuardo() {
  const rotas = fallidas();
  if (!rotas.length) return null;
  const QUE = { recurring_payments: 'un pago de un gasto fijo', transactions: 'un movimiento',
                recurrings: 'un gasto fijo', accounts: 'una cuenta', budgets: 'un presupuesto',
                promos: 'una promo', recibos: 'un recibo' };
  const cuales = [...new Set(rotas.map(r => QUE[r.tabla] || r.tabla))];
  // El motivo, con las palabras de la base. Sin esto el cartel es un callejón
  // sin salida: se puede reintentar para siempre sin saber que lo que sobra
  // es un valor que la tabla no acepta.
  const motivos = [...new Set(rotas.map(r => r.error).filter(Boolean))].slice(0, 3);

  const btn = h('button.btn', 'Intentar de nuevo');
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = 'Probando…';
    await sincronizar({ reintentarFallidas: true, completa: true });
    aviso(fallidas().length ? 'Sigue sin poder guardarse' : 'Listo, se guardó');
    // sincronizar() avisa al final y la pantalla se vuelve a dibujar sola.
  };

  return h('div.aviso.neg',
    h('div.av.neg', icono('sube', 17)),
    h('div.txt',
      h('div.tt', rotas.length === 1 ? 'Un cambio no se guardó'
                                     : `${rotas.length} cambios no se guardaron`),
      h('div.ds', `Quedó sin subir ${cuales.join(', ')}. Lo que ves en la pantalla `,
        'puede volver atrás solo hasta que se guarde de verdad.'),
      motivos.length ? h('div.small.mut', { style: { marginTop: '8px', lineHeight: '1.5' } },
        motivos.map(m => h('div', { style: { marginTop: '4px' } }, '· ', m))) : null,
      btn));
}

/**
 * El mes cerró: acá está cómo.
 *
 * Aparece los primeros días y después se va sola. Es lo único que la app le
 * devuelve a treinta días de cargar gastos, así que va arriba de todo; pero
 * el día 12 ya no es noticia y estorbaría.
 */
function cerroElMes(hoy) {
  if (hoy.getDate() > 7) return null;
  const per = F.ultimoMesCerrado(hoy);
  const hubo = state.transactions.some(t => String(t.fecha).slice(0, 7) === per);
  if (!hubo) return null;

  return h('button.aviso.bra', { style: { width: '100%', textAlign: 'left' },
                                 onclick: () => irA(`/cierre/${per}`) },
    h('div', { style: { flex: 'none', color: 'var(--bra)' } }, bishu('contento', 34)),
    h('div.txt',
      h('div.tt', `Cerró ${nombreDelMes(per).toLowerCase()}`),
      h('div.ds', 'Cuánto quedó, en qué se te fue y qué cambió contra el mes anterior.')),
    h('span.chev', icono('chev', 15)));
}

// -------------------------------------------------------- hero del mes
function heroMes(res, hoy, p) {
  const tope = topeDelMes(p);
  const [y, m] = p.split('-').map(Number);
  const enElMes = new Date(y, m, 0).getDate();
  const diaActual = hoy.getDate();
  const pctGasto = tope > 0 ? Math.min(100, (res.gastos / tope) * 100) : 0;
  const pctRitmo = (diaActual / enElMes) * 100;
  const desvio = Math.round(pctGasto - pctRitmo);
  const quedan = Math.max(0, tope - res.gastos);
  const diasQuedan = Math.max(1, enElMes - diaActual);
  const porDia = quedan / diasQuedan;

  const { simbolo, numero } = plataPartida(Math.round(res.gastos), 'ARS');

  return { nombre: 'Este mes', nodo: h('div.grp.pad',
    h('div', { style: { display: 'flex', justifyContent: 'space-between',
                        alignItems: 'flex-start', gap: '10px' } },
      h('div',
        h('div.cifra', h('em', simbolo), numero),
        h('div.small.mut', { style: { marginTop: '5px' } },
          tope > 0 ? `gastado de ${plata(tope)}` : 'gastado este mes')),
      // Los primeros dias del mes la comparacion con el ritmo no dice nada:
      // los gastos fijos caen todos juntos el 1 y el porcentaje se dispara.
      tope > 0 && diaActual >= 5 && h('span.pill', { class: `pill ${desvio > 3 ? 'amb' : 'pos'}` },
        icono(desvio > 3 ? 'sube' : 'check', 11),
        desvio > 3 ? `${desvio} pts` : 'al día')
    ),
    tope > 0 && h('div.track',
      h('b', { style: { width: pctGasto + '%' } }),
      h('i', { style: { left: Math.min(99, pctRitmo) + '%' } })),
    tope > 0 && h('div.legend',
      h('span', `${Math.round(pctGasto)} % gastado`),
      h('span', 'día ', h('b', String(diaActual)), ` de ${enElMes} · marca del ritmo`)),
    tope > 0 && h('div', {
      style: { marginTop: '13px', paddingTop: '13px', borderTop: '1px solid var(--line)',
               fontSize: '13.5px', color: 'var(--tx2)', lineHeight: '1.45' } },
      diaActual < 5
        ? frag('Recién arranca el mes. Tenés ',
            h('b', { style: { color: 'var(--tx)' } }, `${plata(Math.round(porDia))} por día`),
            ` hasta el ${enElMes}.`)
        : frag('Te quedan ',
            h('b', { style: { color: 'var(--tx)' } }, `${plata(Math.round(porDia))} por día`),
            ` para llegar al ${enElMes} sin pasarte.`)),
    res.movido > 0 && h('div', {
      style: { marginTop: '10px', fontSize: '12.5px', color: 'var(--tx3)' } },
      `${plata(Math.round(res.movido))} movidos entre tus cuentas — no cuentan como gasto.`)
  ) };
}

const topeDelMes = p => state.budgets.filter(b => b.periodo === p && b.moneda !== 'USD')
                                     .reduce((s, b) => s + Number(b.monto || 0), 0);

/**
 * En dolares interesan las dos cosas, y antes solo se veia una.
 *
 * El alquiler se paga en dolares: gastar en dolares es tan real como gastar
 * en pesos, y la pantalla mostraba unicamente el saldo. Ahora arriba va lo
 * mismo que en pesos —lo gastado en el mes— y abajo lo que queda, que en
 * dolares importa mas que en pesos porque es ahorro y no circulante.
 */
function heroDolares() {
  const res = F.resumenMes(state.transactions, per(), 'USD');
  const cuentas = state.accounts.filter(a => a.moneda === 'USD' && a.activo !== false);
  // Sin nada en dólares, una ficha vacía es una ficha de más.
  if (!cuentas.length && !res.gastos && !res.ingresos) return null;
  const total = cuentas.reduce((s, a) => s + F.saldoDeCuenta(a, state.transactions, new Date(),
                                                             a.saldo_inicial || 0, a.saldo_al), 0);
  const ref = Number(state.settings?.usd_ref) || 0;
  const { simbolo, numero } = plataPartida(res.gastos, 'USD');

  return { nombre: 'Dólares', nodo: h('div.grp.pad',
    h('div.cifra', h('em', simbolo), numero),
    h('div.small.mut', { style: { marginTop: '5px' } },
      res.ingresos > 0 ? `gastados este mes · entraron ${plata(res.ingresos, 'USD')}`
                       : 'gastados este mes'),

    h('div', { style: { marginTop: '13px', paddingTop: '13px',
                        borderTop: '1px solid var(--line)' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between',
                          alignItems: 'baseline', gap: '10px' } },
        h('span.small.mut', 'Tenés'),
        h('span', { style: { fontWeight: '600', fontSize: '17px' }, class: 'tabnum' },
          plata(total, 'USD'))),
      ref > 0 && h('div.small.mut', { style: { marginTop: '3px', textAlign: 'right' } },
        `≈ ${plata(total * ref)} a ${plata(ref)} por dólar`),
      h('div', { style: { display: 'flex', gap: '7px', marginTop: '11px', flexWrap: 'wrap' } },
        cuentas.map(a => h('span.pill.mut', a.nombre)))),

    res.movido > 0 && h('div', {
      style: { marginTop: '10px', fontSize: '12.5px', color: 'var(--tx3)' } },
      `${plata(res.movido, 'USD')} movidos entre tus cuentas — no cuentan como gasto.`)
  ) };
}

// ---------------------------------------------------- lo que se viene
function loQueSeViene(hoy) {
  const items = [];

  // Tarjetas: lo que hay que pagar y cuando
  for (const t of state.accounts.filter(a => a.tipo === 'credito' && a.activo !== false)) {
    // Primero lo que hay que pagar: un resumen ya cerrado que vence en dias
    // importa mas que el ciclo que recien empezo a acumular.
    // Sin cierre cargado, la fecha de vencimiento seria inventada: no entra
    // en una lista que ordena justamente por cuando hay que pagar.
    if (!F.tieneCiclo(t)) continue;
    const moneda = t.moneda || 'ARS';
    const c = F.resumenAPagar(t, hoy) || F.proximoCiclo(t, hoy);
    const total = F.totalTarjetaEnPeriodo(state.transactions, t, F.periodo(c.vence), moneda);
    if (!total) continue;
    // Si ya se pagó algo de este resumen, lo que se viene es el resto.
    const falta = F.faltaPagarDeResumen(state.transactions, t, c, moneda);
    if (!falta) continue;
    const pagado = total - falta;
    items.push({ id: t.id, nombre: t.nombre, monto: falta, vence: c.vence,
                 icono: 'tarjeta', moneda,
                 nota: pagado > 0 ? `pagaste ${plata(Math.round(pagado), moneda)}`
                                  : (c.declarado ? null : 'estimado'),
                 tarjeta: t, ciclo: c,
                 ir: `/tarjetas/${t.id}` });
  }

  // Gastos fijos sin pagar
  const p = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  for (const r of F.recurrentesDelMes(state.recurrings, state.recurring_payments, p, hoy)) {
    if (r.pagado) continue;
    // Un fijo que cae solo en la tarjeta no se paga aparte: entra al resumen
    // y sale cuando se paga el resumen. Listarlo acá lo cobraría dos veces.
    // El que se paga a mano queda, aunque a veces lo pagues con la tarjeta:
    // hay que acordarse igual, y con qué se paga se decide ese día.
    if (F.debitoEnTarjeta(r, state.accounts)) continue;
    items.push({ id: r.id, nombre: r.nombre, monto: r.monto, vence: r.vence,
                 moneda: r.moneda || 'ARS',
                 icono: iconoDe(r.nombre), recurrente: r, periodo: p, ir: `/mes` });
  }

  if (!items.length) return null;
  items.sort((a, b) => a.vence - b.vence);
  // En Hoy van los tres primeros y el total. La lista completa es la pestaña
  // Pagar: repetirla acá era la mitad de la pantalla y la misma información
  // dos veces.
  const MUESTRA = 3;
  const totales = {};
  for (const it of items) totales[it.moneda] = (totales[it.moneda] || 0) + it.monto;

  return h('section',
    h('div.ghead', 'Lo que se viene',
      h('button', { onclick: () => irA('/mes') }, 'Ver todo')),
    h('div.grp', items.slice(0, MUESTRA).map(it => {
      const iso = it.vence instanceof Date
        ? `${it.vence.getFullYear()}-${String(it.vence.getMonth() + 1).padStart(2, '0')}-${String(it.vence.getDate()).padStart(2, '0')}`
        : it.vence;
      const d = diasHasta(iso, hoy);
      const sev = d < 0 ? 'sev sev-neg' : d <= 3 ? 'sev sev-amb' : '';
      return h('div.li', { class: `li ${sev}` },
        h('button', { style: { display: 'flex', alignItems: 'center', gap: '12px',
                               flex: '1', minWidth: '0', background: 'none', border: '0',
                               padding: '0', textAlign: 'left', cursor: 'pointer' },
                      onclick: () => irA(it.ir) },
          h('div', { class: `av ${d < 0 ? 'neg' : d <= 3 ? 'amb' : ''}` }, icono(it.icono, 17)),
          h('div.m', h('div.t', it.nombre),
            h('div.s', cuandoVence(iso, hoy) + (it.nota ? ` · ${it.nota}` : ''))),
          h('div.v', plata(it.moneda === 'USD' ? it.monto : Math.round(it.monto), it.moneda))),
        // Anotar el pago desde acá: es donde uno lo mira, y si hay que ir a
        // buscarlo a otra pantalla se anota después, o nunca.
        //
        // Antes era un tilde solo. Un tilde quiere decir "hecho" en todas las
        // pantallas del mundo, y esto es un botón para pagar: decía lo
        // contrario de lo que hace. Ahora lo dice con la palabra.
        (it.tarjeta || it.recurrente) ? h('button.pagar', {
          'aria-label': `Anotar el pago de ${it.nombre}`, style: { flex: 'none' },
          onclick: () => it.tarjeta ? formPagoTarjeta(it.tarjeta, it.ciclo, it.monto, it.moneda)
                                    : formPago(it.recurrente, it.periodo) },
          'Pagar') : null);
    })),
    // El total es la pregunta real: no "cuánto es el colegio" sino "cuánto
    // tengo que juntar". Faltaba, y estaba una pantalla más adentro.
    h('button.li', { style: { marginTop: '8px' }, onclick: () => irA('/mes') },
      h('div.m', h('div.t', 'En total hay que pagar'),
        h('div.s', items.length > MUESTRA
          ? `${items.length} cosas este mes · ${items.length - MUESTRA} no entran acá`
          : `${items.length} ${items.length === 1 ? 'cosa' : 'cosas'} este mes`)),
      // Cada moneda en su renglón: en una sola línea "$ 1.827.185 + US$ 850"
      // no entra en un teléfono y se comía el nombre de la fila.
      h('div.v', ...Object.entries(totales).map(([m, v], i) => {
        const txt = plata(m === 'USD' ? v : Math.round(v), m);
        return i === 0 ? txt : h('small', txt);
      })),
      h('span.chev', icono('chev', 15)))
  );
}

/** 'hoy', 'mañana', 'el jueves 10', y de ahí en más los días que faltan. */
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function cuandoCae(d, fecha) {
  if (d <= 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d <= 13) return `${DIAS_LARGOS[fecha.getDay()]} ${fecha.getDate()}`;
  return `en ${d} días`;
}

// -------------------------------------------------------------- bishu
/**
 * Bishu dice una cosa: la que no está en ninguna otra parte de la pantalla.
 *
 * Arriba ya se ve cuánto va gastado y qué se viene. Lo que falta es lo que no
 * se ve mirando un solo mes: si venís gastando más o menos que la vez pasada,
 * y si hace días que no le contás nada a la app —que es de lo que vive.
 */
function tiraBishu(hoy) {
  const p = per();
  const res = F.resumenMes(state.transactions, p, 'ARS');
  const budgets = state.budgets.filter(b => b.periodo === p);
  const peor = F.estadoPresupuesto(budgets, res, 80).find(b => b.gastado > b.tope);
  const cierra = state.accounts.find(a => a.tipo === 'credito' && a.activo !== false &&
    F.tieneCiclo(a) && F.proximoCiclo(a, hoy).diasACierre === 1);
  const mayor = state.transactions
    .filter(t => t.tipo === 'gasto' && (t.moneda || 'ARS') === 'ARS' &&
                 F.periodo(F.parseFecha(t.fecha)) === p)
    .sort((a, b) => Number(b.monto) - Number(a.monto))[0];

  const datos = {
    // Las promos marcadas, con cuántos días faltan: Bishu las dice él mismo
    // en vez de que haya una sección arriba repitiendo lo mismo.
    promos: F.promosQueSeVienen(state.promos, hoy, 14).map(({ promo, fecha }) => {
      const d = Math.round((fecha - new Date(hoy.toDateString())) / 86400000);
      return { dias: d, cuando: cuandoCae(d, fecha), titulo: promo.titulo || promo.comercio,
               valor: promo.valor, tipo: promo.tipo, medio: promo.medio_pago };
    }),
    diasSinCargar: F.diasSinCargar(state.transactions, hoy),
    gastadoEsteMesAlDia: F.gastadoAlDia(state.transactions, p, hoy.getDate()),
    gastadoMesPasadoAlDia: F.gastadoAlDia(state.transactions, F.mesAnterior(p), hoy.getDate()),
    cargoHoy: state.transactions.some(t =>
      (!t.fuente || t.fuente === 'manual') && String(t.fecha).slice(0, 10) === hoyISO()),
    excedida: peor ? { nombre: nombreDe('categories', peor.category_id, 'Una categoría'),
                       exceso: Math.round(peor.gastado - peor.tope) } : null,
    cierraManana: cierra ? cierra.nombre : null,
    ahorro: F.estadoAhorro(budgets, { cuentas: state.accounts, txs: state.transactions,
                                      recurrings: state.recurrings,
                                      pagos: state.recurring_payments }, p, 'ARS', hoy),
    mayor: mayor ? { nombre: mayor.comercio || mayor.descripcion || 'un gasto',
                     monto: Math.round(mayor.monto) } : null
  };

  const frases = F_frases(datos, hoy);
  let i = 0;

  const dibujo = h('div', { style: { flex: 'none' } });
  const linea = h('div', { style: { fontSize: '14.5px', lineHeight: '1.45',
                                    color: 'var(--tx2)' } });
  const accion = h('button', { style: { background: 'none', border: '0', padding: '0 14px 0 0',
                                        fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                                        minHeight: '44px', textAlign: 'left' } });
  // "algo más (5)" no decía qué era ese algo ni se podía tocar sin apuntar.
  const otra = h('button', { style: { background: 'none', border: '0', padding: '0',
                                      color: 'var(--tx3)', fontSize: '13px', cursor: 'pointer',
                                      minHeight: '44px' } });
  const pintar = () => {
    const { animo, texto, ir } = frases[i % frases.length];
    dibujo.replaceChildren(bishu(animo, 46));
    dibujo.style.color = animo === 'festejo' ? 'var(--pos)'
                       : animo === 'alerta' ? 'var(--amb)' : 'var(--bra)';
    linea.textContent = texto;
    accion.textContent = ir ? 'Ver' : 'Elegí de qué te aviso';
    accion.style.color = ir ? 'var(--brand)' : 'var(--tx3)';
    accion.onclick = () => irA(ir || '/ajustes');
    otra.textContent = `Otra cosa · ${(i % frases.length) + 1} de ${frases.length}`;
  };
  pintar();

  // Tocarlo trae lo que sigue. Es lo que lo saca de ser un cartel: cuando el
  // mes viene tranquilo, lo segundo y lo tercero son justo lo que uno no sabe
  // que quiere saber.
  const seguir = () => {
    i++;
    dibujo.animate?.(
      [{ transform: 'scale(1)' }, { transform: 'scale(.9)' }, { transform: 'scale(1)' }],
      { duration: 180, easing: 'cubic-bezier(.32,.72,0,1)' });
    pintar();
  };

  return h('section',
    h('div.grp.pad', { style: { display: 'flex', alignItems: 'center', gap: '13px' } },
      h('button', { 'aria-label': 'Bishu: tocá para lo que sigue',
                    style: { background: 'none', border: '0', padding: '0', minHeight: '0',
                             cursor: 'pointer', flex: 'none' },
                    onclick: seguir }, dibujo),
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('div', { style: { fontWeight: '600', fontSize: '14.5px', letterSpacing: '-.015em',
                            marginBottom: '2px' } }, '¡Hola! Soy Bishu'),
        linea,
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px',
                            marginTop: '2px' } },
          accion,
          frases.length > 1 ? (otra.onclick = seguir, otra) : null))));
}

// --------------------------------------------------- antes de comprar
function antesDeComprar() {
  return h('section',
    h('div.ghead', 'Antes de comprar'),
    h('div.grp',
      h('button.li', { onclick: () => irA('/pago') },
        h('div.av.bra', icono('tarjeta', 17)),
        h('div.m', h('div.t', '¿Con qué pago?'),
          h('div.s', 'Compará financiación y reintegro')),
        h('span.chev', icono('chev', 15))),
      h('button.li', { onclick: () => irA('/donde') },
        h('div.av', icono('monedas', 17)),
        h('div.m', h('div.t', 'Dónde está la plata'),
          h('div.s', 'Saldo por cuenta, en pesos y en dólares')),
        h('span.chev', icono('chev', 15))),
      // Promos salió de la barra de abajo: acá es donde uno la busca, justo
      // antes de comprar. También está el pin de la cabecera y lo que avise
      // Bishu.
      h('button.li', { onclick: () => irA('/promos') },
        h('div.av', icono('pin', 17)),
        h('div.m', h('div.t', 'Promos de hoy'),
          h('div.s', 'Descuentos y reintegros con tus tarjetas')),
        h('span.chev', icono('chev', 15))))
  );
}

// =====================================================================
/**
 * Anotar el pago de un resumen, desde donde uno lo está mirando.
 *
 * Un pago de tarjeta es una movida de plata: sale de una cuenta y entra a la
 * tarjeta. Guardarlo así —y no como un gasto— es lo que hace que no se cuente
 * dos veces: el gasto ya se contó cuando se hizo la compra.
 */
export function formPagoTarjeta(tarjeta, ciclo, sugerido, moneda = 'ARS') {
  const cuentas = state.accounts.filter(a =>
    a.activo !== false && a.tipo !== 'credito' && (a.moneda || 'ARS') === moneda);

  // Con los centavos puestos: redondear la sugerencia dejaba un resto que
  // mantenía el resumen sin saldar.
  const cMonto = h('input', { type: 'text', inputmode: 'decimal',
                              value: Number(sugerido) % 1
                                ? Number(sugerido).toFixed(2).replace('.', ',')
                                : String(Math.round(sugerido)) });
  const cCuenta = select(cuentas.map(a => ({ value: a.id, label: etiquetaCuenta(a) })),
                         { value: cuentas[0]?.id || '' });
  const cFecha = h('input', { type: 'date', value: hoyISO() });

  // Sin consumos cargados el pago no puede contar como gasto: la app no sabe
  // en qué se gastó. Decirlo acá evita el agujero de un resumen pagado que no
  // aparece en ningún lado del mes.
  const sinConsumos = !F.totalTarjetaEnPeriodo(state.transactions, tarjeta,
                                               F.periodo(ciclo.vence), moneda);

  const cerrar = hoja(`Pagar ${tarjeta.nombre}`, h('div',
    h('div.small.mut', { style: { lineHeight: '1.5', marginBottom: '14px' } },
      `Del resumen que vence el ${ciclo.vence.getDate()}/${ciclo.vence.getMonth() + 1}. `,
      'Si pagás una parte, el resto sigue figurando. El pago no cuenta como gasto ',
      'del mes: cada compra ya contó el día que la hiciste.'),
    sinConsumos ? h('div.aviso.amb', { style: { marginBottom: '14px' } },
      h('div.av.amb', icono('rayo', 17)),
      h('div.txt',
        h('div.tt', 'No tengo consumos de este resumen'),
        h('div.ds', 'Si lo pagás así, esa plata no va a figurar como gasto en ningún ' +
          'lado: la app no sabe en qué se gastó. Importá el resumen y después anotá el pago.'))) : null,
    campo('Cuánto', cMonto),
    campo('Desde', cCuenta),
    campo('Cuándo', cFecha),
    h('button.btn', { style: { marginTop: '4px' }, onclick: async () => {
      const monto = aNumero(cMonto.value);
      if (!monto) { cMonto.focus(); aviso('Falta el monto'); return; }
      if (!cCuenta.value) { aviso('Falta desde qué cuenta'); return; }
      await guardar('transactions', {
        fecha: cFecha.value || hoyISO(),
        descripcion: `Pago ${tarjeta.nombre}`, comercio: null,
        monto, moneda, tipo: 'transferencia',
        account_id: cCuenta.value, destino_account_id: tarjeta.id,
        cuotas: 1, fuente: 'manual', revisado: true
      });
      cerrar();
      aviso(`Pago anotado · ${plata(monto, moneda)}`);
    } }, 'Anotar el pago')));
}
