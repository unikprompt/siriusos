---
name: anthropic-usage
description: "Lee el rate-limit REAL de un plan Anthropic Max (Pro/Max consumer) desde el endpoint interno que usa claude.ai/settings/usage. Reemplaza ccusage (que sobreestima sumando cache reads). Escribe un JSON con session_pct, weekly_pct y resets para que Sentinel u otro agente lo consuma. Requiere cookie sessionKey one-time del navegador."
triggers: ["anthropic usage", "rate limit real", "claude usage", "session pct", "weekly pct", "ccusage replacement", "uso real anthropic"]
tags: [monitoring, rate-limit, anthropic, claude-ai, sentinel]
version: 1
---

# Anthropic Usage Reader

Lee el % real de uso de un plan Anthropic Max desde el mismo endpoint que sirve la UI de `claude.ai/settings/usage`. Reemplaza la heurística de `ccusage` (que lee `~/.claude/projects/**/*.jsonl` y suma `cacheReadInputTokens` — un campo que Anthropic NO cuenta contra el rate limit, lo que infla el reporte 5-10x).

Caso real (2026-06-04): Sentinel reportó 92.9% con ccusage; la UI de claude.ai mostraba 17%. 98.7% del total de ccusage eran cache reads que no cuentan.

---

## Cuándo usar

- Tenés un plan Anthropic consumer (Pro, Max 5x, Max 20x) y querés monitoreo automatizado del bloque de 5h y del bucket semanal.
- Tu agente Sentinel necesita disparar alertas con base en el % real, no en una estimación.
- Querés correlacionar uso con actividad de la fleet (gráficos, dashboards).

## Cuándo NO usar

- Tu cuenta es **API tier 4 (Console)** y NO claude.ai consumer — usá `https://api.anthropic.com/v1/organizations/usage_report` que es la API oficial.
- Querés un consumo en tiempo real por turn (este script pollea cada N minutos, no es push).
- No tenés acceso a `claude.ai` (necesitás la cookie del navegador).

---

## Cómo funciona

1. Mario obtiene una vez la cookie `sessionKey` de claude.ai (paso de DevTools, abajo).
2. La cookie + el `org_id` van al `.env` del agente que va a leer (típicamente `sentinel`).
3. El script `usage-fetch.ts` hace `GET https://claude.ai/api/organizations/{org_id}/usage` con la cookie.
4. Parsea el JSON, deriva los campos pedidos y escribe el resultado a:
   ```
   ~/.siriusos/<instance>/state/<agent>/anthropic_usage.json
   ```
5. Si la cookie expiró (HTTP 401/403), el script falla limpio, marca `"status": "expired"` en el JSON y manda un Telegram directo al chat de Mario pidiendo renovación.
6. Un cron de 10min en Sentinel invoca el script. Sentinel lee el JSON en su rate-limit-check.

---

## Setup one-time

### 1. Obtener `sessionKey`

1. Entrar a https://claude.ai con la cuenta del plan Max.
2. Abrir DevTools (F12 en Chrome/Safari, ⌥⌘I en Mac).
3. Pestaña **Application** (Chrome) o **Storage** (Safari) → **Cookies** → `https://claude.ai`.
4. Buscar la cookie `sessionKey`. Empieza con `sk-ant-sid01-…`. Es un valor largo (~200 chars).
5. Copiar el valor completo (right click → Copy Value, o doble click + ⌘C).

> El `sessionKey` es **HttpOnly** — JavaScript en la página no puede leerlo, pero DevTools sí. Es un secreto de igual nivel que tu API key: no la pegues en chats, screenshots, ni en el repo.

### 2. Obtener `org_id`

Mientras tenés la cookie en la mano, en DevTools:
- Pestaña **Network**, filtrar por `organizations`.
- Refrescar la página. Vas a ver una request a `https://claude.ai/api/organizations`.
- En la respuesta, copiá el `uuid` del primer item (el que tiene tu plan).

Alternativamente, el script tiene un modo `--discover-org` que toma solo el `sessionKey` y devuelve el `org_id` para que lo agregues al `.env`:

```bash
SESSION_KEY="sk-ant-sid01-..." tsx usage-fetch.ts --discover-org
# stdout: org_id=abcd1234-...
```

### 3. Guardar en el `.env` del agente

Agregar al `.env` del agente (típicamente sentinel):

```bash
# ~/siriusos/orgs/<org>/agents/<agent>/.env
ANTHROPIC_USAGE_SESSION_KEY=sk-ant-sid01-...   # NUNCA commitear este archivo
ANTHROPIC_USAGE_ORG_ID=abcd1234-...
ANTHROPIC_USAGE_CHAT_ID=270021643              # chat_id de Mario para alertas 401
```

`.env` ya está en `.gitignore` raíz del repo siriusos. El daemon lo carga al `start <agent>`. Reiniciar el agente tras editar:

```bash
siriusos restart sentinel
```

### 4. Smoke test manual

```bash
cd ~/siriusos/community/skills/anthropic-usage
tsx usage-fetch.ts --once
# stdout: { "session_pct": 17, "weekly_pct": 7, ... }
# escribe a ~/.siriusos/<instance>/state/sentinel/anthropic_usage.json
```

Si responde 401 → la cookie ya expiró antes de empezar (o se copió mal). Re-hacer paso 1.

---

## Comando

```bash
tsx ~/siriusos/community/skills/anthropic-usage/usage-fetch.ts [opciones]
```

Opciones:

| Flag | Descripción |
|---|---|
| `--once` | Una fetch + escribe JSON, sale. Default. |
| `--discover-org` | Imprime el `org_id` derivado del `sessionKey` y sale. Para setup. |
| `--output PATH` | Override del path de salida (default: `~/.siriusos/<instance>/state/<agent>/anthropic_usage.json`). |
| `--no-telegram` | No mandar alertas en 401 (útil en debug). |
| `-h, --help` | Ayuda. |

Lee del entorno: `ANTHROPIC_USAGE_SESSION_KEY`, `ANTHROPIC_USAGE_ORG_ID`, `ANTHROPIC_USAGE_CHAT_ID`, `BOT_TOKEN` (este último ya está en el `.env` del agente).

---

## Output: `anthropic_usage.json`

Path:
```
~/.siriusos/<instance>/state/<agent>/anthropic_usage.json
```

Shape:

```json
{
  "status": "ok",
  "session_pct": 7,
  "weekly_pct": 9,
  "weekly_pct_opus": null,
  "weekly_pct_sonnet": 6,
  "session_resets_in_min": 151,
  "session_resets_at_utc": "2026-06-04T18:30:00.038758+00:00",
  "weekly_resets_day": "jueves",
  "weekly_resets_at_utc": "2026-06-09T00:00:00.038776+00:00",
  "fetched_at": "2026-06-04T15:59:12Z"
}
```

> Mapeo confirmado vía `--debug-raw` (2026-06-04). El endpoint usa
> `utilization` y `resets_at` (no `utilization_pct` / `reset_at` que la
> docs OSS sugería). `weekly_pct_opus` puede venir `null` en planes sin
> bucket dedicado para Opus; en ese caso usar `weekly_pct` como métrica
> agregada. `weekly_pct_sonnet` agregado para tracking por-modelo.

Campo `status`:
- `"ok"` — fetch exitoso, datos frescos.
- `"stale"` — el JSON existe pero `fetched_at` tiene >90 min → significa que el cron no pudo correr en el último ciclo (red, daemon caído, etc.) pero la cookie sigue válida hasta donde sabemos. Sentinel debe ignorar `session_pct` y caer a su fallback.
- `"expired"` — última fetch devolvió 401/403; la cookie hay que renovarla. Mario recibió Telegram. Sentinel también debe caer a fallback.
- `"error"` — fallo inesperado (timeout, JSON corrupto, etc.). Mensaje en `error_message`.

El campo `weekly_pct_opus` viene aparte porque Anthropic trackea un bucket dedicado para Opus en Max plans. Útil si querés alertas distintas para Opus vs Sonnet.

---

## Cron en Sentinel

Agregar al `crons` array del `config.json` de sentinel:

```json
{
  "name": "anthropic-usage-fetch",
  "type": "recurring",
  "interval": "10m",
  "prompt": "Run: tsx ~/siriusos/community/skills/anthropic-usage/usage-fetch.ts --once"
}
```

> No bajar de `10m`. Anthropic NO publica rate limits del endpoint interno pero la convención de la comunidad OSS (3 proyectos auditados) es ≥5min. 10min da margen.

---

## Manejo de errores

| Caso | Comportamiento |
|---|---|
| `200 OK` | Parsea, escribe JSON con `status:"ok"`, exit 0. |
| `401 Unauthorized` o `403 Forbidden` | Escribe JSON con `status:"expired"`, manda Telegram a `ANTHROPIC_USAGE_CHAT_ID` con instrucciones de renovación, exit 1. |
| `429 Too Many Requests` | Escribe JSON con `status:"stale"` (no machaca el último `ok` exitoso), exit 2. Reintenta en el siguiente cron. |
| Network timeout (15s) | Escribe `status:"stale"`, exit 2. |
| JSON malformado | Escribe `status:"error"` con mensaje, exit 3. |

El Telegram en 401 va por `https://api.telegram.org/bot<BOT_TOKEN>/sendMessage` directo (no por el bus de agentes), porque cuando esto pasa el agente Sentinel puede estar bloqueado esperando datos.

---

## Renovar la cookie

Cuando recibís un Telegram tipo "anthropic-usage: sessionKey expirada":

1. Repetir el paso 1 del setup (DevTools → copy sessionKey).
2. Editar `.env` del agente:
   ```bash
   nano ~/siriusos/orgs/<org>/agents/<agent>/.env
   # cambiar ANTHROPIC_USAGE_SESSION_KEY=...
   ```
3. Reiniciar el agente (para que el daemon recargue el `.env`):
   ```bash
   siriusos restart sentinel
   ```

Duración típica del `sessionKey`: 1–28 días según `Settings > Security > Session security` en claude.ai. Default observado: ~14 días con uso activo.

---

## Riesgo y zona gris

- Anthropic **no expone una API pública oficial** para usage de planes consumer. Issue abierto en `anthropics/claude-code` pidiendo justamente esto. La comunidad usa este endpoint vía cookie como workaround.
- Los Términos de Servicio de claude.ai prohíben genéricamente "acceso automatizado al Service sin permiso". Leer tu propio % de uso con tu propia cookie es **zona gris** — no hay precedente de takedown contra proyectos OSS que hacen esto (Claude-Usage-Tracker, claude-usage-app, Usage4Claude llevan meses activos), pero técnicamente podría caer bajo "automated means".
- Mitigaciones aplicadas: 1 fetch cada 10 min (no segundos), User-Agent de navegador real, sin paralelizar, sin compartir cookie entre máquinas.
- Si Anthropic publica eventualmente una API oficial para esto, este skill se retira.

**El usuario asume el riesgo de uso.** Documentado para transparencia.

---

## Limitaciones

- Solo plan claude.ai consumer (Pro, Max 5x, Max 20x). NO funciona para API tier (esos usan `api.anthropic.com/v1/organizations/usage_report`).
- Cookie por máquina. Si Mario rota entre laptop/Mac Studio, cada host necesita su propia copia del `sessionKey` (la cookie es por device-session).
- Sin retroactividad: si el script no corre durante X horas, no podés reconstruir el uso de esas horas.

---

## Roadmap

- **v2**: soporte multi-agente (mismo `sessionKey` pero distintos `anthropic_usage.json` por agente, útil si más de uno quiere consumir).
- **v3**: fallback automático al endpoint oficial `api.anthropic.com/v1/organizations/usage_report` cuando Anthropic finalmente lo publique para Max/Pro.
- **Headless** (Mac sin GUI): usar Playwright para abrir claude.ai, capturar la cookie sin DevTools manual. Investigar si vale el costo de la dependencia.

---

## Referencias OSS

Endpoint y shape JSON confirmados contra:

- [hamed-elfayome/Claude-Usage-Tracker](https://github.com/hamed-elfayome/Claude-Usage-Tracker) — Swift/SwiftUI macOS.
- [thanoban/claude-usage-app](https://github.com/thanoban/claude-usage-app) — C#/.NET Windows tray.
- [f-is-h/Usage4Claude](https://github.com/f-is-h/Usage4Claude) — macOS menubar.
- [jens-duttke/usage-monitor-for-claude](https://github.com/jens-duttke/usage-monitor-for-claude) — fallback con OAuth token, no cookie.
