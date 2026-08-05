import { MobiContainer } from "./binary";
import { Kf8Source } from "./kf8";
import { Mobi7Source } from "./mobi7";

export type {
	MobiFormat,
	MobiMetadata,
	MobiResolvedHref,
	MobiResource,
	MobiSection,
	MobiSectionReference,
	MobiSource,
	MobiTocItem,
} from "./types";

/** Open an unencrypted MOBI7, KF8/AZW3, or joint MOBI7+KF8 ebook. */
export function openMobi(input: ArrayBuffer | Uint8Array) {
	const container = new MobiContainer(input);
	return container.isKf8
		? new Kf8Source(container)
		: new Mobi7Source(container);
}
