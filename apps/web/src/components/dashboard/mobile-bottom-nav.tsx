import { Link, useLocation } from "@tanstack/react-router";
import {
	Compass,
	Folder,
	Heart,
	Home,
	Library,
	MailOpen,
	Menu,
	Settings,
} from "lucide-react";
import { useState } from "react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const tabs = [
	{ label: "Home", icon: Home, href: "/dashboard" as const, exact: true },
	{
		label: "Activity",
		icon: Compass,
		href: "/dashboard/activity" as const,
		exact: false,
	},
	{
		label: "Likes",
		icon: Heart,
		href: "/dashboard/likes" as const,
		exact: false,
	},
	{
		label: "Library",
		icon: Library,
		href: "/dashboard/series" as const,
		exact: false,
	},
] as const;

const moreItems = [
	{
		label: "Collections",
		icon: Folder,
		href: "/dashboard/collections" as const,
	},
	{
		label: "Settings",
		icon: Settings,
		href: "/dashboard/settings" as const,
	},
	{
		label: "Invitations",
		icon: MailOpen,
		href: "/dashboard/invitations" as const,
	},
] as const;

export function MobileBottomNav() {
	const location = useLocation();
	const [moreOpen, setMoreOpen] = useState(false);

	const isMoreActive = moreItems.some((item) =>
		location.pathname.startsWith(item.href),
	);

	return (
		<>
			<nav className="fixed inset-x-0 bottom-0 z-30 bg-background md:hidden">
				<div className="flex items-center justify-around pb-[env(safe-area-inset-bottom)]">
					{tabs.map((tab) => {
						const isActive = tab.exact
							? location.pathname === tab.href
							: location.pathname.startsWith(tab.href);

						return (
							<Link
								key={tab.href}
								to={tab.href}
								className={cn(
									"flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors",
									isActive
										? "text-foreground"
										: "text-muted-foreground active:text-foreground",
								)}
							>
								<tab.icon className="size-5" strokeWidth={isActive ? 2.5 : 2} />
								<span className={cn(isActive && "font-medium")}>
									{tab.label}
								</span>
							</Link>
						);
					})}

					<button
						type="button"
						onClick={() => setMoreOpen(true)}
						className={cn(
							"flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors",
							isMoreActive
								? "text-foreground"
								: "text-muted-foreground active:text-foreground",
						)}
					>
						<Menu className="size-5" strokeWidth={isMoreActive ? 2.5 : 2} />
						<span className={cn(isMoreActive && "font-medium")}>More</span>
					</button>
				</div>
			</nav>

			<Sheet open={moreOpen} onOpenChange={setMoreOpen}>
				<SheetContent
					side="bottom"
					showCloseButton={false}
					className="pb-[env(safe-area-inset-bottom)]"
				>
					<SheetHeader className="sr-only">
						<SheetTitle>More options</SheetTitle>
						<SheetDescription>Additional navigation options</SheetDescription>
					</SheetHeader>
					<nav className="flex flex-col gap-1 p-2">
						{moreItems.map((item) => {
							const isActive = location.pathname.startsWith(item.href);

							return (
								<Link
									key={item.href}
									to={item.href}
									onClick={() => setMoreOpen(false)}
									className={cn(
										"flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
										isActive
											? "bg-accent font-medium text-foreground"
											: "text-muted-foreground active:bg-accent/50",
									)}
								>
									<item.icon className="size-5" />
									<span>{item.label}</span>
								</Link>
							);
						})}
					</nav>
				</SheetContent>
			</Sheet>
		</>
	);
}
