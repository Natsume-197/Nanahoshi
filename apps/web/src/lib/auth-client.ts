import type { auth } from "@nanahoshi-v2/auth";
import {
	ac,
	admin as adminRole,
	member as memberRole,
	owner as ownerRole,
} from "@nanahoshi-v2/auth/permissions";
import {
	adminClient,
	inferAdditionalFields,
	organizationClient,
	usernameClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { getApiOrigin } from "./api-origin";

export const authClient = createAuthClient({
	baseURL: getApiOrigin(),
	// The session query already refetches on the auth signals (sign-out, org
	// switch, etc.). Focus/poll refetch just re-hit /api/auth/get-session on
	// every tab focus, sharing better-auth's 100/60s rate-limit budget and
	// tripping spurious 429s — and it contradicts the app-wide
	// refetchOnWindowFocus:false policy set on the TanStack Query client.
	sessionOptions: {
		refetchOnWindowFocus: false,
	},
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
