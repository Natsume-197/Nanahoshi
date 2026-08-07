export type UploadFailureKind = "network" | "aborted";

export class UploadRequestError extends Error {
	constructor(readonly kind: UploadFailureKind) {
		super(kind);
		this.name = "UploadRequestError";
	}
}

export interface UploadResponse {
	status: number;
	ok: boolean;
	body: unknown;
}

/**
 * POSTs a FormData with byte-level progress and cancellation — `fetch` reports
 * neither, and a multi-hundred-megabyte upload with no feedback reads as frozen.
 */
export function uploadWithProgress({
	url,
	body,
	onProgress,
	onTransferComplete,
}: {
	url: string;
	body: FormData;
	/** Fraction of the request body acknowledged, 0..1. */
	onProgress?: (fraction: number) => void;
	/** Bytes are all up; the server is still working on them. */
	onTransferComplete?: () => void;
}): { promise: Promise<UploadResponse>; abort: () => void } {
	const xhr = new XMLHttpRequest();
	const promise = new Promise<UploadResponse>((resolve, reject) => {
		xhr.open("POST", url, true);
		xhr.withCredentials = true;
		xhr.responseType = "text";

		xhr.upload.addEventListener("progress", (event) => {
			if (!event.lengthComputable || event.total <= 0) return;
			onProgress?.(Math.min(1, event.loaded / event.total));
		});
		xhr.upload.addEventListener("load", () => {
			onProgress?.(1);
			onTransferComplete?.();
		});
		xhr.addEventListener("load", () => {
			let parsed: unknown = null;
			try {
				parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
			} catch {
				parsed = null;
			}
			resolve({
				status: xhr.status,
				ok: xhr.status >= 200 && xhr.status < 300,
				body: parsed,
			});
		});
		xhr.addEventListener("error", () =>
			reject(new UploadRequestError("network")),
		);
		xhr.addEventListener("abort", () =>
			reject(new UploadRequestError("aborted")),
		);
		xhr.send(body);
	});

	return { promise, abort: () => xhr.abort() };
}
