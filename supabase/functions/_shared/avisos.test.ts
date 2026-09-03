// node --experimental-strip-types supabase/functions/_shared/avisos.test.ts
import assert from 'node:assert/strict';
import { avisosDelDia, saldoDeCuenta, seDespegoDelResto } from './avisos.ts';

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

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
