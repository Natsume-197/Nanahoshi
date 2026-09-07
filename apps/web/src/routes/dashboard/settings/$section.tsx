import { createFileRoute, redirect } from "@tanstack/react-router";
import { SettingsPage } from "@/components/settings/settings-page";
import {
	isSettingsSection,
	type SettingsSection,
} from "@/components/settings/settings-sections";

export const Route = createFileRoute("/dashboard/settings/$section")({
	beforeLoad: ({ params }) => {
		if (!isSettingsSection(params.section)) {
			throw redirect({
				to: "/dashboard/settings/$section",
				params: { section: "profile" },
			});
		}
	},
	component: SettingsRoute,
});

function SettingsRoute() {
	const { section } = Route.useParams();
	const navigate = Route.useNavigate();
	return (
		<SettingsPage
			section={section as SettingsSection}
			onNavigate={(nextSection) =>
				void navigate({ params: { section: nextSection } })
			}
			onBack={() => void navigate({ to: "/dashboard" })}
		/>
	);
}
