// =====================================================================
// vistas/importar.js — traer un resumen de tarjeta entero de una vez.
//
// El parser (resumen.js) ya existia y estaba probado, pero no habia forma de
// usarlo desde la app: habia que cargar cada consumo a mano. Aca se pega el
// texto del PDF y sale todo junto: las seis fechas del ciclo, los consumos,
// las cuotas y los impuestos.
// =====================================================================
import { h, icono, hoja, aviso, campo, select } from '../ui.js';
import { state, guardar } from '../db.js';
import { parseResumen, aMovimientos } from '../resumen.js';
import { plata, aFecha } from '../formato.js';

const MARCAS = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex' };

export function formImportarResumen() {
  const texto = h('textarea', {
    rows: '7', placeholder: 'Pegá acá el texto del resumen…',
    style: { width: '100%', font: '13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
             padding: '11px 12px', resize: 'vertical' }
  });
  const salida = h('div');
  const pie = h('div.fila', { style: { marginTop: '4px' } });

  const cerrar = hoja('Importar un resumen', h('div',
    h('div.small.mut', { style: { lineHeight: '1.5', marginBottom: '12px' } },
      'Abrí el PDF que te manda el banco, seleccioná todo el texto, copialo y ',
      'pegalo acá. Se leen los consumos, las cuotas, los impuestos y las seis ',
      'fechas del ciclo. Lo que ya esté cargado no se duplica.'),
    texto,
    h('button.btn.sec', { style: { marginTop: '10px' }, onclick: () => leer() },
      icono('recibo', 16), 'Leer el resumen'),
    salida, pie));

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

    const cual = select([
      ...tarjetas.map(a => ({ value: a.id, label: a.nombre })),
      { value: 'nueva', label: `Crear una nueva (${MARCAS[r.marca] || r.marca}${r.ultimos4 ? ' · ' + r.ultimos4 : ''})` }
    ], { value: propuesta?.id || 'nueva' });

    const movs = aMovimientos(r, null);
    const yaEstan = new Set(state.transactions.map(t => t.externo_id).filter(Boolean));
    const nuevos = movs.filter(m => !yaEstan.has(m.externo_id));
    const repetidos = movs.length - nuevos.length;
    const enCuotas = nuevos.filter(m => m.cuotas > 1).length;

    salida.append(
      h('div.grp', { style: { marginTop: '14px' } },
        dato('Tarjeta', `${MARCAS[r.marca] || r.marca}${r.ultimos4 ? ' · ' + r.ultimos4 : ''}`),
        r.ciclo ? dato('Cierre', `${dia(r.ciclo.cierre)} · vence ${dia(r.ciclo.vencimiento)}`) : null,
        r.total.ars != null ? dato('Total a pagar', plata(r.total.ars)) : null,
        r.total.usd ? dato('En dólares', plata(r.total.usd, 'USD')) : null,
        dato('Consumos nuevos', String(nuevos.length) + (enCuotas ? ` · ${enCuotas} en cuotas` : '')),
        repetidos ? dato('Ya cargados', `${repetidos}, no se repiten`) : null,
        r.impuestos.length ? dato('Impuestos', `${r.impuestos.length} · ${plata(sumaImp(r))}`) : null),
      h('div', { style: { marginTop: '14px' } }, campo('Cargar todo en', cual)),
      r.ciclo ? h('div.small.mut', { style: { lineHeight: '1.5' } },
        'También se guardan las seis fechas del ciclo en la tarjeta: son las que mandan ',
        'sobre el día fijo de cierre.') : null);

    pie.append(h('button.btn', { onclick: () => importar(r, cual.value, nuevos) },
      nuevos.length ? `Importar ${nuevos.length} movimientos` : 'Guardar las fechas del ciclo'));
  }

  async function importar(r, destino, nuevos) {
    let cuenta = state.accounts.find(a => a.id === destino);
    if (!cuenta) {
      cuenta = await guardar('accounts', {
        nombre: `${MARCAS[r.marca] || r.marca}${r.ultimos4 ? ' ' + r.ultimos4 : ''}`,
        tipo: 'credito', moneda: 'ARS', banco: 'Galicia', marca: r.marca,
        ultimos4: r.ultimos4 || null, limite: null,
        cierre_dia: null, vencimiento_dia: null, ciclos: [],
        saldo_inicial: 0, saldo_al: null,
        activo: true, orden: state.accounts.length + 1
      });
    }

    if (r.ciclo) await guardar('accounts', { ...cuenta, ciclos: mezclarCiclos(cuenta.ciclos, r.ciclo) });

    for (const m of nuevos) await guardar('transactions', { ...m, account_id: cuenta.id });

    // Los impuestos y percepciones también se pagan: entran como un gasto más.
    for (const i of r.impuestos) {
      const id = `${r.marca}:${r.ciclo?.cierre || ''}:imp:${i.fecha}:${i.concepto}:${i.monto}`;
      if (state.transactions.some(t => t.externo_id === id)) continue;
      await guardar('transactions', {
        fecha: i.fecha, descripcion: i.concepto, comercio: i.concepto,
        monto: i.monto, moneda: 'ARS', tipo: 'gasto', cuotas: 1,
        account_id: cuenta.id, fuente: 'resumen', revisado: false, externo_id: id
      });
    }

    cerrar();
    aviso(nuevos.length ? `${nuevos.length} movimientos importados` : 'Fechas del ciclo guardadas');
  }
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
