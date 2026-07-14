import {
	CaretDown,
	CaretUpDown,
	Check,
	SignOut,
	Sliders,
	UserPlus,
} from "@phosphor-icons/react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
import { ServerBadge } from "@/components/shared/server-badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardOrganization } from "@/functions/get-organizations";
import { useAbilities } from "@/hooks/use-abilities";
import { authClient } from "@/lib/auth-client";
import {
	isServerScopedDetailPath,
	switchActiveServer,
} from "@/lib/switch-server";
import { m } from "@/paraglide/messages";

export function OrgSwitcher({
	variant = "header",
	initialOrganizations,
	activeOrganizationId,
}: {
	variant?: "header" | "sidebar";
	initialOrganizations?: DashboardOrganization[];
	activeOrganizationId?: string | null;
}) {
	const navigate = useNavigate();
	const location = useLocation();
	const { data: clientOrganizations, isPending } =
		authClient.useListOrganizations();
	const { data: clientActiveOrg } = authClient.useActiveOrganization();
	const orgs = clientOrganizations ?? initialOrganizations;
	const activeOrg =
		clientActiveOrg ?? orgs?.find((org) => org.id === activeOrganizationId);
	const { can, isOrgOwner } = useAbilities();
	const { openOrgSettings } = useSettingsModal();
	const [leaveOpen, setLeaveOpen] = useState(false);
	const [isLeaving, setIsLeaving] = useState(false);

	// Same gate as the invitations section inside the server-settings modal.
	const canInvite = can("member", "invite");

	// Show the org-settings entry only to those who can manage something in it.
	const canManageOrg =
		isOrgOwner ||
		can("settings", "update") ||
		can("library", "create") ||
		can("library", "manageAccess") ||
		can("member", "list") ||
		can("member", "invite") ||
		can("roles", "manage");

	if (isPending && initialOrganizations === undefined) {
		return variant === "sidebar" ? (
			<Skeleton className="h-10 w-full rounded-xl group-data-[collapsible=icon]:size-8" />
		) : (
			<Skeleton className="h-9 w-52 rounded-lg" />
		);
	}

	if (!orgs || orgs.length === 0) {
		return null;
	}

	const handleSwitchOrg = async (orgId: string) => {
		if (orgId === activeOrg?.id) return;
		// Stay on list/index pages (they refetch under the new server); only leave
		// a catalog detail page, whose entity belongs to the previous server.
		const leave = isServerScopedDetailPath(location.pathname);
		await switchActiveServer(
			orgId,
			leave ? () => navigate({ to: "/dashboard" }) : undefined,
		);
	};

	const handleLeave = async () => {
		if (!activeOrg) return;
		setIsLeaving(true);
		try {
			const { error } = await authClient.organization.leave({
				organizationId: activeOrg.id,
			});
			if (error) {
				toast.error(error.message ?? m["toast.leave_server_failed"]());
				return;
			}
			toast.success(m["server.left"]({ name: activeOrg.name }));
			// Move to a remaining org (or clear the active org if none are left) so the
			// dashboard doesn't keep querying the org we just left.
			const next = orgs?.find((o) => o.id !== activeOrg.id);
			await switchActiveServer(next?.id ?? null, () =>
				navigate({ to: "/dashboard" }),
			);
		} finally {
			setIsLeaving(false);
			setLeaveOpen(false);
		}
	};

	const activeName = activeOrg?.name ?? m["server.select"]();

	const trigger =
		variant === "sidebar" ? (
			// Sidebar heading row, same block style/size as the navbar's Home pill;
			// collapses to the bare badge in the icon rail.
			<button
				type="button"
				className="flex h-11 w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-xl pr-3 pl-[7px] text-left font-medium text-[15px] transition-[width,height,padding] duration-200 hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:p-0!"
			>
				<ServerBadge
					name={activeName}
					logo={activeOrg?.logo}
					className="size-6 rounded-md text-[9px]"
				/>
				<span className="min-w-0 flex-1 truncate text-foreground group-data-[collapsible=icon]:hidden">
					{activeName}
				</span>
				<CaretDown className="size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
			</button>
		) : (
			<Button
				variant="ghost"
				className="h-9 w-fit max-w-64 gap-2 rounded-lg pr-2 pl-1.5"
			>
				<ServerBadge name={activeName} logo={activeOrg?.logo} />
				<span className="min-w-0 flex-1 truncate text-left font-medium">
					{activeName}
				</span>
				<CaretUpDown className="size-4 shrink-0 text-muted-foreground" />
			</Button>
		);

	const dropdown = (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				sideOffset={variant === "sidebar" ? 8 : 6}
				className="min-w-56 bg-card"
			>
				<DropdownMenuGroup>
					<DropdownMenuLabel className="text-muted-foreground text-xs">
						{m["server.list_label"]()}
					</DropdownMenuLabel>
					{orgs.map((org) => {
						const isActive = org.id === activeOrg?.id;
						return (
							<DropdownMenuItem
								key={org.id}
								onClick={() => handleSwitchOrg(org.id)}
								className="gap-2.5"
							>
								<ServerBadge
									name={org.name}
									logo={org.logo}
									className="size-6 text-[9px]"
								/>
								<span className="flex-1 truncate">{org.name}</span>
								{isActive && <Check className="size-4 shrink-0 text-primary" />}
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuGroup>
				{activeOrg && (canManageOrg || !isOrgOwner) && (
					<DropdownMenuSeparator />
				)}
				{activeOrg && canInvite && (
					<DropdownMenuItem
						onClick={() => openOrgSettings("invitations")}
						className="gap-2.5"
					>
						<UserPlus className="size-4 shrink-0 text-muted-foreground" />
						<span className="flex-1">{m["server.invite"]()}</span>
					</DropdownMenuItem>
				)}
				{activeOrg && canManageOrg && (
					<DropdownMenuItem
						onClick={() => openOrgSettings("general")}
						className="gap-2.5"
					>
						<Sliders className="size-4 shrink-0 text-muted-foreground" />
						<span className="flex-1">{m["server.settings"]()}</span>
					</DropdownMenuItem>
				)}
				{/* The owner can't leave their own org — they must transfer it first. */}
				{activeOrg && !isOrgOwner && (
					<DropdownMenuItem
						variant="destructive"
						onSelect={(e) => {
							e.preventDefault();
							setLeaveOpen(true);
						}}
						className="gap-2.5"
					>
						<SignOut className="size-4 shrink-0" />
						<span className="flex-1">{m["server.leave"]()}</span>
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);

	return (
		<>
			{dropdown}
			<Modal
				open={leaveOpen}
				onOpenChange={setLeaveOpen}
				title={m["server.leave_title"]({ name: activeName })}
				description={m["server.leave_desc"]()}
				footer={
					<>
						<Button
							type="button"
							variant="outline"
							disabled={isLeaving}
							onClick={() => setLeaveOpen(false)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="button"
							disabled={isLeaving}
							onClick={handleLeave}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{m["server.leave_action"]()}
						</Button>
					</>
				}
			/>
		</>
	);
}
