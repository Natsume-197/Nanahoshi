import { call } from "@orpc/server";

type FakeSessionOpts = {
	userId?: string;
	role?: string; // system role: "admin" | "user" | undefined
	activeOrganizationId?: string | null;
};

export function fakeContext(opts: FakeSessionOpts | null) {
	if (opts === null) return { session: null, req: undefined };
	return {
		session: {
			user: { id: opts.userId ?? "user-1", role: opts.role },
			session: { activeOrganizationId: opts.activeOrganizationId ?? null },
		},
		req: undefined,
	};
}

export function callAs(
	procedure: unknown,
	input: unknown,
	ctx: FakeSessionOpts | null,
) {
	return (
		call as (
			p: unknown,
			i: unknown,
			r: { context: unknown },
		) => Promise<unknown>
	)(procedure, input, { context: fakeContext(ctx) });
}

export async function expectRejectsWithCode(
	promise: Promise<unknown>,
	code: string,
) {
	let thrown: unknown;
	try {
		await promise;
	} catch (e) {
		thrown = e;
	}
	if (!thrown)
		throw new Error(`expected rejection with code ${code}, but it resolved`);
	const actual = (thrown as { code?: string }).code;
	if (actual !== code)
		throw new Error(`expected code ${code}, got ${actual ?? String(thrown)}`);
}
