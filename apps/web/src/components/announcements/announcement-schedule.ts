export type AnnouncementStatus = "scheduled" | "live" | "ended";

/** Where a banner sits on its schedule; open ends count as "always". */
export function announcementStatus(
	a: { startsAt: string | null; endsAt: string | null },
	now: number,
): AnnouncementStatus {
	if (a.endsAt && Date.parse(a.endsAt) <= now) return "ended";
	if (a.startsAt && Date.parse(a.startsAt) > now) return "scheduled";
	return "live";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO instant → the `YYYY-MM-DDTHH:mm` a `datetime-local` input shows, in local time. */
export function toLocalInput(iso: string | null): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `datetime-local` value (local wall clock) → ISO instant; empty → null. */
export function fromLocalInput(value: string): string | null {
	if (!value) return null;
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
