export function miniPlayerBarLayer(
	isExpanded: boolean,
	hasExpandedContent: boolean,
) {
	return isExpanded || hasExpandedContent ? "z-30" : "z-[41]";
}
