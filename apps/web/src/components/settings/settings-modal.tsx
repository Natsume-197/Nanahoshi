import { useQuery } from "@tanstack/react-query";
import {
	Building2,
	DatabaseZap,
	KeyRound,
	Library,
	ListTodo,
	Server,
	Shield,
	User,
	Users,
	X,
} from "lucide-react";
import { type ComponentType, useRef, useState } from "react";
import type { SettingsSection } from "@/components/settings/settings-sections";
import {
	type SettingsNavGroup,
	SettingsSidebarNav,
} from "@/components/settings/settings-sidebar-nav";
import { DiscordIcon } from "@/components/shared/discord-icon";
import { useWindowEvent } from "@/hooks/use-window-event";
import { authClient } from "@/lib/auth-client";
import { AccountSettings } from "@/routes/dashboard/settings/account";
import { MetadataSourcesSettings } from "@/routes/dashboard/settings/addons/metadata-sources";
import { OrganizationDetailView } from "@/routes/dashboard/settings/admin/organizations.$orgId";
import { AdminOrganizations } from "@/routes/dashboard/settings/admin/organizations.index";
import { AdminSystem } from "@/routes/dashboard/settings/admin/system";
import { AdminTasks } from "@/routes/dashboard/settings/admin/tasks";
import { AdminUsers } from "@/routes/dashboard/settings/admin/users";
import { DiscordAccessRules } from "@/routes/dashboard/settings/organization/discord";
import { OrganizationGeneral } from "@/routes/dashboard/settings/organization/general";
import { LibrariesSettings } from "@/routes/dashboard/settings/organization/libraries";
import { MembersSettings } from "@/routes/dashboard/settings/organization/members";
import { OpdsSettings } from "@/routes/dashboard/settings/organization/opds";
import { ProfileSettings } from "@/routes/dashboard/settings/profile";
import { orpc } from "@/utils/orpc";

const ICONS: Record<SettingsSection, ComponentType<{ className?: string }>> = {
	profile: User,
	account: Shield,
	"org-general": Building2,
	"org-libraries": Library,
	"org-members": Users,
	"org-opds": KeyRound,
	"org-discord": DiscordIcon,
	"addons-metadata": DatabaseZap,
	"admin-system": Server,
	"admin-tasks": ListTodo,
	"admin-users": Users,
	"admin-organizations": Building2,
};

const LABELS: Record<SettingsSection, string> = {
	profile: "Profile",
	account: "Account",
	"org-general": "General",
	"org-libraries": "Libraries",
	"org-members": "Members",
	"org-opds": "OPDS",
	"org-discord": "Discord",
	"addons-metadata": "Metadata Sources",
	"admin-system": "System",
	"admin-tasks": "Tasks",
	"admin-users": "Users",
	"admin-organizations": "Organizations",
};

function buildGroups({
	isAdmin,
	hasOrg,
	isOrgAdmin,
}: {
	isAdmin: boolean;
	hasOrg: boolean;
	isOrgAdmin: boolean;
}): SettingsNavGroup[] {
	const item = (key: SettingsSection) => ({
		key,
		label: LABELS[key],
		icon: ICONS[key],
	});

	const groups: SettingsNavGroup[] = [
		{ label: "User", items: [item("profile"), item("account")] },
	];

	if (hasOrg) {
		groups.push({
			label: "Organization",
			items: [item("org-general"), item("org-libraries"), item("org-members")],
		});

		const accessItems = [item("org-opds")];
		if (isOrgAdmin || isAdmin) accessItems.push(item("org-discord"));
		groups.push({ label: "Access", items: accessItems });
	}

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
	const { data: org } = authClient.useActiveOrganization();
	const isAdmin = session?.user.role === "admin";
	const hasOrg = !!session?.session.activeOrganizationId;

	const { data: myRoleData } = useQuery({
		...orpc.users.getMyRole.queryOptions(),
		enabled: hasOrg,
	});
	const myRole =
		myRoleData?.role ??
		org?.members.find((m) => m.userId === session?.user.id)?.role;
	const isOrgAdmin = !!isAdmin || myRole === "admin" || myRole === "owner";

	const groups = buildGroups({
		isAdmin: !!isAdmin,
		hasOrg,
		isOrgAdmin,
	});

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
	// Admin → Organizations has an in-place list/detail view. Reset the
	// selection whenever we leave the section (render-phase ref tracking).
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
		case "org-general":
			return <OrganizationGeneral />;
		case "org-libraries":
			return <LibrariesSettings />;
		case "org-members":
			return <MembersSettings />;
		case "org-opds":
			return <OpdsSettings />;
		case "org-discord":
			return <DiscordAccessRules />;
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
