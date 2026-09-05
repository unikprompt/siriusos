---
title: Plan tecnico ejecutable por fases MYPE/VIP
author: developer (SiriusOS)
date: 2026-08-12
type: technical-plan
sources_traced:
  - paquete-ajustes-uniprompt-mype-2026-08-09.md (sha256 926ed9e7...)
  - plan-activacion-mype-vip-agents-2026-08-12.md (sha256 1b78c13f...)
  - paquete-decision-viernes-mype-vip-agents-codex-2026-08-12.md (sha256 1f9a5d68...)
  - lista-p0-decisiones-web-mype-developer-2026-08-12.md
mode: solo diseno del plan (cero codigo, web, repo, deploy, produccion ni gasto)
---

# Plan tecnico ejecutable por fases MYPE/VIP

Traza los tres documentos fuente canonicos (paquete-ajustes, plan-activacion, paquete-decision) y la lista P0 web hacia workstreams tecnicos con estados DONE/READY/BLOCKED y fases P0 a P3. No re-lista trabajo ya cerrado: lo marca DONE. La ejecucion (web, datos reales, activacion, gasto, hosting, otro negocio) queda detras de su gate canonico. Nada se ejecuta aqui.

## Estado del trabajo ya producido (DONE, no reabrir ni re-listar)

- Registro canonico de claims C-01 a C-41 (`claims-evidence-register-uniprompt-codex-2026-08-09`).
- Auditoria tecnica de activos (`audit-technical-assets-developer-2026-08-08`).
- Lista P0 de decisiones web (`lista-p0-decisiones-web-mype-developer-2026-08-12`).
- Especificacion de QA tecnico (`technical-qa-spec-developer-2026-08-09`).
- Diseno de dedup de mensajes tardios (`dedup-design-developer-2026-08-09`).
- Paquete de ajustes, plan de activacion y paquete de decision del viernes (fuentes de este plan).
- Kit de descubrimiento MYPE (`kit-descubrimiento-mype-analista-2026-08-09`).

Estos artefactos son insumo. Las tareas nuevas de abajo NO los repiten; parten de ellos.

## Estados usados

- **DONE**: ya producido; no entra en la ruta nueva.
- **READY**: diseno/preparacion interna que puede iniciar hoy, read-only, sin tocar web, datos, repos de produccion ni gasto.
- **BLOCKED**: requiere un gate (GO-1 a GO-9, gate de acceso 5/5, Gate 1, GO-PILOT, fact-check o QA).

## Workstreams y tareas

| ID | WS | Tarea | Estado | Fase | Superficie / repo | Dependencias | QA | Riesgo | Responsable | Gate |
|----|----|-------|--------|------|-------------------|--------------|----|--------|-------------|------|
| A0 | Web | Lista P0 de decisiones web | DONE | P0 | Strategy | claims register | n/a | n/a | developer | n/a |
| A1 | Web | Mapa de cambios archivo:linea por decision P0 + drafts de copy seguro | READY | P0 | `~/Code/Landing_Mario/superior-saturn`, REGIA/CNTD (solo lectura) | A0 | Diff planificado vs registro | Bajo | developer | ninguno para el mapa |
| A2 | Web | Fact-check de C-13/C-24/C-25 contra fuente primaria | READY | P0 | docs locales, CV, fuentes | A0 | Doble verificacion (Codex) | Medio reputacional | developer + analista | ninguno para el fact-check |
| A3 | Web | Aplicar cambios de copy/labels en proyecto separado | BLOCKED | P2 | superior-saturn (branch aislado) | A1, A2, technical-qa-spec | QA spec + smoke | Medio | developer | GO-7 + fact-check + QA + approval Mario |
| B1 | VIP Agents | Mapa de arquitectura y dependencias de `vip-limo-voice-agent` (backend, datos, auth) | READY | P0 | `~/Code/vip-limo-voice-agent` (solo lectura) | plan-activacion | Inventario de gaps SaaS | Bajo | developer | ninguno para el mapa |
| B2 | VIP Agents | Plan de QA del modulo (extiende technical-qa-spec) | READY | P0 | doc separado | B1, technical-qa-spec | Auto-revision | Bajo | developer | ninguno para el plan |
| B3 | VIP Agents | Migracion de backend fuera del Mac + autenticacion | BLOCKED | P2 | vip-limo-voice-agent, infra | B1, B2 | QA + pruebas de fallo | Alto | developer | GO-8 (gasto/hosting) + GO-5 + QA |
| C1 | VIP Limo | Especificar metrica primaria NEUTRAL (medible igual manual y por modulo) | READY | P0 | doc de especificacion | paquete-decision (metrica comun elegible) | Revision analista | Medio (raiz del resto) | analista + developer | ninguno para la spec |
| C2 | VIP Limo | Congelar por escrito el contrato del modulo (inputs/outputs/estados) | READY | P0 | doc de contrato | plan-activacion | Revision | Medio | developer + analista | ninguno para el doc |
| C3 | VIP Limo | Disenar baseline y criterios de calidad de datos (sin correr datos reales) | READY | P0 | doc de baseline | C1 | Revision analista | Medio | analista | ninguno para el diseño |
| C4 | VIP Limo | Separar dos scorecards (lab vs gates comerciales) y corregir pseudo-precision | READY | P0 | docs de scorecard | C1 | Revision analista | Medio | analista + developer | ninguno para el diseño |
| C5 | VIP Limo | Correr baseline con datos reales de VIP Limo | BLOCKED | P1 | datos VIP Limo | C1, C2, C3 | Calidad de datos | Alto (datos reales) | analista | GO-1 (contacto Jamie) + GO-4 (baseline autorizado) + sin PII |
| C6 | VIP Limo | Activar el modulo en piloto medible | BLOCKED | P2 | vip-limo-voice-agent | C1-C5, B3 | QA + pruebas | Alto | developer | GO-5 (tras baseline y QA); hoy FAIL por ahora |
| C7 | VIP Limo | Llevar el modulo/solucion a una empresa distinta de VIP Limo | BLOCKED | P3 | comercial + infra | C6 | QA + soporte | Alto | Mario + developer | GO-9 (otro negocio) + GO-8 |
| D0 | MYPE | One-pager del Mapa + guion de entrevista con consentimiento | READY | P0 | doc privado | paquete-decision | Revision | Bajo | developer + analista | ninguno para el asset (uso externo requiere GO-2/GO-3) |
| D1 | MYPE | Plantillas + checklist de aceptacion del diagnostico de una semana | READY | P0 | doc | paquete-decision | Revision | Bajo | developer + analista | ninguno para las plantillas |
| D2 | MYPE | Definir exclusiones, privacidad y consentimiento del flujo | READY | P0 | doc | D1 | Revision | Bajo | analista | ninguno para el doc |
| D5 | MYPE | Fijar cohorte/vertical comparable ANTES de entrevistas | BLOCKED | P1 | comercial | D0 | n/a | Medio | Mario + analista | Gate de acceso 5/5 (5 decisores externos, 1 vertical, 1 pais, hasta 2 semanas). Florida/limo hoy en 1/5 |
| D3 | MYPE | Outreach e entrevistas MYPE | BLOCKED | P1 | comercial | D5, D0, D1, D2 | Guion + consentimiento | Medio | Mario + analista | GO-3 (solo tras el gate de acceso 5/5) |
| D4 | MYPE | Ofrecer, cobrar y ejecutar los 3 Mapas pagados (USD 450, 100% prepago) | BLOCKED | P2 | comercial | D3 + Gate 1 | Alcance escrito + baseline | Medio | Mario | GO-PILOT (tras Gate 1: >=6 mismo problema, >=6 baseline seguro, >=3 aceptan alcance y precio, >=3 fit fuerte) |

## Lo que puede iniciar HOY (READY, P0)

A1, A2, B1, B2, C1, C2, C3, C4, D0, D1, D2. Todas son diseno/especificacion/fact-check read-only. Producen los artefactos que habilitan P1-P3 cuando caen los gates. Ninguna toca web, datos de produccion, el modulo ni implica gasto. La seleccion de cohorte (D5) es P1 porque depende del gate de acceso 5/5, no de una decision de hoy.

## Gates consolidados (canon)

| Gate | Que desbloquea | Precondiciones |
|------|----------------|----------------|
| GO-1 | Contacto/conversacion con Jamie | verificar nombre, rol y autoridad |
| GO-2 | Validar hasta 4 rutas empresariales al owner/decisor (sin pitch ni PII) | D0 |
| Gate de acceso 5/5 | Fijar cohorte/vertical comparable (D5), ANTES de entrevistas | 5 decisores externos, 1 vertical, 1 pais, hasta 2 semanas |
| GO-3 | Outreach e entrevistas MYPE (D3) | gate de acceso 5/5, D0-D2 |
| Gate 1 | Habilita GO-PILOT | >=6 mismo problema, >=6 baseline seguro, >=3 aceptan alcance y precio, >=3 fit fuerte |
| GO-PILOT | Ofrecer, cobrar y ejecutar los 3 Mapas pagados (D4); luego 2 resultados observables y 1 upsell | Gate 1 + fit + prepago USD 450 100% + sin exclusiones |
| GO-4 | Baseline interno de VIP Limo con datos reales (C5) | finalidad, campos, retencion, validador, sin PII |
| GO-5 | Activacion controlada del modulo (C6) | GO-4 + baseline + QA de controles |
| GO-6 | Uso de caso/cita/resultados de VIP Limo | evidencia y autorizacion |
| GO-7 | Ejecucion de cambios web (A3) | A1, A2, fact-check, QA, approval Mario |
| GO-8 | Gasto y hosting (B3, backend fuera del Mac) | autorizacion de costo |
| GO-9 | Llevar el modulo/solucion a otro negocio (C7) | C6 + GO-8 |

Alcance canonico: el paquete-decision aprueba solo la preparacion controlada de una unica oferta (el Mapa) y NO autoriza contacto, activacion, web, repositorio, produccion ni gasto. La secuencia comercial es: fijar cohorte (gate de acceso 5/5) antes de entrevistar, luego GO-3 (entrevistas), luego Gate 1, luego GO-PILOT (3 Mapas). Ofrecer o cobrar un Mapa NO ocurre en GO-3.

## Riesgos transversales

1. **Saltar un gate:** ejecutar una tarea BLOCKED sin su precondicion. Mitigacion: cada BLOCKED lleva su gate explicito.
2. **Metrica no neutral (C1):** contamina baseline, scorecard y claims. Es la dependencia raiz de VIP Limo; hacerla primero.
3. **Copy sin fact-check (A2 antes de A3):** reintroduce el riesgo reputacional que la lista P0 cierra.
4. **Cobrar antes de tiempo:** ofrecer o cobrar un Mapa en GO-3. El cobro/ejecucion es GO-PILOT tras Gate 1.
5. **Entrevistar sin cohorte comparable:** correr entrevistas sin el gate de acceso 5/5 rompe la comparabilidad.

## Controles read-only

- Este memo NO ejecuta nada: cero codigo, web, repo, deploy, produccion ni gasto.
- Los repos (`superior-saturn`, `vip-limo-voice-agent`) solo se leen para los mapas P0.
- Se preservan los controles sanos existentes (disclaimers C-36/38/40) y el freeze de 23.827/Sentinel, sin mezclar con la ruta MYPE/VIP.
- Nombre operativo: **Jamie** (forma canonica, pendiente de verificacion de nombre/rol/autoridad en GO-1).

---
*Plan de fases read-only. Fuentes trazadas: paquete-ajustes (926ed9e7), plan-activacion (1b78c13f), paquete-decision (1f9a5d68) y lista-p0-decisiones-web-mype-developer-2026-08-12. Cero acciones externas.*
