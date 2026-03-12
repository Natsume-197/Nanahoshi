import { env } from "@nanahoshi-v2/env/web";
import {
	admin as adminRole,
	member as memberRole,
	owner as ownerRole,
	ac,
} from "@nanahoshi-v2/auth/permissions";
import type { auth } from "@nanahoshi-v2/auth";
import {
	adminClient,
	inferAdditionalFields,
	organizationClient,
	usernameClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL: env.VITE_SERVER_URL,
	plugins: [
		inferAdditionalFields<typeof auth>(),
		organizationClient({
			ac,
			roles: {
				owner: ownerRole,
				admin: adminRole,
				member: memberRole,
			},
		}),
		adminClient(),
		usernameClient(),
	],
});

