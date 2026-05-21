# Design System — Niche Pipeline

## Product Context
- **What this is:** Single-user dashboard for a daily small-business idea agent. Three Claude Cloud Routines write ideas, research, and plans to Supabase; the user reviews each idea and decides whether to pursue.
- **Who it's for:** One user (the owner). Not multi-tenant. Not customer-facing.
- **Space/industry:** Personal AI tool / hobby builder workflow.
- **Project type:** Daily-ritual single-page web app.

## Memorable Thing
> "A feeling of excitement to review the new ideas and be in the mood to brainstorm deeper."

Every design decision is measured against this. Excitement on arrival + sustained brainstorm-deep state.

## Aesthetic Direction
- **Direction:** Editorial / morning briefing
- **Decoration level:** Minimal — typography and whitespace carry the design; no textures, gradients, or decorative blobs
- **Mood:** A newspaper or curated newsletter that arrived for you. Considered, unhurried, ink-on-paper. The product invites you in rather than demanding attention.

## Typography
- **Display/Hero** (idea titles, page headings, section titles): **Instrument Serif** — modern serif with optical sizing and personality. Each idea title reads like a headline, not a row label.
- **Body** (descriptions, paragraphs, button labels): **DM Sans** — clean, neutral, not overused like Inter. Weights: 400, 500, 600.
- **Metadata** (dates, status pills, run IDs, "researched 2 min ago", numeric data): **Geist Mono** — already loaded via `next/font`. Mono signals "this is system info, not content."
- **Loading:** `next/font/google` for Instrument Serif and DM Sans. Geist Mono stays via `next/font/google` as already configured.

### Type scale (rem, 16px base)
- `text-xs` 0.75rem / line-height 1.4 — pills, mono metadata
- `text-sm` 0.875rem / 1.5 — secondary body, table rows
- `text-base` 1rem / 1.6 — primary body, idea descriptions
- `text-lg` 1.125rem / 1.5 — section labels
- `text-xl` 1.5rem / 1.3 — card titles (serif)
- `text-2xl` 2rem / 1.2 — page heading (serif)
- `text-3xl` 2.5rem / 1.1 — hero / "today's ideas" header (serif)

Idea titles use **serif**. Tab labels, buttons, body, and form inputs use **sans**. Anything numeric or system-meta (date, status, ID) uses **mono**.

## Color
- **Approach:** Restrained — ink on paper plus one accent. Color rarity is a feature.

### Light mode
| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#FAFAF7` | Page background (warm off-white — NOT pure white) |
| `--surface` | `#FFFFFF` | Card surface; lifts above the page |
| `--text` | `#1A1A18` | Primary text (warm near-black) |
| `--muted` | `#6B6862` | Secondary text, metadata |
| `--border` | `#E8E5DE` | Borders, dividers |
| `--accent` | `#C2410C` | **Burnt orange — primary actions ONLY** (Pursue, Approve plan, new-arrival dot) |
| `--success` | `#3F7D3F` | Plan ready, launched (desaturated green) |
| `--warning` | `#A66A1F` | Researching, in-flight (warm amber) |
| `--error` | `#9F2F2F` | Failed runs (desaturated red) |
| `--info` | `#4A6B8A` | Info banners (desaturated blue) |

### Dark mode
| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#14130F` | Page background (warm near-black) |
| `--surface` | `#1C1B17` | Card surface |
| `--text` | `#F0EDE5` | Primary text (warm off-white) |
| `--muted` | `#8A867D` | Secondary text |
| `--border` | `#2A2823` | Borders |
| `--accent` | `#FB923C` | Lighter burnt orange for dark-mode contrast |
| `--success` | `#7AB87A` | |
| `--warning` | `#E0A55F` | |
| `--error` | `#E07A7A` | |
| `--info` | `#7FA3C2` | |

### Color rules
- **Accent appears on at most 2 elements per screen.** "Pursue" button, new-arrival indicator. Nothing else.
- **Status pills use neutral background + semantic text color**, not saturated fills. The pill itself is `--surface` or `--border`; the *word inside* uses the semantic color.
- **No purple, no gradients, no glow effects.** Solid colors only.

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable-spacious. This is a ritual, not a Bloomberg terminal.
- **Scale:** `2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64) 4xl(96)`

## Layout
- **Approach:** Editorial — content-first, asymmetric where it earns it, generous whitespace.
- **Grid:** Single column for content. Max content width **720px** for idea cards and reading content. Tab nav and page chrome stay full-width up to ~1100px container.
- **Border radius (subtle, hierarchical):**
  - `sm:` 4px — pills, small inputs
  - `md:` 6px — cards, larger inputs, buttons
  - `lg:` 8px — modals, drawers
  - No `rounded-full` anywhere. Editorial doesn't bubble.
- **Card style:** White surface, 1px warm border, no shadow in light mode. Subtle shadow (`0 1px 2px rgba(0,0,0,0.4)`) in dark mode for surface lift.

## Motion
- **Approach:** Minimal-functional.
- **Easing:** `ease-out` for everything (default browser).
- **Duration:** 150ms for hover/focus state changes. 200ms for new-arrival fade-in. Nothing else animates.
- **No** page transitions, no scroll-driven animation, no loading spinners that twirl forever. A pulsing dot is the only "in progress" affordance allowed.

## Component-level guidance

### Idea cards
- Surface: white (light) / warm-dark (dark). 1px border.
- Title: serif, `text-xl`, weight 500.
- Description: sans, `text-base`, line-height 1.6, max-width 65ch.
- Metadata row above title: mono, `text-xs`, muted color. Format: `STATUS · 2 min ago · #id`.
- Primary action button: filled accent (`--accent` background, white text). Secondary action: ghost (text + border).

### Status pills
- Rectangular (`rounded-sm` = 4px), not full-pill.
- Background: `--border` (subtle).
- Text: mono, uppercase, tracking-wide, `text-xs`, semantic color.

### Buttons
- Primary (Pursue, Approve, Run now): solid `--accent`, white text, `rounded-md`, 12px vertical / 20px horizontal padding.
- Secondary (Reject, Archive, Cancel): transparent background, 1px `--border`, sans text. Hover: `--border` background.
- Destructive: same shape as secondary but text in `--error`.

### Inputs (textareas, text inputs)
- Surface: `--surface`, 1px `--border`.
- Focus: 1px `--accent` border (no glow, no ring). Subtle.
- Body text: sans, `text-base`.

### Empty states
- Centered, generous vertical space (`py-3xl` minimum).
- Sans body copy, muted color, single sentence. No cute illustrations.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-19 | Initial design system created via /design-consultation | Memorable-thing answer ("excitement + brainstorm-deep") pointed at editorial/morning-briefing direction. Restrained palette + serif titles + sparse accent serves both arrival-energy and sustained-thinking states. |
| 2026-05-21 | Cost card uses Instrument Serif for the dollar amount (deliberate exception to "numeric = mono") | The cost-savings number is editorial display, not routine metadata. Per /plan-design-review D4, this surface earns serif treatment because it celebrates the worker pivot's architectural win. Mono stays the default for all other numeric data (run IDs, durations, status, dates). |
| 2026-05-21 | Custom CSS checkboxes for the In Progress tab (not native, not Unicode) | Native browser checkboxes fight the warm palette; Unicode loses tap affordance. Custom checkbox uses --border outline + --accent fill + accent checkmark glyph, with explicit ARIA wiring and 44px tap padding. Honors "typography and whitespace carry the design" without sacrificing affordance. |
| 2026-05-21 | One-line editorial banner on plan-regenerated stale-checks state | When checked_task_keys reference indices that no longer exist (post-mortem ran, plan regenerated), show a dismissible --info banner: "Plan updated since you last checked off tasks. Previous progress reset." Honors "design for trust" — silent loss erodes; magic migration risks misattribution. |
