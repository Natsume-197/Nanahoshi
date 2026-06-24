import { z } from "zod";

export const BanUserInput = z.object({ userId: z.string() });

export const UnbanUserInput = z.object({ userId: z.string() });

export const SetUserRoleInput = z.object({
	userId: z.string(),
	role: z.enum(["user", "admin"]),
});

export const CreateOrganizationInput = z.object({
	name: z.string().min(1),
	slug: z.string().min(1),
});

export const DeleteOrganizationInput = z.object({ orgId: z.string() });

export const GetOrgWithMembersInput = z.object({ orgId: z.string() });

export const RemoveMemberInput = z.object({ memberId: z.string() });

export const UpdateMemberRoleInput = z.object({
	memberId: z.string(),
	role: z.string(),
});
