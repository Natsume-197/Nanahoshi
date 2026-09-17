import { GearSix } from "@phosphor-icons/react";
import { memo } from "react";
import { PlayerPopoverButton } from "@/components/audio-player/player-controls";
import { JumpSettings } from "@/components/audio-player/player-jump-settings";
import { SleepSettings } from "@/components/audio-player/player-sleep-control";
import { SpeedSettings } from "@/components/audio-player/player-speed-control";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { m } from "@/paraglide/messages";

const AutoplayNextSetting = memo(function AutoplayNextSetting() {
	const { autoplayNext } = useAudioPlayerState();
	const { setAutoplayNext } = useAudioPlayerActions();
	return (
		<div className="flex items-center justify-between gap-2">
			<span id="autoplay-next-label" className="font-medium text-xs">
				{m["audiobook.player_autoplay_next"]()}
			</span>
			<Switch
				checked={autoplayNext}
				onCheckedChange={setAutoplayNext}
				aria-labelledby="autoplay-next-label"
			/>
		</div>
	);
});

/**
 * Gear popover grouping the secondary playback settings so the compact player
 * bar doesn't grow with each new option.
 */
export const PlayerSettings = memo(function PlayerSettings({
	side = "top",
}: {
	side?: "top" | "bottom";
}) {
	return (
		<PlayerPopoverButton
			label={m["audiobook.player_settings"]()}
			side={side}
			align="end"
			contentClassName="w-64 gap-3"
			trigger={<GearSix className="size-4" />}
		>
			<SpeedSettings />
			<Separator />
			<SleepSettings />
			<Separator />
			<JumpSettings />
			<Separator />
			<AutoplayNextSetting />
		</PlayerPopoverButton>
	);
});
