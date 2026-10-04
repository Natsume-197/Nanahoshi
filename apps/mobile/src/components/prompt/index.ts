import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import {
	type ChoiceRequest,
	createChoiceStore,
	createNoticeStore,
} from "./store";

export type { ChoiceOption, ChoiceRequest, NoticeAction } from "./store";

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
