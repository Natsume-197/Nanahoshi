import type { SessionUpload } from "@nanahoshi/api/routers/reading-sessions/reading-sessions.model";
import { ReadCoverage } from "@nanahoshi/api/routers/reading-sessions/reading-statistics";
export type TrackingMode = "automatic" | "manual" | "off";
export interface ClockSnapshot {
	state: "idle" | "active" | "paused" | "finished";
	pauseReason: "manual" | "idle" | "hidden" | null;
	seconds: number;
	observedProgress: number;
	startPosition: number | null;
	position: number | null;
}
// Far above any real reading speed: time on the page earns this many characters
// a second, and a turn costing more than was earned is skimming.
const MAX_CHARS_PER_SECOND = 50;
// The most a long pause can bank, unless one step is bigger (a whole spread);
// a burst of fast turns gets at most this much through.
const MAX_BANKED_CHARS = 600;
/** A monotonic clock, independent of React, storage and transport. */
export class SessionClock {
	state: ClockSnapshot["state"] = "idle";
	seconds = 0;
	observedProgress = 0;
	startedAt = "";
	position: number | null = null;
	startPosition: number | null = null;
	// Without it (PDF) pages cannot be priced in characters, so none are rejected as skimmed.
	characterCount: number | null = null;
	private lastMono = 0;
	private lastWall = 0;
	private anchorMono = 0;
	private anchorWall = 0;
	private lastActivity = 0;
	private pausedAt = 0;
	private manualPause = false;
	private pauseReason: ClockSnapshot["pauseReason"] = null;
	private segmentStart: number | null = null;
	private locator: string | null = null;
	private startLocator: string | null = null;
	private kind: "reading" | "jump" = "reading";
	// Characters earned by time spent reading; earning restarts unknown (null) after a start or resume.
	private banked = 0;
	private bankedAt: number | null = null;
	// Pages already read in this run, so paging back and forth counts like the server does.
	private coverage = new ReadCoverage();
	private coveredRun: string | null = null;
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
		this.pauseReason = null;
		this.kind = "reading";
		this.bankedAt = null;
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
		if (this.state === "finished") return;
		const previous = this.position;
		if (this.state !== "active") {
			this.position = position;
			this.locator = locator;
			return;
		}
		const now = this.now().mono;
		const navigation =
			jump ||
			(previous !== null &&
				(position < previous ||
					Math.abs(position - previous) > 0.025 ||
					this.skimmed(previous, position, now)));
		if (!navigation && previous !== null)
			this.observedProgress += this.coverage.add(previous, position);
		if (navigation) {
			this.flush();
			this.kind = "jump";
		}
		this.position = position;
		this.locator = locator;
		// Close the jump now, or reading right after it would be filed as navigation.
		if (navigation) this.flush();
	}
	/** Spends what time on the page earned; only called for small forward steps. */
	private skimmed(from: number, to: number, now: number) {
		if (!this.characterCount) return false;
		const characters = (to - from) * this.characterCount;
		// The first step after starting is trusted: how long the page showed before is unknown.
		if (this.bankedAt === null) {
			this.bankedAt = now;
			this.banked = 0;
			return false;
		}
		this.banked = Math.min(
			this.banked + ((now - this.bankedAt) / 1000) * MAX_CHARS_PER_SECOND,
			Math.max(MAX_BANKED_CHARS, characters),
		);
		this.bankedAt = now;
		if (characters > this.banked) return true;
		this.banked -= characters;
		return false;
	}
	/** Adds what the run's history already read; a different run starts over. */
	cover(runId: string | null, ranges: [number, number][]) {
		if (runId && this.coveredRun && runId !== this.coveredRun)
			this.resetCoverage();
		this.coveredRun = runId ?? this.coveredRun;
		for (const [start, end] of ranges) this.coverage.add(start, end);
	}
	resetCoverage() {
		this.coverage = new ReadCoverage();
		this.coveredRun = null;
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
	pause(
		manual = true,
		flush = true,
		reason: ClockSnapshot["pauseReason"] = manual ? "manual" : "idle",
	) {
		if (flush) this.flush();
		if (this.state !== "active") return;
		this.state = "paused";
		this.manualPause = manual;
		this.pauseReason = reason;
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
		this.pauseReason = null;
		this.bankedAt = null;
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
			pauseReason: this.state === "paused" ? this.pauseReason : null,
			seconds: this.seconds,
			observedProgress: this.observedProgress,
			startPosition: this.startPosition,
			position: this.position,
		};
	}
}
