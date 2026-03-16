import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	ChevronRight,
	Compass,
	Folder,
	Heart,
	Home,
	Library,
	MailOpen,
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
	useSidebar,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

interface DashboardSidebarNavProps {
	locationPathname: string;
	onNavigate: () => void;
}

export function DashboardSidebarNav({
	locationPathname,
	onNavigate,
}: DashboardSidebarNavProps) {
	const { state, isMobile, setOpenMobile } = useSidebar();
	const handleNavigate = () => {
		if (isMobile) setOpenMobile(false);
		onNavigate();
	};
	const collapsed = state === "collapsed";
	const { data: activeOrg } = authClient.useActiveOrganization();
	const hasOrg = !!activeOrg;

	const { data: collections, isLoading: isCollectionsLoading } = useQuery({
		...orpc.collections.list.queryOptions(),
		staleTime: 30_000,
		enabled: hasOrg,
	});

	const isCollectionsActive = locationPathname.startsWith(
		"/dashboard/collections",
	);
	const isSeriesActive = locationPathname.startsWith("/dashboard/series");
	const isLikesActive = locationPathname.startsWith("/dashboard/likes");

	return (
		<SidebarContent>
			<SidebarGroup>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={locationPathname === "/dashboard"}
							tooltip="Home"
							render={
								<Link
									to="/dashboard"
									preload="intent"
									onClick={handleNavigate}
								/>
							}
						>
							<Home />
							<span>Home</span>
						</SidebarMenuButton>
					</SidebarMenuItem>

					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={locationPathname === "/dashboard/activity"}
							tooltip="Activity"
							render={
								<Link
									to="/dashboard/activity"
									preload="intent"
									onClick={handleNavigate}
								/>
							}
						>
							<Compass />
							<span>Activity</span>
						</SidebarMenuButton>
					</SidebarMenuItem>

					{hasOrg && (
						<Collapsible
							open={collapsed ? false : undefined}
							defaultOpen={isCollectionsActive}
						>
							<SidebarMenuItem>
								<SidebarMenuButton
									isActive={isCollectionsActive}
									tooltip="Collections"
									render={
										<Link
											to="/dashboard/collections"
											preload="intent"
											onClick={handleNavigate}
										/>
									}
								>
									<Folder />
									<span>Collections</span>
								</SidebarMenuButton>
								<CollapsibleTrigger
									render={
										<button
											type="button"
											className="absolute top-[0.3125rem] right-1 flex size-6 items-center justify-center rounded-md text-sidebar-foreground/70 outline-hidden ring-sidebar-ring transition-transform after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 group-data-[collapsible=icon]:hidden"
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
																onClick={handleNavigate}
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
					)}

					{hasOrg && (
						<SidebarMenuItem>
							<SidebarMenuButton
								isActive={isSeriesActive}
								tooltip="Series"
								render={
									<Link
										to="/dashboard/series"
										preload="intent"
										onClick={handleNavigate}
									/>
								}
							>
								<Library />
								<span>Series</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					)}

					{hasOrg && (
						<SidebarMenuItem>
							<SidebarMenuButton
								isActive={isLikesActive}
								tooltip="Your Likes"
								render={
									<Link
										to="/dashboard/likes"
										preload="intent"
										onClick={handleNavigate}
									/>
								}
							>
								<Heart />
								<span>Your Likes</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					)}
				</SidebarMenu>
			</SidebarGroup>

			<SidebarGroup className="pt-0">
				<SidebarGroupLabel className="mt-2">System</SidebarGroupLabel>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={locationPathname === "/dashboard/invitations"}
							tooltip="Invitations"
							render={
								<Link
									to="/dashboard/invitations"
									preload="intent"
									onClick={handleNavigate}
								/>
							}
						>
							<MailOpen />
							<span>Invitations</span>
						</SidebarMenuButton>
					</SidebarMenuItem>

					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={
								locationPathname.startsWith("/dashboard/settings") ||
								locationPathname.startsWith("/dashboard/admin")
							}
							tooltip="Settings"
							render={
								<Link
									to="/dashboard/settings"
									preload="intent"
									onClick={handleNavigate}
								/>
							}
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
