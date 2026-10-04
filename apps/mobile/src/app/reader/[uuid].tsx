import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { ErrorState, Spinner } from "@/components/states";
import { readBookMeta, saveBookMeta } from "@/downloads/files";
import { bootBookFrom } from "@/downloads/manager";
import { useConnection } from "@/providers/app-provider";
import { EmbedWebView } from "@/reader/embed-webview";
import { readerPageQuery } from "@/reader/reader-page";
import { usePalette } from "@/theme";

export default function ReaderRoute() {
	const { uuid, pair } = useLocalSearchParams<{
		uuid: string;
		pair?: string;
	}>();
	const palette = usePalette();
	const { auth, api } = useConnection();
	const queryClient = useQueryClient();
	const session = auth.useSession().data;
	const activeServerId = session?.session.activeOrganizationId ?? null;

	const page = useQuery(readerPageQuery);
	const opened = useQuery({
		queryKey: ["reader-book", uuid, activeServerId],
		enabled: !!activeServerId,
		retry: false,
		// Offline React Query would park this forever; it must run and fall
		// back to the copy on disk.
		networkMode: "always",
		queryFn: async () => {
			try {
				const { book, switchedOrgId } =
					await api.client.books.getBookResolvingOrg({ uuid });
				const serverId = switchedOrgId ?? (activeServerId as string);
				if (switchedOrgId && switchedOrgId !== activeServerId) {
					// Like the web (useSyncActiveOrg): the book lives in another of the
					// member's servers, so that server becomes the active one.
					await auth.organization.setActive({ organizationId: switchedOrgId });
					void queryClient.invalidateQueries({
						predicate: (query) =>
							query.queryKey[0] !== "reader-book" &&
							query.queryKey[0] !== "reader-page",
					});
				}
				const meta = bootBookFrom(book);
				saveBookMeta(serverId, uuid, meta);
				return { serverId, book: meta };
			} catch (error) {
				// Offline: a book this device opened before still opens.
				const meta = readBookMeta(activeServerId as string, uuid);
				if (meta) return { serverId: activeServerId as string, book: meta };
				throw error;
			}
		},
	});

	const failed = page.error ?? opened.error;
	return (
		<View style={{ flex: 1, backgroundColor: palette.background }}>
			{failed ? (
				<View style={{ flex: 1, justifyContent: "center" }}>
					<ErrorState
						detail={failed.message}
						onRetry={() => {
							void page.refetch();
							void opened.refetch();
						}}
					/>
				</View>
			) : page.data && opened.data && session ? (
				<EmbedWebView
					key={uuid}
					screen={{
						kind: "reader",
						uuid,
						book: opened.data.book,
						readListenPairUuid: pair,
					}}
					userId={session.user.id}
					serverId={opened.data.serverId}
					page={page.data}
					fullScreen
				/>
			) : (
				<View style={{ flex: 1, justifyContent: "center" }}>
					<Spinner />
				</View>
			)}
		</View>
	);
}
