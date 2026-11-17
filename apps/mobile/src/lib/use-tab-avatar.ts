import { useQuery } from "@tanstack/react-query";
import {
	type TabAvatarCheck,
	tabAvatarUrl,
	usableTabAvatar,
} from "./tab-avatar";

/** The round avatar URL for the tab bar, once the server is known to send
 * the round variant (see usableTabAvatar). */
export function useTabAvatar(avatar: string | null): string | null {
	const url = tabAvatarUrl(avatar);
	const head = useQuery({
		queryKey: ["tab-avatar-check", url],
		queryFn: async () => {
			const response = await fetch(url ?? "", { method: "HEAD" });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return response.headers.get("content-type");
		},
		enabled: !!url,
		staleTime: Number.POSITIVE_INFINITY,
		retry: 1,
	});
	const check: TabAvatarCheck = head.isSuccess
		? { status: "answered", contentType: head.data }
		: head.isError
			? { status: "failed" }
			: { status: "pending" };
	return usableTabAvatar(url, check);
}
