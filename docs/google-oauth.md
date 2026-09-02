# Publicar la app en Google — paso a paso

**Objetivo:** que el permiso de Gmail deje de caducar cada 7 días.

**Por qué caduca hoy:** no es por falta de verificación. Es porque la pantalla de
consentimiento está en estado **Testing**, y Google caduca a los 7 días todo
permiso emitido por una app en pruebas.

**Por qué no hace falta el trámite largo:** Google exime de la verificación —y de
la auditoría de seguridad anual, que es paga— a las apps de **uso personal**:
las que no se comparten con nadie, o que usan menos de 100 personas conocidas.
Esta app la usa una sola persona.

> La consola está en constante rediseño. Los nombres de abajo son los de la
> interfaz de 2026 (*Google Auth Platform*). Si ves "Pantalla de consentimiento
> de OAuth" en un menú viejo, el contenido es el mismo.

---

## Antes de empezar

Google va a pedir una página de inicio y una de privacidad. Dos cosas:

1. **Publicar la PWA en Cloudflare Pages**, aunque sea en modo demo, para tener
   una URL real (`bishusha-xxx.pages.dev`).
2. **Crear `privacidad.html`** en la raíz del proyecto. Alcanza con una página
   simple que diga: qué datos lee la app (los avisos de consumo del correo),
   para qué (registrar movimientos), dónde quedan (una base de Supabase propia)
   y que no se comparten con nadie ni se venden.

---

## Los pasos

1. **Entrar a [console.cloud.google.com](https://console.cloud.google.com)** con la
   misma cuenta de Google cuyos mails va a leer la app. Elegir el proyecto en el
   selector de arriba a la izquierda, o crear uno nuevo llamado `bishusha`.

2. **Habilitar la API de Gmail.** Menú lateral → **APIs y servicios →
   Biblioteca**, buscar **Gmail API** y tocar **Habilitar**.

   Es fácil saltearse este paso porque no se menciona en ninguna pantalla de
   OAuth, y sin él el permiso falla de la peor manera: Google ni siquiera
   muestra la pantalla de consentimiento. Se ve la barra azul cargando y
   vuelve enseguida, como si el usuario hubiera cancelado. Un proyecto puede
   tener la credencial y los permisos declarados y aun así no tener la API
   prendida.

3. **Menú lateral → APIs y servicios → Plataforma de autenticación de Google.**
   Vas a ver cuatro secciones: *Identidad de marca*, *Público*, *Acceso a datos*
   y *Clientes*.

4. **Identidad de marca (Branding).** Completar:
   - Nombre de la aplicación: `BISHUSHA`
   - Correo de asistencia al usuario: el tuyo
   - **Logotipo: dejarlo vacío.** La misma pantalla lo avisa: subir un logo
     obliga a mandar la app a verificación, salvo que quede en estado Prueba.
     Como el objetivo es publicarla, un logo cuesta el trámite entero. La
     pantalla de permiso va a mostrar el nombre sin ícono, una sola vez.
   - Página principal: `https://bishusha.pages.dev`
   - Política de privacidad: `https://bishusha.pages.dev/privacidad.html`
   - Condiciones del Servicio: vacío, es opcional.
   - Dominios autorizados: `bishusha.pages.dev` — el subdominio entero, no
     `pages.dev`. Google pide un *top private domain*, y `pages.dev` está en la
     Public Suffix List: para Google es un sufijo público, como `com.ar`, así
     que lo rechaza. Si algún día ponés dominio propio, ahí sí va el dominio
     pelado.
   - Datos de contacto del desarrollador: tu correo

   Guardar.

5. **Clientes (Clients).** Acá se crea la credencial y, sobre todo, se
   registra a dónde vuelve Google después del permiso.

   - **Crear cliente → Tipo: Aplicación web.** Nombre: `BISHUSHA`.
   - **URI de redireccionamiento autorizados → Agregar URI**, y pegar
     exactamente:

     ```
     https://<TU-PROJECT-REF>.supabase.co/functions/v1/oauth-callback
     ```

     Sin barra al final, sin `?proveedor=`, sin nada más. Google compara letra
     por letra: cualquier diferencia da `Error 400: redirect_uri_mismatch`.
   - **Orígenes de JavaScript autorizados** se deja vacío: el permiso no se
     pide desde el navegador sino desde la función.
   - Guardar, y copiar el **ID de cliente** y el **secreto** a los secretos de
     Supabase (`GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`).

   Un cambio acá puede tardar unos minutos en tomar efecto.

6. **Acceso a datos (Data Access).** Verificar que el único permiso pedido sea
   `https://www.googleapis.com/auth/gmail.readonly`. Si hay otros, sacarlos:
   cuantos menos permisos, menos fricción.

7. **Público (Audience).** Acá está el estado de publicación. Debería decir
   **Externo** y **En prueba**. Tocar **PUBLICAR APP**.

8. **Google avisa que vas a necesitar verificación para algunos permisos.
   Confirmar igual.** El estado pasa a **En producción**. Esto es lo único que
   hacía falta.

9. **Volver a BISHUSHA → Ajustes → Conectar Gmail.** Va a aparecer la pantalla
   *"Google no verificó esta aplicación"*. Entrar por **Configuración avanzada →
   Ir a bishusha-xxx.pages.dev (no seguro)** y dar el permiso. Es una sola vez.

10. **Anotar la fecha.** Si a los diez días sigue sincronizando, quedó resuelto.

---

## Si algo falla

Dos direcciones que contestan en texto plano, sin mostrar ningún secreto:

```
https://<TU-PROJECT-REF>.supabase.co/functions/v1/oauth-callback?salud=1
```

La dirección de vuelta exacta que hay que registrar en Google —para comparar
letra por letra con la de la consola— y si cada secreto está puesto o falta.

```
https://<TU-PROJECT-REF>.supabase.co/functions/v1/oauth-start?mostrar=1
```

A dónde va a mandar, desglosado. Esa dirección se puede abrir a mano en una
pestaña común, con la barra de direcciones a la vista: es la forma de ver qué
contesta Google sin la app ni el service worker en el medio. Cuando algo
falla, el error queda escrito en la barra.

El `client_id` empieza con el número del proyecto de Google. Tiene que ser el
mismo proyecto donde está habilitada la Gmail API: tener dos proyectos y
mezclarlos es un clásico, y da un rechazo sin pantalla de permisos.

Errores frecuentes:

| Dice | Es |
|---|---|
| `redirect_uri_mismatch` | la dirección de vuelta no coincide con la registrada |
| `access_denied` | se tocó "Volver a seguridad" en la pantalla de app sin verificar |
| `no vino el código; llegó: …` | Google mandó de vuelta sin código; los parámetros que sí llegaron dicen qué pasó |
| Vuelve sin mostrar la pantalla de permisos | falta habilitar la **Gmail API** en Biblioteca (paso 2), o el `state` es demasiado largo |
| `el permiso caducó o ya se usó` | pasaron más de 15 minutos entre empezar y terminar, o se volvió atrás y se reintentó el mismo enlace |
| `Google: The provided client secret is invalid` | el `GOOGLE_CLIENT_SECRET` de Supabase no es el del cliente: se copió de más, de menos, o quedó el viejo tras regenerarlo |
| `Requested function was not found` | la función está publicada con otro nombre: el nombre es la URL |

---

## Lo que NO hay que hacer

**No enviar la app a verificación.** Si la consola ofrece *"Preparar para
verificación"* o *"Enviar para revisión"*, ignoralo. Ese camino incluye una
auditoría de seguridad anual paga (CASA), pensada para empresas con miles de
usuarios. La excepción de uso personal existe justamente para no pasar por ahí.

---

## Si la consola frena la publicación

Google a veces exige verificación para publicar con permisos restringidos. Si
el botón no deja avanzar, **no insistir**: el plan B es mejor que el A.

### Plan B — Cloudflare Email Routing

1. Comprar un dominio (~15 USD al año) y agregarlo a Cloudflare.
2. Activar **Email Routing** y crear una casilla, por ejemplo
   `movimientos@tudominio.com`.
3. En Gmail, crear un filtro que reenvíe automáticamente a esa casilla los mails
   de `bancogalicia.com.ar`, `galicia.ar`, `modo.com.ar`, `mercadopago.com.ar` y
   Personal Pay.
4. Escribir un **Email Worker** que reciba, parsee con `postal-mime` y escriba en
   Supabase. Los parsers de `supabase/functions/_shared/parsers.ts` se reusan tal
   cual.

Sin OAuth, sin caducidad, sin verificación, y **más rápido que la API de Gmail**:
el Worker corre en el momento en que el mail llega.

---

## En los dos casos

El **aviso de reconexión de un tap** en la pantalla principal se construye igual.
El permiso puede caerse por otras razones —cambiás la contraseña de Google,
revocás el acceso sin querer, Google detecta actividad rara—, y cuando se cae,
el 68 % de la gente abandona la app en vez de reconectar. La app tiene que darse
cuenta antes que vos.
