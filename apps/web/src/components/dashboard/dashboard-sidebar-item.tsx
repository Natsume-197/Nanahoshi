import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useSidebar } from "@/components/ui/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// pl-3 lines the thumbnail up with the nav item icons (group p-2 + px-3).
// Collapsing to the icon rail mirrors SidebarMenuButton: the row shrinks to
// size-8 and overflow-hidden clips the text as the sidebar animates, so it
// stays in step with the nav items stacked above instead of snapping.
const rowClass = (active: boolean) =>
	cn(
		// w-full (not auto) so the collapse can interpolate width 100%→2rem;
		// CSS can't animate from `auto`, which is why the text used to snap.
		"flex w-full items-center gap-3 overflow-hidden rounded-lg py-1.5 pr-2 pl-3",
		"transition-[width,height,padding] duration-200 hover:bg-sidebar-accent/60",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
		"group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2!",
		active && "bg-sidebar-accent",
	);

const nameClass = (active: boolean) =>
	cn(
		"truncate font-medium text-sm leading-tight",
		active ? "text-sidebar-foreground" : "text-muted-foreground",
	);

// Labelled subsection: a header (label + count + optional action) over its
// children. The label stays flush-left like SidebarGroupLabel/"Browse".
export function Section({
	label,
	action,
	children,
}: {
	label: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div>
			{/* px-2.5 lines the label up with SidebarGroupLabel ("Browse"); the
			    action sits near the items' right edge. */}
			<div className="flex h-8 items-center pr-2 pl-2.5 group-data-[collapsible=icon]:hidden">
				<span className="flex-1 font-semibold text-sidebar-foreground/70 text-sm">
					{label}
				</span>
				{action}
			</div>
			<div className="space-y-0.5 pb-1">{children}</div>
		</div>
	);
}

// Sidebar row with a leading visual, title/subtitle and an optional
// context menu — collapses to a bare icon in the icon rail.
export function SidebarItem({
	leading,
	leadingClassName,
	collapsedIcon,
	title,
	subtitle,
	active = false,
	link,
	onNavigate,
	menu,
}: {
	/** Rich leading tile (cover / accent icon box) shown when expanded. */
	leading: ReactNode;
	leadingClassName?: string;
	/** Bare line icon shown in the collapsed rail, matching the nav above. */
	collapsedIcon: ReactNode;
	title: string;
	subtitle: string;
	active?: boolean;
	link: Pick<LinkProps, "to" | "params" | "search">;
	onNavigate?: () => void;
	menu?: ReactNode;
}) {
	const { state, isMobile } = useSidebar();
	const row = (
		<Link
			{...link}
			preload="intent"
			onClick={onNavigate}
			className={rowClass(active)}
		>
			<div
				className={cn(
					"size-12 flex-none overflow-hidden rounded-md group-data-[collapsible=icon]:hidden",
					leadingClassName,
				)}
			>
				{leading}
			</div>
			{/* Collapsed rail: swap the tile for a bare size-4 line icon so the row
			    reads like the nav items stacked above it. */}
			<div
				className={cn(
					"hidden flex-none place-items-center group-data-[collapsible=icon]:grid [&>svg]:size-4",
					active ? "text-sidebar-foreground" : "text-muted-foreground",
				)}
			>
				{collapsedIcon}
			</div>
			{/* Not display:none when collapsed — overflow-hidden on the row clips it
			    as the sidebar animates, matching the nav's shrink. */}
			<div className="min-w-0 flex-1">
				<p className={nameClass(active)}>{title}</p>
				<p className="mt-0.5 truncate text-sidebar-foreground/50 text-xs">
					{subtitle}
				</p>
			</div>
		</Link>
	);

	// Nested asChild triggers: the context menu wraps the tooltip, which wraps
	// the row — both merge their handlers onto the same DOM node. The tooltip
	// only surfaces the title in the collapsed rail, where the label is hidden.
	const trigger = menu ? (
		<ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
	) : (
		row
	);

	const tooltipped = (
		<Tooltip>
			<TooltipTrigger asChild>{trigger}</TooltipTrigger>
			<TooltipContent
				side="right"
				align="center"
				hidden={state !== "collapsed" || isMobile}
			>
				{title}
			</TooltipContent>
		</Tooltip>
	);

	if (!menu) return tooltipped;

	return (
		<ContextMenu>
			{tooltipped}
			<ContextMenuContent className="w-44">{menu}</ContextMenuContent>
		</ContextMenu>
	);
}
