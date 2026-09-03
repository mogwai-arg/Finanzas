// node --experimental-strip-types supabase/functions/_shared/duplicados.test.ts
import assert from 'node:assert/strict';
import { elMismo, yaEstaba, loQueSuma } from './duplicados.ts';

let ok = 0, mal = 0;
const t = (n: string, fn: () => void) => { try { fn(); console.log('  ok  ' + n); ok++; }
                                           catch (e: any) { console.log('  FALLA  ' + n + '\n         ' + e.message); mal++; } };

console.log('\nEL MISMO MOVIMIENTO POR DOS PUERTAS');

const delMail = { id: 'g1', fecha: '2026-09-02', monto: 12500, moneda: 'ARS', tipo: 'gasto',
                  fuente: 'gmail', externo_id: 'msg-abc', comercio: 'Le pagaste a COTO CICSA',
                  cuotas: 1, category_id: 'c1', revisado: true };
const deLaApi = { fecha: '2026-09-02', monto: 12500, moneda: 'ARS', tipo: 'gasto',
                  fuente: 'mercadopago', externo_id: '99887766', comercio: 'Pago QR',
                  cuotas: 3, account_id: 'mp', category_id: null };

t('el texto no se compara: el mail y la API le dicen distinto al mismo pago', () => {
  assert.equal(elMismo(delMail, deLaApi), true);
});

t('un peso de diferencia es redondeo, veinte no', () => {
  assert.equal(elMismo(delMail, { ...deLaApi, monto: 12501 }), true);
  assert.equal(elMismo(delMail, { ...deLaApi, monto: 12520 }), false);
});

t('la fecha con margen: cada puerta la fecha distinto', () => {
  assert.equal(elMismo(delMail, { ...deLaApi, fecha: '2026-09-04' }), true);
  assert.equal(elMismo(delMail, { ...deLaApi, fecha: '2026-09-20' }), false);
});

t('un gasto no es un ingreso del mismo importe', () => {
  assert.equal(elMismo(delMail, { ...deLaApi, tipo: 'ingreso' }), false);
});

t('ni pesos con dólares', () => {
  assert.equal(elMismo(delMail, { ...deLaApi, moneda: 'USD' }), false);
});

t('la cuenta solo descarta si las dos la tienen y son distintas', () => {
  // Una fila sin cuenta no contradice a nadie.
  assert.equal(elMismo({ ...delMail, account_id: null }, deLaApi), true);
  assert.equal(elMismo({ ...delMail, account_id: 'gal' }, deLaApi), false);
  assert.equal(elMismo({ ...delMail, account_id: 'mp' }, deLaApi), true);
});

t('encuentra el previo en una lista', () => {
  const otros = [{ fecha: '2026-09-02', monto: 999, moneda: 'ARS', tipo: 'gasto' }, delMail];
  assert.equal((yaEstaba(deLaApi, otros) as any)?.id, 'g1');
  assert.equal(yaEstaba({ ...deLaApi, monto: 7 }, otros), null);
});

console.log('\nQUÉ LE AGREGA LA API A LO QUE YA HABÍA');

t('completa lo que el mail no sabía', () => {
  const s = loQueSuma(delMail, deLaApi)!;
  assert.equal(s.cuotas, 3, 'MP sabe las cuotas y el mail no');
  assert.equal(s.account_id, 'mp');
  assert.equal(s.externo_id, '99887766');
});

t('pero no pisa lo que tocaste vos', () => {
  const s = loQueSuma(delMail, deLaApi)!;
  assert.ok(!('category_id' in s), 'la categoría que pusiste es tuya');
  assert.ok(!('revisado' in s), 'que ya lo hayas revisado también');
  assert.ok(!('comercio' in s), 'y el nombre que quedó no se cambia por "Pago QR"');
});

t('si no hay nada para agregar, no se toca la fila', () => {
  assert.equal(loQueSuma({ ...delMail, cuotas: 3, account_id: 'mp', externo_id: '99887766' },
                         deLaApi), null);
});

t('una compra en una cuota no le saca las cuotas a la que ya tenía', () => {
  const s = loQueSuma({ ...delMail, cuotas: 6 }, { ...deLaApi, cuotas: 1 });
  assert.ok(!s || !('cuotas' in s));
});

console.log(`\n${ok} pruebas OK${mal ? `, ${mal} FALLAN` : ''}\n`);
process.exit(mal ? 1 : 0);
