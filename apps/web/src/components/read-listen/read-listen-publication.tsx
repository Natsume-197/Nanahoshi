import { BookOpen, Headphones } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	COVER_EDGE,
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { formatNames } from "@/utils/format";
import type { client } from "@/utils/orpc";

export type ReadListenPublicationView = Awaited<
	ReturnType<typeof client.readListen.listMatchProposals>
>["items"][number]["audiobook"];

export function getMatchWarningLabel(warning: string): string | null {
	if (warning === "title.weak") return m["read_listen.match_title_weak"]();
	if (warning === "author.mismatch")
		return m["read_listen.match_author_mismatch"]();
	if (warning === "series.position.conflict")
		return m["read_listen.match_series_position_mismatch"]();
	return null;
}

export function MatchPublicationArtwork({
	cover,
	mediaType,
}: {
	cover: string | null;
	mediaType: "ebook" | "audiobook";
}) {
	const coverFilename = getCoverFilename(cover);
	const isAudiobook = mediaType === "audiobook";
	const frameClass = isAudiobook ? "size-11" : "h-11 w-8";

	if (coverFilename) {
		return (
			<img
				alt=""
				width={isAudiobook ? 44 : 32}
				height={44}
				loading="lazy"
				decoding="async"
				src={getCoverPresetUrl(coverFilename, coverPresets.thumbnail)}
				srcSet={getCoverSrcSet(coverFilename, coverPresets.thumbnail.widths)}
				sizes={coverPresets.thumbnail.sizes}
				className={cn(
					frameClass,
					COVER_EDGE,
					"shrink-0 rounded-md object-cover",
				)}
			/>
		);
	}

	const Icon = isAudiobook ? Headphones : BookOpen;
	return (
		<div
			aria-hidden="true"
			className={cn(
				frameClass,
				"grid shrink-0 place-items-center rounded-md bg-background text-muted-foreground shadow-sm",
			)}
		>
			<Icon className="size-5" />
		</div>
	);
}

export function PublicationLink({
	publication,
	mediaType,
}: {
	publication: ReadListenPublicationView;
	mediaType: "ebook" | "audiobook";
}) {
	return (
		<Link
			to={
				mediaType === "ebook"
					? "/dashboard/books/$uuid"
					: "/dashboard/audiobooks/$uuid"
			}
			params={{ uuid: publication.uuid }}
			preload="intent"
			className="group flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<MatchPublicationArtwork
				cover={publication.cover}
				mediaType={mediaType}
			/>
			<div className="min-w-0">
				<p className="text-[0.6875rem] text-muted-foreground leading-none md:hidden">
					{mediaType === "ebook"
						? m["read_listen.ebook"]()
						: m["read_listen.audiobook"]()}
				</p>
				<p
					title={publication.title}
					className="truncate font-medium text-sm group-hover:underline group-hover:decoration-1 group-hover:underline-offset-2"
				>
					{publication.title}
				</p>
				{publication.authors.length > 0 && (
					<p className="truncate text-muted-foreground text-xs">
						{formatNames(publication.authors)}
					</p>
				)}
			</div>
		</Link>
	);
}
