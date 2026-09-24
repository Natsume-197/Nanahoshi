import type { SessionUpload } from "@nanahoshi/api/routers/reading-sessions/reading-sessions.model";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { client, orpc } from "@/utils/orpc";
import { ListeningClock, type Playback } from "./listening-clock";
import {
	persistSession,
	sessionOwnerLock,
	syncSessionOutbox,
} from "./session-outbox";

interface Options {
	userId: string | undefined;
	bookUuid: string;
	// The player is producing sound right now.
	active: boolean;
	getPlaybackState: () => {
		currentTime: number;
		duration: number;
		playbackRate: number;
	};
}

const SAVE_EVERY_MS = 10_000;

/** Records playback of the loaded audiobook as reading sessions with listening segments. */
export function useListeningTracker(options: Options) {
	const latest = useRef(options);
	latest.current = options;
	const queryClient = useQueryClient();
	const preferences = useQuery({
		...orpc.readingSessions.preferences.queryOptions(),
		enabled: Boolean(options.userId),
	});
	const mode = useRef(preferences.data?.mode);
	mode.current = preferences.data?.mode;
	useMountEffect(() => {
		const ownerId = crypto.randomUUID();
		let installationId: string = crypto.randomUUID();
		try {
			installationId =
				localStorage.getItem("nanahoshi:reading-installation") ??
				installationId;
			localStorage.setItem("nanahoshi:reading-installation", installationId);
		} catch {
			/* A per-page id still keeps the session consistent. */
		}
		let session: SessionUpload | null = null;
		let owner: string | undefined;
		let syncing: Promise<void> | null = null;
		let lastSave = 0;
		let saved = { state: "", segments: 0 };
		let releaseLifetime: (() => void) | undefined;
		const clock = new ListeningClock((segment) => {
			session?.segments.push(segment);
		});
		const playback = (): Playback | null => {
			const { currentTime, duration, playbackRate } =
				latest.current.getPlaybackState();
			return Number.isFinite(duration) && duration > 0
				? { time: currentTime, duration, rate: playbackRate }
				: null;
		};
		const holdLifetime = (userId: string) => {
			// Other tabs finish a queued session only once its owner's lock is free.
			void navigator.locks
				?.request(sessionOwnerLock(userId, ownerId), async () => {
					await new Promise<void>((resolve) => {
						releaseLifetime = resolve;
					});
				})
				.catch(() => {});
		};
		const save = (force = false) => {
			if (!session || !owner) return;
			const state =
				clock.state === "active"
					? "active"
					: clock.state === "finished"
						? "finished"
						: "paused";
			if (
				!force &&
				saved.state === state &&
				saved.segments === session.segments.length
			)
				return;
			session.state = state;
			session.endedAt =
				state === "finished" ? (session.endedAt ?? clock.timestamp()) : null;
			session.revision += 1;
			try {
				persistSession(owner, session, ownerId);
				saved = { state, segments: session.segments.length };
			} catch {
				/* Storage failures leave the in-memory session for the next save. */
			}
		};
		const sync = (): Promise<void> => {
			const userId = owner;
			if (!userId) return Promise.resolve();
			if (syncing) return syncing;
			const upload = () =>
				syncSessionOutbox({
					userId,
					ownerId,
					upload: (sent) =>
						client.readingSessions.sync(sent, {
							context: { keepalive: true },
						}),
					acknowledged: (sent, runId) => {
						if (session?.id !== sent.id) return;
						const ids = new Set(sent.segments.map((s) => s.id));
						const before = session.segments.length;
						session.segments = session.segments.filter((s) => !ids.has(s.id));
						saved.segments = Math.max(
							0,
							saved.segments - (before - session.segments.length),
						);
						session.runId = runId;
						session.revision = Math.max(session.revision, sent.revision);
					},
				});
			syncing = (async () => {
				try {
					const sentAny = navigator.locks
						? await navigator.locks.request(
								`nanahoshi-reading-upload:${userId}`,
								upload,
							)
						: await upload();
					if (sentAny)
						void queryClient.invalidateQueries({
							queryKey: orpc.readingSessions.history.key(),
						});
				} catch {
					/* The outbox keeps the session; the next tick retries. */
				}
			})().finally(() => {
				syncing = null;
			});
			return syncing;
		};
		const finish = (at: Playback | null) => {
			if (!session) return;
			clock.finish(at ?? undefined);
			save();
			session = null;
		};
		const start = (at: Playback) => {
			const { bookUuid } = latest.current;
			clock.start(at);
			saved = { state: "", segments: 0 };
			session = {
				id: crypto.randomUUID(),
				runId: null,
				bookUuid,
				startedAt: clock.startedAt,
				endedAt: null,
				state: "active",
				revision: 0,
				mode: "automatic",
				source: "web",
				device: /Mobi|Android/i.test(navigator.userAgent)
					? "Mobile"
					: "Desktop",
				installationId,
				contentVersion: `audio:${Math.round(at.duration)}`,
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				durationSeconds: at.duration,
				segments: [],
			};
			save();
		};
		const tick = () => {
			const { userId, bookUuid, active } = latest.current;
			if (userId && owner !== userId) {
				owner = userId;
				holdLifetime(userId);
			}
			// The provider outlives books: a new one closes the old session where it stopped.
			if (session && session.bookUuid !== bookUuid) finish(null);
			const at = playback();
			const recording =
				active &&
				Boolean(owner) &&
				Boolean(mode.current) &&
				mode.current !== "off";
			if (recording && at) {
				if (!session) start(at);
				else if (clock.stale()) {
					finish(null);
					start(at);
				} else if (clock.state === "paused") clock.resume(at);
				else clock.sample(at);
			} else if (session && clock.state === "active") {
				if (at) clock.pause(at);
				else clock.finish();
			}
			if (session && clock.state !== "active") save();
			if (performance.now() - lastSave >= SAVE_EVERY_MS) {
				lastSave = performance.now();
				save();
				void sync();
			}
		};
		const timer = setInterval(tick, 1_000);
		const close = () => {
			finish(playback());
			void sync();
		};
		const online = () => {
			void sync();
		};
		window.addEventListener("pagehide", close);
		window.addEventListener("online", online);
		return () => {
			clearInterval(timer);
			close();
			window.removeEventListener("pagehide", close);
			window.removeEventListener("online", online);
			void (syncing ?? Promise.resolve()).finally(() => releaseLifetime?.());
		};
	});
}
