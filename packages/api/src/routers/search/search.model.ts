import { z } from "zod";

export const TopSearchInput = z.object({
	query: z.string().trim().min(1),
	limit: z.number().int().min(1).max(20).default(10),
});

export type TopHit =
	| {
			type: "book" | "audiobook";
			uuid: string;
			title: string | null;
			filename: string;
			cover: string | null;
			authors: { id?: number | null; name: string }[];
	  }
	| {
			type: "series";
			id: number;
			name: string;
			cover: string | null;
			bookCount: number;
			author: { id: number; name: string } | null;
	  }
	| { type: "author"; id: number; name: string; bookCount: number }
	| {
			type: "collection";
			id: string;
			name: string;
			ownerUsername: string | null;
			previewCovers: string[];
	  }
	| {
			type: "user";
			username: string | null;
			name: string;
			displayUsername: string | null;
			image: string | null;
	  };
