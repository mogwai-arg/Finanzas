# Cómo se llega a cada cosa

Escrito el 3/9 después de la auditoría, porque el problema no era ninguna
pantalla sino cómo se llegaba a ellas.

## El diagnóstico

Había 13 pantallas y una sola puerta. Hoy hacía tres trabajos a la vez —
bandeja de avisos, tablero y directorio de otras seis pantallas — y por eso
medía **2,3 pantallas de alto con 36 cifras**. Las seis destinos colgaban de
Hoy como enlaces de texto de peso distinto, a alturas distintas: "Ver todo",
"Ajustar", "Cálculo estimativo →", y dos filas al fondo del todo.
Estadísticas, que es la pantalla de "dónde estoy parado", vivía detrás de un
ícono en la cabecera de Gastos: el lugar más invisible de un teléfono.

Y la barra de abajo tenía cuatro pestañas para trece pantallas. Promos —una
pantalla de antes de comprar, no de todos los días— se llevaba un quinto de
la barra, mientras que las dos preguntas más importantes ("¿qué debo?" y
"¿dónde estoy parado?") no tenían ninguna.

Encima, tres pantallas contestaban lo mismo con distinta cara: "Lo que se
viene" en Hoy, El mes y Tarjetas eran la misma lista de vencimientos. Y el
presupuesto estaba dos veces, con pie de fila distinto en cada una.

## La regla

**Una pestaña por pregunta, y ninguna pregunta sin pestaña.**

| Pestaña | La pregunta | Qué vive ahí |
|---|---|---|
| Hoy | ¿cómo voy? | lo que hay que revisar, el carrusel de los tres números, los tres vencimientos más cercanos, Bishu, y las puertas de antes de comprar |
| Gastos | ¿en qué se me fue? | el listado, con búsqueda |
| + | cargar algo | el formulario |
| Pagar | ¿qué debo? | falta pagar, resúmenes, gastos fijos, y la puerta a cada tarjeta |
| Números | ¿dónde estoy parado? | entró y salió, mes a mes, en qué se fue, presupuesto, los más grandes, y lo que entra el mes que viene |

Promos salió de la barra. Se entra por tres lados, todos contextuales: el pin
de la cabecera de Hoy, la fila de "Antes de comprar", y lo que avise Bishu.
Si algún día resulta que se abre todos los días, vuelve — pero entonces sale
otra, porque cinco es el máximo que se toca sin mirar.

## Lo que se mudó

- **Presupuesto**: estaba en Hoy *y* en Pagar. Ahora está solo en Números, en
  la versión completa (categorías, tope por tarjeta, ideal de ahorro).
- **El mes que viene** (proyección del sueldo): estaba en Hoy con una cifra de
  24px que igual le ganaba por tamaño al número del mes en curso. Se fue a
  Números.
- **Lo que se viene**: en Hoy quedan los tres primeros y el total. La lista
  completa es Pagar.
- **Tarjetas**: dejó de ser pestaña y pasó a colgar de Pagar, que es la
  pregunta que contesta.

## Dos cosas que decían lo que no era

- El **tilde** de "Lo que se viene" era un botón para pagar dibujado como un
  indicador de "hecho". Ahora dice **Pagar**.
- Números decía **"QUEDÓ ESTE MES $ 3.110.877"** en verde mientras Hoy decía
  que la plata libre era $ 1.350.971. Los dos números estaban bien y
  contestaban cosas distintas, pero la app afirmaba dos veces la misma cosa
  con 1,7 millones de diferencia. Ahora el de arriba se llama **"Entró y
  salió este mes"**, no se pinta de verde mientras el mes corre, y abajo
  aparece la plata libre con la explicación de por qué no son lo mismo.

## Antes y después, medido

| | Hoy | Pagar | Números |
|---|---|---|---|
| antes | 2,3 pantallas · 36 cifras | 2,0 · 35 | 1,8 · 16 (y escondida) |
| ahora | **1,5 · 21** | **1,4 · 20** | 2,8 · 36 (y es una pestaña) |

Números creció a propósito: es la pantalla a la que uno va *a mirar*. Hoy y
Pagar son las que uno abre de paso, y esas tienen que entrar de una ojeada.
