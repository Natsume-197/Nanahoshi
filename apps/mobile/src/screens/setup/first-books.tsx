import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/button";
import { Cover } from "@/components/cover";
import { icons } from "@/components/icon";
import { Spinner } from "@/components/states";
import { Text } from "@/components/text";
import { t } from "@/lib/i18n";
import {
	booksStage,
	isImporting,
	type LibraryKind,
	librariesFor,
} from "@/lib/setup-flow";
import { useApi } from "@/providers/app-provider";
import { space } from "@/theme";
import { FolderStep } from "./create-library";
import {
	ChoiceCard,
	HardwareBack,
	SetupDone,
	SetupStep,
	StepTransition,
} from "./scaffold";

const close = () => {
	if (router.canGoBack()) router.back();
	else router.replace("/");
};

const LIBRARY_NAMES: Record<LibraryKind, string> = {
	ebook: "library.type_books",
	audiobook: "library.type_audiobooks",
};

/**
 * A server's first books (the web's /welcome): where they are, the import as
 * it happens, then the library, ready. The step comes from what the server
 * has, so closing and coming back lands in the same place.
 */
export function FirstBooks() {
	const { orpc } = useApi();
	const tasks = useQuery({
		...orpc.tasks.getActiveTasks.queryOptions(),
		staleTime: 0,
		refetchInterval: (query) => (isImporting(query.state.data) ? 2000 : 5000),
	});
	const importing = isImporting(tasks.data);
	const overview = useQuery({
		...orpc.libraries.getLibrariesOverview.queryOptions(),
		staleTime: 0,
		refetchInterval: (query) =>
			importing || query.state.data?.every((lib) => lib.bookCount === 0)
				? 4000
				: false,
	});
	if (tasks.isPending || overview.isPending)
		return (
			<SetupStep leading="close" onBack={close} title="">
				<Spinner />
			</SetupStep>
		);

	const libraries = overview.data ?? [];
	const bookCount = libraries.reduce((sum, lib) => sum + lib.bookCount, 0);
	const stage = booksStage({
		libraryCount: libraries.length,
		bookCount,
		importing,
	});
	const task = tasks.data?.find((candidate) => candidate.status === "running");

	if (stage === "choose") return <Choose />;
	if (stage === "importing")
		return (
			<SetupStep
				leading="close"
				onBack={close}
				title={t("onboarding.importing_title")}
				lead={t("onboarding.importing_lead")}
				footer={
					<Button
						variant="secondary"
						label={t("mobile.books.background")}
						onPress={close}
					/>
				}
			>
				<View style={{ gap: space.lg, alignItems: "flex-start" }}>
					<Spinner inline tone="accent" />
					{task && task.totalJobs > 0 ? (
						<Text
							variant="subhead"
							tone="secondary"
							style={{ fontVariant: ["tabular-nums"] }}
							accessibilityLiveRegion="polite"
						>
							{t("mobile.books.progress", {
								done: task.completedJobs,
								total: task.plannedJobs ?? task.totalJobs,
							})}
						</Text>
					) : null}
					<CoverRow covers={libraries.flatMap((lib) => lib.previewCovers)} />
				</View>
			</SetupStep>
		);
	if (stage === "ready")
		return (
			<SetupDone
				visual={
					<CoverRow covers={libraries.flatMap((lib) => lib.previewCovers)} />
				}
				title={t("onboarding.ready_title")}
				lead={t("onboarding.ready_lead", {
					titles: t("onboarding.count_titles", { count: bookCount }),
				})}
				footer={<Button label={t("onboarding.ready_action")} onPress={close} />}
			/>
		);
	return <Empty />;
}

function CoverRow({ covers }: { covers: string[] }) {
	const shown = covers.slice(0, 3);
	if (shown.length === 0) return null;
	return (
		<View style={{ flexDirection: "row", gap: space.sm }}>
			{shown.map((cover) => (
				<Cover key={cover} cover={cover} width={84} />
			))}
		</View>
	);
}

type Choice = "folder" | "upload";

function Choose() {
	const { orpc, client } = useApi();
	const queryClient = useQueryClient();
	const [choice, setChoice] = useState<Choice | null>(null);
	const [direction, setDirection] = useState<1 | -1>(1);
	const go = (next: Choice | null) => {
		setDirection(next ? 1 : -1);
		setChoice(next);
	};

	const create = useMutation({
		mutationFn: async (path: string) => {
			const kinds: LibraryKind[] =
				choice === "upload"
					? ["ebook"]
					: librariesFor(await client.files.previewFolder({ location: path }));
			const created = [];
			for (const mediaType of kinds) {
				created.push(
					await client.libraries.createLibrary({
						name: t(LIBRARY_NAMES[mediaType]),
						mediaType,
						paths: [path],
						realtimeWatchEnabled: true,
						isCronWatch: false,
					}),
				);
			}
			return created;
		},
		onSuccess: async (created) => {
			const first = created[0];
			if (choice === "upload" && first)
				router.replace({
					pathname: "/setup/upload",
					params: { library: first.uuid },
				});
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.libraries.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.tasks.key() }),
			]);
		},
	});

	return (
		<StepTransition stepKey={choice ?? "choose"} direction={direction}>
			{choice ? <HardwareBack onBack={() => go(null)} /> : null}
			{choice === null ? (
				<SetupStep
					leading="close"
					onBack={close}
					title={t("onboarding.books_title")}
					lead={t("onboarding.books_lead")}
				>
					<View style={{ gap: space.md }}>
						<ChoiceCard
							icon={icons.folder}
							title={t("onboarding.books_folder")}
							description={t("onboarding.books_folder_desc")}
							onPress={() => go("folder")}
						/>
						<ChoiceCard
							icon={icons.upload}
							title={t("mobile.books.upload_title")}
							description={t("mobile.books.upload_desc")}
							onPress={() => go("upload")}
						/>
					</View>
				</SetupStep>
			) : (
				<FolderStep
					onBack={() => go(null)}
					pending={create.isPending}
					error={create.error?.message ?? null}
					onPick={(path) => create.mutate(path)}
					title={
						choice === "upload"
							? t("onboarding.upload_title")
							: t("onboarding.folder_title")
					}
					lead={
						choice === "upload"
							? t("onboarding.upload_lead")
							: t("onboarding.folder_lead")
					}
					actionLabel={
						choice === "upload"
							? t("mobile.setup.continue")
							: t("onboarding.folder_action")
					}
				/>
			)}
		</StepTransition>
	);
}

function Empty() {
	const { orpc } = useApi();
	const targets = useQuery(orpc.libraries.getUploadTargets.queryOptions());
	const target = targets.data?.[0];
	return (
		<SetupStep
			leading="close"
			onBack={close}
			title={t("onboarding.empty_title")}
			lead={t("mobile.books.empty_lead")}
			footer={
				<>
					{target ? (
						<Button
							label={t("mobile.setup.library_done_upload")}
							onPress={() =>
								router.replace({
									pathname: "/setup/upload",
									params: { library: target.uuid },
								})
							}
						/>
					) : null}
					<Button
						variant="secondary"
						label={t("mobile.books.later")}
						onPress={close}
					/>
				</>
			}
		/>
	);
}
