# Qué queda

Estado al 4 de septiembre.

---

## Lo primero: terminar de configurar

Tres cosas que dependen de vos y sin las cuales hay código que no corre:

1. **Correr `supabase/migrations/017_remunerada.sql`.** Sin eso, cargar la tasa
   de una cuenta se rechaza y queda en el cajón de cambios pendientes.
2. **Redesplegar `gmail-sync` y `mp-sync`.** Las dos cambiaron: Personal Pay,
   el pago de tarjeta como movida, los resúmenes sin adjunto, el clasificador.
3. **Cargar la tasa** de Mercado Pago, Personal Pay y Galicia en la ficha de
   cada cuenta.

---

## Dos que encontré mirando y que no estaban en ninguna lista

### 1. El presupuesto no se copia de un mes al otro

`formPresupuesto` solo lee los topes del período que estás mirando. El 1 de
octubre no vas a tener ninguno, la sección va a decir "sin topes cargados" y
la detección de excedidos —y el aviso, y el color del hero de Hoy— se apaga
sola sin avisar.

Cargarlos de nuevo cada mes es fricción que nadie sostiene. Debería proponer
los del mes anterior, con un toque para aceptarlos, y dejar cambiar los que
cambiaron.

**Es lo más urgente de todo, y tiene fecha: falta menos de un mes.**

### 2. La cotización del dólar no se puede cargar

`usd_ref` se lee en dos pantallas —"Dónde está la plata" y el hero de Hoy— y
no existe ningún lugar donde escribirla. Solo está en los datos de la demo.

O sea que ahora mismo hay dos pantallas con código que nunca corre: nunca vas
a ver "el X % de tu plata está en dólares" ni el total en pesos de lo que
tenés en dólares.

Se arregla con un campo en Ajustes. Y ya que estamos, el MEP se puede traer
solo con una función como la de las promos: cargarlo a mano una vez por
semana es de esas cosas que se dejan de hacer al mes.

---

## Del chat

### 3. No contesta preguntas

"¿Cuánto gasté este mes?" no lo entiende. Los números ya están todos
calculados en `finance.js`, así que responder seis u ocho preguntas fijas
—cuánto gasté, cuánto me queda, en qué se fue, qué se viene, cuánto tengo,
cuánto rinde— es barato.

Es lo que más lo acercaría a la sensación que buscabas de las apps por
WhatsApp: hoy es una ventanita de carga, no un asistente.

### 4. Solo se acuerda del último

Corregir el anteúltimo obliga a buscarlo en Gastos. Sería natural decir "el
café iba en efectivo" y que encuentre cuál. No es urgente: uno corrige lo que
acaba de cargar.

### 5. El dictado corta al primer silencio

`continuous: false`. Para cargar un gasto está bien; para dictar una
corrección atrás de otra, obliga a tocar el micrófono cada vez.

### 6. El hilo no sobrevive a cerrar la app

Vive en memoria. Guardar las últimas veinte burbujas en `localStorage` es
fácil; falta decidir si un historial viejo suma o es ruido.

---

## De la app

### 7. Categorías en masa para los consumos del resumen

Lo pediste vos y sigue pendiente. La mitad difícil ya está: la memoria de
comercios (`reglas.js`) se lee, se aprende y se corrige. Falta la pantalla que
la llene de a muchos: agrupar por comercio —los seis COTO de un resumen son
una fila, no seis— y elegir una categoría para todo el grupo.

Es lo que más mueve el gráfico de en qué se fue.

### 8. Los rendimientos son treinta renglones por mes

Entran bien y son ingresos, así que no ensucian los gastos. Pero en los
movimientos de la cuenta son treinta filas de doscientos pesos. Agruparlos por
mes en un solo renglón —abrible— sería mejor. Hay que verlo con un mes entero
cargado antes de decidir.

### 9. La conciliación solo se ve al importar

Si querés volver a verla hay que pegar el texto de nuevo. Podría vivir en la
ficha de la cuenta.

### 10. Los cargos del banco como fijos, solo desde el resumen

Si nunca subís un resumen, los cargos que entraron por los avisos no se
proponen nunca. Un botón en "lo que cobra el banco" de Números lo resolvería.

### 11. La foto de la proyección envejece en silencio

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
