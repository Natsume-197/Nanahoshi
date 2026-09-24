import type { ReactNode } from "react";
import { PlayerHostProvider } from "@/components/audio-player/player-host";
import { SettingsModalHost } from "@/components/layout/settings-modal-host";
import { AudioPlayerProvider } from "@/context/audio-player-context";
import { useSession } from "@/hooks/use-session";
import { useSessionLifecycle } from "@/hooks/use-session-lifecycle";

/** Providers and lifecycle work that only authenticated routes need. */
export function AuthenticatedAppProviders({
	children,
}: {
	children: ReactNode;
}) {
	useSessionLifecycle();
	const { data: session } = useSession();

	return (
		<SettingsModalHost>
			<AudioPlayerProvider userId={session?.user.id}>
				<PlayerHostProvider>{children}</PlayerHostProvider>
			</AudioPlayerProvider>
		</SettingsModalHost>
	);
}
