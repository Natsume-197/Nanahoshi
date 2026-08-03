import { GearSix } from "@phosphor-icons/react";
import { memo } from "react";
import { PlayerPopoverButton } from "@/components/audio-player/player-controls";
import { JumpSettings } from "@/components/audio-player/player-jump-settings";
import { SleepSettings } from "@/components/audio-player/player-sleep-control";
import { SpeedSettings } from "@/components/audio-player/player-speed-control";
import { Separator } from "@/components/ui/separator";
import { m } from "@/paraglide/messages";

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
		</PlayerPopoverButton>
	);
});
