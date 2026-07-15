import { Link } from "@tanstack/react-router";
import type { JSX } from "react";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
import { Button } from "@/components/ui/button";
import { useAbilities } from "@/hooks/use-abilities";
import { useSession } from "@/hooks/use-session";
import { m } from "@/paraglide/messages";

/** Home empty state: tells a new admin the next step (create a library) and
 * members/guests why there's nothing to see yet. */
export function EmptyLibraryNotice(): JSX.Element {
	const { data: session } = useSession();
	const { can } = useAbilities();
	const { openOrgSettings } = useSettingsModal();

	const hasOrg = !!session?.session.activeOrganizationId;
	const canManageLibraries = can("library", "create");

	return (
		<div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-border/70 border-dashed bg-card/30 px-6 text-center">
			<div className="flex flex-col gap-1">
				<h2 className="font-semibold text-lg">{m["home.no_books_title"]()}</h2>
				<p className="max-w-md text-muted-foreground text-sm">
					{canManageLibraries
						? m["home.empty_admin"]()
						: hasOrg
							? m["home.empty_member"]()
							: m["home.empty_no_server"]()}
				</p>
			</div>
			<div className="mt-2 flex gap-2">
				{canManageLibraries && (
					<Button
						variant="outline"
						size="sm"
						onClick={() => openOrgSettings("libraries")}
					>
						{m["home.go_library_settings"]()}
					</Button>
				)}
				{!hasOrg && (
					<Link to="/dashboard/invitations">
						<Button variant="outline" size="sm">
							{m["home.view_invitations"]()}
						</Button>
					</Link>
				)}
			</div>
		</div>
	);
}
