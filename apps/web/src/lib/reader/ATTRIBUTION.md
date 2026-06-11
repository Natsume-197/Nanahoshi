# Attribution

Large parts of this directory (EPUB processing pipeline, character counting,
continuous-mode rendering logic and CSS sanitizer) are a TypeScript/React port
of the ッツ Ebook Reader project:

- https://github.com/ttu-ttu/ebook-reader
- License: BSD-3-Clause, Copyright (c) ッツ Reader Authors. All rights reserved.

Files containing ported code keep the original `@license BSD-3-Clause` header.
The CSS parser/stringifier is based on the css parser/compiler by NxtChg
(https://github.com/NxtChg/pieces/tree/master/js/css_parser), as vendored by
the ッツ Ebook Reader.
