import { Host } from "@expo/ui";
import {
	Column,
	Snackbar,
	SnackbarHost,
	type SnackbarHostRef,
	Text,
} from "@expo/ui/jetpack-compose";
import { fillMaxWidth, padding } from "@expo/ui/jetpack-compose/modifiers";
import { useRef, useSyncExternalStore } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { usePalette } from "@/theme";
import { ActionSheet } from "../action-menu/action-sheet";
import { choices, notices } from "./index";
import type { Notice } from "./store";

/** The open question as the Material sheet the ⋮ menus use. Mount once. */
export function ChoiceHost() {
	const palette = usePalette();
	const request = useSyncExternalStore(choices.subscribe, choices.get);
	if (!request) return null;
	return (
		<ActionSheet
			key={request.title}
			header={
				<Column modifiers={[fillMaxWidth(), padding(16, 4, 16, 16)]}>
					<Text color={palette.text} style={{ typography: "titleMedium" }}>
						{request.title}
					</Text>
					{request.message ? (
						<Text
							color={palette.textSecondary}
							style={{ typography: "bodyMedium" }}
							modifiers={[padding(0, 4, 0, 0)]}
						>
							{request.message}
						</Text>
					) : null}
				</Column>
			}
			sections={[
				request.options.map((option) => ({
					id: option.id,
					label: option.label,
					icon: option.icon,
					leading: option.leading,
					destructive: option.destructive,
					selected: option.selected,
					onPress: () => choices.answer(option.id),
				})),
			]}
			onClose={() => choices.answer(null)}
		/>
	);
}

/**
 * Material Snackbars for notices; sits where the page's bottom strips go.
 * Mounted only while a notice shows: a Compose host swallows every touch in
 * its box, and an idle one sat over the mini player.
 */
export function NoticeHost() {
	const notice = useSyncExternalStore(notices.subscribe, notices.get);
	if (!notice) return null;
	return <NoticeSnackbar key={notice.id} notice={notice} />;
}

function NoticeSnackbar({ notice }: { notice: Notice }) {
	const palette = usePalette();
	const host = useRef<SnackbarHostRef>(null);
	useMountEffect(() => {
		void host.current
			?.showSnackbar({
				message: notice.message,
				actionLabel: notice.action?.label,
				duration: notice.action ? "long" : "short",
			})
			.then((result) => {
				if (result === "actionPerformed") notices.act(notice.id);
			})
			// The host unmounts when the notice expires, which rejects the call.
			.catch(() => undefined);
	});
	return (
		<Host
			pointerEvents="box-none"
			style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 88 }}
		>
			{/* Inverse surface, as Material specs snackbars. */}
			<SnackbarHost ref={host}>
				<Snackbar
					containerColor={palette.text}
					contentColor={palette.background}
					actionContentColor={palette.background}
				/>
			</SnackbarHost>
		</Host>
	);
}
