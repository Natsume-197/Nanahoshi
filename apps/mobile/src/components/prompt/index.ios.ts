import * as Haptics from "expo-haptics";
import { ActionSheetIOS } from "react-native";
import { t } from "@/lib/i18n";
import { type ChoiceRequest, createNoticeStore } from "./store";

export type { ChoiceOption, ChoiceRequest } from "./store";

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
	void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
	notices.show(message);
}
