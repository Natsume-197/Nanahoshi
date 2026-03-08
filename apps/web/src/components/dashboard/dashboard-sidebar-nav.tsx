import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	ChevronRight,
	Folder,
	Heart,
	Home,
	Settings,
} from "lucide-react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	SidebarContent,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarSeparator,
	useSidebar,
} from "@/components/ui/sidebar";
import { orpc } from "@/utils/orpc";

interface DashboardSidebarNavProps {
	locationPathname: string;
	onNavigate: () => void;
}

export function DashboardSidebarNav({
	locationPathname,
	onNavigate,
}: DashboardSidebarNavProps) {
	const { state } = useSidebar();
	const collapsed = state === "collapsed";
	const { data: collections, isLoading: isCollectionsLoading } = useQuery({
		...orpc.collections.list.queryOptions(),
		staleTime: 30_000,
	});

	const isCollectionsActive = locationPathname.startsWith(
		"/dashboard/collections",
	);
	const isLikesActive = locationPathname.startsWith("/dashboard/likes");

	return (
		<SidebarContent>
			<SidebarGroup>
				<SidebarGroupLabel>Library</SidebarGroupLabel>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={locationPathname === "/dashboard"}
							tooltip="Home"
							render={<Link to="/dashboard" onClick={onNavigate} />}
						>
							<Home />
							<span>Home</span>
						</SidebarMenuButton>
					</SidebarMenuItem>

					<Collapsible
						open={collapsed ? false : undefined}
						defaultOpen={isCollectionsActive}
					>
						<SidebarMenuItem>
							<SidebarMenuButton
								isActive={isCollectionsActive}
								tooltip="Collections"
								render={
									<Link to="/dashboard/collections" onClick={onNavigate} />
								}
							>
								<Folder />
								<span>Collections</span>
							</SidebarMenuButton>
							<CollapsibleTrigger
								render={
									<button
										type="button"
										className="absolute top-1.5 right-1 flex size-5 items-center justify-center rounded-md text-sidebar-foreground/70 outline-hidden ring-sidebar-ring transition-transform after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 group-data-[collapsible=icon]:hidden"
									/>
								}
							>
								<ChevronRight className="size-3.5 transition-transform duration-200 [[data-state=open]_&]:rotate-90" />
							</CollapsibleTrigger>

							<CollapsibleContent>
								<SidebarMenuSub>
									{isCollectionsLoading ? (
										<>
											<SidebarMenuSkeleton />
											<SidebarMenuSkeleton />
										</>
									) : collections && collections.length > 0 ? (
										collections.map((collection) => (
											<SidebarMenuSubItem key={collection.id}>
												<SidebarMenuSubButton
													isActive={locationPathname.startsWith(
														`/dashboard/collections/${collection.id}`,
													)}
													render={
														<Link
															to="/dashboard/collections/$collectionId"
															params={{
																collectionId: collection.id,
															}}
															onClick={onNavigate}
														/>
													}
												>
													<span>{collection.name}</span>
												</SidebarMenuSubButton>
											</SidebarMenuSubItem>
										))
									) : (
										<li className="px-2 py-1.5 text-sidebar-foreground/50 text-xs">
											No collections yet
										</li>
									)}
								</SidebarMenuSub>
							</CollapsibleContent>
						</SidebarMenuItem>
					</Collapsible>

					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={isLikesActive}
							tooltip="Your Likes"
							render={<Link to="/dashboard/likes" onClick={onNavigate} />}
						>
							<Heart />
							<span>Your Likes</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarGroup>

			<SidebarSeparator />

			<SidebarGroup>
				<SidebarGroupLabel>System</SidebarGroupLabel>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={
								locationPathname.startsWith("/dashboard/settings") ||
								locationPathname.startsWith("/dashboard/admin")
							}
							tooltip="Settings"
							render={<Link to="/dashboard/settings" onClick={onNavigate} />}
						>
							<Settings />
							<span>Settings</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarGroup>
		</SidebarContent>
	);
}
