---
title: Lista P0 de decisiones web UnikPrompt (MYPE)
author: developer (SiriusOS)
date: 2026-08-12
type: decision-list
basis: claims-evidence-register-uniprompt-codex-2026-08-09.md + auditorias canonicas de Strategy
mode: solo diseno de decisiones (no modifica web, landing, repos ni despliegues; cero acciones externas)
---

# Lista ejecutiva P0 de decisiones web UnikPrompt (MYPE)

Convierte el registro canonico de claims (C-01 a C-41) y la matriz de gaps en decisiones accionables. Cada fila lleva: superficie, claim, evidencia actual, riesgo, decision (retirar / reetiquetar / respaldar / separar), copy seguro, accion tecnica y approval requerido. Nada se ejecuta aqui: es la lista para que Mario apruebe antes de tocar la web.

## Regla de decision

- **Retirar**: sacar el claim o el dato hasta tener expediente (numeros/efectos sin fuente, enlaces rotos).
- **Reetiquetar**: bajar el grado de afirmacion al estado probado (de "Implementado"/"Caso aplicado" a "activo publico/prototipo/piloto").
- **Respaldar**: se puede conservar si se enlaza evidencia proporcional (CV, caso autorizado, version, QA).
- **Separar**: partir capas mezcladas (sitio publico vs precision; pequena vs micro; cargo vs afiliacion).

## P0 critico (riesgo mas alto, decidir primero)

| ID | Superficie | Claim (resumen) | Evidencia actual | Riesgo | Decision | Copy seguro | Accion tecnica | Approval |
|----|------------|-----------------|------------------|--------|----------|-------------|----------------|----------|
| C-20 | `/#projects` todas las tarjetas | "Caso aplicado" en todas + 5 badges "Implementado" | Etiqueta renderizada incondicional en `ProjectCard.astro:45-48`; estados en `Projects.astro:33-68`. El label no aporta evidencia de cliente. | Critico | Reetiquetar | Etiqueta por expediente: "activo publico" / "prototipo" / "piloto" / "caso autorizado". Nunca "Implementado" sin prueba. | Quitar el label incondicional en `ProjectCard.astro:45-48`; mapear estado real por tarjeta en `Projects.astro`. | Mario (copy publico) |
| C-24 | `/#projects` PFRAM/FiscScope | "Implementado", riesgo fiscal APP con metodologia FMI/Banco Mundial | `Projects.astro:53-57` lo marca `production`, sin URL ni repo; sin validacion ni permiso. Implica endorsement FMI/BM. | Critico | Retirar (o degradar) | "Herramienta/prototipo historico" sin enlace institucional; sin nombrar FMI/BM como aval. | Cambiar estado `production` a prototipo o quitar la tarjeta hasta enlace+version+metodologia. | Mario + fact-check |
| C-25 | `/#projects` Tribunal RAK | "Implementado"; "8.200+ resoluciones" y mejora de tiempo/consistencia | `Projects.astro:58-62` `production`, sin URL, corpus, permiso, baseline ni metricas. | Critico | Retirar | Sin numero ni efectos: "exploracion/prototipo" hasta expediente (procedencia/permiso del corpus, metodo, evaluacion). | Retirar el "8.200+" y los efectos del copy; bajar estado a prototipo. | Mario + fact-check |

## P0 alto (alto riesgo, mismo lote de aprobacion)

| ID | Superficie | Claim (resumen) | Evidencia actual | Riesgo | Decision | Copy seguro | Accion tecnica | Approval |
|----|------------|-----------------|------------------|--------|----------|-------------|----------------|----------|
| C-02 | `/#consulting` "Empiece aqui" | Diagnostico "$1.200 USD", "Precio fijo 2 semanas" | `content.ts:52-67`; scope PYME en `draft` propone rango distinto (USD 800-1.500). | Alto | Respaldar | Publicar alcance, exclusiones, jurisdiccion, vigencia de precio y calificacion. Presentar como oferta, no servicio vendido. | Alinear precio con `scope-pyme-servicios.md`; anadir bloque de terminos. | Mario |
| C-03 | `/#consulting` oferta de entrada | "puede ahorrar tiempo, reducir errores o mejorar resultados" | `content.ts:57-58`; el doc PYME describe metodo, no resultados de clientes. | Alto | Reetiquetar | "Identifica oportunidades candidatas" salvo que cada beneficio tenga linea base + caso autorizado. | Editar copy en `content.ts:57-58`. | Mario |
| C-08 | `/#consulting` automatizacion | Mapeo 10-20 procesos, 3-5 pilotos, medicion vs baseline, escalamiento | `content.ts:23-27`; sin evidencia de pilotos ni mediciones. | Alto | Reetiquetar | "Podemos disenar un plan para..." hasta tener pilotos con base, resultado, periodo y autorizacion. | Editar `content.ts:23-27`. | Mario |
| C-12 | `/#consulting` linea PYME | Acompanamiento PYME 10-100 con diagnostico/automatizacion/talleres | `ui.ts:32`, `Consulting.astro:121-124`; unico scope `draft`, no cubre micro, sin clientes. | Alto | Separar | Separar "pequena" de "micro"; publicar oferta y elegibilidad; no extender a micro ni a resultados previos. | Definir segmento en copy; no comercializar micro sin oferta definida. | Mario |
| C-13 | `/#consulting` credenciales | 15+ anos; rol en Unidad APP de Hacienda; coordinacion BM/BID/IFC/BCIE | `ui.ts:30`, `Consulting.astro:126-140`; sin CV/perfil/fecha/autorizacion enlazada. | Alto | Respaldar / Separar | Conservar solo lo enlazable a CV/perfil oficial; separar cargo, periodo, funciones; evitar inferir afiliacion/endorsement. | Enlazar CV o abreviar bio; separar afirmaciones. | Mario + fact-check |
| C-22 | `/#projects` Sirius-Lex | "Implementado"; analisis art. por art., "fuentes verificadas" | `siriuslex.com` 200 + repo; sin validacion de detecciones ni trazabilidad. | Alto | Separar | Separar "sitio/activo publico" de precision/trazabilidad; anadir corpus, version, revision humana antes de "servicio implementado". | Reetiquetar tarjeta a activo publico; separar atributos. | Mario |
| C-23 | `/#projects` SiriusOS | "Implementado"; 24/7 con recuperacion automatica | `siriusos.unikprompt.com` 200 + codigo; sin verificar 24/7/SLO/cliente. | Alto | Separar | "Framework/activo publico" + enlace repo/release; respaldar 24/7 con monitor/pruebas antes de usarlo como capacidad. | Reetiquetar; enlazar release; no afirmar SLO. | Mario |
| C-26 | `/#projects` AduanaID | "Caso aplicado" + badge "Piloto" | `Projects.astro:63-67` `mvp` pero `ProjectCard.astro:45-48` fuerza "Caso aplicado"; sin enlace ni evidencia. | Alto | Reetiquetar | "Piloto/prototipo" solo si hay expediente; retirar "Caso aplicado" hasta documentar participante/periodo/resultado. | Corregir label via el fix de C-20. | Mario |
| C-33 | `regia.unikprompt.com` pilar/autor | Instrumentos "listos para usar"; REGIA "desarrollada y probada" | Sin validacion de instrumentos con clientes ni expediente de producto. | Alto | Reetiquetar | "Instrumentos definidos/priorizados" y "metodologia desarrollada a partir de experiencia" hasta QA/casos/resultados. | Editar copy REGIA. | Mario |
| C-34 | `regia.unikprompt.com/cr/` | "76 lineamientos, 52 cubiertos, 24 gaps, 6 instrumentos" | Matriz de trazabilidad respalda el mapeo; los 6 instrumentos no estan empaquetados/validados/usados. | Alto | Separar | Cifras como resultado de matriz versionada; separar "6 instrumentos especificados" de "6 operando". | Ajustar copy `/cr/`. | Mario |
| C-35 | `regia.unikprompt.com/cr/` CTAs CNTD | 3 niveles entregan cumplimiento, instrumentos operando y evidencia auditable | `oferta-comercial-regia-cr.md`; paquetes descritos, sin contratos/entregas/resultados. | Alto | Reetiquetar | Presentar como alcance propuesto; condicionar resultados a caso/responsables/revision; no afirmar cumplimiento obtenido. | Editar copy CTAs. | Mario |
| C-39 | `diagnostico-cntd.unikprompt.com` | Niveles prometen capacidades instaladas y evidencia auditable sostenida | Alcance documentado, sin evidencia de ejecucion institucional ni conversion. | Alto | Reetiquetar | "Acompanamiento propuesto"; medir cada outcome antes de llamarlo resultado. | Editar copy "Proximos pasos". | Mario |
| C-30 | `/en/` | La version EN replica C-01..C-29; AduanaID EN dice "case designed" vs ES "Caso aplicado" | Inconsistencia de grado entre idiomas. | Medio-Alto | Separar / alinear | Mismo estado probatorio en ES y EN (prototipo/piloto) hasta expediente. | Alinear `content.ts:137-264` y `ui.ts:113-170` con el estado real. | Mario |
| C-41 | `toolkit-playbook-cr.unikprompt.com` | Recurso/toolkit disponible por ese dominio | DNS no resolvio al 9-ago; `aitoolkit.unikprompt.com` si responde. | Medio | Retirar | No enlazar el dominio roto; revalidar el destino canonico antes de cualquier correccion publica. | Quitar/redirigir el enlace roto; apuntar al canonico. | Mario |

## Lote y orden de ejecucion (post-approval)

1. **Primero C-20** (arregla labels de todas las tarjetas de una): quita el "Caso aplicado" incondicional y mapea estado real. Habilita C-24, C-25, C-26.
2. **Retiros de dato/enlace** (C-24, C-25, C-41): sacan numeros/efectos/enlaces sin expediente. Menor riesgo de romper diseno.
3. **Reetiquetados de copy** (C-03, C-08, C-33, C-35, C-39, C-30): edicion de texto en `content.ts`.
4. **Respaldos** (C-02, C-13): requieren material nuevo (terminos, CV) antes de tocar copy.
5. **Separaciones de capa** (C-12, C-22, C-23, C-34): definir oferta/segmento y separar atributos.

## Controles

- Todas las acciones tecnicas son en `~/Code/Landing_Mario/superior-saturn` y las paginas REGIA/CNTD; NINGUNA se ejecuta sin GO de Mario y en un proyecto separado con QA (ver technical-qa-spec-developer).
- Los items con fact-check (C-13, C-24, C-25) exigen verificacion antes de reescribir.
- Se preservan los controles ya sanos: disclaimers C-36 (REGIA no oficial), C-38 (CNTD no oficial), C-40 (prototipo no oficial). No tocar.
- Hechos comunicables hoy sin cambio: landing publicada; ObservatorioIA/Sirius-Lex/SiriusOS con destino publico 200; oferta y metodo como artefactos (no como entrega).

---
*Lista de decisiones read-only. No modifica web, landing, repos ni despliegues; cero acciones externas. Fuente: claims-evidence-register-uniprompt-codex-2026-08-09.md.*
