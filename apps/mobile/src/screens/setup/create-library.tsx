import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { Button } from "@/components/button";
import { Icon, type IconName, icons } from "@/components/icon";
import { Text } from "@/components/text";
import { TextField } from "@/components/text-field";
import { t } from "@/lib/i18n";
import { parentPath, pathCrumbs } from "@/lib/setup-flow";
import { useApi } from "@/providers/app-provider";
import { radius, space, usePalette } from "@/theme";
import {
	ChoiceCard,
	HardwareBack,
	SetupDone,
	SetupStep,
	StepTransition,
} from "./scaffold";

type MediaType = "ebook" | "audiobook";
const STEPS = ["name", "type", "folder"] as const;
type Step = (typeof STEPS)[number];
/** Docker installs mount the books here (docker-compose.yml). */
const BOOKS_MOUNT = "/books";

export function CreateLibrary() {
	const { orpc, client } = useApi();
	const queryClient = useQueryClient();
	const [step, setStep] = useState<Step>("name");
	const [direction, setDirection] = useState<1 | -1>(1);
	const [name, setName] = useState("");
	const [mediaType, setMediaType] = useState<MediaType>("ebook");

	const create = useMutation({
		mutationFn: (path: string) =>
			client.libraries.createLibrary({
				name: name.trim(),
				mediaType,
				paths: [path],
				realtimeWatchEnabled: true,
				isCronWatch: false,
			}),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: orpc.libraries.key() }),
	});

	const index = STEPS.indexOf(step);
	const go = (next: Step) => {
		setDirection(STEPS.indexOf(next) > index ? 1 : -1);
		setStep(next);
	};
	const back = index > 0 ? () => go(STEPS[index - 1] as Step) : undefined;
	const progress = { index, total: STEPS.length };

	if (create.data) {
		const library = create.data;
		const scanning = library.initialScanStatus === "started";
		const lead = scanning
			? t("mobile.setup.library_done_scanning")
			: library.mediaType === "audiobook"
				? t("mobile.setup.library_done_audio_lead")
				: t("mobile.setup.library_done_upload_lead");
		return (
			<SetupDone
				title={t("mobile.setup.library_done_title", {
					name: library.name ?? name,
				})}
				lead={lead}
				footer={
					library.mediaType === "audiobook" ? (
						<Button
							label={t("mobile.setup.done")}
							onPress={() => router.back()}
						/>
					) : (
						<>
							<Button
								label={t("mobile.setup.library_done_upload")}
								onPress={() =>
									router.replace({
										pathname: "/setup/upload",
										params: { library: library.uuid },
									})
								}
							/>
							<Button
								variant="secondary"
								label={t("mobile.setup.done")}
								onPress={() => router.back()}
							/>
						</>
					)
				}
			/>
		);
	}

	return (
		<StepTransition stepKey={step} direction={direction}>
			{back ? <HardwareBack key={step} onBack={back} /> : null}
			{step === "name" ? (
				<NameStep
					initial={name}
					progress={progress}
					onNext={(value) => {
						setName(value);
						go("type");
					}}
				/>
			) : step === "type" ? (
				<SetupStep
					step={progress}
					onBack={back}
					title={t("mobile.setup.library_type_title")}
					lead={t("mobile.setup.library_type_lead")}
					footer={
						<Button
							label={t("mobile.setup.continue")}
							onPress={() => go("folder")}
						/>
					}
				>
					<View accessibilityRole="radiogroup" style={{ gap: space.md }}>
						<ChoiceCard
							icon={icons.book}
							title={t("library.type_books")}
							description={t("library.type_books_desc")}
							selected={mediaType === "ebook"}
							onPress={() => setMediaType("ebook")}
						/>
						<ChoiceCard
							icon={icons.headphones}
							title={t("library.type_audiobooks")}
							description={t("library.type_audiobooks_desc")}
							selected={mediaType === "audiobook"}
							onPress={() => setMediaType("audiobook")}
						/>
					</View>
				</SetupStep>
			) : (
				<FolderStep
					progress={progress}
					onBack={back}
					pending={create.isPending}
					error={create.error?.message ?? null}
					onPick={(path) => create.mutate(path)}
				/>
			)}
		</StepTransition>
	);
}

function NameStep({
	initial,
	progress,
	onNext,
}: {
	initial: string;
	progress: { index: number; total: number };
	onNext: (name: string) => void;
}) {
	const nameRef = useRef(initial);
	const [missing, setMissing] = useState(false);
	const next = () => {
		const value = nameRef.current.trim();
		setMissing(!value);
		if (value) onNext(value);
	};
	return (
		<SetupStep
			leading="close"
			step={progress}
			title={t("mobile.setup.library_name_title")}
			lead={t("library.name_hint")}
			footer={<Button label={t("mobile.setup.continue")} onPress={next} />}
		>
			<View style={{ gap: space.md }}>
				<TextField
					label={t("library.name")}
					placeholder={t("library.name_placeholder")}
					defaultValue={initial}
					autoFocus
					maxLength={80}
					returnKeyType="next"
					onSubmitEditing={next}
					onChangeText={(text) => {
						nameRef.current = text;
						if (text.trim()) setMissing(false);
					}}
				/>
				{missing ? (
					<Text
						variant="subhead"
						tone="danger"
						accessibilityLiveRegion="polite"
					>
						{t("library.name_required")}
					</Text>
				) : null}
			</View>
		</SetupStep>
	);
}

/**
 * The server's folders, one level at a time (the web's DirectoryPicker as a
 * list): tap to go in, the crumbs to go up, and the bottom button takes the
 * folder you're in. A typed path covers servers that can't be browsed.
 */
function FolderStep({
	progress,
	onBack,
	pending,
	error,
	onPick,
}: {
	progress: { index: number; total: number };
	onBack?: () => void;
	pending: boolean;
	error: string | null;
	onPick: (path: string) => void;
}) {
	const { orpc } = useApi();
	const palette = usePalette();
	const [path, setPath] = useState("/");
	const [typing, setTyping] = useState(false);
	const typedRef = useRef("");
	const openedMount = useRef(false);
	const directories = useQuery({
		...orpc.files.getDirectories.queryOptions({ input: { location: path } }),
		enabled: !typing,
		staleTime: 10_000,
	});
	// A Docker install has its books mounted at /books: open straight there.
	if (path === "/" && directories.data && !openedMount.current) {
		openedMount.current = true;
		if (directories.data.some((entry) => entry.path === BOOKS_MOUNT))
			setPath(BOOKS_MOUNT);
	}

	const pick = () => onPick(typing ? typedRef.current.trim() : path);
	const crumbs = pathCrumbs(path);

	return (
		<SetupStep
			step={progress}
			onBack={onBack}
			title={t("mobile.setup.library_folder_title")}
			lead={t("mobile.setup.library_folder_lead")}
			footer={
				<>
					{error ? (
						<Text
							variant="subhead"
							tone="danger"
							selectable
							accessibilityLiveRegion="polite"
						>
							{error}
						</Text>
					) : null}
					<Button
						label={t("mobile.setup.library_create")}
						onPress={pick}
						loading={pending}
						// Scanning the whole disk is never what anyone means.
						disabled={!typing && path === "/"}
					/>
					<Button
						variant="secondary"
						label={
							typing
								? t("mobile.setup.library_folder_browse")
								: t("mobile.setup.library_folder_type")
						}
						disabled={pending}
						onPress={() => {
							typedRef.current = path;
							setTyping(!typing);
						}}
					/>
				</>
			}
		>
			{typing ? (
				<TextField
					label={t("library.folder_path_label")}
					defaultValue={path}
					autoFocus
					autoCapitalize="none"
					autoCorrect={false}
					spellCheck={false}
					onChangeText={(text) => {
						typedRef.current = text;
					}}
					onSubmitEditing={pick}
				/>
			) : (
				<View style={{ gap: space.md }}>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={{ gap: space.xs, alignItems: "center" }}
					>
						{crumbs.map((crumb, i) => (
							<View
								key={crumb.path}
								style={{
									flexDirection: "row",
									alignItems: "center",
									gap: space.xs,
								}}
							>
								{i > 0 ? (
									<Icon
										name={icons.chevronRight}
										size={12}
										color={palette.textTertiary}
									/>
								) : null}
								<Pressable
									onPress={() => setPath(crumb.path)}
									hitSlop={8}
									accessibilityRole="button"
								>
									<Text
										variant="label"
										tone={i === crumbs.length - 1 ? "primary" : "secondary"}
									>
										{crumb.name === "/" ? t("dir_picker.root") : crumb.name}
									</Text>
								</Pressable>
							</View>
						))}
					</ScrollView>
					<View
						style={{
							borderRadius: radius.card,
							borderCurve: "continuous",
							overflow: "hidden",
							backgroundColor: palette.surfaceCard,
						}}
					>
						{path !== "/" ? (
							<FolderRow
								icon={icons.back}
								label={t("dir_picker.parent")}
								onPress={() => setPath(parentPath(path))}
							/>
						) : null}
						{directories.isPending ? (
							<View style={{ padding: space.xl }}>
								<ActivityIndicator color={palette.textSecondary} />
							</View>
						) : directories.isError ? (
							<Text
								variant="subhead"
								tone="secondary"
								style={{ padding: space.lg }}
							>
								{t("mobile.setup.library_folder_error")}
							</Text>
						) : !(directories.data ?? []).some(
								(directory) => !directory.name.startsWith("."),
							) ? (
							<Text
								variant="subhead"
								tone="secondary"
								style={{ padding: space.lg }}
							>
								{t("dir_picker.empty")}
							</Text>
						) : (
							(directories.data ?? [])
								// Hidden folders (.snapshots, .cache) are never a library.
								.filter((directory) => !directory.name.startsWith("."))
								.sort((a, b) => a.name.localeCompare(b.name))
								.map((directory) => (
									<FolderRow
										key={directory.path}
										icon={icons.folder}
										label={directory.name}
										chevron
										onPress={() => setPath(directory.path)}
									/>
								))
						)}
					</View>
				</View>
			)}
		</SetupStep>
	);
}

function FolderRow({
	icon,
	label,
	chevron,
	onPress,
}: {
	icon: IconName;
	label: string;
	chevron?: boolean;
	onPress: () => void;
}) {
	const palette = usePalette();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			android_ripple={{ color: palette.ripple }}
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "center",
				gap: space.md,
				minHeight: 52,
				paddingHorizontal: space.lg,
				backgroundColor:
					pressed && process.env.EXPO_OS === "ios"
						? palette.surfaceCardHover
						: "transparent",
			})}
		>
			<Icon name={icon} size={20} color={palette.textSecondary} />
			<Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
				{label}
			</Text>
			{chevron ? (
				<Icon
					name={icons.chevronRight}
					size={14}
					color={palette.textTertiary}
				/>
			) : null}
		</Pressable>
	);
}
