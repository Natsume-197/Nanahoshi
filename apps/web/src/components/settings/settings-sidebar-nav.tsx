import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

export interface SettingsNavItem {
	key: string;
	label: string;
	icon: ComponentType<{ className?: string }>;
}

export interface SettingsNavGroup {
	label: string;
	items: SettingsNavItem[];
}

interface SettingsSidebarNavProps {
	groups: SettingsNavGroup[];
	activeKey: string;
	onNavigate: (key: string) => void;
}

export function SettingsSidebarNav({
	groups,
	activeKey,
	onNavigate,
}: SettingsSidebarNavProps) {
	return (
		<>
			{/* Desktop: vertical grouped list */}
			<nav className="hidden md:block md:space-y-6">
				{groups.map((group) => (
					<div key={group.label} className="space-y-1">
						<p className="px-3 font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
							{group.label}
						</p>
						<ul className="space-y-0.5">
							{group.items.map((item) => (
								<li key={item.key}>
									<NavButton
										item={item}
										isActive={activeKey === item.key}
										onNavigate={onNavigate}
									/>
								</li>
							))}
						</ul>
					</div>
				))}
			</nav>

			{/* Mobile: horizontally scrolling row of section chips */}
			<nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:hidden">
				{groups.flatMap((group) =>
					group.items.map((item) => {
						const isActive = activeKey === item.key;
						return (
							<button
								key={item.key}
								type="button"
								onClick={() => onNavigate(item.key)}
								className={cn(
									"flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors",
									isActive
										? "bg-primary/10 font-medium text-primary"
										: "bg-muted/50 text-muted-foreground",
								)}
							>
								<item.icon className="size-4" />
								{item.label}
							</button>
						);
					}),
				)}
			</nav>
		</>
	);
}

function NavButton({
	item,
	isActive,
	onNavigate,
}: {
	item: SettingsNavItem;
	isActive: boolean;
	onNavigate: (key: string) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onNavigate(item.key)}
			className={cn(
				"flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
				isActive
					? "bg-primary/10 font-medium text-primary"
					: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
			)}
		>
			<item.icon className="size-4" />
			{item.label}
		</button>
	);
}
