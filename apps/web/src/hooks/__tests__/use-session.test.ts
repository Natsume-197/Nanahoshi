import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
// Captured before mock.module so the mock can re-export every real name —
// mock.module leaks across test files sharing this Bun process, and other
// suites import QueryClient etc. from this module.
import * as realReactQuery from "@tanstack/react-query";

// The hook calls useQuery + useRouteContext and computes synchronously (no React
// state/effects), so mocking those two lets us exercise it as a pure function.
// The useQuery mock mirrors react-query's initialData contract: with nothing
// fetched yet, the observed data IS `initialData` (this is exactly the initial
// hydration case the hook has to survive).
type QueryOptions = {
	enabled?: boolean;
	queryKey?: unknown;
	initialData?: unknown;
};
let lastQueryOptions: QueryOptions | undefined;
// `undefined` = nothing fetched/cached, so the query falls back to initialData.
let fetchedData: unknown;

mock.module("@tanstack/react-query", () => ({
	...realReactQuery,
	useQuery: (options: QueryOptions) => {
		lastQueryOptions = options;
		const data = fetchedData !== undefined ? fetchedData : options.initialData;
		return { data, isPending: false, isRefetching: false };
	},
}));

let routeContext: Record<string, unknown> = {};
mock.module("@tanstack/react-router", () => ({
	useRouteContext: () => routeContext,
}));

// getUser is only referenced as the (mocked-away) queryFn; stub it so importing
// the hook doesn't pull in the server-fn/middleware chain.
mock.module("@/functions/get-user", () => ({
	getUser: () => Promise.resolve(null),
}));

import type { AppSession } from "../use-session";

const { useSession } = await import("../use-session");

// Minimal test doubles; cast past the full better-auth session shape.
const sessionA = {
	user: { id: "u1", name: "A" },
	session: { activeOrganizationId: "org-a" },
} as unknown as AppSession;
const sessionB = {
	user: { id: "u2", name: "B" },
	session: { activeOrganizationId: "org-b" },
} as unknown as AppSession;

const setClient = (on: boolean) => {
	if (on) (globalThis as { window?: unknown }).window = {};
	else (globalThis as { window?: unknown }).window = undefined;
};

beforeEach(() => {
	fetchedData = undefined;
	routeContext = {};
	lastQueryOptions = undefined;
});

afterEach(() => {
	setClient(true);
});

describe("useSession", () => {
	it("on the client seeds the query with the context session and never reports pending", () => {
		setClient(true);
		routeContext = { session: sessionB };

		const result = useSession();

		// Nothing fetched yet (initial hydration): data comes from initialData,
		// which must be the context session — so it matches the server render.
		expect(result.data).toBe(sessionB);
		expect(result.isPending).toBe(false);
		expect(lastQueryOptions?.enabled).toBe(true);
		expect(lastQueryOptions?.initialData).toBe(sessionB);
	});

	it("on the client prefers freshly fetched query data over the seed", () => {
		setClient(true);
		fetchedData = sessionA;
		routeContext = { session: sessionB };

		const result = useSession();

		expect(result.data).toBe(sessionA);
		expect(result.isPending).toBe(false);
	});

	it("on the server reads route context, disables the query, and withholds initialData", () => {
		setClient(false);
		fetchedData = sessionA; // even a poisoned shared cache must be ignored
		routeContext = { session: sessionB };

		const result = useSession();

		expect(result.data).toBe(sessionB);
		expect(result.isPending).toBe(false);
		expect(lastQueryOptions?.enabled).toBe(false);
		expect(lastQueryOptions?.initialData).toBeUndefined();
	});

	it("returns null (not pending) when there is no session anywhere", () => {
		setClient(true);
		routeContext = {};

		const result = useSession();

		expect(result.data).toBeNull();
		expect(result.isPending).toBe(false);
	});
});
