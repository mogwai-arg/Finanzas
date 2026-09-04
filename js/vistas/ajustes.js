// =====================================================================
// vistas/ajustes.js
// =====================================================================
import { h, frag, icono, aviso, confirmar, hoja, campo } from '../ui.js';
import { state, salir, sincronizar, exportarJSON, pendientes, fallidas, DEMO,
         traerDolar,
         FUNCTIONS_URL, conectar, desconectar, leerAhora, mirarBandeja,
         guardar, probarAviso, generarClavesAviso } from '../db.js';
import { plata, fechaRelativa, aNumero } from '../formato.js';
import { bishu } from '../bishu.js';
import { estadoPush, prenderPush, apagarPush } from '../push.js';
import { irA } from '../ruteo.js';
import { formCategorias } from './formularios.js';
import { formImportarResumen } from './importar.js';
import { formImportarExtracto } from './extracto.js';

export function vistaAjustes(root) {
  const tema = document.documentElement.getAttribute('data-tema') || 'auto';
  const cola = pendientes(), rotas = fallidas();

  root.append(h('div.flow',
    avisoOAuth(),

    rotas.length ? h('div.aviso.amb',
      h('div.av.amb', icono('rayo', 17)),
      h('div.txt',
        h('div.tt', `${rotas.length} cambios no se pudieron subir`),
        h('div.ds', 'Están guardados acá, no se perdió nada. Casi siempre es que ',
          'a la base le falta correr una migración.'),
        // Sin el motivo, el cartel es un callejón sin salida: se puede
        // reintentar para siempre y nunca saber que falta una columna.
        h('div.small.mut', { style: { marginTop: '8px', lineHeight: '1.5' } },
          motivos(rotas).map(m => h('div', { style: { marginTop: '4px' } }, '· ', m))),
        h('button.btn', { style: { marginTop: '12px' }, onclick: async () => {
          await sincronizar({ reintentarFallidas: true });
          aviso('Reintentando…'); } }, 'Reintentar'))) : null,

    h('section',
      h('div.ghead', 'Cuenta'),
      h('div.grp',
        h('div.li', h('div.av', icono('banco', 17)),
          h('div.m', h('div.t', state.user?.email || 'Modo demo'),
            h('div.s', DEMO ? 'Los datos quedan en este aparato' : 'Sesión iniciada')),
        ),
        h('button.li', { onclick: () => sincronizar().then(() => aviso('Al día')) },
          h('div.av', icono('sync', 17)),
          h('div.m', h('div.t', 'Sincronizar ahora'),
            h('div.s', cola ? `${cola} cambios esperando` : 'Todo subido')),
          h('span.chev', icono('chev', 15))))),

    h('section',
      h('div.ghead', 'Tu configuración'),
      h('div.grp',
        h('button.li', { onclick: () => irA('/donde') },
          h('div.av', icono('tarjeta', 17)),
          h('div.m', h('div.t', 'Cuentas y tarjetas'),
            h('div.s', `${(state.accounts || []).length} cargadas`)),
          h('span.chev', icono('chev', 15))),
        h('button.li', { onclick: () => formImportarExtracto() },
          h('div.av', icono('banco', 17)),
          h('div.m', h('div.t', 'Subir un resumen de cuenta'),
            h('div.s', 'El del banco: trae las comisiones que no avisa nadie')),
          h('span.chev', icono('chev', 15))),
        h('button.li', { onclick: () => formImportarResumen() },
          h('div.av', icono('recibo', 17)),
          h('div.m', h('div.t', 'Importar un resumen'),
            h('div.s', 'Pegás el PDF de la tarjeta y entra todo junto')),
          h('span.chev', icono('chev', 15))),
        h('button.li', { onclick: () => formCategorias() },
          h('div.av', icono('lista', 17)),
          h('div.m', h('div.t', 'Categorías'),
            h('div.s', `${(state.categories || []).length} cargadas`)),
          h('span.chev', icono('chev', 15))))),

    seccionLectura(),

    seccionDolar(),

    seccionAvisos(),

    h('section',
      h('div.ghead', 'Sueldo'),
      h('div.grp',
        h('button.li', { onclick: () => irA('/sueldo') },
          h('div.av', icono('recibo', 17)),
          h('div.m', h('div.t', 'Recibos y paritarias'),
            h('div.s', `${(state.paritarias || []).length} acuerdos · ${(state.recibos || []).length} recibos`)),
          h('span.chev', icono('chev', 15))))),

    h('section',
      h('div.ghead', 'Cómo se ve'),
      h('div.grp',
        h('div.li',
          h('div.av', icono('ojo', 17)),
          h('div.m', h('div.t', 'Tema'), h('div.s', 'Claro, oscuro o el del sistema')),
          h('div.seg', { style: { width: '190px' } },
            ...[['auto', 'Auto'], ['claro', 'Claro'], ['oscuro', 'Oscuro']].map(([v, t]) =>
              h('button', { 'aria-selected': String(tema === v), onclick: () => {
                if (v === 'auto') { document.documentElement.removeAttribute('data-tema');
                                    localStorage.removeItem('bishusha.tema'); }
                else { document.documentElement.setAttribute('data-tema', v);
                       localStorage.setItem('bishusha.tema', v); }
                aviso('Listo');
              } }, t)))))),

    h('section',
      h('div.ghead', 'Tus datos'),
      h('div.grp',
        h('button.li', { onclick: exportar },
          h('div.av', icono('recibo', 17)),
          h('div.m', h('div.t', 'Exportar todo'),
            h('div.s', 'Un archivo con tus movimientos, cuentas y recibos')),
          h('span.chev', icono('chev', 15))),
        !DEMO && h('button.li', { onclick: async () => {
          if (await confirmar('¿Cerrar sesión en este aparato?', 'Salir')) { await salir(); location.reload(); }
        } },
          h('div.av.neg', icono('cerrar', 17)),
          h('div.m', h('div.t', { style: { color: 'var(--neg)' } }, 'Cerrar sesión')))),
      version())
  ));
}

/**
 * Qué versión está corriendo este teléfono, y forzar la nueva.
 *
 * Sin poder verlo, cada arreglo es una adivinanza: no hay forma de saber si
 * el problema sigue o si el service worker está sirviendo la versión de ayer,
 * y las dos cosas se ven exactamente igual. Con el número, una captura
 * alcanza para saberlo.
 */
function version() {
  const v = window.CONFIG?.VERSION || (DEMO ? 'demo' : 'desconocida');
  const btn = h('button', { style: { background: 'none', border: '0', padding: '0',
                                     color: 'var(--brand)', fontSize: '12.5px',
                                     minHeight: '44px', cursor: 'pointer' } },
    'Buscar una versión nueva');
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = 'Buscando…';
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
      // Un worker nuevo esperando: se le dice que tome el mando ahora, sin
      // esperar a que se cierren todas las pestañas.
      if (reg?.waiting) { reg.waiting.postMessage({ tipo: 'tomar-el-mando' }); }
      aviso(reg?.waiting || reg?.installing ? 'Hay una nueva, recargando…' : 'Ya tenés la última');
      if (reg?.waiting || reg?.installing) setTimeout(() => location.reload(true), 900);
    } catch (e) { aviso('No pude comprobarlo'); }
    btn.disabled = false; btn.textContent = 'Buscar una versión nueva';
  };
  return h('div.small.mut', { style: { padding: '10px 4px 0', lineHeight: '1.5' } },
    'Versión ', h('b', { style: { fontFamily: 'ui-monospace, monospace' } }, String(v)), '. ',
    btn);
}

// =====================================================================
// AVISOS
// =====================================================================
/**
 * Los avisos que manda Bishu al teléfono, de a uno.
 *
 * Se prenden por separado porque el primer aviso que no interesa es el que
 * hace apagar todos. Y el permiso se pide con un toque, no al abrir la app:
 * pedirlo de entrada es la forma más rápida de que lo nieguen para siempre.
 */
const TIPOS = [
  ['pagos',    'Vencimientos',       'Tarjetas y gastos fijos, dos días antes'],
  ['promos',   'Promos marcadas',    'El día que cae la que pediste que te recuerde'],
  ['resumen',  'Cierre de tarjeta',  'La víspera del cierre, para llegar con la compra'],
  ['saldo',    'Saldo bajo',         'Cuando una cuenta queda por debajo del mínimo'],
  ['aumentos', 'Aumentos',           'Cuando un fijo sube más que el resto, o un correo lo dice'],
  ['bishu',    'Cómo venís',         'Bishu compara con el mes pasado, una vez por semana'],
  ['cierre',   'Cierre del mes',     'El día 1, cómo cerró el mes que terminó'],
  ['extracto', 'Resumen del banco',  'Cuando llega el de la cuenta, para subirlo'],
  ['viene',    'Lo que ya viene',    'El día 10, si un mes futuro queda muy comprometido']
];

/**
 * El dólar con el que se suman pesos y dólares.
 *
 * Se puede traer solo o escribir a mano, y las dos cosas hacen falta:
 * traerlo es lo que hace que no se deje de actualizar, y escribirlo a mano es
 * la salida cuando el servicio no contesta o cuando querés usar TU cotización
 * —la del día que compraste— en vez de la de hoy.
 *
 * Y siempre dice de cuándo es. Una cotización de hace tres meses hace más
 * daño que ninguna: el total sale mal y nadie sospecha del número.
 */
function seccionDolar() {
  const val = Number(state.settings?.usd_ref) || 0;
  const entrada = h('input', { type: 'text', inputmode: 'decimal', placeholder: '1500',
                             value: val ? String(val) : '',
                             style: { width: '120px' },
                             onchange: async e => {
                               const n = aNumero(e.target.value);
                               await guardar('settings', { ...(state.settings || {}),
                                 usd_ref: n || null,
                                 usd_ref_al: n ? new Date().toISOString() : null,
                                 usd_ref_de: null });
                               aviso(n ? 'Cotización guardada' : 'Cotización borrada');
                             } });

  const cuando = state.settings?.usd_ref_al;
  const dias = cuando ? Math.floor((Date.now() - new Date(cuando)) / 86400000) : null;
  // Sin fecha es el caso peligroso, no el neutro: un número puesto se lee como
  // un número actual, y si nadie sabe de cuándo es, nadie lo va a dudar.
  const vieja = dias == null || dias > 7;

  const pie = h('div.small.mut', { style: { padding: '10px 4px 0', lineHeight: '1.5',
                                           color: vieja ? 'var(--amb)' : undefined } },
    !val ? 'Sin esto, los pesos y los dólares se muestran por separado y nunca se suman.'
    : dias == null ? 'No sé de cuándo es. Traela de nuevo o volvé a escribirla.'
    : dias === 0 ? `De hoy${state.settings?.usd_ref_de ? `, de ${state.settings.usd_ref_de}` : ''}.`
    : dias > 7 ? `De hace ${dias} días. Con una vieja, el total de tu plata sale mal y no se nota.`
    : `De hace ${dias} ${dias === 1 ? 'día' : 'días'}.`);

  const btn = h('button.btn.sec', { style: { marginTop: '12px' }, onclick: async () => {
    btn.disabled = true; btn.textContent = 'Buscando…';
    try {
      const d = await traerDolar();
      // guardar() avisa que el estado cambió y la pantalla se redibuja sola.
      aviso(`Dólar MEP ${plata(d.mep)}`);
    } catch (e) {
      // Qué pasó, no "no pude": el campo de arriba sigue estando y con el
      // motivo se sabe si hay que escribirlo a mano o esperar un rato.
      aviso(String(e.message || e).slice(0, 90));
      btn.disabled = false; btn.textContent = 'Traer el de hoy';
    }
  } }, icono('sync', 16), 'Traer el de hoy');

  return h('section',
    h('div.ghead', 'Dólar'),
    h('div.grp',
      h('div.li',
        h('div.av', icono('monedas', 17)),
        h('div.m', h('div.t', 'Cotización MEP'),
          h('div.s', 'Con esto se valúa en pesos lo que tenés en dólares')),
        entrada)),
    pie, btn);
}

function seccionAvisos() {
  const grp = h('div.grp');
  const sec = h('section', h('div.ghead', 'Avisos'), grp);

  const prefs = () => (state.settings?.avisos) || {};
  // Falta una clave = está prendida: un tipo nuevo no queda mudo para quien
  // ya tenía sus preferencias guardadas.
  const prendido = k => prefs()[k] !== false;

  async function guardarPref(k, v) {
    await guardar('settings', { ...(state.settings || {}), avisos: { ...prefs(), [k]: v } });
  }

  async function pintar() {
    const estado = await estadoPush();
    const listo = estado === 'listo';

    const cabecera = h('div.li', { style: { alignItems: 'flex-start' } },
      h('div', { style: { color: listo ? 'var(--bra)' : 'var(--tx3)', flex: 'none',
                          marginTop: '2px' } },
        bishu(listo ? 'contento' : 'dormido', 40)),
      h('div.m',
        h('div.t', 'Avisos en el teléfono'),
        h('div.s', { style: { lineHeight: '1.45' } }, explicacion(estado))));

    const boton = estado === 'listo'
      ? h('button.btn.sec', { onclick: async () => {
          await apagarPush(); aviso('Apagados en este teléfono'); pintar();
        } }, 'Apagarlos en este teléfono')
      : estado === 'sin-clave'
        ? h('button.btn.sec', { onclick: () => hojaClaves() }, 'Generar las claves')
      : estado === 'apagado'
        ? h('button.btn', { onclick: async () => {
            try { await prenderPush(); aviso('Listo, te aviso por acá'); }
            catch (e) { aviso(e.message); }
            pintar();
          } }, icono('campana', 17), 'Prender los avisos')
        : null;

    // replaceChildren es DOM crudo y no filtra: un null se dibuja como la
    // palabra "null" en la pantalla.
    grp.replaceChildren(...[
      cabecera,
      boton ? h('div', { style: { padding: '0 14px 14px' } }, boton) : null,
      listo ? h('div', { style: { padding: '0 14px 14px' } },
        h('button.btn.sec', { onclick: () => hojaPrueba() }, 'Mandarme uno de prueba')) : null,
      ...TIPOS.map(([k, titulo, detalle]) => {
        const chk = h('input', { type: 'checkbox', checked: prendido(k),
                                 disabled: !listo,
                                 onchange: e => guardarPref(k, e.target.checked) });
        return h('label.li', { style: { opacity: listo ? '1' : '.5' } },
          h('div.m', h('div.t', titulo), h('div.s', detalle)), chk);
      }),
      listo && prendido('saldo') ? filaSaldoMinimo() : null
    ].filter(Boolean));
  }

  function filaSaldoMinimo() {
    const inp = h('input', { type: 'text', inputmode: 'decimal',
                             value: String(state.settings?.saldo_minimo || ''),
                             placeholder: '50000', style: { width: '130px' },
                             onchange: async e => {
                               await guardar('settings', { ...(state.settings || {}),
                                 saldo_minimo: aNumero(e.target.value) || 0 });
                               aviso('Guardado');
                             } });
    return h('div.li',
      h('div.m', h('div.t', 'Mínimo en la cuenta'),
        h('div.s', 'Debajo de esto, Bishu avisa')), inp);
  }

  /**
   * El aviso de prueba, con el diagnóstico entero cuando no llega.
   *
   * Un aviso que no llega puede ser cinco cosas y todas se ven igual desde
   * afuera: falta una clave, la pública y la privada no son el mismo par, la
   * clave del navegador no es la del servidor, el teléfono no está suscripto,
   * o el servicio de push rechaza la firma. Un "no salió, revisá las claves"
   * en un cartelito no alcanza para arreglar ninguna de las cinco.
   */
  function hojaPrueba() {
    const caja = h('div', h('div.small.mut', 'Mandando…'));
    const cerrar = hoja('Aviso de prueba', caja);

    probarAviso().then(r => {
      // Sin `revision`, el servidor todavía tiene la versión vieja de
      // cron-avisos: no sabe contestar nada de esto. Decir que faltan las seis
      // cosas sería mentir con seis cruces.
      if (!r.revision) {
        caja.replaceChildren(h('div.flow', { style: { gap: '14px' } },
          h('div.grp.pad', { style: { display: 'flex', alignItems: 'center', gap: '13px' } },
            h('div', { style: { color: 'var(--amb)', flex: 'none' } }, bishu('atento', 44)),
            h('div',
              h('div', { style: { fontWeight: '600', marginBottom: '2px' } },
                'El servidor tiene la versión vieja'),
              h('div.small.mut', { style: { lineHeight: '1.45' } },
                'Contestó “', String(r.motivo || 'sin detalle'), '”, que es lo que decía ',
                'antes. Pegá de nuevo la función cron-avisos en Supabase y ',
                'volvé a probar: la nueva revisa las seis cosas de a una.')))));
        return;
      }
      const d = r.revision;
      // La comparación que no puede hacer el servidor: la clave que tiene el
      // navegador viene de Cloudflare y la del servidor de Supabase. Que las
      // dos existan no quiere decir que sean la misma, y cuando no lo son el
      // servicio de push contesta 403 sin explicar nada.
      const delNavegador = (window.CONFIG?.VAPID_PUBLIC || '').trim();
      const coincide = d.publica && delNavegador
        ? d.publica === delNavegador : null;

      // Las dos claves tienen que estar para poder decir si son el mismo par
      // o si coinciden con la del navegador. Sin ellas eso no se sabe, y
      // marcarlo con una cruz sería tres problemas donde hay uno: es el mismo
      // error de mostrar la consecuencia como si fuera otra causa.
      const hayClaves = d.VAPID_PUBLIC && d.VAPID_PRIVATE;
      const filas = [
        ['VAPID_PUBLIC en Supabase', d.VAPID_PUBLIC,
         'Va también en Supabase, no solo en Cloudflare: viaja en cada aviso.'],
        ['VAPID_PRIVATE en Supabase', d.VAPID_PRIVATE, null],
        ['VAPID_SUBJECT en Supabase', d.VAPID_SUBJECT,
         'Con tu mail: mailto:vos@ejemplo.com'],
        ['Las dos claves son el mismo par', hayClaves ? d.parValido : null,
         hayClaves
           ? 'Si generaste el par dos veces, puede haber quedado la pública de una ' +
             'y la privada de la otra. Generá uno nuevo y poné las dos.'
           : 'Se puede saber cuando estén las dos.'],
        ['La del navegador es la misma', !d.VAPID_PUBLIC ? null : coincide,
         !d.VAPID_PUBLIC ? 'Se puede saber cuando esté la del servidor.'
           : coincide === null
             ? 'Falta la clave en Cloudflare Pages, o no republicaste después de ponerla.'
             : 'La de Cloudflare Pages tiene que ser idéntica a la de Supabase.'],
        ['Este teléfono está suscripto', d.suscripciones > 0,
         'Se prende desde el teléfono, con la app agregada a la pantalla de inicio.']
      ];

      caja.replaceChildren(h('div.flow', { style: { gap: '14px' } },
        h('div.grp.pad', { style: { display: 'flex', alignItems: 'center', gap: '13px' } },
          h('div', { style: { color: r.enviados ? 'var(--pos)' : 'var(--amb)', flex: 'none' } },
            bishu(r.enviados ? 'festejo' : 'atento', 44)),
          h('div',
            h('div', { style: { fontWeight: '600', marginBottom: '2px' } },
              r.enviados ? 'Salió, mirá el teléfono' : 'No salió'),
            h('div.small.mut', { style: { lineHeight: '1.45' } },
              r.enviados
                ? 'Si no aparece nada, el teléfono tiene los avisos de esta app apagados ' +
                  'en los ajustes del sistema.'
                : (r.motivo || 'Abajo está qué falta.')))),

        h('div', h('div.ghead', 'Qué está puesto'),
          h('div.grp', filas.map(([que, ok, ayuda]) => h('div.li',
            h('div', { class: 'av ' + (ok ? 'pos' : ok === null ? '' : 'amb') },
              ok === null ? h('span', { style: { fontWeight: '700' } }, '—')
                          : icono(ok ? 'check' : 'cerrar', 15)),
            h('div.m', h('div.t', { style: ok === null ? { color: 'var(--tx3)' } : {} }, que),
              !ok && ayuda ? h('div.s', { style: { whiteSpace: 'normal',
                                                   lineHeight: '1.4' } }, ayuda) : null))))),

        (d.envios || []).length ? h('div',
          h('div.ghead', 'Qué contestó el servicio de push'),
          h('div.grp', d.envios.map(e => h('div.li',
            h('div.m', h('div.t', e.donde || 'el servicio'),
              h('div.s', e.error ? e.error : `código ${e.status}`)),
            h('div.v', { style: { color: e.ok ? 'var(--pos)' : 'var(--neg)' } },
              e.ok ? 'OK' : 'falló'))))) : null,

        d.publica ? h('div.small.mut', { style: { lineHeight: '1.5' } },
          'La clave pública del servidor termina en ',
          h('b', String(d.publica).slice(-12)),
          delNavegador ? frag(' y la del navegador en ', h('b', delNavegador.slice(-12)), '.')
                       : '; el navegador no tiene ninguna.') : null,

        h('button.btn.sec', { onclick: () => { cerrar(); hojaClaves(); } },
          'Generar un par nuevo')));
    }).catch(e => caja.replaceChildren(
      h('div.small.mut', { style: { lineHeight: '1.5' } }, String(e.message || e))));

    return cerrar;
  }

  /**
   * El par de claves, para copiar y pegar donde va cada una.
   *
   * Se muestra entero y una sola vez: la privada no queda guardada en ningún
   * lado, ni acá ni en el servidor. Si se pierde, se generan otras.
   */
  function hojaClaves() {
    const caja = h('div.small.mut', { style: { lineHeight: '1.5' } }, 'Generando…');
    const cerrar = hoja('Claves para los avisos', h('div', caja));

    generarClavesAviso().then(d => {
      caja.replaceChildren(h('div.flow',
        h('div.small.mut', { style: { lineHeight: '1.55' } },
          'Son de esta app y se generan una sola vez. Si las cambiás más ',
          'adelante, los teléfonos que ya tenían avisos dejan de recibirlos.'),
        clave('VAPID_PUBLIC', d.VAPID_PUBLIC,
              'Va en DOS lados: Cloudflare Pages → Environment variables (y republicar), ' +
              'y también en Supabase → Edge Functions → Secrets. El servidor la manda en ' +
              'cada aviso para que el teléfono pueda verificar la firma.'),
        clave('VAPID_PRIVATE', d.VAPID_PRIVATE,
              'Solo en Supabase → Edge Functions → Secrets. No la compartas.'),
        clave('VAPID_SUBJECT', `mailto:${state.user?.email || 'vos@ejemplo.com'}`,
              'También en los secretos de Supabase.')));
    }).catch(e => caja.replaceChildren(String(e.message || e)));

    return cerrar;
  }

  function clave(nombre, valor, donde) {
    const txt = h('div', { style: { fontFamily: 'ui-monospace, monospace', fontSize: '12px',
                                    wordBreak: 'break-all', lineHeight: '1.5',
                                    background: 'var(--bg2)', padding: '10px 11px',
                                    borderRadius: '10px', userSelect: 'all',
                                    color: 'var(--tx)' } }, valor);
    const btn = h('button.btn.sec', { onclick: async () => {
      try { await navigator.clipboard.writeText(valor); aviso('Copiado'); }
      catch { aviso('Tocá el texto y copiá a mano'); }
    } }, 'Copiar');
    return h('div', { style: { marginTop: '4px' } },
      h('div', { style: { fontWeight: '600', fontSize: '13px', marginBottom: '6px' } }, nombre),
      txt,
      h('div.small.mut', { style: { margin: '7px 0 9px', lineHeight: '1.45' } }, donde),
      btn);
  }

  const explicacion = e => ({
    'listo':       'Te llegan aunque la app esté cerrada.',
    'apagado':     'Ahora los avisos aparecen solo dentro de la app.',
    'bloqueado':   'El teléfono los tiene bloqueados para esta app. Se prenden desde los ajustes del sistema, en notificaciones.',
    'sin-soporte': 'Este navegador no maneja avisos. En iPhone hay que agregar la app a la pantalla de inicio primero.',
    'sin-clave':   'Faltan las claves. Generalas acá y pegalas donde va cada una; hasta entonces los avisos aparecen solo dentro de la app.'
  })[e] || '';

  pintar();
  return sec;
}

function exportar() {
  const blob = new Blob([exportarJSON()], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob),
                     download: `bishusha-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  aviso('Exportado');
}

/** Los errores distintos que hay en el cajón, sin repetir. */
function motivos(rotas) {
  const vistos = new Map();
  for (const r of rotas) {
    const k = `${r.tabla}: ${r.error || 'sin detalle'}`;
    vistos.set(k, (vistos.get(k) || 0) + 1);
  }
  return [...vistos].map(([k, n]) => n > 1 ? `${k} (${n} veces)` : k);
}

// =====================================================================
// LECTURA AUTOMATICA
// =====================================================================
const PROVEEDORES = [
  { id: 'gmail', nombre: 'Gmail', icono: 'sobre',
    que: 'Lee los avisos de compra que te manda el banco y arma los movimientos.' },
  { id: 'mercadopago', nombre: 'Mercado Pago', icono: 'billete',
    que: 'Baja los movimientos directo de tu cuenta.' }
];

function seccionLectura() {
  // Sin funciones desplegadas no hay a donde ir: mejor decirlo que ofrecer un
  // boton que lleva a un error.
  if (!FUNCTIONS_URL) {
    return h('section',
      h('div.ghead', 'Lectura automática'),
      h('div.grp.pad', h('div.small.mut', { style: { lineHeight: '1.5' } },
        'Falta configurar la dirección de las funciones. Hasta entonces los ',
        'movimientos se cargan a mano o importando el resumen de la tarjeta.')));
  }

  return h('section',
    h('div.ghead', 'Lectura automática'),
    h('div.grp', PROVEEDORES.map(p => filaProveedor(p))),
    (state.integrations || []).some(x => x.proveedor === 'gmail' && x.activo !== false)
      ? h('button.btn.sec', { style: { marginTop: '12px' }, onclick: () => hojaBandeja() },
          icono('buscar', 16), '¿No entra nada? Ver qué mails encuentro')
      : null,
    h('div.small.mut', { style: { padding: '10px 4px 0', lineHeight: '1.5' } },
      'Solo de lectura: la app no manda correos ni toca tu casilla. Podés cortar ',
      'el permiso cuando quieras, acá o desde tu cuenta de Google.'));
}

function filaProveedor(p) {
  const it = (state.integrations || []).find(x => x.proveedor === p.id && x.activo !== false);

  if (!it) {
    return h('button.li', { onclick: async () => {
      try { await conectar(p.id); }
      catch (e) { aviso(String(e.message || e)); }
    } },
      h('div.av', icono(p.icono, 17)),
      h('div.m', h('div.t', `Conectar ${p.nombre}`), h('div.s', p.que)),
      h('span.chev', icono('chev', 15)));
  }

  const cuando = it.ultima_sync ? fechaRelativa(it.ultima_sync.slice(0, 10)) : 'todavía no leyó';
  return h('div.li', { class: `li ${it.ultimo_error ? 'sev sev-neg' : ''}` },
    h('div', { class: 'av' + (it.ultimo_error ? ' neg' : ' pos') },
      icono(it.ultimo_error ? 'rayo' : 'check', 17)),
    h('div.m',
      h('div.t', p.nombre),
      h('div.s', it.ultimo_error ? it.ultimo_error.slice(0, 90)
                                 : [it.cuenta, cuando].filter(Boolean).join(' · '))),
    h('div', { style: { display: 'flex', gap: '6px', flex: 'none' } },
      h('button.iconbtn', { 'aria-label': `Leer ${p.nombre} ahora`, onclick: async e => {
        const b = e.currentTarget; b.disabled = true;
        try { await leerAhora(p.id); aviso('Listo, fijate en Revisar'); }
        catch (err) { aviso(String(err.message || err).slice(0, 160), 5000); }
        finally { b.disabled = false; }
      } }, icono('sync', 17)),
      h('button.iconbtn', { 'aria-label': `Desconectar ${p.nombre}`, onclick: async () => {
        if (!await confirmar(`¿Cortar la conexión con ${p.nombre}? Lo que ya entró se queda.`,
                             'Desconectar')) return;
        await desconectar(p.id); aviso('Desconectado');
      } }, icono('cerrar', 17))));
}

/** El motivo por el que fallo el ultimo permiso, hasta que se resuelva. */
function avisoOAuth() {
  let crudo = null, guardado = null;
  try { crudo = localStorage.getItem('bishusha.oauth.error'); } catch { /* modo privado */ }
  // Antes se guardaba el texto pelado: si no es JSON, es uno de esos.
  try { guardado = crudo ? JSON.parse(crudo) : null; } catch { guardado = crudo; }
  if (!guardado) return null;
  const msg = typeof guardado === 'string' ? guardado : guardado.msg;
  const cuando = typeof guardado === 'string' ? null : guardado.cuando;
  if (!msg) return null;

  return h('div.aviso.amb',
    h('div.av.amb', icono('rayo', 17)),
    h('div.txt',
      // La hora importa: sin ella no se distingue un error de recién de uno
      // que quedo de un intento anterior.
      h('div.tt', 'No se pudo conectar', cuando ? ` · ${hora(cuando)}` : ''),
      h('div.ds', String(msg).slice(0, 300)),
      h('button.btn.sec', { style: { marginTop: '12px' }, onclick: () => {
        try { localStorage.removeItem('bishusha.oauth.error'); } catch { /* nada */ }
        irA('/ajustes'); location.reload();
      } }, 'Entendido')));
}

const hora = ms => new Date(ms).toLocaleTimeString('es-AR',
  { hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * Que hay en la bandeja y que haria la app con cada mail.
 *
 * "No entra nada" tiene dos causas opuestas —el banco no manda avisos, o los
 * manda y la app no los reconoce— y desde afuera se ven igual. Esto las
 * separa sin tener que adivinar.
 */
function hojaBandeja() {
  const cuerpo = h('div', h('div.small.mut', 'Buscando…'));
  hoja('Qué encuentro en tu correo', h('div',
    h('div.small.mut', { style: { lineHeight: '1.5', marginBottom: '14px' } },
      'Los últimos 30 días de bancos y billeteras, y qué haría con cada uno. ',
      'Esto no carga nada.'),
    cuerpo));

  mirarBandeja().then(d => {
    if (!d.vistos?.length) {
      cuerpo.replaceChildren(h('div.small.mut', { style: { lineHeight: '1.5' } },
        'No encontré ningún correo de bancos ni billeteras en los últimos 30 días. ',
        'Eso quiere decir que los avisos no te están llegando por mail: fijate en ',
        'el home banking que estén activados los avisos por correo, no solo los ',
        'push o los SMS.'));
      return;
    }
    cuerpo.replaceChildren(
      h('div.small.mut', { style: { marginBottom: '10px' } },
        `${d.encontrados} correos encontrados`),
      h('div.grp', d.vistos.map(v => h('div.li',
        h('div.m',
          h('div.t', { style: { fontSize: '14px' } }, v.asunto || '(sin asunto)'),
          h('div.s', v.fecha, ' · ', v.de.replace(/.*</, '').replace('>', '')),
          h('div.s', { style: { marginTop: '3px',
            color: v.veredicto.startsWith('SE CARGA') ? 'var(--pos)' : 'var(--tx3)' } },
            v.veredicto))))));
  }).catch(e => {
    cuerpo.replaceChildren(h('div.small.mut', String(e.message || e)));
  });
}
