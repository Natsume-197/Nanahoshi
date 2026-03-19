export interface OpdsUser {
	userId: string;
	organizationId: string;
}

export interface OpdsBookEntry {
	uuid: string;
	title: string;
	filename: string;
	authors: { id: number; name: string }[];
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
