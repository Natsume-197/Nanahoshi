import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import { FloppyDisk } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import {
	DEFAULT_SCAN_INTERVAL,
	invalidateLibraries,
	SCAN_INTERVAL_OPTIONS,
} from "./utils";

export function ScanningSection({
	library,
	canManage,
}: {
	library: LibraryComplete;
	canManage: boolean;
}) {
	const [scheduled, setScheduled] = useState(!!library.isCronWatch);
	const [interval, setInterval] = useState(
		library.scanIntervalMinutes ?? DEFAULT_SCAN_INTERVAL,
	);
	// Re-sync local state from server data on refetch.
	const prevRef = useRef({
		isCronWatch: library.isCronWatch,
		scanIntervalMinutes: library.scanIntervalMinutes,
	});
	if (
		library.isCronWatch !== prevRef.current.isCronWatch ||
		library.scanIntervalMinutes !== prevRef.current.scanIntervalMinutes
	) {
		prevRef.current = {
			isCronWatch: library.isCronWatch,
			scanIntervalMinutes: library.scanIntervalMinutes,
		};
		setScheduled(!!library.isCronWatch);
		setInterval(library.scanIntervalMinutes ?? DEFAULT_SCAN_INTERVAL);
	}

	const updateMutation = useMutation({
		...orpc.libraries.updateLibrary.mutationOptions(),
		onSuccess: () => {
			invalidateLibraries();
			toast.success(m["library.schedule_updated"]());
		},
		onError: (err) => toast.error(err.message),
	});

	const savedInterval = library.scanIntervalMinutes ?? DEFAULT_SCAN_INTERVAL;
	const changed =
		scheduled !== !!library.isCronWatch ||
		(scheduled && interval !== savedInterval);

	return (
		<div className="space-y-5">
			<div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
				<div>
					<p className="font-medium text-sm">{m["library.scheduled_scan"]()}</p>
					<p className="text-muted-foreground text-xs">
						{m["library.scheduled_desc"]()}
					</p>
				</div>
				<Switch
					checked={scheduled}
					disabled={!canManage}
					onCheckedChange={setScheduled}
					aria-label={m["library.toggle_scheduled"]()}
				/>
			</div>

			{scheduled && (
				<div className="space-y-1.5">
					<p className="text-muted-foreground text-xs">
						{m["library.frequency"]()}
					</p>
					<Select
						value={String(interval)}
						onValueChange={(v) => setInterval(Number(v))}
						disabled={!canManage}
					>
						<SelectTrigger className="w-56">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{SCAN_INTERVAL_OPTIONS.map((opt) => (
								<SelectItem key={opt.value} value={String(opt.value)}>
									{opt.label()}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}

			{canManage && changed && (
				<Button
					size="sm"
					disabled={updateMutation.isPending}
					onClick={() =>
						updateMutation.mutate({
							uuid: library.uuid,
							isCronWatch: scheduled,
							scanIntervalMinutes: scheduled ? interval : null,
						})
					}
				>
					<FloppyDisk className="mr-1.5 size-3.5" />
					{m["common.save"]()}
				</Button>
			)}
		</div>
	);
}
