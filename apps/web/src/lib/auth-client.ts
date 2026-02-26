import { env } from "@nanahoshi-v2/env/web";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL: env.VITE_SERVER_URL,
	plugins: [organizationClient()],
});
