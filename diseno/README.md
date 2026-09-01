# BISHUSHA — diseño y hoja de ruta

Estado al 01/09/2026. Cuarto pase de diseño, sin implementar todavía.

- **Sistema visual completo:** [`sistema-de-diseno.html`](sistema-de-diseno.html) — abrilo en el navegador.
  Logo, tokens, doce pantallas en claro y oscuro, el comparador de acentos con
  la decisión tomada, auditoría del código actual y comparación con diez apps.
- **Tokens listos para usar:** [`../css/tokens.css`](../css/tokens.css)
- **Marca:** [`../marca/`](../marca/)

---

## Lo decidido

| Tema | Decisión | Por qué |
|---|---|---|
| Estética | iOS nativo: título grande, listas agrupadas, tipografía del sistema | Es el aparato donde la vas a usar. Jakob's law: lo que ya sabés usar |
| Color | Gris y blanco. Verde, ámbar y rojo solo con significado | Si algo tiene color, es porque hay que mirarlo |
| Acento | **Petróleo `#0D5470`** | A 36° de tono del verde (el semántico más cercano) y a más de 155° del ámbar y del rojo. 8,3:1 sobre blanco |
| Íconos | Trazo plano de 1.85, sin emojis | Los emojis rompen el registro iOS y cambian de dibujo según el aparato |
| Tipografía | La del sistema (SF Pro), seis tamaños | Una app de plata que espera una fuente web se siente lenta antes de mostrar un número |
| Navegación | Hoy · Gastos · **+** · Tarjetas · Promos | Cuatro destinos y el alta en el centro, donde llega el pulgar |
| Monedas | Control segmentado Pesos / Dólares, ocultables con el ícono de ojo. No se suman | Se mantiene la decisión original: nada de conversión automática silenciosa |
| Oscuro | Paleta propia, no el claro invertido | Un índigo saturado vibra sobre negro |

### Presupuesto sin verde ni rojo

El dato más importante de toda la investigación: **el 67 % de la gente abandona
una app de gastos antes de los 30 días**, y una de las causas es el ciclo de
culpa. Verde cuando cumplís y rojo cuando te pasás hace que el usuario se
autodefina como "malo con la plata" y se desenganche a los dos o tres meses de
tablero rojo.

Por eso las barras de presupuesto van en **tinta para el avance y ámbar para el
exceso**, con una acción al lado — *"$ 31.000 de más · mover de Entretenimiento"* —
en vez de un veredicto. Verde y rojo quedan reservados para hechos: plata que
entró, una factura vencida. Nunca para calificar cómo gastás.

La otra causa es la que más riesgo tiene acá: **una de cada tres conexiones
bancarias pide reautorizar antes de los 90 días, y cuando se rompe el 68 %
abandona en vez de reconectar**. El permiso de Gmail de esta app, en modo prueba
de Google, se cae **cada 7 días**. Por eso el aviso de reconexión es un bloque
de primer nivel en la pantalla principal, con un botón de un tap, y no un
renglón perdido en Ajustes.

### Velocidad de ingesta

| Vía | Latencia | Estado |
|---|---|---|
| `gmail-sync` cada 30 min (hoy) | hasta 30 min | funciona |
| Gmail `users.watch()` + Cloud Pub/Sub → Edge Function | **segundos** | a implementar |
| Webhooks de Mercado Pago | instantáneo | refuerzo, el mail queda de respaldo |
| Personal Pay | solo mail | no tiene API pública |

### El permiso de Gmail: resuelto sin trámite

El permiso caducaba cada 7 días **no por falta de verificación**, sino porque la
pantalla de consentimiento está en estado *Testing*. Google además tiene una
**excepción de uso personal**: una app que no se comparte con nadie, o que usan
menos de 100 personas que conocés, queda exenta de la verificación *y de la
auditoría de seguridad*, aun pidiendo permisos restringidos como leer Gmail.

Entonces el paso es uno solo: pasar la app de **Testing a In production** en la
consola de Google Cloud. La primera vez aparece la pantalla de "Google no
verificó esta aplicación" y se entra por *Configuración avanzada → Ir a (no
seguro)*. Desde ahí el permiso no caduca más.

Si la consola frena la publicación con permisos restringidos, el plan B es
mejor que el A: **Cloudflare Email Routing con un Email Worker**. Una regla de
Gmail reenvía los avisos de Galicia, MODO, Mercado Pago y Personal Pay a una
casilla de dominio propio, y un Worker los parsea al llegar. Sin OAuth, sin
caducidad, sin verificación, y más rápido que la API. Cuesta un dominio.

El aviso de reconexión de un tap **se construye igual**: el permiso puede caerse
por otras razones, y cuando se cae, el 68 % abandona.

**Límite duro:** una PWA no puede leer las notificaciones de otras apps del
celular, ni en iOS ni en Android. "Que llegue igual que la notificación del
banco" se resuelve por el lado del mail con `watch()`, no interceptando la
notificación. La diferencia real es de segundos.

### El cierre de Galicia no cae un día fijo del mes

Sale del resumen de agosto/26, que publica seis fechas en una fila:

```
cierre 30-jul → vence 07-ago     (jueves → viernes)
cierre 27-ago → vence 04-sep     (jueves → viernes)
cierre 01-oct → vence 09-oct     (jueves → viernes)
```

Días del mes: **30, 27, 1**. Separación: **28 y 35 días**. Siempre jueves, y el
vencimiento siempre ocho días después. Un `cierre_dia` fijo da mal casi todos
los meses: con `cierre_dia = 27`, una compra del 30 de agosto se calcularía para
el 27 de septiembre, que no existe como cierre — cae el 1 de octubre.

La solución no es adivinar la regla: **cada resumen publica el ciclo que viene**.
`finance.js` ahora acepta `tarjeta.ciclos` con las fechas leídas del resumen y
las usa por encima de `cierre_dia`; cuando se acaban los ciclos conocidos
extrapola y marca el resultado como estimado (`declarado: false`), para que la
app pueda mostrar la diferencia entre un dato del banco y una cuenta propia.

Las dos tarjetas comparten exactamente el mismo ciclo, así que es del banco y
no del plástico.

### El resumen se lee entero

`js/resumen.js`, 56 pruebas sobre resúmenes reales anonimizados. Galicia emite
**dos formatos distintos para el mismo mes**: la Visa con fechas `06-06-26` y la
cuota en la misma fila, la Mastercard con fechas `30-Jul-26` y las cuotas en una
sección aparte. Trampas que las pruebas fijan:

- `MERPAGO*MELI 07/26` **no** es la cuota 7 de 26: es el nombre del comercio.
  La cuota se reconoce por la sección, no por el patrón `NN/NN`.
- En una compra en cuotas, la fecha que imprime el resumen es la de la **compra
  original**, no la del período.
- `Microsoft*Xbox G MicrosoftUSD 12,85` — el `USD` viene pegado al comercio, así
  que `\bUSD\b` no lo encuentra y el consumo entraba como pesos.
- Galicia repite el comprobante `000001` en filas distintas del mismo día: la
  clave de deduplicación necesita también el importe.
- Hay devoluciones de impuesto en negativo (`DEV.IMP. RG 5617`).

El resumen además publica **las cuotas a vencer de los próximos seis meses**,
que sirven para validar `deudaFutura` contra el propio banco.


## Lo que hay que arreglar del código actual

| Dónde | Qué pasa |
|---|---|
| `db.js · flushCola` | El `catch` hace `return`: una fila que falla congela la sincronización **para siempre** |
| `db.js · sincronizar` | `select('*')` de las 12 tablas enteras en cada arranque. No escala |
| `styles.css` | `--tx3 #6b7583` en los rótulos de sección da **4.0:1** — no pasa WCAG AA |
| `styles.css` | No hay una sola regla `:focus-visible` en toda la app |
| `styles.css · .fab` | El botón flotante tapa el último renglón de toda lista larga |
| `index.html` | Spinner sobre pantalla vacía en vez de esqueleto |

Lo que **no** se toca: `finance.js` (ciclos, vencimientos y cuotas, con 19 tests que
lo fijan) y la decisión de guardar una compra en cuotas como una sola fila.

## Cambios de modelo que piden las pantallas nuevas

```sql
recibos           -- HECHO. Ver supabase/migrations/003_recibos.sql
promo_usos        -- una fila por promo y período con el reintegro acumulado.
                  -- Sin esto, "25 % de reintegro" es publicidad y no un dato.
cotizaciones      -- fecha, tipo (oficial/MEP/tarjeta) y valor, de dolarapi.com.
                  -- Un movimiento en USD guarda la cotización del día en que ocurrió.
transactions      -- + reintegro_estado: esperado / acreditado / no_llego + fecha
                  -- + updated_at (con trigger) para sincronizar por diferencia
recurrings        -- + periodicidad: mensual / bimestral / semestral / anual
                  -- (el seguro anual aporta su doceava parte al presupuesto)
updated_at        -- HECHO, con trigger, en 003_recibos.sql
reglas            -- + condiciones compuestas: comercio + rango de monto + cuenta
```

## Hoja de ruta

### 1 — Que la app se use sola
- [ ] **Bandeja de revisión.** Mazo de tarjetas de a una con dos botones y swipe. Objetivo: seis movimientos en cuarenta segundos.
- [ ] **Cazador de recurrentes.** Si un comercio aparece tres meses seguidos con monto parecido, proponer convertirlo en gasto fijo. Mata el alta manual, que es la que nunca se hace.
- [ ] **Presupuesto propuesto.** Al tercer mes, ofrecer los topes calculados del historial en vez de pedir que los inventes.
- [ ] **Aprender de las correcciones.** Cada recategorización manual guarda una regla nueva.
- [ ] **Efectivo en dos taps.** Montos frecuentes, comercios recientes, y un "conté la billetera: hay $X" que genera el faltante.

### 2 — Lo que ninguna app de mercado puede hacer
- [ ] **¿Con qué pago?** Monto + rubro → financiación y reintegro real, con el tope ya descontado.
- [ ] **Topes de reintegro consumidos** por promo y por mes.
- [ ] **Reintegros prometidos vs. acreditados.** Avisar cuando el de agosto nunca llegó.
- [ ] **Peso de las cuotas.** Qué porcentaje de lo que entra ya está comprometido, y hasta cuándo.
- [ ] **Consumo en USD con percepciones.** Cuánto sale de verdad pagar Netflix con la Visa contra pagarlo con Wallbit.
- [ ] **Proyección de caja.** Cruzar `deudaFutura` con ingresos y recurrentes.

### 3 — Argentina
- [ ] **Cotización en vivo** desde `dolarapi.com` (gratis, sin clave).
- [x] **Ingreso aprendido, no cargado.** `js/sueldo.js` con 37 pruebas: ritmo de paritaria, proyección, aguinaldo y calendario de cobros. Falta la pantalla.
- [ ] **Dónde está la plata.** Saldo por lugar — Galicia, Mercado Pago, Personal Pay, efectivo, Wallbit, billete — porque con seis lugares el total no te dice si podés pagar algo mañana.
- [ ] **Gmail `users.watch()` + Pub/Sub** para bajar la ingesta de 30 minutos a segundos.
- [ ] **Aviso de reconexión** de primer nivel cuando Google corta el permiso.
- [ ] **Comparación en moneda constante.** Comparar pesos nominales mes a mes miente.
- [ ] **Deduplicar MODO ↔ banco.** Un pago con MODO sobre tarjeta Galicia manda dos mails; el índice único por `externo_id` no lo agarra. Hace falta match difuso por monto + fecha ±2 d + últimos 4.

### 4 — Que no la abandones
- [x] **Ocultar montos con el ícono de ojo** — diseñado. Se tapan los números, no la interfaz.
- [ ] **PIN o biometría** al abrir.
- [ ] **Buscador y filtros combinados** en Gastos.
- [ ] **Widget de pantalla de inicio** con el número del mes.
- [ ] **Exportar a CSV** además del JSON que ya está.

---

## Qué se le tomó a la competencia

Las siete apps de referencia son de Estados Unidos y ninguna sabe qué es una
cuota, un cierre de tarjeta o un tope de reintegro. Ahí está el valor de que
esta app sea propia. Lo que sí tienen resuelto es el trabajo aburrido:

- **PocketGuard** → un solo número de "libre para gastar". Acá es el `$/día`.
- **Emma / PocketGuard** → detección automática de suscripciones → el cazador de recurrentes.
- **Simplifi** → presupuesto armado desde el historial → configuración inicial cero.
- **YNAB** → "gastos verdaderos": prorratear lo anual para que no explote en marzo.
- **Copilot** → motor de reglas granular y aprender de las correcciones.
- **Monarch / Origin** → nada: colaboración de pareja, Plaid e impuestos de EEUU no aplican.

## Pendiente de definir

- **Publicar la app en Google Cloud** (Testing → In production). Paso a paso en [`../docs/google-oauth.md`](../docs/google-oauth.md).

- **Cuánto entra por mes.** Los porcentajes de "14 % de lo que entra" y el ritmo del presupuesto necesitan un ingreso de referencia: fijo, o el promedio de los últimos tres meses.
- **El logotipo** está compuesto en Archivo 800 con `letter-spacing: -0.05em`. Para producción hay que convertirlo a curvas.
