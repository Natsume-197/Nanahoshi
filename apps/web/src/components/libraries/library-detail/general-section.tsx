import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import { FloppyDisk } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { invalidateLibraries } from "./utils";

export function GeneralSection({
	library,
	canManage,
}: {
	library: LibraryComplete;
	canManage: boolean;
}) {
	const [name, setName] = useState(library.name ?? "");
	// Re-sync local name if the library data changes underneath us (refetch).
	const prevNameRef = useRef(library.name);
	if (library.name !== prevNameRef.current) {
		prevNameRef.current = library.name;
		setName(library.name ?? "");
	}

	const updateMutation = useMutation({
		...orpc.libraries.updateLibrary.mutationOptions(),
		onSuccess: () => {
			invalidateLibraries();
			toast.success(m["library.updated"]());
		},
		onError: (err) => toast.error(err.message),
	});

	const nameChanged =
		name.trim() !== (library.name ?? "") && name.trim() !== "";

	return (
		<div className="space-y-6">
			<div className="space-y-1.5">
				<Label htmlFor="library-name">{m["library.name"]()}</Label>
				<div className="flex items-center gap-2">
					<Input
						id="library-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						disabled={!canManage}
					/>
					{canManage && nameChanged && (
						<Button
							size="sm"
							disabled={updateMutation.isPending}
							onClick={() =>
								updateMutation.mutate({ uuid: library.uuid, name: name.trim() })
							}
						>
							<FloppyDisk className="mr-1.5 size-3.5" />
							{m["common.save"]()}
						</Button>
					)}
				</div>
			</div>

			<div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
				<div>
					<p className="font-medium text-sm">{m["library.public_title"]()}</p>
					<p className="text-muted-foreground text-xs">
						{m["library.public_desc_full"]()}
					</p>
				</div>
				<Switch
					checked={library.isPublic}
					disabled={!canManage || updateMutation.isPending}
					onCheckedChange={(checked) =>
						updateMutation.mutate({ uuid: library.uuid, isPublic: checked })
					}
					aria-label={m["library.toggle_public"]()}
				/>
			</div>
		</div>
	);
}
