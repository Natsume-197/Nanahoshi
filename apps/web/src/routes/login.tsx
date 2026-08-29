import {
	createFileRoute,
	redirect,
	type SearchSchemaInput,
} from "@tanstack/react-router";

import { SignInForm } from "@/components/forms/sign-in-form";
import { optionalAppPath, optionalString } from "@/lib/search-validators";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/login")({
	validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
		redirect: optionalAppPath(search.redirect),
		// OAuth callback failures land back here as ?error=<code>.
		error: optionalString(search.error),
	}),
	beforeLoad: async ({ context, search }) => {
		if (context.session) {
			if (search.redirect) throw redirect({ href: search.redirect });
			throw redirect({ to: "/dashboard" });
		}
		// One public request supplies both the setup gate and auth methods.
		const sso = await client.setup.ssoStatus();
		if (!sso.configured) {
			throw redirect({ to: "/setup" });
		}
		return { sso };
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { redirect: redirectTo, error } = Route.useSearch();
	const { sso } = Route.useRouteContext();
	return <SignInForm sso={sso} redirectTo={redirectTo} oauthError={error} />;
}
