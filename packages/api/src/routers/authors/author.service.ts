import { InternalServerError } from "../../errors";
import {
	enqueueAuthorSync,
	enqueueSearchSyncBulk,
	requiresSearchSync,
} from "../../infrastructure/search/search-sync.service";
import { authorRepository } from "./author.repository";

export async function updateAuthor(input: {
	uuid: string;
	serverId: string;
	name: string;
	description?: string | null;
}): Promise<"ok" | "not_found" | "conflict"> {
	const result = await authorRepository.rename(
		input.uuid,
		input.serverId,
		input.name,
		input.description,
	);
	if (result !== "ok") return result;
	if (!requiresSearchSync()) return "ok";

	const authorId = await authorRepository.getIdByUuid(
		input.uuid,
		input.serverId,
	);
	if (authorId == null) {
		throw new InternalServerError("Author search synchronization failed");
	}

	const bookIds = await authorRepository.getLinkedBookIds(authorId);
	await Promise.all([
		enqueueAuthorSync(authorId, { deduplicate: false }),
		enqueueSearchSyncBulk(bookIds, "update"),
	]);
	return "ok";
}
