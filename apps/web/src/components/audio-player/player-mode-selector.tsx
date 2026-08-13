import { useId } from "react";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

const PLAYER_MODES = ["listen", "read-listen"] as const;

export function PlayerModeSelector({
	mode,
	onModeChange,
}: {
	mode: "listen" | "read-listen";
	onModeChange: (mode: "listen" | "read-listen") => void;
}) {
	const groupName = useId();

	return (
		<fieldset className="pointer-events-auto flex h-9 max-w-full shrink-0 items-center rounded-full border-0 bg-black/30 p-1 shadow-[inset_0_1px_0_oklch(1_0_0/0.08)]">
			<legend className="sr-only">
				{m["read_listen.mode_selector_label"]()}
			</legend>
			{(
				[
					["listen", m["audiobook.listen"]()],
					["read-listen", m["read_listen.title"]()],
				] as const
			).map(([value, label], index) => (
				<label key={value} className="cursor-pointer">
					<input
						type="radio"
						name={groupName}
						value={value}
						data-player-mode={value}
						checked={mode === value}
						tabIndex={mode === value ? 0 : -1}
						onChange={() => onModeChange(value)}
						onKeyDown={(event) => {
							const nextIndex =
								event.key === "ArrowRight" || event.key === "ArrowDown"
									? (index + 1) % PLAYER_MODES.length
									: event.key === "ArrowLeft" || event.key === "ArrowUp"
										? (index - 1 + PLAYER_MODES.length) % PLAYER_MODES.length
										: event.key === "Home"
											? 0
											: event.key === "End"
												? PLAYER_MODES.length - 1
												: null;
							if (nextIndex === null) return;
							event.preventDefault();
							const nextMode = PLAYER_MODES[nextIndex];
							const nextInput = event.currentTarget
								.closest("fieldset")
								?.querySelector<HTMLInputElement>(
									`[data-player-mode="${nextMode}"]`,
								);
							nextInput?.focus();
							onModeChange(nextMode);
						}}
						className="peer sr-only"
					/>
					<span
						className={cn(
							"flex h-7 min-w-16 items-center justify-center rounded-full px-3 font-semibold text-xs transition-[background-color,color,box-shadow] duration-150 active:scale-[0.96] peer-focus-visible:ring-2 peer-focus-visible:ring-white/80 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-black/30 motion-reduce:transition-none motion-reduce:active:scale-100",
							mode === value
								? "bg-white text-black shadow-[0_1px_4px_oklch(0_0_0/0.24)]"
								: "text-white/75 hover:text-white",
						)}
					>
						{label}
					</span>
				</label>
			))}
		</fieldset>
	);
}
