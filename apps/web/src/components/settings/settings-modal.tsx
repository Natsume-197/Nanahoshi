import {
	Buildings,
	Database,
	HardDrives,
	ListChecks,
	ListMagnifyingGlass,
	LockKey,
	PaintBrush,
	PlugsConnected,
	Shield,
	Translate,
	User,
	UserPlus,
	Users,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { AccountSettings } from "@/components/settings/sections/account";
import { AppearanceSettings } from "@/components/settings/sections/appearance";
import { IntegrationsSettings } from "@/components/settings/sections/integrations";
import { LanguageSettings } from "@/components/settings/sections/language";
import { AdminLogs } from "@/components/settings/sections/logs";
import { MetadataSourcesSettings } from "@/components/settings/sections/metadata-sources";
import { PrivacySettings } from "@/components/settings/sections/privacy";
import { ProfileSettings } from "@/components/settings/sections/profile";
import { RegistrationSettings } from "@/components/settings/sections/registration";
import { ServerDetailView } from "@/components/settings/sections/server-detail-view";
import { AdminServers } from "@/components/settings/sections/servers";
import { AdminSystem } from "@/components/settings/sections/system";
import { AdminTasks } from "@/components/settings/sections/tasks";
import { AdminUsers } from "@/components/settings/sections/users";
import { SettingsDialogShell } from "@/components/settings/settings-dialog-shell";
import type { SettingsSection } from "@/components/settings/settings-sections";
import type {
	SettingsNavGroup,
	SettingsNavIcon,
} from "@/components/settings/settings-sidebar-nav";
import { useSession } from "@/hooks/use-session";
import { m } from "@/paraglide/messages";

const ICONS: Record<SettingsSection, SettingsNavIcon> = {
	profile: User,
	account: Shield,
	privacy: LockKey,
	integrations: PlugsConnected,
	appearance: PaintBrush,
	language: Translate,
	overview: HardDrives,
	users: Users,
	servers: Buildings,
	registration: UserPlus,
	metadata: Database,
	tasks: ListChecks,
	logs: ListMagnifyingGlass,
};

const LABELS: Record<SettingsSection, () => string> = {
	profile: m["settings.nav.profile"],
	account: m["settings.nav.account"],
	privacy: m["settings.nav.privacy"],
	integrations: m["settings.nav.integrations"],
	appearance: m["settings.nav.appearance"],
	language: m["settings.nav.language"],
	overview: m["settings.nav.overview"],
	users: m["settings.nav.users"],
	servers: m["settings.nav.servers"],
	registration: m["settings.nav.registration"],
	metadata: m["settings.nav.metadata_system"],
	tasks: m["settings.nav.tasks"],
	logs: m["settings.nav.logs"],
};

const ADMIN_SECTIONS: ReadonlySet<SettingsSection> = new Set([
	"overview",
	"users",
	"servers",
	"registration",
	"metadata",
	"tasks",
	"logs",
]);

function buildGroups({ isAdmin }: { isAdmin: boolean }): SettingsNavGroup[] {
	const item = (key: SettingsSection) => ({
		key,
		label: LABELS[key](),
		icon: ICONS[key],
	});

	const groups: SettingsNavGroup[] = [
		{
			label: m["settings.group.account"](),
			items: [
				item("profile"),
				item("account"),
				item("privacy"),
				item("integrations"),
			],
		},
		{
			label: m["settings.group.preferences"](),
			items: [item("appearance"), item("language")],
		},
	];

	if (isAdmin) {
		groups.push(
			{
				label: m["settings.group.instance"](),
				items: [
					item("overview"),
					item("users"),
					item("servers"),
					item("registration"),
				],
			},
			{
				label: m["settings.group.operations"](),
				items: [item("metadata"), item("tasks"), item("logs")],
			},
		);
	}

	return groups;
}

export function SettingsModal({
	section,
	onNavigate,
	onClose,
}: {
	section: SettingsSection;
	onNavigate: (section: SettingsSection) => void;
	onClose: () => void;
}) {
	const { data: session } = useSession();
	const isAdmin = session?.user.role === "admin";
	const visibleSection =
		!isAdmin && ADMIN_SECTIONS.has(section) ? "profile" : section;
	const groups = buildGroups({ isAdmin });

	return (
		<SettingsDialogShell
			title={LABELS[visibleSection]()}
			closeLabel={m["settings.close"]()}
			groups={groups}
			activeKey={visibleSection}
			onNavigate={(key) => onNavigate(key as SettingsSection)}
			onClose={onClose}
			surfaceClassName="theme-gradient-surface"
		>
			<SettingsContent section={visibleSection} />
		</SettingsDialogShell>
	);
}

function SettingsContent({ section }: { section: SettingsSection }) {
	const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
	const prevSectionRef = useRef(section);
	if (section !== prevSectionRef.current) {
		prevSectionRef.current = section;
		if (selectedOrgId !== null) setSelectedOrgId(null);
	}

	switch (section) {
		case "profile":
			return <ProfileSettings />;
		case "account":
			return <AccountSettings />;
		case "privacy":
			return <PrivacySettings />;
		case "integrations":
			return <IntegrationsSettings />;
		case "appearance":
			return <AppearanceSettings />;
		case "language":
			return <LanguageSettings />;
		case "overview":
			return <AdminSystem />;
		case "users":
			return <AdminUsers />;
		case "servers":
			return selectedOrgId ? (
				<ServerDetailView
					orgId={selectedOrgId}
					onBack={() => setSelectedOrgId(null)}
				/>
			) : (
				<AdminServers onSelectOrg={setSelectedOrgId} />
			);
		case "registration":
			return <RegistrationSettings />;
		case "metadata":
			return <MetadataSourcesSettings />;
		case "tasks":
			return <AdminTasks />;
		case "logs":
			return <AdminLogs />;
	}
}
