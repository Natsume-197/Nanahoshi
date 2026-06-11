/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

export function buildDummyBookImage(key: string) {
	return `data:image/gif;ttu:${key};base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==`;
}

export function reduceObjToBlobs<T>(
	data: Record<string, T | Blob>,
): Record<string, Blob> {
	return Object.entries(data)
		.filter((d): d is [string, Blob] => d[1] instanceof Blob)
		.reduce<Record<string, Blob>>((acc, [k, v]) => {
			acc[k] = v;
			return acc;
		}, {});
}
