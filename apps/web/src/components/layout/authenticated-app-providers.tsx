import type { ReactNode } from "react";
import { PlayerHostProvider } from "@/components/audio-player/player-host";
import { SettingsModalHost } from "@/components/layout/settings-modal-host";
import { AudioPlayerProvider } from "@/context/audio-player-context";
import { useSessionLifecycle } from "@/hooks/use-session-lifecycle";

/** Providers and lifecycle work that only authenticated routes need. */
export function AuthenticatedAppProviders({
	children,
}: {
	children: ReactNode;
}) {
	useSessionLifecycle();

	return (
		<SettingsModalHost>
			<AudioPlayerProvider>
				<PlayerHostProvider>{children}</PlayerHostProvider>
			</AudioPlayerProvider>
		</SettingsModalHost>
	);
}
