/** Placeholder URI used by cached books created before resources used ttu:. */
export function buildDummyBookImage(key: string) {
	return `data:image/gif;ttu:${key};base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==`;
}
