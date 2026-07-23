import { amazonProvider } from "./amazon.provider";
import { comicvineProvider } from "./comicvine.provider";
import { goodreadsProvider } from "./goodreads.provider";
import { googlebooksProvider } from "./googlebooks.provider";
import { hardcoverProvider } from "./hardcover.provider";
import type { ISearchableMetadataProvider } from "./IMetadata.provider";
import { openlibraryProvider } from "./openlibrary.provider";
import type { MetadataProviderName } from "./provider.manifest";
import { ranobedbProvider } from "./ranobedb.provider";

// Implementation binding for the providers declared in provider.manifest.ts.
// The Record type enforces one entry per declared id. Import this only from
// code that actually calls providers — models and pure logic use the manifest.
export const BOOK_PROVIDERS: Record<
	MetadataProviderName,
	ISearchableMetadataProvider
> = {
	ranobedb: ranobedbProvider,
	amazon: amazonProvider,
	googlebooks: googlebooksProvider,
	openlibrary: openlibraryProvider,
	goodreads: goodreadsProvider,
	hardcover: hardcoverProvider,
	comicvine: comicvineProvider,
};
