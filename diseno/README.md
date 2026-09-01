# BISHUSHA — diseño y hoja de ruta

Estado al 01/09/2026. Segundo pase de diseño, sin implementar todavía.

- **Sistema visual completo:** [`sistema-de-diseno.html`](sistema-de-diseno.html) — abrilo en el navegador.
  Logo, tokens, ocho pantallas en claro y oscuro, auditoría del código actual y
  comparación con siete apps de referencia.
- **Tokens listos para usar:** [`../css/tokens.css`](../css/tokens.css)
- **Marca:** [`../marca/`](../marca/)

---

## Lo decidido

| Tema | Decisión | Por qué |
|---|---|---|
| Estética | iOS nativo: título grande, listas agrupadas, tipografía del sistema | Es el aparato donde la vas a usar. Jakob's law: lo que ya sabés usar |
| Color | Gris y blanco. Verde, ámbar y rojo solo con significado | Si algo tiene color, es porque hay que mirarlo |
| Acento | Índigo `#4B41D8`, ~5 % de los píxeles | Único color con personalidad. Es reemplazable por tinta sin romper nada |
| Íconos | Trazo plano de 1.85, sin emojis | Los emojis rompen el registro iOS y cambian de dibujo según el aparato |
| Tipografía | La del sistema (SF Pro), seis tamaños | Una app de plata que espera una fuente web se siente lenta antes de mostrar un número |
| Navegación | Hoy · Gastos · **+** · Tarjetas · Promos | Cuatro destinos y el alta en el centro, donde llega el pulgar |
| Monedas | Control segmentado Pesos / Dólares. No se suman | Se mantiene la decisión original: nada de conversión automática silenciosa |
| Oscuro | Paleta propia, no el claro invertido | Un índigo saturado vibra sobre negro |

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
promo_usos        -- una fila por promo y período con el reintegro acumulado.
                  -- Sin esto, "25 % de reintegro" es publicidad y no un dato.
cotizaciones      -- fecha, tipo (oficial/MEP/tarjeta) y valor, de dolarapi.com.
                  -- Un movimiento en USD guarda la cotización del día en que ocurrió.
transactions      -- + reintegro_estado: esperado / acreditado / no_llego + fecha
                  -- + updated_at (con trigger) para sincronizar por diferencia
recurrings        -- + periodicidad: mensual / bimestral / semestral / anual
                  -- (el seguro anual aporta su doceava parte al presupuesto)
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
- [ ] **Comparación en moneda constante.** Comparar pesos nominales mes a mes miente.
- [ ] **Deduplicar MODO ↔ banco.** Un pago con MODO sobre tarjeta Galicia manda dos mails; el índice único por `externo_id` no lo agarra. Hace falta match difuso por monto + fecha ±2 d + últimos 4.

### 4 — Que no la abandones
- [ ] **PIN o biometría** al abrir, y botón de ocultar montos.
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

- **El índigo.** Es la única decisión de color con personalidad. Si se prefiere una app totalmente neutra, se reemplaza por tinta.
- **Cuánto entra por mes.** Los porcentajes de "14 % de lo que entra" y el ritmo del presupuesto necesitan un ingreso de referencia: fijo, o el promedio de los últimos tres meses.
- **El logotipo** está compuesto en Archivo 800 con `letter-spacing: -0.05em`. Para producción hay que convertirlo a curvas.
