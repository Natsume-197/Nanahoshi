import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { CollectionRow } from "@/components/collection-row";
import { Fab } from "@/components/fab";
import { icons } from "@/components/icon";
import { LibraryMenuTarget } from "@/components/library-menu";
import { askChoice } from "@/components/prompt";
import { RefreshControl } from "@/components/refresh-control";
import { Bone, SkeletonPulse } from "@/components/skeleton";
import { Text } from "@/components/text";
import { useCan } from "@/lib/abilities";
import { t } from "@/lib/i18n";
import { useMiniPlayerInset } from "@/player/mini-player";
import { useApi } from "@/providers/app-provider";
import { radius, sizes, space } from "@/theme";

/** Every library on the server, drawn as Collections draws its lists. */
export function LibrariesScreen() {
	const miniPlayerInset = useMiniPlayerInset();
	const { orpc } = useApi();
	const libraries = useQuery({
		...orpc.libraries.getLibrariesOverview.queryOptions(),
		staleTime: 30_000,
	});
	const can = useCan();
	const canCreate = can("library", "create");
	const canUpload = can("library", "upload");
	return (
		<View style={{ flex: 1 }}>
			<ScrollView
				showsVerticalScrollIndicator={false}
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{
					paddingTop: space.sm,
					// Room for the floating "+" under the last library.
					paddingBottom: space.xxl + miniPlayerInset + sizes.fab,
				}}
				refreshControl={
					<RefreshControl onRefresh={() => libraries.refetch()} />
				}
			>
				{libraries.isPending ? (
					<LibrariesSkeleton />
				) : (libraries.data ?? []).length === 0 ? (
					<Text
						variant="subhead"
						tone="secondary"
						style={{ paddingHorizontal: space.lg, paddingVertical: space.lg }}
					>
						{t("library.none")}
					</Text>
				) : (
					(libraries.data ?? []).map((library) => {
						const audio = library.mediaType === "audiobook";
						const name = library.name ?? t("library.untitled");
						return (
							<LibraryMenuTarget
								key={library.uuid}
								library={{
									uuid: library.uuid,
									name,
									mediaType: library.mediaType,
								}}
							>
								{(onLongPress) => (
									<CollectionRow
										href={{
											pathname: "/library/[uuid]",
											params: { uuid: library.uuid, name },
										}}
										onLongPress={onLongPress}
										name={name}
										covers={library.previewCovers}
										fallbackIcon={audio ? icons.headphones : icons.book}
										subtitle={
											audio
												? t("media.audiobook_count", {
														count: library.bookCount,
													})
												: t("media.book_count", { count: library.bookCount })
										}
									/>
								)}
							</LibraryMenuTarget>
						);
					})
				)}
			</ScrollView>
			{canCreate || canUpload ? (
				<CreateFab canCreate={canCreate} canUpload={canUpload} />
			) : null}
		</View>
	);
}

/**
 * Making and filling libraries, as Collections does it: one floating "+".
 * Both actions ask which; uploading only once some library can take files
 * (the web's create menu gates it the same way).
 */
function CreateFab({
	canCreate,
	canUpload,
}: {
	canCreate: boolean;
	canUpload: boolean;
}) {
	const { orpc } = useApi();
	const targets = useQuery({
		...orpc.libraries.getUploadTargets.queryOptions(),
		enabled: canUpload,
		staleTime: 30_000,
	});
	const showUpload = canUpload && (targets.data ?? []).length > 0;
	if (!canCreate && !showUpload) return null;
	const onPress = async () => {
		if (!canCreate) return router.push("/setup/upload");
		if (!showUpload) return router.push("/setup/library");
		const picked = await askChoice({
			title: t("nav.create"),
			options: [
				{ id: "library", label: t("library.new"), icon: icons.shelf },
				{ id: "upload", label: t("library.upload_books"), icon: icons.upload },
			],
		});
		if (picked === "library") router.push("/setup/library");
		else if (picked === "upload") router.push("/setup/upload");
	};
	return <Fab label={t("nav.create")} onPress={onPress} />;
}

/** Two library rows while the overview loads, shaped like the real ones. */
function LibrariesSkeleton() {
	return (
		<SkeletonPulse>
			{[0, 1].map((row) => (
				<View
					key={row}
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: 20,
						padding: space.lg,
					}}
				>
					<Bone width={80} height={80} radius={radius.thumb} />
					<View style={{ flex: 1, gap: space.sm }}>
						<Bone width="60%" height={18} />
						<Bone width="30%" height={14} />
					</View>
				</View>
			))}
		</SkeletonPulse>
	);
}
