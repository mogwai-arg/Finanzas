# Conectar Mercado Pago

Son cinco pasos. Los tres primeros se hacen una vez y no se tocan más; los dos
últimos son los que dejan la cosa andando.

Antes de arrancar, una advertencia que conviene leer ahora y no después.

## Qué esperar

La API pública de Mercado Pago está pensada para **cobrar**, no para llevar
tus finanzas. Según cómo esté tu cuenta, `/v1/payments/search` puede devolver
los pagos que *recibiste* y no todos los que *hiciste*.

O sea: puede que conectes todo bien y entre poco. No es que esté roto.

Por eso el mail de Mercado Pago sigue siendo la puerta principal —`gmail-sync`
la lee y no se toca— y esto es el segundo par de ojos. Cuando los dos ven el
mismo pago, la app lo reconoce y no lo carga dos veces: completa lo que el
mail no sabía (las cuotas, el identificador de la operación) sin pisar la
categoría que le pusiste vos.

---

## 1. Crear la aplicación en Mercado Pago

Entrá a **mercadopago.com.ar/developers/panel** con tu cuenta de Mercado Pago
y creá una aplicación (*Tus integraciones → Crear aplicación*).

- Nombre: el que quieras. `BISHUSHA` está bien.
- Producto: el de **pagos online / Checkout**. Es el que habilita OAuth.

De ahí salen dos datos, en **Credenciales de producción**:

- **Client ID** (a veces figura como *App ID*, y es un número largo)
- **Client Secret**

El panel de Mercado Pago cambia de forma cada tanto. Si los nombres no
coinciden exactamente, lo que buscás son las credenciales de **producción**
—no las de prueba— y el campo de **URLs de redireccionamiento**.

## 2. Registrar la dirección de vuelta

En la misma aplicación, en **URLs de redireccionamiento** (o *Redirect URI*),
poné exactamente esto:

```
https://<TU-PROJECT-REF>.supabase.co/functions/v1/oauth-callback
```

Sin barra al final, sin parámetros, sin nada más. Tiene que coincidir letra
por letra con la que manda la app: si difiere en un carácter, Mercado Pago
corta el permiso antes de mostrarte la pantalla y el error no dice por qué.

`<TU-PROJECT-REF>` es el código del proyecto de Supabase, el mismo que ya
usás en `FUNCTIONS_URL`.

## 3. Guardar las credenciales en Supabase

Panel de Supabase → **Edge Functions → Secrets**:

| Nombre | Valor |
|---|---|
| `MP_CLIENT_ID` | el Client ID del paso 1 |
| `MP_CLIENT_SECRET` | el Client Secret del paso 1 |

Si ya los habías puesto vacíos cuando desplegaste por primera vez, **editalos**
en vez de agregarlos de nuevo.

Con la CLI:

```bash
supabase secrets set MP_CLIENT_ID=... MP_CLIENT_SECRET=...
```

Cambiar un secreto no reinicia las funciones solo: hay que volver a
desplegarlas, que es justo lo que sigue.

## 4. Volver a desplegar mp-sync

La función cambió: ahora, antes de insertar, busca si ese movimiento ya
estaba —por el mail o cargado a mano— y completa esa fila en vez de crear otra.

Con la CLI:

```bash
supabase functions deploy mp-sync
```

Desde el panel: **Edge Functions → mp-sync → Editor**, borrar todo y pegar
`supabase/para-pegar/mp-sync.ts`, que ya trae adentro lo que importa de
`_shared/`. El nombre de la función tiene que seguir siendo `mp-sync`.

## 5. Conectar la cuenta desde la app

En BISHUSHA: **Ajustes → Lectura automática → Conectar Mercado Pago**.

Te manda a Mercado Pago, le das permiso, y volvés a Ajustes. Si sale bien, la
fila pasa a decir el número de cuenta y aparece **Leer ahora**.

Tocá **Leer ahora** y mirá qué contesta. Ahí se ve si el paso 4 quedó bien.

---

## Que corra solo

Los pagos entran cada dos horas si está la tarea programada. Para ver si ya
está, en **SQL Editor**:

```sql
select jobname, schedule, active from cron.job;
```

Si `mp-sync` no aparece, corré esa parte de `supabase/cron.sql` reemplazando
`<PROJECT_REF>` y `<SERVICE_ROLE_KEY>`.

## Si algo no anda

En Ajustes, la fila de Mercado Pago muestra el último error tal como lo
devolvió Mercado Pago. Los tres que pasan de verdad:

**"invalid_client" o "client secret is invalid"** — el `MP_CLIENT_SECRET` está
mal, o quedó con un espacio pegado al copiarlo, o las funciones no se
volvieron a desplegar después de cambiarlo.

**"redirect_uri mismatch" o vuelve al instante sin pedirte permiso** — la
dirección del paso 2 no coincide exactamente con la del paso 3. Es siempre una
barra de más, `http` en vez de `https`, o el project-ref equivocado.

**Conecta bien y no entra nada** — es lo esperable, no un error: mirá la
sección *Qué esperar* de arriba. Los movimientos siguen entrando por el mail.
