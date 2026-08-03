import { authClient } from "@/lib/auth-client";
import { clearOfflineCaches } from "@/lib/offline";
import { getErrorMessage } from "@/utils/format";
import { queryClient } from "@/utils/orpc";

async function resetIdentityCaches() {
	queryClient.clear();
	await clearOfflineCaches();
}

export async function startImpersonating(userId: string) {
	const { error } = await authClient.admin.impersonateUser({ userId });
	if (error) throw new Error(error.message || getErrorMessage(error));
	await resetIdentityCaches();
	window.location.assign("/dashboard");
}

export async function stopImpersonating() {
	const { error } = await authClient.admin.stopImpersonating();
	if (error) throw new Error(error.message || getErrorMessage(error));
	await resetIdentityCaches();
	window.location.assign("/dashboard");
}
