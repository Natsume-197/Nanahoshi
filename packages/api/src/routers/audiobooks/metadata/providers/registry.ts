import { audibleProvider } from "./audible.provider";
import type { IAudiobookMetadataProvider } from "./IMetadata.provider";
import { itunesProvider } from "./itunes.provider";
import type { AudiobookProviderName } from "./provider.manifest";

// Implementation binding for the providers declared in provider.manifest.ts.
// The Record type enforces one entry per declared id. Import this only from
// code that actually calls providers — models and pure logic use the manifest.
export const AUDIOBOOK_PROVIDERS: Record<
	AudiobookProviderName,
	IAudiobookMetadataProvider
> = {
	audible: audibleProvider,
	itunes: itunesProvider,
};
