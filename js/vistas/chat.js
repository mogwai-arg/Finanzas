// =====================================================================
// vistas/chat.js — cargar hablándole a Bishu.
//
// Es la idea de las apps que cargan gastos por WhatsApp, sin WhatsApp: el
// canal nunca fue lo importante. Lo importante es escribir un renglón en vez
// de llenar siete campos, y eso se puede hacer acá adentro, gratis, sin
// conexión y sin una cuenta de empresa en Meta.
//
// Tres cosas lo hacen usable y no un truco:
//
//   Muestra qué entendió. "$ 47.310 en Coto, Supermercado, hoy, con Galicia"
//   antes de que quede guardado. Un gasto anotado mal es peor que uno no
//   anotado, y esta es la única defensa.
//
//   Se puede deshacer. En el mismo renglón, sin ir a buscarlo.
//
//   Pregunta lo que le falta, una cosa por vez. Si no sabe de qué fue, dice
//   "¿de qué fue?" y con la respuesta completa el mismo movimiento, en vez de
//   abrir un formulario y hacerte empezar de nuevo.
// =====================================================================
import { h, icono, aviso } from '../ui.js';
import { state, guardar, borrar } from '../db.js';
import { leerFrase } from '../frase.js';
import { categoriaPara, comoRegla } from '../reglas.js';
import { bishu } from '../bishu.js';
import { plata, nombreDe, hoyISO } from '../formato.js';
import { dictado } from '../voz.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
               'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * El hilo vive afuera de la vista, a propósito.
 *
 * Guardar un movimiento avisa que el estado cambió, y eso vuelve a dibujar la
 * pantalla entera: con el hilo adentro, cada gasto anotado borraba la
 * conversación que lo acababa de anotar. Además así la charla sigue donde
 * estaba si te vas a mirar otra cosa y volvés, que es lo que hace cualquier
 * chat.
 */
const hilo = h('div.flow', { style: { paddingBottom: '8px' } });
let pendiente = null;

export function vistaChat(root) {
  const entrada = h('input', {
    type: 'text', placeholder: 'coto 47310',
    autocomplete: 'off', autocapitalize: 'sentences',
    'aria-label': 'Contale a Bishu',
    style: { flex: '1', minWidth: '0', fontSize: '16px', border: '0',
             background: 'transparent', padding: '12px 4px' }
  });

  function decir(quien, contenido, extra = {}) {
    const mio = quien === 'yo';
    const burbuja = h('div', {
      style: {
        maxWidth: '85%', alignSelf: mio ? 'flex-end' : 'flex-start',
        background: mio ? 'var(--brand)' : 'var(--card)',
        color: mio ? '#fff' : 'var(--tx)',
        borderRadius: mio ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        padding: '10px 13px', fontSize: '15px', lineHeight: '1.45',
        ...(extra.style || {})
      }
    }, contenido);
    const fila = h('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-end' } },
      mio ? null : h('div', { style: { flex: 'none', marginBottom: '2px' } }, bishu(extra.animo || 'contento', 26)),
      burbuja);
    hilo.append(fila);
    // Al fondo, que es donde está lo último. Sin esto la respuesta queda
    // abajo del teclado y parece que no pasó nada.
    requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
    return burbuja;
  }

  /** Guarda, y deja el renglón con lo que entendió y cómo deshacerlo. */
  async function anotar(m) {
    const cat = categoriaPara(m.comercio, state);
    const cuenta = m.account_id || porDefecto(m.moneda);
    const tx = await guardar('transactions', {
      fecha: m.fecha, descripcion: m.descripcion, comercio: m.comercio,
      monto: m.monto, moneda: m.moneda, tipo: m.tipo,
      account_id: cuenta || null, category_id: cat.category_id || null,
      cuotas: m.cuotas || 1, fuente: 'manual', origen: 'manual',
      // Lo cargó una persona a propósito: no hay nada que revisar después.
      revisado: true
    });

    const partes = [
      h('b', plata(m.monto, m.moneda)),
      m.comercio ? ` en ${m.comercio}` : '',
      cat.category_id ? ` · ${nombreDe('categories', cat.category_id)}` : '',
      cuenta ? ` · ${nombreDe('accounts', cuenta)}` : '',
      m.fecha !== hoyISO() ? ` · ${dia(m.fecha)}` : '',
      m.cuotas > 1 ? ` · ${m.cuotas} cuotas` : ''
    ];

    const burbuja = decir('bishu', h('div',
      h('div', ...partes),
      // De dónde salió la categoría. Sin esto, una categoría adivinada por el
      // nombre se lee igual que una que pediste vos, y cuando se equivoca no
      // se sabe dónde ir a arreglarla.
      cat.porQue ? h('div.small.mut', { style: { marginTop: '4px' } },
        `${nombreDe('categories', cat.category_id)}, ${cat.porQue}`) : null,
      h('div', { style: { display: 'flex', gap: '14px', marginTop: '8px' } },
        !cat.seguro ? enlace('Cambiar categoría', () => elegirCategoria(tx, burbuja)) : null,
        enlace('Deshacer', async () => {
          await borrar('transactions', tx.id);
          burbuja.replaceChildren(h('span.mut', 'Listo, lo borré.'));
        }))));

    if (!cat.category_id && m.tipo === 'gasto' && m.comercio) {
      decir('bishu', h('div', '¿De qué categoría es ', h('b', m.comercio), '? ',
        h('div', { style: { marginTop: '8px' } }, botonesCategoria(tx, m.comercio))), { animo: 'pensando' });
    }
    return tx;
  }

  /** Los botones de categoría, que además dejan la regla aprendida. */
  function botonesCategoria(tx, comercio) {
    const cats = (state.categories || []).filter(c => c.tipo !== 'ingreso').slice(0, 8);
    const caja = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } });
    caja.append(...cats.map(c => h('button.chip', {
      onclick: async () => {
        await guardar('transactions', { ...tx, category_id: c.id });
        // Y que no vuelva a preguntar: la próxima vez que aparezca este
        // comercio ya sabe. Es lo que hace que la app mejore con el uso en vez
        // de preguntar lo mismo para siempre.
        const r = comoRegla(comercio, c.id, state.reglas);
        if (r) await guardar('reglas', r);
        caja.replaceChildren(h('span.small.mut',
          `${c.nombre}. La próxima ya lo sé.`));
      }
    }, c.nombre)));
    return caja;
  }

  function elegirCategoria(tx, burbuja) {
    burbuja.append(h('div', { style: { marginTop: '9px' } },
      botonesCategoria(tx, tx.comercio)));
  }

  async function mandar() {
    const dicho = entrada.value.trim();
    if (!dicho) return;
    entrada.value = '';
    decir('yo', dicho);

    // Si había algo a medias, esto lo completa.
    if (pendiente) {
      const m = { ...pendiente, comercio: dicho, descripcion: dicho };
      pendiente = null;
      await anotar(m);
      return;
    }

    const m = leerFrase(dicho, { cuentas: state.accounts });
    if (!m) {
      decir('bishu', h('div',
        'No encontré el monto. Escribime algo como ',
        h('b', 'coto 47310'), ' o ', h('b', '45 lucas de nafta'), '.'),
        { animo: 'pensando' });
      return;
    }
    if (!m.completo) {
      pendiente = m;
      decir('bishu', h('div', h('b', plata(m.monto, m.moneda)), '. ¿De qué fue?'),
            { animo: 'pensando' });
      return;
    }
    await anotar(m);
  }

  entrada.addEventListener('keydown', e => { if (e.key === 'Enter') mandar(); });

  // ------------------------------------------------------------- la voz
  const micro = h('button', {
    'aria-label': 'Dictar', title: 'Dictar',
    style: { flex: 'none', border: '0', background: 'transparent',
             color: 'var(--tx2)', padding: '10px', cursor: 'pointer',
             display: 'flex', alignItems: 'center' }
  }, icono('micro', 19));

  const voz = dictado({
    alOir: (texto, final) => {
      entrada.value = texto;
      if (final) mandar();
    },
    alCambiar: escuchando => {
      micro.style.color = escuchando ? 'var(--neg)' : 'var(--tx2)';
      entrada.placeholder = escuchando ? 'Te escucho…' : 'coto 47310';
    },
    alFallar: msg => aviso(msg)
  });
  micro.onclick = () => voz.alternar();
  if (!voz.hay) {
    // Sin dictado del navegador queda el del teclado, que en el teléfono es
    // el mismo micrófono y anda igual de bien. Decirlo vale más que esconder
    // el botón y dejar a alguien buscándolo.
    micro.onclick = () => aviso('Usá el micrófono del teclado y dictá acá');
  }

  const barra = h('div', {
    style: { position: 'sticky', bottom: '0', background: 'var(--bg)',
             paddingTop: '8px', paddingBottom: '4px' } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px',
                        background: 'var(--card)', borderRadius: '22px',
                        padding: '0 6px 0 12px' } },
      entrada, micro,
      h('button', {
        'aria-label': 'Anotar',
        onclick: () => mandar(),
        style: { flex: 'none', border: '0', borderRadius: '50%',
                 width: '36px', height: '36px', margin: '4px 0',
                 background: 'var(--brand)', color: '#fff', cursor: 'pointer',
                 display: 'flex', alignItems: 'center', justifyContent: 'center' }
      }, icono('enviar', 17))));

  root.replaceChildren(h('div.flow', hilo, barra));
  requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));

  // El saludo, una sola vez: al volver, la charla sigue donde estaba.
  if (hilo.childElementCount) return;

  decir('bishu', h('div',
    'Contame el gasto como se te ocurra y yo lo anoto.',
    h('div.small.mut', { style: { marginTop: '7px', lineHeight: '1.6' } },
      h('div', h('b', 'coto 47310')),
      h('div', h('b', '45 lucas de nafta')),
      h('div', h('b', 'café 800 ayer')),
      h('div', h('b', 'zapatillas 120000 en 6 cuotas con la visa')))));
}

const enlace = (txt, fn) => h('button', {
  onclick: fn,
  style: { border: '0', background: 'transparent', color: 'var(--brand)',
           fontSize: '13.5px', fontWeight: '600', padding: '0', cursor: 'pointer' }
}, txt);

const dia = iso => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;

/** La primera cuenta que no sea tarjeta, en esa moneda. */
function porDefecto(moneda = 'ARS') {
  const c = (state.accounts || []).find(a =>
    a.activo !== false && a.tipo !== 'credito' && (a.moneda || 'ARS') === moneda);
  return c?.id || null;
}
