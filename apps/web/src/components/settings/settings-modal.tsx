import {
	Buildings,
	Database,
	HardDrives,
	ListChecks,
	PaintBrush,
	Shield,
	Translate,
	User,
	Users,
	X,
} from "@phosphor-icons/react";
import { type ComponentType, useRef, useState } from "react";
import { AccountSettings } from "@/components/settings/sections/account";
import { AppearanceSettings } from "@/components/settings/sections/appearance";
import { LanguageSettings } from "@/components/settings/sections/language";
import { MetadataSourcesSettings } from "@/components/settings/sections/metadata-sources";
import { ProfileSettings } from "@/components/settings/sections/profile";
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
	appearance: PaintBrush,
	language: Translate,
	"addons-metadata": Database,
	"admin-system": HardDrives,
	"admin-tasks": ListChecks,
	"admin-users": Users,
	"admin-servers": Buildings,
};

const LABELS: Record<SettingsSection, () => string> = {
	profile: m["settings.nav.profile"],
	account: m["settings.nav.account"],
	appearance: m["settings.nav.appearance"],
	language: m["settings.nav.language"],
	"addons-metadata": m["settings.nav.metadata_system"],
	"admin-system": m["settings.nav.system"],
	"admin-tasks": m["settings.nav.tasks"],
	"admin-users": m["settings.nav.users"],
	"admin-servers": m["settings.nav.servers"],
};

function buildGroups({ isAdmin }: { isAdmin: boolean }): SettingsNavGroup[] {
	const item = (key: SettingsSection) => ({
		key,
		label: LABELS[key](),
		icon: ICONS[key],
	});

	const groups: SettingsNavGroup[] = [
		{
			label: m["settings.group.user"](),
			items: [
				item("profile"),
				item("account"),
				item("appearance"),
				item("language"),
			],
		},
	];

	if (isAdmin) {
		groups.push({
			label: m["settings.group.addons"](),
			items: [item("addons-metadata")],
		});
		groups.push({
			label: m["settings.group.system"](),
			items: [
				item("admin-system"),
				item("admin-tasks"),
				item("admin-users"),
				item("admin-servers"),
			],
		});
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

	const groups = buildGroups({ isAdmin: !!isAdmin });

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
				className="absolute inset-0 cursor-default bg-black/25"
			/>

			{/* The settings window itself — a floating panel like Discord's. */}
			<div className="zoom-in-95 relative flex h-svh w-full animate-in flex-col overflow-hidden bg-background shadow-2xl duration-200 md:h-[min(92vh,920px)] md:max-w-7xl md:flex-row md:rounded-2xl md:border md:border-border">
				<div className="shrink-0 overflow-y-auto border-border border-b p-4 md:h-full md:w-64 md:border-r md:border-b-0 md:px-5 md:py-6">
					<SettingsSidebarNav
						groups={groups}
						activeKey={section}
						onNavigate={(key) => onNavigate(key as SettingsSection)}
					/>
				</div>

				<main className="relative flex min-w-0 flex-1 flex-col overflow-hidden md:h-full">
					{/* Top bar: active section title on the left, close (X) on the right. */}
					<header className="flex shrink-0 items-center justify-between gap-3 border-border border-b px-6 py-4 lg:px-10">
						<h1 className="truncate font-semibold text-lg">
							{LABELS[section]()}
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
						<div className="mx-auto max-w-5xl px-6 py-8 lg:px-10 lg:py-12">
							<SettingsContent section={section} />
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
		case "appearance":
			return <AppearanceSettings />;
		case "language":
			return <LanguageSettings />;
		case "addons-metadata":
			return <MetadataSourcesSettings />;
		case "admin-system":
			return <AdminSystem />;
		case "admin-tasks":
			return <AdminTasks />;
		case "admin-users":
			return <AdminUsers />;
		default:
			return selectedOrgId ? (
				<ServerDetailView
					orgId={selectedOrgId}
					onBack={() => setSelectedOrgId(null)}
				/>
			) : (
				<AdminServers onSelectOrg={setSelectedOrgId} />
			);
	}
}
