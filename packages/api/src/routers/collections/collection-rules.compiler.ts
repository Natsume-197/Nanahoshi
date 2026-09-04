import {
	audiobookMetadata,
	book,
	bookMetadata,
	library,
	likedBook,
	listeningProgress,
	readingProgress,
	userAudiobookShelf,
	userBookShelf,
} from "@nanahoshi-v2/db/schema/general";
import {
	and,
	eq,
	inArray,
	isNotNull,
	isNull,
	not,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import {
	type CollectionEntityRef,
	type CollectionFieldRule,
	type CollectionRuleGroup,
	type DynamicCollectionDefinitionV1,
	isPersonalizedCollectionDefinition,
} from "./collection-rules";

export type DynamicCollectionQueryContext = {
	viewerId: string;
	serverId: string;
	accessibleLibraryIds: number[] | "ALL";
	timeZone: string;
	query?: string;
	randomSeed?: string;
};

export type CompiledDynamicCollectionQuery = {
	where: SQL;
	orderBy: SQL[];
	isPersonalized: boolean;
	personalJoins: Array<"liked" | "shelf" | "progress">;
	requiresSerialScan: boolean;
};

export function compileDynamicCollectionQuery(
	definition: DynamicCollectionDefinitionV1,
	context: DynamicCollectionQueryContext,
): CompiledDynamicCollectionQuery {
	const scope =
		context.accessibleLibraryIds === "ALL"
			? undefined
			: context.accessibleLibraryIds.length === 0
				? sql`false`
				: inArray(book.libraryId, context.accessibleLibraryIds);
	const rules = compileGroup(definition.root, context);
	const query = context.query?.trim();
	const transientSearch = query
		? or(
				titlePredicate({
					kind: "rule",
					field: "title",
					operator: "contains",
					value: query,
				}),
				textPredicate(sql`${book.filename}`, {
					kind: "rule",
					field: "filename",
					operator: "contains",
					value: query,
				}),
			)
		: undefined;
	return {
		where: and(
			eq(library.serverId, context.serverId),
			isNull(book.duplicateOfBookId),
			scope,
			rules,
			transientSearch,
		) as SQL,
		orderBy: compileSort(definition, context),
		isPersonalized: isPersonalizedCollectionDefinition(definition),
		personalJoins: collectPersonalJoins(definition),
		requiresSerialScan:
			Boolean(query) || hasPositiveIndexedTitleRule(definition.root),
	};
}

function hasPositiveIndexedTitleRule(group: CollectionRuleGroup): boolean {
	return group.children.some((child) =>
		child.kind === "group"
			? hasPositiveIndexedTitleRule(child)
			: child.field === "title" &&
				["contains", "startsWith", "endsWith"].includes(child.operator),
	);
}

function collectPersonalJoins(definition: DynamicCollectionDefinitionV1) {
	const required = new Set<"liked" | "shelf" | "progress">();
	const pending = [...definition.root.children];
	while (pending.length > 0) {
		const node = pending.pop();
		if (!node) continue;
		if (node.kind === "group") {
			pending.push(...node.children);
		} else if (node.field === "liked") {
			required.add("liked");
		} else if (node.field === "shelfStatus") {
			required.add("shelf");
		} else if (
			[
				"consumptionStatus",
				"progressPercent",
				"startedAt",
				"completedAt",
				"lastActivityAt",
			].includes(node.field)
		) {
			required.add("progress");
		}
	}
	if (
		definition.sort.some((sort) =>
			["progressPercent", "consumptionStatus", "lastActivityAt"].includes(
				sort.field,
			),
		)
	) {
		required.add("progress");
	}
	return (["liked", "shelf", "progress"] as const).filter((join) =>
		required.has(join),
	);
}

function compileSort(
	definition: DynamicCollectionDefinitionV1,
	context: DynamicCollectionQueryContext,
): SQL[] {
	const sorts = definition.sort.length
		? definition.sort
		: [{ field: "title" as const, direction: "asc" as const }];
	const result = sorts.map((sort) => {
		const expression = sortExpression(sort.field, context);
		return sort.direction === "asc"
			? sql`${expression} ASC NULLS LAST`
			: sql`${expression} DESC NULLS LAST`;
	});
	result.push(sql`${book.id} ASC`);
	return result;
}

function sortExpression(
	field: DynamicCollectionDefinitionV1["sort"][number]["field"],
	context: DynamicCollectionQueryContext,
): SQL {
	switch (field) {
		case "title":
			return sql`LOWER(COALESCE(${bookMetadata.title}, ${audiobookMetadata.title}, ${book.filename}))`;
		case "primaryAuthor":
			return sql`(SELECT MIN(LOWER(sort_author.name)) FROM (
				SELECT a.name FROM book_author ba JOIN author a ON a.id = ba.author_id WHERE ba.book_id = ${book.id}
				UNION ALL
				SELECT a.name FROM audiobook_author aa JOIN author a ON a.id = aa.author_id WHERE aa.book_id = ${book.id}
			) sort_author)`;
		case "series":
			return sql`(SELECT LOWER(sort_series.name) FROM (
				SELECT s.name, bs.position, s.uuid FROM book_series bs JOIN series s ON s.id = bs.series_id WHERE bs.book_id = ${book.id}
				UNION ALL
				SELECT s.name, aus.position, s.uuid FROM audiobook_series aus JOIN series s ON s.id = aus.series_id WHERE aus.book_id = ${book.id}
			) sort_series ORDER BY sort_series.position ASC NULLS LAST, sort_series.name, sort_series.uuid LIMIT 1)`;
		case "seriesPosition":
			return sql`(SELECT sort_series.position FROM (
				SELECT bs.position, s.name, s.uuid FROM book_series bs JOIN series s ON s.id = bs.series_id WHERE bs.book_id = ${book.id}
				UNION ALL
				SELECT aus.position, s.name, s.uuid FROM audiobook_series aus JOIN series s ON s.id = aus.series_id WHERE aus.book_id = ${book.id}
			) sort_series ORDER BY sort_series.position ASC NULLS LAST, sort_series.name, sort_series.uuid LIMIT 1)`;
		case "addedAt":
			return sql`${book.createdAt}`;
		case "lastModifiedAt":
			return sql`${book.lastModified}`;
		case "publishedDate":
			return sql`CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audiobookMetadata.publishedDate} ELSE ${bookMetadata.publishedDate} END`;
		case "publishedYear":
			return sql`EXTRACT(YEAR FROM CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audiobookMetadata.publishedDate} ELSE ${bookMetadata.publishedDate} END)`;
		case "pageCount":
			return sql`${bookMetadata.pageCount}`;
		case "durationMinutes":
			return sql`${audiobookMetadata.duration} / 60`;
		case "communityRating":
			return sql`${bookMetadata.rating}`;
		case "publisher":
			return sql`(SELECT LOWER(p.name) FROM publisher p WHERE p.id = CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audiobookMetadata.publisherId} ELSE ${bookMetadata.publisherId} END)`;
		case "fileSizeMb":
			return sql`${book.filesizeKb}`;
		case "progressPercent":
			return progressExpression();
		case "consumptionStatus":
			return consumptionStatusExpression();
		case "format":
			return sql`CASE WHEN ${library.mediaType} = 'ebook' THEN ${ebookFormatExpression()} ELSE (
				SELECT MIN(LOWER(COALESCE(af.format, SUBSTRING(af.filename FROM '\\.([^.]+)$')))) FROM audio_file af WHERE af.book_id = ${book.id}
			) END`;
		case "language":
			return sql`CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audiobookMetadata.languageCode} ELSE ${bookMetadata.languageCode} END`;
		case "lastActivityAt":
			return personalDateExpression("last_activity_at");
		case "random":
			return sql`MD5(${book.uuid}::text || ${context.randomSeed ?? "default"})`;
	}
}

function compileGroup(
	group: CollectionRuleGroup,
	context: DynamicCollectionQueryContext,
): SQL {
	const children = group.children.map((child) =>
		child.kind === "group"
			? compileGroup(child, context)
			: compileRule(child, context),
	);
	if (children.length === 0) return sql`true`;
	return (group.match === "all" ? and(...children) : or(...children)) as SQL;
}

function compileRule(
	rule: CollectionFieldRule,
	context: DynamicCollectionQueryContext,
): SQL {
	switch (rule.field) {
		case "mediaType":
			return mediaTypePredicate(rule, context);
		case "title":
			return titlePredicate(rule);
		case "subtitle":
			return textPredicate(
				sql`CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audiobookMetadata.subtitle} ELSE ${bookMetadata.subtitle} END`,
				rule,
			);
		case "filename":
			return textPredicate(sql`${book.filename}`, rule);
		case "pageCount":
			return and(
				eq(library.mediaType, "ebook"),
				numberPredicate(sql`${bookMetadata.pageCount}`, rule),
			) as SQL;
		case "cover":
			return presencePredicate(
				sql`CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audiobookMetadata.cover} ELSE ${bookMetadata.cover} END`,
				rule.operator,
			);
		case "liked": {
			return rule.operator === "isTrue"
				? isNotNull(likedBook.bookId)
				: isNull(likedBook.bookId);
		}
		case "author":
			return entityRelationPredicate(
				sql`SELECT ba.book_id, a.uuid
					FROM book_author ba INNER JOIN author a ON a.id = ba.author_id
					UNION ALL
					SELECT aa.book_id, a.uuid
					FROM audiobook_author aa INNER JOIN author a ON a.id = aa.author_id`,
				rule,
			);
		case "narrator":
			return withMedia(
				"audiobook",
				entityRelationPredicate(
					sql`SELECT bn.book_id, n.uuid
						FROM book_narrator bn INNER JOIN narrator n ON n.id = bn.narrator_id`,
					rule,
				),
			);
		case "publisher":
			return entityRelationPredicate(
				sql`SELECT bm.book_id, p.uuid
					FROM book_metadata bm INNER JOIN publisher p ON p.id = bm.publisher_id
					UNION ALL
					SELECT am.book_id, p.uuid
					FROM audiobook_metadata am INNER JOIN publisher p ON p.id = am.publisher_id`,
				rule,
			);
		case "series":
			return entityRelationPredicate(
				sql`SELECT bs.book_id, s.uuid
					FROM book_series bs INNER JOIN series s ON s.id = bs.series_id
					UNION ALL
					SELECT aus.book_id, s.uuid
					FROM audiobook_series aus INNER JOIN series s ON s.id = aus.series_id`,
				rule,
			);
		case "seriesPosition":
			return relationNumberPredicate(
				sql`SELECT bs.book_id, bs.position AS value FROM book_series bs
					UNION ALL
					SELECT aus.book_id, aus.position AS value FROM audiobook_series aus`,
				rule,
			);
		case "genre":
			return entityRelationPredicate(
				sql`SELECT bg.book_id, g.uuid
					FROM book_genre bg INNER JOIN genre g ON g.id = bg.genre_id
					UNION ALL
					SELECT ag.book_id, g.uuid
					FROM audiobook_genre ag INNER JOIN genre g ON g.id = ag.genre_id`,
				rule,
			);
		case "tag":
			return entityRelationPredicate(
				sql`SELECT bt.book_id, t.uuid
					FROM book_tag bt INNER JOIN tag t ON t.id = bt.tag_id
					UNION ALL
					SELECT atu.book_id, t.uuid
					FROM audiobook_tag atu INNER JOIN tag t ON t.id = atu.tag_id`,
				rule,
			);
		case "language":
			return enumPredicate(
				sql`CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audiobookMetadata.languageCode} ELSE ${bookMetadata.languageCode} END`,
				rule,
			);
		case "contentForm":
			return withMedia(
				"ebook",
				enumPredicate(sql`${bookMetadata.contentForm}`, rule),
			);
		case "format":
			return formatPredicate(rule);
		case "fileSizeMb":
			return numberPredicate(
				sql`${book.filesizeKb}::double precision / 1024`,
				rule,
			);
		case "addedAt":
			return datePredicate(sql`${book.createdAt}`, rule, context, true);
		case "lastModifiedAt":
			return datePredicate(sql`${book.lastModified}`, rule, context, true);
		case "publishedDate":
			return datePredicate(
				sql`CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audiobookMetadata.publishedDate} ELSE ${bookMetadata.publishedDate} END`,
				rule,
				context,
				false,
			);
		case "publishedYear":
			return numberPredicate(
				sql`EXTRACT(YEAR FROM CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audiobookMetadata.publishedDate} ELSE ${bookMetadata.publishedDate} END)`,
				rule,
			);
		case "durationMinutes":
			return withMedia(
				"audiobook",
				numberPredicate(sql`${audiobookMetadata.duration} / 60`, rule),
			);
		case "communityRating":
			return withMedia(
				"ebook",
				numberPredicate(sql`${bookMetadata.rating}`, rule),
			);
		case "communityRatingCount":
			return withMedia(
				"ebook",
				numberPredicate(sql`${bookMetadata.ratingCount}`, rule),
			);
		case "description":
			return presencePredicate(
				normalizedText(
					sql`CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audiobookMetadata.description} ELSE ${bookMetadata.description} END`,
				),
				rule.operator,
			);
		case "isbn":
			return textPredicate(
				sql`UPPER(REGEXP_REPLACE(CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audiobookMetadata.isbn} ELSE COALESCE(${bookMetadata.isbn13}, ${bookMetadata.isbn10}) END, '[-[:space:]]', '', 'g'))`,
				{
					...rule,
					value:
						typeof rule.value === "string"
							? normalizeIdentifier(rule.value)
							: rule.value,
				},
			);
		case "asin":
			return textPredicate(
				sql`UPPER(BTRIM(CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audiobookMetadata.asin} ELSE ${bookMetadata.asin} END))`,
				{
					...rule,
					value:
						typeof rule.value === "string"
							? normalizeIdentifier(rule.value)
							: rule.value,
				},
			);
		case "explicit":
			return withMedia(
				"audiobook",
				booleanPredicate(sql`${audiobookMetadata.explicit}`, rule.operator),
			);
		case "abridged":
			return withMedia(
				"audiobook",
				booleanPredicate(sql`${audiobookMetadata.abridged}`, rule.operator),
			);
		case "library":
			return entityScalarPredicate(sql`${library.uuid}`, rule);
		case "manualCollection":
			return entityRelationPredicate(
				sql`SELECT cb.book_id, c.id AS uuid
					FROM collection_book cb INNER JOIN collection c ON c.id = cb.collection_id
					WHERE c.kind = 'manual'
						AND c.server_id = ${context.serverId}
						AND (c.is_public = true OR c.user_id = ${context.viewerId})`,
				rule,
			);
		case "enrichmentStatus":
			return enumPredicate(
				sql`COALESCE((SELECT es.status FROM enrichment_state es WHERE es.book_id = ${book.id}), 'notRun')`,
				rule,
			);
		case "metadataLocked":
			return booleanPredicate(
				sql`CASE WHEN ${library.mediaType} = 'audiobook'
					THEN CARDINALITY(${audiobookMetadata.lockedFields}) > 0
					ELSE CARDINALITY(${bookMetadata.lockedFields}) > 0 END`,
				rule.operator,
			);
		case "readListenPaired": {
			const paired = readListenPairPredicate(context);
			return rule.operator === "isTrue" ? paired : not(paired);
		}
		case "shelfStatus":
			return enumPredicate(shelfStatusExpression(), rule);
		case "consumptionStatus":
			return enumPredicate(consumptionStatusExpression(), rule);
		case "progressPercent":
			return numberPredicate(progressExpression(), rule);
		case "startedAt":
			return datePredicate(
				personalDateExpression("started_at"),
				rule,
				context,
				true,
			);
		case "completedAt":
			return datePredicate(
				personalDateExpression("completed_at"),
				rule,
				context,
				true,
			);
		case "lastActivityAt":
			return datePredicate(
				personalDateExpression("last_activity_at"),
				rule,
				context,
				true,
			);
		default:
			throw new Error(`Collection rule field is not compiled: ${rule.field}`);
	}
}

function withMedia(mediaType: "ebook" | "audiobook", predicate: SQL): SQL {
	return and(eq(library.mediaType, mediaType), predicate) as SQL;
}

function normalizeIdentifier(value: string): string {
	return value.replaceAll("-", "").replaceAll(" ", "").trim().toUpperCase();
}

function normalizedText(expression: SQL): SQL {
	return sql`NULLIF(BTRIM((${expression})::text), '')`;
}

function escapeLike(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll("%", "\\%")
		.replaceAll("_", "\\_");
}

function titlePredicate(rule: CollectionFieldRule): SQL {
	const exact = textPredicate(
		sql`COALESCE(${bookMetadata.title}, ${audiobookMetadata.title}, ${book.filename})`,
		rule,
	);
	if (!["contains", "startsWith", "endsWith"].includes(rule.operator)) {
		return exact;
	}
	const value = escapeLike(String(rule.value));
	const pattern =
		rule.operator === "startsWith"
			? `${value}%`
			: rule.operator === "endsWith"
				? `%${value}`
				: `%${value}%`;
	const candidates = sql`
		SELECT bmq.book_id FROM book_metadata bmq
		WHERE (bmq.title::text) ILIKE ${pattern} ESCAPE '\\'
		UNION ALL
		SELECT amq.book_id FROM audiobook_metadata amq
		WHERE (amq.title::text) ILIKE ${pattern} ESCAPE '\\'
		UNION ALL
		SELECT bq.id FROM book bq
		WHERE bq.filename ILIKE ${pattern} ESCAPE '\\'
	`;
	// The indexed set is deliberately a superset: the exact COALESCE predicate
	// remains authoritative when more than one title source exists.
	return and(sql`${book.id} IN (${candidates})`, exact) as SQL;
}

function textPredicate(expression: SQL, rule: CollectionFieldRule): SQL {
	const field = normalizedText(expression);
	if (rule.operator === "isMissing" || rule.operator === "isPresent") {
		return presencePredicate(field, rule.operator);
	}
	const value = String(rule.value);
	const escaped = escapeLike(value);
	switch (rule.operator) {
		case "contains":
			return sql`${field} ILIKE ${`%${escaped}%`} ESCAPE '\\'`;
		case "notContains":
			return sql`${field} IS NOT NULL AND NOT (${field} ILIKE ${`%${escaped}%`} ESCAPE '\\')`;
		case "startsWith":
			return sql`${field} ILIKE ${`${escaped}%`} ESCAPE '\\'`;
		case "endsWith":
			return sql`${field} ILIKE ${`%${escaped}`} ESCAPE '\\'`;
		case "equals":
			return sql`LOWER(${field}) = LOWER(${value})`;
		case "notEquals":
			return sql`${field} IS NOT NULL AND LOWER(${field}) <> LOWER(${value})`;
		default:
			throw new Error(`Invalid text operator: ${rule.operator}`);
	}
}

function numberPredicate(expression: SQL, rule: CollectionFieldRule): SQL {
	if (rule.operator === "isMissing" || rule.operator === "isPresent") {
		return presencePredicate(expression, rule.operator);
	}
	if (rule.operator === "between") {
		const range = rule.value as { min: number; max: number };
		return sql`${expression} BETWEEN ${range.min} AND ${range.max}`;
	}
	const value = rule.value as number;
	switch (rule.operator) {
		case "equals":
			return sql`${expression} = ${value}`;
		case "notEquals":
			return sql`${expression} IS NOT NULL AND ${expression} <> ${value}`;
		case "gt":
			return sql`${expression} > ${value}`;
		case "gte":
			return sql`${expression} >= ${value}`;
		case "lt":
			return sql`${expression} < ${value}`;
		case "lte":
			return sql`${expression} <= ${value}`;
		default:
			throw new Error(`Invalid number operator: ${rule.operator}`);
	}
}

function presencePredicate(expression: SQL, operator: string): SQL {
	return operator === "isMissing"
		? sql`${expression} IS NULL`
		: sql`${expression} IS NOT NULL`;
}

function booleanPredicate(expression: SQL, operator: string): SQL {
	if (operator === "isUnknown") return sql`${expression} IS NULL`;
	return operator === "isTrue"
		? sql`${expression} IS TRUE`
		: sql`${expression} IS FALSE`;
}

function enumPredicate(expression: SQL, rule: CollectionFieldRule): SQL {
	if (rule.operator === "isMissing" || rule.operator === "isPresent") {
		return presencePredicate(normalizedText(expression), rule.operator);
	}
	const values = rule.value as string[];
	const list = sql.join(
		values.map((value) => sql`${value}`),
		sql`, `,
	);
	return rule.operator === "includesAny"
		? sql`${expression} IN (${list})`
		: sql`(${expression} IS NULL OR ${expression} NOT IN (${list}))`;
}

function readListenPairPredicate(context: DynamicCollectionQueryContext): SQL {
	return sql`EXISTS (SELECT 1 FROM read_listen_pair rlp
		WHERE rlp.server_id = ${context.serverId}
			AND (rlp.ebook_book_id = ${book.id} OR rlp.audiobook_book_id = ${book.id}))`;
}

function mediaTypePredicate(
	rule: CollectionFieldRule,
	context: DynamicCollectionQueryContext,
): SQL {
	const values = rule.value as string[];
	if (!values.includes("readListen")) {
		return enumPredicate(sql`${library.mediaType}`, rule);
	}

	const libraryMediaTypes = values.filter(
		(value): value is "ebook" | "audiobook" =>
			value === "ebook" || value === "audiobook",
	);
	const paired = readListenPairPredicate(context);
	const libraryRule = { ...rule, value: libraryMediaTypes };

	if (rule.operator === "includesAny") {
		return libraryMediaTypes.length > 0
			? (or(
					enumPredicate(sql`${library.mediaType}`, libraryRule),
					paired,
				) as SQL)
			: paired;
	}

	return libraryMediaTypes.length > 0
		? (and(
				enumPredicate(sql`${library.mediaType}`, libraryRule),
				not(paired),
			) as SQL)
		: not(paired);
}

function entityScalarPredicate(
	expression: SQL,
	rule: CollectionFieldRule,
): SQL {
	const ids = (rule.value as CollectionEntityRef[]).map((value) => value.id);
	const list = sql.join(
		ids.map((id) => sql`${id}::uuid`),
		sql`, `,
	);
	return rule.operator === "includesAny"
		? sql`${expression} IN (${list})`
		: sql`${expression} NOT IN (${list})`;
}

function relationNumberPredicate(
	relation: SQL,
	rule: CollectionFieldRule,
): SQL {
	const exists = sql`SELECT 1 FROM (${relation}) rel WHERE rel.book_id = ${book.id}`;
	if (rule.operator === "isMissing")
		return sql`NOT EXISTS (${exists} AND rel.value IS NOT NULL)`;
	if (rule.operator === "isPresent")
		return sql`EXISTS (${exists} AND rel.value IS NOT NULL)`;
	return sql`EXISTS (${exists} AND ${numberPredicate(sql`rel.value`, rule)})`;
}

function datePredicate(
	expression: SQL,
	rule: CollectionFieldRule,
	context: DynamicCollectionQueryContext,
	isTimestamp: boolean,
): SQL {
	if (rule.operator === "isMissing" || rule.operator === "isPresent") {
		return presencePredicate(expression, rule.operator);
	}
	const localDate = isTimestamp
		? sql`(${expression} AT TIME ZONE ${context.timeZone})::date`
		: sql`(${expression})::date`;
	if (rule.operator === "between") {
		const range = rule.value as { from: string; to: string };
		return sql`${localDate} BETWEEN ${range.from}::date AND ${range.to}::date`;
	}
	if (rule.operator === "withinLast") {
		const relative = rule.value as {
			amount: number;
			unit: "day" | "week" | "month";
		};
		const interval =
			relative.unit === "month"
				? sql`make_interval(months => ${relative.amount})`
				: relative.unit === "week"
					? sql`make_interval(days => ${relative.amount * 7 - 1})`
					: sql`make_interval(days => ${relative.amount - 1})`;
		return sql`${localDate} >= ((CURRENT_TIMESTAMP AT TIME ZONE ${context.timeZone})::date - ${interval})`;
	}
	return rule.operator === "before"
		? sql`${localDate} < ${rule.value as string}::date`
		: sql`${localDate} > ${rule.value as string}::date`;
}

function ebookFormatExpression(): SQL {
	return sql`CASE
		WHEN LOWER(${book.filename}) LIKE '%.kepub.epub' THEN 'kepub.epub'
		WHEN LOWER(${book.filename}) LIKE '%.fb2.zip' THEN 'fb2.zip'
		ELSE LOWER(SUBSTRING(${book.filename} FROM '\\.([^.]+)$'))
	END`;
}

function formatPredicate(rule: CollectionFieldRule): SQL {
	const values = rule.value as string[];
	const list = sql.join(
		values.map((value) => sql`${value.toLowerCase()}`),
		sql`, `,
	);
	const matches = or(
		and(
			eq(library.mediaType, "ebook"),
			sql`${ebookFormatExpression()} IN (${list})`,
		),
		and(
			eq(library.mediaType, "audiobook"),
			sql`EXISTS (
				SELECT 1 FROM audio_file af
				WHERE af.book_id = ${book.id}
					AND LOWER(COALESCE(af.format, SUBSTRING(af.filename FROM '\\.([^.]+)$'))) IN (${list})
			)`,
		),
	) as SQL;
	return rule.operator === "includesAny" ? matches : not(matches);
}

function shelfStatusExpression(): SQL {
	return sql`CASE WHEN ${library.mediaType} = 'audiobook' THEN COALESCE(
		CASE ${userAudiobookShelf.status}
			WHEN 'want_to_listen' THEN 'want'
			WHEN 'listening' THEN 'inProgress'
			ELSE ${userAudiobookShelf.status}::text END,
		'none') ELSE COALESCE(
		CASE ${userBookShelf.status}
			WHEN 'want_to_read' THEN 'want'
			WHEN 'reading' THEN 'inProgress'
			ELSE ${userBookShelf.status}::text END,
		'none') END`;
}

function consumptionStatusExpression(): SQL {
	return sql`CASE WHEN ${library.mediaType} = 'audiobook' THEN COALESCE(
		CASE ${listeningProgress.status}
			WHEN 'listening' THEN 'inProgress'
			WHEN 'completed' THEN 'completed'
			ELSE 'unstarted' END,
		'unstarted') ELSE COALESCE(
		CASE ${readingProgress.status}
			WHEN 'reading' THEN 'inProgress'
			WHEN 'completed' THEN 'completed'
			ELSE 'unstarted' END,
		'unstarted') END`;
}

function progressExpression(): SQL {
	return sql`CASE WHEN ${library.mediaType} = 'audiobook' THEN COALESCE(
		CASE
			WHEN ${listeningProgress.status} = 'completed' THEN 100::double precision
			WHEN COALESCE(${listeningProgress.durationSeconds}, 0) <= 0 THEN 0::double precision
			ELSE LEAST(100, GREATEST(0, ${listeningProgress.currentTimeSeconds} / ${listeningProgress.durationSeconds} * 100)) END,
		0) ELSE COALESCE(
		CASE
			WHEN ${readingProgress.status} = 'completed' THEN 100::double precision
			WHEN COALESCE(${readingProgress.bookCharCount}, 0) <= 0 THEN 0::double precision
			ELSE LEAST(100, GREATEST(0, ${readingProgress.exploredCharCount}::double precision / ${readingProgress.bookCharCount} * 100)) END,
		0) END`;
}

function personalDateExpression(
	field: "started_at" | "completed_at" | "last_activity_at",
): SQL {
	const readingColumn =
		field === "last_activity_at"
			? readingProgress.lastReadAt
			: field === "started_at"
				? readingProgress.startedAt
				: readingProgress.completedAt;
	const listeningColumn =
		field === "last_activity_at"
			? listeningProgress.lastListenedAt
			: field === "started_at"
				? listeningProgress.startedAt
				: listeningProgress.completedAt;
	return sql`CASE WHEN ${library.mediaType} = 'audiobook' THEN ${listeningColumn} ELSE ${readingColumn} END`;
}

function entityRelationPredicate(
	relation: SQL,
	rule: CollectionFieldRule,
): SQL {
	const base = sql`SELECT 1 FROM (${relation}) rel WHERE rel.book_id = ${book.id}`;
	if (rule.operator === "isMissing") return sql`NOT EXISTS (${base})`;
	if (rule.operator === "isPresent") return sql`EXISTS (${base})`;
	const ids = (rule.value as CollectionEntityRef[]).map((value) => value.id);
	const matching = sql`${base} AND rel.uuid IN (${sql.join(
		ids.map((id) => sql`${id}::uuid`),
		sql`, `,
	)})`;
	if (rule.operator === "includesAny") return sql`EXISTS (${matching})`;
	if (rule.operator === "excludesAll") return sql`NOT EXISTS (${matching})`;
	return sql`(
		SELECT COUNT(DISTINCT rel.uuid)::int
		FROM (${relation}) rel
		WHERE rel.book_id = ${book.id}
			AND rel.uuid IN (${sql.join(
				ids.map((id) => sql`${id}::uuid`),
				sql`, `,
			)})
	) = ${ids.length}`;
}
