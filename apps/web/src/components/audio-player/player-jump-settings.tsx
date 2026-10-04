import { Button } from "@nanahoshi/ui/components/button";
import { cn } from "@nanahoshi/ui/lib/utils";
import { memo } from "react";
import {
	JUMP_AMOUNTS,
	type JumpAmount,
} from "@/components/audio-player/player-preferences";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { m } from "@/paraglide/messages";

function AmountRow({
	label,
	value,
	onSelect,
	touch,
}: {
	label: string;
	value: JumpAmount;
	onSelect: (amount: JumpAmount) => void;
	touch: boolean;
}) {
	return (
		<div className="flex items-center gap-2">
			<span
				className={cn(
					"w-14 shrink-0 text-muted-foreground",
					touch ? "text-xs" : "text-[11px]",
				)}
			>
				{label}
			</span>
			<div className="grid flex-1 grid-cols-5 gap-1">
				{JUMP_AMOUNTS.map((amount) => (
					<Button
						key={amount}
						type="button"
						variant={amount === value ? "default" : "outline"}
						size="sm"
						onClick={() => onSelect(amount)}
						className={cn(
							"px-0 tabular-nums",
							touch ? "h-11 text-sm" : "h-7 text-xs",
						)}
					>
						{amount}s
					</Button>
				))}
			</div>
		</div>
	);
}

export const JumpSettings = memo(function JumpSettings({
	touch = false,
}: {
	/** Finger-sized rows, for the phone sheet. */
	touch?: boolean;
}) {
	const { jumpBack, jumpForward } = useAudioPlayerState();
	const { setJumpBack, setJumpForward } = useAudioPlayerActions();

	return (
		<div className={cn("flex flex-col", touch ? "gap-3" : "gap-2")}>
			<p className="font-medium text-xs">
				{m["audiobook.player_jump_title"]()}
			</p>
			<AmountRow
				label={m["audiobook.player_jump_back_label"]()}
				value={jumpBack}
				onSelect={setJumpBack}
				touch={touch}
			/>
			<AmountRow
				label={m["audiobook.player_jump_forward_label"]()}
				value={jumpForward}
				onSelect={setJumpForward}
				touch={touch}
			/>
		</div>
	);
});
