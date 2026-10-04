import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { ErrorState, Spinner } from "@/components/states";
import { useConnection } from "@/providers/app-provider";
import { EmbedWebView } from "@/reader/embed-webview";
import { readerPageQuery } from "@/reader/reader-page";
import { usePalette } from "@/theme";

/** The web's /dashboard/stats page, rendered by the embedded reader page. */
export default function StatsRoute() {
	const { view } = useLocalSearchParams<{ view?: string }>();
	const palette = usePalette();
	const { auth } = useConnection();
	const session = auth.useSession().data;
	const serverId = session?.session.activeOrganizationId;
	const page = useQuery(readerPageQuery);
	const initialView = view === "reading" || view === "listening" ? view : "all";

	return (
		<View style={{ flex: 1, backgroundColor: palette.background }}>
			{page.error ? (
				<ErrorState
					detail={page.error.message}
					onRetry={() => page.refetch()}
				/>
			) : page.data && session && serverId ? (
				<EmbedWebView
					key={initialView}
					screen={{ kind: "stats", view: initialView }}
					userId={session.user.id}
					serverId={serverId}
					page={page.data}
					fullScreen={false}
				/>
			) : (
				<Spinner />
			)}
		</View>
	);
}
