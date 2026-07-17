import {
	createFileRoute,
	redirect,
	type SearchSchemaInput,
} from "@tanstack/react-router";

import { SignInForm } from "@/components/forms/sign-in-form";
import { optionalAppPath } from "@/lib/search-validators";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/login")({
	validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
		redirect: optionalAppPath(search.redirect),
	}),
	beforeLoad: async ({ context, search }) => {
		if (context.session) {
			if (search.redirect) throw redirect({ href: search.redirect });
			throw redirect({ to: "/dashboard" });
		}
		// A fresh install has no accounts to sign into — go initialize instead.
		if (!(await client.setup.isConfigured())) {
			throw redirect({ to: "/setup" });
		}
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { redirect: redirectTo } = Route.useSearch();
	return <SignInForm redirectTo={redirectTo} onSwitchToSignUp={() => {}} />;
}
