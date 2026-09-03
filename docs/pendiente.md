# Qué queda

Estado al 3 de septiembre, después de un día largo. El backlog viejo está en
`manana.md`: casi todo lo de ahí ya está hecho, y se deja como registro de
por qué se decidió cada cosa.

---

## 1. Conciliar el extracto con lo cargado a mano

Lo único que pidió el uso real y todavía no está. Hoy, al subir el resumen de
cuenta, la app dice cuántos movimientos **ya estaban cargados** y no los
repite. Falta la otra mitad, que es la que da tranquilidad:

- **Lo que está en el banco y no en la app.** Un gasto que no anotaste. Hoy
  se carga en silencio si desmarcás "solo lo que cobra el banco", pero no se
  ve como lista.
- **Lo que está en la app y NO en el banco.** El más importante y el que no
  existe: un gasto anotado dos veces, uno con el importe equivocado, o uno
  que pusiste en la cuenta que no era. El extracto es la única verdad
  disponible para detectarlo.
- **Lo que está en los dos pero con distinto importe.** Anotaste 20.000 y
  salieron 20.581.

Cómo debería verse: tres listas cortas —falta cargar, sobra, no coincide—
con la acción al lado de cada fila. Y un veredicto arriba: "de 34
movimientos del banco, 31 coinciden".

La pieza técnica ya está: el emparejado por fecha + importe existe en
`vistas/extracto.js` (`yaCargados`). Falta el recorrido inverso —sobre los
movimientos de la cuenta en ese período— y la pantalla.

Una nota: el extracto trae `PAGO TARJETA VISA` y las transferencias entre
cuentas propias, que en la app son transferencias y no gastos. El emparejado
tiene que compararlas contra transferencias, no contra gastos, o va a decir
que faltan seis movimientos que están perfectos.

## 2. Números mide 2,8 pantallas

Es la pantalla más larga y está bien que lo sea —es adonde uno va a mirar—
pero ya tiene siete secciones: entró y salió, mes a mes, en qué se fue,
presupuesto, lo que viene, lo que cobra el banco, los más grandes, y la
puerta al cierre. El presupuesto debería poder plegarse, y quizá alguna más.

## 3. Los cargos del banco podrían ser gastos fijos

El seguro de cuenta y el mantenimiento se cobran todos los meses: son gastos
fijos con todas las letras. Si se cargaran como tales entrarían en la
detección de aumentos, que es justo donde más valen —un seguro que sube 40 %
cuando el resto sube 6 % es una llamada—. Hoy quedan como gastos sueltos.

Se propondría al importar: "esto se repite todos los meses, ¿lo hago fijo?".

## 4. El aviso al teléfono de "lo que viene"

Queda afuera a propósito, y conviene que siga así hasta que haya una razón
fuerte: llevarlo al cron obliga a portar `cronograma` y `cuotasComprometidas`
a Deno, que es la parte difícil escrita por tercera vez, con la garantía de
que las tres se van separando. Dentro de la app alcanza, porque es una
decisión que se toma con el teléfono en la mano.

---

## Lo que depende de vos, no del código

- **Cargar un recibo de un mes normal.** Los dos que hay son atípicos —junio
  trae aguinaldo, agosto vacaciones— así que la proyección del sueldo estima
  en vez de calcular, y lo dice. Con uno típico se afina sola.
- **Tildar los gastos fijos con el monto real, mes a mes.** La detección de
  aumentos necesita tres meses de pagos para sacar tu propia mediana. Sin
  eso no opina, que es lo correcto, pero tampoco sirve.

## Lo que NO haría

Sigue valiendo lo de la auditoría: ninguna sexta pestaña, ni rachas, ni
medallas, ni tortas, ni pintar de verde o rojo un mes que todavía corre.
