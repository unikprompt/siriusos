---
title: Auditoria del diagnostico CNTD cap.7 y flujo tecnico reusable de formularios MYPE
author: developer (SiriusOS)
date: 2026-08-12
type: audit-and-design
mode: solo diagnostico/diseno (sin deploy, cuentas, secretos ni datos reales)
---

# Auditoria CNTD cap.7 y flujo reusable de formularios hacia Mario

## 1. Ubicacion de la implementacion

- **Repo:** `~/Code/toolkit-playbook-cr` (proyecto Vercel `toolkit-playbook-cr`).
- **Componente del diagnostico:** `src/components/ModuloCntd.tsx` (+ `src/components/cntd/CntdScorecard`, `src/components/cntd/CntdContactForm.tsx`, `src/pdf/CntdPdfDocument`).
- **Endpoint de contacto:** `api/contact.ts` (serverless).
- **Modo standalone:** `src/constants/buildMode.ts` define `IS_CNTD_ONLY`; en ese modo la app publica solo el diagnostico CNTD (coincide con `diagnostico-cntd.unikprompt.com`), mientras el toolkit completo vive en `aitoolkit.unikprompt.com`.
- Superficie viva observada en la auditoria del 8-ago (C-37 a C-40): 76 items, 12 areas, scorecard, avisos de prototipo/no oficial.

## 2. Arquitectura actual

- **Frontend:** React 19 + Vite 8 + TypeScript + Tailwind 4. `ModuloCntd.tsx` maneja las 76 preguntas en estado de React (`useState`), 12 secciones, scorecard derivado.
- **Export:** PDF generado en el CLIENTE con `@react-pdf/renderer` (import dinamico + `CntdPdfDocument`). En modo `IS_CNTD_ONLY` la descarga se bloquea hasta responder los 76 items.
- **Backend:** funcion serverless `@vercel/node` (`api/contact.ts`) en Vercel. No hay base de datos ni API de estado; el diagnostico corre 100% en el navegador.
- **Correo:** `resend` (`RESEND_API_KEY` en env de Vercel).

## 3. Almacenamiento de respuestas

- **Client-side.** Las 76 respuestas viven en el estado del navegador (React state; el modo estandar tiene continuidad de sesion). No se persisten en servidor ni en base de datos.
- **No hay store central de respuestas.** Solo el usuario tiene sus respuestas completas; puede llevarselas via el PDF client-side.
- Implicacion: privacidad por diseno (minimizacion fuerte), a costa de recuperabilidad si el navegador se limpia.

## 4. Notificaciones

- `api/contact.ts` envia un correo via Resend a `mario@unikprompt.com` (TO), FROM `Toolkit Playbook CR <noreply@unikprompt.com>`, subject `Diagnostico CNTD: <institucion>`.
- **Campos enviados (minimos):** `nombre`, `correo`, `institucion`, `mensaje?` y `scorePct?` (el porcentaje del resultado, NO las 76 respuestas).
- **Consentimiento:** dos flags explicitos (`consentimientoRevision`, `consentimientoMicitt`) validados server-side (400 si faltan) e incluidos en el cuerpo del correo.
- **Validacion:** valida el email. NO se observo honeypot ni rate limit en `api/contact.ts` ni en `CntdContactForm.tsx`; no hay control antiabuso.

## 5. Riesgos

| Riesgo | Detalle | Severidad |
|--------|---------|-----------|
| Canal unico = correo | No hay dashboard ni store de leads; dificil rastrear, deduplicar o SEPARAR por cliente; sin respaldo si el correo se pierde | Alto |
| Sin control antiabuso observado | No hay honeypot funcional ni rate limit en `api/contact.ts` ni `CntdContactForm.tsx`; el endpoint es susceptible a spam/abuso de envios | Medio |
| Dependencia de `RESEND_API_KEY` | Si falta en Vercel, el endpoint responde 500; el usuario no puede enviar | Medio |
| Respuestas no recuperables | Al ser client-side, limpiar el navegador borra el progreso; no hay reanudacion server-side | Medio (trade-off de privacidad) |
| Sin politica de retencion/borrado del correo de leads | Los leads quedan en la bandeja de Mario sin retencion definida | Medio |
| scorePct sin las respuestas | Bueno para minimizacion en la CAPTURA de lead; insuficiente para un servicio pagado (ver seccion 6) | Bajo |

## 6. Stack y flujo reusable propuesto para formularios MYPE hacia Mario

Hay que distinguir dos casos con distinto requisito de datos:

### 6.1 Captura de lead / diagnostico gratuito (patron CNTD, reusable casi tal cual)

**Stack:** React + Vite (o Astro, como la landing); estado client-side; export PDF/JSON client-side con `@react-pdf/renderer`; endpoint serverless `@vercel/node`; correo via Resend. Cero base de datos.

**Flujo:**
1. El usuario responde en el navegador (respuestas en estado local).
2. **Consentimiento explicito** (checkbox validado server-side, como los dos de CNTD) + aviso de privacidad y retencion; se registra `consent=true` con timestamp.
3. El usuario **exporta** su PDF/JSON (autonomia sobre sus datos).
4. Submit envia un **payload minimizado**: solo lead (`nombre/correo/institucion`) + resumen (`scorePct`) + `consent` + timestamp + `form_id`/`client_id`. NUNCA las respuestas completas.
5. La funcion serverless **notifica a Mario** por Resend (Mario ya es el TO), subject/label con `client_id` para **separacion por cliente**. Un `bcc` a Mario seria redundante porque ya es el destinatario; solo tendria sentido si el flujo enviara un correo al CLIENTE, o mediante una notificacion separada.
6. **Antiabuso** (que hoy falta): agregar honeypot real + rate limit en el endpoint.

### 6.2 Servicio MYPE pagado (client-side + resumen NO basta)

Para un Mapa pagado, Mario necesita las **respuestas estructuradas**, no solo un porcentaje. Cliente-side + resumen minimo es insuficiente.

- **Almacenamiento:** respuestas estructuradas en **Airtable** (o un backend seguro), una base/tabla **separada por cliente** (`client_id`), con esquema por campo.
- **Correo:** el email a Mario lleva solo `case_id`/`estado` (un puntero), no los datos; Mario abre el caso en Airtable/backend.
- **Consentimiento:** explicito y versionado, con base legal y retencion definida, dado que ahora se guardan datos del cliente.
- **Minimizacion:** recolectar solo los campos necesarios del servicio; separar PII de las respuestas cuando se pueda.
- **Exportacion:** el cliente puede bajar su PDF/JSON; Mario exporta desde Airtable por caso.

## 7. Recomendaciones (sin ejecutar)

1. Reusar `toolkit-playbook-cr` como plantilla para la **captura de lead / diagnostico gratuito** (patron client-side + Resend + consent).
2. Agregar **honeypot real + rate limit** al endpoint reusable (hoy ausentes).
3. Para el **servicio MYPE pagado**, introducir un backend/Airtable con respuestas estructuradas separadas por `client_id`, y que el correo a Mario lleve solo `case_id/estado`.
4. Introducir `client_id`/`form_id` en el payload y en el subject desde el dia uno para separacion por cliente.
5. Definir politica de retencion/borrado de leads y, en el caso pagado, base legal y retencion de las respuestas.
6. Evitar `bcc` a Mario cuando ya es TO; usar `bcc`/copia solo si el correo va al cliente.

---
*Auditoria y diseno read-only. No se ejecuto deploy, no se crearon cuentas ni secretos, no se usaron datos reales. Fuentes: repo `~/Code/toolkit-playbook-cr` (solo lectura) + auditoria del 8-ago (C-37 a C-40).*
