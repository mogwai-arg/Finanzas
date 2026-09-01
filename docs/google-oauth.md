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

2. **Menú lateral → APIs y servicios → Plataforma de autenticación de Google.**
   Vas a ver cuatro secciones: *Identidad de marca*, *Público*, *Acceso a datos*
   y *Clientes*.

3. **Identidad de marca (Branding).** Completar:
   - Nombre de la aplicación: `BISHUSHA`
   - Correo de asistencia al usuario: el tuyo
   - Dominios autorizados: `pages.dev`
   - Página principal: la URL de Cloudflare Pages
   - Política de privacidad: esa misma URL + `/privacidad.html`
   - Datos de contacto del desarrollador: tu correo

   Guardar.

4. **Acceso a datos (Data Access).** Verificar que el único permiso pedido sea
   `https://www.googleapis.com/auth/gmail.readonly`. Si hay otros, sacarlos:
   cuantos menos permisos, menos fricción.

5. **Público (Audience).** Acá está el estado de publicación. Debería decir
   **Externo** y **En prueba**. Tocar **PUBLICAR APP**.

6. **Google avisa que vas a necesitar verificación para algunos permisos.
   Confirmar igual.** El estado pasa a **En producción**. Esto es lo único que
   hacía falta.

7. **Volver a BISHUSHA → Ajustes → Conectar Gmail.** Va a aparecer la pantalla
   *"Google no verificó esta aplicación"*. Entrar por **Configuración avanzada →
   Ir a bishusha-xxx.pages.dev (no seguro)** y dar el permiso. Es una sola vez.

8. **Anotar la fecha.** Si a los diez días sigue sincronizando, quedó resuelto.

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
