import { bindReaderHost } from "@nanahoshi/reader/host/reader-host";
import { toast } from "sonner";
import { usePlayAudiobook } from "@/components/audio-player/use-play-audiobook";
import {
	invalidateReadingProgress,
	invalidateRecommendations,
} from "@/lib/invalidate-progress";
import { posthog } from "@/lib/posthog";
import { webReadListenAudio } from "@/lib/reader-audio";
import { resetThemeColor, setThemeColor } from "@/lib/theme-color";
import { getLocale } from "@/paraglide/runtime";
import { getCoverUrl } from "@/utils/covers";
import { client } from "@/utils/orpc";

let appRouter: { navigate(options: { href: string }): unknown } | undefined;

/** The router the reader's links navigate with; set when it is created. */
export function bindWebReaderRouter(router: typeof appRouter) {
	appRouter = router;
}

/** Binds the web app's client and chrome to the reader. Import once at startup. */
export function bindWebReaderHost() {
	bindReaderHost({
		api: client,
		locale: () => getLocale(),
		coverUrl: getCoverUrl,
		setChromeColor: (color) =>
			color === null ? resetThemeColor() : setThemeColor(color),
		notifyError: (message) => toast.error(message),
		openAppRoute: (href) => void appRouter?.navigate({ href }),
		usePlayAudiobook,
		readListenAudio: webReadListenAudio,
		track: (event, properties) => posthog?.capture(event, properties),
		onProgressSaved: invalidateReadingProgress,
		onReadingSessionEnded: invalidateRecommendations,
	});
}
