import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/features/reading-sessions/segmented";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { client, orpc } from "@/utils/orpc";
import type { StatsGoals } from "./stats-model";

const PRESETS = {
	characters: [2000, 5000, 10000, 20000],
	minutes: [15, 30, 45, 60],
	listening: [15, 30, 60, 90],
};
const DEFAULTS = { characters: 5000, minutes: 30, listening: 30 };

function GoalField({
	title,
	enabled,
	onEnabledChange,
	value,
	onValueChange,
	presets,
	suffix,
	max,
	children,
}: {
	title: string;
	enabled: boolean;
	onEnabledChange: (enabled: boolean) => void;
	value: number;
	onValueChange: (value: number) => void;
	presets: number[];
	suffix: string;
	max: number;
	children?: React.ReactNode;
}) {
	const format = new Intl.NumberFormat(undefined, { useGrouping: "always" });
	return (
		<fieldset
			aria-label={title}
			className="space-y-3 rounded-2xl bg-foreground/[0.04] p-4"
		>
			<div className="flex min-h-9 items-center justify-between gap-3">
				<span className="font-medium">{title}</span>
				<Switch
					aria-label={title}
					checked={enabled}
					onCheckedChange={onEnabledChange}
				/>
			</div>
			{enabled && (
				<div className="space-y-3">
					{children}
					<label className="flex items-center gap-3">
						<input
							type="number"
							inputMode="numeric"
							min={1}
							max={max}
							required
							value={value || ""}
							onChange={(event) => onValueChange(Number(event.target.value))}
							className="min-h-11 w-full rounded-lg border bg-background px-3 text-base text-foreground tabular-nums"
						/>
						<span className="shrink-0 text-muted-foreground text-sm">
							{suffix}
						</span>
					</label>
					<div className="flex flex-wrap gap-2">
						{presets.map((preset) => (
							<button
								key={preset}
								type="button"
								aria-pressed={value === preset}
								onClick={() => onValueChange(preset)}
								className={cn(
									"min-h-9 rounded-full px-3 text-sm tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-ring",
									value === preset
										? "bg-foreground text-background"
										: "bg-foreground/[0.06] hover:bg-foreground/[0.1]",
								)}
							>
								{format.format(preset)}
							</button>
						))}
					</div>
				</div>
			)}
		</fieldset>
	);
}

export function GoalEditor({
	goals,
	media,
	onClose,
}: {
	goals: StatsGoals;
	media: ("reading" | "listening")[];
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [readingUnit, setReadingUnit] = useState(goals.readingUnit);
	// A first visit opens with every goal on, since setting one is why they came.
	const unset = goals.reading === null && goals.listeningMinutes === null;
	const [readingOn, setReadingOn] = useState(unset || goals.reading !== null);
	const [reading, setReading] = useState(
		goals.reading ?? DEFAULTS[goals.readingUnit],
	);
	const [listeningOn, setListeningOn] = useState(
		unset || goals.listeningMinutes !== null,
	);
	const [listening, setListening] = useState(
		goals.listeningMinutes ?? DEFAULTS.listening,
	);
	const mutation = useMutation({
		mutationFn: () =>
			client.readingSessions.setGoals({
				readingUnit,
				reading: readingOn ? reading : null,
				listeningMinutes: listeningOn ? listening : null,
			}),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				// Goals live in the preferences too, which the reader reads.
				queryKey: orpc.readingSessions.key(),
			});
			onClose();
		},
	});
	const valid =
		(!readingOn || reading >= 1) && (!listeningOn || listening >= 1);
	return (
		<Modal
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			title={m.stats_goal_title()}
			description={m.stats_goal_hint()}
			onSubmit={(event) => {
				event.preventDefault();
				if (valid) mutation.mutate();
			}}
			footer={
				<>
					<Button
						className="min-h-11"
						type="button"
						variant="outline"
						onClick={onClose}
					>
						{m.reading_cancel()}
					</Button>
					<Button
						className="min-h-11"
						type="submit"
						disabled={mutation.isPending || !valid}
					>
						{m.stats_save()}
					</Button>
				</>
			}
		>
			<div className="space-y-3">
				{media.includes("reading") && (
					<GoalField
						title={m.stats_goal_reading()}
						enabled={readingOn}
						onEnabledChange={setReadingOn}
						value={reading}
						onValueChange={setReading}
						presets={PRESETS[readingUnit]}
						suffix={
							readingUnit === "characters"
								? m.stats_unit_characters()
								: m.stats_unit_minutes()
						}
						max={readingUnit === "characters" ? 10_000_000 : 1440}
					>
						<Segmented
							label={m.stats_goal_unit()}
							value={readingUnit}
							options={[
								{ value: "characters", label: m.stats_unit_characters },
								{ value: "minutes", label: m.stats_unit_minutes },
							]}
							onChange={(unit) => {
								setReadingUnit(unit);
								setReading(DEFAULTS[unit]);
							}}
						/>
					</GoalField>
				)}
				{media.includes("listening") && (
					<GoalField
						title={m.stats_goal_listening()}
						enabled={listeningOn}
						onEnabledChange={setListeningOn}
						value={listening}
						onValueChange={setListening}
						presets={PRESETS.listening}
						suffix={m.stats_unit_minutes()}
						max={1440}
					/>
				)}
			</div>
			{mutation.isError && (
				<p role="alert" className="text-destructive text-sm">
					{m.reading_error()}
				</p>
			)}
		</Modal>
	);
}
