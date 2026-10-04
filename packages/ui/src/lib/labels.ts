/** Screen-reader text the components need; apps bind their own translations. */
export interface UiLabels {
	close: () => string;
}

let labels: UiLabels = { close: () => "Close" };

export function bindUiLabels(next: UiLabels) {
	labels = next;
}

export function uiLabels(): UiLabels {
	return labels;
}
