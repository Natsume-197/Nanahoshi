import { requireOptionalNativeModule } from "expo";

type Subscription = { remove: () => void };

export type ProgressState = {
	title: string;
	text: string;
	subText?: string | null;
	/** 0–1, or -1 while the size is unknown. */
	progress: number;
	cancelLabel: string;
};

export type DoneState = {
	title: string;
	text: string;
	link: string;
	quiet: boolean;
	retryLabel?: string | null;
};

type NativeModule = {
	configure(progressName: string, readyName: string): void;
	show(state: ProgressState): void;
	done(state: DoneState): void;
	hide(): void;
	addListener(
		event: "onCancel" | "onRetry",
		listener: () => void,
	): Subscription;
};

/** Android only; elsewhere every call is a no-op. */
const native = requireOptionalNativeModule<NativeModule>(
	"DownloadNotification",
);

const listen = (event: "onCancel" | "onRetry", listener: () => void) => {
	const subscription = native?.addListener(event, listener);
	return () => subscription?.remove();
};

export const downloadNotification = {
	configure: (progressName: string, readyName: string) =>
		native?.configure(progressName, readyName),
	show: (state: ProgressState) => native?.show(state),
	done: (state: DoneState) => native?.done(state),
	hide: () => native?.hide(),
	onCancel: (listener: () => void) => listen("onCancel", listener),
	onRetry: (listener: () => void) => listen("onRetry", listener),
};
