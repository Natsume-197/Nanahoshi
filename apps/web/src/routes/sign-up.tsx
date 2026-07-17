import {
	createFileRoute,
	redirect,
	type SearchSchemaInput,
} from "@tanstack/react-router";
import { SignUpForm } from "@/components/forms/sign-up-form";
import { optionalAppPath } from "@/lib/search-validators";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/sign-up")({
	validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
		redirect: optionalAppPath(search.redirect),
	}),
	beforeLoad: async ({ context, search }) => {
		if (context.session) {
			if (search.redirect) throw redirect({ href: search.redirect });
			throw redirect({ to: "/dashboard" });
		}
		// A fresh install creates its admin through the setup wizard, not here.
		if (!(await client.setup.isConfigured())) {
			throw redirect({ to: "/setup" });
		}
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { redirect: redirectTo } = Route.useSearch();
	return <SignUpForm redirectTo={redirectTo} onSwitchToSignIn={() => {}} />;
}
