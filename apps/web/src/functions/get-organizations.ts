import { createServerFn } from "@tanstack/react-start";
import { authClient } from "@/lib/auth-client";
import { authMiddleware } from "@/middleware/auth";

export type DashboardOrganization = {
	id: string;
	name: string;
	slug: string;
	logo?: string | null;
};

export const getOrganizations = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }): Promise<DashboardOrganization[]> => {
		if (!context.session) return [];

		const { data } = await authClient.organization.list({
			fetchOptions: {
				headers: { cookie: context.cookie },
			},
		});

		return (data ?? []).map(({ id, name, slug, logo }) => ({
			id,
			name,
			slug,
			logo,
		}));
	});
