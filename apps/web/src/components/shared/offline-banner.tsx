import { CloudSlash } from "@phosphor-icons/react";
import { useOnlineStatus } from "@/hooks/use-online-status";

export function OfflineBanner() {
	const online = useOnlineStatus();
	if (online) return null;

	return (
		<div
			role="status"
			className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-1.5 text-warning text-xs"
		>
			<CloudSlash className="size-3.5" />
			<span>Offline — showing saved data</span>
		</div>
	);
}
