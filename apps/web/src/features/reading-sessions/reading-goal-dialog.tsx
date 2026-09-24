import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { m } from "@/paraglide/messages";
import { client } from "@/utils/orpc";
import { addDays } from "./reading-history-model";

export function ReadingGoalDialog({
	bookUuid,
	runId,
	goalDate,
	today,
	onClose,
	onSaved,
}: {
	bookUuid: string;
	runId: string;
	goalDate: string | null;
	today: string;
	onClose: () => void;
	onSaved: () => void;
}) {
	const [value, setValue] = useState(goalDate ?? addDays(today, 14));
	const mutation = useMutation({
		mutationFn: (next: string | null) =>
			client.readingSessions.setGoal({ bookUuid, id: runId, goalDate: next }),
		onSuccess: onSaved,
	});
	return (
		<Modal
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			title={m.reading_goal_title()}
			description={m.reading_goal_hint()}
			onSubmit={(event) => {
				event.preventDefault();
				mutation.mutate(value);
			}}
			footer={
				<>
					{goalDate && (
						<Button
							className="min-h-11 sm:mr-auto"
							type="button"
							variant="destructive"
							disabled={mutation.isPending}
							onClick={() => mutation.mutate(null)}
						>
							{m.reading_goal_remove()}
						</Button>
					)}
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
						disabled={mutation.isPending || !value}
					>
						{m.reading_save()}
					</Button>
				</>
			}
		>
			<label className="grid gap-2">
				{m.reading_goal_date()}
				<input
					required
					type="date"
					min={today}
					className="min-h-11 w-full rounded-lg border bg-background px-3 text-base text-foreground"
					value={value}
					onChange={(event) => setValue(event.target.value)}
				/>
			</label>
			{mutation.isError && (
				<p role="alert" className="text-destructive text-sm">
					{m.reading_error()}
				</p>
			)}
		</Modal>
	);
}
