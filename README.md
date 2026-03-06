# Master

Layout polish notes for dashboard pages (header + sidebar)

## Problem diagnosis
From the screenshot, the gap between content, header, and sidebar is usually caused by one (or more) of these:

1. Browser default `body` margin (`8px`) was not reset.
2. Header/sidebar are not inside one shared layout container.
3. Mixed `position: fixed` + normal flow without compensating `padding`/`margin`.
4. Sidebar width is not reflected in main content width/margin.

## Recommended structure
Use a single app shell with explicit sizes:

- Header height: `72px` (desktop), `64px` (tablet/mobile)
- Sidebar width: `300px` (expanded), `84px` (collapsed)
- Page background spacing: `24px`

## Starter CSS

```css
:root {
  --header-h: 72px;
  --sidebar-w: 300px;
  --sidebar-collapsed-w: 84px;
  --page-gap: 24px;
  --radius-lg: 18px;
}

* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0; /* critical: removes default browser gap */
  font-family: "Tajawal", system-ui, sans-serif;
  background: #f3f3f7;
}

.app {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr var(--sidebar-w);
  grid-template-rows: var(--header-h) 1fr;
  grid-template-areas:
    "header sidebar"
    "main sidebar";
}

.header {
  grid-area: header;
  height: var(--header-h);
  background: #3f2558;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.sidebar {
  grid-area: sidebar;
  width: var(--sidebar-w);
  background: linear-gradient(180deg, #4a2b66 0%, #3b2354 100%);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.main {
  grid-area: main;
  padding: var(--page-gap);
}

/* if sidebar collapses */
.app.is-collapsed {
  grid-template-columns: 1fr var(--sidebar-collapsed-w);
}

/* responsive */
@media (max-width: 1024px) {
  :root {
    --header-h: 64px;
    --sidebar-w: 260px;
    --page-gap: 16px;
  }
}
```

## If you must use fixed header/sidebar

```css
.header {
  position: fixed;
  top: 0;
  right: 0;
  left: var(--sidebar-w); /* RTL layout */
  height: var(--header-h);
  z-index: 1000;
}

.sidebar {
  position: fixed;
  top: 0;
  right: 0;
  width: var(--sidebar-w);
  height: 100vh;
}

.main {
  margin-top: var(--header-h);
  margin-right: var(--sidebar-w); /* RTL layout */
  padding: var(--page-gap);
}
```

## Visual quality tips (to avoid "cheap" look)

- Keep spacing scale consistent (`8, 12, 16, 24`).
- Use one border radius system (e.g., cards `18px`, inputs/buttons `12px`).
- Use softer separators (`rgba(..., .08-.16)`) instead of heavy borders.
- Keep sidebar width stable across pages to avoid layout jump.
- Avoid random card heights; use min-heights and aligned rows.
