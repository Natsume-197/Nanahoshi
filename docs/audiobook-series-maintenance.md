# Audiobook series precision and targeted refresh

Migration `0111_bizarre_salo` adds `audiobook_series.sequence` and an audiobook-only provider identity table, keyed by server, provider, marketplace and provider series ID. Existing memberships are preserved. The ordinary startup migration runner applies the schema change before the API and worker start.

After migration, series pages order equal positions by structural part, so title spacing cannot put Youjo Senki's latter part first. Provider labels such as `4・番外編` remain text, with an order anchor separate from the numeric position. Decimal positions and zero are preserved; file indices and ranges are not parsed as volumes. The sequence label is visible on the series page and editable in audiobook metadata.

New enrichment retains Audible's series ID and region. Reprocessing two books with the same official identity resolves them to the same series, even when their provider names differ. Matching names with different known identities are not merged. Legacy groups are not bulk-renamed or merged merely because their names share a prefix.

## Refresh an existing record

The authenticated oRPC endpoint `audiobooks.refreshSeries` requires `editMetadata` permission. It runs a fresh provider lookup even for terminal enrichment records. It does not rescan files or download covers/chapters.

From the application's authenticated client:

```ts
const preview = await client.audiobooks.refreshSeries({ uuid });
// Inspect preview.before, preview.after, and preview.status.
const applied = await client.audiobooks.refreshSeries({ uuid, apply: true });
```

An explicitly verified Audible product may be supplied for historical ASIN errors:

```ts
await client.audiobooks.refreshSeries({ uuid, providerId: "B084GKGPGT" });
await client.audiobooks.refreshSeries({
  uuid,
  providerId: "B084GKGPGT",
  apply: true,
});
```

The product must still match the local identity; selecting an ASIN does not bypass contradictory volumes or parts. The endpoint honors stored manual matches unless a different product is explicitly selected. Provider configuration and field locks remain in force.

Statuses:

- `ready`: a preview exists; nothing was written.
- `applied`: series membership, sequence and permitted ASIN changes committed atomically.
- `protected`: manual series lock, duplicate, group lock, multiple memberships, or incompatible provider configuration.
- `unresolved`: no authoritative series identity, ambiguous match, or unsuccessful lookup. Existing data stays intact.
- `stale`: local metadata, source identity or memberships changed while providers were running; nothing was applied. Preview again.
- `not_found`: the underlying record no longer exists.

Applying repeats discovery against the current record; it does not execute a cached preview. The original metadata snapshot is retained. The database transaction preserves unrelated metadata and rolls back membership changes if the ASIN update fails. A rejected lookup never deletes an old association. Preserve the returned before/after information when running a batch.

## Validation

Unit tests cover Youjo Senki, Overlord, Silent Witch, decimal volumes, textual subseries, explicit primary authority, missing remote titles, and refresh protections. `metadata.series.integration.test.ts` uses an isolated PostgreSQL schema to exercise the generated migration, concurrent identity resolution, cross-market isolation, stale records and transaction rollback. It is included in `scripts/test-integration.sh` under `AUDIOBOOK_SERIES_INTEGRATION=1`.

Historical corrections listed in the [audit](research/audiobook-series-precision-audit-2026-09-09.md) remain a separate data-maintenance step after deployment. No production data is changed merely by adding this code or its migration.
