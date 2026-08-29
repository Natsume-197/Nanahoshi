import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { PlayerHostProvider } from "@/components/audio-player/player-host";
import { SettingsModalHost } from "@/components/layout/settings-modal-host";
import { AudioPlayerProvider } from "@/context/audio-player-context";
import {
	flushPendingProgress,
	setPendingProgressOwner,
} from "@/features/reader/session/pending-progress";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useSessionLifecycle } from "@/hooks/use-session-lifecycle";
import { useWindowEvent } from "@/hooks/use-window-event";
import { setupQueryPersistence } from "@/lib/query-persistence";

/** Providers and lifecycle work that only authenticated routes need. */
export function AuthenticatedAppProviders({
	children,
	userId,
}: {
	children: ReactNode;
	userId: string;
}) {
	const queryClient = useQueryClient();
	setPendingProgressOwner(userId);
	useMountEffect(() => {
		setupQueryPersistence(queryClient);
		flushPendingProgress(userId);
	});
	useWindowEvent("online", () => flushPendingProgress(userId));
	useSessionLifecycle();

	return (
		<SettingsModalHost>
			<AudioPlayerProvider>
				<PlayerHostProvider>{children}</PlayerHostProvider>
			</AudioPlayerProvider>
		</SettingsModalHost>
	);
}
