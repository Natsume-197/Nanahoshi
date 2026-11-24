import type {
	Announcement,
	AnnouncementSeverity,
} from "@nanahoshi/db/schema/general";
import { getUserPermissionContext } from "../../auth/access.repository";
import { BadRequestError, NotFoundError } from "../../errors";
import type { AnnouncementFields } from "./announcement.model";
import {
	type AnnouncementScope,
	announcementRepository,
} from "./announcement.repository";

const SEVERITY_RANK: Record<AnnouncementSeverity, number> = {
	danger: 0,
	warning: 1,
	info: 2,
	success: 3,
};

/** Most urgent first; within a severity, instance-wide before server, newest first. */
export function sortForDisplay<
	T extends Pick<Announcement, "severity" | "serverId" | "createdAt">,
>(rows: T[]): T[] {
	return [...rows].sort(
		(a, b) =>
			SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
			Number(a.serverId !== null) - Number(b.serverId !== null) ||
			Date.parse(b.createdAt) - Date.parse(a.createdAt),
	);
}

/**
 * An edit that changes what the banner says, or makes it impossible to close,
 * should reach the people who already closed the old version.
 */
export function shouldResetDismissals(
	prev: Pick<Announcement, "title" | "body" | "severity" | "dismissible">,
	next: AnnouncementFields,
): boolean {
	return (
		prev.title !== next.title ||
		(prev.body ?? null) !== (next.body ?? null) ||
		prev.severity !== next.severity ||
		(prev.dismissible && !next.dismissible)
	);
}

/** The active server only counts if the user still belongs to it. */
async function visibleServerId(
	userId: string,
	activeServerId: string | null | undefined,
	isAppOwner: boolean,
): Promise<string | null> {
	if (!activeServerId) return null;
	const pc = await getUserPermissionContext(userId, activeServerId, {
		isAppOwner,
	});
	return pc.isMember || pc.isAppOwner ? activeServerId : null;
}

export async function listActive(args: {
	userId: string;
	activeServerId: string | null | undefined;
	isAppOwner: boolean;
}) {
	const serverId = await visibleServerId(
		args.userId,
		args.activeServerId,
		args.isAppOwner,
	);
	const rows = await announcementRepository.listActiveForUser(
		args.userId,
		serverId,
	);
	return sortForDisplay(rows);
}

export async function dismiss(args: {
	id: string;
	userId: string;
	activeServerId: string | null | undefined;
	isAppOwner: boolean;
}) {
	const row = await announcementRepository.findById(args.id);
	const serverId = row?.serverId
		? await visibleServerId(args.userId, args.activeServerId, args.isAppOwner)
		: null;
	if (!row || (row.serverId !== null && row.serverId !== serverId)) {
		throw new NotFoundError("Announcement not found.");
	}
	if (!row.dismissible) {
		throw new BadRequestError("This announcement cannot be dismissed.");
	}
	await announcementRepository.dismiss(row.id, args.userId);
}

export async function update(
	scope: AnnouncementScope,
	id: string,
	fields: AnnouncementFields,
) {
	const prev = await announcementRepository.findInScope(id, scope);
	if (!prev) throw new NotFoundError("Announcement not found.");
	const row = await announcementRepository.update(
		id,
		scope,
		fields,
		shouldResetDismissals(prev, fields),
	);
	if (!row) throw new NotFoundError("Announcement not found.");
	return row;
}

export async function remove(scope: AnnouncementScope, id: string) {
	const deleted = await announcementRepository.delete(id, scope);
	if (!deleted) throw new NotFoundError("Announcement not found.");
}
