import { Link, useLocation } from "@tanstack/react-router";
import {
	Building2,
	DatabaseZap,
	KeyRound,
	Library,
	ListTodo,
	Menu,
	Server,
	Shield,
	User,
	Users,
} from "lucide-react";
import { useState } from "react";
import { DiscordIcon } from "@/components/shared/discord-icon";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
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
] as const;

const accessItems = [
	{
		label: "OPDS",
		to: "/dashboard/settings/organization/opds",
		icon: KeyRound,
	},
	{
		label: "Discord",
		to: "/dashboard/settings/organization/discord",
		icon: DiscordIcon,
		adminOnly: true,
	},
] as const;

const userItems = [
	{ label: "Profile", to: "/dashboard/settings/profile", icon: User },
	{ label: "Account", to: "/dashboard/settings/account", icon: Shield },
] as const;

const addonsItems = [
	{
		label: "Metadata Sources",
		to: "/dashboard/settings/addons/metadata-sources",
		icon: DatabaseZap,
	},
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

function NavGroupSheet({
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
							<SheetClose
								render={
									<Link
										to={item.to}
										className={cn(
											"flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
											isActive
												? "bg-accent font-medium text-foreground"
												: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
										)}
									/>
								}
							>
								<item.icon className="size-4" />
								{item.label}
							</SheetClose>
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
	const [mobileOpen, setMobileOpen] = useState(false);
	const visibleAccessItems = accessItems.filter(
		(item) => !("adminOnly" in item && item.adminOnly) || isOrgAdmin || isAdmin,
	);

	const allItems = [
		...userItems,
		...organizationItems,
		...accessItems,
		...addonsItems,
		...adminItems,
	];
	const activeItem = allItems.find((item) => pathname.startsWith(item.to));

	const groups = (
		<>
			<NavGroup label="User" items={userItems} pathname={pathname} />
			{hasOrg && (
				<NavGroup
					label="Organization"
					items={organizationItems}
					pathname={pathname}
				/>
			)}
			{hasOrg && visibleAccessItems.length > 0 && (
				<NavGroup
					label="Access"
					items={visibleAccessItems}
					pathname={pathname}
				/>
			)}
			{isAdmin && (
				<NavGroup label="Addons" items={addonsItems} pathname={pathname} />
			)}
			{isAdmin && (
				<NavGroup label="System" items={adminItems} pathname={pathname} />
			)}
		</>
	);

	const sheetGroups = (
		<>
			<NavGroupSheet label="User" items={userItems} pathname={pathname} />
			{hasOrg && (
				<NavGroupSheet
					label="Organization"
					items={organizationItems}
					pathname={pathname}
				/>
			)}
			{hasOrg && visibleAccessItems.length > 0 && (
				<NavGroupSheet
					label="Access"
					items={visibleAccessItems}
					pathname={pathname}
				/>
			)}
			{isAdmin && (
				<NavGroupSheet label="Addons" items={addonsItems} pathname={pathname} />
			)}
			{isAdmin && (
				<NavGroupSheet label="System" items={adminItems} pathname={pathname} />
			)}
		</>
	);

	return (
		<>
			{/* Desktop sidebar */}
			<nav className="hidden shrink-0 md:block md:w-52">
				<div className="space-y-6">{groups}</div>
			</nav>

			{/* Mobile sheet nav */}
			<div className="md:hidden">
				<Button
					variant="outline"
					className="w-full justify-start gap-2"
					onClick={() => setMobileOpen(true)}
				>
					<Menu className="size-4" />
					{activeItem?.label ?? "Settings"}
				</Button>
				<Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
					<SheetContent side="left" showCloseButton={false}>
						<SheetHeader className="sr-only">
							<SheetTitle>Settings</SheetTitle>
							<SheetDescription>Navigate settings sections</SheetDescription>
						</SheetHeader>
						<nav className="space-y-6 overflow-y-auto p-4">{sheetGroups}</nav>
					</SheetContent>
				</Sheet>
			</div>
		</>
	);
}
