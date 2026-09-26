import { BookOpen, Headphones, Waveform } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { resolveReadListenPairState } from "@/lib/read-listen/pairing";
import { m } from "@/paraglide/messages";
import { formatReadingTime } from "@/utils/format";
import { type client, orpc } from "@/utils/orpc";
import { HERO_LINK_CLASSNAME } from "./detail-hero";

type Pairing = Awaited<
	ReturnType<typeof client.readListen.getPairings>
>["pairings"][number];

/** "🎧 Audiobook · 7h 9m" in the hero's facts line, linking the other edition. */
export function pairedPublicationMetaItem(
	pairings: readonly Pairing[] | undefined,
	mediaType: "ebook" | "audiobook",
): ReactNode {
	const pairing = pairings?.[0];
	if (!pairing) return null;
	if (mediaType === "ebook") {
		const audiobook = pairing.audiobook;
		return (
			<Link
				to="/dashboard/audiobooks/$uuid"
				params={{ uuid: audiobook.uuid }}
				className={`inline-flex items-center gap-1 ${HERO_LINK_CLASSNAME}`}
			>
				<Headphones aria-hidden="true" className="size-3.5" />
				{m["read_listen.audiobook"]()}
				{audiobook.duration
					? ` · ${formatReadingTime(audiobook.duration)}`
					: ""}
			</Link>
		);
	}
	return (
		<Link
			to="/dashboard/books/$uuid"
			params={{ uuid: pairing.ebook.uuid }}
			className={`inline-flex items-center gap-1 ${HERO_LINK_CLASSNAME}`}
		>
			<BookOpen aria-hidden="true" className="size-3.5" />
			{m["read_listen.ebook"]()}
		</Link>
	);
}

/**
 * Admin shortcut from a detail page to its pair in the metadata tray, where
 * alignments are added, inspected and removed. Unpaired titles land on the
 * unmatched list already searched for them.
 */
export function ReadListenManageMenuItem({
	publicationUuid,
	title,
}: {
	publicationUuid: string;
	title: string;
}) {
	const { data } = useQuery(
		orpc.readListen.getPairings.queryOptions({ input: { publicationUuid } }),
	);
	const pairing = data?.pairings[0];
	const search = pairing
		? {
				view: "pairings" as const,
				pairs: resolveReadListenPairState(pairing),
				pq: pairing.ebook.title ?? pairing.ebook.filename,
				pair: pairing.id,
			}
		: { view: "pairings" as const, pairs: "unmatched" as const, pq: title };
	return (
		<DropdownMenuItem asChild className="min-h-10">
			<Link to="/dashboard/metadata" search={search}>
				<Waveform aria-hidden="true" />
				{m["read_listen.manage"]()}
			</Link>
		</DropdownMenuItem>
	);
}
