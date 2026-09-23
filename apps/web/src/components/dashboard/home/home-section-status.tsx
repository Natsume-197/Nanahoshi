import {
	createContext,
	type JSX,
	type ReactNode,
	useContext,
	useMemo,
} from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";

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

export function useReportHomeSectionStatus(status: HomeSectionStatus) {
	const context = useContext(HomeSectionStatusContext);
	return (children: ReactNode) => (
		<>
			<HomeSectionReport
				key={status}
				status={status}
				report={context?.report}
			/>
			{children}
		</>
	);
}

function HomeSectionReport({
	status,
	report,
}: {
	status: HomeSectionStatus;
	report: HomeSectionContextValue["report"] | undefined;
}) {
	useMountEffect(() => report?.(status));
	return null;
}

export function useHomeSectionLoadingPlaceholder(): boolean {
	const context = useContext(HomeSectionStatusContext);
	return !context?.suppressLoadingPlaceholder;
}
