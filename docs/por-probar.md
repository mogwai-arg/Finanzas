# Lo que falta probar usándolo

Esto no se arregla escribiendo código: son cosas que solo se saben cuando pasa
en el teléfono, con datos de verdad. Cada una dice **qué mirar** y **qué haría
si sale mal**, para que la respuesta no dependa de acordarse del contexto.

Actualizado el 4 de septiembre.

---

## Cargar y dictar

**El dictado, ahora que no corta al primer silencio.**
Mirar: si `es-AR` entiende "lucas" y "palos"; qué pasa con el permiso del
micrófono la primera vez; si al hablar dos frases seguidas la segunda no llega
pegada a la primera.
Si sale mal: el reconocimiento continuo se puede volver atrás en `js/voz.js`
(`continuous: false`) sin tocar nada más.

**Las categorías creadas desde el chat.**
Mirar: si a fin de mes hay categorías que no usás.
Si sale mal: los candados están en `categoriaNueva()` de `js/correccion.js`
—hoy exige que la nombre, que parezca un nombre y que no sea un adjetivo—.
Habría que pedir confirmación en vez de crearla directo.

**Qué tanto se usa el chat contra el formulario.**
Mirar: sin más, cuál abrís. Si nunca usás el chat, el formulario es la puerta
buena y el chat sobra; si nunca usás el formulario, conviene que el botón de
cargar abra el chat.

---

## Lo que entra solo

**El pago de la tarjeta.** Es lo primero que hay que ver cuando pagues.
Mirar, en este orden: que en Gastos NO aparezca el pago entero como un gasto;
que el resumen quede pagado en Pagar y salga de "lo que se viene"; que el monto
baje en tarjetas con las cuotas futuras intactas.
Si sale mal: los tres salen de la misma fila. Ver `_shared/pagos.ts`, que es
quien decide si un movimiento es el pago de una tarjeta y a cuál.

**Mercado Pago por API.** Puede traer poco: está pensada para cobrar.
Mirar: qué aparece después de una corrida. Los rendimientos seguro que no —esos
entran pegando la lista de movimientos—.
Si trae poco o nada: no es un error, es la API. El mail sigue siendo la puerta
principal.

**Personal Pay por mail.** Es el único parser escrito sin ver un correo de
verdad, y por eso entra con confianza baja y cae en Revisar.
Mirar: si el nombre del comercio sale bien.
Si sale mal: **Ajustes → "¿No entra nada? Ver qué mails encuentro"** y mandar lo
que muestra; con el texto real se ajusta en un rato.

**Los rendimientos pegados de la lista de Mercado Pago.**
Mirar: si son ~30 filas por mes, si la fila plegada de la ficha de la cuenta
alcanza, y si lo acreditado de verdad coincide con lo estimado en "tu plata
quieta". Si no coincide, la tasa que cargaste quedó vieja.

---

## Los avisos al teléfono

Tres no salieron nunca. Cada uno tiene su día y su condición.

**El del día 10, "lo que viene".** Sale solo si un mes futuro se lleva más del
70 % de lo que entra, y solo si la foto de la proyección tiene menos de veinte
días. Si no sale y creés que debería, mirar en Números si aparece el cartel de
"la cuenta es de hace N días".

**El de topes.** Se dispara cuando una categoría cruza el 80 % y otra vez
cuando se pasa. No tiene día fijo. Es el único que se acuerda de lo que ya
dijo, así que no se repite.

**El de suscripciones.** Aparece en Pagar, una por año.
Mirar: si molesta o si sirve. Si molesta, el intervalo está en
`suscripcionesARevisar()` de `js/finance.js`.

---

## Los números nuevos

**La plata libre ahora resta lo apartado en fondos.** Es un cambio en el número
principal.
Mirar: si el número te sigue pareciendo el correcto, y si la línea "− apartado
X" se entiende sin pensarla.
Si molesta: se saca pasando `[]` como último argumento de `plataLibre()`, pero
antes vale preguntarse si el problema es el resto o el fondo mal cargado.

**Los topes heredados.** El 1 de octubre vas a ver "son los topes de
septiembre".
Mirar: si al abrir Ajustar los números propuestos son los que querés, o si cada
mes terminás cambiándolos todos —ahí la herencia no está ayudando—.

**La torta, con datos reales.** Con seis gajos parejos se lee bien.
Mirar: si con uno de 70 % y cinco de 6 % sigue diciendo algo, o si conviene
bajar el tope de gajos.

**La cotización del dólar.** Traerla anda; lo que no sabemos es si el servicio
contesta siempre.
Mirar: si alguna vez dice que no pudo. Hay dos fuentes y la segunda es
respaldo; si fallan las dos, el campo a mano sigue estando.

---

## Lo que no se pudo probar acá

**El lector de pantalla.** El script mide contraste, tamaños y etiquetas, pero
no puede escuchar a VoiceOver. Falta pasar una pantalla con VoiceOver prendido
—Hoy y Cargar alcanzan— y ver si el orden en que lee tiene sentido.

**El teléfono al sol.** Todo el contraste está medido y pasa AA, que es un piso,
no una garantía de que se lea en la calle a las dos de la tarde.
