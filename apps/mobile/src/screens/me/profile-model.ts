export type ShelfTotals = {
	completed?: number;
	reading?: number;
	want?: number;
};

export type ProfileFigures = {
	finished: number;
	inProgress: number;
	wantTo: number;
};

/** The profile's three numbers: books and audiobooks together, from the
 * shelf totals the profile already shows. Null until every total is in. */
export function profileFigures(
	books: ShelfTotals,
	audiobooks: ShelfTotals,
): ProfileFigures | null {
	const parts = [
		books.completed,
		books.reading,
		books.want,
		audiobooks.completed,
		audiobooks.reading,
		audiobooks.want,
	];
	if (parts.some((part) => part === undefined)) return null;
	const sum = (a?: number, b?: number) => (a ?? 0) + (b ?? 0);
	return {
		finished: sum(books.completed, audiobooks.completed),
		inProgress: sum(books.reading, audiobooks.reading),
		wantTo: sum(books.want, audiobooks.want),
	};
}

export type ServerRole = "owner" | "admin" | "member";

type Membership = { userId: string; role: string; createdAt: Date | string };

/** Someone's place on this server, from the active organization's members:
 * the highest of their roles and when they joined. */
export function membershipOf(
	members: readonly Membership[] | null | undefined,
	userId: string | null | undefined,
): { role: ServerRole | null; joinedAt: Date | null } | null {
	if (!userId) return null;
	const found = members?.find((member) => member.userId === userId);
	if (!found) return null;
	const roles = found.role.split(",").map((role) => role.trim());
	const role = roles.includes("owner")
		? "owner"
		: roles.includes("admin")
			? "admin"
			: roles.includes("member")
				? "member"
				: null;
	const joinedAt = new Date(found.createdAt);
	return {
		role,
		joinedAt: Number.isNaN(joinedAt.getTime()) ? null : joinedAt,
	};
}

/** "noviembre de 2026" / "November 2026"; Hermes' partial Intl falls back
 * to the numeric month. */
export function monthYear(date: Date, locale: string): string {
	try {
		return new Intl.DateTimeFormat(locale, {
			month: "long",
			year: "numeric",
		}).format(date);
	} catch {
		return `${date.getMonth() + 1}/${date.getFullYear()}`;
	}
}
