import { createFileRoute, redirect } from "@tanstack/react-router";
import type { SettingsSection } from "@/components/settings/settings-sections";

/** Maps a legacy settings pathname to its modal section key. */
function sectionFromPath(pathname: string): SettingsSection {
	const path = pathname.replace(/\/+$/, "");
	if (path.endsWith("/account")) return "account";
	if (path.endsWith("/organization/general")) return "org-general";
	if (path.endsWith("/organization/libraries")) return "org-libraries";
	if (path.endsWith("/organization/members")) return "org-members";
	if (path.endsWith("/organization/opds")) return "org-opds";
	if (path.endsWith("/organization/discord")) return "org-discord";
	if (path.endsWith("/addons/metadata-sources")) return "addons-metadata";
	if (path.endsWith("/admin/system")) return "admin-system";
	if (path.endsWith("/admin/tasks")) return "admin-tasks";
	if (path.endsWith("/admin/users")) return "admin-users";
	if (path.includes("/admin/organizations")) return "admin-organizations";
	return "profile";
}

export const Route = createFileRoute("/dashboard/settings")({
	// Settings now lives in a modal over the dashboard. Any legacy /dashboard/
	// settings/* URL deep-links into that modal via the `settings` search param.
	beforeLoad: ({ context, location }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
		throw redirect({
			to: "/dashboard",
			search: { settings: sectionFromPath(location.pathname) },
		});
	},
});
