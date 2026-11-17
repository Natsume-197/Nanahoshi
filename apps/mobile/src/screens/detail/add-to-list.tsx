import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Icon, icons } from "@/components/icon";
import { Pressable } from "@/components/pressable";
import { showNotice } from "@/components/prompt";
import { Text } from "@/components/text";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import {
	patchQueries,
	withMembership,
	withShelfStatus,
} from "@/lib/optimistic";
import { IS_ANDROID } from "@/lib/platform";
import { type ShelfStatus, shelfMeta } from "@/lib/shelves";
import { inSeenOrder } from "@/lib/stable-order";
import { useApi } from "@/providers/app-provider";
import { radius, space, usePalette } from "@/theme";
import { fromBucket, useShelfStatus } from "./use-shelf-status";

export const BUCKETS: ShelfStatus[] = [
	"want",
	"reading",
	"backlog",
	"completed",
];

/** Shelf and collection membership for one title, saved on every tap. */
export function useAddToList(uuid: string, kind: "ebook" | "audiobook") {
	const { orpc } = useApi();
	const queryClient = useQueryClient();
	const current = useShelfStatus(uuid, kind);
	const memberships = useQuery(
		orpc.collections.listBookMemberships.queryOptions({
			input: { bookUuid: uuid },
		}),
	);

	// Every tap shows at once; a failed save puts the old state back. The
	// refetch waits for the last of a burst, so it never undoes a later tap.
	const shelfMutation = ["add-to-list", "shelf", uuid];
	const shelfKey =
		kind === "audiobook"
			? orpc.audiobookShelf.get.queryKey({ input: { bookUuid: uuid } })
			: orpc.bookShelf.get.queryKey({ input: { bookUuid: uuid } });
	const shelfOptions = <V,>(status: (input: V) => string | null) => ({
		mutationKey: shelfMutation,
		onMutate: (input: V) =>
			patchQueries<{ status: string } | null>(
				queryClient,
				{ queryKey: shelfKey, exact: true },
				(entry) => withShelfStatus(entry, status(input)),
			),
		onError: (_error: unknown, _input: unknown, undo?: () => void) => {
			undo?.();
			showNotice(t("mobile.error.action"));
		},
		onSettled: () => {
			if (queryClient.isMutating({ mutationKey: shelfMutation }) > 1) return;
			return Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.bookShelf.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.audiobookShelf.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.shelves.key() }),
			]);
		},
	});
	const setBook = useMutation({
		...orpc.bookShelf.set.mutationOptions(),
		...shelfOptions((input: { status: string }) => input.status),
	});
	const setAudio = useMutation({
		...orpc.audiobookShelf.set.mutationOptions(),
		...shelfOptions((input: { status: string }) => input.status),
	});
	const removeBook = useMutation({
		...orpc.bookShelf.remove.mutationOptions(),
		...shelfOptions(() => null),
	});
	const removeAudio = useMutation({
		...orpc.audiobookShelf.remove.mutationOptions(),
		...shelfOptions(() => null),
	});
	const membershipMutation = ["add-to-list", "membership", uuid];
	const membershipKey = orpc.collections.listBookMemberships.queryKey({
		input: { bookUuid: uuid },
	});
	const membership = useMutation({
		...orpc.collections.setBookMembership.mutationOptions(),
		mutationKey: membershipMutation,
		onMutate: (input) =>
			patchQueries<NonNullable<typeof memberships.data>>(
				queryClient,
				{ queryKey: membershipKey, exact: true },
				(list) => withMembership(list, input.collectionId, input.inCollection),
			),
		onError: (_error, _input, undo) => {
			undo?.();
			showNotice(t("mobile.error.action"));
		},
		onSettled: () => {
			if (queryClient.isMutating({ mutationKey: membershipMutation }) > 1)
				return;
			return queryClient.invalidateQueries({
				queryKey: orpc.collections.key(),
			});
		},
	});

	const pickShelf = (bucket: ShelfStatus) => {
		haptics.select();
		if (current.bucket === bucket) {
			if (kind === "audiobook") removeAudio.mutate({ bookUuid: uuid });
			else removeBook.mutate({ bookUuid: uuid });
			return;
		}
		if (kind === "audiobook") {
			setAudio.mutate({
				bookUuid: uuid,
				status: fromBucket(bucket, "audiobook") as "want_to_listen",
			});
		} else {
			setBook.mutate({
				bookUuid: uuid,
				status: fromBucket(bucket, "ebook") as "want_to_read",
			});
		}
	};
	const toggleCollection = (collection: {
		id: string;
		inCollection: boolean;
	}) => {
		haptics.select();
		membership.mutate({
			collectionId: collection.id,
			bookUuid: uuid,
			inCollection: !collection.inCollection,
		});
	};
	const manual = (memberships.data ?? []).filter(
		(collection) => collection.kind === "manual",
	);
	// The server sorts by last update, so each save would move the row just
	// tapped; while the sheet is open rows stay where they first appeared.
	const [seen, setSeen] = useState<string[] | null>(null);
	if (seen === null && memberships.data)
		setSeen(manual.map((collection) => collection.id));
	const collections = inSeenOrder(manual, seen ?? []);
	return { bucket: current.bucket, collections, pickShelf, toggleCollection };
}

/**
 * The web's AddToListModal as a sheet (iOS page sheet): one reading-status
 * shelf (tap the current one again to take it off), then every manual
 * collection with a check for membership. Each tap saves immediately.
 */
export function AddToList({
	uuid,
	kind,
}: {
	uuid: string;
	kind: "ebook" | "audiobook";
}) {
	const palette = usePalette();
	const {
		bucket: picked,
		collections: manual,
		pickShelf,
		toggleCollection,
	} = useAddToList(uuid, kind);

	return (
		<ScrollView
			showsVerticalScrollIndicator={false}
			contentContainerStyle={{
				padding: space.lg,
				gap: space.xl,
				paddingBottom: space.xxl,
			}}
		>
			<View style={{ gap: space.sm }}>
				{BUCKETS.map((bucket) => {
					const meta = shelfMeta(bucket, kind);
					const selected = bucket === picked;
					return (
						<Pressable
							key={bucket}
							onPress={() => pickShelf(bucket)}
							accessibilityRole="radio"
							accessibilityState={{ checked: selected }}
							style={({ pressed }) => ({
								flexDirection: "row",
								alignItems: "center",
								gap: space.md,
								minHeight: 48,
								paddingHorizontal: space.lg,
								borderRadius: radius.field,
								borderCurve: "continuous",
								borderWidth: 1,
								borderColor: selected ? palette.primary : palette.separator,
								backgroundColor: selected
									? palette.accentSoft
									: pressed
										? palette.surface
										: "transparent",
							})}
						>
							<Icon
								name={meta.icon}
								size={18}
								color={selected ? palette.primary : palette.textSecondary}
							/>
							<Text variant="label" style={{ flex: 1 }}>
								{meta.label}
							</Text>
							{selected ? (
								<Icon name={icons.check} size={18} color={palette.primary} />
							) : null}
						</Pressable>
					);
				})}
			</View>

			{manual.length > 0 ? (
				<View style={{ gap: space.sm }}>
					<Text variant="label" tone="secondary">
						{t("nav.collections")}
					</Text>
					<View
						style={{
							borderRadius: radius.card,
							backgroundColor: palette.surfaceCard,
							overflow: "hidden",
						}}
					>
						{manual.map((collection, index) => (
							<Pressable
								android_ripple={{ color: palette.ripple }}
								key={collection.id}
								accessibilityRole="checkbox"
								accessibilityState={{ checked: collection.inCollection }}
								onPress={() => toggleCollection(collection)}
								style={({ pressed }) => ({
									flexDirection: "row",
									alignItems: "center",
									gap: space.md,
									minHeight: 52,
									paddingHorizontal: space.lg,
									borderTopWidth: index === 0 ? 0 : 1,
									borderColor: palette.separator,
									backgroundColor:
										pressed && !IS_ANDROID ? palette.surface : "transparent",
								})}
							>
								<View style={{ flex: 1 }}>
									<Text variant="subhead" numberOfLines={1}>
										{collection.name}
									</Text>
									<Text variant="caption" tone="secondary">
										{t("media.item_count", { count: collection.bookCount })}
									</Text>
								</View>
								<View
									style={{
										width: 22,
										height: 22,
										borderRadius: 6,
										borderWidth: collection.inCollection ? 0 : 1.5,
										borderColor: palette.textTertiary,
										backgroundColor: collection.inCollection
											? palette.primary
											: "transparent",
										alignItems: "center",
										justifyContent: "center",
									}}
								>
									{collection.inCollection ? (
										<Icon
											name={icons.check}
											size={14}
											color={palette.onPrimary}
										/>
									) : null}
								</View>
							</Pressable>
						))}
					</View>
				</View>
			) : null}
		</ScrollView>
	);
}
