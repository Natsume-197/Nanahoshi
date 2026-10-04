import { type Href, router } from "expo-router";
import { createContext, use, useSyncExternalStore } from "react";
import { routes } from "@/lib/routes";

/** The quick forms that open over the page. */
export type FormSheetTarget =
	| { form: "newCollection" }
	| { form: "editCollection"; id: string }
	| { form: "kindle"; uuid: string };

export function formSheetHref(target: FormSheetTarget): Href {
	switch (target.form) {
		case "newCollection":
			return "/collection/new";
		case "editCollection":
			return routes.editCollection(target.id);
		case "kindle":
			return { pathname: "/kindle/[uuid]", params: { uuid: target.uuid } };
	}
}

// Android shows them in the app's one Material sheet, hosted under the tabs
// (the same as the ⋮ menus); iOS keeps the page-sheet routes.
let current: FormSheetTarget | null = null;
const listeners = new Set<() => void>();
const emit = () => {
	for (const listener of listeners) listener();
};

export function openFormSheet(target: FormSheetTarget) {
	if (process.env.EXPO_OS === "ios") return router.push(formSheetHref(target));
	current = target;
	emit();
}

export function closeFormSheet() {
	current = null;
	emit();
}

export function useFormSheetTarget() {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => current,
	);
}

/** Closes the form, then opens `next` if given. */
export type FinishFormSheet = (next?: Href) => void;

export const FormSheetContext = createContext<{
	/** Inside the Material sheet, which sizes to its content. */
	embedded: boolean;
	finish: FinishFormSheet;
}>({
	embedded: false,
	finish: (next) => {
		router.back();
		if (next) router.push(next);
	},
});

export const useFormSheet = () => use(FormSheetContext);
