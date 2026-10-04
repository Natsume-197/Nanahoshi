const BACK_ZONE_RATIO = 0.2;

export function focusTapDirection({
	clientX,
	left,
	width,
	verticalMode,
}: {
	clientX: number;
	left: number;
	width: number;
	verticalMode: boolean;
}): -1 | 1 {
	const backZone = width * BACK_ZONE_RATIO;
	const inBackZone = verticalMode
		? clientX > left + width - backZone
		: clientX < left + backZone;
	return inBackZone ? -1 : 1;
}
