import { Books } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { JSX } from "react";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
import { Button, buttonVariants } from "@/components/ui/button";
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
		<div className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-2xl border border-border/70 border-dashed bg-card/30 px-6 py-12 text-center">
			<div className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground shadow-card">
				<Books aria-hidden="true" className="size-7" />
			</div>
			<div className="flex max-w-md flex-col gap-1.5">
				<h2 className="text-balance font-semibold text-xl leading-tight">
					{m["home.no_books_title"]()}
				</h2>
				<p className="text-pretty text-muted-foreground text-sm leading-relaxed">
					{canManageLibraries
						? m["home.empty_admin"]()
						: hasOrg
							? m["home.empty_member"]()
							: m["home.empty_no_server"]()}
				</p>
			</div>
			<div className="mt-1 flex flex-wrap justify-center gap-3">
				{canManageLibraries && (
					<Button
						variant="default"
						onClick={() => openOrgSettings("libraries")}
					>
						{m["home.go_library_settings"]()}
					</Button>
				)}
				{!hasOrg && (
					<Link
						to="/dashboard/invitations"
						className={buttonVariants({ variant: "outline" })}
					>
						{m["home.view_invitations"]()}
					</Link>
				)}
			</div>
		</div>
	);
}
