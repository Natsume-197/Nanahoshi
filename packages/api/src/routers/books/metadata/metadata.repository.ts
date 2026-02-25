import { eq } from "drizzle-orm";
import { db } from "@nanahoshi-v2/db";
import {
	author,
	bookAuthor,
	bookMetadata,
	publisher
} from "@nanahoshi-v2/db/schema/general";

export class BookMetadataRepository {
	// ---------- 1. UPSERT book_metadata ----------
	async upsertMetadata(bookId: number, metadata: any) {
		// ¿ya existe?
		const existing = await db
			.select()
			.from(bookMetadata)
			.where(eq(bookMetadata.bookId, bookId))
			.limit(1);

		// --- INSERT -------------------------------------------------
		if (existing.length === 0) {
			const [inserted] = await db
				.insert(bookMetadata)
				.values({ bookId, ...metadata })
				.returning();
			return inserted;
		}

		// --- UPDATE (si hay algo que cambiar) -----------------------
		const clean = Object.fromEntries(
			Object.entries(metadata).filter(([, v]) => v !== undefined),
		);

		if (Object.keys(clean).length === 0) {
			// nada que actualizar → devuelve fila existente
			return existing[0];
		}

		const [updated] = await db
			.update(bookMetadata)
			.set(clean)
			.where(eq(bookMetadata.bookId, bookId))
			.returning();

		return updated ?? null;
	}
	// ---------- 2. UPSERT publisher ----------
	async upsertPublisher(name: string): Promise<number> {
		const [pub] = await db
			.insert(publisher)
			.values({ name })
			.onConflictDoUpdate({
				target: publisher.name, // ON CONFLICT (name)
				set: { name },
			})
			.returning({ id: publisher.id });

		return pub.id;
	}

	// ---------- 3. UPSERT author ----------
	async upsertAuthor(
		name: string,
		provider: string,
		amazonAsin?: string,
	): Promise<number> {
		const values = { name, provider, ...(amazonAsin ? { amazonAsin } : {}) };

		const conflictTarget = amazonAsin
			? author.amazonAsin // UNIQUE (amazon_asin)
			: [author.provider, author.name]; // UNIQUE (provider,name)

		const [row] = await db
			.insert(author)
			.values(values)
			.onConflictDoUpdate({
				target: conflictTarget,
				set: values,
			})
			.returning({ id: author.id });

		return row.id;
	}

	// ---------- 4. Vincular libro-autor ----------
	async linkBookAuthor(bookId: bigint, authorId: bigint, role = "Author") {
		await db
			.insert(bookAuthor)
			.values({ bookId, authorId, role })
			.onConflictDoNothing({
				target: [bookAuthor.bookId, bookAuthor.authorId],
			});
	}

	// ---------- 5. Obtener metadata por bookId ----------
	async findByBookId(bookId: number) {
		const rows = await db
			.select()
			.from(bookMetadata)
			.where(eq(bookMetadata.bookId, bookId))
			.limit(1);

		return rows[0] ?? null;
	}
}

export const bookMetadataRepository = new BookMetadataRepository();
