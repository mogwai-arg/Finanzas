// =====================================================================
// vistas/ajustes.js
// =====================================================================
import { h, icono, aviso, confirmar, hoja, campo } from '../ui.js';
import { state, salir, sincronizar, exportarJSON, pendientes, fallidas, DEMO } from '../db.js';
import { plata } from '../formato.js';
import { irA } from '../ruteo.js';
import { formCategorias, formCuenta } from './formularios.js';

export function vistaAjustes(root) {
  const tema = document.documentElement.getAttribute('data-tema') || 'auto';
  const cola = pendientes(), rotas = fallidas();

  root.append(h('div.flow',
    rotas.length ? h('div.aviso.amb',
      h('div.av.amb', icono('rayo', 17)),
      h('div.txt',
        h('div.tt', `${rotas.length} cambios no se pudieron subir`),
        h('div.ds', 'Están guardados acá. Podés reintentarlos sin perder nada.'),
        h('button.btn', { onclick: async () => { await sincronizar({ reintentarFallidas: true });
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
        h('button.li', { onclick: () => formCuenta() },
          h('div.av', icono('tarjeta', 17)),
          h('div.m', h('div.t', 'Cuentas y tarjetas'),
            h('div.s', `${(state.accounts || []).length} cargadas`)),
          h('span.chev', icono('chev', 15))),
        h('button.li', { onclick: () => formCategorias() },
          h('div.av', icono('lista', 17)),
          h('div.m', h('div.t', 'Categorías'),
            h('div.s', `${(state.categories || []).length} cargadas`)),
          h('span.chev', icono('chev', 15))))),

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
