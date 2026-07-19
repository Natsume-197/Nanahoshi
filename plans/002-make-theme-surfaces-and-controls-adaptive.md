# Plan 002: Make cards, hovers, and controls adapt to ambient gradients

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 4dc733bd..HEAD -- apps/web/src/index.css apps/web/src/lib/theme-palettes.ts apps/web/src/lib/__tests__/theme-palettes.test.ts apps/web/src/components/ui/input.tsx apps/web/src/components/ui/textarea.tsx apps/web/src/components/ui/select.tsx apps/web/src/components/ui/input-group.tsx apps/web/src/components/ui/combobox.tsx apps/web/src/components/dashboard/dashboard-header-search.tsx apps/web/src/components/dashboard/home/resume-card.tsx apps/web/src/components/dashboard/home/resume-tile.tsx apps/web/src/components/explore/explore-view.tsx apps/web/src/components/books/book-card-shell.tsx apps/web/src/components/shared/media-list-row.tsx apps/web/src/components/shared/collection-table-row.tsx apps/web/src/components/shared/collection-card.tsx apps/web/src/routes/dashboard/profile/index.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-restore-one-color-theme-mode.md`
- **Category**: bug
- **Planned at**: commit `4dc733bd`, 2026-07-18

## Why this matters

The ambient gradient currently colors the dashboard canvas but many large
children paint opaque neutral rectangles over it. Home/Explore cards, media-row
hovers, and text controls therefore appear detached from the selected colors.
This plan introduces a small semantic surface scale whose default values
preserve plain, Seed, and Advanced themes, while Gradient supplies translucent
overrides that reveal the spatial wash underneath.

## Current state

This plan targets the uncommitted gradient implementation. Before editing:

```bash
rg -n 'gradientPaletteVars|--theme-gradient' apps/web/src/lib/theme-palettes.ts
rg -n 'theme-gradient-surface' apps/web/src/index.css apps/web/src/components/layout/dashboard-layout.tsx
```

Both commands must match. Otherwise stop.

- `apps/web/src/lib/theme-palettes.ts:~518` — `gradientPaletteVars` emits only
  `--theme-gradient` and `--radius`; its intensity-zero branch returns early.
- `apps/web/src/lib/theme-palettes.ts:~55` — `PALETTE_VAR_NAMES` is both the
  runtime whitelist and the first-paint whitelist imported by `__root.tsx`.
  Unknown tokens are silently ignored.
- `apps/web/src/index.css` — `--card`, `--muted`, and `--input` are opaque. The
  Tailwind v4 `@theme inline` block maps semantic variables to `bg-*` utilities.
- `resume-card.tsx:~142`, `resume-tile.tsx:~119`, and
  `explore-view.tsx:~109,196` repeat opaque `color-mix()` recipes.
- `book-card-shell.tsx:~201`, `media-list-row.tsx:~59`, and
  `collection-table-row.tsx:~139` premount an opaque `bg-muted` layer and fade
  only its opacity on hover. Preserve this compositor-friendly layer pattern.
- `input.tsx`, `textarea.tsx`, `select.tsx`, and `input-group.tsx` use opaque
  `bg-input`. `combobox.tsx` repeats partial variants.
- `dashboard-header-search.tsx:~457` overrides `Input` with `bg-background`; its
  mobile full-screen search at `:~633` is a solid `bg-sidebar` surface.
- `routes/dashboard/profile/index.tsx:~99` renders a raw textarea with
  `bg-background` instead of the shared `Textarea` primitive.
- Plain/Seed/Advanced behavior must remain opaque. Their palettes already
  derive semantic `--card`, `--muted`, and `--input`; the new root aliases must
  reference those tokens so they update automatically.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Theme tests | `bun test apps/web/src/lib/__tests__/theme-palettes.test.ts apps/web/src/lib/__tests__/theme-preview.test.ts` | exit 0; all pass |
| Typecheck | `bun run check-types` | exit 0 |
| Lint | `bunx biome check apps/web/src/index.css apps/web/src/lib/theme-palettes.ts apps/web/src/lib/__tests__/theme-palettes.test.ts apps/web/src/components/ui/input.tsx apps/web/src/components/ui/textarea.tsx apps/web/src/components/ui/select.tsx apps/web/src/components/ui/input-group.tsx apps/web/src/components/ui/combobox.tsx apps/web/src/components/dashboard/dashboard-header-search.tsx apps/web/src/components/dashboard/home/resume-card.tsx apps/web/src/components/dashboard/home/resume-tile.tsx apps/web/src/components/explore/explore-view.tsx apps/web/src/components/books/book-card-shell.tsx apps/web/src/components/shared/media-list-row.tsx apps/web/src/components/shared/collection-table-row.tsx apps/web/src/components/shared/collection-card.tsx apps/web/src/routes/dashboard/profile/index.tsx` | exit 0 |
| Build | `bun run build` | exit 0 |

## Suggested executor toolkit

- Use the `shadcn` skill if available. Keep shared form primitives on semantic
  tokens; do not add literal palette colors to component class strings.
- Consult the installed Base UI versions of `Input`, `Select`, and `Combobox`
  before changing state selectors. This plan changes their surface only, not
  their interaction API.

## Scope

**In scope** (the only files you should modify):

- `apps/web/src/index.css`
- `apps/web/src/lib/theme-palettes.ts`
- `apps/web/src/lib/__tests__/theme-palettes.test.ts`
- `apps/web/src/components/ui/input.tsx`
- `apps/web/src/components/ui/textarea.tsx`
- `apps/web/src/components/ui/select.tsx`
- `apps/web/src/components/ui/input-group.tsx`
- `apps/web/src/components/ui/combobox.tsx`
- `apps/web/src/components/dashboard/dashboard-header-search.tsx`
- `apps/web/src/components/dashboard/home/resume-card.tsx`
- `apps/web/src/components/dashboard/home/resume-tile.tsx`
- `apps/web/src/components/explore/explore-view.tsx`
- `apps/web/src/components/books/book-card-shell.tsx`
- `apps/web/src/components/shared/media-list-row.tsx`
- `apps/web/src/components/shared/collection-table-row.tsx`
- `apps/web/src/components/shared/collection-card.tsx`
- `apps/web/src/routes/dashboard/profile/index.tsx`
- `plans/README.md` (status row only)

**Out of scope**:

- Changing the gradient stops, angle/intensity mapping, primary accent, or
  contrast-warning formulas.
- Making popovers translucent. Portaled popovers need an opaque readable
  surface because they are not necessarily above a gradient-painted ancestor.
- Restyling buttons, checkbox/switch/slider geometry, autofill, authentication
  pages, reader controls, or cover-art overlays.
- Adding blur/backdrop-filter, animation, or new dependencies.
- Replacing the premounted opacity layers with background-color transitions.

## Git workflow

- Branch: `advisor/002-adaptive-theme-surfaces`
- Suggested commit: `fix: adapt surfaces to gradient themes`.
- Do not stage, discard, or rewrite unrelated work.
- Do not push or open a PR unless explicitly requested.

## Steps

### Step 1: Add the semantic surface scale and persistence contract

In `:root` in `index.css`, add these aliases immediately after
`--theme-gradient`:

```css
--surface-card: color-mix(in oklab, var(--background) 60%, var(--card));
--surface-card-hover: color-mix(in oklab, var(--background) 35%, var(--card));
--surface-accent: color-mix(in oklab, var(--primary) 14%, var(--card));
--surface-accent-hover: color-mix(in oklab, var(--primary) 22%, var(--card));
--surface-hover: var(--muted);
--control: var(--input);
```

Map all six in `@theme inline` as `--color-<name>: var(--<name>)`, yielding
`bg-surface-card`, `bg-surface-card-hover`, `bg-surface-accent`,
`bg-surface-accent-hover`, `bg-surface-hover`, and `bg-control`.

Add the six raw variable names to `PALETTE_VAR_NAMES`. In
`gradientPaletteVars`, keep the current root fallbacks when intensity is zero;
for positive intensity add exactly these overrides:

```ts
"--surface-card":
  "color-mix(in oklab, var(--card) 64%, transparent)",
"--surface-card-hover":
  "color-mix(in oklab, var(--card) 80%, transparent)",
"--surface-accent":
  "color-mix(in oklab, var(--primary) 14%, color-mix(in oklab, var(--card) 64%, transparent))",
"--surface-accent-hover":
  "color-mix(in oklab, var(--primary) 22%, color-mix(in oklab, var(--card) 80%, transparent))",
"--surface-hover":
  "color-mix(in oklab, var(--card) 55%, transparent)",
"--control":
  "color-mix(in oklab, var(--input) 74%, transparent)",
```

Do not emit these aliases from Seed or Advanced; clearing the previous inline
Gradient overrides must reveal the root aliases, which then resolve from those
palettes' existing semantic tokens.

Update theme tests to assert:

- positive-intensity Gradient emits all six aliases;
- zero intensity emits none of the six and still emits gradient `none` + radius;
- stored Gradient recipes recompute the aliases instead of trusting stored
  values;
- every emitted key from Seed, Gradient, and Advanced is present in
  `PALETTE_VAR_NAMES`, is actually set immediately after `applyPaletteVars`, and
  is empty after clearing;
- applying Seed after Gradient clears all six inline aliases.

**Verify**:
`bun test apps/web/src/lib/__tests__/theme-palettes.test.ts`
→ all tests pass.

### Step 2: Migrate the card surfaces

Replace only the audited opaque recipes:

- `ResumeCard`: normal → `bg-surface-card`.
- `ResumeTile`: normal/hover →
  `bg-surface-card hover:bg-surface-card-hover`; add
  `focus-within:bg-surface-card-hover` so keyboard and pointer receive the same
  surface signal.
- `ExploreView` normal Category/Surprise tiles → normal, hover, active, and
  focus-visible surface-card tokens.
- Highlighted Category tiles → the corresponding surface-accent tokens.
- Keep existing borders and focus rings unchanged.

The Explore loading placeholders are handled by Plan 003; do not convert them
in this step.

**Verify**:

```bash
rg -n 'var\(--background\)_60%|var\(--background\)_35%|var\(--primary\)_14%|var\(--primary\)_22%' apps/web/src/components/dashboard/home/resume-card.tsx apps/web/src/components/dashboard/home/resume-tile.tsx apps/web/src/components/explore/explore-view.tsx
```

→ only the loading placeholder in `explore-view.tsx` may still match.

### Step 3: Migrate large hover layers and keyboard state

In `BookCardShell`, `MediaListRow`, and `CollectionTableRow`, change the
premounted layer from `bg-muted` to `bg-surface-hover` and activate the same
layer with `group-focus-within:opacity-100` as well as hover. Preserve
`isolate`, `-z-10`, `pointer-events-none`, and opacity transitions.

In `CollectionCard`, replace `hover:bg-muted/55` with
`hover:bg-surface-hover focus-visible:bg-surface-hover`; preserve its ring.

Do not change small icon/chip hovers; this audit is about large surfaces that
visibly mask the ambient wash.

**Verify**:

```bash
rg -n 'bg-muted opacity-0.*group-hover|hover:bg-muted/55' apps/web/src/components/books/book-card-shell.tsx apps/web/src/components/shared/media-list-row.tsx apps/web/src/components/shared/collection-table-row.tsx apps/web/src/components/shared/collection-card.tsx
```

→ no matches.

### Step 4: Route shared controls through `--control`

Replace the surface utility only; preserve dimensions, Base UI data selectors,
focus rings, errors, disabled state, and APIs:

- `Input`, `Textarea`, `SelectTrigger`, and `InputGroup`: `bg-input` →
  `bg-control`.
- `ComboboxChips`: `bg-input/50` → `bg-control/50`.
- `ComboboxChip`: `bg-input`/dark override → `bg-control`; remove the redundant
  mode-specific background override.
- Do not change popover/list option tokens.

In `DashboardHeaderSearch`, replace its `bg-background` override with
`bg-control`. Add `theme-gradient-surface` to the fixed mobile search header so
it shares the dashboard wash. Preserve search sizing and behavior.

In `routes/dashboard/profile/index.tsx`, import and render the shared
`Textarea`, keeping `value`, `onChange`, `maxLength`, `rows`, aria label,
placeholder, and only layout-specific classes.

**Verify**:

```bash
rg -n 'bg-input|bg-background' apps/web/src/components/ui/input.tsx apps/web/src/components/ui/textarea.tsx apps/web/src/components/ui/select.tsx apps/web/src/components/ui/input-group.tsx apps/web/src/components/ui/combobox.tsx apps/web/src/components/dashboard/dashboard-header-search.tsx apps/web/src/routes/dashboard/profile/index.tsx
```

→ no audited control surface uses opaque `bg-input` or `bg-background`; matches
inside popover-specific selectors or unrelated layout are acceptable only if
documented in the commit message.

### Step 5: Run repository gates

Run the focused tests, TypeScript check, focused Biome command, and full build.
Inspect the diff to ensure plain/Seed/Advanced builders do not emit the new
aliases and no literal gradient colors entered component files.

**Verify**: every command in the command table exits 0.

## Test plan

- Extend `theme-palettes.test.ts` with both bases for positive and zero Gradient
  intensity.
- Strengthen the whitelist contract by checking a value immediately after
  application; checking only after clearing gives false confidence for an
  unknown token that was never applied.
- Regression-test Gradient → Seed clearing for all six aliases.
- Use static source checks in Steps 2–4 to prevent the audited opaque recipes
  from returning.
- Browser smoke matrix for a reviewer: light/dark × plain/Seed/Gradient/Advanced
  on Home, Explore, header search, Select, and profile bio; check hover, keyboard
  focus, active, invalid, and disabled states. This is reviewer validation, not
  a substitute for the commands above.

## Done criteria

- [ ] Positive Gradient exposes six adaptive surface aliases; intensity zero
  and non-Gradient palettes retain their old opaque fallbacks.
- [ ] Home/Explore cards and large media-row hovers use semantic surface tokens.
- [ ] Hover and keyboard focus show the same surface state on audited cards.
- [ ] Shared text controls and the global search use `bg-control`.
- [ ] The profile bio uses the shared `Textarea`.
- [ ] Whitelist/application/clearing tests cover all three palette builders.
- [ ] Focused tests, typecheck, Biome, and build exit 0.
- [ ] No files outside Scope are modified; `plans/README.md` marks 002 DONE.

## STOP conditions

Stop and report back if:

- Plan 001 is not complete or the Gradient baseline checks do not match.
- Adding a token requires duplicating the whitelist in `__root.tsx` rather than
  using its existing `PALETTE_VAR_NAMES` import.
- A target surface sits outside a gradient-painted ancestor and transparency
  makes text/controls unreadable.
- The fix requires making portaled popovers translucent.
- Existing focus/error/disabled behavior changes while migrating a surface.
- A verification fails twice or an unrelated staged change would be overwritten.

## Maintenance notes

- New large cards should consume the semantic surface scale instead of copying
  `color-mix()` formulas.
- Keep portal surfaces opaque unless the portal itself paints the ambient
  gradient.
- Review the opacity formulas at maximum gradient intensity; tint should be
  visible without reducing text contrast or exposing cover art below controls.
- If a future palette builder emits any new variable, add it to the whitelist
  and the application-before-clearing contract test in the same change.
