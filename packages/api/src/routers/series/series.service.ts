import { getBookLinkPreviewConfig } from "../settings/settings.service";
import { seriesRepository } from "./series.repository";

export async function getSeriesSharePreview(input: {
	uuid: string;
	mediaType: "ebook" | "audiobook";
}) {
	const serverId = await seriesRepository.getServerId(input.uuid);
	if (!serverId) return null;

	const config = await getBookLinkPreviewConfig(serverId);
	if (!config.enabled) return null;

	return seriesRepository.getSharePreview(
		input.uuid,
		serverId,
		input.mediaType,
	);
}

export async function renameSeries(input: {
	uuid: string;
	serverId: string;
	name: string;
	description?: string | null;
}): Promise<"ok" | "not_found" | "conflict"> {
	return seriesRepository.rename(
		input.uuid,
		input.serverId,
		input.name,
		input.description,
	);
}
