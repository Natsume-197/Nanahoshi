import { z } from "zod";
import { compareVersions, isPrerelease, parseVersion } from "./version";

// The newest releases, read from GitHub's public releases API. The request
// carries no instance identity: no cookie, no token, and a generic User-Agent.

const NOTES_MAX = 20_000;
const RELEASES_KEPT = 20;
const FETCH_TIMEOUT_MS = 15_000;

const GithubReleaseSchema = z.object({
	tag_name: z.string(),
	name: z.string().nullable().optional(),
	body: z.string().nullable().optional(),
	html_url: z.string(),
	published_at: z.string().nullable().optional(),
	draft: z.boolean().optional(),
	prerelease: z.boolean().optional(),
});

export const ReleaseSchema = z.object({
	version: z.string(),
	name: z.string(),
	notes: z.string(),
	url: z.string(),
	publishedAt: z.string().nullable(),
	prerelease: z.boolean(),
});
export type Release = z.infer<typeof ReleaseSchema>;

/**
 * The published releases newer than `current`, newest first. Drafts and
 * malformed tags are dropped; prereleases are offered only to an instance
 * that already runs one, since a stable install opted into stable releases.
 */
export function selectNewerReleases(
	raw: unknown,
	current: string,
): { latest: Release | null; newer: Release[] } {
	const parsed = z.array(z.unknown()).safeParse(raw);
	if (!parsed.success) throw new Error("Unexpected releases response");
	const includePrereleases = isPrerelease(current);
	const releases = parsed.data
		.map((entry) => GithubReleaseSchema.safeParse(entry))
		.filter((result) => result.success)
		.map((result) => result.data)
		.filter((release) => !release.draft && parseVersion(release.tag_name))
		.filter(
			(release) =>
				includePrereleases ||
				(!release.prerelease && !isPrerelease(release.tag_name)),
		)
		.map(
			(release): Release => ({
				version: release.tag_name,
				name: release.name?.trim() || release.tag_name,
				notes: (release.body ?? "").slice(0, NOTES_MAX),
				url: release.html_url,
				publishedAt: release.published_at ?? null,
				prerelease: Boolean(release.prerelease),
			}),
		)
		.sort((a, b) => compareVersions(b.version, a.version) ?? 0);
	const latest = releases[0] ?? null;
	const newer = parseVersion(current)
		? releases.filter(
				(release) => (compareVersions(release.version, current) ?? 0) > 0,
			)
		: [];
	return { latest, newer: newer.slice(0, RELEASES_KEPT) };
}

export async function fetchReleases(
	repository: string,
	fetcher: typeof fetch = fetch,
): Promise<unknown> {
	const response = await fetcher(
		`https://api.github.com/repos/${repository}/releases?per_page=30`,
		{
			headers: {
				Accept: "application/vnd.github+json",
				"User-Agent": "Nanahoshi-update-check",
				"X-GitHub-Api-Version": "2022-11-28",
			},
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		},
	);
	if (!response.ok) {
		throw new Error(`GitHub answered ${response.status}`);
	}
	return response.json();
}
