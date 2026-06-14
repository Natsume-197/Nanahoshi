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
import { OrganizationDetailView } from "@/components/settings/sections/organization-detail-view";
import { AdminOrganizations } from "@/components/settings/sections/organizations";
import { ProfileSettings } from "@/components/settings/sections/profile";
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
	"admin-organizations": Building2,
};

const LABELS: Record<SettingsSection, string> = {
	profile: "Profile",
	account: "Account",
	"addons-metadata": "Metadata Sources",
	"admin-system": "System",
	"admin-tasks": "Tasks",
	"admin-users": "Users",
	"admin-organizations": "Organizations",
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
				item("admin-organizations"),
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
			<div className="zoom-in-95 relative flex h-svh w-full animate-in flex-col overflow-hidden bg-background shadow-2xl duration-200 md:h-[min(88vh,820px)] md:max-w-6xl md:flex-row md:rounded-2xl md:border md:border-border">
				<div className="shrink-0 overflow-y-auto border-border border-b p-4 md:h-full md:w-64 md:border-r md:border-b-0 md:px-5 md:py-6">
					<SettingsSidebarNav
						groups={groups}
						activeKey={section}
						onNavigate={(key) => onNavigate(key as SettingsSection)}
					/>
				</div>

				<main className="relative min-w-0 flex-1 overflow-y-auto md:h-full">
					{/* Discord-style close affordance pinned to the top-right corner. */}
					<button
						type="button"
						onClick={onClose}
						aria-label="Close settings"
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
						<SettingsContent section={section} />
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
				<OrganizationDetailView
					orgId={selectedOrgId}
					onBack={() => setSelectedOrgId(null)}
				/>
			) : (
				<AdminOrganizations onSelectOrg={setSelectedOrgId} />
			);
	}
}
