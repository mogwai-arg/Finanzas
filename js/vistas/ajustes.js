// =====================================================================
// vistas/ajustes.js
// =====================================================================
import { h, icono, aviso, confirmar, hoja, campo } from '../ui.js';
import { state, salir, sincronizar, exportarJSON, pendientes, fallidas, DEMO,
         FUNCTIONS_URL, conectar, desconectar, leerAhora, mirarBandeja,
         guardar, probarAviso } from '../db.js';
import { plata, fechaRelativa, aNumero } from '../formato.js';
import { bishu } from '../bishu.js';
import { estadoPush, prenderPush, apagarPush } from '../push.js';
import { irA } from '../ruteo.js';
import { formCategorias } from './formularios.js';
import { formImportarResumen } from './importar.js';

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
          h('div.m', h('div.t', { style: { color: 'var(--neg)' } }, 'Cerrar sesión')))))
  ));
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
  ['aumentos', 'Aumentos',           'Cuando un correo dice que subió un gasto fijo'],
  ['bishu',    'Cómo venís',         'Bishu compara con el mes pasado, una vez por semana']
];

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
        h('button.btn.sec', { onclick: async () => {
          try { const r = await probarAviso();
                aviso(r.enviados ? 'Te lo mandé, mirá el teléfono' : 'No salió: ' + (r.motivo || 'revisá las claves')); }
          catch (e) { aviso(e.message); }
        } }, 'Mandarme uno de prueba')) : null,
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

  const explicacion = e => ({
    'listo':       'Te llegan aunque la app esté cerrada.',
    'apagado':     'Ahora los avisos aparecen solo dentro de la app.',
    'bloqueado':   'El teléfono los tiene bloqueados para esta app. Se prenden desde los ajustes del sistema, en notificaciones.',
    'sin-soporte': 'Este navegador no maneja avisos. En iPhone hay que agregar la app a la pantalla de inicio primero.',
    'sin-clave':   'Faltan las claves de aviso en la configuración. Mientras tanto, los avisos aparecen dentro de la app.'
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
