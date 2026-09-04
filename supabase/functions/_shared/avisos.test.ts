// node --experimental-strip-types supabase/functions/_shared/avisos.test.ts
import assert from 'node:assert/strict';
import { avisosDelDia, saldoDeCuenta, seDespegoDelResto, mesApretado,
         topesQueRigen } from './avisos.ts';

let ok = 0, mal = 0;
const t = (n: string, fn: () => void) => { try { fn(); console.log('  ok  ' + n); ok++; }
                                           catch (e: any) { console.log('  FALLA  ' + n + '\n         ' + e.message); mal++; } };
const d = (s: string) => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd); };

const CUENTAS = [
  { id: 'gal', nombre: 'Galicia', tipo: 'cuenta', moneda: 'ARS', saldo_inicial: 100000, saldo_al: '2026-09-01' },
  { id: 'visa', nombre: 'Galicia Visa', tipo: 'credito', cierre_dia: 27, vencimiento_dia: 4 }
];
const RECURRINGS = [{ id: 'r1', nombre: 'Alquiler', monto_estimado: 850, moneda: 'USD',
                      dia_vencimiento: 5, activo: true }];

console.log('\nLO QUE AVISA BISHU');

t('avisa dos días antes, el día, y si venció', () => {
  const el3 = avisosDelDia({ recurrings: RECURRINGS }, d('2026-09-03'));
  assert.match(el3[0].titulo, /vence en 2 días/);
  assert.match(el3[0].cuerpo, /US\$ 850/);
  assert.match(avisosDelDia({ recurrings: RECURRINGS }, d('2026-09-05'))[0].titulo, /Hoy vence/);
  assert.match(avisosDelDia({ recurrings: RECURRINGS }, d('2026-09-06'))[0].titulo, /venció ayer/);
});

t('un gasto fijo ya pagado no molesta', () => {
  const pagos = [{ recurring_id: 'r1', periodo: '2026-09', pagado_at: '2026-09-02T10:00:00Z' }];
  assert.deepEqual(avisosDelDia({ recurrings: RECURRINGS, pagos }, d('2026-09-05')), []);
});

t('el día antes del cierre avisa, para llegar con la compra', () => {
  const a = avisosDelDia({ cuentas: CUENTAS }, d('2026-09-26'));
  assert.match(a[0].titulo, /cierra mañana/);
  assert.equal(a[0].url, './#/tarjetas');
  assert.deepEqual(avisosDelDia({ cuentas: CUENTAS }, d('2026-09-25')), []);
});

t('la promo marcada avisa el día que cae, y solo ese', () => {
  const promos = [{ id: 'p', titulo: 'YPF 25%', valor: 25, tipo: 'descuento', recordar: true,
                    medio_pago: 'MODO', tope: 20000, dias: [4],
                    vigencia_desde: '2026-09-10', vigencia_hasta: '2026-09-10' }];
  const a = avisosDelDia({ promos }, d('2026-09-10'));
  assert.match(a[0].titulo, /Hoy: YPF/);
  assert.match(a[0].cuerpo, /25% de descuento · MODO · tope \$ 20\.000/);
  assert.deepEqual(avisosDelDia({ promos }, d('2026-09-03')), []);   // otro jueves
});

t('la promo que no marcaste no avisa nunca', () => {
  const promos = [{ id: 'p', titulo: 'Coto', valor: 25, recordar: false, dias: [] }];
  assert.deepEqual(avisosDelDia({ promos }, d('2026-09-10')), []);
});

t('el saldo en rojo se avisa aunque no haya mínimo puesto', () => {
  const txs = [{ tipo: 'gasto', monto: 150000, fecha: '2026-09-02', account_id: 'gal' }];
  const a = avisosDelDia({ cuentas: [CUENTAS[0]], txs }, d('2026-09-03'));
  assert.match(a[0].titulo, /en rojo/);
  assert.match(a[0].cuerpo, /\$ 50\.000/);
});

t('el mínimo lo pone cada uno', () => {
  const txs = [{ tipo: 'gasto', monto: 70000, fecha: '2026-09-02', account_id: 'gal' }];
  assert.deepEqual(avisosDelDia({ cuentas: [CUENTAS[0]], txs }, d('2026-09-03')), []);
  const a = avisosDelDia({ cuentas: [CUENTAS[0]], txs, saldoMinimo: 50000 }, d('2026-09-03'));
  assert.match(a[0].titulo, /Queda poco/);
});

t('una compra con tarjeta no baja el saldo de la cuenta', () => {
  const txs = [{ tipo: 'gasto', monto: 900000, fecha: '2026-09-02', account_id: 'visa' }];
  assert.equal(saldoDeCuenta(CUENTAS[0], txs, d('2026-09-03')), 100000);
});

t('comprar dólares mueve las dos cuentas, cada una en su moneda', () => {
  const usd = { id: 'usd', nombre: 'Dólares', tipo: 'efectivo', moneda: 'USD', saldo_inicial: 0 };
  const txs = [{ tipo: 'transferencia', monto: 72500, moneda: 'ARS', fecha: '2026-09-02',
                 account_id: 'gal', destino_account_id: 'usd', monto_destino: 50 }];
  assert.equal(saldoDeCuenta(CUENTAS[0], txs, d('2026-09-03')), 27500);
  assert.equal(saldoDeCuenta(usd, txs, d('2026-09-03')), 50);
});

t('cada tipo se puede apagar por separado', () => {
  const datos = { recurrings: RECURRINGS, cuentas: CUENTAS,
                  prefs: { pagos: false, resumen: false } };
  assert.deepEqual(avisosDelDia(datos, d('2026-09-05')), []);
  assert.equal(avisosDelDia({ ...datos, prefs: { resumen: false } }, d('2026-09-05')).length, 1);
});

t('un tipo que todavía no estaba en las preferencias viene prendido', () => {
  const a = avisosDelDia({ recurrings: RECURRINGS, prefs: { promos: false } }, d('2026-09-05'));
  assert.equal(a.length, 1);
});

t('lo que hay que pagar va antes que la opinión de Bishu', () => {
  const a = avisosDelDia({
    recurrings: [{ id: 'r2', nombre: 'OSDE', monto_estimado: 302006, moneda: 'ARS',
                   dia_vencimiento: 16, activo: true }],
    gastadoEsteMes: 100000, gastadoMesPasado: 500000,
    promos: [{ id: 'p', titulo: 'Coto', valor: 25, recordar: true, dias: [] }]
  }, d('2026-09-14'));                                   // un lunes
  assert.deepEqual(a.map(x => x.tipo), ['pagos', 'promos', 'bishu']);
});

t('la opinión es semanal, no de todos los días', () => {
  const datos = { gastadoEsteMes: 100000, gastadoMesPasado: 500000 };
  assert.equal(avisosDelDia(datos, d('2026-09-14')).length, 1);   // lunes
  assert.equal(avisosDelDia(datos, d('2026-09-15')).length, 0);   // martes
  assert.equal(avisosDelDia(datos, d('2026-09-07')).length, 0);   // muy temprano en el mes
});

// ------------------------------------------------------- cierre del mes
t('el día 1 avisa cómo cerró el mes, comparando con el anterior', () => {
  const m = avisosDelDia({
    salioMesCerrado: 2_500_000, salioMesAnterior: 2_900_000, movimientosMesCerrado: 41
  }, new Date(2026, 8, 1));
  const c = m.find(x => x.tipo === 'cierre');
  assert.ok(!!c, 'tiene que haber aviso de cierre');
  assert.ok(c!.titulo.includes('agosto'), 'nombra el mes que cerró: ' + c!.titulo);
  assert.ok(c!.cuerpo.includes('menos'), 'dice que gastó menos: ' + c!.cuerpo);
  assert.ok(c!.url.includes('/cierre/2026-08'), 'lleva al cierre de ese mes: ' + c!.url);
});

t('sin mes anterior con qué comparar, dice lo que salió y nada más', () => {
  const m = avisosDelDia({
    salioMesCerrado: 2_500_000, salioMesAnterior: 0, movimientosMesCerrado: 41
  }, new Date(2026, 8, 1));
  const c = m.find(x => x.tipo === 'cierre')!;
  assert.ok(c.cuerpo.includes('41 movimientos'), c.cuerpo);
});

t('el cierre es del día 1 y de ningún otro', () => {
  for (const dia of [2, 5, 15, 28]) {
    const m = avisosDelDia({ salioMesCerrado: 2_500_000, movimientosMesCerrado: 41 },
                           new Date(2026, 8, dia));
    assert.ok(!m.some(x => x.tipo === 'cierre'), 'no debería avisar el ' + dia);
  }
});

t('un mes sin nada cargado no se anuncia', () => {
  const m = avisosDelDia({ salioMesCerrado: 0, movimientosMesCerrado: 0 },
                         new Date(2026, 8, 1));
  assert.ok(!m.some(x => x.tipo === 'cierre'), 'no hay nada que contar');
});

t('el cierre se puede apagar como cualquier otro', () => {
  const m = avisosDelDia({ prefs: { cierre: false }, salioMesCerrado: 2_500_000,
                           movimientosMesCerrado: 41 }, new Date(2026, 8, 1));
  assert.ok(!m.some(x => x.tipo === 'cierre'), 'apagado no avisa');
});

// ------------------------------------------------- subio mas que el resto
const FIJOS = [{ id: 'flow', nombre: 'Flow', activo: true },
               { id: 'luz', nombre: 'Edesur', activo: true },
               { id: 'gas', nombre: 'Metrogas', activo: true },
               { id: 'agua', nombre: 'Aysa', activo: true }];
const pg = (id: string, periodo: string, monto: number) =>
  ({ recurring_id: id, periodo, monto, pagado_at: `${periodo}-05T00:00:00Z` });
// Todo sube 6 %, menos Flow que sube 22 %.
const PAGOS = [
  pg('flow', '2026-06', 38000), pg('flow', '2026-09', 46400),
  pg('luz', '2026-06', 20000), pg('luz', '2026-09', 21200),
  pg('gas', '2026-06', 37000), pg('gas', '2026-09', 39220),
  pg('agua', '2026-06', 26000), pg('agua', '2026-09', 27560)
];

t('el que se despegó del resto es el que se marca, no el que subió', () => {
  const a = seDespegoDelResto(FIJOS, PAGOS, '2026-09')!;
  assert.equal(a.nombre, 'Flow');
  assert.equal(Math.round(a.subio), 22);
  assert.equal(Math.round(a.normal), 6);
  assert.equal(Math.round(a.demas), 6120);
});

t('si TODOS suben parejo, no hay nada que avisar', () => {
  // Es la prueba que importa: en Argentina sube todo todos los meses, y una
  // regla que mida contra cero avisaria por los cuatro, todos los meses.
  const parejo = PAGOS.map(p => p.recurring_id === 'flow' && p.periodo === '2026-09'
    ? { ...p, monto: 40280 } : p);          // Flow tambien al 6 %
  assert.equal(seDespegoDelResto(FIJOS, parejo, '2026-09'), null);
});

t('con menos de tres comparables no se opina sin referencia', () => {
  const dos = PAGOS.filter(p => p.recurring_id === 'flow' || p.recurring_id === 'luz');
  assert.equal(seDespegoDelResto(FIJOS, dos, '2026-09'), null);
  const conRef = seDespegoDelResto(FIJOS, dos, '2026-09', 6)!;
  assert.equal(conRef.nombre, 'Flow');
});

t('gana el que cuesta más plata, no el que subió más por ciento', () => {
  const conSuscripcion = [...FIJOS, { id: 'spo', nombre: 'Spotify', activo: true }];
  const pagos = [...PAGOS, pg('spo', '2026-06', 9000), pg('spo', '2026-09', 12600)];
  const a = seDespegoDelResto(conSuscripcion, pagos, '2026-09')!;
  assert.equal(a.nombre, 'Flow');           // Spotify subio 40 %, pero son $ 3.000
});

t('el aviso sale el día 5 y nombra las dos cifras', () => {
  const m = avisosDelDia({ recurrings: FIJOS, pagosViejos: PAGOS }, new Date(2026, 8, 5));
  const a = m.find(x => x.tipo === 'aumentos')!;
  assert.ok(a, 'tiene que haber aviso');
  assert.ok(a.titulo.includes('Flow') && a.titulo.includes('22'), a.titulo);
  assert.ok(a.cuerpo.includes('6 %'), a.cuerpo);
});

t('y no sale ningún otro día', () => {
  for (const dia of [1, 4, 6, 20]) {
    const m = avisosDelDia({ recurrings: FIJOS, pagosViejos: PAGOS }, new Date(2026, 8, dia));
    assert.ok(!m.some(x => x.tipo === 'aumentos'), 'no debería avisar el ' + dia);
  }
});


// ---------------------------------------------------------------------
// Lo que ya viene
// ---------------------------------------------------------------------
const DIA10 = new Date(2026, 8, 10); // 10 de septiembre de 2026

const foto = (calculada: string, meses: any[]) => ({ calculada, meses });
const mes = (periodo: string, pct: number, libre = 400000) =>
  ({ periodo, entra: 3000000, comprometido: 3000000 * pct / 100, libre, pct });

t('avisa del PRIMER mes apretado, no del peor', () => {
  // Es el que todavia se puede evitar: en el que ya no se puede, avisar es
  // contar una desgracia.
  const p = foto('2026-09-08T12:00:00Z',
    [mes('2026-10', 78), mes('2026-11', 91), mes('2026-12', 60)]);
  assert.equal(mesApretado(p, DIA10)!.periodo, '2026-10');
});

t('un mes holgado no se avisa', () => {
  const p = foto('2026-09-08T12:00:00Z', [mes('2026-10', 55), mes('2026-11', 62)]);
  assert.equal(mesApretado(p, DIA10), null);
});

t('una foto vieja no se usa: un numero de hace dos meses se cree igual', () => {
  const p = foto('2026-06-01T12:00:00Z', [mes('2026-10', 78)]);
  assert.equal(mesApretado(p, DIA10), null);
});

t('sin fecha de calculo tampoco: no hay forma de saber si sirve', () => {
  assert.equal(mesApretado({ meses: [mes('2026-10', 78)] } as any, DIA10), null);
  assert.equal(mesApretado(null, DIA10), null);
  assert.equal(mesApretado({ calculada: '2026-09-08T12:00:00Z', meses: [] }, DIA10), null);
});

t('el mes en curso no cuenta: ya no se puede evitar', () => {
  const p = foto('2026-09-08T12:00:00Z', [mes('2026-09', 95), mes('2026-10', 50)]);
  assert.equal(mesApretado(p, DIA10), null);
});

t('sin ingreso conocido no se opina: el porcentaje seria de la nada', () => {
  const p = foto('2026-09-08T12:00:00Z', [{ periodo: '2026-10', entra: 0, pct: 0, libre: 0 }]);
  assert.equal(mesApretado(p, DIA10), null);
});

t('el aviso sale el dia 10 y dice el porcentaje y lo que queda', () => {
  const p = foto('2026-09-08T12:00:00Z', [mes('2026-11', 78, 660000)]);
  const m = avisosDelDia({ proyeccion: p }, DIA10);
  const a = m.find(x => x.tipo === 'viene')!;
  assert.ok(a, 'tiene que haber aviso');
  assert.ok(a.titulo.includes('noviembre'), a.titulo);
  assert.ok(a.cuerpo.includes('78 %'), a.cuerpo);
  assert.ok(a.cuerpo.includes('660.000'), a.cuerpo);
  assert.equal(a.url, './#/estadisticas');
});

t('y ningun otro dia del mes', () => {
  const p = foto('2026-09-08T12:00:00Z', [mes('2026-11', 78)]);
  for (const dia of [1, 5, 9, 11, 25]) {
    const m = avisosDelDia({ proyeccion: p }, new Date(2026, 8, dia));
    assert.ok(!m.some(x => x.tipo === 'viene'), 'no deberia avisar el ' + dia);
  }
});

t('se puede apagar como cualquier otro', () => {
  const p = foto('2026-09-08T12:00:00Z', [mes('2026-11', 78)]);
  const m = avisosDelDia({ proyeccion: p, prefs: { viene: false } }, DIA10);
  assert.ok(!m.some(x => x.tipo === 'viene'));
});


// ---------------------------------------------------------------------
// Los topes
// ---------------------------------------------------------------------
const DIA18 = new Date(2026, 8, 18);
const TOPE = (gastado: number) => [{ id: 'c1', nombre: 'Supermercado', tope: 400000, gastado }];

t('avisa al llegar al 80 %, con lo que queda', () => {
  // Enterarse el 30 de que te pasaste no cambia nada. Enterarte el 18 de que
  // vas por el 85 % te deja doce días para hacer algo.
  const m = avisosDelDia({ topes: TOPE(340000) }, DIA18);
  const a = m.find(x => x.tipo === 'tope')!;
  assert.ok(a, 'tiene que avisar');
  assert.match(a.titulo, /85 %/);
  assert.match(a.titulo, /Supermercado/);
  assert.match(a.cuerpo, /60\.000/);
});

t('y otra vez, distinto, cuando se pasa', () => {
  const m = avisosDelDia({ topes: TOPE(455000) }, DIA18);
  const a = m.find(x => x.tipo === 'tope')!;
  assert.match(a.titulo, /Te pasaste/);
  assert.match(a.cuerpo, /55\.000 de más/);
});

t('por debajo del umbral no dice nada', () => {
  assert.equal(avisosDelDia({ topes: TOPE(200000) }, DIA18)
    .some(x => x.tipo === 'tope'), false);
});

t('no repite el que ya avisó', () => {
  // Repetir "vas por el 85 %" todas las mañanas durante dos semanas es la
  // forma más rápida de que alguien apague los avisos para siempre.
  const clave = '2026-09-c1-cerca';
  const m = avisosDelDia({ topes: TOPE(340000), topesAvisados: [clave] }, DIA18);
  assert.equal(m.some(x => x.tipo === 'tope'), false);
});

t('pero el de "te pasaste" sale igual, aunque ya haya avisado el de cerca', () => {
  // Son dos noticias distintas y la segunda importa más.
  const m = avisosDelDia({ topes: TOPE(455000), topesAvisados: ['2026-09-c1-cerca'] }, DIA18);
  assert.match(m.find(x => x.tipo === 'tope')!.titulo, /Te pasaste/);
});

t('uno por vez, y el peor', () => {
  const m = avisosDelDia({ topes: [
    { id: 'c1', nombre: 'Supermercado', tope: 400000, gastado: 340000 },
    { id: 'c2', nombre: 'Gastronomía', tope: 100000, gastado: 150000 }
  ] }, DIA18);
  const tops = m.filter(x => x.tipo === 'tope');
  assert.equal(tops.length, 1, 'dos avisos de tope el mismo día son ruido');
  assert.match(tops[0].titulo, /Gastronomía/);
});

t('se puede apagar', () => {
  assert.equal(avisosDelDia({ topes: TOPE(455000), prefs: { tope: false } }, DIA18)
    .some(x => x.tipo === 'tope'), false);
});

t('un tope en cero no divide por cero', () => {
  const m = avisosDelDia({ topes: [{ id: 'c', nombre: 'X', tope: 0, gastado: 5000 }] }, DIA18);
  assert.equal(m.some(x => x.tipo === 'tope'), false);
});

t('los topes se heredan del último mes que los tenga', () => {
  // Sin esto, el aviso se apagaba solo el 1 de cada mes, que es cuando más
  // sirve.
  const b = [{ periodo: '2026-08', category_id: 'c1', monto: 400000 }];
  assert.equal(topesQueRigen(b, '2026-09').length, 1);
  assert.equal(topesQueRigen(b, '2026-08').length, 1);
  assert.equal(topesQueRigen(b, '2027-06').length, 0, 'de hace un año, no');
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
