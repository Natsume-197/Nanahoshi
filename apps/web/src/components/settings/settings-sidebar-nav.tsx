import { Link, useLocation } from "@tanstack/react-router";
import {
	BookOpen,
	Building2,
	Library,
	ListTodo,
	Server,
	Shield,
	User,
	Users,
} from "lucide-react";
import { DiscordIcon } from "@/components/shared/discord-icon";
import { cn } from "@/lib/utils";

interface SettingsSidebarNavProps {
	isAdmin: boolean;
	hasOrg: boolean;
	isOrgAdmin: boolean;
}

const organizationItems = [
	{
		label: "General",
		to: "/dashboard/settings/organization/general",
		icon: Building2,
	},
	{
		label: "Libraries",
		to: "/dashboard/settings/organization/libraries",
		icon: Library,
	},
	{
		label: "Members",
		to: "/dashboard/settings/organization/members",
		icon: Users,
	},
	{
		label: "Discord Access",
		to: "/dashboard/settings/organization/discord",
		icon: DiscordIcon,
		adminOnly: true,
	},
] as const;

const userItems = [
	{ label: "Profile", to: "/dashboard/settings/profile", icon: User },
	{ label: "Account", to: "/dashboard/settings/account", icon: Shield },
] as const;

const adminItems = [
	{
		label: "System",
		to: "/dashboard/settings/admin/system",
		icon: Server,
	},
	{
		label: "Tasks",
		to: "/dashboard/settings/admin/tasks",
		icon: ListTodo,
	},
	{ label: "Users", to: "/dashboard/settings/admin/users", icon: Users },
	{
		label: "Organizations",
		to: "/dashboard/settings/admin/organizations",
		icon: Building2,
	},
	{
		label: "Metadata",
		to: "/dashboard/settings/admin/metadata",
		icon: BookOpen,
	},
] as const;

function NavGroup({
	label,
	items,
	pathname,
}: {
	label: string;
	items: ReadonlyArray<{
		label: string;
		to: string;
		icon: typeof User;
	}>;
	pathname: string;
}) {
	return (
		<div className="space-y-1">
			<p className="px-3 font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
				{label}
			</p>
			<ul className="space-y-0.5">
				{items.map((item) => {
					const isActive = pathname.startsWith(item.to);
					return (
						<li key={item.to}>
							<Link
								to={item.to}
								className={cn(
									"flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
									isActive
										? "bg-accent font-medium text-foreground"
										: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
								)}
							>
								<item.icon className="size-4" />
								{item.label}
							</Link>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

export function SettingsSidebarNav({
	isAdmin,
	hasOrg,
	isOrgAdmin,
}: SettingsSidebarNavProps) {
	const { pathname } = useLocation();
	const visibleOrgItems = organizationItems.filter(
		(item) => !("adminOnly" in item && item.adminOnly) || isOrgAdmin || isAdmin,
	);

	return (
		<>
			{/* Desktop sidebar */}
			<nav className="hidden shrink-0 md:block md:w-52">
				<div className="space-y-6">
					<NavGroup label="User" items={userItems} pathname={pathname} />
					{hasOrg && (
						<NavGroup
							label="Organization"
							items={visibleOrgItems}
							pathname={pathname}
						/>
					)}
					{isAdmin && (
						<NavGroup label="Admin" items={adminItems} pathname={pathname} />
					)}
				</div>
			</nav>

			{/* Mobile horizontal nav */}
			<nav className="flex gap-1 overflow-x-auto border-border border-b pb-2 md:hidden">
				{[
					...userItems,
					...(hasOrg ? visibleOrgItems : []),
					...(isAdmin ? adminItems : []),
				].map((item) => {
					const isActive = pathname.startsWith(item.to);
					return (
						<Link
							key={item.to}
							to={item.to}
							className={cn(
								"flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
								isActive
									? "bg-accent font-medium text-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							<item.icon className="size-4" />
							{item.label}
						</Link>
					);
				})}
			</nav>
		</>
	);
}
