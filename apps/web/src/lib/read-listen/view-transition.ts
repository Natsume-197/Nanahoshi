export type ReadListenNavigationDirection = "enter" | "exit";

type ReadListenViewTransition = {
	finished: Promise<unknown>;
	updateCallbackDone: Promise<unknown>;
};

type ReadListenTransitionDocument = {
	documentElement: {
		dataset: DOMStringMap;
	};
	startViewTransition?: (
		update: () => void | Promise<void>,
	) => ReadListenViewTransition;
};

function browserPrefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

/**
 * Keeps the persistent player visually anchored while its surrounding route
 * changes. Navigation remains the source of truth when the API is unavailable.
 */
export async function transitionReadListenNavigation({
	direction,
	update,
	documentObject = typeof document === "undefined"
		? undefined
		: (document as ReadListenTransitionDocument),
	prefersReducedMotion = browserPrefersReducedMotion(),
}: {
	direction: ReadListenNavigationDirection;
	update: () => void | Promise<void>;
	documentObject?: ReadListenTransitionDocument;
	prefersReducedMotion?: boolean;
}): Promise<void> {
	if (!documentObject?.startViewTransition || prefersReducedMotion) {
		await update();
		return;
	}

	const root = documentObject.documentElement;
	root.dataset.readListenNavigation = direction;
	let transition: ReadListenViewTransition;
	try {
		transition = documentObject.startViewTransition(update);
	} catch {
		delete root.dataset.readListenNavigation;
		await update();
		return;
	}

	const cleanUp = () => {
		delete root.dataset.readListenNavigation;
	};
	void transition.finished.then(cleanUp, cleanUp);
	await transition.updateCallbackDone;
}
