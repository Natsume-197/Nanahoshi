import type { Href } from "expo-router";

export type MediaKind = "book" | "audiobook";

export const routes = {
	title: (kind: MediaKind, uuid: string): Href =>
		kind === "audiobook"
			? { pathname: "/audiobook/[uuid]", params: { uuid } }
			: { pathname: "/book/[uuid]", params: { uuid } },
	series: (uuid: string, kind: MediaKind = "book"): Href => ({
		pathname: "/series/[uuid]",
		params: { uuid, kind },
	}),
	author: (uuid: string): Href => ({
		pathname: "/author/[uuid]",
		params: { uuid },
	}),
	narrator: (uuid: string): Href => ({
		pathname: "/narrator/[uuid]",
		params: { uuid },
	}),
	collection: (id: string | number): Href => ({
		pathname: "/collection/[id]",
		params: { id: String(id) },
	}),
	editCollection: (
		id: string | number,
		kind: "manual" | "dynamic" = "manual",
	): Href =>
		kind === "dynamic"
			? { pathname: "/collection/dynamic/[id]", params: { id: String(id) } }
			: { pathname: "/collection/edit/[id]", params: { id: String(id) } },
};
