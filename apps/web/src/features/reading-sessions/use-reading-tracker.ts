import type { SessionUpload } from "@nanahoshi-v2/api/routers/reading-sessions/reading-sessions.model";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { client, orpc } from "@/utils/orpc";
import {
	type ClockSnapshot,
	SessionClock,
	type TrackingMode,
} from "./session-clock";
import {
	pendingSessions,
	persistSession,
	sessionOutboxIssues,
	sessionOwnerLock,
	syncSessionOutbox,
} from "./session-outbox";

interface Options {
	userId: string;
	bookUuid: string;
	contentVersion: string;
	enabled: boolean;
	bookCharCount?: number;
	getPosition: () => number | null;
	getLocator?: () => string | null;
}
export function useReadingTracker(options: Options) {
	const latest = useRef(options);
	latest.current = options;
	const queryClient = useQueryClient();
	const preferenceOptions = orpc.readingSessions.preferences.queryOptions();
	const preferences = useQuery({
		...preferenceOptions,
		queryFn: async () => {
			const value = await client.readingSessions.preferences();
			try {
				localStorage.setItem(
					`nanahoshi:reading-preferences:${options.userId}`,
					JSON.stringify(value),
				);
			} catch {
				/* Recording exposes storage failures separately. */
			}
			return value;
		},
	});
	const settings = useRef(preferences.data);
	settings.current = preferences.data;
	const [snapshot, setSnapshot] = useState<ClockSnapshot>(() =>
		new SessionClock(() => {}).snapshot(),
	);
	const [error, setError] = useState(false);
	const [syncError, setSyncError] = useState(false);
	const [issues, setIssues] = useState<ReturnType<typeof sessionOutboxIssues>>(
		[],
	);
	const [otherTab, setOtherTab] = useState(false);
	const [pending, setPending] = useState(false);
	const runtime = useRef<{
		clock: SessionClock;
		start: () => void;
		save: () => void;
		sync: (retry?: boolean) => Promise<void>;
		resume: () => void;
		isOwner: () => boolean;
		finishReading: () => Promise<void>;
	} | null>(null);
	const jumpRef = useRef(false);
	const reportPosition = useCallback((position: number) => {
		const clock = runtime.current?.isOwner() ? runtime.current.clock : null;
		if (!clock || position === clock.position) return;
		clock.move(
			Math.max(0, Math.min(1, position)),
			jumpRef.current,
			latest.current.getLocator?.() ?? null,
		);
		jumpRef.current = false;
	}, []);
	useMountEffect(() => {
		try {
			const cached = JSON.parse(
				localStorage.getItem(
					`nanahoshi:reading-preferences:${options.userId}`,
				) ?? "null",
			);
			if (
				!queryClient.getQueryData(preferenceOptions.queryKey) &&
				cached &&
				["automatic", "manual", "off"].includes(cached.mode) &&
				Number.isInteger(cached.idleMinutes) &&
				cached.idleMinutes >= 2 &&
				cached.idleMinutes <= 30
			)
				queryClient.setQueryData(preferenceOptions.queryKey, cached);
		} catch {
			/* A missing cache leaves server preferences authoritative. */
		}
		let disposed = false;
		let owner = false;
		let syncing: Promise<void> | null = null;
		let session: SessionUpload | null = null;
		let savedState: ClockSnapshot["state"] = "idle";
		let savedSegments = 0;
		let release: (() => void) | undefined;
		let releaseLifetime: (() => void) | undefined;
		let lifetimeOwner = false;
		const ownerId = crypto.randomUUID();
		let installationId: string = crypto.randomUUID();
		try {
			installationId =
				localStorage.getItem("nanahoshi:reading-installation") ??
				installationId;
			localStorage.setItem("nanahoshi:reading-installation", installationId);
		} catch {
			setError(true);
		}
		const clock = new SessionClock((segment) => {
			if (session) session.segments.push(segment);
		});
		const publish = () => {
			if (!disposed) setSnapshot(clock.snapshot());
		};
		const save = () => {
			if (!session) return;
			if (
				savedState === clock.state &&
				savedSegments === session.segments.length
			) {
				publish();
				return;
			}
			session.state =
				clock.state === "active"
					? "active"
					: clock.state === "finished"
						? "finished"
						: "paused";
			session.endedAt =
				clock.state === "finished"
					? (session.endedAt ?? clock.timestamp())
					: null;
			session.revision += 1;
			try {
				persistSession(options.userId, session, ownerId);
				savedState = clock.state;
				savedSegments = session.segments.length;
				if (!disposed) {
					setPending(true);
					setError(false);
				}
			} catch {
				if (!disposed) setError(true);
			}
			publish();
		};
		const sync = (retry = false): Promise<void> => {
			if (syncing) return retry ? syncing.then(() => sync(true)) : syncing;
			syncing = (async () => {
				try {
					const upload = () =>
						syncSessionOutbox({
							userId: options.userId,
							ownerId,
							retry,
							locks: navigator.locks,
							upload: (sent) =>
								client.readingSessions.sync(sent, {
									context: { keepalive: true },
								}),
							acknowledged: (sent, runId) => {
								if (session?.id !== sent.id) return;
								const ids = new Set(sent.segments.map((s) => s.id));
								const removed = session.segments.filter((s) =>
									ids.has(s.id),
								).length;
								session.segments = session.segments.filter(
									(s) => !ids.has(s.id),
								);
								savedSegments = Math.max(0, savedSegments - removed);
								session.runId = runId;
								session.revision = Math.max(session.revision, sent.revision);
							},
						});
					// Web Locks prevents competing tabs from uploading the same queue.
					// Browsers without it still get a fully functional single-tab tracker;
					// the server's revision checks remain the final safety net.
					const sentAny = navigator.locks
						? await navigator.locks.request(
								`nanahoshi-reading-upload:${options.userId}`,
								upload,
							)
						: await upload();
					if (!disposed) {
						const failures = sessionOutboxIssues(options.userId);
						setIssues(failures);
						setSyncError(failures.length > 0);
						setPending(
							pendingSessions(options.userId).length > 0 || failures.length > 0,
						);
					}
					if (sentAny)
						void queryClient.invalidateQueries({
							queryKey: orpc.readingSessions.history.key(),
						});
				} catch {
					if (!disposed) {
						setPending(true);
						setSyncError(true);
					}
				}
			})().finally(() => {
				syncing = null;
			});
			return syncing;
		};
		const start = () => {
			if (
				!owner ||
				document.visibilityState !== "visible" ||
				!latest.current.enabled ||
				!settings.current ||
				settings.current.mode === "off"
			)
				return;
			if (clock.state === "active") return;
			if (session) {
				clock.finish();
				save();
			}
			clock.start(
				latest.current.getPosition(),
				latest.current.getLocator?.() ?? null,
			);
			savedState = "idle";
			savedSegments = 0;
			session = {
				id: crypto.randomUUID(),
				runId: null,
				bookUuid: options.bookUuid,
				startedAt: clock.startedAt,
				endedAt: null,
				state: "active",
				revision: 0,
				mode: settings.current.mode === "manual" ? "manual" : "automatic",
				source: "web",
				device: /Mobi|Android/i.test(navigator.userAgent)
					? "Mobile"
					: "Desktop",
				installationId,
				contentVersion: options.contentVersion,
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				segments: [],
			};
			save();
			void sync();
		};
		const activity = (event: Event) => {
			if (
				!latest.current.enabled ||
				document.visibilityState !== "visible" ||
				!owner
			)
				return;
			const target = event.target;
			if (
				target instanceof Element &&
				target.closest(
					"[data-reading-controls], [role=dialog], button, input, select, textarea",
				)
			)
				return;
			const mode = settings.current?.mode;
			if (!mode || mode === "off") return;
			if ((clock.state === "idle" || clock.stale()) && mode === "automatic")
				start();
			clock.activity(mode);
			publish();
		};
		const abort = new AbortController();
		let acquiring = false;
		const acquire = () => {
			if (
				owner ||
				!lifetimeOwner ||
				acquiring ||
				disposed ||
				document.visibilityState === "hidden"
			)
				return;
			acquiring = true;
			setOtherTab(true);
			if (!navigator.locks) {
				owner = true;
				acquiring = false;
				setOtherTab(false);
				void sync();
				return;
			}
			void navigator.locks
				.request(
					`nanahoshi-reading:${options.userId}`,
					{ signal: abort.signal },
					async () => {
						acquiring = false;
						if (disposed || document.visibilityState === "hidden") return;
						owner = true;
						setOtherTab(false);
						void sync();
						await new Promise<void>((resolve) => {
							release = resolve;
						});
						owner = false;
						release = undefined;
						if (!disposed) {
							setOtherTab(true);
							acquire();
						}
					},
				)
				.catch(() => {
					acquiring = false;
				});
		};
		const hide = () => {
			if (document.visibilityState === "hidden") {
				clock.pause(false);
				save();
				void sync();
				release?.();
				owner = false;
				setOtherTab(true);
			} else acquire();
		};
		const close = () => {
			clock.finish();
			save();
			void sync();
		};
		let lastSave = performance.now();
		const timer = setInterval(() => {
			if (!owner) return;
			if (
				!latest.current.enabled ||
				settings.current?.mode === "off" ||
				document.visibilityState === "hidden"
			)
				clock.pause(false);
			else {
				const pos = latest.current.getPosition();
				if (pos !== null && pos !== clock.position) {
					clock.move(
						pos,
						jumpRef.current,
						latest.current.getLocator?.() ?? null,
					);
					jumpRef.current = false;
				}
				clock.tick(settings.current?.idleMinutes ?? 5);
			}
			publish();
			if (performance.now() - lastSave >= 10_000) {
				lastSave = performance.now();
				save();
				void sync();
			}
		}, 1_000);
		for (const name of [
			"pointerdown",
			"keydown",
			"wheel",
			"touchstart",
		] as const)
			document.addEventListener(name, activity, { passive: true });
		document.addEventListener("visibilitychange", hide);
		window.addEventListener("pagehide", close);
		const online = () => {
			void sync();
		};
		window.addEventListener("online", online);
		if (navigator.locks) {
			void navigator.locks
				.request(sessionOwnerLock(options.userId, ownerId), async () => {
					if (disposed) return;
					lifetimeOwner = true;
					acquire();
					await new Promise<void>((resolve) => {
						releaseLifetime = resolve;
					});
					lifetimeOwner = false;
				})
				.catch(() => {
					if (!disposed) setError(true);
				});
		} else {
			// Keep recording usable in browsers that do not implement Web Locks.
			// There is no cross-tab ownership guarantee in this fallback, but refusing
			// to record made the UI show a permanent, misleading save failure.
			lifetimeOwner = true;
			acquire();
		}
		runtime.current = {
			clock,
			start,
			save,
			sync,
			isOwner: () => owner,
			resume: () => {
				if (
					!owner ||
					document.visibilityState !== "visible" ||
					!latest.current.enabled ||
					!settings.current ||
					settings.current.mode === "off"
				)
					return;
				clock.resume();
				save();
				void sync();
			},
			finishReading: async () => {
				clock.finish();
				save();
				await sync();
				// A save requested during an in-flight upload may leave one final revision.
				await sync();
				if (
					session &&
					pendingSessions(options.userId).some((row) => row.id === session?.id)
				)
					throw new Error(
						"Reading history must finish uploading before completing this reading.",
					);
				const history = await client.readingSessions.history({
					bookUuid: options.bookUuid,
					timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				});
				const id = session?.runId ?? history.runId;
				if (id)
					await client.readingSessions.mutateRun({
						bookUuid: options.bookUuid,
						id,
						action: "finish",
					});
			},
		};
		return () => {
			close();
			disposed = true;
			runtime.current = null;
			clearInterval(timer);
			abort.abort();
			release?.();
			// Keep lifecycle ownership until the last in-flight acknowledgement is applied.
			void (syncing ?? Promise.resolve()).finally(() => releaseLifetime?.());
			for (const name of [
				"pointerdown",
				"keydown",
				"wheel",
				"touchstart",
			] as const)
				document.removeEventListener(name, activity);
			document.removeEventListener("visibilitychange", hide);
			window.removeEventListener("pagehide", close);
			window.removeEventListener("online", online);
		};
	});
	const act = (action: "start" | "pause" | "resume" | "finish") => {
		const r = runtime.current;
		if (!r) return;
		if (action === "start") r.start();
		else if (action === "resume") r.resume();
		else {
			if (action === "pause") r.clock.pause();
			if (action === "finish") r.clock.finish();
			r.save();
			void r.sync();
		}
	};
	const setPreferences = async (mode: TrackingMode, idleMinutes: number) => {
		const data = await client.readingSessions.setPreferences({
			mode,
			idleMinutes,
		});
		queryClient.setQueryData(orpc.readingSessions.preferences.queryKey(), data);
		try {
			localStorage.setItem(
				`nanahoshi:reading-preferences:${options.userId}`,
				JSON.stringify(data),
			);
		} catch {
			setError(true);
		}
		if (mode === "off") act("finish");
	};
	const markJump = useCallback(() => {
		jumpRef.current = true;
	}, []);
	return {
		...snapshot,
		characters:
			options.bookCharCount && options.bookCharCount > 0
				? Math.round(snapshot.observedProgress * options.bookCharCount)
				: null,
		preferences: preferences.data,
		preferencesError: preferences.isError,
		otherTab,
		error: error || syncError,
		issues,
		pending,
		act,
		setPreferences,
		markJump,
		reportPosition,
		completeReading: () => runtime.current?.finishReading(),
		retry: () => {
			runtime.current?.save();
			return runtime.current?.sync(true);
		},
	};
}
export type ReadingTracker = ReturnType<typeof useReadingTracker>;
