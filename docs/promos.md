# Cargar promos por SQL

El relevamiento semanal sale de otra sesión y llega como un `INSERT` largo.
Esto es lo que la tabla acepta, para que el SQL entre de una y no haya que
diagnosticarlo cada lunes.

## Lo que la base NO perdona

`public.promos` tiene dos `check` y una fila que los viola **se rechaza
entera**:

| Columna | Valores válidos |
|---|---|
| `tipo` | `reintegro` · `descuento` · `cuotas` |
| `canal` | `presencial` · `online` · **`ambos`** |

`ambos` es el nombre que usa la app para "presencial y online". Un
`presencial_online` no entra.

## Lo que entra pero queda invisible

`rubro` y `emisor` no tienen `check`, así que cualquier texto se guarda. El
problema es que las pantallas filtran por una lista fija, y un valor que no
está en ella se carga bien y no aparece en ningún filtro. Peor: si después se
abre esa promo para editarla, el desplegable no encuentra su valor, agarra el
primero de la lista y al guardar lo pisa sin avisar.

**`rubro`** — lo único que existe:

    supermercado · combustible · gastronomia · salud · indumentaria · hogar · otros

No hay `farmacia` (es **`salud`**), ni `electro` (va en **`hogar`**), ni
`transporte` (va en **`otros`**).

**`emisor`** — en minúscula, es un id y no un nombre:

    galicia · modo · mercadopago · personalpay · otro

## Lo demás

| Columna | Cómo va |
|---|---|
| `dias` | `int[]`, `0`=domingo … `6`=sábado. `'{2,4}'` es literal válido. Vacío = todos los días |
| `tope` | `NULL` es "sin tope". El texto de por qué va en `notas` |
| `tope_periodo` | Texto libre; hoy ninguna pantalla lo lee. `'banco/mes'` entra igual |
| `marcas` | `text[]`, nombres como figuran en OpenStreetMap. Es lo que usa el mapa |
| `osm_filtro` | Ej. `'amenity=pharmacy'`. Sin esto la promo no sale en "Promos de hoy" por cercanía |
| `activa` | Default `true`: no hace falta ponerla |
| `recordar` | Default **`false`**: la promo NO va a aparecer en Hoy el día que aplica |

## Las tres correcciones, en un `sed`

Sobre el archivo tal como llega:

```bash
sed -E -i \
  -e "s/'presencial_online'/'ambos'/g" \
  -e "s/, 'farmacia', 'Galicia',/, 'salud', 'galicia',/g" \
  -e "s/, 'electro', 'Galicia',/, 'hogar', 'galicia',/g" \
  -e "s/, 'transporte', 'Galicia',/, 'otros', 'galicia',/g" \
  -e "s/, 'Galicia', '(reintegro|descuento|cuotas)'/, 'galicia', '\1'/g" \
  promos-update.sql
```

Las reglas del rubro se anclan en el emisor que viene justo después, y la del
emisor en el tipo: así `'Visa Galicia crédito'` y las notas que dicen "Galicia"
quedan intactas.

## Después de insertar: cuáles avisan

Ninguna, salvo que se diga. `recordar` prende el aviso del día que aplica, y
tenerlo prendido en cuarenta promos es no tener aviso. Solo las que se usan:

```sql
UPDATE public.promos SET recordar = true
WHERE user_id = '<TU_USER_ID>'
  AND comercio IN ('COTO', 'Transporte público', 'Bares adheridos',
                   'Cafeterías adheridas')
  AND vigencia_hasta >= current_date;
```

## Antes de correrlo

`DELETE FROM public.promos WHERE user_id = '<TU_USER_ID>'` borra también las
que se hayan cargado a mano desde la app. Si hay alguna propia, acotar el
borrado a las del relevamiento:

```sql
DELETE FROM public.promos
WHERE user_id = '<TU_USER_ID>' AND url IS NOT NULL;
```
