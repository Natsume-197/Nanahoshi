import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Library, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CreateLibraryForm } from "@/components/libraries/create-library-form";
import { LibraryCard } from "@/components/libraries/library-card";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute(
	"/dashboard/settings/organization/libraries",
)({
	component: LibrariesSettings,
});

function LibrariesSettings() {
	const [showCreateForm, setShowCreateForm] = useState(false);

	const { data: libraries, isLoading } = useQuery(
		orpc.libraries.getLibraries.queryOptions(),
	);

	const { data: session } = authClient.useSession();
	const { data: activeOrg } = authClient.useActiveOrganization();
	const hasOrg = !!activeOrg;

	const { data: myRoleData } = useQuery({
		...orpc.users.getMyRole.queryOptions(),
		enabled: hasOrg,
	});

	// System-level admin always has access; org admin/owner also has access
	const isSystemAdmin = session?.user?.role === "admin";
	const orgMemberRole =
		myRoleData?.role ??
		activeOrg?.members?.find((m) => m.userId === session?.user?.id)?.role;
	const canManageLibraries =
		isSystemAdmin || orgMemberRole === "admin" || orgMemberRole === "owner";

	const createMutation = useMutation({
		...orpc.libraries.createLibrary.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.libraries.getLibraries.queryOptions().queryKey,
			});
			setShowCreateForm(false);
			toast.success("Library created");
		},
		onError: (err) => {
			toast.error(err.message);
		},
	});

	return (
		<div className="space-y-8">
			<div>
				<h2 className="font-bold text-2xl tracking-tight">Libraries</h2>
				<p className="text-muted-foreground text-sm">
					Manage your book libraries and scan paths
				</p>
			</div>

			<section className="space-y-4">
				{canManageLibraries && (
					<div className="flex items-center justify-end">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setShowCreateForm(!showCreateForm)}
						>
							<Plus className="mr-1.5 size-4" />
							New Library
						</Button>
					</div>
				)}

				{showCreateForm && canManageLibraries && (
					<CreateLibraryForm
						onSubmit={(data) => createMutation.mutate(data)}
						onCancel={() => setShowCreateForm(false)}
						isPending={createMutation.isPending}
					/>
				)}

				{isLoading && (
					<p className="text-muted-foreground text-sm">Loading libraries...</p>
				)}

				{libraries && libraries.length === 0 && !showCreateForm && (
					<div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-border/70 border-dashed bg-card/30 px-6 text-center">
						<div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
							<Library className="size-5" />
						</div>
						<div className="flex flex-col gap-1">
							<h3 className="font-semibold text-lg">No libraries yet</h3>
							<p className="max-w-sm text-muted-foreground text-sm">
								A library points to a folder on your server where your ebooks
								are stored. Nanahoshi will scan it and import your books
								automatically.
							</p>
						</div>
						{canManageLibraries && (
							<Button
								variant="outline"
								size="sm"
								className="mt-2"
								onClick={() => setShowCreateForm(true)}
							>
								<Plus className="mr-1.5 size-4" />
								Create your first library
							</Button>
						)}
					</div>
				)}

				{libraries && libraries.length > 0 && (
					<div className="space-y-3">
						{libraries.map((lib) => (
							<LibraryCard
								key={lib.id}
								library={lib}
								canManage={canManageLibraries}
							/>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
