---
name: html-gen
description: "Generate rich, self-contained HTML files instead of Markdown for specs, reports, reviews, dashboards, editors, and playgrounds. Based on the HTML effectiveness pattern by Thariq (Anthropic/Claude Code team)."
triggers: ["generate html", "html report", "html review", "html plan", "html dashboard", "html editor", "html playground", "make html", "create html artifact", "html instead of markdown", "self-contained html"]
tags: [html, visualization, reports, interactive, output]
version: 1
---

# HTML Generation Skill

> Generate self-contained HTML files that replace Markdown for richer communication between agents and humans. Every HTML file must open correctly in a browser with zero dependencies.

---

## When to Use

Use HTML instead of Markdown when the output needs any of:
- **Visual density**: tables, charts, diagrams, color-coded elements, spatial layouts
- **Navigation**: tabs, collapsible sections, jump links, table of contents
- **Interaction**: sliders, toggles, drag-and-drop, editable fields
- **Sharing**: the output will be sent to someone who needs to open it in a browser
- **Diagrams**: architecture maps, flowcharts, timelines, data flows (use inline SVG)
- **Comparison**: side-by-side views, before/after, multiple options in a grid

Keep using Markdown for: short notes, commit messages, chat replies, simple lists, anything under 50 lines.

---

## Core Rules

1. **Self-contained**: one `.html` file, zero external dependencies. All CSS inline in `<style>`, all JS inline in `<script>`, all images as inline SVG or data URIs.
2. **Opens in browser**: must render correctly when double-clicked in Finder/Explorer. No build step.
3. **Responsive**: use CSS grid/flexbox, work on desktop and mobile.
4. **Dark-first**: use the Stellar Night palette (see Design System below) as default. Include a light mode toggle if the output will be shared externally.
5. **Export button (editors and playgrounds only)**: any HTML that lets the user *change* values — types Editor (#5) and Playground (#6) — must include a "Copy as Markdown", "Copy as JSON", or "Copy as Prompt" button that exports the current state in a format pasteable into Claude Code. Static outputs (Report, Review, Plan, Dashboard) do not require an export button.
6. **Print-friendly**: add `@media print` styles that remove navigation chrome and dark backgrounds.

---

## Required Boilerplate

Every generated file starts with this skeleton. Without `meta charset` the file may render mojibake on emoji-heavy captions. Without `meta viewport` mobile renders zoomed out. Without `meta name="color-scheme"` the browser draws white scrollbars on dark backgrounds.

```html
<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <title>{type} — {topic} · {YYYY-MM-DD}</title>
  <style>/* design system + page styles */</style>
</head>
<body>
  <!-- content -->
  <script>/* optional: theme toggle, copy button, interactivity */</script>
</body>
</html>
```

The `data-theme="dark"` attribute on `<html>` lets the light-mode override (`[data-theme="light"]`) flip cleanly via a single attribute change. Keep `lang` accurate — screen readers and translation engines depend on it.

---

## Output Types

### 1. Report
Morning reviews, weekly status, incident timelines, research summaries.

Structure:
- Header with title, date, author/agent
- TL;DR box (3-5 bullet summary)
- Sections with collapsible details
- Charts/metrics as inline SVG (bar, line, donut)
- Timeline view for chronological data
- Footer with generation timestamp

```
Prompt pattern: "Generate an HTML report about [topic]. Include a TL;DR, 
key metrics as SVG charts, and collapsible detail sections."
```

### 2. Review
PR writeups, code review, document annotations.

Structure:
- Diff view with syntax highlighting (use `<pre>` + CSS classes)
- Margin annotations with severity color coding (info=blue, warning=amber, critical=coral)
- Jump links between findings
- Summary table of findings by severity
- File-by-file navigation tabs

```
Prompt pattern: "Create an HTML review of [PR/code/document]. Render diffs 
with inline margin annotations, color-code by severity, add jump links."
```

### 3. Plan
Implementation plans, exploration of options, architecture decisions.

Structure:
- Option comparison grid (side-by-side cards)
- Data flow diagrams (inline SVG with arrows)
- Timeline/milestones (horizontal or vertical)
- Code snippet previews in expandable blocks
- Risk assessment table with color indicators
- Mockups using HTML/CSS (not images)

```
Prompt pattern: "Create an HTML implementation plan for [feature]. Include 
mockups, data flow diagrams, timeline, and code snippets. Make it easy to 
scan quickly."
```

### 4. Dashboard
Fleet health, KPIs, system status, content calendars.

Structure:
- Metric cards with large numbers + trend indicators
- Status grid (agents, services, tasks)
- SVG charts (sparklines, bars, donuts)
- Timestamp showing data freshness
- Auto-refresh meta tag if served locally

```
Prompt pattern: "Generate an HTML dashboard showing [metrics/status]. Use 
metric cards with trends, status indicators, and SVG charts."
```

### 5. Editor
Custom editing interfaces for structured data.

Structure:
- Form controls appropriate to the data (toggles, dropdowns, text inputs, drag-and-drop)
- Live preview panel
- Validation warnings inline
- Dependency indicators between fields
- **Required**: "Copy as JSON" or "Copy as Prompt" export button
- Undo support (Ctrl+Z via state history)

```
Prompt pattern: "Build an HTML editor for [data type]. Group by [category], 
show dependencies, warn on conflicts. Add a copy button that exports the 
changes as [JSON/Markdown/prompt]."
```

### 6. Playground
Interactive two-way interfaces for tuning, exploring, deciding.

Structure:
- Input controls (sliders, knobs, color pickers, text areas)
- Live preview that updates as controls change
- Parameter display showing current values
- **Required**: "Copy as Prompt" button that generates a natural language prompt describing the user's choices, ready to paste into Claude Code
- Reset to defaults button

```
Prompt pattern: "Create an HTML playground for [tuning/exploring X]. Add 
sliders for [parameters], show a live preview, and include a Copy as Prompt 
button that describes my choices for Claude Code."
```

---

## Design System: Stellar Night

All HTML outputs use this palette for visual consistency with SiriusOS.

```css
:root {
  /* Dark mode (default) */
  --bg: #050510;
  --surface: #0E1428;
  --surface-2: #161E3D;
  --border: #1F2A4D;
  --primary: #A5C9FF;
  --accent: #FFD27A;
  --success: #5EEAD4;
  --warning: #FFB84D;
  --destructive: #FF6B7A;
  --fg: #E6ECFF;
  --muted: #7A89B8;
  
  /* Typography */
  --font-display: 'Space Grotesk', system-ui, sans-serif;
  --font-body: 'Sora', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  
  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  
  /* Radius */
  --radius: 8px;
  --radius-lg: 12px;
}

/* Light mode — redefine ALL semantic colors. The dark-mode success/warning/
   destructive are too bright for light backgrounds and lose contrast against
   white surfaces. Spacing, radius, and font tokens inherit from :root. */
[data-theme="light"] {
  --bg: #F8FAFF;
  --surface: #FFFFFF;
  --surface-2: #F0F2F8;
  --border: #D8DCE8;
  --primary: #3D6FE5;
  --accent: #C9982A;
  --success: #0E9F8C;
  --warning: #C97A0E;
  --destructive: #D63848;
  --fg: #0E1428;
  --muted: #6B7494;
}
```

### Font Loading

Since files must be self-contained, use system font fallbacks. Only load Google Fonts if the file will be served online:

```html
<!-- Only if served online, otherwise system-ui fallbacks work fine -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Sora:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### Common Components

**Metric Card:**
```html
<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--space-lg)">
  <div style="font-family:var(--font-mono);font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em">Label</div>
  <div style="font-family:var(--font-display);font-size:36px;font-weight:700;color:var(--fg);margin:4px 0">42</div>
  <div style="font-size:13px;color:var(--success)">+12% vs last week</div>
</div>
```

**Status Dot:**
```html
<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--success);box-shadow:0 0 6px var(--success)"></span>
```

**Collapsible Section:**
```html
<details>
  <summary style="cursor:pointer;font-weight:600;color:var(--primary);padding:var(--space-sm) 0">Section Title</summary>
  <div style="padding:var(--space-md) 0;color:var(--fg)">Content here</div>
</details>
```

**Copy Button (required for editors/playgrounds):**

Pass `event` explicitly — relying on the global `event` is non-standard and breaks under strict mode. Capture and restore the button's original text so the same handler works for "Copy as Markdown", "Copy as JSON", "Copy as Prompt", etc.

```html
<button type="button" onclick="copyExport(event)" style="background:var(--primary);color:var(--bg);border:none;padding:8px 16px;border-radius:var(--radius);cursor:pointer;font-weight:600">
  Copy as Prompt
</button>
<script>
function copyExport(e) {
  const btn = e.currentTarget;
  const original = btn.textContent;
  const data = gatherState(); // implement per use case
  navigator.clipboard.writeText(data).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  }).catch(() => {
    btn.textContent = 'Copy failed';
    setTimeout(() => { btn.textContent = original; }, 1500);
  });
}
</script>
```

---

## File Naming Convention

```
{type}-{topic}-{date}.html

Examples:
  report-morning-review-2026-05-08.html
  review-pr-auth-refactor-2026-05-08.html
  plan-html-skill-implementation-2026-05-08.html
  dashboard-fleet-health-2026-05-08.html
  editor-content-calendar-2026-05-08.html
  playground-animation-tuner-2026-05-08.html
```

---

## Output Location

Save generated HTML files to:
```bash
# For agent-internal use (reviews, dashboards)
$CTX_FRAMEWORK_ROOT/orgs/$CTX_ORG/agents/$CTX_AGENT_NAME/html/

# For user-facing deliverables
# Follow the project's existing output conventions, or ask the user
```

When the HTML is ready, notify with the file path so the user can open it:
```bash
# Open in default browser (macOS)
open /path/to/file.html
```

---

## Accessibility

HTML outputs are sometimes shared externally and read by people on assistive tech, on small screens, or in bright sunlight. The cost of getting this right is low — bake it in by default rather than retrofit.

**Semantic structure**
- One `<h1>` per page, then `<h2>` / `<h3>` in order. Don't skip levels.
- Use `<main>`, `<header>`, `<section>`, `<nav>`, `<footer>` instead of generic `<div>`.
- Use `<button type="button">` for actions. Don't make `<div>`s clickable.
- Tables that aren't pure layout: include `<caption>` and `<th scope="col">` / `<th scope="row">`.
- Form controls: every `<input>` / `<select>` / `<textarea>` paired with a `<label for="…">`.

**ARIA — only when semantics aren't enough**
- `aria-label="…"` on icon-only buttons or toggles where the visible text is missing or ambiguous.
- `aria-describedby="…"` to link a control to an inline help/warning element.
- `role="region"` on highlighted summary boxes (TL;DR, callout cards) with an `aria-label`.
- Decorative SVG: `aria-hidden="true"`. Informative SVG: include a `<title>` element inside.

**Visual**
- Color contrast: target WCAG AA (4.5:1 for body text, 3:1 for large/UI text). The Stellar Night `--fg` on `--bg` clears AA in both themes; verify any new color pair before shipping.
- Focus rings: never remove them. Use `:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }` so keyboard users can navigate.
- Don't encode meaning in color alone — pair color with an icon, label, or text indicator (e.g. status dot + word "OK"/"BLOCKED").

**Motion**
```css
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
```

**Language**
- Set `<html lang="…">` to the actual content language. Mixed-language pages: wrap subsections in `<div lang="…">` so screen readers switch voices.

---

## Quality Checklist

Before delivering any HTML file, verify:
- [ ] Opens in browser without errors (no console errors, no page errors)
- [ ] Required boilerplate present: doctype, charset, viewport, color-scheme, title, lang
- [ ] All content visible without scrolling past the fold for TL;DR/summary
- [ ] Dark mode renders correctly (no white backgrounds bleeding through)
- [ ] Light mode override defines all semantic colors (success/warning/destructive too, not just bg/fg)
- [ ] Interactive elements respond to clicks/input
- [ ] Export button works and copies valid content (editors/playgrounds only)
- [ ] No external resource dependencies (everything inline)
- [ ] File size under 500KB (SVGs should be optimized)
- [ ] Mobile responsive (test with browser dev tools narrow viewport)
- [ ] Accessibility: one `<h1>`, semantic landmarks, focus rings preserved, color not the sole signal
- [ ] `prefers-reduced-motion` respected
- [ ] `@media print` styles strip dark backgrounds and chrome

---

## Tips

- **SVG over Canvas**: prefer inline SVG for diagrams and charts. SVGs are searchable, printable, and editable. Canvas requires JS and is opaque.
- **CSS Grid for layouts**: use `display:grid` with `grid-template-columns` for dashboards and comparison views. Flexbox for single-axis layouts.
- **Details/Summary for progressive disclosure**: native HTML collapsibles, no JS needed.
- **Tabbed interfaces**: use radio buttons + CSS `:checked` selector for zero-JS tabs, or minimal JS for cleaner UX.
- **Animations sparingly**: `transition: 0.2s ease` on hover states. No gratuitous motion. Respect `prefers-reduced-motion`.
- **Token cost**: HTML takes 2-4x more tokens than Markdown. Worth it for anything that will be read, shared, or interacted with. Not worth it for throwaway notes.
