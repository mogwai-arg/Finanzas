# Para mañana

Lo que quedó abierto al cerrar el 2 de septiembre, en orden de lo que
desbloquea más.

## 1. Terminar los avisos al teléfono

Está todo el código; falta configuración. **"Mandarme uno de prueba" ahora
abre un diagnóstico**, no un cartelito: contesta las seis cosas que pueden
estar fallando, una por una, y hasta ahora todas se veían igual desde afuera.

- si VAPID_PUBLIC, VAPID_PRIVATE y VAPID_SUBJECT están en Supabase;
- si la pública y la privada son **el mismo par** (se comprueba firmando algo
  con una y verificándolo con la otra: si el par se generó dos veces, puede
  haber quedado la pública de una y la privada de la otra, y el aviso sale
  firmado igual pero nadie lo acepta);
- si la clave que tiene el navegador —la de Cloudflare— es la misma que la
  del servidor —la de Supabase—, que es el error más silencioso de todos;
- si este teléfono está suscripto;
- y **qué contestó el servicio de push**, con el código. Antes un `try/catch`
  se lo tragaba: un 401 o un 403 de FCM se veía igual que "no hay teléfonos".

Para que eso ande hay que volver a pegar `cron-avisos` en Supabase (está en
`supabase/para-pegar/cron-avisos.ts`).

El resto sigue igual:

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

## 3. Detectar aumentos de servicios, estilo TuMango — HECHO (3/9)

Está en Pagar ("Subió más que el resto"), en la tira de Bishu y como aviso al
teléfono el día 5. La regla quedó así, y es lo único que la hace servible:

**se compara contra la mediana de tus PROPIOS aumentos, no contra cero ni
contra un índice.** Si todos tus fijos subieron 6 % y uno subió 22 %, ese uno
no es la inflación. Con menos de tres fijos pagados en los dos extremos no
alcanza para sacar la mediana y el aviso no sale: no opinar es mejor que
opinar con un supuesto. Y el orden es por PLATA, no por porcentaje: 40 % de
una suscripción de 9.000 no es un problema, 18 % del internet sí.

Lo que sigue abajo es el análisis original.

### El análisis

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

## 5. Etapa 2 del resumen por mail — HECHO (3/9)

`gmail-sync` busca los correos con PDF adjunto que parecen un resumen y anota
uno por resumen, no uno por corrida. En Hoy aparece un cartel —"Llegó tu
resumen de Galicia Visa"— y con un toque la app baja el adjunto y lo abre.

La decisión que ahorró la mitad del trabajo: **el PDF se lee en el teléfono,
no en el servidor.** El parser ya existe y está probado, la conciliación
—completar lo anotado a mano, agregar lo que falta, no duplicar— ya la hace
la pantalla de Importar, y así hay un solo camino y no dos. De paso, la clave
del PDF —que suele ser el DNI— no tiene por qué salir del teléfono.

Y ahora los PDF con contraseña se abren: antes eran el final del camino
("copialo a mano"). La clave se pide una vez y queda en ese teléfono, en
localStorage, nunca en la base.


---

# Después de la auditoría (3 de septiembre)

La reestructuración de la navegación ya está hecha (ver `navegacion.md`).
Esto es lo que quedó anotado mirando las once pantallas con el navegador.

## Arreglos: cosas que todavía confunden o mienten

Ordenados por cuánto molestan en el uso diario.

1. **En Gastos, el subtítulo de cada fila se corta siempre.** Dice
   "Coto · Supermercado · Merca…": el comercio ya está en el título y se
   repite abajo, y el medio de pago —que es lo único que no está en otro
   lado— es justo lo que queda cortado. Categoría y medio de pago, y el
   medio de pago como píldora, no como texto.
2. **Gastos no dice cuánto gastaste.** Es la pestaña de "¿en qué se me fue?"
   y no tiene total del mes. Encima el encabezado de día muestra un neto que
   mezcla sueldo con gastos: "MARTES 1 · + $ 3.110.877" es un día que da
   positivo porque cobraste.
3. **Gastos no separa meses.** La lista va MARTES 1, LUNES 31, DOMINGO 30,
   22 AGO, 10 AGO: se pasa de septiembre a agosto sin aviso, y con dos
   formatos de fecha distintos.
4. **"Sin revisar" está en dos lugares con dos formas.** El cartel de Hoy
   cuenta seis; en Gastos aparece como un enlace chiquito debajo del monto,
   compitiendo con la cifra. O es una bandeja o es una marca en la fila, no
   las dos cosas.
5. **La campanita de cada promo no dice si está prendida.** Es el mismo
   problema que tenía el tilde de "Lo que se viene": un ícono sin estado. Se
   arregla igual, con la palabra.
6. **El tope de cada promo dice siempre $ 0 de $ 15.000.** Nada conecta un
   gasto con una promo, así que la barra no se mueve nunca. O se conecta
   (marcar el gasto como hecho con esa promo) o se saca la barra: una barra
   que nunca avanza enseña a no mirarla.
7. **Muchos gastos siguen con el ícono de tres puntitos.** Frávega, Melo,
   Old Bridge, Naked, Aysa. Falta ampliar el reconocimiento por comercio.
8. **Números mide 2,8 pantallas.** Está bien que sea la más larga —es adonde
   uno va a mirar— pero el presupuesto debería poder plegarse.

## Features nuevas, por lo que cambian la conducta

### 1. Cerrar el mes

Lo que más falta. El día 1, un resumen de cómo cerró el mes anterior: cuánto
entró, cuánto salió, qué categoría se pasó, si llegaste al ahorro, y qué
propone Bishu para el que arranca.

Una app de plata se abandona porque nunca te devuelve nada: cargás todos los
días y no pasa nada. El cierre del mes es lo único que convierte la carga
diaria en algo que rinde, y es el momento en que un número del mes en curso
por fin se puede pintar de verde sin mentir.

### 2. Que el gasto entre solo desde el aviso del banco

`gmail-sync` ya lee correos. El resto de la carga a mano se va si la app lee
también los "Compraste $ X en Y" y los deja en Revisar. Menos fricción para
cargar es lo que decide si la app sigue viva en tres meses.

### 3. El aviso de "esto te va a doler el mes que viene"

Cuando una compra en cuotas empuja el resumen del mes que viene por encima
de lo que suele entrar. Es el aviso que ninguna app da y es exactamente el
problema que planteaste: que la plata salga en el mismo mes en que se gasta.
Los datos ya están (`cuotasComprometidas`, `comprometidoEnPeriodo`, la
proyección del sueldo); falta la regla y el aviso.

### 4. Simulador de compra con respuesta corta

"¿Con qué pago?" hoy es una calculadora. Lo que sirve es una sola línea: "en
6 cuotas, tu plata libre queda así de acá a marzo". Una respuesta, no una
tabla comparativa.

### 5. Presupuesto que se propone solo

Definir topes desde cero es la tarea que nadie hace. El día 1: "el mes pasado
gastaste $ X en supermercado, ¿pongo ese tope?". Con tres categorías alcanza
para arrancar.

### 6. Bishu con memoria

Hoy elige una frase de una lista ordenada por urgencia. Lo que lo haría
inteligente no son más frases: es que sepa qué te dijo la semana pasada y si
le hiciste caso. "La semana pasada te pasaste en combustible; esta venís
mejor" es otra cosa que "combustible se pasó $ 12.000 del tope".

## Lo que NO haría

Anotado porque la tentación va a volver:

- **Una sexta pestaña.** Cinco es lo que se toca sin mirar. Si entra algo,
  sale algo.
- **Rachas, medallas y metas con festejo.** En una app de plata, la racha
  rota se lee como culpa, y la culpa es la razón número uno por la que se
  abandonan. Bishu alienta; no premia ni reta.
- **Tortas.** Ya está resuelto con barras ordenadas.
- **Más tipos de aviso** hasta que los push lleguen al teléfono. Un menú con
  ocho interruptores que no hacen nada es peor que no tenerlo.
- **Pintar de verde o rojo el mes en curso.** Con el sueldo adentro el día 1
  y los gastos sin hacer, cualquier color miente hasta fin de mes.

---

## Resumen de CUENTA del banco (3/9)

Otro documento que el de tarjeta, y sirve para otra cosa. Adentro están los
gastos hormiga que no manda ningún aviso y que nadie carga a mano:
mantenimiento de cuenta, seguros que se renuevan solos, el impuesto al débito
y al crédito, retenciones de ingresos brutos, sellados. Cada uno chico, todos
los meses, y sin este documento no existen para la app.

El banco avisa por mail que está, pero **no lo adjunta**: hay que bajarlo de
su app. Ese es el único paso del camino que no se puede automatizar, así que
el cartel de Hoy dice exactamente eso y no promete lo que no puede.

### Cómo se lee sin adivinar

Cada banco arma las columnas distinto y el PDF las pierde: no se sabe cuál
número es débito y cuál crédito. La salida es el **saldo**: cada fila trae el
saldo después del movimiento, y la diferencia contra el anterior da el signo
sin ambigüedad. Cuando el importe de la fila coincide con esa diferencia, el
signo es un hecho y queda marcado como tal; cuando la fila no trae saldo se
cae en el texto y se deja anotado que fue una inferencia.

Y se comprueba que el extracto **cuadre de punta a punta**: si la suma de los
movimientos no lleva del saldo inicial al final, faltó una hoja. Sin eso,
faltar una hoja se ve igual que un mes barato.

### Lo que queda pendiente acá

- Probar el parser contra un extracto de Galicia de verdad. Está escrito
  tolerante y probado contra un formato reconstruido, pero el primero real
  seguro trae algo que no previmos: si no lo reconoce, pegar el texto y
  ajustar las expresiones.
- Los seguros y las comisiones que aparecen podrían proponerse como gastos
  fijos, para que entren en la detección de aumentos.

---

## Migración pendiente

`015_bishu_memoria.sql` — una columna `bishu jsonb` en `settings`. Sin ella,
Bishu vuelve a empezar de cero cada vez: la escritura se rechaza y el cambio
queda en el cajón de fallidas (que ahora avisa en Hoy, así que se nota).
