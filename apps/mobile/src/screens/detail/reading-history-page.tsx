import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { ErrorState, Spinner } from "@/components/states";
import { t } from "@/lib/i18n";
import type { MediaKind } from "@/lib/routes";
import { audiobookDetailQueries, bookDetailQueries } from "@/lib/title-queries";
import { useApi } from "@/providers/app-provider";
import { EmbeddedPage } from "@/reader/embedded-page";
import { usePalette } from "@/theme";

/** A title's full history, as on the web's detail page: the goal and its
 * calendar, pace, runs and sessions. */
export function ReadingHistoryPage({
	uuid,
	kind,
}: {
	uuid: string;
	kind: MediaKind;
}) {
	return (
		<>
			<Stack.Screen
				options={{
					title: t(
						kind === "audiobook"
							? "listening_goal_title"
							: "reading_goal_title",
					),
				}}
			/>
			{kind === "audiobook" ? (
				<AudiobookHistory uuid={uuid} />
			) : (
				<BookHistory uuid={uuid} />
			)}
		</>
	);
}

function BookHistory({ uuid }: { uuid: string }) {
	const { orpc } = useApi();
	const palette = usePalette();
	const detail = useQuery(bookDetailQueries(orpc, uuid).detail);
	if (detail.isError) return <ErrorState onRetry={() => detail.refetch()} />;
	if (!detail.data) return <Spinner />;
	return (
		<EmbeddedPage
			screen={{
				kind: "history",
				bookUuid: uuid,
				medium: "reading",
				amountChars: detail.data.amountChars,
				background: palette.background,
			}}
		/>
	);
}

function AudiobookHistory({ uuid }: { uuid: string }) {
	const { orpc } = useApi();
	const palette = usePalette();
	const detail = useQuery(audiobookDetailQueries(orpc, uuid).detail);
	if (detail.isError) return <ErrorState onRetry={() => detail.refetch()} />;
	if (!detail.data) return <Spinner />;
	return (
		<EmbeddedPage
			screen={{
				kind: "history",
				bookUuid: uuid,
				medium: "listening",
				durationSeconds: detail.data.duration,
				chapters: detail.data.chapters.map((chapter) => ({
					title: chapter.title,
					startTime: chapter.startTime,
				})),
				background: palette.background,
			}}
		/>
	);
}
