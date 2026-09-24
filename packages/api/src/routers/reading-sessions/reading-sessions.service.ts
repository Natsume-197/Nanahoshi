import type { z } from "zod";
import { BadRequestError, NotFoundError } from "../../errors";
import type { LibraryScope } from "../_shared/library-scope";
import { bookRepository } from "../books/book.repository";
import { readingProgressRepository } from "../reading-progress/reading-progress.repository";
import type {
	CorrectReadingSessionInput,
	ReadingGoalInput,
	ReadingHistoryInput,
	ReadingRunIdInput,
	ReadingRunInput,
	ReadingSessionIdInput,
	SessionUpload,
} from "./reading-sessions.model";
import { readingSessionsRepository as repository } from "./reading-sessions.repository";
import { summarizeReading } from "./reading-statistics";
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
