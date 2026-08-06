import { useNavigate, useRouter } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { clearOfflineCaches } from "@/lib/offline";
import { queryClient } from "@/utils/orpc";

/**
 * Signs out and tears down every trace of the session: the cached session entry
 * first (so nothing refetches under a dead cookie), then the whole query cache,
 * the offline caches, and finally the router's loader data.
 */
export function useSignOut() {
	const navigate = useNavigate();
	const router = useRouter();

	return () => {
		authClient.signOut({
			fetchOptions: {
				onSuccess: async () => {
					queryClient.removeQueries({ queryKey: ["auth", "session"] });
					queryClient.clear();
					await clearOfflineCaches();
					await router.invalidate();
					navigate({ to: "/login" });
				},
			},
		});
	};
}
