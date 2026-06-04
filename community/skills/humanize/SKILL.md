---
name: humanize
description: "Detecta y reescribe frases con estructura formulaica de IA en borradores antes de publicar. Filtro QA del pipeline Content→Codex→publicar. Patrones extensibles en patterns.json. Modo `scan` lista findings; modo `rewrite` aplica reemplazos determinísticos o marca con comentarios inline para reescritura humana / Codex."
triggers: ["humanize", "limpia frases IA", "ai-detectable", "ai detectable phrases", "filtro pre-publicación", "scan formulaic", "rewrite formulaic", "antes de publicar"]
tags: [content, qa, publishing, pipeline, regex]
version: 1
---

# Humanize — filtro de frases con sabor a IA

Detecta estructuras retóricas formulaicas que delatan texto generado por LLM en borradores publicables (LinkedIn, propuestas, REGIA, ObservatorioIA, etc.) y los marca para reescritura.

Spec original en `MEMORY.md` → [[avoid-ai-detectable-phrases]]. La regla: "si una frase suena como algo que cualquier IA escribiría, reescribirla."

---

## Cuándo usar

- **Pipeline pre-publicación**: Content genera draft → `humanize --mode scan` → si findings, `humanize --mode rewrite` → revisión humana o Codex → publicar.
- **QA puntual**: antes de mandar una propuesta, post, o artículo, correr scan para verificar que no quedaron clichés.
- **Auditoría retroactiva**: pasar archivos `.md` ya publicados para ver cuántos clichés se nos colaron.

## Cuándo NO usar

- Sobre código, JSON, frontmatter o markdown puramente técnico. El skill se enfoca en prosa.
- Para reescritura creativa con LLM. Este skill es determinístico — solo aplica patrones de `patterns.json` y deja marcadores donde no hay reemplazo fijo. Si Mario quiere reescritura asistida con modelo, eso es Codex en el siguiente paso del pipeline.

---

## Uso desde la CLI

### Modo scan (default)

Lista findings en JSON a stdout. Exit code 1 si hay findings (útil como gate de CI / cron):

```bash
echo "La pregunta no es si Costa Rica adoptará IA, la pregunta es cuándo." \
  | tsx ~/siriusos/community/skills/humanize/humanize.ts --mode scan
```

```bash
tsx ~/siriusos/community/skills/humanize/humanize.ts --mode scan --file draft.md
```

Salida ejemplo:
```json
{
  "findings": [
    {
      "pattern_id": "no-es-x-es-y",
      "reason": "Estructura formulaica 'La pregunta no es X, la pregunta es Y' — marcador clásico de texto IA.",
      "severity": "high",
      "matched_text": "La pregunta no es si Costa Rica adoptará IA, la pregunta es",
      "line": 1,
      "column": 1,
      "start": 0,
      "end": 59,
      "suggestion": null
    }
  ],
  "total": 1,
  "by_severity": { "high": 1 }
}
```

### Modo rewrite

Aplica reemplazos. Si el patrón tiene `suggestion` fija en `patterns.json`, lo usa. Si `suggestion = null`, marca la frase con un comentario inline `<!-- HUMANIZE[...]: razón. Frase original: "..." -->` para que Codex (o un humano) la reescriba con contexto. Texto corregido va a stdout; findings van a stderr.

```bash
tsx ~/siriusos/community/skills/humanize/humanize.ts --mode rewrite --file draft.md > clean.md
```

### Patrones custom

```bash
tsx ~/siriusos/community/skills/humanize/humanize.ts --mode scan \
  --patterns ./my-patterns.json --file draft.md
```

### Saltarse un bloque manualmente

Si un draft necesita citar literalmente una frase formulaica (ej. análisis crítico del propio cliché), envolver el bloque:

```markdown
<!-- HUMANIZE-IGNORE -->
"La verdadera pregunta es..." — frase típica de IA según Aldo Coghi.
<!-- /HUMANIZE-IGNORE -->
```

El scan respeta esos rangos.

---

## Pipeline integrado

Flujo recomendado por el orquestador:

```bash
# 1. Content genera draft
content_draft="draft-2026-06-04.md"

# 2. Scan rápido — si limpio, pasa a Codex directo
if tsx humanize.ts --mode scan --file "$content_draft" >/dev/null 2>findings.json; then
  echo "draft limpio, mandando a Codex..."
  codex fact-check "$content_draft"
else
  # 3. Hay findings — rewrite con marcadores inline
  tsx humanize.ts --mode rewrite --file "$content_draft" > "${content_draft%.md}-humanized.md" 2>findings.json
  echo "draft marcado para reescritura. Findings en findings.json. Revisar antes de fact-check."
fi
```

---

## patterns.json — blacklist extensible

Shape de cada entrada (ver `patterns.json` del skill):

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string (kebab-case) | Identificador único del patrón. Aparece en findings. |
| `pattern` | string | Regex JavaScript-flavor. Se usa con flag `g` siempre. |
| `flags` | string | Flags adicionales. Default `iu` (case-insensitive + unicode). |
| `reason` | string | 1 línea explicando por qué es problemático. Va al finding y al comentario inline. |
| `suggestion` | string \| null | Si string: reemplazo determinístico en modo rewrite. Si null: se inserta comentario inline. |
| `severity` | `high` \| `medium` \| `low` | Severidad del finding. |
| `examples_bad` | string[] | Ejemplos del patrón para documentación. |

### Patrones iniciales (5)

1. **`no-es-x-es-y`** — "La pregunta no es X, la pregunta es Y" (high)
2. **`no-se-trata-de-x-se-trata-de-y`** — "No se trata de X, se trata de Y" (high)
3. **`en-un-mundo-donde`** — "En un mundo donde…" como opener (high)
4. **`la-verdadera-pregunta-es`** — "La verdadera pregunta es…" (high)
5. **`mas-que-x-es-y`** — "Más que X, es Y" (medium)

### Agregar un patrón nuevo

1. Identificar la estructura formulaica con ≥2 ejemplos reales que hayan disparado.
2. Escribir un regex en JavaScript flavor. Probarlo en https://regex101.com (modo JavaScript).
3. Agregar la entrada a `patterns.json`.
4. Bumpear el campo `version` y `updated`.
5. Correr el skill contra un draft conocido para validar que no genera falsos positivos.

No se requiere PR si quien agrega es Content / Codex / Developer — el archivo es texto plano y el skill lo relee en cada invocación.

---

## Exit codes

| Code | Significado |
|---|---|
| 0 | scan sin findings (texto limpio), o rewrite exitoso |
| 1 | scan con findings — usar como gate en CI/cron |
| 2 | error de I/O o JSON inválido |

---

## Limitaciones conscientes

- **No usa LLM** — el skill es determinístico por diseño (predecible, auditable, sin coste por invocación). Si querés reescritura asistida, encadenar con Codex.
- **Solo español** por ahora — los patrones están en español. Para EN/PT habría que armar `patterns-en.json` y pasarlo con `--patterns`.
- **No corrige el estilo general** — solo detecta los patrones de la blacklist. Tono, voz y argumentación siguen siendo responsabilidad humana / Codex.
- **Falsos positivos posibles** — si un regex dispara en contexto legítimo, usar el bloque `<!-- HUMANIZE-IGNORE -->`.

---

## Mantenimiento

- **Blacklist drift**: Mario o Codex agregan patrones cuando detectan nuevos clichés. Ese mantenimiento es continuo.
- **Versionado**: bumpear `version` en `patterns.json` cuando se agregan/quitan patrones permite que pipelines downstream detecten cambios.
- **Auditoría**: correr el skill sobre todo un repo de drafts/publicados cada 1-2 meses para ver qué patrones siguen apareciendo y refinar.
