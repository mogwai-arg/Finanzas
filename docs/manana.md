# Para mañana

Lo que quedó abierto al cerrar el 2 de septiembre, en orden de lo que
desbloquea más.

## 1. Terminar los avisos al teléfono

Está todo el código; falta configuración. El aviso de prueba dice qué falta
por nombre, así que el camino es corto:

- `VAPID_PUBLIC` **también** en Supabase → Edge Functions → Secrets. Va en la
  cabecera de cada aviso para que el servicio de push verifique la firma; que
  además esté en Cloudflare no la exime de estar del lado del servidor.
- `VAPID_PRIVATE` y `VAPID_SUBJECT` en el mismo lugar.
- Ajustes → Avisos → Prender → Mandarme uno de prueba.
- En iPhone, la app tiene que estar agregada a la pantalla de inicio.

## 2. Correr las migraciones pendientes

`013_presupuesto_por_cuenta.sql` y `014_debito_automatico.sql`, o `todo.sql`
de una. Sin la 014, el interruptor "Se debita solo" no se guarda y los gastos
fijos que caen en la tarjeta se siguen contando dos veces.

Después, revisar en cada gasto fijo la cuenta y ese interruptor: de ahí
dependen la plata libre y los débitos previstos del resumen.

## 3. Detectar aumentos de servicios, estilo TuMango

De auditar [tumango.com.ar](https://tumango.com.ar/), que negocia facturas de
internet, cable y celular y cobra 20 % del ahorro. Su negocio es la
operación —alguien discutiendo en el chat de la empresa—, y eso no se copia
con código. Pero **la detección sí**, y ahí la app tiene algo que ellos no
tienen: el historial.

El descuento de las telcos ya existe, solo está condicionado a que uno se
queje: las promos vencen a los tres o seis meses y la factura salta entre 30
y 50 %. Ese salto es visible en los datos que la app ya guarda.

La idea es un aviso más de Bishu:

> **Flow te subió 22 % en tres meses.** Venías pagando $ 38.000 en junio y
> este mes vino $ 46.400. Suele ser el fin de la promo: el precio de
> retención está entre 25 y 35 % abajo del de lista.

Y al lado, el canal y qué pedir. Las piezas que ya están: el historial de
gastos fijos, la lectura de aumentos por correo (`leerAumento` en
`_shared/parsers.ts`) y la tira de Bishu en Hoy. Lo que falta es la regla que
decide cuándo un aumento es "más de lo normal" — contra la inflación del
período, no contra cero, o no va a avisar nunca en Argentina.

## 4. Cargar un recibo de un mes normal

Los dos cargados son atípicos (junio trae aguinaldo, agosto vacaciones) y la
proyección del sueldo estima en vez de calcular. Con uno solo típico se
afina, y el aviso debajo del número deja de aparecer.

## 5. Etapa 2 del resumen por mail

Que `gmail-sync` baje el PDF del adjunto, lo lea con el mismo parser que
Importar y lo cruce con lo ya cargado: corregir lo que difiere, agregar lo
que falta y no duplicar lo que ya está.
