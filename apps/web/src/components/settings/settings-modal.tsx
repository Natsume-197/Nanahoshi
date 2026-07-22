import {
	Buildings,
	Database,
	HardDrives,
	ListChecks,
	LockKey,
	PaintBrush,
	PlugsConnected,
	Shield,
	Translate,
	User,
	UserPlus,
	Users,
	X,
} from "@phosphor-icons/react";
import { type ComponentType, useRef, useState } from "react";
import { AccountSettings } from "@/components/settings/sections/account";
import { AppearanceSettings } from "@/components/settings/sections/appearance";
import { IntegrationsSettings } from "@/components/settings/sections/integrations";
import { LanguageSettings } from "@/components/settings/sections/language";
import { MetadataSourcesSettings } from "@/components/settings/sections/metadata-sources";
import { PrivacySettings } from "@/components/settings/sections/privacy";
import { ProfileSettings } from "@/components/settings/sections/profile";
import { RegistrationSettings } from "@/components/settings/sections/registration";
import { ServerDetailView } from "@/components/settings/sections/server-detail-view";
import { AdminServers } from "@/components/settings/sections/servers";
import { AdminSystem } from "@/components/settings/sections/system";
import { AdminTasks } from "@/components/settings/sections/tasks";
import { AdminUsers } from "@/components/settings/sections/users";
import type { SettingsSection } from "@/components/settings/settings-sections";
import {
	type SettingsNavGroup,
	SettingsSidebarNav,
} from "@/components/settings/settings-sidebar-nav";
import { useSession } from "@/hooks/use-session";
import { useWindowEvent } from "@/hooks/use-window-event";
import { m } from "@/paraglide/messages";

const ICONS: Record<SettingsSection, ComponentType<{ className?: string }>> = {
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
};

const ADMIN_SECTIONS: ReadonlySet<SettingsSection> = new Set([
	"overview",
	"users",
	"servers",
	"registration",
	"metadata",
	"tasks",
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
				items: [item("metadata"), item("tasks")],
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

	useWindowEvent("keydown", (event) => {
		if (event.key === "Escape") onClose();
	});

	return (
		<div className="fade-in-0 fixed inset-0 z-50 flex animate-in items-center justify-center duration-150 md:p-6 lg:p-10">
			{/* Dimmed backdrop — clicking outside the window closes it. */}
			<button
				type="button"
				aria-label={m["settings.close"]()}
				onClick={onClose}
				className="absolute inset-0 cursor-default bg-black/50"
			/>

			{/* The settings window itself — a floating panel like Discord's. */}
			<div className="theme-gradient-surface zoom-in-95 relative flex h-dvh w-full animate-in flex-col overflow-hidden bg-background pt-[var(--safe-area-top)] pr-[var(--safe-area-right)] pb-[var(--safe-area-bottom)] pl-[var(--safe-area-left)] text-popover-foreground shadow-2xl duration-200 md:h-[min(92vh,920px)] md:max-w-6xl md:flex-row md:rounded-2xl md:border md:border-border">
				<div className="shrink-0 overflow-y-auto border-border border-b p-4 md:h-full md:w-64 md:border-r md:border-b-0 md:px-5 md:py-6">
					<SettingsSidebarNav
						groups={groups}
						activeKey={visibleSection}
						onNavigate={(key) => onNavigate(key as SettingsSection)}
					/>
				</div>

				<main className="relative flex min-w-0 flex-1 flex-col overflow-hidden md:h-full">
					{/* Top bar: active section title on the left, close (X) on the right. */}
					<header className="flex shrink-0 items-center justify-between gap-3 border-border border-b px-4 py-3.5 lg:px-6">
						<h1 className="truncate font-semibold text-lg">
							{LABELS[visibleSection]()}
						</h1>
						<button
							type="button"
							onClick={onClose}
							aria-label={m["settings.close"]()}
							className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
						>
							<X className="size-5" />
						</button>
					</header>

					<div className="flex-1 overflow-y-auto">
						<div className="max-w-5xl px-6 pt-5 pb-8 lg:px-12 lg:pt-10 lg:pb-10">
							<SettingsContent section={visibleSection} />
						</div>
					</div>
				</main>
			</div>
		</div>
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
	}
}
