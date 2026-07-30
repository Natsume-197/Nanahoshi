import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import { FloppyDisk } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
	SettingControlRow,
	SettingRows,
} from "@/components/settings/setting-rows";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectGroup,
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
		<div className="flex flex-col gap-6">
			<SettingRows>
				<SettingControlRow
					label={
						<h3 className="font-medium text-base text-foreground">
							{m["library.scheduled_scan"]()}
						</h3>
					}
					description={m["library.scheduled_desc"]()}
				>
					<Switch
						checked={scheduled}
						disabled={!canManage || updateMutation.isPending}
						onCheckedChange={setScheduled}
						aria-label={m["library.toggle_scheduled"]()}
					/>
				</SettingControlRow>

				{scheduled && (
					<SettingControlRow
						label={
							<label
								htmlFor="library-scan-frequency"
								className="font-medium text-base text-foreground"
							>
								{m["library.frequency"]()}
							</label>
						}
					>
						<Select
							value={String(interval)}
							onValueChange={(v) => setInterval(Number(v))}
							disabled={!canManage || updateMutation.isPending}
							items={SCAN_INTERVAL_OPTIONS.map((opt) => ({
								value: String(opt.value),
								label: opt.label(),
							}))}
						>
							<SelectTrigger
								id="library-scan-frequency"
								className="w-full sm:w-64"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{SCAN_INTERVAL_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={String(opt.value)}>
											{opt.label()}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</SettingControlRow>
				)}
			</SettingRows>

			{canManage && changed && (
				<div className="flex justify-end">
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
						<FloppyDisk data-icon="inline-start" />
						{m["common.save"]()}
					</Button>
				</div>
			)}
		</div>
	);
}
