import {
	canAccessBookAction,
	resolveLibraryAccess,
} from "@nanahoshi-v2/api/auth/access.repository";
import { BadRequestError, isAppError } from "@nanahoshi-v2/api/errors/index";
import { logger } from "@nanahoshi-v2/api/lib/logger";
import { readListenService } from "@nanahoshi-v2/api/routers/read-listen/read-listen.service";
import {
	MAX_ALIGNMENT_UPLOAD_BYTES,
	MAX_TIMED_TEXT_UPLOAD_BYTES,
	MAX_TIMED_TEXT_UPLOAD_TOTAL_BYTES,
	validateAlignmentReportUpload,
	validateAlignmentUpload,
} from "@nanahoshi-v2/api/routers/read-listen/uploaded-alignment-input";
import { auth } from "@nanahoshi-v2/auth";
import type { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const log = logger.child({ component: "read-listen-input-routes" });
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
const MAX_REQUEST_BYTES =
	MAX_ALIGNMENT_UPLOAD_BYTES * 2 + MULTIPART_OVERHEAD_BYTES;

function uploadedFiles(formData: FormData, field: string): File[] {
	return formData
		.getAll(field)
		.filter((entry): entry is File => typeof entry !== "string");
}

async function bytes(file: File): Promise<Uint8Array> {
	return new Uint8Array(await file.arrayBuffer());
}

export function mountReadListenInputs(app: Hono) {
	app.post("/api/read-listen/:pairUuid/alignment-input", async (c) => {
		try {
			const session = await auth.api.getSession({ headers: c.req.raw.headers });
			if (!session?.user) return c.json({ message: "Unauthorized" }, 401);
			const access = await resolveLibraryAccess(session);
			if (!access) return c.json({ message: "No active organization" }, 400);

			const pairUuid = c.req.param("pairUuid");
			const pair = await readListenService.getPairForManagement(
				pairUuid,
				access.serverId,
				access.accessibleLibraryIds,
			);
			const canEdit = await Promise.all(
				[pair.ebook.uuid, pair.audiobook.uuid].map((uuid) =>
					canAccessBookAction(session, uuid, "book", "editMetadata"),
				),
			);
			if (canEdit.some((allowed) => !allowed)) {
				return c.json({ message: "Forbidden" }, 403);
			}

			const declaredSize = Number(c.req.header("content-length"));
			if (Number.isFinite(declaredSize) && declaredSize > MAX_REQUEST_BYTES) {
				return c.json({ message: "Alignment input upload is too large" }, 413);
			}
			let formData: FormData;
			try {
				formData = await c.req.formData();
			} catch {
				throw new BadRequestError("Invalid multipart upload request");
			}
			const kind = formData.get("kind");

			if (kind === "alignment") {
				const [alignment, ...extraAlignments] = uploadedFiles(
					formData,
					"alignment",
				);
				const [report, ...extraReports] = uploadedFiles(formData, "report");
				if (
					!alignment ||
					extraAlignments.length > 0 ||
					extraReports.length > 0
				) {
					return c.json(
						{ message: "Choose one Honomiya alignment and at most one report" },
						400,
					);
				}
				if (
					alignment.size > MAX_ALIGNMENT_UPLOAD_BYTES ||
					(report?.size ?? 0) > MAX_ALIGNMENT_UPLOAD_BYTES
				) {
					return c.json({ message: "Honomiya file exceeds 64 MB" }, 413);
				}
				const alignmentInput = {
					filename: alignment.name,
					bytes: await bytes(alignment),
				};
				validateAlignmentUpload(alignmentInput);
				const reportInput = report
					? { filename: report.name, bytes: await bytes(report) }
					: undefined;
				if (reportInput) validateAlignmentReportUpload(reportInput);
				return c.json(
					await readListenService.importUploadedAlignment(
						pairUuid,
						access.serverId,
						access.accessibleLibraryIds,
						alignmentInput.bytes,
						reportInput?.bytes,
					),
				);
			}

			if (kind === "timed-text") {
				const files = uploadedFiles(formData, "srt");
				const verifyTimedText = formData.get("verifyTimedText") === "true";
				if (
					files.some((file) => file.size > MAX_TIMED_TEXT_UPLOAD_BYTES) ||
					files.reduce((total, file) => total + file.size, 0) >
						MAX_TIMED_TEXT_UPLOAD_TOTAL_BYTES
				) {
					return c.json(
						{ message: "Selected SRT files exceed the upload limit" },
						413,
					);
				}
				return c.json(
					await readListenService.generateAlignment(
						pairUuid,
						session.user.id,
						access.serverId,
						access.accessibleLibraryIds,
						{
							mode: "timed-text",
							verifyTimedText,
							timedTextUploads: await Promise.all(
								files.map(async (file) => ({
									filename: file.name,
									bytes: await bytes(file),
								})),
							),
						},
					),
				);
			}

			return c.json({ message: "Choose an alignment input type" }, 400);
		} catch (error) {
			if (isAppError(error)) {
				return c.json(
					{ message: error.message, code: error.code },
					error.status as ContentfulStatusCode,
				);
			}
			log.error({ err: error }, "Read & Listen input upload failed");
			return c.json({ message: "Unable to process the alignment input" }, 500);
		}
	});
}
