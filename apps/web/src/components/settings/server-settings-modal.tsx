import {
	Building2,
	KeyRound,
	Library,
	Lock,
	Mail,
	Shield,
	Users,
	X,
} from "lucide-react";
import type { ComponentType } from "react";
import { AccessSettings } from "@/components/settings/sections/access";
import { ServerGeneral } from "@/components/settings/sections/general";
import { InvitationsSettings } from "@/components/settings/sections/invitations";
import { LibrariesSettings } from "@/components/settings/sections/libraries";
import { MembersSettings } from "@/components/settings/sections/members";
import { OpdsSettings } from "@/components/settings/sections/opds";
import { RolesSettings } from "@/components/settings/sections/roles";
import {
	type SettingsNavGroup,
	SettingsSidebarNav,
} from "@/components/settings/settings-sidebar-nav";
import { useAbilities } from "@/hooks/use-abilities";
import { useWindowEvent } from "@/hooks/use-window-event";

const ORG_SETTINGS_SECTIONS = [
	"general",
	"libraries",
	"opds",
	"members",
	"roles",
	"invitations",
	"access",
] as const;

export type OrgSettingsSection = (typeof ORG_SETTINGS_SECTIONS)[number];

const ICONS: Record<
	OrgSettingsSection,
	ComponentType<{ className?: string }>
> = {
	general: Building2,
	libraries: Library,
	opds: KeyRound,
	members: Users,
	roles: Shield,
	invitations: Mail,
	access: Lock,
};

const LABELS: Record<OrgSettingsSection, string> = {
	general: "General",
	libraries: "Libraries",
	opds: "OPDS",
	members: "Members",
	roles: "Roles",
	invitations: "Invitations",
	access: "Access",
};

export function ServerSettingsModal({
	section,
	onNavigate,
	onClose,
}: {
	section: OrgSettingsSection;
	onNavigate: (section: OrgSettingsSection) => void;
	onClose: () => void;
}) {
	const { can, isOrgOwner } = useAbilities();

	useWindowEvent("keydown", (event) => {
		if (event.key === "Escape") onClose();
	});

	// Per-section visibility, grouped into the two sidebar categories.
	const canSee: Record<OrgSettingsSection, boolean> = {
		general: isOrgOwner || can("settings", "update"),
		libraries: can("library", "create") || can("library", "manageAccess"),
		opds: can("opds", "access"),
		members:
			can("member", "list") ||
			can("member", "invite") ||
			can("member", "remove"),
		roles: can("roles", "manage"),
		invitations: can("member", "invite"),
		access: can("settings", "update"),
	};

	const categories: { label: string; keys: OrgSettingsSection[] }[] = [
		{ label: "Server", keys: ["general", "libraries", "opds"] },
		{ label: "People", keys: ["members", "roles", "invitations", "access"] },
	];

	const groups: SettingsNavGroup[] = categories
		.map((category) => ({
			label: category.label,
			items: category.keys
				.filter((key) => canSee[key])
				.map((key) => ({ key, label: LABELS[key], icon: ICONS[key] })),
		}))
		.filter((group) => group.items.length > 0);

	return (
		<div className="fade-in-0 fixed inset-0 z-50 flex animate-in items-center justify-center duration-150 md:p-6 lg:p-10">
			<button
				type="button"
				aria-label="Close server settings"
				onClick={onClose}
				className="absolute inset-0 cursor-default bg-black/25"
			/>

			<div className="zoom-in-95 relative flex h-svh w-full animate-in flex-col overflow-hidden bg-background shadow-2xl duration-200 md:h-[min(92vh,920px)] md:max-w-7xl md:flex-row md:rounded-2xl md:border md:border-border">
				<div className="shrink-0 overflow-y-auto border-border border-b p-4 md:h-full md:w-64 md:border-r md:border-b-0 md:px-5 md:py-6">
					<SettingsSidebarNav
						groups={groups}
						activeKey={section}
						onNavigate={(key) => onNavigate(key as OrgSettingsSection)}
					/>
				</div>

				<main className="relative flex min-w-0 flex-1 flex-col overflow-hidden md:h-full">
					{/* Top bar: active section title on the left, close (X) on the right. */}
					<header className="flex shrink-0 items-center justify-between gap-3 border-border border-b px-6 py-4 lg:px-10">
						<h1 className="truncate font-semibold text-lg">
							{LABELS[section]}
						</h1>
						<button
							type="button"
							onClick={onClose}
							aria-label="Close server settings"
							className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
						>
							<X className="size-5" />
						</button>
					</header>

					<div className="flex-1 overflow-y-auto">
						<div className="mx-auto max-w-5xl px-6 py-8 lg:px-10 lg:py-12">
							<OrgSettingsContent section={section} />
						</div>
					</div>
				</main>
			</div>
		</div>
	);
}

function OrgSettingsContent({ section }: { section: OrgSettingsSection }) {
	switch (section) {
		case "general":
			return <ServerGeneral />;
		case "libraries":
			return <LibrariesSettings />;
		case "opds":
			return <OpdsSettings />;
		case "members":
			return <MembersSettings />;
		case "roles":
			return <RolesSettings />;
		case "invitations":
			return <InvitationsSettings />;
		case "access":
			return <AccessSettings />;
	}
}
