// =====================================================================
// vistas/importar.js — traer un resumen de tarjeta entero de una vez.
//
// El parser (resumen.js) ya existia y estaba probado, pero no habia forma de
// usarlo desde la app: habia que cargar cada consumo a mano. Aca se pega el
// texto del PDF y sale todo junto: las seis fechas del ciclo, los consumos,
// las cuotas y los impuestos.
// =====================================================================
import { h, icono, hoja, aviso, campo, select } from '../ui.js';
import { state, guardar, guardarVarios } from '../db.js';
import * as F from '../finance.js';
import { parseResumen, aMovimientos } from '../resumen.js';
import { plata, aFecha } from '../formato.js';

const MARCAS = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex' };

/**
 * `archivo` opcional: cuando el resumen ya vino del correo, se abre con el
 * PDF adentro y no hay nada que elegir.
 */
export function formImportarResumen(yaBajado = null) {
  const texto = h('textarea', {
    rows: '7', placeholder: 'Pegá acá el texto del resumen…',
    // 16px o mas: por debajo de eso iOS hace zoom al tocar el campo y hay que
    // volver a achicar con los dedos.
    style: { width: '100%', fontSize: '16px', lineHeight: '1.45',
             fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
             padding: '11px 12px', resize: 'vertical' }
  });
  const salida = h('div');
  const pie = h('div.fila', { style: { marginTop: '4px' } });

  // Elegir el PDF y listo: abrirlo, seleccionar todo y pegar era el paso más
  // molesto de los que quedaban, y encima en el teléfono es incómodo.
  const archivo = h('input', { type: 'file', accept: 'application/pdf,.pdf,.txt',
                               style: { display: 'none' },
                               onchange: e => leerArchivo(e.target.files[0]) });
  const estado = h('div.small.mut', { style: { marginTop: '10px', lineHeight: '1.45' } });

  // La clave del PDF vive en ESTE teléfono y no en la base: es un dato
  // personal —casi siempre el DNI— y no hace falta que viaje a ningún lado
  // para abrir un archivo que ya está acá.
  const CLAVE_KEY = 'bishusha.clavePdf';
  const claveGuardada = () => { try { return localStorage.getItem(CLAVE_KEY) || ''; }
                                catch { return ''; } };

  async function leerArchivo(f, { clave } = {}) {
    if (!f) return;
    salida.replaceChildren(); pie.replaceChildren();
    if (f.name && /\.txt$/i.test(f.name)) {
      texto.value = await f.text();
      estado.textContent = `${f.name} · listo`;
      leer(); return;
    }
    estado.textContent = 'Abriendo el PDF…';
    try {
      const { textoDePDF } = await import('../pdf.js');
      texto.value = await textoDePDF(f, {
        clave: clave ?? claveGuardada(),
        alAvanzar: (n, total) => { estado.textContent = `Leyendo página ${n} de ${total}…`; }
      });
      if (clave) { try { localStorage.setItem(CLAVE_KEY, clave); } catch { /* modo privado */ } }
      if (texto.value.replace(/\s/g, '').length < 40) {
        estado.textContent = 'Ese PDF no tiene texto adentro: es una imagen. ' +
          'Probá bajarlo desde la web del banco, que suele darlo con texto.';
        return;
      }
      estado.textContent = `${f.name || 'El resumen'} · ${texto.value.split('\n').length} líneas leídas`;
      leer();
    } catch (e) {
      if (e?.name === 'PideClave') { pedirClave(f); return; }
      // El error de verdad, no "no pude": puede ser el archivo, puede ser el
      // navegador, y desde afuera se ven igual. Sin decirlo no hay forma de
      // arreglarlo, ni de que me lo cuenten.
      estado.replaceChildren(
        h('div', 'No pude abrir el PDF. Podés abrirlo vos, copiar el texto y pegarlo acá.'),
        h('div', { style: { marginTop: '7px', fontFamily: 'ui-monospace, monospace',
                            fontSize: '11px', color: 'var(--tx3)', lineHeight: '1.5',
                            wordBreak: 'break-word' } },
          `${e?.name || 'Error'}: ${String(e?.message || e).slice(0, 180)}`));
      console.warn('pdf', e);
    }
  }

  /** El resumen viene con clave: se pide una vez y queda en este teléfono. */
  function pedirClave(f) {
    const inp = h('input', { type: 'password', inputmode: 'numeric',
                             placeholder: 'Suele ser tu DNI, sin puntos',
                             value: claveGuardada() });
    const btn = h('button.btn', { style: { marginTop: '14px' } }, 'Abrir el resumen');
    btn.onclick = () => { cerrarClave(); leerArchivo(f, { clave: inp.value.trim() }); };
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') btn.click(); });

    const cerrarClave = hoja('El resumen tiene clave', h('div',
      h('div.small.mut', { style: { lineHeight: '1.55', marginBottom: '14px' } },
        'Los bancos protegen el PDF, casi siempre con el DNI sin puntos. ',
        'Queda guardada en este teléfono nada más: no viaja a ningún lado.'),
      campo('Contraseña del PDF', inp), btn));
    estado.textContent = 'El PDF tiene contraseña.';
  }

  const cerrar = hoja('Importar un resumen', h('div',
    h('div.small.mut', { style: { lineHeight: '1.5', marginBottom: '12px' } },
      'Elegí el PDF que te manda el banco y la app lo lee sola: los consumos, ',
      'las cuotas, los impuestos y las seis fechas del ciclo. Lo que ya esté ',
      'cargado no se duplica ni se pisa.'),
    h('button.btn', { onclick: () => archivo.click() },
      icono('recibo', 17), 'Elegir el PDF del resumen'),
    archivo, estado,
    h('div.small.mut', { style: { margin: '18px 0 8px', textAlign: 'center' } }, 'o pegalo a mano'),
    texto,
    h('button.btn.sec', { style: { marginTop: '10px' }, onclick: () => leer() },
      icono('buscar', 16), 'Leer lo pegado'),
    salida, pie));

  // Si el resumen llegó por correo, se lee solo: el paso de elegir el archivo
  // es justamente el que la app se ahorra.
  if (yaBajado) setTimeout(() => leerArchivo(yaBajado), 0);

  function leer() {
    salida.replaceChildren(); pie.replaceChildren();
    const r = parseResumen(texto.value);
    if (!r) {
      salida.append(nota('No reconocí el resumen. Por ahora leo los de Galicia, ' +
        'Visa y Mastercard. Fijate que hayas copiado el texto entero.'));
      return;
    }
    if (!r.consumos.length && !r.impuestos.length) {
      salida.append(nota('Lo reconocí, pero no encontré consumos. Suele pasar cuando ' +
        'se copia solo la primera hoja.'));
      return;
    }
    previsualizar(r);
  }

  function previsualizar(r) {
    // Elegir la tarjeta: se propone la que coincide en marca y últimos cuatro.
    const tarjetas = state.accounts.filter(a => a.tipo === 'credito' && a.activo !== false);
    const propuesta = tarjetas.find(a => a.marca === r.marca &&
      (!r.ultimos4 || !a.ultimos4 || a.ultimos4 === r.ultimos4)) ||
      tarjetas.find(a => a.marca === r.marca);

    const nombreNuevo = r.producto || MARCAS[r.marca] || r.marca;
    const cual = select([
      ...tarjetas.map(a => ({ value: a.id, label: a.nombre })),
      { value: 'nueva', label: `Crear una nueva (${nombreNuevo}${r.ultimos4 ? ' · ' + r.ultimos4 : ''})` }
    ], { value: propuesta?.id || 'nueva' });

    // Los resúmenes de Mastercard no imprimen los últimos cuatro en ningún
    // lado. En vez de dejar la tarjeta sin número, se piden acá.
    const u4 = h('input', { type: 'text', inputmode: 'numeric', maxlength: '4',
                            placeholder: '9817', value: propuesta?.ultimos4 || '' });
    const pedirU4 = !r.ultimos4;

    const movs = aMovimientos(r, null);
    const yaEstan = new Set(state.transactions.map(t => t.externo_id).filter(Boolean));
    const nuevos = movs.filter(m => !yaEstan.has(m.externo_id));
    const repetidos = movs.length - nuevos.length;
    const enCuotas = nuevos.filter(m => m.cuotas > 1).length;

    // Los que ya anotaste a mano no se cargan de nuevo: se completan con lo
    // que dice el resumen. Anotar en el momento y despues importar es el uso
    // normal, no un error.
    const reconocidos = propuesta ? planear(nuevos, propuesta.id).adoptados : 0;

    salida.append(
      h('div.grp', { style: { marginTop: '14px' } },
        dato('Tarjeta', `${r.producto || MARCAS[r.marca] || r.marca}${r.ultimos4 ? ' · ' + r.ultimos4 : ''}`),
        r.ciclo ? dato('Cierre', `${dia(r.ciclo.cierre)} · vence ${dia(r.ciclo.vencimiento)}`) : null,
        r.total.ars != null ? dato('Total a pagar', plata(r.total.ars)) : null,
        r.total.usd ? dato('En dólares', plata(r.total.usd, 'USD')) : null,
        dato('Consumos nuevos', String(nuevos.length) + (enCuotas ? ` · ${enCuotas} en cuotas` : '')),
        repetidos ? dato('Ya importados', `${repetidos}, no se repiten`) : null,
        reconocidos ? dato('Ya anotados a mano', `${reconocidos}, se completan`) : null,
        r.impuestos.length ? dato('Impuestos', `${r.impuestos.length} · ${plata(sumaImp(r), 'ARS', { signo: true })}`) : null),
      h('div', { style: { marginTop: '14px' } }, campo('Cargar todo en', cual),
        pedirU4 ? h('div',
          campo('Últimos 4 de la tarjeta', u4),
          h('div.small.mut', { style: { marginTop: '-12px', marginBottom: '16px', lineHeight: '1.45' } },
            'Este resumen no los trae. Sirven para reconocer la tarjeta después.')) : null),
      h('div.small.mut', { style: { lineHeight: '1.5' } },
        r.ciclo ? 'También se guardan las seis fechas del ciclo en la tarjeta: son las que mandan sobre el día fijo de cierre. ' : '',
        enCuotas
          ? `Los consumos entran confirmados —el banco ya los cobró—; ${enCuotas === 1 ? 'la compra en cuotas queda' : 'las ' + enCuotas + ' compras en cuotas quedan'} para revisar.`
          : 'Los consumos entran confirmados: el banco ya los cobró.'));

    pie.append(h('button.btn', { onclick: () => importar(r, cual.value, nuevos, u4.value.trim()) },
      nuevos.length ? `Importar ${nuevos.length} movimientos` : 'Guardar las fechas del ciclo'));
  }

  async function importar(r, destino, nuevos, ultimos4) {
    const u4 = r.ultimos4 || ultimos4 || null;
    let cuenta = state.accounts.find(a => a.id === destino);
    if (!cuenta) {
      cuenta = await guardar('accounts', {
        nombre: `${r.producto || MARCAS[r.marca] || r.marca}${u4 ? ' ' + u4 : ''}`,
        tipo: 'credito', moneda: 'ARS', banco: 'Galicia', marca: r.marca,
        ultimos4: u4, limite: null,
        cierre_dia: null, vencimiento_dia: null, ciclos: [],
        saldo_inicial: 0, saldo_al: null,
        activo: true, orden: state.accounts.length + 1
      });
    }

    const cambios = {};
    if (r.ciclo) cambios.ciclos = mezclarCiclos(cuenta.ciclos, r.ciclo);
    if (u4 && cuenta.ultimos4 !== u4) cambios.ultimos4 = u4;
    if (Object.keys(cambios).length) cuenta = await guardar('accounts', { ...cuenta, ...cambios });

    // Un consumo del resumen no es una adivinanza: el banco ya lo cobró, con
    // fecha e importe. Entra confirmado. La excepción son las cuotas, que si
    // entran mal arrastran el error doce meses: esas sí van al mazo.
    const { filas, adoptados } = planear(nuevos, cuenta.id);

    // Los impuestos y percepciones también se pagan: entran como un gasto más.
    for (const i of r.impuestos) {
      const id = `${r.marca}:${r.ciclo?.cierre || ''}:imp:${i.fecha}:${i.concepto}:${i.monto}`;
      if (state.transactions.some(t => t.externo_id === id)) continue;
      // Una devolución viene en negativo en el resumen, pero un movimiento
      // guarda siempre importes positivos: lo que cambia es el tipo.
      filas.push({
        fecha: i.fecha, descripcion: i.concepto, comercio: i.concepto,
        monto: Math.abs(i.monto), moneda: 'ARS',
        tipo: i.monto < 0 ? 'ingreso' : 'gasto', cuotas: 1,
        account_id: cuenta.id, fuente: 'resumen', revisado: true, externo_id: id
      });
    }
    await guardarVarios('transactions', filas);

    cerrar();
    const aRevisar = nuevos.filter(m => m.cuotas > 1).length;
    const cargados = nuevos.length - adoptados;
    aviso(!nuevos.length ? 'Fechas del ciclo guardadas'
      : [cargados ? `${cargados} importados` : null,
         adoptados ? `${adoptados} ya estaban` : null,
         aRevisar ? `${aRevisar} en cuotas para revisar` : null].filter(Boolean).join(' · '));
  }
}

/**
 * Decide, para cada consumo del resumen, si crea una fila nueva o completa la
 * que ya habias anotado a mano.
 *
 * Al adoptar se le pega el identificador del resumen —para que no vuelva a
 * entrar en otra importacion—, las cuotas y la cuenta, y se respeta lo que
 * hayas escrito: el comercio que pusiste y la categoria que elegiste.
 *
 * `tomados` existe porque dos consumos del mismo dia por el mismo importe
 * podrian adoptar los dos la misma fila y perderse uno.
 */
function planear(nuevos, cuentaId) {
  const tomados = new Set();
  const filas = [];
  let adoptados = 0;

  for (const m of nuevos) {
    const candidatos = state.transactions.filter(t => !tomados.has(t.id));
    const previo = F.duplicadoManual({ ...m, account_id: cuentaId }, candidatos);
    if (previo) {
      tomados.add(previo.id);
      filas.push({ ...previo, account_id: cuentaId, externo_id: m.externo_id,
                   cuotas: m.cuotas, fecha: m.fecha, fuente: 'resumen',
                   revisado: m.cuotas <= 1 });
      adoptados++;
    } else {
      filas.push({ ...m, account_id: cuentaId, revisado: m.cuotas <= 1 });
    }
  }
  return { filas, adoptados };
}

// Las fechas nuevas se suman a las que ya estaban, sin repetir cierres.
function mezclarCiclos(previos = [], ciclo) {
  const m = new Map((previos || []).map(c => [c.cierre, c]));
  const pares = [[ciclo.cierreAnterior, ciclo.vencimientoAnterior],
                 [ciclo.cierre, ciclo.vencimiento],
                 [ciclo.cierreProximo, ciclo.vencimientoProximo]];
  for (const [cierre, vence] of pares) if (cierre && vence) m.set(cierre, { cierre, vence });
  return [...m.values()].sort((a, b) => a.cierre < b.cierre ? -1 : 1);
}

const sumaImp = r => r.impuestos.reduce((a, i) => a + i.monto, 0);
// Corto, como en el resto de la app: la fila no da para 'jueves 27 de agosto'.
const dia = iso => { const d = aFecha(iso); return `${d.getDate()}/${d.getMonth() + 1}`; };
const dato = (t, v) => h('div.li', h('div.m', h('div.t', t)), h('div.v', v));
const nota = txt => h('div.aviso.amb', { style: { marginTop: '14px' } },
  h('div.av.amb', icono('rayo', 17)), h('div.txt', h('div.ds', txt)));
