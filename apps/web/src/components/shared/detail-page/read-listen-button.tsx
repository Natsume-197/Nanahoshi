import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ReadListenIcon } from "@/components/read-listen/read-listen-icon";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { findReadyReadListenPairings } from "@/lib/read-listen/pairing";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { HERO_SECONDARY_BUTTON } from "./detail-hero";

// The phone row splits the width with the primary; wrapping read as two labels.
const BUTTON_PROPS = {
	...HERO_SECONDARY_BUTTON,
	className: cn(HERO_SECONDARY_BUTTON.className, "whitespace-nowrap"),
};

/**
 * Opens the synchronized reader straight from a detail page. Only shows once an
 * alignment is ready; several paired editions ask which one to open.
 */
export function ReadListenButton({
	publicationUuid,
	mediaType,
}: {
	publicationUuid: string;
	mediaType: "ebook" | "audiobook";
}) {
	const { data } = useQuery(
		orpc.readListen.getPairings.queryOptions({ input: { publicationUuid } }),
	);
	const ready = findReadyReadListenPairings(data?.pairings);
	if (ready.length === 0) return null;

	const content = (
		<>
			<ReadListenIcon aria-hidden="true" weight="bold" />
			<span>{m["read_listen.open_reader"]()}</span>
		</>
	);

	if (ready.length === 1) {
		const [pairing] = ready;
		return (
			<Button asChild {...BUTTON_PROPS}>
				<Link
					to="/reader/$uuid"
					params={{ uuid: pairing.ebook.uuid }}
					search={{ pair: pairing.id }}
				>
					{content}
				</Link>
			</Button>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button {...BUTTON_PROPS}>{content}</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" sideOffset={6}>
				{ready.map((pairing) => {
					const counterpart =
						mediaType === "ebook" ? pairing.audiobook : pairing.ebook;
					return (
						<DropdownMenuItem key={pairing.id} asChild className="min-h-10">
							<Link
								to="/reader/$uuid"
								params={{ uuid: pairing.ebook.uuid }}
								search={{ pair: pairing.id }}
							>
								{counterpart.title ?? counterpart.filename}
							</Link>
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
