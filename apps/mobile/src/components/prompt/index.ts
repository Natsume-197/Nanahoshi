import * as Haptics from "expo-haptics";
import {
	type ChoiceRequest,
	createChoiceStore,
	createNoticeStore,
} from "./store";

export type { ChoiceOption, ChoiceRequest } from "./store";

export const choices = createChoiceStore();
export const notices = createNoticeStore();

/**
 * Ask with the platform's own sheet instead of a dialog: the Material bottom
 * sheet on Android, the system action sheet on iOS. Resolves the picked
 * option's id, or null when dismissed.
 */
export function askChoice(request: ChoiceRequest): Promise<string | null> {
	return choices.ask(request);
}

/** A short non-modal message (Snackbar / pill) for things that failed. */
export function showNotice(message: string) {
	void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
	notices.show(message);
}
