# Las promos, y cómo pedir el relevamiento

El listado de promos vigentes lo arma otra sesión una vez por semana y llega
como un `INSERT` largo. Esto es lo que la app hace con ese archivo, lo que la
tabla acepta, y —al final— **el pedido para mandarle a quien lo escribe**, que
se puede copiar tal cual.

## Cómo se corre

1. Una sola vez: `supabase/migrations/022_promos_unicas.sql`.
2. Cada semana: abrir el archivo del relevamiento, reemplazar `<TU_USER_ID>`
   por el uuid del usuario y pegarlo en el SQL Editor.

Nada más. **No hay que borrar nada antes**, y correr dos veces el mismo
archivo deja la base igual que correrlo una.

El de esta semana está en
[`supabase/promos_2026-09-07.sql`](../supabase/promos_2026-09-07.sql): 53
promos, 27 de MODO y 26 del canal Galicia.

## Por qué no se borra

Lo que se venía haciendo era `DELETE` de todas las promos y volver a
insertarlas. Eso se lleva puesto dos cosas que no salieron del relevamiento:

- **Las que están marcadas como preferidas o con aviso.** Son decisiones de la
  persona, no dato del scraper.
- **Las cargadas a mano desde la app**, que no vuelven en ningún archivo.

Ahora el archivo hace `on conflict (user_id, titulo) do update`: la promo que
ya estaba se actualiza en su lugar y **conserva su id, su `favorita` y su
`recordar`**. La que dejó de estar en el relevamiento se apaga
(`activa = false`), no se borra, así el historial de usos no queda apuntando a
una fila que no existe.

El corte es por `updated_at`: el archivo anota `now()` al empezar y apaga todo
lo del relevamiento que no haya tocado. Y "lo del relevamiento" es por
dominio (`modo.com.ar`, `beneficios.galicia.ar`), no por "tiene un link": una
promo propia con el link pegado no se apaga.

**Por eso el título es la llave y tiene que ser estable de una semana a la
otra.** Si "20% en Jumbo" pasa a llamarse "Jumbo 20% de reintegro", la base no
las reconoce como la misma: inserta una nueva y apaga la vieja, perdiéndole el
aviso.

## Lo que la base NO perdona

`public.promos` tiene dos `check` y una fila que los viola **se rechaza
entera**:

| Columna | Valores válidos |
|---|---|
| `tipo` | `reintegro` · `descuento` · `cuotas` |
| `canal` | `presencial` · `online` · **`ambos`** |

`ambos` es el nombre que usa la app para "presencial y online". Un
`presencial_online` no entra.

## Lo que entra pero se pierde

`rubro` y `emisor` no tienen `check`, así que cualquier texto se guarda. El
problema aparece después: la ficha de la promo tiene un desplegable con la
lista fija, y un valor que no está en ella no puede quedar seleccionado.
(La app ahora lo agrega al final del desplegable en vez de pisarlo en
silencio, pero queda un rubro suelto que no agrupa con nada.)

**`rubro`** — lo único que existe:

    supermercado · combustible · gastronomia · salud · indumentaria · hogar · otros

No hay `farmacia` (es **`salud`**), ni `electro` (va en **`hogar`**), ni
`transporte` (va en **`otros`**).

**`emisor`** — en minúscula, es un id y no un nombre:

    galicia · modo · mercadopago · personalpay · otro

Va **dónde se busca la promo**, no quién paga el reintegro: una promo de MODO
que se paga con la tarjeta Galicia es `modo`, porque es la app que hay que
abrir. Para el filtro de "las que te sirven" da igual —tener una Galicia ya
habilita las de MODO— pero la fila dice dónde ir.

## Lo demás

| Columna | Cómo va |
|---|---|
| `dias` | `int[]`, `0`=domingo … `6`=sábado. `'{2,4}'` es literal válido. **Vacío = todos los días**, y es mejor que poner los siete: con los siete la app escribe "domingo y lunes y martes y…" |
| `valor` | El porcentaje (`20` = 20 %), o la cantidad de cuotas si `tipo` es `cuotas` |
| `tope` | `NULL` es "sin tope". El monto mínimo de compra **no es un tope**: va en `notas` |
| `tope_periodo` | Texto libre; hoy ninguna pantalla lo lee. Sirve igual escribir `'banco/semana'` para acordarse de que ese tope se renueva los lunes |
| `marcas` | `text[]`, nombres como figuran en OpenStreetMap. Es lo que usa el mapa: `ARRAY['ChangoMas','ChangoMás','Walmart']` |
| `osm_filtro` | Ej. `'shop=supermarket'`, `'amenity=pharmacy'`. Sin esto la promo no sale por cercanía |
| `activa` | Default `true`: no hace falta ponerla |
| `recordar` | Default **`false`**: la promo NO va a aparecer en Hoy el día que aplica |

## Cuáles avisan

Ninguna, salvo que se diga. `recordar` prende el aviso del día que aplica, y
tenerlo prendido en cuarenta promos es no tener aviso. Solo las que se usan,
por título —y una sola vez, porque el upsert no lo pisa—:

```sql
update public.promos set recordar = true
 where user_id = '<TU_USER_ID>'
   and titulo in ('20% en COTO', '50% en transporte con Mastercard',
                  '40% en bares', '40% en desayunos');
```

---

# El pedido, para copiar y mandar

> El archivo que me pasás lo corro tal cual en Postgres. Tres cosas para que
> entre de una:
>
> **1. Que se pueda correr todas las semanas sin borrar nada.** El `INSERT`
> tiene que terminar en:
>
> ```sql
> on conflict (user_id, titulo) do update set
>   comercio = excluded.comercio, rubro = excluded.rubro,
>   emisor = excluded.emisor, tipo = excluded.tipo, valor = excluded.valor,
>   tope = excluded.tope, tope_periodo = excluded.tope_periodo,
>   dias = excluded.dias, medio_pago = excluded.medio_pago,
>   canal = excluded.canal, vigencia_desde = excluded.vigencia_desde,
>   vigencia_hasta = excluded.vigencia_hasta, marcas = excluded.marcas,
>   osm_filtro = excluded.osm_filtro, url = excluded.url,
>   notas = excluded.notas, activa = true;
> ```
>
> Sin `DELETE` en ningún lado: me borra las promos que cargué a mano y las que
> tengo marcadas.
>
> **2. Que los títulos sean los mismos todas las semanas.** El título es la
> llave: "20% en Jumbo" tiene que seguir siendo "20% en Jumbo" el mes que
> viene. Si cambia, se duplica.
>
> **3. Que los valores sean estos y no otros** (los dos primeros los rechaza
> la base entera, los otros dos se guardan mal):
>
> | Columna | Solo puede ser |
> |---|---|
> | `tipo` | `reintegro` · `descuento` · `cuotas` |
> | `canal` | `presencial` · `online` · `ambos` — no existe `presencial_online` |
> | `rubro` | `supermercado` · `combustible` · `gastronomia` · `salud` · `indumentaria` · `hogar` · `otros` — la farmacia es `salud`, el electro es `hogar`, el transporte es `otros` |
> | `emisor` | `galicia` · `modo` · `mercadopago` · `personalpay` · `otro`, en minúscula. Va la app donde se busca la promo: una de MODO pagada con tarjeta Galicia es `modo` |
>
> Y el resto: `dias` es `int[]` con `0`=domingo (vacío `'{}'` = todos los
> días, mejor que poner los siete); `valor` es el porcentaje pelado o la
> cantidad de cuotas; `tope` es el tope de reintegro y `NULL` si no tiene —el
> monto mínimo de compra **no es un tope**, va en `notas`—; `marcas` es
> `text[]` con los nombres como figuran en OpenStreetMap y `osm_filtro` el
> tag (`shop=supermarket`, `amenity=pharmacy`), que es con lo que las
> encuentro por cercanía.
>
> Las columnas, en orden: `user_id, titulo, comercio, rubro, emisor, tipo,
> valor, tope, tope_periodo, dias, medio_pago, canal, vigencia_desde,
> vigencia_hasta, marcas, osm_filtro, url, notas`.
