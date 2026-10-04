import { useLocalSearchParams } from "expo-router";
import { EmbeddedPage } from "@/reader/embedded-page";
import { usePalette } from "@/theme";

/** The web's /dashboard/stats page, rendered by the embedded reader page. */
export default function StatsRoute() {
	const { view } = useLocalSearchParams<{ view?: string }>();
	const palette = usePalette();
	const initialView = view === "reading" || view === "listening" ? view : "all";
	return (
		<EmbeddedPage
			key={initialView}
			screen={{
				kind: "stats",
				view: initialView,
				background: palette.background,
			}}
		/>
	);
}
