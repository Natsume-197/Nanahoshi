import { authorRepository } from "./author.repository";

export async function updateAuthor(input: {
	uuid: string;
	serverId: string;
	name: string;
	description?: string | null;
}): Promise<"ok" | "not_found" | "conflict"> {
	return authorRepository.rename(
		input.uuid,
		input.serverId,
		input.name,
		input.description,
	);
}
