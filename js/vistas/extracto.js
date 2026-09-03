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
import { parseExtracto, revisarExtracto, aMovimientos, cargosDelBanco,
         queCargo } from '../extracto.js';
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
      if (texto.value.replace(/\s/g, '').length < 40) {
        // El PDF abrió pero no tiene letras: es una imagen. Es común cuando
        // se baja desde la app del banco en vez de la web.
        estado.textContent = 'Ese PDF no tiene texto adentro: es una imagen. ' +
          'Probá bajarlo desde la web del banco, que suele darlo con texto.';
        return;
      }
      estado.textContent = `${f.name || 'El resumen'} · ${texto.value.split('\n').length} líneas`;
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
          `${e?.name || 'Error'}: ${String(e?.message || e).slice(0, 160)}`,
          // La primera línea del stack dice en qué archivo y en qué función
          // pasó. Sin eso, "undefined is not a function" puede ser cualquier
          // cosa de un archivo de medio megabyte.
          e?.stack ? h('div', { style: { marginTop: '5px', opacity: '.75' } },
            String(e.stack).split('\n').slice(0, 3).join(' ⏎ ').slice(0, 260)) : null));
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
    if (!r) { salida.append(porQueNo(texto.value)); return; }
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

  /**
   * Por qué no lo pudo leer, con lo que sí vio.
   *
   * "No lo reconozco" a secas es un callejón sin salida: no se sabe si el
   * problema es el formato, si copiaste media hoja o si el PDF vino
   * escaneado. Con esto se sabe en qué paso falló, y de paso alcanza para
   * mandarlo y que le arreglemos el formato.
   */
  function porQueNo(txt) {
    const v = revisarExtracto(txt);
    const linea = (ok, t) => h('div.li',
      h('div', { class: 'av ' + (ok ? 'pos' : 'amb') }, icono(ok ? 'check' : 'cerrar', 15)),
      h('div.m', h('div.t', t)));

    const motivo = v.lineas < 3
      ? 'Llegó casi nada de texto. Si el PDF es una foto o un escaneo no tiene ' +
        'letras adentro, y ahí no hay nada que leer: probá bajarlo de nuevo desde ' +
        'la web del banco en vez de la app.'
      : v.pareceTarjeta && v.conSaldo === 0
      ? 'Esto parece el resumen de la TARJETA, no el de la cuenta. El de tarjeta ' +
        'se sube desde Tarjetas → Importar un resumen.'
      : v.conFecha === 0
      ? 'No encontré ninguna línea que empiece con una fecha. Puede ser que el ' +
        'PDF haya salido con las columnas mezcladas.'
      : v.conSaldo === 0
      ? 'Las líneas traen un solo importe. Un extracto de cuenta lleva el saldo ' +
        'al lado de cada movimiento, y es de ahí de donde saco si entró o salió.'
      : 'Leí las líneas pero no pude armarlo. Mandame el texto de abajo y lo ajusto.';

    return h('div', { style: { marginTop: '14px' } },
      h('div.grp.pad', h('div.small', { style: { lineHeight: '1.55' } }, motivo)),
      h('div.ghead', { style: { marginTop: '16px' } }, 'Qué vi'),
      h('div.grp',
        linea(v.lineas >= 3, `${v.lineas} ${v.lineas === 1 ? 'línea' : 'líneas'} de texto`),
        linea(v.conFecha > 0, `${v.conFecha} empiezan con una fecha`),
        linea(v.conSaldo > 0, `${v.conSaldo} traen importe y saldo`),
        linea(v.nombraSaldo, v.nombraSaldo ? 'Nombra el saldo' : 'No dice "saldo" en ningún lado')),
      v.muestra.length ? h('div', { style: { marginTop: '16px' } },
        h('div.ghead', 'Así vienen las filas'),
        h('div.grp.pad', v.muestra.map(m =>
          h('div', { style: { fontFamily: 'ui-monospace, monospace', fontSize: '11.5px',
                              lineHeight: '1.6', wordBreak: 'break-all',
                              color: 'var(--tx2)' } }, m)))) : null);
  }

  const dato = (k, v) => h('div.li', h('div.m', h('div.t', k)), h('div.v', v));
  const dia = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—';
  const nota = txt => h('div.grp.pad', { style: { marginTop: '14px' } },
    h('div.small.mut', { style: { lineHeight: '1.5' } }, txt));

  return cerrar;
}
