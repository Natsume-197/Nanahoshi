import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { askChoice } from "@/components/prompt";
import { t } from "@/lib/i18n";
import { useApi } from "@/providers/app-provider";

// The reader screen currently narrating, if any (set by its WebView host).
let activePairUuid: string | null = null;
export const setActiveReadListenPair = (pairUuid: string | null) => {
	activePairUuid = pairUuid;
};

export const openReadListen = (ebookUuid: string, pairUuid: string) =>
	router.push({
		pathname: "/reader/[uuid]",
		params: { uuid: ebookUuid, pair: pairUuid },
	});

/** From the full player: back to the reader that is narrating, or open it. */
export function openReadListenFromPlayer(ebookUuid: string, pairUuid: string) {
	router.back();
	if (activePairUuid !== pairUuid) openReadListen(ebookUuid, pairUuid);
}

/** The first ready pairing of an audiobook or ebook, for the player's button. */
export function useReadyPairing(uuid: string | undefined) {
	const { orpc } = useApi();
	const { data } = useQuery({
		...orpc.readListen.getPairings.queryOptions({
			input: { publicationUuid: uuid ?? "" },
		}),
		enabled: !!uuid,
	});
	return data?.pairings.find((pairing) => pairing.alignment.status === "ready");
}

/**
 * The web's ReadListenButton action: opens the synchronized reader from a
 * detail page once an alignment is ready (null until then); several paired
 * editions ask which one.
 */
export function useReadListenEntry(uuid: string, kind: "ebook" | "audiobook") {
	const { orpc } = useApi();
	const { data } = useQuery(
		orpc.readListen.getPairings.queryOptions({
			input: { publicationUuid: uuid },
		}),
	);
	const ready =
		data?.pairings.filter((pairing) => pairing.alignment.status === "ready") ??
		[];
	if (ready.length === 0) return null;
	return () => {
		const [only] = ready;
		if (ready.length === 1 && only)
			return openReadListen(only.ebook.uuid, only.id);
		void askChoice({
			title: t("read_listen.open_reader"),
			options: ready.map((pairing) => {
				const counterpart =
					kind === "ebook" ? pairing.audiobook : pairing.ebook;
				return {
					id: pairing.id,
					label: counterpart.title ?? counterpart.filename ?? "",
				};
			}),
		}).then((answer) => {
			const pairing = ready.find((candidate) => candidate.id === answer);
			if (pairing) openReadListen(pairing.ebook.uuid, pairing.id);
		});
	};
}
