// node --experimental-strip-types supabase/functions/_shared/dolar.test.ts
import assert from 'node:assert/strict';
import { leerDolar, cotizacion } from './dolar.ts';

let ok = 0, mal = 0;
const t = (n: string, fn: () => void) => { try { fn(); console.log('  ok  ' + n); ok++; }
                                           catch (e: any) { console.log('  FALLA  ' + n + '\n         ' + e.message); mal++; } };

console.log('\nLA COTIZACIÓN');

t('lee la forma de dolarapi, que es una lista', () => {
  const d = [{ casa: 'oficial', compra: 1400, venta: 1450 },
             { casa: 'blue', compra: 1480, venta: 1510 },
             { casa: 'bolsa', nombre: 'Dólar Bolsa', compra: 1495, venta: 1502 }];
  assert.deepEqual(leerDolar(d), { mep: 1502, blue: 1510 });
});

t('y la de criptoya, que es un objeto anidado', () => {
  const d = { mep: { al30: { ci: { price: 1499.5 } } }, blue: { ask: 1515 } };
  assert.deepEqual(leerDolar(d), { mep: 1499.5, blue: 1515 });
});

t('toma la venta, que es a lo que uno compra', () => {
  // Es el número con el que hay que valuar en pesos lo que tenés en dólares.
  const d = [{ casa: 'bolsa', compra: 1400, venta: 1500 }];
  assert.equal(leerDolar(d)!.mep, 1500);
});

t('si no hay venta, la compra antes que nada', () => {
  const d = [{ casa: 'mep', compra: 1400 }];
  assert.equal(leerDolar(d)!.mep, 1400);
});

t('un disparate no se devuelve: mejor nada que un total mal', () => {
  // Un dólar a cero o a un millón es un error de lectura, y con eso adentro
  // el total de tu plata se va a cualquier lado.
  assert.equal(cotizacion(0), null);
  assert.equal(cotizacion(-1500), null);
  assert.equal(cotizacion(1_000_000), null);
  assert.equal(cotizacion('no es un número'), null);
  assert.equal(cotizacion(null), null);
  assert.equal(leerDolar([{ casa: 'bolsa', venta: 0 }]), null);
});

t('sin MEP no se cae de nuevo al blue', () => {
  // Son dos cosas distintas y confundirlas cambia el total sin decirlo.
  assert.equal(leerDolar([{ casa: 'blue', venta: 1510 }]), null);
});

t('lo que no se entiende devuelve null en vez de romper', () => {
  assert.equal(leerDolar(null), null);
  assert.equal(leerDolar('hola'), null);
  assert.equal(leerDolar([]), null);
  assert.equal(leerDolar({}), null);
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
