import { seriesRepository } from "./series.repository";

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
