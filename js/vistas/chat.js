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
import { h, frag, icono, iconoDe, aviso } from '../ui.js';
import { state, guardar, borrar } from '../db.js';
import { leerFrase } from '../frase.js';
import { categoriaPara, comoRegla, reglaQueChoca } from '../reglas.js';
import { leerCorreccion, categoriaNueva, aCualSeRefiere,
         MARCA_CORRECCION } from '../correccion.js';
import { quePregunta, contestar } from '../preguntas.js';
import { bishu } from '../bishu.js';
import { plata, nombreDe, hoyISO } from '../formato.js';
import { dictado } from '../voz.js';
import { irA } from '../ruteo.js';

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

/**
 * Lo dicho, guardado en el teléfono.
 *
 * Vivía solo en memoria: cerrabas la app y la charla arrancaba de cero. En un
 * chat eso se siente como que el otro te olvidó, y encima se pierde el "el
 * café iba en efectivo" de la mañana.
 *
 * Se guarda el TEXTO, no los botones. Un "Deshacer" de anteayer que ya no
 * puede deshacer nada es peor que no tenerlo: se ve igual de vivo y no hace
 * nada. Al volver, la charla se relee; para actuar hay que decir algo nuevo.
 */
const CHARLA_KEY = 'bishusha.charla';
const MAX_GUARDADAS = 30;

const leerCharla = () => {
  try { return JSON.parse(localStorage.getItem(CHARLA_KEY) || '[]'); }
  catch { return []; }
};
/**
 * El texto de una burbuja, legible.
 *
 * textContent pega todo sin separar: "coto 4731045 lucas de naftacafé 800".
 * Los bloques son renglones distintos y tienen que quedar como renglones.
 */
function textoPlano(nodo) {
  if (typeof nodo === 'string') return nodo;
  const partes = [];
  for (const hijo of nodo.childNodes) {
    if (hijo.nodeType === 3) { partes.push(hijo.textContent); continue; }
    const bloque = ['DIV', 'P', 'LI'].includes(hijo.tagName);
    partes.push(bloque ? '\n' + textoPlano(hijo) : textoPlano(hijo));
  }
  return partes.join('').replace(/\n{2,}/g, '\n').trim();
}

const anotarCharla = (quien, texto) => {
  if (!texto) return;
  try {
    const d = [...leerCharla(), { quien, texto, cuando: Date.now() }].slice(-MAX_GUARDADAS);
    localStorage.setItem(CHARLA_KEY, JSON.stringify(d));
  } catch { /* modo privado: la charla vive solo en memoria */ }
};
// El último movimiento anotado, para que "ay, la pagué con efectivo" tenga a
// qué referirse. Es lo que hace que esto sea una conversación y no una
// ventanita de comandos: sin memoria, corregir obliga a deshacer y escribir
// todo de nuevo, y ahí conviene el formulario.
let ultimo = null;
// Los últimos que se cargaron en esta charla, del más nuevo al más viejo.
// "El café iba en efectivo" cuando el café no es lo último obligaba a ir a
// Gastos a buscarlo, que es el viaje que el chat viene a evitar.
const ultimos = [];

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
        // Lo guardado viene con saltos de línea adentro de un texto suelto.
        whiteSpace: extra.viejo ? 'pre-line' : 'normal',
        // Lo de la vez pasada, apagado: se lee pero no compite con lo de hoy.
        opacity: extra.viejo ? '.62' : '1',
        ...(extra.style || {})
      }
    }, contenido);
    const fila = h('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-end' } },
      mio ? null : h('div', { style: { flex: 'none', marginBottom: '2px' } }, bishu(extra.animo || 'contento', 26)),
      burbuja);
    hilo.append(fila);
    if (extra.guardar !== false) anotarCharla(quien, textoPlano(contenido));
    // Al fondo, que es donde está lo último. Sin esto la respuesta queda
    // abajo del teclado y parece que no pasó nada.
    requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
    return burbuja;
  }

  /** Guarda, y deja el renglón con lo que entendió y cómo deshacerlo. */
  async function anotar(m) {
    const cat = categoriaPara(m.comercio, { ...state, descripcion: m.descripcion });
    const cuenta = m.account_id || porDefecto(m.moneda);
    const tx = await guardar('transactions', {
      fecha: m.fecha, descripcion: m.descripcion, comercio: m.comercio,
      monto: m.monto, moneda: m.moneda, tipo: m.tipo,
      account_id: cuenta || null, category_id: cat.category_id || null,
      cuotas: m.cuotas || 1, fuente: 'manual', origen: 'manual',
      // Lo cargó una persona a propósito: no hay nada que revisar después.
      revisado: true
    });

    ultimo = { tx, burbuja: null, comercio: m.comercio };
    ultimos.unshift(tx);
    ultimos.length = Math.min(ultimos.length, 8);

    const partes = [
      h('b', plata(m.monto, m.moneda)),
      m.descripcion && m.descripcion !== m.comercio ? ` · ${m.descripcion}` : '',
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

  /**
   * Crear la categoría que nombró y poner el gasto ahí.
   *
   * Se hace y después se cuenta, con cómo deshacerlo en el mismo renglón. La
   * lista de categorías es la que arma el gráfico de en qué se fue, así que
   * una de más ensucia algo que importa: por eso deshacer borra la categoría
   * y no solo la saca del movimiento.
   */
  async function crearCategoria(nombre) {
    const cat = await guardar('categories', {
      nombre, tipo: 'gasto', icono: iconoDe(nombre),
      orden: (state.categories || []).length + 1
    });
    const tx = { ...ultimo.tx, category_id: cat.id };
    await guardar('transactions', tx);
    ultimo.tx = tx;
    const aprendio = await aprender(ultimo.comercio, cat.id);

    const burbuja = decir('bishu', h('div',
      h('div', 'No tenía ', h('b', nombre), '. La creé y puse ahí ',
        plata(tx.monto, tx.moneda),
        tx.comercio ? ` de ${tx.comercio}` : '', '.'),
      aprendio ? aprendio.nota : null,
      h('div', { style: { marginTop: '8px' } },
        enlace('No era eso', async () => {
          await guardar('transactions', { ...tx, category_id: ultimo.tx?.category_id === cat.id
            ? null : ultimo.tx.category_id });
          await borrar('categories', cat.id);
          ultimo.tx = { ...tx, category_id: null };
          burbuja.replaceChildren(h('span.mut', `Listo, borré ${nombre}.`));
        }))));
  }

  /**
   * Que la próxima vez ya lo sepa —salvo que eso rompa algo.
   *
   * Corregir UN movimiento no quiere decir "siempre". Si ya había una regla
   * para ese comercio y decía otra cosa, cambiar la regla en silencio manda
   * toda la nafta de YPF a Gastronomía por haber comido unas empanadas ahí.
   * Así que en ese caso se cambia solo este movimiento, y "siempre" se ofrece
   * como un botón aparte: es una afirmación distinta y la tiene que hacer una
   * persona.
   */
  async function aprender(comercio, category_id) {
    if (!comercio || !category_id) return null;
    const choca = reglaQueChoca(comercio, category_id, state.reglas);
    const nombre = nombreDe('categories', category_id);

    if (!choca) {
      const r = comoRegla(comercio, category_id, state.reglas);
      if (r) await guardar('reglas', r);
      return { nota: h('div.small.mut', { style: { marginTop: '4px' } },
        `${comercio} va a ${nombre}. La próxima ya lo sé.`) };
    }

    const caja = h('div.small.mut', { style: { marginTop: '6px' } },
      `Solo este. ${comercio} sigue yendo a ${nombreDe('categories', choca.category_id)}.`,
      ' ',
      enlace(`Siempre que sea ${comercio}`, async () => {
        const r = comoRegla(comercio, category_id, state.reglas);
        if (r) await guardar('reglas', r);
        caja.replaceChildren(`Listo: ${comercio} ahora va a ${nombre}.`);
      }));
    return { nota: caja };
  }

  /** Los botones de categoría, que además dejan la regla aprendida. */
  function botonesCategoria(tx, comercio) {
    const cats = (state.categories || []).filter(c => c.tipo !== 'ingreso').slice(0, 8);
    const caja = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } });
    caja.append(...cats.map(c => h('button.chip', {
      onclick: async () => {
        await guardar('transactions', { ...tx, category_id: c.id });
        if (ultimo?.tx?.id === tx.id) ultimo.tx = { ...tx, category_id: c.id };
        // Y que no vuelva a preguntar: la próxima vez que aparezca este
        // comercio ya sabe. Es lo que hace que la app mejore con el uso en vez
        // de preguntar lo mismo para siempre.
        const ap = await aprender(comercio, c.id);
        caja.replaceChildren(h('span.small.mut', `${c.nombre}. `), ap?.nota || null);
      }
    }, c.nombre)));
    return caja;
  }

  function elegirCategoria(tx, burbuja) {
    burbuja.append(h('div', { style: { marginTop: '9px' } },
      botonesCategoria(tx, tx.comercio)));
  }

  /**
   * Cambiar lo último que se anotó.
   *
   * No pisa la categoría con una adivinanza nueva: si decís "con efectivo",
   * lo único que cambia es la cuenta. Y si nombrás una categoría, además
   * queda aprendida para ese comercio, igual que tocando el botón.
   */
  async function corregir(c, otro = null) {
    const tx = otro || ultimo.tx;
    const suyo = !otro || otro.id === ultimo.tx.id;
    if (c.borrar) {
      await borrar('transactions', tx.id);
      const i = ultimos.findIndex(x => x.id === tx.id);
      if (i >= 0) ultimos.splice(i, 1);
      if (suyo) ultimo = null;
      decir('bishu', `Listo, borré ${tx.comercio || 'el movimiento'}.`);
      return;
    }
    const nueva = { ...tx, ...c.campos };
    await guardar('transactions', nueva);
    if (suyo) ultimo.tx = nueva;
    const j = ultimos.findIndex(x => x.id === tx.id);
    if (j >= 0) ultimos[j] = nueva;

    const aprendio = c.campos.category_id
      ? await aprender(nueva.comercio || nueva.descripcion, c.campos.category_id) : null;

    // Se repite el movimiento entero, no solo lo que cambió: después de dos o
    // tres correcciones, "listo" no alcanza para saber cómo quedó.
    decir('bishu', h('div',
      h('div', 'Corregido: ', h('b', plata(nueva.monto, nueva.moneda)),
        nueva.comercio ? ` en ${nueva.comercio}` : '',
        nueva.category_id ? ` · ${nombreDe('categories', nueva.category_id)}` : '',
        nueva.account_id ? ` · ${nombreDe('accounts', nueva.account_id)}` : '',
        String(nueva.fecha).slice(0, 10) !== hoyISO() ? ` · ${dia(String(nueva.fecha).slice(0, 10))}` : '',
        nueva.cuotas > 1 ? ` · ${nueva.cuotas} cuotas` : ''),
      aprendio ? aprendio.nota : null));
  }

  /**
   * Contestar una pregunta, con el número y con dónde se ve entero.
   *
   * Una cifra sola invita a preguntar "¿de qué?", y la respuesta a eso ya
   * existe y es una pantalla, no otro renglón de chat.
   */
  function responder(id) {
    const r = contestar(id, state);
    if (!r) {
      decir('bishu', 'Eso todavía no lo sé calcular.', { animo: 'pensando' });
      return;
    }
    decir('bishu', h('div',
      h('div', { style: { fontSize: '15.5px' } }, r.titulo),
      r.detalle ? h('div.small.mut', { style: { marginTop: '5px', lineHeight: '1.5' } },
        r.detalle) : null,
      r.ir ? h('div', { style: { marginTop: '8px' } },
        enlace('Verlo entero', () => irA(r.ir))) : null));
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

    // Preguntar va antes que cargar: "cuánto me queda de los 50000" tiene un
    // número, y sin esto se anotaba un gasto de cincuenta mil que nadie hizo.
    const preg = quePregunta(dicho);
    if (preg) { responder(preg); return; }

    const m = leerFrase(dicho, { cuentas: state.accounts });

    // Con monto es un movimiento nuevo, salvo que arranque avisando que es una
    // corrección ("no, eran 8000"). Sin monto solo puede ser una corrección,
    // porque un movimiento sin monto no existe.
    const corrige = ultimo && (!m || MARCA_CORRECCION.test(dicho));
    if (corrige) {
      const gastos = (state.categories || []).filter(x => x.tipo !== 'ingreso');
      const c = leerCorreccion(dicho, { cuentas: state.accounts, categorias: gastos });
      if (c) {
        // Si nombra uno de los últimos, se corrige ESE. Si no nombra ninguno,
        // el último, que es el caso de siempre.
        const otro = aCualSeRefiere(dicho, ultimos.map(t => state.transactions
          .find(x => x.id === t.id)).filter(Boolean));
        await corregir(c, otro);
        return;
      }

      // Nombró una categoría que no existe. Mandarlo a Ajustes a crearla y
      // volver es justo la fricción que este chat viene a sacar.
      const nueva = categoriaNueva(dicho, state.categories || []);
      if (nueva) { await crearCategoria(nueva); return; }
    }

    if (!m) {
      decir('bishu', h('div',
        ultimo
          ? frag('Eso no lo entendí. Podés decirme ', h('b', 'con efectivo'), ', ',
                 h('b', 'fue ayer'), ' o ', h('b', 'borralo'), ' para cambiar lo último, ',
                 'nombrar una categoría —si no existe la creo— o contarme otro gasto.')
          : frag('No encontré el monto. Escribime algo como ',
                 h('b', 'coto 47310'), ' o ', h('b', '45 lucas de nafta'), '.')),
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

  // Lo de la última vez, si hubo. Va sin botones y en gris: es historia, no
  // algo sobre lo que se pueda actuar.
  const antes = leerCharla();
  if (antes.length) {
    for (const b of antes) decir(b.quien, b.texto, { guardar: false, viejo: true });
    hilo.append(h('div.small.mut', { style: { textAlign: 'center', padding: '10px 0 2px' } },
      '— hasta acá, la vez pasada —'));
    return;
  }

  decir('bishu', h('div',
    'Contame el gasto como se te ocurra y yo lo anoto.',
    h('div.small.mut', { style: { marginTop: '7px', lineHeight: '1.6' } },
      h('div', h('b', 'coto 47310')),
      h('div', h('b', '45 lucas de nafta')),
      h('div', h('b', 'café 800 ayer')),
      h('div', h('b', 'zapatillas 120000 en 6 cuotas con la visa'))),
    h('div', { style: { marginTop: '9px' } }, 'O preguntame:'),
    h('div.small.mut', { style: { marginTop: '5px', lineHeight: '1.6' } },
      h('div', h('b', '¿cuánto me queda?')),
      h('div', h('b', '¿en qué se me fue?')),
      h('div', h('b', '¿qué se viene?')))),
    // El saludo no se guarda: se vuelve a armar solo cada vez, y guardado
    // ocuparía media pantalla de historia que nadie quiere releer.
    { guardar: false });
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
