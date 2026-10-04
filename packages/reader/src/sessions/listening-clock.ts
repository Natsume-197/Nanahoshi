import type { SessionUpload } from "@nanahoshi/api/routers/reading-sessions/reading-sessions.model";

type Segment = SessionUpload["segments"][number];
export interface Playback {
	// Seconds into the whole audiobook, across files.
	time: number;
	duration: number;
	rate: number;
}

// A paused player picked up again within this window continues the same session.
export const RESUME_WINDOW_MS = 30 * 60_000;
const FLUSH_EVERY_S = 30;
// Beyond the expected advance, this many audio seconds mean the playhead was moved.
const SEEK_TOLERANCE_S = 3;

/**
 * Turns playback samples into listening and jump segments. Time counts only
 * audio that actually played (÷ rate), so stalls add nothing and a frozen
 * tab still credits what kept playing in the background.
 */
export class ListeningClock {
	state: "idle" | "active" | "paused" | "finished" = "idle";
	startedAt = "";
	seconds = 0;
	private duration = 0;
	private anchorMono = 0;
	private anchorWall = 0;
	private lastMono = 0;
	private lastTime = 0;
	private pausedAt = 0;
	private segmentMono = 0;
	private segmentTime = 0;
	private segmentSeconds = 0;
	constructor(
		private emit: (segment: Segment) => void,
		private now = () => ({ mono: performance.now(), wall: Date.now() }),
		private id = () => crypto.randomUUID(),
	) {}
	start(playback: Playback) {
		const now = this.now();
		this.state = "active";
		this.seconds = 0;
		this.anchorMono = now.mono;
		this.anchorWall = now.wall;
		this.startedAt = new Date(now.wall).toISOString();
		this.duration = playback.duration;
		this.begin(now.mono, playback.time);
	}
	/** Whether a paused session is too old to continue. */
	stale() {
		return (
			this.state === "paused" &&
			this.now().mono - this.pausedAt >= RESUME_WINDOW_MS
		);
	}
	resume(playback: Playback) {
		if (this.state !== "paused") return;
		this.state = "active";
		const now = this.now().mono;
		if (playback.time !== this.lastTime) this.jump(now, playback.time);
		this.begin(now, playback.time);
	}
	sample(playback: Playback) {
		if (this.state !== "active") return;
		const now = this.now().mono;
		if (playback.duration > 0) this.duration = playback.duration;
		const wall = Math.max(0, (now - this.lastMono) / 1000);
		const advance = playback.time - this.lastTime;
		const expected = wall * Math.max(playback.rate, 0.1);
		if (advance < -0.5 || advance > expected + SEEK_TOLERANCE_S) {
			this.close(now);
			this.jump(now, playback.time);
			this.begin(now, playback.time);
			return;
		}
		const listened = Math.min(
			wall,
			Math.max(0, advance) / Math.max(playback.rate, 0.1),
		);
		this.seconds += listened;
		this.segmentSeconds += listened;
		this.lastMono = now;
		this.lastTime = playback.time;
		if ((now - this.segmentMono) / 1000 >= FLUSH_EVERY_S) {
			this.close(now);
			this.begin(now, playback.time);
		}
	}
	pause(playback: Playback) {
		if (this.state !== "active") return;
		this.sample(playback);
		this.close(this.now().mono);
		this.state = "paused";
		this.pausedAt = this.now().mono;
	}
	finish(playback?: Playback) {
		if (playback) this.pause(playback);
		else if (this.state === "active") this.close(this.now().mono);
		if (this.state !== "idle") this.state = "finished";
	}
	timestamp(mono = this.now().mono) {
		return new Date(this.anchorWall + mono - this.anchorMono).toISOString();
	}
	private begin(mono: number, time: number) {
		this.lastMono = mono;
		this.lastTime = time;
		this.segmentMono = mono;
		this.segmentTime = time;
		this.segmentSeconds = 0;
	}
	private position(time: number) {
		return this.duration > 0
			? Math.max(0, Math.min(1, time / this.duration))
			: null;
	}
	private close(mono: number) {
		if (this.segmentSeconds >= 0.01)
			this.emit({
				id: this.id(),
				startedAt: this.timestamp(this.segmentMono),
				endedAt: this.timestamp(this.lastMono),
				seconds: Math.min(
					this.segmentSeconds,
					(this.lastMono - this.segmentMono) / 1000,
				),
				startPosition: this.position(this.segmentTime),
				endPosition: this.position(this.lastTime),
				kind: "listening",
			});
		this.begin(mono, this.lastTime);
	}
	private jump(mono: number, to: number) {
		const from = this.position(this.lastTime);
		const target = this.position(to);
		if (from === null || target === null || from === target) return;
		const at = this.timestamp(mono);
		this.emit({
			id: this.id(),
			startedAt: at,
			endedAt: at,
			seconds: 0,
			startPosition: from,
			endPosition: target,
			kind: "jump",
		});
	}
}
