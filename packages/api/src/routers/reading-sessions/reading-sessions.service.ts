import type { z } from "zod";
import { BadRequestError, NotFoundError } from "../../errors";
import type { LibraryScope } from "../_shared/library-scope";
import { bookRepository } from "../books/book.repository";
import { readingProgressRepository } from "../reading-progress/reading-progress.repository";
import {
	type Medium,
	type OverviewFinish,
	type OverviewSegment,
	summarizeOverview,
} from "./reading-overview";
import type {
	CorrectReadingSessionInput,
	ReadingGoalInput,
	ReadingHistoryInput,
	ReadingOverviewInput,
	ReadingRunIdInput,
	ReadingRunInput,
	ReadingSessionIdInput,
	SessionUpload,
} from "./reading-sessions.model";
import { readingSessionsRepository as repository } from "./reading-sessions.repository";
import { dayKey, summarizeReading } from "./reading-statistics";
export interface ReadingAccess {
	userId: string;
	serverId?: string;
	scope: LibraryScope;
}
async function bookId(access: ReadingAccess, uuid: string) {
	if (!access.serverId) throw new NotFoundError("Book not found");
	// Ebooks and audiobooks share runs and sessions; listening segments tell them apart.
	const book = await bookRepository.getByUuid(
		uuid,
		access.serverId,
		access.scope,
	);
	if (!book) throw new NotFoundError("Book not found");
	return Number(book.id);
}
export async function sync(access: ReadingAccess, input: SessionUpload) {
	return repository.sync(
		access.userId,
		await bookId(access, input.bookUuid),
		input,
	);
}
export async function history(
	access: ReadingAccess,
	input: z.infer<typeof ReadingHistoryInput>,
) {
	const id = await bookId(access, input.bookUuid);
	const { runs, rows } = await repository.history(access.userId, id, input);
	const runId = input.runId ?? runs[0]?.id;
	if (input.runId && !runs.some((r) => r.id === input.runId))
		throw new NotFoundError("Reading not found");
	const selected = rows.filter((r) => r.session.runId === runId);
	const sessions = [
		...new Map(selected.map((r) => [r.session.id, r.session])).values(),
	].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
	const segments = selected.flatMap((r) => (r.segment ? [r.segment] : []));
	const { dayStartHour } = await repository.preferences(access.userId);
	const legacy = await readingProgressRepository.getByUserAndBook(
		access.userId,
		id,
	);
	return {
		runs,
		runId: runId ?? null,
		// Newest session first, so the count matches the edition being read now.
		characterCount:
			sessions.find((s) => s.characterCount)?.characterCount ?? null,
		durationSeconds:
			sessions.find((s) => s.durationSeconds)?.durationSeconds ?? null,
		chapters: sessions.find((s) => s.chapters?.length)?.chapters ?? null,
		sessions,
		segments,
		legacySeconds: legacy?.readingTimeSeconds ?? 0,
		dayStartHour,
		...summarizeReading(segments, sessions, input.timeZone, dayStartHour),
	};
}
export async function mutateRun(
	access: ReadingAccess,
	input: z.infer<typeof ReadingRunInput>,
) {
	return repository.mutateRun(
		access.userId,
		await bookId(access, input.bookUuid),
		input.id,
		input.action,
	);
}
export async function setGoal(
	access: ReadingAccess,
	input: z.infer<typeof ReadingGoalInput>,
) {
	return repository.setGoal(
		access.userId,
		await bookId(access, input.bookUuid),
		input.id,
		input.goalDate,
	);
}
export async function discardRun(
	access: ReadingAccess,
	input: z.infer<typeof ReadingRunIdInput>,
) {
	return repository.discardRun(
		access.userId,
		await bookId(access, input.bookUuid),
		input.id,
	);
}
export async function discard(
	access: ReadingAccess,
	input: z.infer<typeof ReadingSessionIdInput>,
) {
	return repository.editSession(
		access.userId,
		await bookId(access, input.bookUuid),
		input.id,
	);
}
export async function correct(
	access: ReadingAccess,
	input: z.infer<typeof CorrectReadingSessionInput>,
) {
	if (Date.parse(input.segment.endedAt) > Date.now() + 5000)
		throw new BadRequestError("Invalid date");
	return repository.editSession(
		access.userId,
		await bookId(access, input.bookUuid),
		input.id,
		input.segment,
	);
}
export async function overview(
	access: ReadingAccess,
	input: z.infer<typeof ReadingOverviewInput>,
) {
	const preferences = await repository.preferences(access.userId);
	if (!access.serverId)
		return {
			goals: preferences.goals,
			dayStartHour: preferences.dayStartHour,
			today: dayKey(Date.now(), input.timeZone, preferences.dayStartHour),
			books: [],
			...summarizeOverview([], [], input.timeZone),
		};
	const data = await repository.overview(
		access.userId,
		access.serverId,
		access.scope,
	);
	const meta = new Map(data.books.map((b) => [Number(b.id), b]));
	// Removed books have no row left; each missing file is still one book in the totals.
	const keys = new Map<string, number>();
	const books: {
		uuid: string | null;
		title: string | null;
		cover: string | null;
		mainColor: string | null;
		mediaType: "ebook" | "audiobook" | null;
	}[] = [];
	const keyOf = (bookId: number | null, orphanHash: string | null) => {
		const id = bookId === null ? null : Number(bookId);
		const key = id !== null ? `b${id}` : `o${orphanHash}`;
		let index = keys.get(key);
		if (index === undefined) {
			const book = id !== null ? meta.get(id) : undefined;
			const shown = book?.accessible ? book : undefined;
			index = books.length;
			books.push({
				uuid: shown?.uuid ?? null,
				title: shown?.title ?? null,
				cover: shown?.cover ?? null,
				mainColor: shown?.main_color ?? null,
				mediaType:
					book?.media_type === "audiobook"
						? "audiobook"
						: book
							? "ebook"
							: null,
			});
			keys.set(key, index);
		}
		return index;
	};
	const listened = new Set<number>();
	const segments: OverviewSegment[] = data.segments.map((s) => {
		const book = keyOf(s.book_id, s.orphan_hash);
		const medium: Medium =
			s.kind === "listening" || s.duration_seconds !== null
				? "listening"
				: "reading";
		if (medium === "listening") listened.add(book);
		return {
			sessionId: s.session_id,
			book,
			medium,
			characterCount: s.character_count,
			startedAt: new Date(s.started_at).toISOString(),
			endedAt: new Date(s.ended_at).toISOString(),
			seconds: Number(s.seconds),
			startPosition: s.start_position,
			endPosition: s.end_position,
			kind: s.kind,
		};
	});
	const iso = (value: string | null) =>
		value ? new Date(value).toISOString() : null;
	const finishes: OverviewFinish[] = [];
	const closed = new Set<number>();
	for (const r of data.runs) {
		if (r.closure_reason !== "finish" || !r.ended_at) continue;
		const book = keyOf(r.book_id, r.orphan_hash);
		closed.add(book);
		finishes.push({
			book,
			medium: (r.media_type ? r.media_type === "audiobook" : listened.has(book))
				? "listening"
				: "reading",
			startedAt: iso(r.started_at),
			finishedAt: new Date(r.ended_at).toISOString(),
		});
	}
	// Progress keeps only the latest finish, so a book with closed runs keeps its runs (rereads included).
	for (const p of data.completed) {
		const book = keyOf(p.book_id, null);
		if (closed.has(book)) continue;
		finishes.push({
			book,
			medium: p.medium,
			startedAt: iso(p.started_at),
			finishedAt: new Date(p.completed_at).toISOString(),
		});
	}
	return {
		goals: preferences.goals,
		dayStartHour: preferences.dayStartHour,
		today: dayKey(Date.now(), input.timeZone, preferences.dayStartHour),
		books,
		...summarizeOverview(
			segments,
			finishes,
			input.timeZone,
			preferences.dayStartHour,
		),
	};
}
