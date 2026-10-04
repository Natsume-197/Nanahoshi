/** Ordered page bounds, normalized into reading order; no scrollLeft RTL model assumptions. */
export function findHorizontalStripPage(
	count: number,
	probe: number,
	direction: "ltr" | "rtl",
	bounds: (index: number) => { left: number; right: number },
): number {
	const target = direction === "rtl" ? -probe : probe;
	let low = 0;
	let high = count - 1;
	let selected = 0;
	let closest = Number.POSITIVE_INFINITY;
	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const rect = bounds(middle);
		const start = direction === "rtl" ? -rect.right : rect.left;
		const end = direction === "rtl" ? -rect.left : rect.right;
		const distance = Math.max(start - target, target - end, 0);
		if (distance < closest || (distance === closest && middle < selected)) {
			selected = middle;
			closest = distance;
		}
		if (target < start) high = middle - 1;
		else if (target > end) low = middle + 1;
		else return middle;
	}
	return selected;
}
