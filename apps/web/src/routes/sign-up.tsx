import {
	createFileRoute,
	redirect,
	type SearchSchemaInput,
} from "@tanstack/react-router";
import { SignUpForm } from "@/components/forms/sign-up-form";
import { optionalAppPath, optionalString } from "@/lib/search-validators";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/sign-up")({
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
		// One public request supplies both the setup gate and registration methods.
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
	return <SignUpForm sso={sso} redirectTo={redirectTo} oauthError={error} />;
}
