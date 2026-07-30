import {
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
import { SettingsDialogShell } from "@/components/settings/settings-dialog-shell";
import type {
	SettingsNavGroup,
	SettingsNavIcon,
} from "@/components/settings/settings-sidebar-nav";
import { useAbilities } from "@/hooks/use-abilities";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";

const ORG_SETTINGS_SECTIONS = [
	"general",
	"stats",
	"libraries",
	"metadata",
	"recommendations",
	"opds",
	"members",
	"roles",
	"invitations",
	"access",
] as const;

export type OrgSettingsSection = (typeof ORG_SETTINGS_SECTIONS)[number];

/** Deep-link action to perform on open, beyond just showing the section. */
export type OrgSettingsIntent = "create-library";

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

export function ServerSettingsModal({
	section,
	intent,
	onNavigate,
	onClose,
}: {
	section: OrgSettingsSection;
	intent?: OrgSettingsIntent;
	onNavigate: (section: OrgSettingsSection) => void;
	onClose: () => void;
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

	const categories: { label: string; keys: OrgSettingsSection[] }[] = [
		{
			label: org?.name?.trim() || m["settings.org.group_server"](),
			keys: ["general", "stats"],
		},
		{
			label: m["settings.org.group_content"](),
			keys: ["libraries", "metadata", "recommendations", "opds"],
		},
		{
			label: m["settings.org.group_people_access"](),
			keys: ["members", "roles", "invitations", "access"],
		},
	];

	const groups: SettingsNavGroup[] = categories
		.map((category) => ({
			label: category.label,
			items: category.keys
				.filter((key) => canSee[key])
				.map((key) => ({ key, label: LABELS[key](), icon: ICONS[key] })),
		}))
		.filter((group) => group.items.length > 0);

	return (
		<SettingsDialogShell
			title={LABELS[section]()}
			closeLabel={m["settings.org.close"]()}
			groups={groups}
			activeKey={section}
			onNavigate={(key) => onNavigate(key as OrgSettingsSection)}
			onClose={onClose}
		>
			<OrgSettingsContent section={section} intent={intent} />
		</SettingsDialogShell>
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
