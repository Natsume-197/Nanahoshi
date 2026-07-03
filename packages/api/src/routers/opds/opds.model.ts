import { z } from "zod";

export const CreateOpdsKeyInput = z.object({
	name: z.string().min(1).max(32),
});

export const DeleteOpdsKeyInput = z.object({ keyId: z.string() });

export interface OpdsUser {
	userId: string;
	serverId: string;
	/** Libraries this user may view; "ALL" means no restriction. */
	accessibleLibraryIds: number[] | "ALL";
}

export interface OpdsBookEntry {
	uuid: string;
	title: string;
	filename: string;
	authors: { uuid?: string; name: string }[];
	cover?: string | null;
	createdAt: string;
}

export interface OpdsFeedMeta {
	id: string;
	title: string;
	selfHref: string;
	nextHref?: string;
	searchHref?: string;
}

export interface NavigationEntry {
	title: string;
	href: string;
	id: string;
	content?: string;
}
