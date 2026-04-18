# UX Design Principles

This document defines the visual and interaction design standards for SolarDesign.
It applies to all marketing pages and the application UI.

---

## Theme: Industrial

SolarDesign is used by utility-scale solar engineers, EPC contractors, and IPPs.
The visual language reflects that context — precise, functional, no decoration.

**Do not use:**
- Rounded corners (`rounded-xl`, `rounded-lg`, `rounded-full`, etc.) on containers, cards, tables, and inputs
- Decorative gradients or background blobs
- Animated hero elements or parallax effects
- Drop shadows for visual depth (`shadow-lg`, `shadow-xl`)

**Do use:**
- Sharp borders (`border`, `border-b`, `border-t`) for structure
- Muted fills (`bg-muted/40`, `bg-muted/20`) for section distinction
- Consistent spacing from Tailwind's scale — no arbitrary values
- `text-muted-foreground` for secondary content; `text-foreground` for primary

---

## Component Usage

### Use shadcn primitives for all UI

Always reach for the shadcn/ui component library first before writing raw HTML elements.

| Raw HTML | Use instead |
|----------|-------------|
| `<table>`, `<thead>`, `<tr>`, `<td>` | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` |
| `<button>` | `Button` |
| `<input>`, `<select>`, `<textarea>` | `Input`, `Select`, `Textarea` |
| `<dialog>` / modal divs | `Dialog`, `Sheet` |
| Notification / toast divs | `Sonner` / `Toast` |
| Tab UI | `Tabs` |
| Accordion UI | `Accordion` |
| Tooltips | `Tooltip` |
| Badges / labels | `Badge` |

Add new shadcn components to `packages/ui/` via:
```bash
bunx --bun shadcn@latest add <component> --cwd packages/ui
```

### Cards

Use `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
Do not add `rounded-xl` or shadow overrides — the default card border is sufficient.

### Tables

Use shadcn `Table` primitives. No `rounded-xl` wrapper on the container `div`.
Use `overflow-hidden border` on the wrapper, not `rounded-xl border`.

---

## Icons

Use **Phosphor Icons** exclusively (`@phosphor-icons/react/dist/ssr` for server components).
Do not mix Lucide or Heroicons.

- Prefer `weight="duotone"` for feature icons
- Prefer `weight="bold"` for inline indicators (check marks, arrows)
- Prefer `weight="regular"` for list item markers

---

## Colour conventions

| Use case | Class |
|----------|-------|
| Primary action / accent | `text-primary`, `bg-primary/10` |
| Success / availability | `text-green-600 dark:text-green-400` |
| Unavailable / absent | `text-muted-foreground/40` |
| Section group header | `bg-muted/30`, `text-muted-foreground`, `uppercase tracking-wider` |
| Highlighted row | `bg-primary/5` |
| Alternate row | `bg-muted/20` |

---

## Typography

- Page headings: `text-4xl font-bold tracking-tight` (h1), `text-2xl font-bold tracking-tight` (h2)
- Section subheadings: `font-semibold`
- Body / descriptions: `text-sm text-muted-foreground`
- Table content: inherits from `Table` (`text-xs` base)
- Badges / group labels: `text-xs`

No decorative fonts. System font stack via Tailwind default.
