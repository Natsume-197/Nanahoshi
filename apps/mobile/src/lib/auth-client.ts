import { expoClient } from "@better-auth/expo/client";
import { organizationClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

const AUTH_TIMEOUT_MS = 10_000;

export function createNanahoshiAuth(baseURL: string) {
	return createAuthClient({
		baseURL,
		// React Native's fetch never gives up on a server that doesn't answer.
		fetchOptions: { timeout: AUTH_TIMEOUT_MS },
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
