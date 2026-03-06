import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	ChevronRight,
	Folder,
	Home,
	Loader2,
	Settings,
	Shield,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

const navItems = [
	{ to: "/dashboard", label: "Home", icon: Home, exact: true },
] as const;

interface DashboardSidebarNavProps {
	collapsed: boolean;
	locationPathname: string;
	onNavigate: () => void;
}

export function DashboardSidebarNav({
	collapsed,
	locationPathname,
	onNavigate,
}: DashboardSidebarNavProps) {
	const [collectionsOpen, setCollectionsOpen] = useState(() =>
		locationPathname.startsWith("/dashboard/collections"),
	);
	const { data: session } = authClient.useSession();
	const { data: collections, isLoading: isCollectionsLoading } = useQuery({
		...orpc.collections.list.queryOptions(),
		staleTime: 30_000,
		enabled: !collapsed && collectionsOpen,
	});

	useEffect(() => {
		if (locationPathname.startsWith("/dashboard/collections")) {
			setCollectionsOpen(true);
		}
	}, [locationPathname]);

	return (
		<nav className="flex-1 space-y-0.5 px-3 py-2">
			{navItems.map(({ to, label, icon: Icon, ...rest }) => {
				const exact = "exact" in rest && rest.exact;
				const isActive = exact
					? locationPathname === to
					: locationPathname.startsWith(to);

				return (
					<Link
						key={to}
						to={to}
						title={collapsed ? label : undefined}
						onClick={onNavigate}
						className={`relative flex items-center justify-start gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
							isActive
								? "font-semibold text-foreground before:absolute before:top-1/2 before:left-0 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary"
								: "font-medium text-muted-foreground hover:text-foreground"
						}`}
					>
						<Icon className="size-5 shrink-0" />
						<span
							className={`truncate transition-[max-width,opacity] duration-[140ms] ${
								collapsed ? "max-w-0 opacity-0" : "max-w-32 opacity-100"
							}`}
						>
							{label}
						</span>
					</Link>
				);
			})}

			<Collapsible
				open={collapsed ? false : collectionsOpen}
				onOpenChange={setCollectionsOpen}
			>
				<div className="flex items-center gap-1">
					<Link
						to="/dashboard/collections"
						title={collapsed ? "Collections" : undefined}
						onClick={onNavigate}
						className={`relative flex min-w-0 flex-1 items-center justify-start gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
							locationPathname.startsWith("/dashboard/collections")
								? "font-semibold text-foreground before:absolute before:top-1/2 before:left-0 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary"
								: "font-medium text-muted-foreground hover:text-foreground"
						}`}
					>
						<Folder className="size-5 shrink-0" />
						<span
							className={`truncate transition-[max-width,opacity] duration-[140ms] ${
								collapsed ? "max-w-0 opacity-0" : "max-w-32 opacity-100"
							}`}
						>
							Collections
						</span>
					</Link>

					{!collapsed && (
						<CollapsibleTrigger
							className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							aria-label={
								collectionsOpen ? "Collapse collections" : "Expand collections"
							}
						>
							<ChevronRight
								className={`size-4 transition-transform ${
									collectionsOpen ? "rotate-90" : ""
								}`}
							/>
						</CollapsibleTrigger>
					)}
				</div>

				{!collapsed && (
					<CollapsibleContent className="pl-10">
						<div className="space-y-0.5 py-1 pr-2">
							{isCollectionsLoading ? (
								<div className="flex items-center gap-1.5 px-2 py-1.5 text-muted-foreground text-xs">
									<Loader2 className="size-3 animate-spin" />
									Loading...
								</div>
							) : collections && collections.length > 0 ? (
								collections.map((collection) => (
									<Link
										key={collection.id}
										to="/dashboard/collections/$collectionId"
										params={{ collectionId: collection.id }}
										onClick={onNavigate}
										className={`block truncate rounded-md px-2 py-1.5 text-xs transition-colors ${
											locationPathname.startsWith(
												`/dashboard/collections/${collection.id}`,
											)
												? "bg-muted/70 font-medium text-foreground"
												: "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
										}`}
										title={collection.name}
									>
										{collection.name}
									</Link>
								))
							) : (
								<p className="px-2 py-1.5 text-muted-foreground text-xs">
									No collections yet
								</p>
							)}
						</div>
					</CollapsibleContent>
				)}
			</Collapsible>

			<Link
				to="/dashboard/settings"
				title={collapsed ? "Settings" : undefined}
				onClick={onNavigate}
				className={`relative flex items-center justify-start gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
					locationPathname.startsWith("/dashboard/settings")
						? "font-semibold text-foreground before:absolute before:top-1/2 before:left-0 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary"
						: "font-medium text-muted-foreground hover:text-foreground"
				}`}
			>
				<Settings className="size-5 shrink-0" />
				<span
					className={`truncate transition-[max-width,opacity] duration-[140ms] ${
						collapsed ? "max-w-0 opacity-0" : "max-w-32 opacity-100"
					}`}
				>
					Settings
				</span>
			</Link>

			{session?.user.role === "admin" && (
				<Link
					to="/dashboard/admin"
					title={collapsed ? "Admin" : undefined}
					onClick={onNavigate}
					className={`relative flex items-center justify-start gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
						locationPathname.startsWith("/dashboard/admin")
							? "font-semibold text-foreground before:absolute before:top-1/2 before:left-0 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary"
							: "font-medium text-muted-foreground hover:text-foreground"
					}`}
				>
					<Shield className="size-5 shrink-0" />
					<span
						className={`truncate transition-[max-width,opacity] duration-[140ms] ${
							collapsed ? "max-w-0 opacity-0" : "max-w-32 opacity-100"
						}`}
					>
						Admin
					</span>
				</Link>
			)}
		</nav>
	);
}
