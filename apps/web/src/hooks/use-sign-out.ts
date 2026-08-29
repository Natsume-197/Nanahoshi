import { toast } from "sonner";
import { useCompleteSignOut } from "@/hooks/use-complete-sign-out";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";

/** End the server session, then atomically leave authenticated client state. */
export function useSignOut() {
	const completeSignOut = useCompleteSignOut();

	return async () => {
		const { error } = await authClient.signOut();
		if (error) {
			toast.error(error.message || m["toast.sign_out_failed"]());
			return;
		}
		await completeSignOut();
	};
}
