import { MagnifyingGlass } from "@phosphor-icons/react";
import { type ComponentType, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

export type SettingsNavIcon = ComponentType<{
	className?: string;
	"aria-hidden"?: boolean | "true" | "false";
	"data-icon"?: string;
}>;

export interface SettingsNavItem {
	key: string;
	label: string;
	icon: SettingsNavIcon;
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

export function filterSettingsGroups(
	groups: SettingsNavGroup[],
	query: string,
): SettingsNavGroup[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (!normalizedQuery) return groups;

	return groups
		.map((group) => ({
			...group,
			items: group.items.filter((item) =>
				item.label.toLocaleLowerCase().includes(normalizedQuery),
			),
		}))
		.filter((group) => group.items.length > 0);
}

export function SettingsSidebarNav({
	groups,
	activeKey,
	onNavigate,
}: SettingsSidebarNavProps) {
	const [query, setQuery] = useState("");
	const searchId = useId();
	const filtered = filterSettingsGroups(groups, query);

	return (
		<div className="flex flex-col gap-4">
			<div className="relative hidden md:block">
				<Label htmlFor={searchId} className="sr-only">
					{m["settings.search_placeholder"]()}
				</Label>
				<MagnifyingGlass
					aria-hidden="true"
					className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					id={searchId}
					type="search"
					name="settings-search"
					autoComplete="off"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder={m["settings.search_placeholder"]()}
					className="ps-8"
				/>
			</div>

			<nav
				aria-label={m["settings.navigation_label"]()}
				className="hidden flex-col gap-6 md:flex"
			>
				{filtered.length === 0 && (
					<div className="flex flex-col items-start gap-2 px-3 text-muted-foreground text-sm">
						<p role="status" className="text-pretty">
							{m["settings.no_matches"]()}
						</p>
						<Button
							type="button"
							variant="link"
							size="sm"
							className="px-0"
							onClick={() => setQuery("")}
						>
							{m["settings.clear_search"]()}
						</Button>
					</div>
				)}
				{filtered.map((group) => (
					<div key={group.label} className="flex flex-col gap-1">
						<p className="px-3 font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
							{group.label}
						</p>
						<ul className="flex flex-col gap-0.5">
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

			<div className="relative md:hidden">
				<nav
					aria-label={m["settings.navigation_label"]()}
					className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pe-8 pb-1"
				>
					{groups.flatMap((group) =>
						group.items.map((item) => {
							const isActive = activeKey === item.key;
							return (
								<Button
									key={item.key}
									type="button"
									variant="ghost"
									size="lg"
									aria-current={isActive ? "page" : undefined}
									onClick={() => onNavigate(item.key)}
									className={cn(
										"snap-start rounded-full",
										isActive &&
											"bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
									)}
								>
									<item.icon aria-hidden="true" data-icon="inline-start" />
									{item.label}
								</Button>
							);
						}),
					)}
				</nav>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-y-0 end-0 w-8 bg-linear-to-l from-sidebar to-transparent"
				/>
			</div>
		</div>
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
		<Button
			type="button"
			variant="sidebar"
			size="default"
			aria-current={isActive ? "page" : undefined}
			onClick={() => onNavigate(item.key)}
			className={cn(
				"w-full justify-start text-start",
				isActive &&
					"bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
			)}
		>
			<item.icon aria-hidden="true" data-icon="inline-start" />
			{item.label}
		</Button>
	);
}
