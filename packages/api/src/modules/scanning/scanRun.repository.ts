import { db } from "@nanahoshi-v2/db";
import {
	type ScanRunMode,
	type ScanRunPhase,
	scanRun,
} from "@nanahoshi-v2/db/schema/general";
import { and, eq, sql } from "drizzle-orm";

export type ScanRunRecord = typeof scanRun.$inferSelect;

export type ScanRunCounters = Partial<{
	discovered: number;
	statted: number;
	hashed: number;
	persisted: number;
	errors: number;
}>;

export function sanitizeScanFailure(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	let sanitized = "";
	for (const character of message) {
		const code = character.charCodeAt(0);
		sanitized += code < 32 || code === 127 ? " " : character;
		if (sanitized.length >= 500) break;
	}
	return sanitized.trim() || "Scan failed";
}

export class ScanRunRepository {
	constructor(
		private readonly database: Pick<typeof db, "insert" | "update"> = db,
	) {}

	async startOrResume(
		taskId: string,
		libraryPathId: number,
		mode: ScanRunMode,
	): Promise<ScanRunRecord> {
		const [run] = await this.database
			.insert(scanRun)
			.values({ taskId, libraryPathId, mode })
			.onConflictDoUpdate({
				target: [scanRun.taskId, scanRun.libraryPathId],
				set: {
					status: sql`case when ${scanRun.status} in ('completed', 'cancelled') then ${scanRun.status} else 'active' end`,
					failure: sql`case when ${scanRun.status} in ('completed', 'cancelled') then ${scanRun.failure} else null end`,
					completedAt: sql`case when ${scanRun.status} in ('completed', 'cancelled') then ${scanRun.completedAt} else null end`,
					heartbeatAt: sql`now()`,
					updatedAt: sql`now()`,
				},
			})
			.returning();
		if (!run) throw new Error("Unable to start or resume scan run");
		return run;
	}

	async setPhase(id: string, phase: ScanRunPhase): Promise<void> {
		await this.database
			.update(scanRun)
			.set({ phase, heartbeatAt: sql`now()`, updatedAt: sql`now()` })
			.where(and(eq(scanRun.id, id), eq(scanRun.status, "active")));
	}

	async checkpoint(id: string, counters: ScanRunCounters = {}): Promise<void> {
		await this.database
			.update(scanRun)
			.set({
				discoveredCount: sql`${scanRun.discoveredCount} + ${counters.discovered ?? 0}`,
				stattedCount: sql`${scanRun.stattedCount} + ${counters.statted ?? 0}`,
				hashedCount: sql`${scanRun.hashedCount} + ${counters.hashed ?? 0}`,
				persistedCount: sql`${scanRun.persistedCount} + ${counters.persisted ?? 0}`,
				errorCount: sql`${scanRun.errorCount} + ${counters.errors ?? 0}`,
				heartbeatAt: sql`now()`,
				updatedAt: sql`now()`,
			})
			.where(and(eq(scanRun.id, id), eq(scanRun.status, "active")));
	}

	async complete(id: string): Promise<void> {
		await this.finish(id, "completed");
	}

	async fail(id: string, error: unknown): Promise<void> {
		await this.finish(id, "failed", sanitizeScanFailure(error));
	}

	async cancel(id: string): Promise<void> {
		await this.finish(id, "cancelled");
	}

	/** Close every path checkpoint when the producer job dies outside its body. */
	async failActiveForTask(taskId: string, error: unknown): Promise<void> {
		await this.database
			.update(scanRun)
			.set({
				status: "failed",
				failure: sanitizeScanFailure(error),
				completedAt: sql`now()`,
				heartbeatAt: sql`now()`,
				updatedAt: sql`now()`,
			})
			.where(and(eq(scanRun.taskId, taskId), eq(scanRun.status, "active")));
	}

	private async finish(
		id: string,
		status: "completed" | "failed" | "cancelled",
		failure?: string,
	): Promise<void> {
		await this.database
			.update(scanRun)
			.set({
				status,
				failure: failure ?? null,
				completedAt: sql`now()`,
				heartbeatAt: sql`now()`,
				updatedAt: sql`now()`,
			})
			.where(and(eq(scanRun.id, id), eq(scanRun.status, "active")));
	}
}

export const scanRunRepository = new ScanRunRepository();
