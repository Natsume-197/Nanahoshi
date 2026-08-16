# ebook-parser

Owns ebook format detection and parsing for both the browser reader and the
server-side catalog scanner. Callers consume `EbookDocument`; format-specific
details stay inside this package.

Current parser families:

- `epub/`: EPUB and KEPUB.
- `mobi/`: MOBI7, unencrypted AZW and KF8/AZW3.
- `fb2/`: plain FB2 XML and `.fb2.zip`, including embedded binary resources.
- `comic/`: CBZ, CBR and CB7 as naturally ordered image pages, with optional
  `ComicInfo.xml` metadata. CBZ uses the native ZIP adapter; RAR and 7z use an
  isolated 7-Zip WASM decompression backend.
- `zip/`: shared browser and Node archive adapters used by EPUB, FB2 and CBZ.

Browser callers use `openEbook`. Node callers use
`@nanahoshi-v2/ebook-parser/node` so filesystem and `node-stream-zip` never enter
the browser bundle.

To add a reflowable format:

1. Implement a parser directory that returns `EbookDocument` with
   `content.kind === "html"`.
2. Add filename/signature detection in `formats.ts` and the dispatcher.
3. Add a contract test through `EbookDocument`; keep binary/parser-detail tests
   internal to the format directory.
4. Only then expose the format in `SUPPORTED_EBOOK_FORMATS`.

To add a paged format, return `content.kind === "pages"` with stable page ids
and an `openPage` implementation. Page layout and reader storage remain web
adapter concerns; the parser must not manufacture HTML chapters.

Catalog policies such as ISBN/ASIN classification, cover persistence and
text-vs-images classification belong to the API adapter, not this package.
DOM sanitization, document wrappers and IndexedDB persistence belong to the
web reader adapter.

## Decompression license

The `7z-wasm` backend used to read CBR and CB7 is distributed under the GNU
LGPL plus the unRAR restriction. In particular, its unRAR source code may not
be used to recreate the proprietary RAR compression algorithm. This project
uses it only for archive decompression.
