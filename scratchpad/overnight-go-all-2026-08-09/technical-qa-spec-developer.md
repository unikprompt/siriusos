---
title: Especificacion de QA tecnico read-only para activos UnikPrompt
author: developer (SiriusOS)
date: 2026-08-09
type: qa-spec
basis: audit-technical-assets-developer-2026-08-08.md
mode: read-only (sin enviar formularios, instalar, modificar, desplegar ni reiniciar)
---

# QA tecnico de activos UnikPrompt (spec read-only)

Especificacion reutilizable para verificar formularios, analytics, despliegues y reconciliacion (repo vs sitio vivo vs nota canonica). Deriva de la auditoria del 8-ago. Todo check es de inspeccion no mutante: lectura de codigo/config, `curl -I` a URLs publicas y parseo de artefactos. NUNCA se envia un formulario real (dispararia un correo via Resend), no se instala ni se despliega.

## Activos en alcance

| ID | Activo | Repo | URL | Deploy |
|----|--------|------|-----|--------|
| A1 | unikprompt.com | mperedwa/landing-mario, subdir `superior-saturn` | www.unikprompt.com | Vercel `superior-saturn` |
| A2 | regia.unikprompt.com | mperedwa/regia-website | regia.unikprompt.com | Vercel `regia-website` |
| A3 | UNIKPROMPT-PPPs | mperedwa/unikprompt-ppps | (sin publicar) | ninguno |
| A4 | Landing_Mario root | mperedwa/landing-mario (root) | (rediseno WIP) | ninguno |

## Severidades

- **Critical**: rompe conversion o expone datos (form caido, endpoint 500, secreto en cliente).
- **High**: perdida de medicion o inconsistencia visible (analytics ausente, URL viva != declarada).
- **Medium**: desalineacion no visible al usuario (nota Obsidian stale, dist desfasado del commit).
- **Low**: higiene (falta `<title>`, prototipo sin publicar).

## Matriz de checks

### Categoria: Formularios (F)

| ID | Check | Metodo read-only | Evidencia esperada | Severidad si falla | PASS / FAIL |
|----|-------|------------------|--------------------|--------------------|-------------|
| F1 | Endpoint del form existe y no es 404 | `curl -sI <site>/api/contact` (y `/api/subscribe` en A1) | HTTP != 404 (405/400 aceptable sin body) | Critical | PASS si responde != 404; FAIL si 404 |
| F2 | Servicio de envio correcto (Resend) | grep `new Resend`, `resend.emails.send` en `src/pages/api/*` | Resend instanciado con `RESEND_API_KEY` | Critical | PASS si usa Resend con key desde env |
| F3 | Guard de env var presente | grep `RESEND_API_KEY` + rama de error si falta | log/return 500 controlado si no hay key | High | PASS si hay guard; FAIL si asume key |
| F4 | from/to canonicos | grep `from:` / `to:` en el endpoint | `mario@unikprompt.com` (dominio verificado en Resend) | High | PASS si from/to == canonico |
| F5 | Sin secretos en cliente | grep `re_[A-Za-z0-9]` en `src` y en `dist` build | 0 hits de API keys en artefactos servidos | Critical | FAIL si aparece una key en cliente |
| F6 | Validacion + sanitizacion de input | leer el handler (escapeHtml, validacion de email) | input escapado antes de render/email | Medium | PASS si escapa/valida |

### Categoria: Analytics (AN)

| ID | Check | Metodo read-only | Evidencia esperada | Severidad si falla | PASS / FAIL |
|----|-------|------------------|--------------------|--------------------|-------------|
| AN1 | Analytics presente | grep `gtag`, `G-[A-Z0-9]{6,}`, `@vercel/analytics`, `plausible` en `src`/`dist` | al menos un tracker cargado | High | PASS si hay tracker; FAIL si ninguno |
| AN2 | ID correcto y unico | extraer el ID (`G-VBWPJTN2HT` en A1) | mismo ID en todas las paginas, sin duplicados | Medium | PASS si ID consistente |
| AN3 | Cargado en todas las rutas | verificar el layout/base incluye el snippet | snippet en `<head>` compartido | Medium | PASS si global |
| AN4 | Paridad entre sitios | comparar A1 vs A2 | decision explicita si un sitio no mide | High | FAIL si un sitio deberia medir y no mide |

### Categoria: Deploys / Proyectos (D)

| ID | Check | Metodo read-only | Evidencia esperada | Severidad si falla | PASS / FAIL |
|----|-------|------------------|--------------------|--------------------|-------------|
| D1 | Proyecto Vercel enlazado | leer `.vercel/project.json` | `projectId` + `projectName` presentes | High | PASS si linkeado |
| D2 | `site` en config == dominio real | grep `site:` en `astro.config.mjs` | `https://www.unikprompt.com` / `https://regia.unikprompt.com` | High | PASS si coincide con el vivo |
| D3 | Sitio vivo responde 200 | `curl -sI <url>` | HTTP 200 en el dominio primario | Critical | FAIL si != 200/301/302 esperado |
| D4 | Apex redirige a www (A1) | `curl -sI https://unikprompt.com` | 307/308 -> www | Medium | PASS si redirige |
| D5 | `output`/adapter coherente | grep `output:` + adapter | static (A1) / server (A2) coherente con el uso | Medium | PASS si coherente |
| D6 | dist en sync con el commit | comparar mtime `dist/` vs `git log -1 --format=%cs` | dist >= ultimo commit | Medium | PASS si dist no es mas viejo que el commit |

### Categoria: Reconciliacion repo / vivo / Obsidian (R)

| ID | Check | Metodo read-only | Evidencia esperada | Severidad si falla | PASS / FAIL |
|----|-------|------------------|--------------------|--------------------|-------------|
| R1 | URL declarada == viva | comparar `site:` config vs `curl` 200 | coinciden | High | FAIL si difieren |
| R2 | Nota Obsidian refleja el deploy real | leer `Projects/UnikPromptLanding/index.md`, `Projects/Unikprompt/index.md` | plataforma/estado == realidad (Vercel, live) | Medium | FAIL si stale |
| R3 | Correo canonico unico | grep `mailto:` y `to:` en ambos sitios | `mario@unikprompt.com` consistente | Low | PASS si unico |
| R4 | Prototipos: estado declarado | comparar PPPs (sin deploy) vs cualquier nota que los liste | "no publicado" consistente | Low | PASS si consistente |

## Plan de prueba (ejecucion read-only)

1. **Preparacion**: clonar/usar los repos locales ya presentes (`~/Code/Landing_Mario/superior-saturn`, `~/Code/regia-website`, `~/Code/UNIKPROMPT-PPPs`). No `npm install`, no build.
2. **Estatico (repo)**: correr los greps de F2..F6, AN1..AN3, D1..D2, D5, R3 sobre `src/` y sobre `dist/` cuando exista. Registrar hits exactos (archivo:linea).
3. **Vivo (no mutante)**: `curl -sI` a las URLs primarias y al apex (D3, D4, F1). Solo HEAD/GET de estado, jamas POST a `/api/*` con datos reales.
4. **Reconciliacion**: leer las 3 notas canonicas en Obsidian (solo lectura) y comparar URL/plataforma/estado con lo hallado (R1, R2, R4).
5. **Reporte**: por cada check, PASS/FAIL + evidencia exacta + severidad. Un FAIL Critical bloquea "listo para produccion".

## Resultado baseline (segun auditoria 8-ago)

| Check | A1 unikprompt.com | A2 regia | Nota |
|-------|-------------------|----------|------|
| F1 endpoint | PASS (`/api/contact`, `/api/subscribe`) | PASS (`/api/contact`) | |
| F2 Resend | PASS | PASS | ambos Resend |
| F4 from/to | PASS (`mario@unikprompt.com`) | PASS | |
| AN1 analytics | PASS (GA4 `G-VBWPJTN2HT`) | **FAIL** | gap: regia sin tracker |
| AN4 paridad | **FAIL** | | A2 no mide |
| D1 Vercel link | PASS (`superior-saturn`) | PASS (`regia-website`) | |
| D3 live 200 | PASS (www 200) | PASS (200) | |
| D4 apex->www | PASS (307) | n/a | |
| D6 dist sync | PASS (2026-07-06 = commit) | PASS (2026-06-15 > 2026-06-08) | |
| R2 Obsidian | **FAIL** | PASS | UnikPromptLanding/index.md dice "TBD deploy" |

**Hallazgos abiertos priorizados**: (1) AN1/AN4 High: regia.unikprompt.com sin analytics; (2) R2 Medium: nota UnikPromptLanding stale; (3) Low: 8 PPPs sin publicar; Landing_Mario root rediseno WIP sin decision.

## Pendiente de verificacion (no ejecutado aqui; requiere correr el plan)

- F5 (secretos en cliente): grep `re_` sobre `dist/` de A1/A2 para confirmar 0 hits. No corrido en esta spec; incluido como check obligatorio Critical.
- AN3 (snippet global): confirmar que el GA4 esta en el layout base y no solo en index.

---
*Spec read-only. No se envio ningun formulario, no se instalo, modifico, desplego ni reinicio nada. Evidencia base: audit-technical-assets-developer-2026-08-08.md.*
