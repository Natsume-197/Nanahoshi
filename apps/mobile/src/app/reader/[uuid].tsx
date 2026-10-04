import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, useIsFocused, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { ErrorState, Spinner } from "@/components/states";
import { readBookMeta, saveBookMeta } from "@/downloads/files";
import { bootBookFrom } from "@/downloads/manager";
import { useConnection } from "@/providers/app-provider";
import { EmbedWebView, type ReaderWebViewHandle } from "@/reader/embed-webview";
import { readerGround } from "@/reader/reader-ground";
import { readerPageQuery } from "@/reader/reader-page";
import {
	OpenPooled,
	PooledReaderHost,
	usePooledReader,
} from "@/reader/reader-pool";
import { useReaderRouteControls } from "@/reader/use-reader-route-controls";
import { usePalette } from "@/theme";

export default function ReaderRoute() {
	const { uuid, pair } = useLocalSearchParams<{
		uuid: string;
		pair?: string;
	}>();
	const palette = usePalette();
	// The last book's background, so the screen opens on the colour it will read in.
	const [ground] = useState(() => readerGround() ?? palette.background);
	const { auth, api } = useConnection();
	const host = `reader-${uuid}`;
	const leaveRef = useRef<(next?: Href) => void>(() => {});
	const pool = usePooledReader(host, (next) => leaveRef.current(next));
	const ownReader = useRef<ReaderWebViewHandle>(null);
	const pooled = useRef(false);
	pooled.current = pool !== null;
	leaveRef.current = useReaderRouteControls(
		pool ? pool.handle : ownReader,
		() => pooled.current,
	);
	const focused = useIsFocused();
	const queryClient = useQueryClient();
	const session = auth.useSession().data;
	const activeServerId = session?.session.activeOrganizationId ?? null;

	const page = useQuery(readerPageQuery);
	// A book this device opened before starts from its copy on disk; the server
	// is asked in the background instead of in front of the book.
	const onDisk = useMemo(
		() =>
			activeServerId
				? { serverId: activeServerId, meta: readBookMeta(activeServerId, uuid) }
				: null,
		[activeServerId, uuid],
	);
	const opened = useQuery({
		queryKey: ["reader-book", uuid, activeServerId],
		enabled: !!activeServerId,
		retry: false,
		initialData: onDisk?.meta
			? { serverId: onDisk.serverId, book: onDisk.meta }
			: undefined,
		initialDataUpdatedAt: 0,
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
		<View style={{ flex: 1, backgroundColor: ground }}>
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
			) : pool ? (
				<>
					<PooledReaderHost name={host} />
					{opened.data ? (
						<OpenPooled
							pool={pool}
							screen={{
								kind: "reader",
								uuid,
								book: opened.data.book,
								readListenPairUuid: pair,
							}}
							serverId={opened.data.serverId}
						/>
					) : null}
				</>
			) : page.data && opened.data && session ? (
				<EmbedWebView
					handleRef={ownReader}
					visible={focused}
					onLeave={(next) => leaveRef.current(next)}
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
