# Qué queda

Estado al 3 de septiembre. El backlog viejo está en `manana.md`: casi todo lo
de ahí ya está hecho, y se deja como registro de por qué se decidió cada cosa.

Los cuatro puntos que estaban acá (conciliar el extracto, plegar Números, los
cargos del banco como gastos fijos, y el aviso de "lo que viene") están
hechos. Lo que sigue es lo que apareció haciéndolos.

---

## Antes de nada: correr la migración 016

`supabase/migrations/016_proyeccion.sql` agrega una columna a `settings`.
Hasta que no se corra, la app va a intentar guardar la proyección y la base la
va a rechazar —se ve en el cajón de cambios pendientes— y el aviso del día 10
no va a salir nunca.

## 1. Categorías en masa para los consumos del resumen

Lo pediste vos: los consumos de tarjeta cargados por resumen entran sin
categoría, y el gráfico de "en qué se fue" queda con un pozo grande. Hoy hay
que abrir uno por uno.

Lo que haría falta es una pantalla de "poner categorías" que agrupe por
comercio —los seis COTO de un resumen son una fila, no seis— y que se acuerde:
la próxima vez que aparezca COTO, va sola a Supermercado. Esa memoria ya
existe a medias en `reglas`; falta la pantalla que la llene sin fricción.

Es lo que más mueve el gráfico de categorías, y encima mejora el matcheo
futuro.

## 2. La conciliación solo se ve al importar

`conciliar()` corre cuando subís el resumen y nada más. Si querés volver a
verla —"¿me faltaba algo de agosto?"— hay que volver a pegar el texto. El
extracto ya se guarda como movimientos; lo que no se guarda es el resultado
del cotejo.

Podría vivir en la ficha de la cuenta, con lo último que se cotejó.

## 3. Los cargos del banco ya son gastos fijos, pero solo desde el resumen

La propuesta sale al importar. Si nunca subís un resumen, los cargos que
entraron por los avisos del banco no se proponen nunca. Un botón en "lo que
cobra el banco" de Números resolvería eso, y es donde uno los está mirando.

## 4. La foto de la proyección envejece en silencio

`js/proyeccion.js` la guarda al abrir la app. Si pasás veinte días sin abrirla,
el cron deja de avisar —que es lo correcto— pero nadie se entera de que dejó
de avisar. No es urgente: veinte días sin abrir la app es un problema más
grande que el aviso.

## 5. Lo de siempre

- El aviso de "lo que viene" sale último de la lista y al teléfono van dos: si
  el día 10 hay dos avisos antes, no llega. Es el orden correcto —lo que tiene
  multa va primero— pero conviene mirarlo después de un mes de uso.
- `avisos.ts` y `finance.js` tienen la misma lógica escrita dos veces, a
  propósito. La proyección se resolvió al revés —la calcula el navegador y el
  servidor la lee— para no escribir la parte difícil por tercera vez. Si
  aparece otro aviso que necesite cuotas, ese es el camino.
