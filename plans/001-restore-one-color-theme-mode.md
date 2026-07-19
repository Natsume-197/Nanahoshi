# Plan 001: Restore the one-color theme editor beside gradients

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 4dc733bd..HEAD -- apps/web/src/components/settings/sections/appearance.tsx apps/web/src/lib/theme-palettes.ts apps/web/src/lib/__tests__/theme-palettes.test.ts apps/web/messages/en.json apps/web/messages/es.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `4dc733bd`, 2026-07-18

## Why this matters

The palette engine still supports deriving a complete theme from one seed
color, but the current settings UI hides that mode and silently converts a
stored seed recipe into a gradient draft. Existing users therefore cannot edit
their original recipe and can overwrite it with a different palette type by
pressing Apply. This plan restores the previous one-color behavior as a third
editor mode without removing the new gradient editor.

## Current state

This plan was written against an **uncommitted gradient implementation** on top
of commit `4dc733bd`. Before editing, these checks must both succeed:

```bash
rg -n 'type CustomMode = "gradient" \| "advanced"' apps/web/src/components/settings/sections/appearance.tsx
rg -n 'buildGradientPalette|randomGradientInput|custom_mode_gradient' apps/web/src/components/settings/sections/appearance.tsx
```

If either command has no match, the gradient work is not present in the
executor's branch/worktree. Stop; do not recreate that feature from this plan.

- `apps/web/src/components/settings/sections/appearance.tsx` — owns the three
  palette editors, live preview, Apply, base switching, and radius.
  - Current mode type: `type CustomMode = "gradient" | "advanced"`.
  - `initialGradient` currently uses `gradientInputFromSeed(palette.seed)`, and
    `mode` opens every non-advanced palette as `gradient`.
  - `activeBase`, `radius`, `setBase`, `setRadius`, `selectMode`, and
    `applyCustom` currently branch only between Gradient and Advanced.
- `apps/web/src/lib/theme-palettes.ts` — the old implementation is intact:
  `DEFAULT_SEED_INPUT`, `buildSeedPalette`, `previewSeedVars`, and
  `SeedThemeInput` remain exported; `StoredPalette.seed` is normalized during
  storage reads; `applyPaletteVars` clears all old variables before previewing
  or applying another recipe.
- `apps/web/messages/en.json` and `apps/web/messages/es.json` — already contain
  `custom_desc_seed`, `custom_mode_seed`, and `color_seed`. Reuse them; do not
  add synonyms.
- The pre-gradient version of the editor is recoverable for reference with:
  `git show 4dc733bd:apps/web/src/components/settings/sections/appearance.tsx`.
  Its
  untouched-seed base-switch rule is the behavior to preserve.
- Existing editor convention: changes preview live through `previewTheme`,
  Apply is the only persistence action, and `useOnUnmount` restores the saved
  palette when a preview was not applied.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bun test apps/web/src/lib/__tests__/theme-palettes.test.ts apps/web/src/components/settings/sections/__tests__/appearance.test.tsx` | exit 0; all tests pass |
| Typecheck | `bun run check-types` | exit 0; no TypeScript errors |
| Lint | `bunx biome check apps/web/src/components/settings/sections/appearance.tsx apps/web/src/components/settings/sections/__tests__/appearance.test.tsx apps/web/src/lib/theme-palettes.ts apps/web/src/lib/__tests__/theme-palettes.test.ts` | exit 0 |
| Build | `bun run build` | exit 0 |

## Suggested executor toolkit

- Use the `shadcn` skill if available when editing the segmented mode control;
  keep the established semantic-token styling and Base UI conventions.
- Reference the existing `Input`, `Slider`, and `Button` primitives rather than
  introducing raw text/range inputs.

## Scope

**In scope** (the only files you should modify):

- `apps/web/src/components/settings/sections/appearance.tsx`
- `apps/web/src/components/settings/sections/__tests__/appearance.test.tsx`
  (create)
- `apps/web/src/lib/__tests__/theme-palettes.test.ts` only if a seed storage
  regression assertion is needed by the tests
- `plans/README.md` (status row only)

**Read-only dependencies**:

- `apps/web/src/lib/theme-palettes.ts` — the seed engine is already complete.
- `apps/web/messages/en.json`
- `apps/web/messages/es.json`

**Out of scope**:

- Changing seed derivation, contrast formulas, stored palette schema, gradient
  math, or translations.
- Replacing the mode selector with a new component library primitive.
- Changing the default for a user with no stored custom palette: Gradient must
  remain the default.
- Converting or deleting `gradientInputFromSeed`; it remains useful for the
  initial Gradient draft when a saved Seed user explicitly switches modes.

## Git workflow

- Branch: `advisor/001-restore-one-color-theme-mode`
- Use the repository's conventional style, for example:
  `fix: restore one-color theme editor`.
- Do not stage, overwrite, or discard unrelated working-tree changes.
- Do not push or open a PR unless the operator explicitly asks.

## Steps

### Step 1: Characterize the three-mode initialization

Create `apps/web/src/components/settings/sections/__tests__/appearance.test.tsx`
using `@testing-library/react` and `apps/web/src/test-utils/setup-dom.ts`.
Control `requestAnimationFrame` as in
`apps/web/src/lib/__tests__/theme-preview.test.ts` so mode changes can preview
without timing nondeterminism.

Cover these states before changing the component:

1. No stored palette opens Gradient.
2. `buildSeedPalette({...DEFAULT_SEED_INPUT.dark, seed: "#88c0d0"})`
   reopens One color and renders that seed in the color input.
3. A stored gradient reopens Gradient.
4. A stored advanced/custom recipe reopens Advanced.

The seed case should fail against the current UI and the other cases should
characterize current behavior. Prefer accessible roles plus `aria-pressed`;
do not assert a full HTML snapshot.

**Verify**:
`bun test apps/web/src/components/settings/sections/__tests__/appearance.test.tsx`
→ only the new seed-mode expectation fails before Step 2.

### Step 2: Restore Seed state and mode selection

In `appearance.tsx`:

- Import `buildSeedPalette`, `DEFAULT_SEED_INPUT`, `previewSeedVars`, and
  `SeedThemeInput` from `@/lib/theme-palettes`.
- Expand the union to
  `type CustomMode = "seed" | "gradient" | "advanced"`.
- Add a `seedInput` state initialized from `palette?.seed`; when absent, use
  `DEFAULT_SEED_INPUT[palette?.base ?? "dark"]` so switching from a saved light
  palette does not unexpectedly jump to dark.
- Select the initial mode from the recipe that is actually stored: Advanced
  for `palette.custom`, Seed for `palette.seed`, Gradient for
  `palette.gradient`, and Gradient when there is no recipe. Stored builders
  emit one recipe only; if malformed data contains several recipe fields,
  preserve the current Advanced priority, then Seed, then Gradient.
- Keep the current `initialGradient` conversion from a saved seed so an
  explicit Seed → Gradient switch starts with a related gradient; merely
  opening settings must not select or apply that conversion.

**Verify**:
`bun test apps/web/src/components/settings/sections/__tests__/appearance.test.tsx`
→ all four initialization cases pass.

### Step 3: Route preview, base, radius, and Apply through Seed

Add `previewSeed(next)` using the same contract as the recovered pre-gradient
implementation: update `seedInput`, mark `didPreviewRef`, and call
`previewTheme(() => ({ base: next.base, vars: previewSeedVars(next) }))`.

Update every mode-dependent branch:

- `activeBase`: Seed → `seedInput.base`; Gradient → `gradient.base`; Advanced →
  `custom.base`.
- `radius`: the same three-way mapping.
- `setBase`: restore the exact old Seed rule. An untouched default seed follows
  a base swap while an edited seed is preserved; always preserve radius.
- `setRadius`: update the active draft only.
- `selectMode`: preview the selected draft, including Seed. This is what clears
  an active `--theme-gradient` before showing the seed palette.
- `applyCustom`: call `buildSeedPalette(seedInput)`,
  `buildGradientPalette(gradient)`, or `buildCustomPalette(custom)` according
  to the active mode.
- Keep unmount rollback unchanged.

Extend the component test with:

- Seed → Gradient → Seed preserves both drafts.
- Applying Seed persists a palette with `seed` defined and `gradient`/`custom`
  undefined.
- Leaving an unapplied Seed preview restores the committed palette.

**Verify**:
`bun test apps/web/src/components/settings/sections/__tests__/appearance.test.tsx apps/web/src/lib/__tests__/theme-preview.test.ts`
→ all pass.

### Step 4: Restore the One color controls without regressing Gradient

- Render modes in this order: `seed`, `gradient`, `advanced`.
- Map each value to its existing translation key; do not use a nested binary
  conditional that silently labels a future value as Advanced.
- Description mapping: Seed → `custom_desc_seed`, Gradient →
  `custom_desc_gradient`, Advanced → `custom_desc`.
- Seed content is the recovered `ColorRow` using `color_seed` and
  `previewSeed({ ...seedInput, seed })`.
- Keep all existing Gradient controls and the three Advanced color rows.
- Show Surprise me and Reset only in Gradient. Keep the shared radius and Apply
  controls in every mode.

**Verify**:

```bash
rg -n '"seed", "gradient", "advanced"|custom_desc_seed|color_seed|buildSeedPalette|previewSeedVars' apps/web/src/components/settings/sections/appearance.tsx
```

→ matches all restored branches; then run the focused tests again and expect
exit 0.

### Step 5: Run repository gates

Run the TypeScript check, focused Biome check, and full build from the command
table. Inspect `git status --short` and confirm no file outside Scope was
modified by this plan.

**Verify**: all three commands exit 0.

## Test plan

- New `appearance.test.tsx` cases:
  - defaults to Gradient without a recipe;
  - reopens each stored recipe in its matching mode;
  - keeps independent Seed and Gradient drafts across switches;
  - Apply emits only the active recipe type;
  - unapplied Seed preview rolls back on unmount.
- Reuse the controlled RAF pattern from `theme-preview.test.ts`.
- Keep existing `buildSeedPalette` tests as the derivation/storage contract; do
  not duplicate their color-math assertions in a component test.

## Done criteria

- [ ] The selector exposes One color, Gradient, and Advanced, in that order.
- [ ] A stored Seed recipe opens as Seed and keeps its exact seed/base/radius.
- [ ] Gradient remains the default when no custom palette is stored.
- [ ] Preview, base, radius, Apply, and rollback operate on the active draft.
- [ ] `bun test apps/web/src/components/settings/sections/__tests__/appearance.test.tsx apps/web/src/lib/__tests__/theme-palettes.test.ts apps/web/src/lib/__tests__/theme-preview.test.ts` exits 0.
- [ ] `bun run check-types`, the focused Biome command, and `bun run build` exit
  0.
- [ ] No files outside Scope are modified; `plans/README.md` marks 001 DONE.

## STOP conditions

Stop and report back if:

- The two gradient-baseline `rg` checks in Current state do not match.
- `DEFAULT_SEED_INPUT`, `buildSeedPalette`, `previewSeedVars`, or the three seed
  translation keys are absent.
- Supporting three modes requires changing the stored palette schema.
- A test requires real network/authentication instead of local storage and DOM
  fixtures.
- A verification fails twice after a reasonable fix attempt.
- The change would overwrite staged or unrelated work.

## Maintenance notes

- Every future palette editor mode must be added to initialization, preview,
  base, radius, Apply, description, controls, and tests as one state-machine
  change.
- Reviewers should explicitly test switching modes after editing each draft;
  stale preview variables are the highest-risk regression.
- Seed derivation itself is intentionally unchanged so existing stored recipes
  keep their previous appearance.
