import type { ReaderBootScreen } from "@nanahoshi/reader-bridge";
import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { ErrorState, Spinner } from "@/components/states";
import { useConnection } from "@/providers/app-provider";
import { usePalette } from "@/theme";
import { EmbedWebView } from "./embed-webview";
import { readerPageQuery } from "./reader-page";

/** A web page of the reader's (stats, a title's history) under the app's
 * header, rendered by the embedded reader page. */
export function EmbeddedPage({ screen }: { screen: ReaderBootScreen }) {
	const palette = usePalette();
	const { auth } = useConnection();
	const session = auth.useSession().data;
	const serverId = session?.session.activeOrganizationId;
	const page = useQuery(readerPageQuery);

	return (
		<View style={{ flex: 1, backgroundColor: palette.background }}>
			{page.error ? (
				<ErrorState
					detail={page.error.message}
					onRetry={() => page.refetch()}
				/>
			) : page.data && session && serverId ? (
				<EmbedWebView
					screen={screen}
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
