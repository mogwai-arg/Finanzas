# Qué queda

Estado al 4 de septiembre. El backlog viejo está en `manana.md`.

---

## Lo primero: mirar el pago de la tarjeta

Cuando pagues el resumen, hay que verificar tres cosas y en este orden:

1. **Que entre como movida y no como gasto.** Se ve en Gastos: si aparece el
   pago entero como un gasto más, el mes está inflado.
2. **Que el resumen quede pagado** en Pagar, y que salga de "lo que se viene".
3. **Que el monto de la tarjeta baje** en la sección de tarjetas, y que las
   cuotas futuras sigan ahí.

El código está y probado, pero es la primera vez que entra un pago de verdad
por esa puerta. Los tres derivan de lo mismo: si la fila entró bien, los tres
salen bien.

---

## Del chat

### 1. Solo se acuerda del último

"Ay, la pagué con efectivo" corrige el último movimiento. Si querés corregir
el anteúltimo hay que buscarlo en Gastos. Sería natural decir "el café iba en
efectivo" y que encuentre cuál.

No es urgente: uno corrige lo que acaba de cargar.

### 2. Solo carga gastos e ingresos sueltos

No sabe cargar un gasto fijo ("el alquiler es de 850 dólares todos los 5"), ni
una promo, ni marcar un resumen como pagado. Todo eso es cargable a mano y son
pantallas que ya existen; la pregunta es si vale la pena que también entren
por el chat.

### 3. No contesta preguntas

"¿Cuánto gasté este mes?" no lo entiende. Los números ya están todos
calculados en `finance.js`, así que responder cinco o seis preguntas fijas
—cuánto gasté, cuánto me queda, en qué se fue, qué se viene, cuánto tengo— es
barato y haría que el chat se sienta menos una ventanita de carga.

Es lo que más lo acercaría a la sensación de las apps por WhatsApp.

### 4. El dictado corta al primer silencio

`continuous: false`: dice una frase y para. Para cargar un gasto está bien.
Para dictar una corrección atrás de otra, obliga a tocar el micrófono cada vez.

### 5. El hilo no sobrevive a cerrar la app

Vive en memoria. Si cerrás y volvés, arranca de cero. Guardarlo sería fácil
—las últimas veinte burbujas en `localStorage`— pero hay que decidir si un
historial viejo suma o es ruido.

---

## De la app

### 6. Categorías en masa para los consumos del resumen

Lo pediste vos y sigue pendiente. Ahora está la mitad difícil: la memoria de
comercios (`reglas.js`) ya existe, se lee y se aprende. Falta la pantalla que
la llene de a muchos: agrupar por comercio —los seis COTO de un resumen son
una fila, no seis— y elegir una categoría para todo el grupo.

Es lo que más mueve el gráfico de en qué se fue.

### 7. La conciliación solo se ve al importar

`conciliar()` corre cuando subís el resumen y nada más. Si querés volver a
verla —"¿me faltaba algo de agosto?"— hay que volver a pegar el texto.
Podría vivir en la ficha de la cuenta.

### 8. Los cargos del banco como gastos fijos, solo desde el resumen

La propuesta sale al importar. Si nunca subís un resumen, los cargos que
entraron por los avisos no se proponen nunca. Un botón en "lo que cobra el
banco" de Números lo resolvería, y es donde uno los está mirando.

### 9. La foto de la proyección envejece en silencio

`js/proyeccion.js` la guarda al abrir la app. Si pasás veinte días sin abrirla,
el cron deja de avisar —que es lo correcto— pero nadie se entera de que dejó
de avisar.

---

## Lo que hay que mirar en el uso, no en el código

- **El dictado en el iPhone.** Anda, dijiste. Falta ver qué pasa con el
  permiso del micrófono la primera vez y si `es-AR` le pega a "lucas" y
  "palos".
- **Mercado Pago.** Puede que conecte bien y entre poco: la API está pensada
  para cobrar. Ver qué trae de verdad antes de decidir si vale la pena.
- **El aviso del día 10.** Es el único que todavía no salió nunca.
- **Las categorías creadas desde el chat.** Si a fin de mes hay tres que no
  usás, los candados están flojos.
