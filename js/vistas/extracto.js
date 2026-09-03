// =====================================================================
// vistas/extracto.js — subir el resumen de CUENTA del banco.
//
// El de tarjeta trae lo que compraste. Este trae lo que se movió en la
// cuenta, y ahí adentro están los gastos hormiga que no manda ningún aviso:
// mantenimiento, seguros que se renuevan solos, el impuesto al débito y al
// crédito, retenciones. Cada uno chico, todos los meses, y ninguno aparece en
// una lista de gastos porque nadie los carga a mano.
//
// El banco avisa por mail que el resumen está, pero no lo adjunta: hay que
// bajarlo de su app. Así que acá no se puede automatizar el paso del medio —
// se avisa, y cuando el archivo está, la app hace el resto.
// =====================================================================
import { h, icono, hoja, aviso, campo, select } from '../ui.js';
import { state, guardar, guardarVarios } from '../db.js';
import { parseExtracto, aMovimientos, cargosDelBanco, queCargo } from '../extracto.js';
import { plata } from '../formato.js';

export function formImportarExtracto(yaBajado = null) {
  const texto = h('textarea', {
    rows: '7', placeholder: 'Pegá acá el texto del resumen de cuenta…',
    style: { width: '100%', fontSize: '16px', lineHeight: '1.45',
             fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
             padding: '11px 12px', resize: 'vertical' }
  });
  const salida = h('div');
  const pie = h('div.fila', { style: { marginTop: '4px' } });
  const estado = h('div.small.mut', { style: { marginTop: '10px', lineHeight: '1.45' } });
  const archivo = h('input', { type: 'file', accept: 'application/pdf,.pdf,.txt',
                               style: { display: 'none' },
                               onchange: e => leerArchivo(e.target.files[0]) });

  const CLAVE_KEY = 'bishusha.clavePdf';
  const claveGuardada = () => { try { return localStorage.getItem(CLAVE_KEY) || ''; }
                                catch { return ''; } };

  async function leerArchivo(f, { clave } = {}) {
    if (!f) return;
    salida.replaceChildren(); pie.replaceChildren();
    if (f.name && /\.txt$/i.test(f.name)) {
      texto.value = await f.text(); leer(); return;
    }
    estado.textContent = 'Abriendo el PDF…';
    try {
      const { textoDePDF } = await import('../pdf.js');
      texto.value = await textoDePDF(f, {
        clave: clave ?? claveGuardada(),
        alAvanzar: (n, total) => { estado.textContent = `Leyendo página ${n} de ${total}…`; }
      });
      if (clave) { try { localStorage.setItem(CLAVE_KEY, clave); } catch { /* modo privado */ } }
      estado.textContent = `${f.name || 'El resumen'} · ${texto.value.split('\n').length} líneas`;
      leer();
    } catch (e) {
      if (e?.name === 'PideClave') { pedirClave(f); return; }
      estado.textContent = 'No pude abrir el PDF. Podés abrirlo vos, copiar el texto y pegarlo acá.';
      console.warn('pdf', e);
    }
  }

  function pedirClave(f) {
    const inp = h('input', { type: 'password', inputmode: 'numeric',
                             placeholder: 'Suele ser tu DNI, sin puntos',
                             value: claveGuardada() });
    const btn = h('button.btn', { style: { marginTop: '14px' } }, 'Abrir el resumen');
    btn.onclick = () => { cerrarClave(); leerArchivo(f, { clave: inp.value.trim() }); };
    const cerrarClave = hoja('El resumen tiene clave', h('div',
      h('div.small.mut', { style: { lineHeight: '1.55', marginBottom: '14px' } },
        'Casi siempre es el DNI sin puntos. Queda en este teléfono nada más.'),
      campo('Contraseña del PDF', inp), btn));
    estado.textContent = 'El PDF tiene contraseña.';
  }

  const cerrar = hoja('Subir el resumen de cuenta', h('div',
    h('div.small.mut', { style: { lineHeight: '1.5', marginBottom: '12px' } },
      'Es el de la CUENTA, no el de la tarjeta. Bajalo de la app del banco y ',
      'elegilo acá: la app separa lo que gastaste vos de lo que te cobró el ',
      'banco, que es lo que nunca se ve.'),
    h('button.btn', { onclick: () => archivo.click() },
      icono('banco', 17), 'Elegir el PDF del resumen'),
    archivo, estado,
    h('div.small.mut', { style: { margin: '18px 0 8px', textAlign: 'center' } }, 'o pegalo a mano'),
    texto,
    h('button.btn.sec', { style: { marginTop: '10px' }, onclick: () => leer() },
      icono('buscar', 16), 'Leer lo pegado'),
    salida, pie));

  if (yaBajado) setTimeout(() => leerArchivo(yaBajado), 0);

  function leer() {
    salida.replaceChildren(); pie.replaceChildren();
    const r = parseExtracto(texto.value);
    if (!r) {
      salida.append(nota('No lo reconocí como un resumen de cuenta. Fijate que sea el de ' +
        'la cuenta y no el de la tarjeta, y que esté el texto entero.'));
      return;
    }
    if (!r.movimientos.length) {
      salida.append(nota('Lo reconocí pero no encontré movimientos. Suele pasar cuando se ' +
        'copia solo la primera hoja.'));
      return;
    }
    previsualizar(r);
  }

  function previsualizar(r) {
    const cuentas = state.accounts.filter(a => a.tipo !== 'credito' && a.activo !== false);
    // Se propone la que coincide por número de cuenta, y si no, la primera en
    // pesos: es casi siempre la del banco que manda el resumen.
    const propuesta = cuentas.find(a => r.cuenta && a.ultimos4 &&
                                        r.cuenta.includes(a.ultimos4)) ||
                      cuentas.find(a => (a.moneda || 'ARS') === 'ARS');
    const cual = select(cuentas.map(a => ({ value: a.id, label: a.nombre })),
                        { value: propuesta?.id || cuentas[0]?.id || '' });

    const todos = aMovimientos(r, null);
    const yaEstan = new Set(state.transactions.map(t => t.externo_id).filter(Boolean));
    const nuevos = todos.filter(m => !yaEstan.has(m.externo_id));
    const cargos = cargosDelBanco(r.movimientos);

    // Lo que ya está cargado por otro lado: mismo día y mismo importe. No se
    // vuelve a cargar, y decirlo es lo que hace que uno confíe en el número.
    const yaCargados = nuevos.filter(m => state.transactions.some(t =>
      String(t.fecha).slice(0, 10) === m.fecha &&
      Math.abs(Number(t.monto) - m.monto) < 0.05 && t.tipo === m.tipo));
    const aCargar = nuevos.filter(m => !yaCargados.includes(m));

    // El caso normal: el extracto tiene todo lo del mes, pero lo de todos los
    // días ya entró por los avisos del banco. Lo que de verdad falta cargar
    // son los cargos del banco, y por eso vienen elegidos por defecto.
    const soloBanco = h('input', { type: 'checkbox', checked: true,
                                   onchange: () => pintarBoton() });
    const cuantos = () => soloBanco.checked ? aCargar.filter(m => m.cargoBanco).length
                                            : aCargar.length;

    salida.append(
      h('div.grp', { style: { marginTop: '14px' } },
        dato('Cuenta', r.cuenta || r.banco || '—'),
        r.periodo.desde ? dato('Período',
          `${dia(r.periodo.desde)} al ${dia(r.periodo.hasta)}`) : null,
        dato('Movimientos', String(r.movimientos.length)),
        dato('Te cobró el banco', `${plata(Math.round(cargos.total))} · ` +
          `${cargos.conceptos.length} ${cargos.conceptos.length === 1 ? 'concepto' : 'conceptos'}`),
        yaCargados.length ? dato('Ya estaban cargados', `${yaCargados.length}, no se repiten`) : null,
        r.cuadra === false ? dato('Ojo', 'los saldos no cierran: puede faltar una hoja') : null),

      cargos.conceptos.length ? h('div', { style: { marginTop: '16px' } },
        h('div.ghead', 'Lo que te cobró el banco este mes'),
        h('div.grp', cargos.conceptos.map(c => h('div.li',
          h('div.av.amb', icono('banco', 15)),
          h('div.m', h('div.t', c.nombre),
            h('div.s', `${c.cuantos} ${c.cuantos === 1 ? 'cargo' : 'cargos'}`)),
          h('div.v', plata(Math.round(c.monto))))))) : null,

      h('div', { style: { marginTop: '16px' } }, campo('Cargar en', cual)),
      h('label.li', { style: { padding: '11px 0' } },
        h('div.m', h('div.t', 'Solo lo que cobra el banco'),
          h('div.s', { style: { whiteSpace: 'normal', lineHeight: '1.4' } },
            'Los gastos de todos los días ya entran por los avisos del banco. ' +
            'Lo que no entra por ningún lado son las comisiones.')),
        soloBanco));

    const btn = h('button.btn');
    const pintarBoton = () => {
      const n = cuantos();
      btn.textContent = n ? `Cargar ${n} ${n === 1 ? 'movimiento' : 'movimientos'}`
                          : 'No hay nada nuevo para cargar';
      btn.disabled = !n;
    };
    btn.onclick = () => importar(r, cual.value,
      soloBanco.checked ? aCargar.filter(m => m.cargoBanco) : aCargar);
    pintarBoton();
    pie.append(btn);
  }

  async function importar(r, destino, filas) {
    if (!destino) { aviso('Elegí en qué cuenta'); return; }
    // Los cargos del banco van todos a la misma categoría: separados del
    // supermercado se pueden mirar juntos, y juntos es como se discuten.
    const cat = await categoriaBancarios();
    const listas = filas.map(m => ({
      ...m, account_id: destino,
      category_id: m.cargoBanco ? cat.id : null,
      // Un cargo del banco no es una adivinanza: ya te lo cobraron.
      revisado: true, cargoBanco: undefined
    }));
    await guardarVarios('transactions', listas);
    cerrar();
    aviso(`${listas.length} ${listas.length === 1 ? 'movimiento cargado' : 'movimientos cargados'}`);
  }

  async function categoriaBancarios() {
    const hay = (state.categories || []).find(c => /banc/i.test(c.nombre || ''));
    if (hay) return hay;
    return guardar('categories', { nombre: 'Bancarios', tipo: 'gasto', icono: 'banco',
                                   color: '#5C6272', orden: 99 });
  }

  const dato = (k, v) => h('div.li', h('div.m', h('div.t', k)), h('div.v', v));
  const dia = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—';
  const nota = txt => h('div.grp.pad', { style: { marginTop: '14px' } },
    h('div.small.mut', { style: { lineHeight: '1.5' } }, txt));

  return cerrar;
}
