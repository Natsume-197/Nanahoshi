import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Stack } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { GroupedList, GroupedRow } from "@/components/grouped-list";
import { HeaderButton } from "@/components/header-button";
import { icons } from "@/components/icon";
import { Pressable } from "@/components/pressable";
import { showNotice } from "@/components/prompt";
import { FormSkeleton } from "@/components/skeleton";
import { ErrorState, Spinner } from "@/components/states";
import { Text } from "@/components/text";
import { TextField } from "@/components/text-field";
import { t } from "@/lib/i18n";
import { mediaUrl } from "@/lib/media";
import {
	cleanUpReplacedImage,
	type ImageSlot,
	UPLOAD_LIMIT_MB,
	uploadProfileImage,
} from "@/lib/profile-upload";
import { useMiniPlayerInset } from "@/player/mini-player";
import { useApi, useConnection } from "@/providers/app-provider";
import { space, usePalette } from "@/theme";
import { BannerCrop, type CropArea, type PickedImage } from "./banner-crop";

// The server downscales wider banners anyway; sending more is wasted upload.
const BANNER_MAX_WIDTH = 3000;
const AVATAR_SIZE = 88;

export function ProfileSettingsScreen() {
	const { orpc } = useApi();
	const profile = useQuery(orpc.profile.getProfile.queryOptions());
	if (profile.isPending)
		return <FormSkeleton fields={3} avatar={AVATAR_SIZE} />;
	if (profile.error || !profile.data) {
		return <ErrorState onRetry={() => profile.refetch()} />;
	}
	return <ProfileForm profile={profile.data} />;
}

type Profile = {
	name: string | null;
	username?: string | null;
	displayUsername?: string | null;
	email: string;
	image?: string | null;
	headerImage?: string | null;
};

function usernameError(username: string) {
	if (username.length < 3) return t("auth.err.username_min");
	if (username.length > 30) return t("auth.err.username_max");
	if (!/^[a-zA-Z0-9_.]+$/.test(username)) return t("auth.err.username_chars");
	return null;
}

function ProfileForm({ profile }: { profile: Profile }) {
	const miniPlayerInset = useMiniPlayerInset();
	const { orpc, client } = useApi();
	const { serverUrl, auth } = useConnection();
	const palette = usePalette();
	const queryClient = useQueryClient();
	const savedUsername = profile.username ?? "";
	const [name, setName] = useState(profile.name ?? "");
	const [username, setUsername] = useState(savedUsername);
	const [submitted, setSubmitted] = useState(false);
	const [cropping, setCropping] = useState<PickedImage | null>(null);

	const nameError = name.trim()
		? null
		: t("settings.profile.full_name_required");
	const handleError = usernameError(username);
	const changed =
		name.trim() !== (profile.name ?? "") || username !== savedUsername;
	const refreshProfile = () =>
		queryClient.invalidateQueries({ queryKey: orpc.profile.key() });

	const save = useMutation({
		mutationFn: async () => {
			const result = await auth.updateUser({
				...(name.trim() !== (profile.name ?? "") ? { name: name.trim() } : {}),
				...(username !== savedUsername
					? {
							username: username.toLowerCase(),
							displayUsername: username.toLowerCase(),
						}
					: {}),
			});
			if (result.error) throw new Error(result.error.message);
		},
		onSuccess: () => {
			setSubmitted(false);
			void refreshProfile();
		},
		onError: () => showNotice(t("toast.profile_update_failed")),
	});

	const upload = useMutation({
		mutationFn: async ({
			slot,
			file,
		}: {
			slot: ImageSlot;
			file: { uri: string; name: string; type: string };
		}) => {
			const url = await uploadProfileImage({ serverUrl, auth, slot, file });
			if (slot === "avatar") {
				const result = await auth.updateUser({ image: url });
				if (result.error) throw new Error(result.error.message);
			} else {
				await client.profile.updateProfile({ headerImage: url });
			}
			const oldUrl = slot === "avatar" ? profile.image : profile.headerImage;
			if (oldUrl && oldUrl !== url) {
				void cleanUpReplacedImage({ serverUrl, auth, slot, oldUrl });
			}
		},
		onSuccess: () => {
			setCropping(null);
			void refreshProfile();
		},
		onError: () => showNotice(t("settings.profile.upload_failed")),
	});

	const pick = async (slot: ImageSlot) => {
		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ["images"],
			quality: 1,
			// iOS hands HEIC over as JPEG, which the server can read.
			preferredAssetRepresentationMode:
				ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
		});
		const asset = result.canceled ? null : result.assets[0];
		if (!asset) return;
		if (slot === "header") {
			setCropping({ uri: asset.uri, width: asset.width, height: asset.height });
			return;
		}
		// Avatars go up untouched, as on the web: transparency and proportions
		// survive, and the server re-encodes them.
		const limit = UPLOAD_LIMIT_MB.avatar;
		if (asset.fileSize && asset.fileSize > limit * 1024 * 1024) {
			showNotice(t("settings.profile.image_too_large", { limit }));
			return;
		}
		upload.mutate({
			slot,
			file: {
				uri: asset.uri,
				name: asset.fileName ?? "avatar.jpg",
				type: asset.mimeType ?? "image/jpeg",
			},
		});
	};

	const applyBanner = async (area: CropArea) => {
		if (!cropping) return;
		const context = ImageManipulator.manipulate(cropping.uri).crop(area);
		if (area.width > BANNER_MAX_WIDTH) {
			context.resize({ width: BANNER_MAX_WIDTH });
		}
		const rendered = await context.renderAsync();
		const saved = await rendered.saveAsync({
			format: SaveFormat.JPEG,
			compress: 0.9,
		});
		upload.mutate({
			slot: "header",
			file: { uri: saved.uri, name: "banner.jpg", type: "image/jpeg" },
		});
	};

	const avatar = mediaUrl(serverUrl, profile.image);
	const banner = mediaUrl(serverUrl, profile.headerImage);
	const initial = (name.trim() || username).slice(0, 1).toUpperCase();

	return (
		<>
			{/* Save sits in the header and only shows once something changed. */}
			<Stack.Screen
				options={{
					headerRight: () =>
						changed ? (
							<HeaderButton
								label={t("common.save")}
								strong
								busy={save.isPending}
								onPress={() => {
									setSubmitted(true);
									if (nameError || handleError) return;
									save.mutate();
								}}
							/>
						) : null,
				}}
			/>
			<ScrollView
				showsVerticalScrollIndicator={false}
				contentInsetAdjustmentBehavior="automatic"
				keyboardShouldPersistTaps="handled"
				automaticallyAdjustKeyboardInsets
				contentContainerStyle={{
					paddingBottom: space.lg + miniPlayerInset,
				}}
			>
				{/* The profile's own top: banner, with the photo overlapping it. */}
				<View style={{ paddingBottom: AVATAR_SIZE / 2 + space.lg }}>
					<Pressable
						onPress={() => void pick("header")}
						accessibilityRole="button"
						accessibilityLabel={t("settings.profile.change_banner")}
						style={{
							// Edge to edge, as a profile's own header.
							aspectRatio: 3,
							overflow: "hidden",
							backgroundColor: palette.surfaceCard,
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						{banner ? (
							<Image
								source={{ uri: banner }}
								style={{ width: "100%", height: "100%" }}
								contentFit="cover"
							/>
						) : (
							<Text variant="subhead" tone="secondary">
								{t("settings.profile.no_banner")}
							</Text>
						)}
					</Pressable>
					<Pressable
						onPress={() => void pick("avatar")}
						accessibilityRole="button"
						accessibilityLabel={t("settings.profile.change_photo")}
						style={{
							position: "absolute",
							left: space.lg,
							bottom: space.lg,
							width: AVATAR_SIZE,
							height: AVATAR_SIZE,
							borderRadius: AVATAR_SIZE / 2,
							borderWidth: 4,
							borderColor: palette.background,
							overflow: "hidden",
							alignItems: "center",
							justifyContent: "center",
							backgroundColor: palette.surfaceCard,
						}}
					>
						{avatar ? (
							<Image
								source={{ uri: avatar }}
								style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
								contentFit="cover"
							/>
						) : (
							<Text variant="display" style={{ fontSize: 30, lineHeight: 36 }}>
								{initial}
							</Text>
						)}
					</Pressable>
				</View>

				<GroupedList>
					<GroupedRow
						first
						icon={icons.photo}
						label={
							avatar
								? t("settings.profile.change_photo")
								: t("settings.profile.upload_photo")
						}
						subtitle={t("settings.profile.profile_photo_desc")}
						disabled={upload.isPending}
						onPress={() => void pick("avatar")}
					/>
					<GroupedRow
						icon={icons.photo}
						label={
							banner
								? t("settings.profile.change_banner")
								: t("settings.profile.upload_banner")
						}
						subtitle={t("settings.profile.profile_banner_desc")}
						disabled={upload.isPending}
						onPress={() => void pick("header")}
					/>
				</GroupedList>

				<View
					style={{
						gap: space.lg,
						paddingHorizontal: space.lg,
						paddingTop: space.lg,
						borderTopWidth: StyleSheet.hairlineWidth,
						borderColor: palette.separator,
					}}
				>
					<View style={{ gap: space.xs }}>
						<TextField
							label={t("settings.profile.full_name")}
							defaultValue={name}
							onChangeText={setName}
							textContentType="name"
							autoComplete="name"
							maxLength={100}
						/>
						{submitted && nameError ? (
							<Text variant="caption" tone="danger">
								{nameError}
							</Text>
						) : null}
					</View>
					<View style={{ gap: space.xs }}>
						<TextField
							label={t("auth.username")}
							defaultValue={username}
							onChangeText={setUsername}
							autoCapitalize="none"
							autoCorrect={false}
							textContentType="username"
							autoComplete="username"
							maxLength={30}
						/>
						{submitted && handleError ? (
							<Text variant="caption" tone="danger">
								{handleError}
							</Text>
						) : null}
					</View>
					<View style={{ gap: space.xs }}>
						<Text variant="label">{t("auth.email")}</Text>
						<Text variant="body" tone="secondary" selectable>
							{profile.email}
						</Text>
					</View>
				</View>
			</ScrollView>
			{cropping ? (
				<BannerCrop
					image={cropping}
					busy={upload.isPending}
					onCancel={() => setCropping(null)}
					onApply={(area) => void applyBanner(area)}
				/>
			) : null}
			{upload.isPending && !cropping ? <UploadOverlay /> : null}
		</>
	);
}

function UploadOverlay() {
	return (
		<View
			pointerEvents="none"
			style={{
				position: "absolute",
				inset: 0,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Spinner />
		</View>
	);
}
