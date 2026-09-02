// =====================================================================
// vistas/ajustes.js
// =====================================================================
import { h, icono, aviso, confirmar, hoja, campo } from '../ui.js';
import { state, salir, sincronizar, exportarJSON, pendientes, fallidas, DEMO,
         FUNCTIONS_URL, conectar, desconectar, leerAhora } from '../db.js';
import { plata, fechaRelativa } from '../formato.js';
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
        catch (err) { aviso(String(err.message || err).slice(0, 120)); }
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
