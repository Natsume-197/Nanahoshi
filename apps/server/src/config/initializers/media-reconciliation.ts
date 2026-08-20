import fs from "node:fs";
import { db } from "@nanahoshi-v2/db";
import { organization, user } from "@nanahoshi-v2/db/schema/auth";
import {
	avatarsDir,
	headersDir,
	serverBackgroundsDir,
	serverLogosDir,
} from "../../lib/paths";
import type { RuntimeInitializer } from "./types";

function filenameFromUrl(value: string | null): string | null {
	if (!value) return null;
	try {
		return new URL(value).pathname.split("/").at(-1) ?? null;
	} catch {
		return null;
	}
}

async function removeOrphans(
	dir: string,
	referenced: Set<string>,
	keepHeaderVariants = false,
) {
	const files = await fs.promises.readdir(dir).catch(() => []);
	const headerStems = keepHeaderVariants
		? [...referenced].map((name) => name.replace(/-\d+w\.avif$/, "-"))
		: [];
	await Promise.all(
		files
			.filter(
				(name) =>
					!referenced.has(name) &&
					!headerStems.some((stem) => name.startsWith(stem)),
			)
			.map((name) =>
				fs.promises.unlink(`${dir}/${name}`).catch(() => undefined),
			),
	);
}

export const mediaReconciliationInitializer: RuntimeInitializer = {
	name: "media-reconciliation",
	async initialize() {
		const [users, servers] = await Promise.all([
			db
				.select({ image: user.image, headerImage: user.headerImage })
				.from(user),
			db
				.select({
					logo: organization.logo,
					background: organization.background,
				})
				.from(organization),
		]);
		const names = (values: Array<string | null>) =>
			new Set(
				values.map(filenameFromUrl).filter((name): name is string => !!name),
			);
		await Promise.all([
			removeOrphans(avatarsDir, names(users.map((row) => row.image))),
			removeOrphans(
				headersDir,
				names(users.map((row) => row.headerImage)),
				true,
			),
			removeOrphans(serverLogosDir, names(servers.map((row) => row.logo))),
			removeOrphans(
				serverBackgroundsDir,
				names(servers.map((row) => row.background)),
			),
		]);
	},
};
