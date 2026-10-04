import { ActionSheetIOS } from "react-native";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { type ChoiceRequest, createNoticeStore } from "./store";

export type { ChoiceOption, ChoiceRequest, NoticeAction } from "./store";

export const notices = createNoticeStore();

/** The system action sheet: options, then Cancel, destructive ones in red. */
export function askChoice(request: ChoiceRequest): Promise<string | null> {
	const labels = [
		...request.options.map((option) => option.label),
		t("common.cancel"),
	];
	const destructive = request.options.flatMap((option, index) =>
		option.destructive ? [index] : [],
	);
	return new Promise((resolve) =>
		ActionSheetIOS.showActionSheetWithOptions(
			{
				title: request.title,
				message: request.message,
				options: labels,
				cancelButtonIndex: labels.length - 1,
				destructiveButtonIndex: destructive,
			},
			(index) => resolve(request.options[index]?.id ?? null),
		),
	);
}

export function showNotice(message: string) {
	haptics.error();
	notices.show(message);
}

/** A notice for something that just happened and can be taken back. */
export function showUndo(message: string, onUndo: () => void) {
	notices.show(message, { label: t("common.undo"), onPress: onUndo });
}

/** Confirms something that started or finished out of sight. */
export function showInfo(message: string) {
	haptics.success();
	notices.show(message, undefined, true);
}
