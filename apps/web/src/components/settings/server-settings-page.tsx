import {
	ArrowLeft,
	Books,
	Buildings,
	ChartBar,
	Database,
	Envelope,
	Key,
	Lock,
	Shield,
	Sparkle,
	Users,
} from "@phosphor-icons/react";
import { AccessSettings } from "@/components/settings/sections/access";
import { ServerGeneral } from "@/components/settings/sections/general";
import { InvitationsSettings } from "@/components/settings/sections/invitations";
import { LibrariesSettings } from "@/components/settings/sections/libraries";
import { MembersSettings } from "@/components/settings/sections/members";
import { MetadataOrgSettings } from "@/components/settings/sections/metadata";
import { OpdsSettings } from "@/components/settings/sections/opds";
import { RecommendationsSettings } from "@/components/settings/sections/recommendations";
import { RolesSettings } from "@/components/settings/sections/roles";
import { StatsSettings } from "@/components/settings/sections/stats";
import { resolveVisibleOrgSettingsSection } from "@/components/settings/server-settings-access";
import type {
	OrgSettingsIntent,
	OrgSettingsSection,
} from "@/components/settings/settings-sections";
import type {
	SettingsNavGroup,
	SettingsNavIcon,
} from "@/components/settings/settings-sidebar-nav";
import { SettingsSidebarNav } from "@/components/settings/settings-sidebar-nav";
import { Button } from "@/components/ui/button";
import { useAbilities } from "@/hooks/use-abilities";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";

const ICONS: Record<OrgSettingsSection, SettingsNavIcon> = {
	general: Buildings,
	stats: ChartBar,
	libraries: Books,
	metadata: Database,
	recommendations: Sparkle,
	opds: Key,
	members: Users,
	roles: Shield,
	invitations: Envelope,
	access: Lock,
};

const LABELS: Record<OrgSettingsSection, () => string> = {
	general: m["settings.org.server_profile"],
	stats: m["settings.org.stats"],
	libraries: m["settings.org.libraries"],
	metadata: m["settings.org.metadata"],
	recommendations: m["settings.recs.title"],
	opds: m["settings.org.opds"],
	members: m["settings.org.members"],
	roles: m["settings.org.roles"],
	invitations: m["settings.org.invitations"],
	access: m["settings.org.access"],
};

/**
 * Dedicated server-settings page: the same sections the modal used to own
 * (server profile, libraries, members, roles, …), in the full-page sidebar
 * layout the instance settings use. Rendered at `/dashboard/server/$section`.
 */
export function ServerSettingsPage({
	section,
	intent,
	onNavigate,
	onConsumeIntent,
	onBack,
}: {
	section: OrgSettingsSection;
	intent?: OrgSettingsIntent;
	onNavigate: (section: OrgSettingsSection) => void;
	onConsumeIntent: () => void;
	onBack: () => void;
}) {
	const { can, isOrgOwner } = useAbilities();
	const { data: org } = authClient.useActiveOrganization();

	// Per-section visibility, grouped into the two sidebar categories.
	const canSee: Record<OrgSettingsSection, boolean> = {
		general: isOrgOwner || can("settings", "update"),
		stats: can("settings", "update"),
		libraries:
			can("library", "create") ||
			can("library", "update") ||
			can("library", "delete") ||
			can("library", "scan") ||
			can("library", "managePaths") ||
			can("library", "manageProviders") ||
			can("library", "manageAccess") ||
			can("library", "upload"),
		metadata: can("settings", "update"),
		recommendations: can("settings", "update"),
		opds: can("opds", "access"),
		members:
			can("member", "list") ||
			can("member", "invite") ||
			can("member", "remove"),
		roles: can("roles", "manage"),
		invitations: can("member", "invite"),
		access: can("settings", "update"),
	};

	const groups: SettingsNavGroup[] = [
		{
			label: org?.name?.trim() || m["settings.org.group_server"](),
			items: ["general", "stats"]
				.filter((key) => canSee[key as OrgSettingsSection])
				.map((key) => ({
					key,
					label: LABELS[key as OrgSettingsSection](),
					icon: ICONS[key as OrgSettingsSection],
				})),
		},
		{
			label: m["settings.org.group_content"](),
			items: ["libraries", "metadata", "recommendations", "opds"]
				.filter((key) => canSee[key as OrgSettingsSection])
				.map((key) => ({
					key,
					label: LABELS[key as OrgSettingsSection](),
					icon: ICONS[key as OrgSettingsSection],
				})),
		},
		{
			label: m["settings.org.group_people_access"](),
			items: ["members", "roles", "invitations", "access"]
				.filter((key) => canSee[key as OrgSettingsSection])
				.map((key) => ({
					key,
					label: LABELS[key as OrgSettingsSection](),
					icon: ICONS[key as OrgSettingsSection],
				})),
		},
	].filter((group) => group.items.length > 0);

	const visibleSection = resolveVisibleOrgSettingsSection(section, canSee);

	// A deep-link intent fires its section action once: drop it from the URL so
	// leaving and returning to the section doesn't re-fire it.
	useMountEffect(() => {
		if (intent) onConsumeIntent();
	});

	if (!visibleSection) return null;

	return (
		<div className="min-h-full md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
			<aside className="theme-gradient-surface border-border border-b bg-sidebar px-3 py-4 text-sidebar-foreground md:sticky md:top-0 md:h-[calc(100dvh-var(--desktop-player-offset))] md:overflow-y-auto md:border-e md:border-b-0 md:px-4 md:py-6">
				<div className="mb-5 flex items-center gap-2 px-1">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="shrink-0 rounded-full"
						onClick={onBack}
						aria-label={m["settings.back_to_dashboard"]()}
					>
						<ArrowLeft aria-hidden="true" />
					</Button>
					<h1 className="truncate font-semibold text-lg">
						{org?.name?.trim() || m["settings.org.group_server"]()}
					</h1>
				</div>
				<SettingsSidebarNav
					groups={groups}
					activeKey={visibleSection}
					onNavigate={(key) => onNavigate(key as OrgSettingsSection)}
				/>
			</aside>

			<div className="min-w-0 px-4 py-6 sm:px-6 md:px-8 md:py-8 lg:px-12 lg:py-10">
				<header className="mx-auto mb-6 w-full max-w-5xl border-border border-b pb-4">
					<h2 className="font-semibold text-2xl">{LABELS[visibleSection]()}</h2>
				</header>
				<div className="mx-auto w-full max-w-5xl">
					<OrgSettingsContent section={visibleSection} intent={intent} />
				</div>
			</div>
		</div>
	);
}

function OrgSettingsContent({
	section,
	intent,
}: {
	section: OrgSettingsSection;
	intent?: OrgSettingsIntent;
}) {
	switch (section) {
		case "general":
			return <ServerGeneral />;
		case "stats":
			return <StatsSettings />;
		case "libraries":
			return (
				<LibrariesSettings openWizardOnMount={intent === "create-library"} />
			);
		case "metadata":
			return <MetadataOrgSettings />;
		case "recommendations":
			return <RecommendationsSettings />;
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
