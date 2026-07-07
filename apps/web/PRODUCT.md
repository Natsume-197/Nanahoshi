# Product

## Register

product

## Users

Self-hosters who run their own Nanahoshi server and the friends, family, and
community members they invite to it. Owners administer libraries and members;
invitees browse, search, read (ttu-parity reader), and listen. Many users read
Japanese content, so CJK text is a first-class citizen. Usage is multi-device:
desktop dashboard, tablets, and phones.

## Product Purpose

Nanahoshi is a self-hosted, multi-tenant digital library server for books and
audiobooks: scan filesystem paths, enrich metadata, index for full-text search
(PGroonga/Elasticsearch), and serve everything through a fast web app. Success
looks like: large libraries stay fast, sharing a collection with someone feels
as easy as sharing a Discord server, and the reading experience matches
dedicated readers.

## Brand Personality

Clean + communal. The base is Modal.com/Linear-style precision — neutral
surfaces, vivid spring-green accent, content (book covers) as the protagonist.
On top of that, social flows (invitations, servers, members, notifications)
borrow Discord's warmth: joining someone's library should feel like being
welcomed into a community, not filling out an admin form.

## Anti-references

- Generic shadcn admin template: identical gray cards, dashboard-by-numbers.
- Calibre/Jellyfin-style self-hosted density: cramped, dated, unpolished.
- Corporate SaaS landing style: gradient heroes, giant vanity metrics.

## Design Principles

1. **Covers carry the color.** The UI stays neutral so book art and the green
   accent do the visual talking; never compete with the content.
2. **Sharing feels social, not administrative.** Server/invite/member flows
   read like joining a community (Discord register), not managing tenants.
3. **Fast is a feature.** Skeletons everywhere, no layout shift, interactions
   tuned for large libraries and 120Hz screens.
4. **Parity where it matters.** The reader matches ttu; familiar patterns
   (AniList filters, Discord invites) are adopted deliberately, not diluted.
5. **Both themes, always.** Every surface is designed and verified in light
   and dark; dark is not an afterthought inversion.

## Accessibility & Inclusion

WCAG AA baseline: body text ≥4.5:1 contrast, visible focus states,
`prefers-reduced-motion` respected on every animation. Full CJK typographic
support (Noto Sans JP fallback). Responsive down to small phones.
