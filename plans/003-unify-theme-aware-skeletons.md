# Plan 003: Unify theme-aware skeleton colors and valid inline markup

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 4dc733bd..HEAD -- apps/web/src/index.css apps/web/src/components/ui/skeleton.tsx apps/web/src/components/ui/__tests__/skeleton.test.tsx apps/web/src/components/explore/explore-view.tsx apps/web/src/components/dashboard/home/section-skeleton.tsx apps/web/src/components/dashboard/home/your-collections-section.tsx apps/web/src/components/dashboard/dashboard-header-search.tsx apps/web/src/components/shared/activity-card.tsx apps/web/src/components/profile/profile-books-grid.tsx apps/web/src/components/profile/profile-audiobooks-grid.tsx apps/web/src/routes/dashboard/profile/index.tsx apps/web/src/components/settings/setting-rows.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/002-make-theme-surfaces-and-controls-adaptive.md`
- **Category**: tech-debt
- **Planned at**: commit `4dc733bd`, 2026-07-18

## Why this matters

Most loaders use the shared Skeleton, but Explore and two profile counters
reimplement it, while several callers override the shared color. The same
screen can therefore show opaque neutral blocks and translucent blocks under a
Gradient theme. Centralizing on a foreground-derived translucent color lets the
spatial gradient and Seed tint show through, and fixing inline call sites also
removes invalid `div` descendants inside headings, paragraphs, and spans.

## Current state

- `apps/web/src/components/ui/skeleton.tsx` always renders a `div` with
  `skeleton-pulse ... bg-muted`.
- `apps/web/src/index.css` animates skeleton opacity and permanently declares
  `will-change: opacity` even when Home mounts roughly a hundred placeholders.
- `explore-view.tsx:~339` manually uses `animate-pulse` plus the old opaque card
  mix instead of Skeleton.
- `profile-books-grid.tsx:~80` and `profile-audiobooks-grid.tsx:~76` manually
  render pulsing spans.
- `dashboard-header-search.tsx:~540-543` overrides Skeleton with
  `bg-foreground/10`; this is the desired central default.
- `activity-card.tsx:~297-298` overrides it back to `bg-muted`.
- `section-skeleton.tsx:~41` uses the opaque card mix for a full-card skeleton;
  `:~62` uses the same mix for a non-pulsing wrapper.
- `routes/dashboard/profile/index.tsx:~81,84` puts the current div Skeleton in an
  `h1` and `p`; `setting-rows.tsx:~110` puts it in a `span`.
- `ScrollSection` renders its `title` prop inside an `h2`; three title Skeletons
  in `section-skeleton.tsx` and one in `your-collections-section.tsx` therefore
  have the same invalid div-in-heading problem.
- Plan 002 adds `bg-surface-card`, which is the required full-card placeholder
  surface for Gradient while preserving plain/Seed/Advanced fallbacks.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused test | `bun test apps/web/src/components/ui/__tests__/skeleton.test.tsx` | exit 0 |
| Typecheck | `bun run check-types` | exit 0 |
| Lint | `bunx biome check apps/web/src/index.css apps/web/src/components/ui/skeleton.tsx apps/web/src/components/ui/__tests__/skeleton.test.tsx apps/web/src/components/explore/explore-view.tsx apps/web/src/components/dashboard/home/section-skeleton.tsx apps/web/src/components/dashboard/home/your-collections-section.tsx apps/web/src/components/dashboard/dashboard-header-search.tsx apps/web/src/components/shared/activity-card.tsx apps/web/src/components/profile/profile-books-grid.tsx apps/web/src/components/profile/profile-audiobooks-grid.tsx apps/web/src/routes/dashboard/profile/index.tsx apps/web/src/components/settings/setting-rows.tsx` | exit 0 |
| Build | `bun run build` | exit 0 |

## Suggested executor toolkit

- Use the `shadcn` skill if available. Keep Skeleton a small semantic primitive;
  do not add an animation dependency or literal theme colors.
- Follow the installed Skeleton composition pattern and the repository's
  existing `cn()` convention.

## Scope

**In scope** (the only files you should modify):

- `apps/web/src/index.css`
- `apps/web/src/components/ui/skeleton.tsx`
- `apps/web/src/components/ui/__tests__/skeleton.test.tsx` (create)
- `apps/web/src/components/explore/explore-view.tsx`
- `apps/web/src/components/dashboard/home/section-skeleton.tsx`
- `apps/web/src/components/dashboard/home/your-collections-section.tsx`
- `apps/web/src/components/dashboard/dashboard-header-search.tsx`
- `apps/web/src/components/shared/activity-card.tsx`
- `apps/web/src/components/profile/profile-books-grid.tsx`
- `apps/web/src/components/profile/profile-audiobooks-grid.tsx`
- `apps/web/src/routes/dashboard/profile/index.tsx`
- `apps/web/src/components/settings/setting-rows.tsx`
- `plans/README.md` (status row only)

**Out of scope**:

- Shimmer, gradients inside the placeholder, new timing/easing, or a new
  animation library.
- Reader loading screens/spinners and their localization.
- Changing loader dimensions, layout, query timing, or loading-state logic.
- Making all Skeleton call sites inline; only the audited invalid text and
  `ScrollSection.title` contexts need `as="span"`.

## Git workflow

- Branch: `advisor/003-theme-aware-skeletons`
- Suggested commit: `fix: unify theme-aware skeletons`.
- Preserve unrelated staged/working-tree changes.
- Do not push or open a PR unless explicitly requested.

## Steps

### Step 1: Make Skeleton semantic, variant-aware, and inline-safe

Extend Skeleton with:

- `as?: "div" | "span"`, defaulting to `div`;
- `variant?: "default" | "surface"`, defaulting to `default`;
- default color `bg-foreground/10` so every palette influences it and a
  Gradient remains visible through its transparency;
- surface color `bg-surface-card` for a whole-card placeholder.

Preserve `data-slot="skeleton"`, `skeleton-pulse`, `rounded-2xl`, caller class
merging, and standard HTML attributes. Do not use `asChild` or introduce Slot
for only two intrinsic roots.

Create `components/ui/__tests__/skeleton.test.tsx` with
`renderToStaticMarkup` assertions for:

- default root is `div`, default color class is present;
- `as="span"` emits a span, not a div;
- `variant="surface"` selects `bg-surface-card` and does not retain the default
  background class;
- caller classes are retained.

**Verify**:
`bun test apps/web/src/components/ui/__tests__/skeleton.test.tsx`
→ all tests pass.

### Step 2: Remove manual and conflicting loader recipes

- Import and use `Skeleton` in Explore's loading grid with
  `variant="surface"`; keep its dimensions, rounded corner, border, key, and
  grid unchanged.
- In `ResumeTileSectionSkeleton`, use the surface variant and remove the raw
  opaque mix.
- In `ResumeSectionSkeleton`, change the non-pulsing outer wrapper to
  `bg-surface-card`; do not turn it into a Skeleton because nested opacity
  animation would multiply with its child skeletons.
- Remove `bg-foreground/10` overrides from header-search Skeletons; they now
  inherit the default.
- Remove `bg-muted` overrides from ActivityCard Skeletons.
- Replace both profile counter `animate-pulse` spans with
  `<Skeleton as="span" className="inline-block h-4 w-16 rounded" />`.

**Verify**:

```bash
rg -n 'animate-pulse|bg-\[color-mix\(in_oklab,var\(--background\)_60%,var\(--card\)\)' apps/web/src/components/explore/explore-view.tsx apps/web/src/components/profile/profile-books-grid.tsx apps/web/src/components/profile/profile-audiobooks-grid.tsx apps/web/src/components/dashboard/home/section-skeleton.tsx
```

→ no matches.

### Step 3: Fix invalid inline Skeleton call sites

Use `as="span"` plus `inline-block` for:

- the profile name Skeleton inside `h1`;
- the profile email Skeleton inside `p`;
- the SettingStatRow Skeleton inside its value `span`;
- all four Skeletons passed to `ScrollSection.title`: the three title props in
  `section-skeleton.tsx` and the one in `your-collections-section.tsx`, because
  `ScrollSection` renders that prop inside an `h2`.

Do not change sibling Skeletons that are already in valid block/flex contexts.

**Verify**:

```bash
rg -c '<Skeleton as="span"' apps/web/src/routes/dashboard/profile/index.tsx apps/web/src/components/settings/setting-rows.tsx apps/web/src/components/dashboard/home/section-skeleton.tsx apps/web/src/components/dashboard/home/your-collections-section.tsx
```

→ reports exactly `2`, `1`, `3`, and `1` occurrences respectively, covering
the seven audited direct and `ScrollSection.title` locations without crossing
closed sibling tags.

### Step 4: Remove the permanent compositor hint

Delete only `will-change: opacity` from the `skeleton-pulse` utility in
`index.css`. Keep the keyframes, duration, easing, and reduced-motion behavior.

**Verify**:
`rg -n -A3 '@utility skeleton-pulse' apps/web/src/index.css`
→ utility contains the animation and no `will-change`.

### Step 5: Run repository gates

Run the focused test, TypeScript check, focused Biome command, and full build.
Use `git status --short` to confirm only Scope files changed.

**Verify**: every command in the command table exits 0.

## Test plan

- New server-render test covers root element, default/surface color, and class
  merging without layout-dependent assertions.
- Static grep proves the three manual pulse recipes and old Home/Explore opaque
  mix are gone, and counts the seven audited span roots in direct and indirect
  heading contexts.
- Existing theme palette tests from Plan 002 remain the source of truth for the
  `bg-surface-card` value under Gradient versus other modes.
- Reviewer smoke: throttle Home and Explore, then inspect dark/light Gradient,
  Seed, and Advanced; placeholders should remain legible while inheriting the
  surrounding tint. Toggle reduced motion and verify a stable placeholder
  remains.

## Done criteria

- [ ] Shared Skeleton defaults to `bg-foreground/10` and supports a semantic
  full-surface variant.
- [ ] Explore and profile no longer implement manual pulse placeholders.
- [ ] Home/Explore full-card placeholders use the adaptive card surface.
- [ ] Search/Activity no longer override the default Skeleton color.
- [ ] Audited text and `ScrollSection.title` contexts render span Skeletons; no
  invalid div descendants.
- [ ] `skeleton-pulse` has no permanent `will-change`.
- [ ] Focused test, typecheck, Biome, and build exit 0.
- [ ] No files outside Scope are modified; `plans/README.md` marks 003 DONE.

## STOP conditions

Stop and report back if:

- Plan 002 is not complete or `bg-surface-card` is unavailable.
- Skeleton is ref-forwarded or used with element-specific props incompatible
  with the proposed `div | span` API.
- A caller relies on a color override for contrast over cover art; leave it and
  report the exact call site rather than deleting it.
- The fix would require changing loading logic or adding shimmer.
- A verification fails twice or unrelated work would be overwritten.

## Maintenance notes

- New loaders should use Skeleton; whole-card placeholders use `surface`, while
  bars/avatar/cover placeholders use the default foreground-derived tint.
- Use `as="span"` whenever Skeleton is nested inside phrasing content.
- Avoid `will-change` on large placeholder grids; let the browser decide layer
  promotion for the short-lived opacity animation.
