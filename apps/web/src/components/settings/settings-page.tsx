import {
	ArrowLeft,
	Buildings,
	Database,
	HardDrives,
	ListChecks,
	ListMagnifyingGlass,
	LockKey,
	MonitorPlay,
	PaintBrush,
	PlugsConnected,
	Shield,
	Translate,
	User,
	UserPlus,
	Users,
	Waveform,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { AccountSettings } from "@/components/settings/sections/account";
import { AppearanceSettings } from "@/components/settings/sections/appearance";
import { HonomiyaSettings } from "@/components/settings/sections/honomiya";
import { InstanceActivitySettings } from "@/components/settings/sections/instance-activity";
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
import { ThemeCustomizerShell } from "@/components/settings/settings-dialog-shell";
import type { SettingsSection } from "@/components/settings/settings-sections";
import type {
	SettingsNavGroup,
	SettingsNavIcon,
} from "@/components/settings/settings-sidebar-nav";
import { SettingsSidebarNav } from "@/components/settings/settings-sidebar-nav";
import { Button } from "@/components/ui/button";
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
	honomiya: Waveform,
	tasks: ListChecks,
	logs: ListMagnifyingGlass,
	activity: MonitorPlay,
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
	honomiya: m["settings.nav.honomiya"],
	tasks: m["settings.nav.tasks"],
	logs: m["settings.nav.logs"],
	activity: m["settings.nav.activity"],
};

const ADMIN_SECTIONS: ReadonlySet<SettingsSection> = new Set([
	"overview",
	"users",
	"servers",
	"registration",
	"metadata",
	"honomiya",
	"tasks",
	"logs",
	"activity",
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
				items: [
					item("metadata"),
					item("honomiya"),
					item("tasks"),
					item("logs"),
					item("activity"),
				],
			},
		);
	}

	return groups;
}

export function SettingsPage({
	section,
	onNavigate,
	onBack,
}: {
	section: SettingsSection;
	onNavigate: (section: SettingsSection) => void;
	onBack: () => void;
}) {
	const { data: session } = useSession();
	const isAdmin = session?.user.role === "admin";
	const visibleSection =
		!isAdmin && ADMIN_SECTIONS.has(section) ? "profile" : section;
	const groups = buildGroups({ isAdmin });
	const [themeCustomizerOpen, setThemeCustomizerOpen] = useState(false);

	return (
		<>
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
						<h1 className="font-semibold text-lg">{m["nav.settings"]()}</h1>
					</div>
					<SettingsSidebarNav
						groups={groups}
						activeKey={visibleSection}
						onNavigate={(key) => onNavigate(key as SettingsSection)}
					/>
				</aside>

				<div className="min-w-0 px-4 py-6 sm:px-6 md:px-8 md:py-8 lg:px-12 lg:py-10">
					<header className="mx-auto mb-6 w-full max-w-5xl border-border border-b pb-4">
						<h2 className="font-semibold text-2xl">
							{LABELS[visibleSection]()}
						</h2>
					</header>
					<div className="mx-auto w-full max-w-5xl">
						<SettingsContent
							section={visibleSection}
							onCustomizeTheme={() => setThemeCustomizerOpen(true)}
						/>
					</div>
				</div>
			</div>

			{themeCustomizerOpen && (
				<ThemeCustomizerShell onClose={() => setThemeCustomizerOpen(false)}>
					<AppearanceSettings customizer />
				</ThemeCustomizerShell>
			)}
		</>
	);
}

function SettingsContent({
	section,
	onCustomizeTheme,
}: {
	section: SettingsSection;
	onCustomizeTheme: () => void;
}) {
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
			return <AppearanceSettings onCustomize={onCustomizeTheme} />;
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
		case "honomiya":
			return <HonomiyaSettings />;
		case "tasks":
			return <AdminTasks />;
		case "logs":
			return <AdminLogs />;
		case "activity":
			return <InstanceActivitySettings />;
	}
}
