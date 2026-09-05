# Qué queda

Estado al 4 de septiembre. Lo que hay que probar usándolo está aparte, en
[`por-probar.md`](por-probar.md), y la pasada completa de auditoría —lo que se
arregló, lo que se miró y está bien, y lo que quedó abierto— en
[`auditoria.md`](auditoria.md).

---

## Antes que nada

1. **Correr `supabase/migrations/019_fondos_deudas.sql`.** Sin eso, crear un
   fondo o una deuda se rechaza y queda en el cajón de cambios pendientes.
2. **Correr `supabase/migrations/020_cotejos_suscripciones.sql`.** Es el que
   falta si Ajustes dice *"Could not find the 'cotejos' column of 'settings'"*.
   Después, **Reintentar** en ese mismo cartel y el cambio sube.
3. **Correr `supabase/migrations/021_saldo_del_banco.sql`.** Para poder anotar
   lo que dice el banco de un resumen que todavía no cerró.
4. **Prender "Topes del mes"** en Ajustes → Avisos.

---

## 1. Arrastrar lo que sobra del tope

Descartado por ahora, y anotado para no volver a discutirlo desde cero: con
inflación alta, arrastrar un sobrante en pesos de hace tres meses no quiere
decir nada, y arrastrar lo que te pasaste es honesto pero desalienta. Si
alguna vez se prueba, en un tope solo y no en todos.

## 2. Los avisos al teléfono son dos por vez

El de "lo que viene" sale último de la lista, así que el día 10, si hay dos
avisos antes, no llega. El orden es el correcto —lo que tiene multa va
primero— pero conviene mirarlo después de un mes de uso.

## 3. El lector de pantalla

El script de accesibilidad mide contraste, tamaños y etiquetas, y todo está en
cero. Lo que no puede hacer es escuchar a VoiceOver: falta pasar Hoy y Cargar
con VoiceOver prendido y ver si el orden en que lee tiene sentido.

## 4. Cosas que aparecieron y no valen todavía

- **Fondos que se llenan solos.** Hoy cada aporte se anota a mano. Podría
  proponerlo el día que entra el sueldo. Antes conviene ver si el aporte a
  mano se sostiene un par de meses.
- **Fondos en la cuenta que rinde.** El fondo ya sabe en qué cuenta está y la
  app ya sabe cuál rinde más: falta cruzarlo y decir "esto podría estar
  rindiendo".
- **Deudas con cuotas.** Hoy una deuda es un número. Si aparece una que se
  paga de a poco, habría que anotar pagos parciales.
