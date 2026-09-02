// =====================================================================
// vistas/promos.js — promos del dia, ordenadas por cercania.
// La barra de tope consumido es lo que hace honesta la pantalla: una promo
// de "25 %" con el tope al 62 % ya no es del 25 %.
// =====================================================================
import { h, icono, iconoDe, aviso, hoja } from '../ui.js';
import { state, guardar, traerPromos } from '../db.js';
import * as F from '../finance.js';
import { plata, hoyISO } from '../formato.js';
import { formPromo } from './formularios.js';
import { posicion, sucursalesCerca, distanciaTexto, mapsUrl } from '../geo.js';

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
    for (const p of promos) lista.append(tarjeta(p, hoy));
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
        h('button.iconbtn', { 'aria-label': p.recordar ? 'No recordarme esta promo'
                                                       : 'Recordarme esta promo',
          'aria-pressed': String(!!p.recordar),
          style: { flex: 'none', color: p.recordar ? 'var(--bra)' : 'var(--tx3)' },
          onclick: async e => {
            e.stopPropagation();
            await guardar('promos', { ...p, recordar: !p.recordar });
            aviso(p.recordar ? 'No te la recuerdo más' : 'Te la recuerdo en Hoy');
          } }, icono('campana', 18))),
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
      cerca(p));
  }

  // --------------------------------------------------- cercania por GPS
  const cercania = h('div');
  let sucursales = new Map();
  const btnGps = h('button.btn.sec', { onclick: async () => {
    btnGps.disabled = true; btnGps.textContent = 'Buscando…';
    try {
      const centro = await posicion();
      const activas = state.promos.filter(p => p.activa !== false && p.osm_filtro);
      const res = await Promise.all(activas.map(p =>
        sucursalesCerca(p, centro).then(l => [p.id, l]).catch(() => [p.id, []])));
      sucursales = new Map(res);
      btnGps.textContent = 'Actualizar ubicación';
      pintar();
    } catch (e) {
      aviso(e && e.code === 1 ? 'Hace falta permiso de ubicación'
                              : 'No pude ubicarte. Probá de nuevo.');
      btnGps.textContent = 'Ver las más cercanas';
    }
    btnGps.disabled = false;
  } }, icono('pin', 17), 'Ver las más cercanas');
  cercania.append(btnGps);

  /** La sucursal mas cercana, si ya pedimos la ubicacion. */
  function cerca(p) {
    const l = sucursales.get(p.id);
    if (!l || !l.length) return null;
    const s0 = l[0];
    return h('a', { href: mapsUrl(s0), target: '_blank', rel: 'noopener',
                    style: { display: 'flex', alignItems: 'center', gap: '5px',
                             fontSize: '12.5px', color: 'var(--tx2)', marginTop: '9px' } },
      icono('pin', 13),
      h('b', { style: { color: 'var(--tx)', fontWeight: '600' } }, distanciaTexto(s0.metros)),
      s0.nombre ? ` · ${s0.nombre}` : '', h('span.chev', icono('chev', 12)));
  }

  pintar();
  root.append(h('div.flow', seg, cercania, lista,
    h('div.small.mut', { style: { padding: '0 4px', lineHeight: '1.45' } },
      'El tope consumido es lo que hace honesta la promo: "25 % de reintegro" con el tope lleno es 0 %.'),
    h('button.btn', { onclick: () => hojaTraer() }, icono('buscar', 17), 'Traer las de hoy'),
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

// Con qué se buscan las sucursales cerca en OpenStreetMap. Se guarda al traer
// la promo para que "Ver las más cercanas" funcione sin tener que editarla:
// Clash no dice dónde está cada comercio, y muchas promos son de una sola
// ciudad.
const OSM = {
  supermercado: 'shop=supermarket', combustible: 'amenity=fuel',
  gastronomia: 'amenity=restaurant', salud: 'amenity=pharmacy', transporte: ''
};

/**
 * Las promos vigentes del rubro, filtradas por los medios que tenés.
 *
 * El listado completo son cincuenta y pico por rubro y casi todas son de
 * bancos ajenos: mostrarlas todas sería ruido. Se puede ver el resto igual,
 * pero atrás.
 */
function hojaTraer() {
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

  hoja('Promos de hoy', h('div',
    h('div.small.mut', { style: { lineHeight: '1.5', marginBottom: '14px' } },
      'Las que están vigentes ahora, de Clash. Primero las de tus tarjetas y ',
      'billeteras, y los reintegros antes que los descuentos.'),
    seg, lista));

  async function cargar() {
    lista.replaceChildren(h('div.small.mut', 'Buscando…'));
    try {
      const { promos: todas, revision } = await traerPromos(rubro);
      const mias = F.promosQueTePuedenServir(todas, state.accounts);
      const resto = todas.filter(p => !mias.includes(p)).sort(F.ordenPromo);

      if (!todas.length) { lista.replaceChildren(nadaQueMostrar(revision)); return; }

      const conLoQueTengo = porComercio(mias);
      const lasDemas = porComercio(resto);

      lista.replaceChildren(
        conLoQueTengo.length
          ? h('div', h('div.ghead', 'Con lo que tenés'),
              h('div.grp', conLoQueTengo.map(x => fila(x, rubro))))
          : h('div.grp.pad', h('div.small.mut', { style: { lineHeight: '1.5' } },
              'Ninguna de las vigentes es para tus tarjetas o billeteras. ',
              'Abajo están todas por si te sirve alguna.')),
        lasDemas.length ? h('div', { style: { marginTop: '18px' } },
          h('div.ghead', `Las demás · ${lasDemas.length}`),
          h('div.grp', lasDemas.slice(0, 25).map(x => fila(x, rubro)))) : null);
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
    if (!revision) {
      return h('div.grp.pad', h('div.small.mut', { style: { lineHeight: '1.55' } },
        'No hay promos vigentes en este rubro.'));
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
function porComercio(promos) {
  const grupos = new Map();
  for (const p of promos.slice().sort(F.ordenPromo)) {
    const k = String(p.comercio || p.emisor || '').toLowerCase();
    if (!grupos.has(k)) grupos.set(k, { ...p, otras: [] });
    else grupos.get(k).otras.push(p);
  }
  return [...grupos.values()];
}

/** Una promo traída, con el botón para guardarla como propia. */
function fila(p, rubro) {
  const dias = p.fechas?.length ? p.fechas.map(f => `el ${Number(f.slice(8))}/${Number(f.slice(5, 7))}`).join(' y ')
             : p.dias?.length ? p.dias.map(d => DIAS[d]).join(' y ') : 'todos los días';
  const titulo = String(p.comercio || p.emisor || 'Promo').replace(/\b\w/g, c => c.toUpperCase());
  // Number() y no p.valor a secas: un campo vacío escribía "null%" en la
  // cifra más grande de la fila.
  const valor = Number(p.valor);
  const cifra = Number.isFinite(valor) && valor > 0
    ? (p.tipo === 'cuotas' ? `${valor}×` : `${valor}%`) : '—';

  return h('div.li',
    h('div', { class: 'cifra' + (p.tipo === 'reintegro' ? ' pos' : ''),
               style: { fontSize: '19px', flex: 'none', minWidth: '48px' } }, cifra),
    h('div.m',
      h('div.t', titulo),
      h('div.s', [p.tipo, p.emisorNombre || p.emisor, dias].filter(Boolean).join(' · ')),
      p.medios?.length ? h('div.s', { style: { color: 'var(--tx3)' } },
        p.medios.join(' · ').toLowerCase()) : null,
      p.otras?.length ? h('div.s', { style: { color: 'var(--tx3)' } },
        'también ' + p.otras.slice(0, 3).map(o =>
          `${o.emisorNombre || o.emisor} ${Number(o.valor) || 0}%`).join(', ')) : null,
      p.nota ? h('div.s', { style: { color: 'var(--tx3)' } }, p.nota) : null,
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
        // Con esto "Ver las más cercanas" ya funciona: Clash no dice dónde
        // está cada comercio y muchas promos son de una sola ciudad.
        osm_filtro: OSM[rubro] || null,
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
