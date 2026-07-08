import { CloudSlash } from "@phosphor-icons/react";
import { useOnlineStatus } from "@/hooks/use-online-status";

export function OfflineBanner() {
	const online = useOnlineStatus();
	if (online) return null;

	return (
		<div
			role="status"
			className="flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-1.5 text-amber-700 text-xs dark:text-amber-400"
		>
			<CloudSlash className="size-3.5" />
			<span>Offline — showing saved data</span>
		</div>
	);
}
