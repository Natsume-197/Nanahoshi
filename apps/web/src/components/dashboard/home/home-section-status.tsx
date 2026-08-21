import {
	createContext,
	type JSX,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
} from "react";

export type HomeSectionStatus = "loading" | "populated" | "empty";

type HomeSectionContextValue = {
	report: (status: HomeSectionStatus) => void;
	suppressLoadingPlaceholder: boolean;
};

const HomeSectionStatusContext = createContext<HomeSectionContextValue | null>(
	null,
);

export function HomeSectionStatusProvider({
	onStatus,
	suppressLoadingPlaceholder,
	children,
}: {
	onStatus: (status: HomeSectionStatus) => void;
	suppressLoadingPlaceholder: boolean;
	children: ReactNode;
}): JSX.Element {
	const value = useMemo(
		() => ({ report: onStatus, suppressLoadingPlaceholder }),
		[onStatus, suppressLoadingPlaceholder],
	);
	return (
		<HomeSectionStatusContext.Provider value={value}>
			{children}
		</HomeSectionStatusContext.Provider>
	);
}

export function useReportHomeSectionStatus(status: HomeSectionStatus): void {
	const context = useContext(HomeSectionStatusContext);
	useEffect(() => context?.report(status), [context, status]);
}

export function useHomeSectionLoadingPlaceholder(): boolean {
	const context = useContext(HomeSectionStatusContext);
	return !context?.suppressLoadingPlaceholder;
}
