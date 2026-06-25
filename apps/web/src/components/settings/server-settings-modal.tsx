import { Building2, KeyRound, Library, Shield, Users, X } from "lucide-react";
import type { ComponentType } from "react";
import { DiscordAccessRules } from "@/components/settings/sections/discord";
import { ServerGeneral } from "@/components/settings/sections/general";
import { LibrariesSettings } from "@/components/settings/sections/libraries";
import { MembersSettings } from "@/components/settings/sections/members";
import { OpdsSettings } from "@/components/settings/sections/opds";
import { RolesSettings } from "@/components/settings/sections/roles";
import {
	type SettingsNavGroup,
	SettingsSidebarNav,
} from "@/components/settings/settings-sidebar-nav";
import { DiscordIcon } from "@/components/shared/discord-icon";
import { useAbilities } from "@/hooks/use-abilities";
import { useWindowEvent } from "@/hooks/use-window-event";

const ORG_SETTINGS_SECTIONS = [
	"general",
	"libraries",
	"members",
	"roles",
	"opds",
	"discord",
] as const;

export type OrgSettingsSection = (typeof ORG_SETTINGS_SECTIONS)[number];

const ICONS: Record<
	OrgSettingsSection,
	ComponentType<{ className?: string }>
> = {
	general: Building2,
	libraries: Library,
	members: Users,
	roles: Shield,
	opds: KeyRound,
	discord: DiscordIcon,
};

const LABELS: Record<OrgSettingsSection, string> = {
	general: "General",
	libraries: "Libraries",
	members: "Members",
	roles: "Roles",
	opds: "OPDS",
	discord: "Discord",
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

	const visible: OrgSettingsSection[] = (
		[
			["general", isOrgOwner || can("settings", "update")],
			["libraries", can("library", "create") || can("library", "manageAccess")],
			[
				"members",
				can("member", "list") ||
					can("member", "invite") ||
					can("member", "remove"),
			],
			["roles", can("roles", "manage")],
			["opds", can("opds", "access")],
			["discord", can("settings", "update")],
		] as const
	)
		.filter(([, show]) => show)
		.map(([key]) => key);

	const groups: SettingsNavGroup[] = [
		{
			label: "Server",
			items: visible.map((key) => ({
				key,
				label: LABELS[key],
				icon: ICONS[key],
			})),
		},
	];

	return (
		<div className="fade-in-0 fixed inset-0 z-50 flex animate-in items-center justify-center duration-150 md:p-6 lg:p-10">
			<button
				type="button"
				aria-label="Close server settings"
				onClick={onClose}
				className="absolute inset-0 cursor-default bg-black/25"
			/>

			<div className="zoom-in-95 relative flex h-svh w-full animate-in flex-col overflow-hidden bg-background shadow-2xl duration-200 md:h-[min(88vh,820px)] md:max-w-6xl md:flex-row md:rounded-2xl md:border md:border-border">
				<div className="shrink-0 overflow-y-auto border-border border-b p-4 md:h-full md:w-64 md:border-r md:border-b-0 md:px-5 md:py-6">
					<SettingsSidebarNav
						groups={groups}
						activeKey={section}
						onNavigate={(key) => onNavigate(key as OrgSettingsSection)}
					/>
				</div>

				<main className="relative min-w-0 flex-1 overflow-y-auto md:h-full">
					<button
						type="button"
						onClick={onClose}
						aria-label="Close server settings"
						className="group absolute top-4 right-4 z-10 flex flex-col items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
					>
						<span className="flex size-9 items-center justify-center rounded-full border border-border/60 transition-colors group-hover:border-foreground/40 group-hover:bg-accent/50">
							<X className="size-5" />
						</span>
						<span className="hidden font-medium text-[10px] uppercase tracking-wide md:block">
							Esc
						</span>
					</button>

					<div className="mx-auto max-w-4xl px-6 py-8 lg:px-10 lg:py-12">
						<OrgSettingsContent section={section} />
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
		case "members":
			return <MembersSettings />;
		case "roles":
			return <RolesSettings />;
		case "opds":
			return <OpdsSettings />;
		case "discord":
			return <DiscordAccessRules />;
	}
}
