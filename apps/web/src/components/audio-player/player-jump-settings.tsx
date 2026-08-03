import { memo } from "react";
import {
	JUMP_AMOUNTS,
	type JumpAmount,
} from "@/components/audio-player/player-preferences";
import { Button } from "@/components/ui/button";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { m } from "@/paraglide/messages";

function AmountRow({
	label,
	value,
	onSelect,
}: {
	label: string;
	value: JumpAmount;
	onSelect: (amount: JumpAmount) => void;
}) {
	return (
		<div className="flex items-center gap-2">
			<span className="w-14 shrink-0 text-[11px] text-muted-foreground">
				{label}
			</span>
			<div className="grid flex-1 grid-cols-4 gap-1">
				{JUMP_AMOUNTS.map((amount) => (
					<Button
						key={amount}
						type="button"
						variant={amount === value ? "default" : "outline"}
						size="sm"
						onClick={() => onSelect(amount)}
						className="h-7 px-0 text-xs tabular-nums"
					>
						{amount}s
					</Button>
				))}
			</div>
		</div>
	);
}

export const JumpSettings = memo(function JumpSettings() {
	const { jumpBack, jumpForward } = useAudioPlayerState();
	const { setJumpBack, setJumpForward } = useAudioPlayerActions();

	return (
		<div className="flex flex-col gap-2">
			<p className="font-medium text-xs">
				{m["audiobook.player_jump_title"]()}
			</p>
			<AmountRow
				label={m["audiobook.player_jump_back_label"]()}
				value={jumpBack}
				onSelect={setJumpBack}
			/>
			<AmountRow
				label={m["audiobook.player_jump_forward_label"]()}
				value={jumpForward}
				onSelect={setJumpForward}
			/>
		</div>
	);
});
