import { InternalServerError } from "../../errors";
import {
	enqueueSearchSyncBulk,
	enqueueSeriesSync,
	requiresSearchSync,
} from "../../infrastructure/search/search-sync.service";
import { seriesRepository } from "./series.repository";

export async function renameSeries(input: {
	uuid: string;
	serverId: string;
	name: string;
	description?: string | null;
}): Promise<"ok" | "not_found" | "conflict"> {
	const result = await seriesRepository.rename(
		input.uuid,
		input.serverId,
		input.name,
		input.description,
	);
	if (result !== "ok") return result;
	if (!requiresSearchSync()) return "ok";

	const seriesId = await seriesRepository.getIdByUuid(
		input.uuid,
		input.serverId,
	);
	if (seriesId == null) {
		throw new InternalServerError("Series search synchronization failed");
	}

	const bookIds = await seriesRepository.getLinkedBookIds(seriesId);
	await Promise.all([
		enqueueSeriesSync(seriesId, { deduplicate: false }),
		enqueueSearchSyncBulk(bookIds, "update"),
	]);
	return "ok";
}
