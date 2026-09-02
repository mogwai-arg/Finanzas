# Las funciones, listas para pegar

Cada archivo de esta carpeta es **una Edge Function entera en un solo archivo**,
generada desde `supabase/functions/` con `npm run funciones`.

**No editar nada de acá.** El código de verdad vive en
`supabase/functions/<nombre>/index.ts`; esto se regenera solo.

## Para qué sirven

El panel de Supabase deja crear y desplegar funciones desde el navegador, pero
pegando código, no carpetas. Las funciones originales importan de `_shared/`,
así que pegadas tal cual no arrancan. Acá ya vienen con eso adentro.

Es el camino sin terminal: **Edge Functions → Deploy a new function → Via
Editor**, pegar, desplegar. Nada más.

## Cuál es cuál

| Archivo | Qué hace | Verificar JWT |
|---|---|---|
| `oauth-start.ts` | Manda a Google o a Mercado Pago a pedir el permiso | **No** |
| `oauth-callback.ts` | Recibe la vuelta y guarda el token | **No** |
| `gmail-sync.ts` | Lee los avisos de compra y arma los movimientos | Sí |
| `mp-sync.ts` | Lo mismo con la API de Mercado Pago | Sí |
| `cron-avisos.ts` | Los avisos de vencimiento, por horario | Sí |

Las dos primeras las abre el navegador durante el permiso, cuando todavía no
hay sesión: si les pedís JWT, cortan antes de empezar. En el panel es el
interruptor **Verify JWT** de cada función.
