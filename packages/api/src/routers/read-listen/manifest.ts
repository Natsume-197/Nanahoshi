import { z } from "zod";

export const HONOMIYA_MANIFEST_SCHEMA = "honomiya.read-listen.v1" as const;

const LEGACY_MANIFEST_SCHEMA = "akasashi.read-listen.v1";
const LEGACY_GENERATOR_NAME = "akasashi";

const sha256Schema = z
	.string()
	.regex(/^[a-f0-9]{64}$/u, "Expected a lowercase SHA-256 digest");

const sourceFileSchema = z
	.object({
		sha256: sha256Schema,
		filename: z.string().min(1).optional(),
	})
	.strict();

const audioSourceSchema = sourceFileSchema
	.extend({
		index: z.number().int().nonnegative(),
		durationMs: z.number().int().positive().optional(),
	})
	.strict();

const fragmentAnchorSchema = z
	.object({
		kind: z.literal("fragment"),
		sectionRef: z.string().min(1),
		fragmentId: z.string().min(1),
	})
	.strict();

const textQuoteAnchorSchema = z
	.object({
		kind: z.literal("text-quote"),
		sectionRef: z.string().min(1),
		exact: z.string().min(1),
		prefix: z.string().min(1).optional(),
		suffix: z.string().min(1).optional(),
	})
	.strict();

const readListenCueSchema = z
	.object({
		id: z.string().min(1),
		text: z.discriminatedUnion("kind", [
			fragmentAnchorSchema,
			textQuoteAnchorSchema,
		]),
		audioFileIndex: z.number().int().nonnegative(),
		startMs: z.number().int().nonnegative(),
		endMs: z.number().int().positive(),
	})
	.strict()
	.refine((cue) => cue.endMs > cue.startMs, {
		message: "endMs must be greater than startMs",
		path: ["endMs"],
	});

const currentHonomiyaManifestV1Schema = z
	.object({
		schema: z.literal(HONOMIYA_MANIFEST_SCHEMA),
		createdAt: z.iso.datetime({ offset: true }),
		generator: z
			.object({
				name: z.literal("honomiya"),
				version: z.string().min(1),
			})
			.strict(),
		transcription: z
			.object({
				origin: z.enum(["external", "honomiya"]),
			})
			.strict()
			.optional(),
		granularity: z.literal("sentence"),
		sources: z
			.object({
				ebook: sourceFileSchema,
				audioFiles: z.array(audioSourceSchema).min(1),
			})
			.strict(),
		cues: z.array(readListenCueSchema),
	})
	.strict()
	.superRefine((manifest, context) => {
		const audioByIndex = new Map<
			number,
			(typeof manifest.sources.audioFiles)[number]
		>();
		for (const [position, audio] of manifest.sources.audioFiles.entries()) {
			if (audioByIndex.has(audio.index)) {
				context.addIssue({
					code: "custom",
					message: `Duplicate audio file index ${audio.index}`,
					path: ["sources", "audioFiles", position, "index"],
				});
			}
			audioByIndex.set(audio.index, audio);
		}

		const cueIds = new Set<string>();
		let previous: (typeof manifest.cues)[number] | undefined;
		for (const [position, cue] of manifest.cues.entries()) {
			if (cueIds.has(cue.id)) {
				context.addIssue({
					code: "custom",
					message: `Duplicate cue id ${cue.id}`,
					path: ["cues", position, "id"],
				});
			}
			cueIds.add(cue.id);

			const audio = audioByIndex.get(cue.audioFileIndex);
			if (!audio) {
				context.addIssue({
					code: "custom",
					message: `Unknown audio file index ${cue.audioFileIndex}`,
					path: ["cues", position, "audioFileIndex"],
				});
			} else if (
				audio.durationMs !== undefined &&
				cue.endMs > audio.durationMs
			) {
				context.addIssue({
					code: "custom",
					message: `Cue ends after audio file ${cue.audioFileIndex}`,
					path: ["cues", position, "endMs"],
				});
			}

			if (previous) {
				const outOfOrder =
					cue.audioFileIndex < previous.audioFileIndex ||
					(cue.audioFileIndex === previous.audioFileIndex &&
						cue.startMs < previous.startMs);
				if (outOfOrder) {
					context.addIssue({
						code: "custom",
						message: "Cues must be ordered by audioFileIndex and startMs",
						path: ["cues", position],
					});
				}

				if (
					cue.audioFileIndex === previous.audioFileIndex &&
					cue.startMs < previous.endMs
				) {
					context.addIssue({
						code: "custom",
						message: "Cues in the same audio file must not overlap",
						path: ["cues", position, "startMs"],
					});
				}
			}

			previous = cue;
		}
	});

/**
 * Artifacts are immutable and addressed by their byte hash, so manifests made
 * before the Honomiya rename must be adapted while reading rather than edited
 * in place. Only the known legacy identity pair is accepted; validation of the
 * remaining manifest stays identical to the current contract.
 */
function normalizeLegacyManifestIdentity(input: unknown): unknown {
	if (!input || typeof input !== "object" || Array.isArray(input)) return input;
	const manifest = input as Record<string, unknown>;
	const generator = manifest.generator;
	if (
		manifest.schema !== LEGACY_MANIFEST_SCHEMA ||
		!generator ||
		typeof generator !== "object" ||
		Array.isArray(generator) ||
		(generator as Record<string, unknown>).name !== LEGACY_GENERATOR_NAME
	) {
		return input;
	}

	return {
		...manifest,
		schema: HONOMIYA_MANIFEST_SCHEMA,
		generator: {
			...(generator as Record<string, unknown>),
			name: "honomiya",
		},
	};
}

export const honomiyaManifestV1Schema = z.preprocess(
	normalizeLegacyManifestIdentity,
	currentHonomiyaManifestV1Schema,
);

export type HonomiyaManifestV1 = z.infer<typeof honomiyaManifestV1Schema>;
export type ReadListenCue = z.infer<typeof readListenCueSchema>;
