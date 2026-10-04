import { expoClient } from "@better-auth/expo/client";
import { organizationClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

export function createNanahoshiAuth(baseURL: string) {
	return createAuthClient({
		baseURL,
		plugins: [
			usernameClient(),
			organizationClient(),
			expoClient({
				scheme: "nanahoshi",
				storagePrefix: "nanahoshi",
				storage: SecureStore,
			}),
		],
	});
}

export type NanahoshiAuth = ReturnType<typeof createNanahoshiAuth>;
