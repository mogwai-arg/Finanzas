// node js/frase.test.mjs
import assert from 'node:assert/strict';
import * as F from './frase.js';
import * as R from './reglas.js';

let ok = 0, mal = 0;
const t = (n, fn) => { try { fn(); console.log('  ok  ' + n); ok++; }
                       catch (e) { console.log('  FALLA  ' + n + '\n         ' + e.message); mal++; } };

console.log('\nUN RENGLÓN, UN MOVIMIENTO');

const CUENTAS = [
  { id: 'gal', nombre: 'Galicia' }, { id: 'efvo', nombre: 'Efectivo' },
  { id: 'visa', nombre: 'Galicia Visa' }, { id: 'mp', nombre: 'Mercado Pago' }
];
const HOY = new Date(2026, 8, 3);            // jueves 3 de septiembre de 2026
const leer = s => F.leerFrase(s, { cuentas: CUENTAS, hoy: HOY });

t('lo mínimo: un nombre y un número', () => {
  const r = leer('coto 47310');
  assert.equal(r.tipo, 'gasto');
  assert.equal(r.monto, 47310);
  assert.equal(r.comercio, 'Coto');
  assert.equal(r.fecha, '2026-09-03');
});

t('lucas, palos y gambas', () => {
  assert.equal(leer('nafta 45 lucas').monto, 45000);
  assert.equal(leer('alquiler 2 palos').monto, 2000000);
  assert.equal(leer('kiosco 3 gambas').monto, 300);
  assert.equal(leer('nafta 45 mil').monto, 45000);
  assert.equal(leer('sueldo 3,5 palos').monto, 3500000);
  assert.equal(leer('sueldo 3.5 millones').monto, 3500000);
});

t('los miles con punto no se leen como decimales', () => {
  // Es el error caro: '26.087,98' son veintiséis mil, no veintiséis.
  assert.equal(leer('aysa 26.087,98').monto, 26087.98);
  assert.equal(leer('coto 47.310').monto, 47310);
  assert.equal(leer('café 800').monto, 800);
});

t('la palabra multiplica al número que tiene delante, no a la frase', () => {
  // "2 palos de coto" son dos millones. Si multiplicara a cualquier número,
  // el 500 de la sucursal se volvería quinientos millones.
  assert.equal(leer('2 palos de alquiler').monto, 2000000);
});

t('ayer, anteayer y hoy', () => {
  assert.equal(leer('café 800 ayer').fecha, '2026-09-02');
  assert.equal(leer('café 800 anteayer').fecha, '2026-09-01');
  assert.equal(leer('café 800 hoy').fecha, '2026-09-03');
});

t('el lunes es el último lunes, nunca uno que no llegó', () => {
  // Nadie carga un gasto del futuro.
  assert.equal(leer('super 15 lucas el lunes').fecha, '2026-08-31');
  assert.equal(leer('super 15 lucas el jueves').fecha, '2026-08-27');
});

t('una fecha escrita, y sin año es del año que ya pasó si cae adelante', () => {
  assert.equal(leer('aysa 26000 el 15/8').fecha, '2026-08-15');
  assert.equal(leer('aysa 26000 el 15/12').fecha, '2025-12-15');
  assert.equal(leer('aysa 26000 15/8/25').fecha, '2025-08-15');
});

t('"el 15" es un día de este mes, o del anterior si todavía no llegó', () => {
  assert.equal(leer('aysa 26000 el 1').fecha, '2026-09-01');
  assert.equal(leer('aysa 26000 el 15').fecha, '2026-08-15');
});

t('la fecha no se confunde con el monto', () => {
  const r = leer('coto 47310 el 15');
  assert.equal(r.monto, 47310);
  assert.equal(r.fecha, '2026-08-15');
});

t('las cuotas tampoco', () => {
  const r = leer('zapatillas 120000 en 6 cuotas');
  assert.equal(r.monto, 120000);
  assert.equal(r.cuotas, 6);
  assert.equal(r.comercio, 'Zapatillas');
});

t('la cuenta sale del nombre, y gana el más largo', () => {
  // "galicia visa" no la puede agarrar "galicia".
  assert.equal(leer('coto 47310 con galicia').account_id, 'gal');
  assert.equal(leer('zapatillas 120000 con la galicia visa').account_id, 'visa');
  assert.equal(leer('coto 47310 con visa').account_id, 'visa');
  assert.equal(leer('feria 1200 en efectivo').account_id, 'efvo');
  assert.equal(leer('feria 1200 con efvo').account_id, 'efvo');
  assert.equal(leer('kiosco 900 con mp').account_id, 'mp');
});

t('el verbo dice si entra o sale', () => {
  assert.equal(leer('coto 47310').tipo, 'gasto');
  assert.equal(leer('cobré 3,5 palos de sueldo').tipo, 'ingreso');
  assert.equal(leer('me pagaron 50000').tipo, 'ingreso');
  assert.equal(leer('pasé 100000 a mercado pago').tipo, 'transferencia');
});

t('los dólares', () => {
  const r = leer('alquiler 850 dólares');
  assert.equal(r.moneda, 'USD');
  assert.equal(r.monto, 850);
  assert.equal(leer('wallbit usd 200').moneda, 'USD');
  assert.equal(leer('coto 47310').moneda, 'ARS');
});

t('el relleno no queda pegado al comercio', () => {
  // "\\b" de JavaScript es de la época del ASCII y no considera letra a la é,
  // así que "cobré" se colaba entero en el nombre del comercio.
  assert.equal(leer('pagué 26.087,98 de aysa').comercio, 'Aysa');
  assert.equal(leer('me salió 800 el café').comercio, 'Café');
  assert.equal(leer('gasté 1200 en el chino').comercio, 'Chino');
});

t('las mayúsculas quedan como las escribiste', () => {
  assert.equal(leer('YPF 30000').comercio, 'YPF');
  assert.equal(leer('OSDE 302006').comercio, 'OSDE');
  assert.equal(leer('coto 47310').comercio, 'Coto');
});

t('sin monto no hay movimiento: no se inventa', () => {
  assert.equal(leer('fui al super'), null);
  assert.equal(leer(''), null);
  assert.equal(leer('hola'), null);
});

t('con monto pero sin nombre, queda incompleto para poder preguntar', () => {
  const r = leer('cobré 3,5 palos');
  assert.equal(r.monto, 3500000);
  assert.equal(r.completo, false);
});

console.log('\nA QUÉ CATEGORÍA VA CADA COMERCIO');

const CATS = [{ id: 'c1', nombre: 'Supermercado' }, { id: 'c2', nombre: 'Gastronomía' },
              { id: 'c3', nombre: 'Combustible' }];

t('la regla que escribiste vos manda', () => {
  const r = R.categoriaPara('COTO CICSA 3456', {
    reglas: [{ patron: 'coto', category_id: 'c1', prioridad: 10 }], categories: CATS });
  assert.equal(r.category_id, 'c1');
  assert.equal(r.seguro, true);
});

t('y si no hay regla, lo que hiciste antes con ese mismo comercio', () => {
  const r = R.categoriaPara('Shell Gral Paz', {
    transactions: [{ comercio: 'Shell Ruta 8', category_id: 'c3' },
                   { comercio: 'SHELL 442', category_id: 'c3' }], categories: CATS });
  assert.equal(r.category_id, 'c3');
  assert.equal(r.seguro, true);
});

t('una sola vez es una pista, no una certeza', () => {
  const r = R.categoriaPara('Shell', {
    transactions: [{ comercio: 'Shell', category_id: 'c3' }], categories: CATS });
  assert.equal(r.seguro, false, 'con una sola vez hay que poder corregirlo');
});

t('y si tampoco, se adivina por el nombre y se dice que es una adivinanza', () => {
  const r = R.categoriaPara('Mostaza Rivadavia', { categories: CATS });
  assert.equal(r.category_id, 'c2');
  assert.equal(r.seguro, false);
  assert.equal(r.porQue, 'por el nombre');
});

t('lo que no se sabe se deja vacío en vez de inventar', () => {
  assert.equal(R.categoriaPara('Ferretería de Pepe', { categories: CATS }).category_id, null);
  assert.equal(R.categoriaPara('', { categories: CATS }).category_id, null);
});

t('una regla que apunta a una categoría borrada no se da por segura', () => {
  // Se puede caer en la adivinanza por nombre, que para "coto" acierta. Lo
  // que no puede pasar es que salga con la confianza de una regla escrita a
  // mano y se guarde sin preguntar.
  const r = R.categoriaPara('coto', {
    reglas: [{ patron: 'coto', category_id: 'borrada' }], categories: CATS });
  assert.equal(r.seguro, false);
  assert.equal(r.porQue, 'por el nombre');
});

t('y una historia que apunta a una categoría borrada tampoco cuenta', () => {
  const r = R.categoriaPara('Ferretería Pepe', {
    transactions: [{ comercio: 'Ferretería Pepe', category_id: 'borrada' },
                   { comercio: 'Ferretería Pepe', category_id: 'borrada' }],
    categories: CATS });
  assert.equal(r.category_id, null);
});

t('la regla se guarda por la marca, no por el nombre completo', () => {
  // "coto cicsa 3456" no vuelve a aparecer igual nunca: como patrón no
  // serviría para nada.
  assert.equal(R.comoRegla('COTO CICSA 3456', 'c1', []).patron, 'coto');
});

t('y corrige la que había en vez de sumar otra que diga lo contrario', () => {
  const vieja = [{ id: 'r1', patron: 'coto', category_id: 'c2', veces_usada: 3 }];
  const nueva = R.comoRegla('coto', 'c1', vieja);
  assert.equal(nueva.id, 'r1');
  assert.equal(nueva.category_id, 'c1');
  assert.equal(nueva.veces_usada, 4);
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
