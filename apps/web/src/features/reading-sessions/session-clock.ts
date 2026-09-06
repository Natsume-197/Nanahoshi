import type { SessionUpload } from "@nanahoshi-v2/api/routers/reading-sessions/reading-sessions.model";
export type TrackingMode = "automatic" | "manual" | "off";
export interface ClockSnapshot {
	state: "idle" | "active" | "paused" | "finished";
	seconds: number;
	observedProgress: number;
	startPosition: number | null;
	position: number | null;
}
/** A monotonic clock, independent of React, storage and transport. */
export class SessionClock {
	state: ClockSnapshot["state"] = "idle";
	seconds = 0;
	observedProgress = 0;
	startedAt = "";
	position: number | null = null;
	startPosition: number | null = null;
	private lastMono = 0;
	private lastWall = 0;
	private anchorMono = 0;
	private anchorWall = 0;
	private lastActivity = 0;
	private pausedAt = 0;
	private manualPause = false;
	private segmentStart: number | null = null;
	private locator: string | null = null;
	private startLocator: string | null = null;
	private kind: "reading" | "jump" = "reading";
	constructor(
		private emit: (segment: SessionUpload["segments"][number]) => void,
		private now = () => ({ mono: performance.now(), wall: Date.now() }),
		private id = () => crypto.randomUUID(),
	) {}
	start(position: number | null, locator: string | null = null) {
		this.locator = locator;
		this.startLocator = locator;
		const now = this.now();
		this.state = "active";
		this.seconds = 0;
		this.observedProgress = 0;
		this.anchorMono = now.mono;
		this.anchorWall = now.wall;
		this.startedAt = new Date(now.wall).toISOString();
		this.position = position;
		this.startPosition = position;
		this.segmentStart = position;
		this.lastMono = now.mono;
		this.lastWall = now.wall;
		this.lastActivity = now.mono;
		this.manualPause = false;
		this.kind = "reading";
	}
	activity(mode: TrackingMode) {
		const now = this.now();
		if (
			this.state === "paused" &&
			!this.manualPause &&
			now.mono - this.pausedAt < 30 * 60_000 &&
			mode !== "off"
		)
			this.resume();
		this.lastActivity = now.mono;
	}
	stale() {
		return (
			this.state === "paused" &&
			!this.manualPause &&
			this.now().mono - this.pausedAt >= 30 * 60_000
		);
	}
	tick(idleMinutes: number) {
		if (this.state !== "active") return;
		const now = this.now();
		// A suspended browser must never charge the entire sleep on its next tick.
		if (
			now.mono - this.lastMono > 30_000 ||
			now.mono - this.lastActivity >= idleMinutes * 60_000
		) {
			this.pause(false, false);
			return;
		}
		this.flush();
	}
	move(position: number, jump = false, locator: string | null = null) {
		const previous = this.position;
		const navigation =
			jump ||
			(previous !== null &&
				(position < previous || Math.abs(position - previous) > 0.025));
		if (this.state !== "active") {
			this.position = position;
			this.locator = locator;
			return;
		}
		if (!navigation && previous !== null)
			this.observedProgress += Math.max(0, position - previous);
		if (navigation) {
			this.flush();
			this.kind = "jump";
		}
		this.position = position;
		this.locator = locator;
	}
	flush() {
		if (this.state !== "active") return;
		const now = this.now();
		const delta = (now.mono - this.lastMono) / 1000;
		const elapsed = delta >= 0 && delta <= 30 ? delta : 0;
		// Position sampling and the periodic tick can share a timestamp. Keep
		// that instantaneous navigation event even though it adds no reading time.
		if (
			elapsed >= 0.01 ||
			(this.kind === "jump" && this.segmentStart !== this.position)
		) {
			this.seconds += elapsed;
			this.emit({
				id: this.id(),
				startedAt: new Date(this.lastWall).toISOString(),
				endedAt: this.timestamp(),
				seconds: elapsed,
				startPosition: this.segmentStart,
				endPosition: this.position,
				kind: this.kind,
				startLocator: this.startLocator,
				endLocator: this.locator,
			});
		}
		this.lastMono = now.mono;
		this.lastWall = this.anchorWall + now.mono - this.anchorMono;
		this.segmentStart = this.position;
		this.startLocator = this.locator;
		this.kind = "reading";
	}
	pause(manual = true, flush = true) {
		if (flush) this.flush();
		if (this.state !== "active") return;
		this.state = "paused";
		this.manualPause = manual;
		this.pausedAt = this.now().mono;
	}
	resume() {
		if (this.state !== "paused") return;
		const now = this.now();
		this.state = "active";
		this.lastMono = now.mono;
		this.lastWall = this.anchorWall + now.mono - this.anchorMono;
		this.lastActivity = now.mono;
		this.segmentStart = this.position;
		this.startLocator = this.locator;
		this.manualPause = false;
	}
	finish() {
		this.flush();
		this.state = "finished";
	}
	// Wall-clock adjustments must not change the duration or reorder segments.
	timestamp() {
		return new Date(
			this.anchorWall + this.now().mono - this.anchorMono,
		).toISOString();
	}
	snapshot(): ClockSnapshot {
		return {
			state: this.state,
			seconds: this.seconds,
			observedProgress: this.observedProgress,
			startPosition: this.startPosition,
			position: this.position,
		};
	}
}
