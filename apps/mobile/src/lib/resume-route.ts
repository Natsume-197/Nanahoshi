import type { Href } from "expo-router";

let pending: Href[] | null = null;

/** The screens to rebuild, in order, after the app remounts its navigation. */
export function setResumeRoute(route: Href[]) {
	pending = route;
}

export function takeResumeRoute(): Href[] | null {
	const route = pending;
	pending = null;
	return route;
}
