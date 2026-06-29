import {
	Building2,
	DatabaseZap,
	ListTodo,
	Server,
	Shield,
	User,
	Users,
	X,
} from "lucide-react";
import { type ComponentType, useRef, useState } from "react";
import { AccountSettings } from "@/components/settings/sections/account";
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
import { useWindowEvent } from "@/hooks/use-window-event";
import { authClient } from "@/lib/auth-client";

const ICONS: Record<SettingsSection, ComponentType<{ className?: string }>> = {
	profile: User,
	account: Shield,
	"addons-metadata": DatabaseZap,
	"admin-system": Server,
	"admin-tasks": ListTodo,
	"admin-users": Users,
	"admin-servers": Building2,
};

const LABELS: Record<SettingsSection, string> = {
	profile: "Profile",
	account: "Account",
	"addons-metadata": "Metadata (System)",
	"admin-system": "System",
	"admin-tasks": "Tasks",
	"admin-users": "Users",
	"admin-servers": "Servers",
};

function buildGroups({ isAdmin }: { isAdmin: boolean }): SettingsNavGroup[] {
	const item = (key: SettingsSection) => ({
		key,
		label: LABELS[key],
		icon: ICONS[key],
	});

	const groups: SettingsNavGroup[] = [
		{ label: "User", items: [item("profile"), item("account")] },
	];

	if (isAdmin) {
		groups.push({
			label: "Addons",
			items: [item("addons-metadata")],
		});
		groups.push({
			label: "System",
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
	const { data: session } = authClient.useSession();
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
				aria-label="Close settings"
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
							{LABELS[section]}
						</h1>
						<button
							type="button"
							onClick={onClose}
							aria-label="Close settings"
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
