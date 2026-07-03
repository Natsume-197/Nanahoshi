import { useLocation, useNavigate } from "@tanstack/react-router";
import { Check, ChevronsUpDown, LogOut, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useAbilities } from "@/hooks/use-abilities";
import { authClient } from "@/lib/auth-client";
import {
	isServerScopedDetailPath,
	switchActiveServer,
} from "@/lib/switch-server";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

function orgInitials(name: string) {
	return name
		.split(/[\s-_]+/)
		.map((word) => word[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

// Deterministic gradient per server, in the brand's green→teal→blue family so
// it reads on-brand and stays distinct from the pink/violet user avatars. 700
// stops keep the white initials legible (≥4.5:1) across the whole chip.
const SERVER_GRADIENTS = [
	"linear-gradient(135deg, #047857, #0f766e)", // emerald → teal
	"linear-gradient(135deg, #15803d, #047857)", // green → emerald
	"linear-gradient(135deg, #0f766e, #0e7490)", // teal → cyan
	"linear-gradient(135deg, #0e7490, #1d4ed8)", // cyan → blue
	"linear-gradient(135deg, #1d4ed8, #4338ca)", // blue → indigo
];

function serverGradient(name: string) {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}
	return SERVER_GRADIENTS[Math.abs(hash) % SERVER_GRADIENTS.length];
}

function OrgBadge({ name, className }: { name: string; className?: string }) {
	return (
		<span
			className={cn(
				"flex size-7 shrink-0 items-center justify-center rounded-full font-semibold text-[10px] text-white shadow-sm ring-1 ring-inset ring-white/15",
				className,
			)}
			style={{ background: serverGradient(name) }}
		>
			{orgInitials(name)}
		</span>
	);
}

export function OrgSwitcher() {
	const navigate = useNavigate();
	const location = useLocation();
	const { data: orgs, isPending } = authClient.useListOrganizations();
	const { data: activeOrg } = authClient.useActiveOrganization();
	const { can, isOrgOwner } = useAbilities();
	const { openOrgSettings } = useSettingsModal();
	const [leaveOpen, setLeaveOpen] = useState(false);
	const [isLeaving, setIsLeaving] = useState(false);

	// Show the org-settings entry only to those who can manage something in it.
	const canManageOrg =
		isOrgOwner ||
		can("settings", "update") ||
		can("library", "create") ||
		can("library", "manageAccess") ||
		can("member", "list") ||
		can("member", "invite") ||
		can("roles", "manage");

	if (isPending) {
		return <Skeleton className="h-9 w-52 rounded-lg" />;
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

	const dropdown = (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					className="h-9 w-fit max-w-64 gap-2 rounded-lg pr-2 pl-1.5"
				>
					<OrgBadge name={activeName} />
					<span className="min-w-0 flex-1 truncate text-left font-medium">
						{activeName}
					</span>
					<ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				sideOffset={6}
				className="min-w-56 bg-card"
			>
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
							<OrgBadge name={org.name} className="size-6 text-[9px]" />
							<span className="flex-1 truncate">{org.name}</span>
							{isActive && <Check className="size-4 shrink-0 text-primary" />}
						</DropdownMenuItem>
					);
				})}
				{activeOrg && (canManageOrg || !isOrgOwner) && (
					<DropdownMenuSeparator />
				)}
				{activeOrg && canManageOrg && (
					<DropdownMenuItem
						onClick={() => openOrgSettings("general")}
						className="gap-2.5"
					>
						<Settings2 className="size-4 shrink-0 text-muted-foreground" />
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
						<LogOut className="size-4 shrink-0" />
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
