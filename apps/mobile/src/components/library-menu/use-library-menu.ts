import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { askChoice, showInfo, showNotice } from "@/components/prompt";
import { useCan } from "@/lib/abilities";
import { t } from "@/lib/i18n";
import { useApi } from "@/providers/app-provider";
import type { MenuEntry, MenuItem } from "../action-menu/types";
import { icons } from "../icon-names";
import {
	type LibraryAction,
	type LibraryTarget,
	libraryActions,
} from "./model";

export type { LibraryTarget } from "./model";

/** Scans and reprocessing run on the server; progress lives on Tasks. */
export function useLibraryScan(uuid: string) {
	const { client, orpc } = useApi();
	const queryClient = useQueryClient();
	const started = (message: string) => {
		showInfo(message);
		void queryClient.invalidateQueries({ queryKey: orpc.tasks.key() });
	};
	const onError = (error: Error) =>
		showNotice(error.message || t("mobile.error.action"));
	const scan = useMutation({
		mutationFn: (mode: "incremental" | "full") =>
			client.libraries.scanLibrary({ libraryUuid: uuid, mode }),
		onSuccess: () => started(t("library.scan_started")),
		onError,
	});
	const reprocess = useMutation({
		mutationFn: () => client.libraries.reprocessLibrary({ libraryUuid: uuid }),
		onSuccess: () => started(t("library.reprocess_started")),
		onError,
	});
	return {
		scanNow: () => scan.mutate("incremental"),
		reprocess: () => reprocess.mutate(),
		// Walks every file again: slow on big libraries, so it asks first.
		fullScan: async () => {
			const confirmed = await askChoice({
				title: t("library.full_scan_confirm_title"),
				message: t("library.full_scan_confirm_desc"),
				options: [{ id: "full", label: t("library.full_scan_action") }],
			});
			if (confirmed === "full") scan.mutate("full");
		},
	};
}

/** A library's long-press actions: upload into it, the scan page, delete. */
export function useLibraryMenu(library: LibraryTarget): MenuEntry[][] {
	const { client, orpc } = useApi();
	const queryClient = useQueryClient();
	const can = useCan();
	const scan = useLibraryScan(library.uuid);
	const remove = useMutation({
		mutationFn: () => client.libraries.deleteLibrary({ uuid: library.uuid }),
		onSuccess: () => {
			showInfo(t("library.deleted"));
			void queryClient.invalidateQueries({ queryKey: orpc.libraries.key() });
		},
		onError: (error: Error) =>
			showNotice(error.message || t("mobile.error.action")),
	});

	const items: Record<LibraryAction, MenuItem> = {
		upload: {
			id: "upload",
			label: t("library.upload_books"),
			icon: icons.upload,
			onPress: () =>
				router.push({
					pathname: "/setup/upload",
					params: { library: library.uuid },
				}),
		},
		scanNow: {
			id: "scanNow",
			label: t("library.scan_now"),
			icon: icons.retry,
			onPress: scan.scanNow,
		},
		fullScan: {
			id: "fullScan",
			label: t("library.full_scan"),
			icon: icons.search,
			onPress: () => void scan.fullScan(),
		},
		reprocess: {
			id: "reprocess",
			label: t("library.reprocess"),
			icon: icons.book,
			onPress: scan.reprocess,
		},
		tasks: {
			id: "tasks",
			label: t("settings.nav.tasks"),
			icon: icons.tasks,
			onPress: () => router.push("/tasks"),
		},
		delete: {
			id: "delete",
			label: t("library.delete_library"),
			icon: icons.trash,
			destructive: true,
			onPress: async () => {
				const answer = await askChoice({
					title: t("library.delete_title"),
					message: t("library.delete_desc", { name: library.name }),
					options: [
						{ id: "delete", label: t("common.delete"), destructive: true },
					],
				});
				if (answer === "delete") remove.mutate();
			},
		},
	};
	return libraryActions(library, can).map((section) =>
		section.map((entry) =>
			typeof entry === "string"
				? items[entry]
				: {
						id: entry.group,
						label: t("library.scan_options"),
						icon: icons.retry,
						sections: [entry.actions.map((action) => items[action])],
					},
		),
	);
}
