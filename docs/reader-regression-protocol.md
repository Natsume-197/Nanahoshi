# Reader regression protocol

Use the same long, image-heavy EPUB for every run. The reported failure can be
reproduced with `e0dc4712-f019-5e9a-a3b9-5df13b2f571c` when the local server is
running.

## Continuous

1. Open the book in continuous mode and wait until fonts and images settle.
2. Drag the scrollbar from the beginning to roughly 50%, then back to 10%,
   repeating this three times without waiting between drags.
3. Change font size once, resize the window once, and continue reading.
4. Close and reopen the reader.

Expected: the visible document stays a single aligned column; no cover or
chapter is painted beside the reading surface; the counter advances
monotonically while reading and reopens at the same chapter and character.

## Paginated

1. Open the same book in paginated mode.
2. Turn ten pages forward, five back, change font size, then turn two forward.
3. Close and reopen the reader.

Expected: the counter represents the first visible reading character, not the
estimated page height; the reopen target is the same chapter and offset.

## Restore, cache and sync

1. With a saved position, enter through the book detail page (not directly
   through a reader URL) and wait for client hydration.
2. Change reading mode and font size, then leave and reopen the book twice.
3. Repeat the first reopen while offline after one successful load.
4. On a second device/browser, open the same book from an older position and
   sync it after the newer device has moved and synced.

Expected: the counter is populated before the reader is shown, a layout change
returns to the same chapter-relative character, a same-hash reopen can use the
cached book bytes, and the newest position intent wins. No delayed response or
second loader run may move an already interactive reader.

## Evidence to attach on failure

Capture one screenshot plus the mode, viewport size, font size, current
counter, and whether the failure followed a resize or an image/font load. This
makes a rendering regression distinguishable from a bad persisted position.

## Automated browser suite

`apps/web/scripts/reader-e2e.ts` executes the core text-reader suite with
`READER_E2E_BOOK_UUID`: wheel scrolling, restore, continuous/paginated/focus
transitions, columns, font reflow and resize. The other document kinds are
intentional fixtures rather than assumptions about a particular library:

- `READER_E2E_IMAGE_BOOK_UUID`: an EPUB with a large inline image, restoring
  from its middle.
- `READER_E2E_VISUAL_BOOK_UUID`: a multi-page image-first document, exercising
  single page, spread, vertical strip, direction and restore.
- `READER_E2E_PDF_BOOK_UUID`: a multi-page PDF, exercising navigation, layout,
  search chrome and restore.

The runner also needs `READER_E2E_BASE_URL`, `READER_E2E_EMAIL`,
`READER_E2E_PASSWORD` and `READER_E2E_BROWSER`. Credentials and fixture UUIDs
are only environment variables, never repository values.

For a faster local diagnosis, set `READER_E2E_SCENARIOS` to one or more of
`text`, `image`, `visual` and `pdf` (comma-separated). Its default is `all`.
Each run uses and removes a temporary Chromium profile so PDF range requests
are not affected by the host browser cache.
