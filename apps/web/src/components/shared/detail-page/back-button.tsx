import { ArrowLeft } from "@phosphor-icons/react";
import { useCanGoBack, useRouter } from "@tanstack/react-router";
import { DETAIL_CORNER_BUTTON } from "@/components/shared/detail-page/corner-button";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

/**
 * The way out of a detail page on a phone, where the layout drops the top bar so
 * the artwork can lead (see MOBILE_CHROMELESS_ROUTE_IDS in the dashboard
 * layout).
 *
 * Falls back to the library when there's no history to pop — a shared link opens
 * this page cold, and `back()` would leave the app.
 */
export function DetailBackButton({ fallbackTo }: { fallbackTo: string }) {
	const router = useRouter();
	const canGoBack = useCanGoBack();

	return (
		<button
			type="button"
			aria-label={m["aria.go_back"]()}
			onClick={() =>
				canGoBack ? router.history.back() : router.navigate({ to: fallbackTo })
			}
			className={cn(DETAIL_CORNER_BUTTON, "start-3")}
		>
			<ArrowLeft aria-hidden="true" className="size-5" weight="bold" />
		</button>
	);
}
