import { ensureDefaultRole } from "../../auth/access.repository";
import { BadRequestError } from "../../errors";
import { startGlobalRecommendationRebuild } from "../../modules/recommendations/recommendation.tasks";
import { adminRepository } from "./admin.repository";

export async function getSystemStats() {
	return adminRepository.getSystemCounts();
}

export async function triggerRecommendationsRebuild(userId?: string) {
	return startGlobalRecommendationRebuild(userId);
}

export async function listUsers() {
	return adminRepository.listUsers();
}

export async function banUser(userId: string, reason?: string) {
	await adminRepository.banUser(userId, reason);
}

export async function unbanUser(userId: string) {
	await adminRepository.unbanUser(userId);
}

export async function deleteUser(userId: string, actingUserId: string) {
	if (userId === actingUserId) {
		throw new BadRequestError(
			"You cannot delete your own account from user management.",
		);
	}
	await adminRepository.deleteUser(userId);
}

export async function setUserRole(userId: string, role: "user" | "admin") {
	await adminRepository.setUserRole(userId, role);
}

export async function listServers() {
	return adminRepository.listServers();
}

export async function createServer(
	name: string,
	slug: string,
	creatorId: string,
) {
	const id = crypto.randomUUID();

	await adminRepository.createServer(id, name, slug, creatorId);

	// Seed the @everyone role so non-owner members get baseline permissions.
	await ensureDefaultRole(id);

	// New orgs get their recommendation schedules (and a first rebuild) now
	// instead of waiting for the next process restart's reconcile.
	const { enqueueRebuild, registerServerSchedules } = await import(
		"../../modules/recommendations/recommendation.scheduler"
	);
	await registerServerSchedules(id).catch(() => {});
	await enqueueRebuild(id).catch(() => {});

	return { id, name, slug };
}

export async function deleteServer(orgId: string) {
	await adminRepository.deleteServer(orgId);
}

export async function getOrgWithMembers(orgId: string) {
	return adminRepository.getOrgWithMembers(orgId);
}

export async function removeMember(memberId: string) {
	await adminRepository.removeMember(memberId);
}

export async function updateMemberRole(memberId: string, role: string) {
	await adminRepository.updateMemberRole(memberId, role);
}
