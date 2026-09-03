// =====================================================================
// vistas/promos.js — las promos que cargaste, y las que trae Clash.
// La barra de tope consumido es lo que hace honesta la pantalla: una promo
// de "25 %" con el tope al 62 % ya no es del 25 %.
// =====================================================================
import { h, icono, iconoDe, aviso, hoja, campo } from '../ui.js';
import { state, guardar, traerPromos } from '../db.js';
import * as F from '../finance.js';
import { plata, hoyISO, aNumero } from '../formato.js';
import { formPromo } from './formularios.js';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function vistaPromos(root) {
  let cuando = 'hoy';
  const lista = h('div.flow', { style: { gap: '9px' } });
  const seg = h('div.seg', { role: 'tablist' },
    ...[['hoy', 'Hoy'], ['semana', 'La semana'], ['todas', 'Todas']].map(([id, txt]) =>
      h('button', { role: 'tab', 'aria-selected': String(id === cuando),
        onclick: e => {
          cuando = id;
          seg.querySelectorAll('button').forEach((b, i) =>
            b.setAttribute('aria-selected', String(['hoy', 'semana', 'todas'][i] === id)));
          ponerTraer();
          pintar();
        } }, txt)));

  function pintar() {
    lista.replaceChildren();
    const hoy = new Date();
    let promos = state.promos.filter(p => p.activa !== false);
    if (cuando === 'hoy') promos = F.promosDelDia(promos, hoy);
    else if (cuando === 'semana') promos = promos.filter(p => !p.vigencia_hasta || p.vigencia_hasta >= hoyISO());

    if (!promos.length) {
      lista.append(h('div.vacio',
        h('div.ic', icono('pin', 24)),
        h('h3', cuando === 'hoy' ? 'Hoy no hay promos' : 'Todavía no cargaste promos'),
        h('p', cuando === 'hoy' ? 'Mirá "La semana" para ver qué se viene.'
                                : 'Cargá las que uses y la app te avisa cuándo aplican.'),
        h('button.btn.sec', { onclick: () => formPromo() }, 'Cargar una promo')));
      return;
    }
    // Agrupadas por comercio: en Clash el mismo Coto aparece una vez por
    // banco y por tarjeta, y diez filas que dicen "Coto" no son diez datos,
    // son un dato repetido diez veces. Lo que uno quiere saber es "¿hay algo
    // en Coto?" y recién después "¿con cuál?".
    for (const g of agrupar(promos)) lista.append(g.promos.length > 1
      ? tarjetaGrupo(g, hoy) : tarjeta(g.promos[0], hoy));
  }

  /** Por comercio, con la mejor adelante. */
  function agrupar(promos) {
    const llave = p => String(p.comercio || p.titulo || '')
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '') || String(p.id);
    const mapa = new Map();
    for (const p of promos) {
      const k = llave(p);
      if (!mapa.has(k)) mapa.set(k, { nombre: p.comercio || p.titulo, promos: [] });
      mapa.get(k).promos.push(p);
    }
    for (const g of mapa.values()) {
      g.promos.sort((a, b) => (Number(b.valor) || 0) - (Number(a.valor) || 0));
      g.mejor = g.promos[0];
      g.recordadas = g.promos.filter(p => p.recordar).length;
    }
    // Primero las que tienen algo marcado, después por el mejor porcentaje.
    return [...mapa.values()].sort((a, b) =>
      (b.recordadas > 0) - (a.recordadas > 0) ||
      (Number(b.mejor.valor) || 0) - (Number(a.mejor.valor) || 0));
  }

  /**
   * Un comercio, con lo mejor que tiene y cuántas opciones más.
   *
   * No se muestran los medios de pago acá: son cuatro o cinco por comercio y
   * en la lista no se pueden comparar. La decisión de con cuál pagar se toma
   * adentro, cuando ya decidiste que vas a ese comercio.
   */
  function tarjetaGrupo(g, hoy) {
    const per = hoyISO().slice(0, 7);
    const aplicaHoy = g.promos.some(p => !p.dias?.length || p.dias.includes(hoy.getDay()));
    const usado = g.promos.reduce((s, p) => {
      const u = (state.promo_usos || []).find(x => x.promo_id === p.id && x.periodo === per);
      return s + (u ? Number(u.usado) : 0);
    }, 0);
    const bancos = [...new Set(g.promos.map(p => p.medio_pago).filter(Boolean))];

    return h('button.grp.pad', {
      style: { width: '100%', textAlign: 'left', border: '0', display: 'block',
               cursor: 'pointer', opacity: aplicaHoy ? '1' : '.62' },
      onclick: () => hojaGrupo(g, hoy) },
      h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '11px' } },
        h('div', { class: 'cifra' + (aplicaHoy ? ' pos' : ''), style: { fontSize: '22px' } },
          Number(g.mejor.valor) > 0
            ? `${Number(g.mejor.valor)}${g.mejor.tipo === 'cuotas' ? '×' : '%'}` : '—'),
        h('div', { style: { flex: '1', minWidth: '0' } },
          h('div', { style: { fontWeight: '600', fontSize: '15.5px', letterSpacing: '-.015em' } },
            g.nombre),
          h('div.small.mut', { style: { marginTop: '1px' } },
            `hasta ${Number(g.mejor.valor)} % · ${g.promos.length} opciones` +
            (bancos.length ? ` · ${bancos.length} ${bancos.length === 1 ? 'medio' : 'medios'}` : ''))),
        g.recordadas > 0
          ? h('span.pill.bra', icono('campana', 13),
              g.recordadas === 1 ? 'Te aviso' : `${g.recordadas} avisos`)
          : h('span.chev', icono('chev', 15))),
      usado > 0 ? h('div.small.mut', { style: { marginTop: '9px' } },
        `Llevás ${plata(Math.round(usado))} de reintegro este mes`) : null);
  }

  /**
   * Todas las de un comercio, para elegir con cuál.
   *
   * Acá sí se ve el medio de pago de cada una, que es lo único que las
   * distingue, y se marca de a una cuál querés que te recuerde.
   */
  function hojaGrupo(g, hoy) {
    const cuerpo = h('div');
    const pintarLista = () => cuerpo.replaceChildren(h('div.grp',
      g.promos.map(p => {
        const aplica = !p.dias?.length || p.dias.includes(hoy.getDay());
        const cae = F.proximaFechaPromo(p, hoy);
        const cuando = p.dias?.length || p.vigencia_hasta
          ? (cae ? cuandoCae(Math.round((cae - new Date(hoy.toDateString())) / 86400000), cae)
                 : 'ya pasó')
          : 'todos los días';
        const campana = h('button', { 'aria-pressed': String(!!p.recordar),
          class: 'pill ' + (p.recordar ? 'bra' : 'mut'),
          style: { flex: 'none', border: '0', cursor: 'pointer', minHeight: '34px',
                   padding: '0 10px' },
          onclick: async e => {
            e.stopPropagation();
            await guardar('promos', { ...p, recordar: !p.recordar });
            p.recordar = !p.recordar;
            pintarLista();
          } }, icono('campana', 13), p.recordar ? 'Te aviso' : 'Avisame');

        return h('div.li', { style: { opacity: aplica ? '1' : '.6' } },
          h('div', { class: 'cifra' + (aplica ? ' pos' : ''),
                     style: { fontSize: '18px', flex: 'none', width: '48px' } },
            `${Number(p.valor) || 0}${p.tipo === 'cuotas' ? '×' : '%'}`),
          h('div.m',
            h('div.t', p.medio_pago || p.emisor || 'Sin medio'),
            h('div.s', [p.tipo === 'descuento' ? 'descuento' : p.tipo === 'cuotas' ? 'cuotas' : 'reintegro',
                        p.tope ? `tope ${plata(p.tope)}` : null, cuando]
              .filter(Boolean).join(' · '))),
          campana);
      })));
    pintarLista();

    return hoja(g.nombre, h('div',
      h('div.small.mut', { style: { lineHeight: '1.55', marginBottom: '14px' } },
        `${g.promos.length} promos en ${g.nombre}, ordenadas de mayor a menor. `,
        'Marcá la que quieras que te recuerde el día que aplica: las que no ',
        'marques no te van a molestar.'),
      cuerpo,
      h('button.btn.sec', { style: { marginTop: '14px' },
                            onclick: () => { pintar(); formPromo(g.mejor); } },
        icono('lapiz', 16), 'Editar la de arriba')));
  }

  function tarjeta(p, hoy) {
    const per = hoyISO().slice(0, 7);
    const uso = (state.promo_usos || []).find(u => u.promo_id === p.id && u.periodo === per);
    const usado = uso ? Number(uso.usado) : 0;
    const tope = Number(p.tope) || 0;
    const pct = tope > 0 ? Math.min(100, (usado / tope) * 100) : 0;
    const aplicaHoy = !p.dias?.length || p.dias.includes(hoy.getDay());
    const etiqueta = p.tipo === 'descuento' ? 'descuento'
                   : p.tipo === 'cuotas' ? 'cuotas' : 'reintegro';
    const proximo = !aplicaHoy && p.dias?.length
      ? DIAS[p.dias.slice().sort((a, b) => ((a - hoy.getDay() + 7) % 7) - ((b - hoy.getDay() + 7) % 7))[0]]
      : null;

    const cae = F.proximaFechaPromo(p, hoy);
    const cuando = p.dias?.length || p.vigencia_hasta
      ? (cae ? cuandoCae(Math.round((cae - new Date(hoy.toDateString())) / 86400000), cae) : 'ya pasó')
      : 'todos los días';

    return h('div.grp.pad', { style: { opacity: aplicaHoy ? '1' : '.62' } },
      h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '11px' } },
        h('button', { style: { display: 'flex', alignItems: 'flex-start', gap: '11px',
                               flex: '1', minWidth: '0', background: 'none', border: '0',
                               padding: '0', textAlign: 'left', cursor: 'pointer' },
                      onclick: () => formPromo(p) },
          h('div', { class: 'cifra' + (aplicaHoy ? ' pos' : ''), style: { fontSize: '22px' } },
            Number.isFinite(Number(p.valor)) && Number(p.valor) > 0
              ? `${Number(p.valor)}${p.tipo === 'cuotas' ? '×' : '%'}` : '—'),
          h('div', { style: { flex: '1', minWidth: '0' } },
            h('div', { style: { fontWeight: '600', fontSize: '15.5px', letterSpacing: '-.015em' } },
              p.titulo),
            h('div.small.mut', { style: { marginTop: '1px' } },
              [etiqueta, p.medio_pago, cuando].filter(Boolean).join(' · ')))),
        p.favorita && h('span.pill.bra', 'preferida'),
        proximo && h('span.pill.mut', proximo),
        // Un toque para que aparezca en Hoy el día que cae, y otro para que
        // deje de aparecer. Es la única forma de que la de una vez al mes no
        // se pase: nadie entra a esta pantalla el día justo.
        //
        // Antes era una campana sola, y una campana sola no dice si está
        // prendida o apagada: había que acordarse del color. Con la palabra
        // no hay nada que adivinar.
        h('button', { 'aria-pressed': String(!!p.recordar),
          class: 'pill ' + (p.recordar ? 'bra' : 'mut'),
          style: { flex: 'none', border: '0', cursor: 'pointer', minHeight: '32px',
                   padding: '0 10px' },
          onclick: async e => {
            e.stopPropagation();
            await guardar('promos', { ...p, recordar: !p.recordar });
            aviso(p.recordar ? 'No te la recuerdo más' : 'Te la recuerdo en Hoy');
          } }, icono('campana', 13), p.recordar ? 'Te aviso' : 'Avisame')),
      tope > 0 && h('div', { style: { marginTop: '11px' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between',
                            fontSize: '11.5px', color: 'var(--tx2)', marginBottom: '5px' } },
          h('span', 'Tope del mes'),
          h('span', h('b', { class: 'tabnum', style: { color: 'var(--tx)' } }, plata(usado)),
            ` de ${plata(tope)}`)),
        h('div.mini', h('b', { class: pct >= 60 ? 'al' : '', style: { flex: String(Math.max(1, usado)) } }),
          h('span', { style: { flex: String(Math.max(1, tope - usado)) } }))),
      tope > 0 && usado >= tope && h('div.small', { style: { color: 'var(--amb)', marginTop: '7px',
                                                             fontWeight: '600' } },
        'Tope agotado este mes'),
      // La barra no se movía nunca. El tope solo se llenaba confirmando un
      // movimiento en Revisar, que es donde uno NO está cuando se acuerda de
      // que usó la promo. Una barra que siempre marca cero enseña a no
      // mirarla, y era justo lo que hacía honesta a la pantalla.
      tope > 0 ? h('div', { style: { marginTop: '11px' } },
        h('button.btn.sec', { style: { minHeight: '40px', fontSize: '13.5px' },
                              onclick: () => hojaUso(p, usado, uso) },
          icono('mas', 15), usado > 0 ? 'Sumar otro uso' : 'Anotar que la usé')) : null,
    );
  }

  /**
   * Anotar lo que te devolvió una promo, desde donde la estás mirando.
   *
   * Lo que llena el tope es el REINTEGRO, no lo que gastaste: el tope de una
   * promo de 20 % con $ 15.000 de límite se agota a los $ 75.000 de compra.
   * Como uno se acuerda del gasto y no del reintegro, se pueden poner los dos
   * y la app hace la cuenta.
   */
  function hojaUso(p, usado, uso) {
    const valor = Number(p.valor) || 0;
    const cGasto = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0' });
    const cVuelta = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0' });
    const cuenta = h('div.small.mut', { style: { marginTop: '-8px', lineHeight: '1.45' } });

    const recalcular = origen => {
      const g = aNumero(cGasto.value), v = aNumero(cVuelta.value);
      if (origen === 'gasto' && valor > 0) cVuelta.value = String(Math.round(g * valor / 100));
      if (origen === 'vuelta' && valor > 0 && v) cGasto.value = String(Math.round(v * 100 / valor));
      const nuevo = usado + aNumero(cVuelta.value);
      const tope = Number(p.tope) || 0;
      cuenta.textContent = tope > 0
        ? `Del tope llevarías ${plata(Math.round(nuevo))} de ${plata(tope)}` +
          (nuevo >= tope ? ': queda agotado este mes.' : '.')
        : '';
    };
    cGasto.addEventListener('input', () => recalcular('gasto'));
    cVuelta.addEventListener('input', () => recalcular('vuelta'));
    recalcular();

    const cerrarUso = hoja(`Usé la de ${p.titulo}`, h('div',
      h('div.small.mut', { style: { lineHeight: '1.55', marginBottom: '14px' } },
        'Lo que llena el tope es lo que te devuelven, no lo que gastaste. ',
        valor > 0 ? `Con ${valor} %, poné uno y calculo el otro.` : ''),
      campo('Cuánto gastaste', cGasto),
      campo('Cuánto te vuelve', cVuelta),
      cuenta,
      h('button.btn', { style: { marginTop: '16px' }, onclick: async () => {
        const v = aNumero(cVuelta.value);
        if (!v) { cVuelta.focus(); aviso('Falta cuánto te vuelve'); return; }
        const per = hoyISO().slice(0, 7);
        await guardar('promo_usos', uso
          ? { ...uso, usado: Number(uso.usado) + v }
          : { promo_id: p.id, periodo: per, usado: v });
        cerrarUso();
        aviso('Anotado');
        pintar();
      } }, 'Anotarlo')));
  }

  // El botón dice lo que va a traer, y trae eso: en "La semana" pedir "las de
  // hoy" era prometer una cosa y hacer otra.
  const TRAER = { hoy: 'Traer las de hoy', semana: 'Traer las de la semana',
                  todas: 'Traer todas' };
  const btnTraer = h('button.btn', { onclick: () => hojaTraer(cuando) },
    icono('buscar', 17), TRAER[cuando]);
  const ponerTraer = () => btnTraer.replaceChildren(icono('buscar', 17), TRAER[cuando]);

  pintar();
  root.append(h('div.flow', seg, lista,
    h('div.small.mut', { style: { padding: '0 4px', lineHeight: '1.45' } },
      'El tope consumido es lo que hace honesta la promo: "25 % de reintegro" con el tope lleno es 0 %.'),
    btnTraer,
    h('button.btn.sec', { onclick: () => formPromo() }, icono('mas', 17), 'Agregar a mano'),
    buscadores()));
}

// =====================================================================
// Los buscadores oficiales.
//
// Las promos cambian todas las semanas y ninguno de estos lugares publica
// una lista que se pueda leer sola. Tenerlos a un toque, y que cargar la que
// sirve cueste poco, es mas honesto que fingir que la app las sabe.
// =====================================================================
const BUSCADORES = [
  // Clash junta las de todos los bancos y billeteras en un solo lugar y las
  // ordena por rubro, que es como uno las busca: "estoy en el súper, ¿con qué
  // pago?". Va primero por eso.
  { nombre: 'Clash', detalle: 'todas juntas, por rubro',
    url: 'https://promos.clash.com.ar/' },
  { nombre: 'Galicia', detalle: 'buscador de promociones',
    url: 'https://www.galicia.ar/personas/buscador-de-promociones' },
  { nombre: 'MODO', detalle: 'promos de la semana',
    url: 'https://www.modo.com.ar/promos' },
  { nombre: 'Mercado Pago', detalle: 'promociones vigentes',
    url: 'https://promociones.mercadopago.com.ar/' },
  { nombre: 'Personal Pay', detalle: 'beneficios',
    url: 'https://www.personal.com.ar/pay' }
];

function buscadores() {
  return h('section', { style: { marginTop: '8px' } },
    h('div.ghead', 'Dónde mirar'),
    h('div.grp', BUSCADORES.map(b => h('a.li', {
      href: b.url, target: '_blank', rel: 'noopener noreferrer'
    },
      h('div.av', icono('buscar', 17)),
      h('div.m', h('div.t', b.nombre), h('div.s', b.detalle)),
      h('span.chev', icono('chev', 15))))),
    h('div.small.mut', { style: { padding: '10px 4px 0', lineHeight: '1.5' } },
      'Cuando encuentres una que uses, cargala acá y la app te la recuerda el ',
      'día que aplica y te lleva la cuenta del tope. Los reintegros van primero ',
      'que los descuentos: el reintegro vuelve a tu cuenta.'));
}

/** 'hoy', 'mañana', 'el jueves 10', y de ahí en más los días que faltan. */
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function cuandoCae(d, fecha) {
  if (d <= 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d <= 13) return `el ${DIAS_LARGOS[fecha.getDay()]} ${fecha.getDate()}`;
  return `en ${d} días`;
}

// =====================================================================
// TRAER LAS VIGENTES
// =====================================================================
const RUBROS = [
  ['supermercado', 'Súper'], ['combustible', 'Nafta'], ['gastronomia', 'Comida'],
  ['salud', 'Farmacia'], ['transporte', 'Transporte']
];


/**
 * Las promos vigentes del rubro, filtradas por los medios que tenés.
 *
 * El listado completo son cincuenta y pico por rubro y casi todas son de
 * bancos ajenos: mostrarlas todas sería ruido. Se puede ver el resto igual,
 * pero atrás.
 */
/**
 * Traer de Clash, filtrando por el mismo período que la pestaña de atrás.
 *
 * Clash devuelve todas las vigentes; el recorte es nuestro. Pedir "las de
 * hoy" y mostrar las de la semana que viene es prometer una cosa y hacer
 * otra, y después uno no sabe si la que ve aplica ahora o no.
 */
function hojaTraer(cuando = 'hoy') {
  let rubro = 'supermercado';
  const lista = h('div');
  const seg = h('div.seg', { role: 'tablist', style: { marginBottom: '16px' } },
    ...RUBROS.map(([id, txt]) => h('button', {
      role: 'tab', 'aria-selected': String(id === rubro),
      onclick: () => {
        rubro = id;
        seg.querySelectorAll('button').forEach((b, i) =>
          b.setAttribute('aria-selected', String(RUBROS[i][0] === id)));
        cargar();
      }
    }, txt)));

  const TITULO = { hoy: 'Promos de hoy', semana: 'Promos de la semana',
                   todas: 'Todas las promos' };
  const QUE = { hoy: 'Las que aplican hoy', semana: 'Las que aplican en los próximos siete días',
                todas: 'Todas las vigentes' };
  hoja(TITULO[cuando] || TITULO.hoy, h('div',
    h('div.small.mut', { style: { lineHeight: '1.5', marginBottom: '14px' } },
      `${QUE[cuando] || QUE.hoy}, de Clash. Primero las de tus tarjetas y `,
      'billeteras, y los reintegros antes que los descuentos.'),
    seg, lista));

  async function cargar() {
    lista.replaceChildren(h('div.small.mut', 'Buscando…'));
    try {
      const { promos: traidas, revision } = await traerPromos(rubro);
      const todas = recortar(traidas, cuando);
      if (!traidas.length) { lista.replaceChildren(nadaQueMostrar(revision)); return; }
      if (!todas.length) {
        lista.replaceChildren(h('div.grp.pad', h('div.small.mut',
          { style: { lineHeight: '1.55' } },
          cuando === 'hoy' ? 'Hay promos en este rubro, pero ninguna aplica hoy. Mirá "La semana".'
                           : 'Hay promos en este rubro, pero ninguna en ese período.')));
        return;
      }

      // Se agrupa por comercio ANTES de separar. Agrupando después, Coto
      // aparecía dos veces —una en "con lo que tenés" y otra en "las demás"—
      // y todo lo de Coto tiene que estar en un solo lugar.
      const mias = new Set(F.promosQueTePuedenServir(todas, state.accounts));
      const grupos = porComercio(todas, mias);
      const conLoQueTengo = grupos.filter(g => g.tuya);
      const lasDemas = grupos.filter(g => !g.tuya);

      lista.replaceChildren(
        conLoQueTengo.length
          ? h('div', h('div.ghead', 'Con lo que tenés'),
              h('div.grp', conLoQueTengo.map(x => filaGrupo(x, rubro))))
          : h('div.grp.pad', h('div.small.mut', { style: { lineHeight: '1.5' } },
              'Ninguna de las vigentes es para tus tarjetas o billeteras. ',
              'Abajo están todas por si te sirve alguna.')),
        lasDemas.length ? h('div', { style: { marginTop: '18px' } },
          h('div.ghead', `Las demás · ${lasDemas.length}`),
          h('div.grp', lasDemas.slice(0, 25).map(x => filaGrupo(x, rubro)))) : null);
    } catch (e) {
      lista.replaceChildren(h('div.small.mut', { style: { lineHeight: '1.5' } },
        String(e.message || e)));
    }
  }

  /**
   * Cuando no vuelve ninguna, decir por que.
   *
   * "No hay promos" y "la página cambió y no la sé leer" se ven igual en la
   * pantalla y no son lo mismo: el sobre trae con que se topó la función.
   */
  function nadaQueMostrar(revision) {
    // Clash contestó con las listas vacías: hoy no hay promos en ese rubro.
    // No es que no sepamos leer la página, y mostrar un volcado técnico para
    // un caso normal asusta sin motivo.
    if (!revision || revision.data?.vacio) {
      return h('div.grp.pad', h('div.small.mut', { style: { lineHeight: '1.55' } },
        'Hoy no hay promos cargadas en este rubro. Probá con otro, o volvé ',
        'mañana: Clash las actualiza todos los días.'));
    }
    // Con el detalle a la vista: "no pude leerlas" sin decir qué llegó es un
    // callejón sin salida, y esto se arregla mirando dos líneas.
    return h('div.grp.pad', h('div.small.mut', { style: { lineHeight: '1.55' } },
      'Clash contestó pero no pude leer ninguna promo. ',
      'Mandale esto a quien mantiene la app:',
      h('div', { style: { fontFamily: 'ui-monospace, monospace', fontSize: '11px',
                          marginTop: '9px', wordBreak: 'break-all', userSelect: 'all' } },
        JSON.stringify(revision).slice(0, 400))));
  }

  cargar();
}

/**
 * Una fila por comercio, con la mejor adelante.
 *
 * Sin esto YPF aparecía seis veces seguidas —una por banco— y la pantalla se
 * volvía ilegible justo donde hay que decidir rápido. Las otras no se pierden:
 * van en una línea, que es todo lo que hace falta para saber que están.
 */
/** Las que aplican en el período elegido. Clash manda todas las vigentes. */
function recortar(promos, cuando) {
  if (cuando === 'todas') return promos;
  const hoy = new Date();
  const dia = hoy.getDay();
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 7);
  return promos.filter(p => {
    // Con fecha propia manda la fecha; sin ella, los días de la semana.
    if (p.fechas?.length) {
      return p.fechas.some(f => {
        const d = new Date(`${f}T00:00:00`);
        return cuando === 'hoy'
          ? f === `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
          : d >= new Date(hoy.toDateString()) && d <= hasta;
      });
    }
    // Sin días marcados, aplica todos los días: entra en cualquier período.
    if (!p.dias?.length) return true;
    return cuando === 'hoy' ? p.dias.includes(dia) : true;
  });
}

function porComercio(promos, mias = new Set()) {
  const grupos = new Map();
  // Las que servís vos primero: la que encabeza el grupo tiene que ser una
  // que puedas usar, no la de mayor porcentaje de un banco que no tenés.
  const orden = promos.slice().sort((a, b) =>
    (mias.has(b) - mias.has(a)) || F.ordenPromo(a, b));
  for (const p of orden) {
    const k = String(p.comercio || p.emisor || '').toLowerCase();
    if (!grupos.has(k)) grupos.set(k, { ...p, otras: [], tuya: mias.has(p) });
    else grupos.get(k).otras.push(p);
  }
  return [...grupos.values()];
}

/**
 * Un comercio traído de Clash, en una línea.
 *
 * Antes cada fila mostraba cinco renglones grises —tipo, emisor, días,
 * medios, "también con...", la letra chica y el tope— y treinta comercios así
 * son una pared de texto que nadie lee. Lo único que hace falta para decidir
 * si entrar es el comercio y hasta cuánto llega; con cuál pagar se mira
 * adentro, cuando ya te interesó.
 */
function filaGrupo(p, rubro) {
  const cuantas = 1 + (p.otras?.length || 0);
  const titulo = String(p.comercio || p.emisor || 'Promo').replace(/\b\w/g, c => c.toUpperCase());
  const valor = Number(p.valor);
  const cifra = Number.isFinite(valor) && valor > 0
    ? (p.tipo === 'cuotas' ? `${valor}×` : `${valor}%`) : '—';
  if (cuantas === 1) return fila(p, rubro);

  const bancos = [p, ...(p.otras || [])]
    .map(x => x.emisorNombre || x.emisor).filter(Boolean);
  return h('button.li', { onclick: () => hojaComercio(p, rubro) },
    h('div', { class: 'cifra' + (p.tipo === 'reintegro' ? ' pos' : ''),
               style: { fontSize: '19px', flex: 'none', minWidth: '48px' } }, cifra),
    h('div.m',
      h('div.t', titulo),
      h('div.s', `hasta ${cifra} · ${cuantas} opciones · ${[...new Set(bancos)].slice(0, 3).join(', ')}`)),
    h('span.chev', icono('chev', 15)));
}

/** Todas las de un comercio, cada una con su banco y su botón de guardar. */
function hojaComercio(p, rubro) {
  const titulo = String(p.comercio || p.emisor || 'Promo').replace(/\b\w/g, c => c.toUpperCase());
  const todas = [p, ...(p.otras || [])];
  return hoja(titulo, h('div',
    h('div.small.mut', { style: { lineHeight: '1.55', marginBottom: '14px' } },
      `${todas.length} promos en ${titulo}, de mayor a menor. `,
      'Guardá la que uses: te la recuerdo el día que aplica y te llevo la ',
      'cuenta del tope.'),
    h('div.grp', todas.map(x => fila(x, rubro, { porBanco: true })))));
}

/** Una promo traída, con el botón para guardarla como propia. */
function fila(p, rubro, { porBanco = false } = {}) {
  const dias = p.fechas?.length ? p.fechas.map(f => `el ${Number(f.slice(8))}/${Number(f.slice(5, 7))}`).join(' y ')
             : p.dias?.length ? p.dias.map(d => DIAS[d]).join(' y ') : 'todos los días';
  const titulo = String(p.comercio || p.emisor || 'Promo').replace(/\b\w/g, c => c.toUpperCase());
  // Adentro de la hoja de un comercio, todas las filas son de ese comercio:
  // lo que las distingue es el banco.
  const encabeza = porBanco ? (p.emisorNombre || p.emisor || titulo) : titulo;
  // Number() y no p.valor a secas: un campo vacío escribía "null%" en la
  // cifra más grande de la fila.
  const valor = Number(p.valor);
  const cifra = Number.isFinite(valor) && valor > 0
    ? (p.tipo === 'cuotas' ? `${valor}×` : `${valor}%`) : '—';

  return h('div.li',
    h('div', { class: 'cifra' + (p.tipo === 'reintegro' ? ' pos' : ''),
               style: { fontSize: '19px', flex: 'none', minWidth: '48px' } }, cifra),
    h('div.m',
      h('div.t', encabeza),
      h('div.s', [p.tipo, porBanco ? null : (p.emisorNombre || p.emisor), dias]
        .filter(Boolean).join(' · ')),
      p.medios?.length ? h('div.s', { style: { color: 'var(--tx3)' } },
        p.medios.join(' · ').toLowerCase()) : null,
      p.nota ? h('div.s', { style: { whiteSpace: 'normal', lineHeight: '1.4',
                                     color: 'var(--tx3)' } }, p.nota) : null,
      p.tope ? h('div.s', { style: { color: 'var(--tx3)' } },
        `tope ${plata(p.tope)}${p.topePeriodo === 'semanal' ? ' por semana'
                              : p.topePeriodo ? ' por mes' : ''}`) : null),
    h('button.iconbtn', { 'aria-label': 'Guardarla', onclick: async e => {
      const b = e.currentTarget; b.disabled = true;
      // Guardarla ES elegirla: por eso queda marcada para que aparezca en Hoy
      // el día que cae. La campana de la tarjeta la desmarca.
      await guardar('promos', {
        titulo: `${titulo} ${cifra}`, comercio: p.comercio || null,
        valor: Number.isFinite(valor) ? valor : null,
        tipo: p.tipo === 'cuotas' ? 'cuotas' : p.tipo || 'descuento',
        emisor: p.emisor || 'otro',
        tope: p.tope || null, tope_periodo: p.topePeriodo || 'mensual',
        dias: p.dias || [], medio_pago: (p.medios || []).join(', ') || p.emisor,
        rubro: rubro || 'otros', canal: 'ambos',
        // Una promo con fecha propia —"Jueves 10/09"— es de un solo día, no
        // de todos los jueves: guardarla como semanal la haría aparecer
        // cuatro veces al mes y ninguna sería cierta.
        vigencia_desde: p.fechas?.[0] || null,
        vigencia_hasta: p.fechas?.length ? p.fechas[p.fechas.length - 1] : null,
        url: p.url || null, notas: p.nota || null,
        marcas: p.comercio ? [p.comercio] : [], activa: true, favorita: false,
        recordar: true
      });
      aviso('Guardada, te la recuerdo en Hoy');
    } }, icono('mas', 18)));
}
