# Control de Finanzas y Beneficios

PWA para llevar tus gastos, tus tarjetas de crédito con cierre, vencimiento y
cuotas, los gastos fijos del mes, el presupuesto y las promos bancarias que
te sirven — con la sucursal más cercana según dónde estés parado.

La idea de fondo: **que anotes lo menos posible**. Los consumos con tarjeta y
con billeteras entran solos desde los avisos que ya te llegan por mail y desde
la API de Mercado Pago. A mano solo va el efectivo.

---

## Probarla ahora, sin instalar nada

Ya viene en **modo demo** con datos de ejemplo. Levantá cualquier servidor
estático en esta carpeta:

```bash
python3 -m http.server 8080
```

y abrí `http://localhost:8080`. Todo queda en el navegador; no toca ningún
servidor.

Cuando tengas Supabase listo, poné `DEMO: false` en `config.js`.

---

## Fase 1 — que funcione y sincronice (30 minutos)

### 1. Base de datos en Supabase

1. Creá un proyecto en [supabase.com](https://supabase.com) (plan free).
   Elegí la región **South America (São Paulo)**: es la más cerca.
2. Andá a **SQL Editor → New query**, pegá todo `supabase/schema.sql` y
   dale **Run**. Crea las tablas, la seguridad por usuario (RLS) y las
   categorías iniciales.
3. **Authentication → Sign In / Providers → Email**: dejá activado *Email* y
   **desactivá "Confirm email"**. La app entra con correo y contraseña; si
   dejás la confirmación prendida, cada alta pide abrir un mail y chocás con
   el límite de correos del plan free.
4. **Authentication → URL Configuration**: en *Site URL* y en *Redirect URLs*
   poné la URL donde va a vivir la app (la del paso 2 de acá abajo).

### 2. Publicar la PWA en Cloudflare Pages

1. Copiá `config.example.js` a `config.js` y completá `SUPABASE_URL` y
   `SUPABASE_ANON_KEY` (**Project Settings → API**). Poné `DEMO: false`.
   La anon key es pública por diseño: lo que protege tus datos es RLS.
2. En Cloudflare: **Workers & Pages → Create → Pages → Upload assets**,
   arrastrá esta carpeta entera y publicá. Te queda algo como
   `finanzas-xxx.pages.dev`.
3. Volvé a Supabase y pegá esa URL en *Site URL* y *Redirect URLs*.
4. Abrí la URL en el celular → menú del navegador → **Agregar a pantalla de
   inicio**. Queda como una app, con ícono propio y funciona sin conexión.

> Si preferís no subir a mano cada vez: conectá la carpeta a un repo de GitHub
> y en Pages elegí *Connect to Git*. Cada push publica solo. En ese caso
> agregá `config.js` al `.gitignore` y definí los valores en un
> `config.js` generado por build, o dejalo commiteado — la anon key no es un
> secreto.

### 3. Cargar tus datos

En la app: **Tarjetas → Agregar** con el día de cierre y de vencimiento de
cada tarjeta (están en el resumen). Después **Mes → Gastos fijos** para el
colegio, la luz, el gas, la prepaga. Con eso ya tenés el "qué me falta pagar".

---

## Fase 2 — que cargue solo

### Gmail (los avisos de compra de Galicia, MODO y Mercado Pago)

1. En [Google Cloud Console](https://console.cloud.google.com) creá un
   proyecto. **APIs y servicios → Biblioteca → Gmail API → Habilitar**.
2. **Pantalla de consentimiento OAuth**: tipo *Externo*, estado **Testing**, y
   agregate a vos mismo en *Usuarios de prueba*. En modo Testing no necesitás
   la verificación de Google (que para el scope de Gmail es cara y lenta). El
   token de refresco caduca cada 7 días en Testing: si un día la carga
   automática se corta, entrá a Ajustes y volvé a conectar. Si te molesta,
   publicar la app y pedir verificación es el paso siguiente.
3. **Credenciales → Crear → ID de cliente OAuth → Aplicación web**. En
   *URI de redirección autorizados* poné:
   `https://<TU-PROYECTO>.supabase.co/functions/v1/oauth-callback?proveedor=gmail`
4. Guardá el *Client ID* y el *Client Secret*.

### Mercado Pago

1. Entrá a [Mercado Pago Developers](https://www.mercadopago.com.ar/developers)
   y creá una aplicación. Es gratis.
2. En *Redirect URI* poné:
   `https://<TU-PROYECTO>.supabase.co/functions/v1/oauth-callback?proveedor=mercadopago`
3. Guardá el *Client ID* y el *Client Secret*.

> Nota honesta: la API pública de Mercado Pago está pensada para cobros.
> Según el tipo de cuenta puede no exponer todos los pagos salientes. Por eso
> los mails de Mercado Pago se siguen leyendo igual desde `gmail-sync`: entre
> las dos fuentes no se te escapa nada, y los duplicados se descartan solos.

### Subir las Edge Functions

Hay dos caminos. Los dos dejan lo mismo andando.

#### Sin terminal, desde el panel

Es el camino corto si no tenés Node instalado.

1. **Los secretos.** Panel de Supabase → **Edge Functions → Secrets → Add new
   secret**. Uno por uno:

   | Nombre | Valor |
   |---|---|
   | `GOOGLE_CLIENT_ID` | el de la consola de Google |
   | `GOOGLE_CLIENT_SECRET` | el de la consola de Google |
   | `MP_CLIENT_ID` | el de Mercado Pago (o vacío por ahora) |
   | `MP_CLIENT_SECRET` | el de Mercado Pago (o vacío por ahora) |
   | `FUNCTIONS_URL` | `https://<TU-PROJECT-REF>.supabase.co/functions/v1` |
   | `APP_URL` | `https://<TU-APP>.pages.dev` |

   `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya están: los pone Supabase.

2. **Las funciones.** Una por una: **Edge Functions → Deploy a new function →
   Via Editor**, borrar el ejemplo, y pegar el archivo de
   [`supabase/para-pegar/`](supabase/para-pegar/) que corresponde. Ese
   contenido ya trae adentro lo que la función importa de `_shared/`, que es
   justamente lo que el editor del panel no sabe resolver.

   **El nombre hay que cambiarlo ANTES de desplegar.** El panel lo llena con
   uno al azar —`rapid-process`, `smooth-function`— y ese nombre *es la URL*.
   Ponerle la etiqueta correcta después no mueve la URL: queda en
   `/functions/v1/rapid-process` y la app no la encuentra. Si ya pasó, la
   única salida es borrar la función y crearla de nuevo.

   Cuando terminás, la lista tiene que mostrar URLs que terminen exactamente
   en `/oauth-start`, `/oauth-callback`, `/gmail-sync`, `/mp-sync` y
   `/cron-avisos`. En `oauth-callback` es todavía más importante: esa URL
   está registrada en Google como destino del permiso, y si no coincide
   Google corta antes de empezar.

   En `oauth-start` y `oauth-callback` hay que **apagar Verify JWT**: las abre
   el navegador durante el permiso, cuando todavía no hay sesión.

Si tocás el código de una función, `npm run funciones` regenera esos archivos.

#### Con la CLI

```bash
supabase login
supabase link --project-ref <TU-PROJECT-REF>

supabase secrets set \
  GOOGLE_CLIENT_ID=... \
  GOOGLE_CLIENT_SECRET=... \
  MP_CLIENT_ID=... \
  MP_CLIENT_SECRET=... \
  FUNCTIONS_URL=https://<TU-PROJECT-REF>.supabase.co/functions/v1 \
  APP_URL=https://<TU-APP>.pages.dev

supabase functions deploy oauth-start   --no-verify-jwt
supabase functions deploy oauth-callback --no-verify-jwt
supabase functions deploy gmail-sync
supabase functions deploy mp-sync
supabase functions deploy cron-avisos
```

Después, en **SQL Editor**, corré `supabase/cron.sql` reemplazando
`<PROJECT_REF>` y `<SERVICE_ROLE_KEY>`. Eso deja andando:

| Tarea | Cada cuánto | Qué hace |
|---|---|---|
| `gmail-sync` | 30 min | lee los avisos nuevos y carga los gastos |
| `mp-sync` | 2 h | baja los movimientos de Mercado Pago |
| `avisos` | 9:00 | te avisa vencimientos y gastos fijos impagos |

Por último, en la app: **Ajustes → Carga automática → Conectar**.

### Qué lee exactamente de tu mail

Solo mensajes de los últimos 14 días cuyo remitente sea
`bancogalicia.com.ar`, `galicia.ar`, `modo.com.ar`, `mercadopago.com.ar` o
`mercadolibre.com.ar`. De cada uno guarda el asunto, el remitente y el
movimiento que extrajo — nunca el cuerpo completo. Todo lo demás de tu casilla
ni se toca. El permiso que le das a Google es de **solo lectura**.

Cada mail procesado queda registrado en la tabla `ingest_log` con el resultado
(`cargado`, `ignorado`, `duplicado`). Si algún aviso nuevo del banco no se
parsea, aparece ahí como `sin patron que matchee`: con ese texto se agrega la
regla en `supabase/functions/_shared/parsers.ts`.

---

## Promos con GPS

Cargá las promos en **Promos → Agregar**: porcentaje, tope, días y los
**nombres a buscar en el mapa** (por ejemplo `Farmacity, Simplicity`).

Cuando tocás *Ver lo que tengo cerca*, la app pide tu ubicación y busca en
OpenStreetMap las sucursales de ese rubro alrededor tuyo, las ordena por
distancia y te deja el link al mapa. Es gratis y no necesita clave de API.
Los resultados se cachean 6 horas.

Para arrancar con datos: `supabase/seed_promos.sql` (reemplazá `<TU_USER_ID>`).

---

## Estructura

```
index.html              shell de la app
config.js               tus claves (no lo subas a un repo público)
manifest.webmanifest    para que se instale como app
sw.js                   cache offline + avisos push
css/styles.css
js/finance.js           cálculo de ciclos, cuotas, presupuesto  (con tests)
js/db.js                Supabase + cache local + cola offline
js/geo.js               ubicación y sucursales cercanas
js/ui.js                helpers de DOM
js/app.js               vistas
js/demo.js              datos de ejemplo del modo demo
vendor/supabase.js      supabase-js empaquetado (sin CDN)
supabase/schema.sql     tablas + seguridad por usuario
supabase/seed_promos.sql
supabase/cron.sql       tareas programadas
supabase/functions/     Edge Functions (OAuth, Gmail, Mercado Pago, avisos)
```

### Tests

```bash
node js/finance.test.mjs
node --experimental-strip-types supabase/functions/_shared/parsers.test.ts
```

Cubren lo que más caro sale si falla: en qué resumen cae cada compra, cómo se
reparten las cuotas, los montos en formato argentino y qué mails tienen que
generar un movimiento y cuáles no.

---

## Lo que todavía no hace

- **Importar el resumen del banco en PDF.** Es la fase 3: con la carga
  automática andando, el resumen sirve más para conciliar que para cargar.
- **Push al celular fuera de la app.** Los avisos ya se generan; falta
  generar las claves VAPID y una función que los mande. Mientras tanto los
  ves al abrir la app.
- **Promos de Galicia scrapeadas solas.** El sitio de Galicia arma todo con
  JavaScript y muestra promos distintas según tu segmento, así que la lista
  se mantiene a mano (o con la tarea semanal).
