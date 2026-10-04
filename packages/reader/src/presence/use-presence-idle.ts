import { useInterval } from "@nanahoshi/ui/hooks/use-interval";
import { useMountEffect } from "@nanahoshi/ui/hooks/use-mount-effect";
import { useWindowEvent } from "@nanahoshi/ui/hooks/use-window-event";
import { useRef } from "react";
import { readerApi } from "../host/reader-host";

// Discord-style "away": flip to idle after this long without interaction, back
// to active on the next input. Checked on a coarse interval to stay cheap.
const IDLE_THRESHOLD_MS = 10 * 60_000;
const CHECK_INTERVAL_MS = 30_000;

function setIdle(idle: boolean) {
	readerApi()
		.presence.setIdle({ idle })
		.catch(() => {});
}

export function usePresenceIdle() {
	const lastActivityRef = useRef(Date.now());
	const isIdleRef = useRef(false);

	// The server-side idle lease can outlive this component across full-page
	// reader navigation. Reconcile on every mount instead of trusting a fresh
	// local ref that has no knowledge of the previous route's state.
	useMountEffect(() => {
		setIdle(false);
	});

	const markActive = () => {
		lastActivityRef.current = Date.now();
		if (isIdleRef.current) {
			isIdleRef.current = false;
			setIdle(false);
		}
	};

	// Cheap, high-frequency signals: the handler only touches a ref unless we
	// were idle, so spamming mousemove is fine.
	useWindowEvent("mousemove", markActive);
	useWindowEvent("mousedown", markActive);
	useWindowEvent("keydown", markActive);
	useWindowEvent("touchstart", markActive);
	useWindowEvent("wheel", markActive);

	useInterval(() => {
		if (isIdleRef.current) return;
		if (Date.now() - lastActivityRef.current >= IDLE_THRESHOLD_MS) {
			isIdleRef.current = true;
			setIdle(true);
		}
	}, CHECK_INTERVAL_MS);
}
