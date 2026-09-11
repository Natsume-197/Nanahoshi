import { createFileRoute, redirect } from "@tanstack/react-router";
import { ServerSettingsPage } from "@/components/settings/server-settings-page";
import {
	isOrgSettingsSection,
	type OrgSettingsIntent,
	type OrgSettingsSection,
} from "@/components/settings/settings-sections";

export const Route = createFileRoute("/dashboard/server/$section")({
	validateSearch: (
		search: Record<string, unknown>,
	): { intent?: OrgSettingsIntent } => ({
		intent: search.intent === "create-library" ? "create-library" : undefined,
	}),
	beforeLoad: ({ params }) => {
		if (!isOrgSettingsSection(params.section)) {
			throw redirect({
				to: "/dashboard/server/$section",
				params: { section: "general" },
			});
		}
	},
	component: ServerSettingsRoute,
});

function ServerSettingsRoute() {
	const { section: rawSection } = Route.useParams();
	// beforeLoad redirects unknown sections to "general", so this is safe.
	const section = rawSection as OrgSettingsSection;
	const { intent } = Route.useSearch();
	const navigate = Route.useNavigate();
	const go = (next: OrgSettingsSection, nextIntent?: OrgSettingsIntent) =>
		void navigate({
			params: { section: next },
			search: nextIntent ? { intent: nextIntent } : {},
		});
	return (
		<ServerSettingsPage
			section={section}
			intent={intent}
			onNavigate={(next) => go(next)}
			onConsumeIntent={() => go(section)}
			onBack={() => void navigate({ to: "/dashboard" })}
		/>
	);
}
