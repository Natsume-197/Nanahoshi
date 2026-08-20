export type DownloadDeliveryKind =
	| "ebook"
	| "audiobook"
	| "audio_file"
	| "series";

export interface DownloadDeliveryInput {
	deliveryKind: DownloadDeliveryKind;
	source: "web" | "opds" | "api";
	user: { id: string; name?: string | null };
	sessionId?: string | null;
	server: { id: string; name?: string | null };
	item: { uuid: string; title: string };
	filename: string;
	fileCount?: number;
	device?: string | null;
	ipAddress?: string | null;
}

export function toDownloadDeliveryRow(input: DownloadDeliveryInput) {
	return {
		deliveryKind: input.deliveryKind,
		source: input.source,
		userId: input.user.id,
		userName: input.user.name ?? null,
		sessionId: input.sessionId ?? null,
		serverId: input.server.id,
		serverName: input.server.name ?? null,
		itemUuid: input.item.uuid,
		itemTitle: input.item.title,
		filename: input.filename,
		fileCount: input.fileCount ?? 1,
		device: input.device ?? null,
		ipAddress: input.ipAddress ?? null,
	};
}
