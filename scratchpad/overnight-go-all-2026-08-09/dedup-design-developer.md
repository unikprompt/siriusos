---
title: Diseno de deduplicacion de mensajes tardios que reabren tareas cerradas
author: developer (SiriusOS)
date: 2026-08-09
type: design-diagnosis
mode: solo diseno y diagnostico (sin patch, merge, restart, deploy, cambio de config/datos)
---

# Dedup de mensajes tardios / fuera de orden en el bus

## 1. Sintoma observado (evidencia local vivida)

El 2026-08-08, tras CERRAR una task (auditoria del portafolio, `task_1786239740171` completada con evidencia), llego una cascada de mensajes del orquestador-codex que referenciaban esa task ya cerrada: varios STOP y varias respuestas `reply_to` a mensajes viejos, todos rotulados por el propio emisor como "mensaje tardio y ya superado". Ejemplos de ids recibidos despues del cierre: `...-hgrnd`, `...-xpm42`, `...-326rg`, `...-xg7n9`. Si se actuara ingenuamente sobre ellos, se reabriria o re-ejecutaria trabajo ya terminado.

## 2. Causa raiz (mecanismo)

Estructura de mensaje (`src/bus/message.ts`, muestra real): `{ id, from, to, priority, timestamp, text, reply_to, sig }`. El `id` empieza con epoch-millis; hay `timestamp` ISO y `reply_to`, pero **no hay referencia al estado ni a la version de la task**.

Contribuyen tres factores:

1. **Sin gating por estado canonico.** El receptor procesa los mensajes en orden de llegada. Ningun mensaje declara "esperaba que la task T estuviera en estado/version X", asi que el receptor no puede detectar que una instruccion ya quedo superada por el estado actual de T.
2. **Redelivery de no-ACK'd.** `checkInbox` mueve mensajes a `inflight`; `recoverStaleInflight(inflight, inbox, 300)` devuelve al inbox los mensajes en inflight con mas de 5 minutos. Si el agente proceso el mensaje pero tardo en ACKear (p. ej. estaba en una task larga), el mensaje se **re-entrega** y reaparece como "nuevo".
3. **Cruce temporal y cadenas reply_to a mensajes viejos.** El emisor compone un STOP/instruccion sobre un snapshot de estado; para cuando se entrega y procesa, el estado ya avanzo (la accion se completo). El `reply_to` apunta a un mensaje viejo del hilo y no acarrea el estado vigente.

## 3. Estado canonico e invariantes

**Fuente de verdad = el registro de la task** (`orgs/<org>/tasks/task_*.json`): campos `status` (`pending|in_progress|completed|blocked|cancelled`) y un monotono `updated_at` (o `version`/`epoch`) con `completed_at` cuando aplica.

Invariantes propuestas:

- **I1 (no reapertura por rezago):** una task `completed` NO vuelve a `in_progress` por un mensaje cuyo `timestamp` es anterior a `completed_at`. Solo la reabre una instruccion EXPLICITA de reopen con version mayor a la de cierre.
- **I2 (idempotencia por id):** procesar un mensaje es idempotente por `id`. Una re-entrega del mismo `id` no dispara una segunda ejecucion.
- **I3 (ultima instruccion gana):** para una task dada, la instruccion efectiva es la de mayor `(timestamp, version)`; las anteriores se ignoran una vez existe un estado terminal mas nuevo.
- **I4 (terminal es pegajoso):** mientras la task este `completed`, cualquier STOP/continuacion con `timestamp < completed_at` es informativo (no-op).

## 4. Pseudoflujo del filtro (lado receptor)

```
on_message(m):
  # dedup por id (I2)
  if m.id in processed_ids:            # ya visto (redelivery)
     ack(m); return NO_OP("duplicate")
  t = resolve_task_ref(m)              # por task_id explicito, o inferido del reply_to/hilo
  if t is None:
     handle_normally(m); mark_processed(m.id); return
  # gating por estado terminal (I1, I4)
  if t.status == COMPLETED and m.timestamp < t.completed_at:
     if not is_explicit_reopen(m) or reopen_version(m) <= t.version:
        ack(m); log("stale-late"); return NO_OP("supersedes closed task")
  # gating por version/estado visto (I3)
  if m.task_state_seen is present and m.task_state_seen < t.version:
     ack(m); log("stale-version"); return NO_OP("older than current state")
  handle_normally(m); mark_processed(m.id)
```

Notas:
- `processed_ids`: set persistente por agente (o reutilizar la carpeta `processed/` de ACK como registro de "ya manejado", chequeando ahi antes de re-ejecutar en una re-entrega).
- `resolve_task_ref`: preferir un `task_id` explicito en el mensaje; si no, mapear el `reply_to` a la task del hilo. Si no se puede resolver, no aplicar gating (fallback a manejo normal, para no descartar mensajes no ligados a tasks).
- `is_explicit_reopen`: una marca inequivoca (p. ej. `text` con un token REOPEN o un campo `op: reopen`).

## 5. Casos de carrera

- **C1 Enviado-antes-entregado-despues:** STOP con `timestamp` < `completed_at` -> I1/I4 lo vuelven no-op. (Es el caso vivido hoy.)
- **C2 Redelivery de ya-manejado:** mismo `id` re-encolado por `recoverStaleInflight` -> I2 lo hace no-op. Requiere que "manejado" se marque aunque el ACK haya tardado.
- **C3 STOP y GO cruzados:** dos instrucciones contradictorias; gana la de mayor `(timestamp, version)` (I3). Si el GO es posterior al STOP, se ejecuta el GO.
- **C4 reply_to a mensaje superado:** el `reply_to` apunta a un mensaje viejo cuyo estado ya cambio; se resuelve la task y se aplica el gating por estado, no por el contenido del hilo.
- **C5 ACK lento durante task larga:** el agente maneja pero ACKea despues de 5 min; la re-entrega (C2) se filtra por I2. Mitigacion adicional: ACKear al iniciar el manejo, no al final.

## 6. Tests propuestos

- **T1:** task completed + mensaje con timestamp < completed_at -> handler devuelve NO_OP, task sigue completed (I1/I4).
- **T2:** mismo mensaje entregado dos veces (redelivery) -> segunda vez NO_OP, efecto lateral ocurre exactamente una vez (I2).
- **T3:** STOP(t1) luego GO(t2>t1) sobre la misma task -> se aplica GO, no el STOP (I3).
- **T4:** reopen explicito con version > completed_version sobre task completed -> si reabre (excepcion legitima).
- **T5:** mensaje sin task_id ni reply_to resoluble -> se maneja normal (no se descarta por error).
- **T6:** ACK tardio (>5 min) tras manejo -> redelivery filtrada, sin doble ejecucion (C5).

## 7. Riesgos y trade-offs

- **R1 Clock skew:** el gating por `timestamp` asume relojes coherentes; como emisor y receptor corren en la misma maquina/daemon, el riesgo es bajo. Preferir una `version` monotona de la task sobre el reloj cuando exista.
- **R2 Falso-negativo (descartar una instruccion legitima tardia):** si una instruccion valida llega tarde pero deberia aplicarse, el gating por estado terminal la bloquearia. Mitigacion: el emisor usa reopen explicito para reabrir; lo demas sobre una task cerrada es informativo por diseno.
- **R3 Resolucion de task ambigua:** mensajes no ligados a una task no deben filtrarse; el fallback a manejo normal evita perder mensajes generales.
- **R4 Cambio de contrato:** para el gating fuerte, el emisor deberia incluir `task_id` (y opcional `task_state_seen`/`version`) en los mensajes que instruyen sobre tasks. Sin eso, el filtro se apoya en I2 (dedup por id) + inferencia por reply_to, que ya cubre el caso vivido hoy.

## 8. Recomendacion minima (sin cambiar el contrato de mensajes)

Aun sin agregar campos: (a) dedup por `id` contra la carpeta `processed/` antes de re-ejecutar en re-entregas (I2); (b) ACKear al INICIAR el manejo, no al final, para no gatillar `recoverStaleInflight`; (c) heuristica de estado: si el `reply_to` mapea a una task `completed` y el `timestamp` del mensaje es anterior al `completed_at`, tratar como informativo. Estas tres reglas ya habrian neutralizado la cascada del 8-ago.

---
*Solo diseno y diagnostico. No se aplico patch, merge, restart, deploy ni cambio de config/datos. No se escribio en Obsidian. Evidencia: mensajes reales recibidos el 8-ago + `src/bus/message.ts`.*
