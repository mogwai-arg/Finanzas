# Qué queda

Estado al 4 de septiembre, después de un día largo.

---

## Hecho hoy

El presupuesto ahora se hereda del último mes que lo tenga, la cotización del
dólar se puede cargar y traer sola, y Bishu contesta ocho preguntas.

Falta de tu lado: **correr la migración 018** y **subir la función `dolar`**.

---

## Del chat

### 1. Solo se acuerda del último

Corregir el anteúltimo obliga a buscarlo en Gastos. Sería natural decir "el
café iba en efectivo" y que encuentre cuál. No es urgente: uno corrige lo que
acaba de cargar.

### 2. El dictado corta al primer silencio

`continuous: false`. Para cargar un gasto está bien; para dictar una
corrección atrás de otra, obliga a tocar el micrófono cada vez.

### 3. El hilo no sobrevive a cerrar la app

Vive en memoria. Guardar las últimas veinte burbujas en `localStorage` es
fácil; falta decidir si un historial viejo suma o es ruido.

---

## De la app

### 4. Categorías en masa para los consumos del resumen

Lo pediste vos y sigue pendiente. La mitad difícil ya está: la memoria de
comercios (`reglas.js`) se lee, se aprende y se corrige. Falta la pantalla que
la llene de a muchos: agrupar por comercio —los seis COTO de un resumen son
una fila, no seis— y elegir una categoría para todo el grupo.

Es lo que más mueve el gráfico de en qué se fue.

### 5. Los rendimientos son treinta renglones por mes

Entran bien y son ingresos, así que no ensucian los gastos. Pero en los
movimientos de la cuenta son treinta filas de doscientos pesos. Agruparlos por
mes en un solo renglón —abrible— sería mejor. Hay que verlo con un mes entero
cargado antes de decidir.

### 6. La conciliación solo se ve al importar

Si querés volver a verla hay que pegar el texto de nuevo. Podría vivir en la
ficha de la cuenta.

### 7. Los cargos del banco como fijos, solo desde el resumen

Si nunca subís un resumen, los cargos que entraron por los avisos no se
proponen nunca. Un botón en "lo que cobra el banco" de Números lo resolvería.

### 8. La foto de la proyección envejece en silencio

Si pasás veinte días sin abrir la app, el cron deja de avisar —que es
correcto— pero nadie se entera de que dejó de avisar.

---

## Lo que solo se sabe usándolo

- **El dictado en el iPhone.** Anda. Falta ver si `es-AR` le pega a "lucas" y
  "palos", y qué pasa con el permiso del micrófono la primera vez.
- **El pago de la tarjeta.** Cuando pagues: que no aparezca como gasto en
  Gastos, que el resumen quede pagado en Pagar, y que el monto baje en
  tarjetas con las cuotas futuras intactas.
- **Mercado Pago por API.** Puede que traiga poco: está pensada para cobrar.
- **Personal Pay por mail.** Es el único parser escrito sin ver un mail de
  verdad. Cuando llegue el primero, mandame lo que muestra el diagnóstico.
- **El aviso del día 10.** Todavía no salió nunca.
- **Las categorías creadas desde el chat.** Si a fin de mes hay tres que no
  usás, los candados quedaron flojos.
