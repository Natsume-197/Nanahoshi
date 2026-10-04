/** Calendar dates travel as "YYYY-MM-DD", like a web date input: the day
 * the user picked on their own calendar, never shifted by a time zone. */

export function toDateValue(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

/** Local noon of that day (far from any midnight a DST shift could cross),
 * or null for an empty or malformed value. */
export function fromDateValue(value: string | null | undefined): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
	if (!match) return null;
	const [, year, month, day] = match.map(Number) as [
		number,
		number,
		number,
		number,
	];
	const date = new Date(year, month - 1, day, 12);
	return date.getMonth() === month - 1 ? date : null;
}
