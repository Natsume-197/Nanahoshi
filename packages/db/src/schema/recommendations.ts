import { sql } from "drizzle-orm";
import {
	bigint,
	check,
	doublePrecision,
	foreignKey,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	real,
	smallint,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

// Recommendation unit: a "work" is either a shared series row (cross-format)
// or a standalone canonical book. Polymorphic (kind, item_id) — no FK possible;
// integrity comes from transactional per-server replace + inner joins at read.
export const workKindEnum = pgEnum("work_kind", ["series", "book"]);

export const recommendationReasonEnum = pgEnum("recommendation_reason", [
	"because_you_liked",
	"same_author",
	"shared_genres",
	"similar_content",
	"same_publisher",
	"readers_also_liked",
	"popular",
]);

export const workEmbedding = pgTable(
	"work_embedding",
	{
		serverId: text("server_id").notNull(),
		kind: workKindEnum("kind").notNull(),
		itemId: bigint("item_id", { mode: "number" }).notNull(),
		vector: real("vector").array().notNull(),
		// hash of the embedded text — unchanged works are skipped on rebuild
		inputHash: text("input_hash").notNull(),
		model: text("model").notNull(),
		computedAt: timestamp("computed_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.serverId, table.kind, table.itemId] }),
		foreignKey({
			columns: [table.serverId],
			foreignColumns: [organization.id],
			name: "work_embedding_server_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		check(
			"work_embedding_dim_check",
			sql`array_length(${table.vector}, 1) = 384`,
		),
	],
);

export const itemSimilarity = pgTable(
	"item_similarity",
	{
		serverId: text("server_id").notNull(),
		seedKind: workKindEnum("seed_kind").notNull(),
		seedId: bigint("seed_id", { mode: "number" }).notNull(),
		candKind: workKindEnum("cand_kind").notNull(),
		candId: bigint("cand_id", { mode: "number" }).notNull(),
		score: doublePrecision("score").notNull(),
		// named weighted components ({author, genre, tag, embedding, cooc, publisher})
		components: jsonb("components").$type<Record<string, number>>().notNull(),
		reason: recommendationReasonEnum("reason").notNull(),
		computedAt: timestamp("computed_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({
			columns: [
				table.serverId,
				table.seedKind,
				table.seedId,
				table.candKind,
				table.candId,
			],
		}),
		foreignKey({
			columns: [table.serverId],
			foreignColumns: [organization.id],
			name: "item_similarity_server_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		index("item_similarity_seed_idx").on(
			table.serverId,
			table.seedKind,
			table.seedId,
			table.score.desc(),
		),
		check(
			"item_similarity_score_check",
			sql`${table.score} >= 0 AND ${table.score} <= 1`,
		),
	],
);

export const workPopularity = pgTable(
	"work_popularity",
	{
		serverId: text("server_id").notNull(),
		kind: workKindEnum("kind").notNull(),
		itemId: bigint("item_id", { mode: "number" }).notNull(),
		likeCount: integer("like_count").notNull().default(0),
		completionCount: integer("completion_count").notNull().default(0),
		engagedUserCount: integer("engaged_user_count").notNull().default(0),
		amazonRating: doublePrecision("amazon_rating"),
		amazonReviewCount: integer("amazon_review_count"),
		score: doublePrecision("score").notNull(),
		computedAt: timestamp("computed_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.serverId, table.kind, table.itemId] }),
		foreignKey({
			columns: [table.serverId],
			foreignColumns: [organization.id],
			name: "work_popularity_server_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		index("work_popularity_score_idx").on(table.serverId, table.score.desc()),
		check(
			"work_popularity_score_check",
			sql`${table.score} >= 0 AND ${table.score} <= 1`,
		),
	],
);

// One row per taste cluster ("Daily Mix"); anchor names the row in the UI
// ("Porque te gustó {anchor}"). Null anchor = popularity/cold-start mix.
export const userMix = pgTable(
	"user_mix",
	{
		serverId: text("server_id").notNull(),
		userId: text("user_id").notNull(),
		mixIndex: smallint("mix_index").notNull(),
		anchorKind: workKindEnum("anchor_kind"),
		anchorId: bigint("anchor_id", { mode: "number" }),
		computedAt: timestamp("computed_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.serverId, table.userId, table.mixIndex] }),
		foreignKey({
			columns: [table.serverId],
			foreignColumns: [organization.id],
			name: "user_mix_server_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "user_mix_user_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
	],
);

export const userRecommendation = pgTable(
	"user_recommendation",
	{
		serverId: text("server_id").notNull(),
		userId: text("user_id").notNull(),
		kind: workKindEnum("kind").notNull(),
		itemId: bigint("item_id", { mode: "number" }).notNull(),
		mixIndex: smallint("mix_index").notNull(),
		score: doublePrecision("score").notNull(),
		rank: integer("rank").notNull(),
		reason: recommendationReasonEnum("reason").notNull(),
		reasonKind: workKindEnum("reason_kind"),
		reasonId: bigint("reason_id", { mode: "number" }),
		components: jsonb("components").$type<Record<string, number>>().notNull(),
		computedAt: timestamp("computed_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.serverId, table.userId, table.kind, table.itemId],
		}),
		foreignKey({
			columns: [table.serverId],
			foreignColumns: [organization.id],
			name: "user_recommendation_server_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "user_recommendation_user_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		index("user_recommendation_user_idx").on(
			table.serverId,
			table.userId,
			table.mixIndex,
			table.rank,
		),
		check("user_recommendation_rank_check", sql`${table.rank} >= 0`),
	],
);

// Explicit negative feedback ("no me interesa") on a work. Hard-hides the work
// itself and feeds a bounded penalty to similar candidates. Reversible; decays
// over time in scoring. Abandoned reads are NOT stored here — they are derived
// from reading/listening progress at load time.
export const recommendationFeedbackTypeEnum = pgEnum(
	"recommendation_feedback_type",
	["not_interested"],
);

export const userRecommendationFeedback = pgTable(
	"user_recommendation_feedback",
	{
		serverId: text("server_id").notNull(),
		userId: text("user_id").notNull(),
		kind: workKindEnum("kind").notNull(),
		itemId: bigint("item_id", { mode: "number" }).notNull(),
		type: recommendationFeedbackTypeEnum("type")
			.notNull()
			.default("not_interested"),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.serverId, table.userId, table.kind, table.itemId],
		}),
		foreignKey({
			columns: [table.serverId],
			foreignColumns: [organization.id],
			name: "user_recommendation_feedback_server_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "user_recommendation_feedback_user_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
	],
);

// Per-user signals fingerprint — skips feed recompute when nothing changed,
// and backs the refresh-user dirty-check (re-enqueue if it moved mid-job).
export const userRecState = pgTable(
	"user_rec_state",
	{
		serverId: text("server_id").notNull(),
		userId: text("user_id").notNull(),
		signalsFp: text("signals_fp").notNull(),
		computedAt: timestamp("computed_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.serverId, table.userId] }),
		foreignKey({
			columns: [table.serverId],
			foreignColumns: [organization.id],
			name: "user_rec_state_server_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "user_rec_state_user_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
	],
);
