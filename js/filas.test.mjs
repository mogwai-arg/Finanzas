// node js/filas.test.mjs
import assert from 'node:assert/strict';
import { normalizar } from './filas.js';

let ok = 0, mal = 0;
const t = (n, fn) => { try { fn(); console.log('  ok  ' + n); ok++; }
                       catch (e) { console.log('  FALLA  ' + n + '\n         ' + e.message); mal++; } };

console.log('\nLO QUE SE SUBE A LA BASE');

t('un campo calculado por una pantalla no viaja', () => {
  // La pantalla de Cuentas le pega un `saldo` a cada cuenta para mostrarlo.
  const f = normalizar('accounts', { id: 'a', nombre: 'Galicia', tipo: 'cuenta', saldo: 823133.5 });
  assert.equal('saldo' in f, false);
  assert.equal(f.nombre, 'Galicia');
});

t('un día de cierre imposible se guarda como vacío', () => {
  const f = normalizar('accounts', { id: 'b', tipo: 'credito', cierre_dia: 509, vencimiento_dia: 1009 });
  assert.equal(f.cierre_dia, null);
  assert.equal(f.vencimiento_dia, null);
});

t('un día de cierre válido se respeta', () => {
  const f = normalizar('accounts', { id: 'c', tipo: 'credito', cierre_dia: 5, vencimiento_dia: 10 });
  assert.equal(f.cierre_dia, 5);
  assert.equal(f.vencimiento_dia, 10);
});

t('los bordes del mes son válidos, el cero no', () => {
  assert.equal(normalizar('accounts', { cierre_dia: 1 }).cierre_dia, 1);
  assert.equal(normalizar('accounts', { cierre_dia: 31 }).cierre_dia, 31);
  assert.equal(normalizar('accounts', { cierre_dia: 0 }).cierre_dia, null);
  assert.equal(normalizar('accounts', { cierre_dia: 32 }).cierre_dia, null);
});

t('un importe negativo se guarda positivo', () => {
  // La base no acepta importes negativos: una devolución es un ingreso.
  const f = normalizar('transactions', { id: 'd', monto: -461.46, tipo: 'ingreso' });
  assert.equal(f.monto, 461.46);
});

t('los ciclos del resumen sí son una columna', () => {
  const ciclos = [{ cierre: '2026-08-27', vence: '2026-09-04' }];
  assert.deepEqual(normalizar('accounts', { id: 'e', ciclos }).ciclos, ciclos);
});

t('una tabla sin lista de columnas pasa entera', () => {
  const f = normalizar('recibos', { id: 'f', cualquier_cosa: 1 });
  assert.equal(f.cualquier_cosa, 1);
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
