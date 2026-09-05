# La auditoría, del 4 de septiembre

Antes del cierre: una pasada completa por la app con todo lo que hay para
mirarla —experiencia, interfaz, crítica de diseño, accesibilidad, revisión de
código y de seguridad—. Está acá para no volver a discutir desde cero lo que
ya se decidió, y para que lo que quedó abierto no se olvide.

Se miraron las nueve pantallas en claro y en oscuro sobre un iPhone de 390 px,
más el código, las migraciones, las funciones del servidor y el service
worker.

**Se arreglaron 13 cosas.** Ninguna era una idea nueva: todas son de leer la
app como la lee alguien que la usa.

---

## Lo que estaba mal y ya está arreglado

### La cuenta remunerada tapaba la app

Acredita todos los días. En la pantalla de la cuenta ya se plegaban, pero en
**la lista de Gastos —la que se mira todos los días— no**: septiembre tenía 24
filas y 12 eran rendimientos de doscientos pesos, uno entre cada movimiento de
verdad. La lista medía un tercio más de lo necesario.

Lo mismo en **la hoja de "de dónde sale"**, que es peor: esa hoja existe para
poder verificar un número, y doce renglones de $ 200 no se verifican de a uno.
Ahora la hoja entera —tres ingresos y seis categorías— entra en una pantalla.

De paso: las tres pantallas que reconocían un rendimiento tenían **su propia
lista de palabras**, y no la misma. Una entendía "intereses" y la otra no, así
que el mismo movimiento se plegaba en un lado y en el otro no. Quedó una sola.

### Los nombres se cortaban justo donde importa

Un solo renglón con puntos suspensivos: `SEGURO BOLSO PROTEGI…`, `COMISION
MANTENIMIEN…`, `pagaste $ 26.087,98 · debés $ 0…`. Lo que se perdía era el
dato. Dos renglones y después sí, puntos. Los nombres cortos no cambian.

### La torta y las barras no se hablaban

Son **las mismas categorías, una arriba de la otra**:

- El porcentaje estaba escrito dos veces —"Supermercado 28 %" en la torta y
  "28 % de lo que gastaste" tres centímetros más abajo—.
- Los colores no coincidían: cinco colores arriba, todo azul abajo. Para
  seguir una categoría de un gráfico al otro había que volver a leer los
  nombres.

Ahora el color se reparte una sola vez y lo usan los dos. Sacar la línea
repetida dejó las filas en 34 px de alto, por debajo del mínimo para tocar con
el pulgar: van con 44 fijos.

### El número grande no se llamaba como lo que era

Decía **"Entró y salió este mes"** y abajo había una sola cifra: la resta. No
había forma de saber si era lo que entró, lo que salió o la diferencia. Ahora
dice "Lo que quedó este mes", o "Lo que va quedando" si el mes no terminó.

### Cuatro botones oscuros gritando lo mismo

El primero de mes se juntan cuatro avisos en Hoy —llegó el resumen de la
tarjeta, está el de la cuenta, cerró el mes, hay movimientos sin revisar—.
Cada uno se escribió por su lado y cada uno trae su botón lleno, así que
ninguno se leía como el primero, y el número quedaba abajo de todo eso.

El orden en el que están escritos ya era la prioridad. Ahora el lleno se lo
queda el primero que esté vivo y los demás pasan a un escalón nuevo,
`.btn.linea`: contorno con el color de la marca. Ese escalón no existía —había
"el importante" y "el gris"— y sin él dejar "Subirlo" en gris al lado de
"Después" cambiaba un problema por el opuesto: ya no compite con nada, pero
tampoco se distingue cuál de los dos hace algo.

### El resumen de Mercado Pago salía todo mal

Es el primero que se subió de verdad y rompió cuatro cosas a la vez: los
nombres corridos un lugar (el gasto más grande del mes se llamaba "Alberdi"),
el saldo inicial igual al final, "no cuadra" sobre un extracto leído entero, y
cinco filas marcadas como faltantes estando todas.

Y la conciliación emparejaba por **tipo**, que es una lectura del texto: una
transferencia entre cuentas propias llega como "Transferencia recibida NOMBRE
APELLIDO" y no dice en ningún lado que sea propia. Buscada entre los ingresos
no aparecía, y **un movimiento bien cargado daba dos errores**: uno que falta y
otro que sobra. Ahora, si por tipo no aparece, se busca por dirección: o el
saldo subió, o bajó, y en eso el banco y la app no pueden discrepar.

### Seguridad: los tokens estaban en el teléfono

La sincronización bajaba `integrations` con `select('*')`, y esa tabla guarda
el `access_token` y el `refresh_token` de Gmail y de Mercado Pago. Viajaban al
navegador y quedaban escritos en `localStorage`, **en texto plano y hasta que
alguien borrara los datos del sitio**. La pantalla solo necesita saber si está
conectada, con qué cuenta y si dio error. Ahora baja solo eso, y la cache se
limpia al guardar y al leer, para la instalación que ya los tiene adentro.

### Seguridad: el nonce de OAuth no vencía

`oauth-start` barre los viejos, pero solo cuando se empieza **otra** conexión.
Si no se empieza ninguna, el nonce queda válido para siempre y un link de
vuelta filtrado hace meses todavía sirve. Encima el mensaje de error decía "el
permiso caducó", que era mentira. Ahora se comprueba al canjearlo.

### Una copia que no se podía restaurar

`importarJSON` estaba escrita en `db.js` desde el principio **y no la llamaba
nadie**. Se podía exportar todo a un archivo y no había ninguna forma de volver
a subirlo. Ahora está al lado de "Exportar todo", y antes de tocar nada dice
qué trae: restaurar 1.482 movimientos es una decisión distinta de restaurar 3.

### El foco se escapaba de las hojas, en el teléfono

La hoja atrapa el foco comparando contra su primer y su último elemento. En
pantalla grande enfoca el primer campo al abrir, así que funciona. **En el
teléfono no enfoca nada** —abriría el teclado y taparía media hoja—, así que el
foco se queda en el botón que la abrió, que está afuera: ninguna comparación da
nunca y el Tab se va tranquilo a lo que hay detrás. Justo la pantalla donde se
usa. Ahora la hoja se enfoca a sí misma, sin teclado y con el lector anunciando
el diálogo.

### Sin señal faltaban 20 archivos

La lista del service worker estaba escrita a mano y se atrasó sola: le faltaban
todas las pantallas nuevas —fondos y deudas, categorizar de a muchos, la ficha
de una cuenta, importar un extracto—. Con señal se ve igual, porque se bajan
igual; el día que no hay, esa pantalla no abre y no hay forma de saber por qué.
Ahora la arma `build-web.mjs` mirando los archivos que existen: 53 en vez de 33.

---

## Lo que se miró y está bien

No todo lo revisado tenía algo roto. Queda anotado para no volver a mirarlo.

| Qué | Cómo quedó |
|---|---|
| **RLS en la base** | Todas las tablas con `enable row level security` y política `user_id = auth.uid()`. `oauth_pendientes` sin políticas a propósito y comentado: solo entra la service role. |
| **XSS** | Un solo `innerHTML` en toda la app (`ui.js`, detrás de una clave `html` explícita) y ningún uso. Todo el texto entra por `textContent`. |
| **La anon key** | Pública por diseño, lo que protege es RLS. La service role no aparece en ningún lado del cliente ni del repositorio. |
| **La clave privada de los avisos** | Se genera en el navegador, se muestra una vez y no se guarda. El diagnóstico devuelve si está o no, nunca el valor. |
| **`?claves=1` sin sesión** | El GET no comprueba sesión, pero devuelve un par **nuevo y al azar**: no revela nada ni cambia nada. Y Supabase rechaza el pedido sin `Authorization` antes de que la función corra. |
| **Redirección abierta** | El destino sale de `APP_URL`, nunca de la URL que llega. |
| **CSRF en OAuth** | `state` es un número de un solo uso, se resuelve en el servidor y se borra al canjearlo. |
| **La copia exportada** | No lleva `integrations`, así que el archivo no tiene tokens adentro. |
| **Foco visible** | 2 px de contorno sólido en todo lo que se puede tabular. |
| **Escape y volver el foco** | La hoja cierra con Escape y devuelve el foco al botón que la abrió. |
| **Contraste, toque, nombres y etiquetas** | `npm run a11y`, nueve pantallas por dos apariencias: cero. |
| **Lo que se toca pero no es un botón** | Quinta medida del script, agregada después: un `div` con `onclick` anda con el dedo y no existe para el teclado ni para el lector. Encontró la tarjeta de la pantalla de tarjetas —se tocaba desde el primer día y nunca fue alcanzable con Tab— y un `cursor:pointer` que prometía un click que no pasaba. Cero. |
| **El service worker** | Versión estampada por deploy y borrado de las caches viejas: no puede quedar sirviendo JS viejo. Nunca guarda una respuesta redirigida, y guarda de a uno para que un archivo que falte no tire abajo la instalación. |

---

## Lo que quedó abierto

Nada de esto bloquea el uso. Está en orden de lo que más rinde.

1. **VoiceOver a mano.** El script mide contraste, tamaños y etiquetas, pero no
   puede escuchar. Falta pasar Hoy y Cargar con VoiceOver prendido y ver si el
   orden en que lee tiene sentido. Es lo único de accesibilidad que queda.

2. **El centro de la torta puede leerse mal.** Dice "28 % Supermercado" cuando
   arriba de la leyenda está "Sin categoría 34 %". Es a propósito —poner "sin
   categoría" de titular no dice en qué se fue la plata— pero un ojo rápido lee
   el centro como "la más grande". Se resuelve solo el día que quede poco sin
   categorizar; si no, hay que escribirle un rótulo y el espacio es de 82 px.

3. **Los decimales no son consistentes.** En la misma lista conviven
   `$ 20.581,06` y `$ 8.999`: lo importado del banco trae centavos y lo cargado
   a mano no. No está mal —son los números de verdad— pero la columna no
   alinea. Conviene mirarlo con dos o tres meses cargados antes de decidir si
   se redondea la vista.

4. **Las barras de cuotas comprometidas no dicen cuánto.** Doce meses de
   barritas donde solo octubre se distingue; las otras once son casi iguales y
   no hay número. Se tocan para verlo, pero no se ve que se puedan tocar.

5. **Las filas de fondos no tienen chevrón y las de deudas sí.** Si las dos se
   abren, la señal tiene que ser la misma.

Y sigue lo de siempre, en [`por-probar.md`](por-probar.md): esto se termina de
auditar usándolo. Un mes de uso encuentra cosas que ninguna lectura encuentra
—la lista tapada de rendimientos apareció así, no leyendo el código—.
