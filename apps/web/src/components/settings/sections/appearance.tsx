import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Check, Desktop, Moon, Sun, Warning } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import {
	SettingControlRow,
	SettingRows,
} from "@/components/settings/setting-rows";
import { Button } from "@/components/ui/button";
import { useOnUnmount } from "@/hooks/use-on-unmount";
import { applyStoredTheme, type Theme, useTheme } from "@/hooks/use-theme";
import {
	buildCustomPalette,
	buildSeedPalette,
	type ContrastWarning,
	type CustomThemeInput,
	checkCustomContrast,
	DEFAULT_CUSTOM_INPUT,
	DEFAULT_SEED_INPUT,
	type PaletteBase,
	previewCustomVars,
	previewSeedVars,
	type SeedThemeInput,
} from "@/lib/theme-palettes";
import { cancelThemePreview, previewTheme } from "@/lib/theme-preview";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

const THEME_OPTIONS: {
	value: Theme;
	label: () => string;
	hint?: () => string;
	icon: PhosphorIcon;
}[] = [
	{
		value: "light",
		label: m["settings.appearance.theme_light"],
		icon: Sun,
	},
	{
		value: "dark",
		label: m["settings.appearance.theme_dark"],
		icon: Moon,
	},
	{
		value: "system",
		label: m["settings.appearance.theme_system"],
		hint: m["settings.appearance.theme_system_desc"],
		icon: Desktop,
	},
];

function ColorRow({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (next: string) => void;
}) {
	return (
		<SettingControlRow label={<span className="text-sm">{label}</span>}>
			<label className="flex items-center justify-end gap-2">
				<span className="text-muted-foreground text-xs uppercase tabular-nums">
					{value}
				</span>
				<input
					type="color"
					value={value}
					onChange={(event) => onChange(event.target.value)}
					className="size-8 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
				/>
			</label>
		</SettingControlRow>
	);
}

const CONTRAST_MESSAGES: Record<
	ContrastWarning["key"],
	(args: { ratio: string }) => string
> = {
	fg_bg: m["settings.appearance.contrast_fg_bg"],
	fg_card: m["settings.appearance.contrast_fg_card"],
	primary_bg: m["settings.appearance.contrast_primary_bg"],
};

type CustomMode = "seed" | "advanced";

export function AppearanceSettings() {
	const { theme, palette, setTheme, setPalette } = useTheme();
	const [custom, setCustom] = useState<CustomThemeInput>(
		() => palette?.custom ?? DEFAULT_CUSTOM_INPUT.dark,
	);
	const [seedInput, setSeedInput] = useState<SeedThemeInput>(
		() => palette?.seed ?? DEFAULT_SEED_INPUT.dark,
	);
	const [mode, setMode] = useState<CustomMode>(() =>
		palette?.custom ? "advanced" : "seed",
	);

	const didPreviewRef = useRef(false);

	const activeBase = mode === "seed" ? seedInput.base : custom.base;
	const warnings = mode === "advanced" ? checkCustomContrast(custom) : [];
	const radius = mode === "seed" ? seedInput.radius : custom.radius;

	// Editor changes apply live (coalesced to one frame); Apply commits.
	const previewSeed = (next: SeedThemeInput) => {
		setSeedInput(next);
		didPreviewRef.current = true;
		previewTheme(() => ({ base: next.base, vars: previewSeedVars(next) }));
	};
	const previewCustom = (next: CustomThemeInput) => {
		setCustom(next);
		didPreviewRef.current = true;
		previewTheme(() => ({ base: next.base, vars: previewCustomVars(next) }));
	};

	const setBase = (base: PaletteBase) => {
		if (base === activeBase) return;
		if (mode === "seed") {
			// An untouched seed follows the base swap; an edited one is kept.
			const untouched =
				seedInput.seed === DEFAULT_SEED_INPUT[seedInput.base].seed;
			previewSeed(
				untouched
					? { ...DEFAULT_SEED_INPUT[base], radius: seedInput.radius }
					: { ...seedInput, base },
			);
			return;
		}
		const defaults = DEFAULT_CUSTOM_INPUT[custom.base];
		const untouched =
			custom.background === defaults.background &&
			custom.card === defaults.card &&
			custom.primary === defaults.primary;
		// Untouched colors follow the base swap; edited ones are kept.
		previewCustom(
			untouched
				? { ...DEFAULT_CUSTOM_INPUT[base], radius: custom.radius }
				: { ...custom, base },
		);
	};

	const setRadius = (next: number) => {
		if (mode === "seed") previewSeed({ ...seedInput, radius: next });
		else previewCustom({ ...custom, radius: next });
	};

	const applyCustom = () => {
		didPreviewRef.current = false;
		setPalette(
			mode === "seed"
				? buildSeedPalette(seedInput)
				: buildCustomPalette(custom),
		);
	};

	// Leaving the section with an uncommitted preview reverts to the saved theme.
	useOnUnmount(() => {
		if (!didPreviewRef.current) return;
		cancelThemePreview();
		applyStoredTheme();
	});

	return (
		<div className="flex flex-col gap-12">
			<section className="flex flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-foreground text-xl">
						{m["settings.appearance.title"]()}
					</h2>
					<p className="text-muted-foreground text-sm">
						{m["settings.appearance.desc"]()}
					</p>
				</div>
				<SettingRows>
					{THEME_OPTIONS.map(({ value, label, hint, icon: Icon }) => {
						const isActive = !palette && value === theme;
						return (
							<button
								key={value}
								type="button"
								onClick={() => {
									if (!isActive) setTheme(value);
								}}
								className={cn(
									"flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition-colors",
									isActive
										? "bg-muted font-medium text-foreground"
										: "text-muted-foreground hover:bg-muted/60 active:bg-muted",
								)}
							>
								<Icon className="size-5" />
								<span className="flex-1">
									{label()}
									{hint && (
										<span className="block font-normal text-muted-foreground text-xs">
											{hint()}
										</span>
									)}
								</span>
								{isActive && <Check className="size-4 shrink-0 text-primary" />}
							</button>
						);
					})}
				</SettingRows>
			</section>

			<section className="flex flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-foreground text-xl">
						{m["settings.appearance.custom_title"]()}
					</h2>
					<p className="text-muted-foreground text-sm">
						{mode === "seed"
							? m["settings.appearance.custom_desc_seed"]()
							: m["settings.appearance.custom_desc"]()}
					</p>
				</div>

				<SettingRows>
					<SettingControlRow
						label={
							<span className="text-sm">
								{m["settings.appearance.custom_mode"]()}
							</span>
						}
					>
						<div className="flex gap-1 rounded-lg bg-muted p-1">
							{(["seed", "advanced"] as const).map((value) => (
								<button
									key={value}
									type="button"
									onClick={() => setMode(value)}
									className={cn(
										"rounded-md px-3 py-1 text-xs transition-colors",
										mode === value
											? "bg-background font-medium text-foreground shadow-sm"
											: "text-muted-foreground",
									)}
								>
									{value === "seed"
										? m["settings.appearance.custom_mode_seed"]()
										: m["settings.appearance.custom_mode_advanced"]()}
								</button>
							))}
						</div>
					</SettingControlRow>

					<SettingControlRow
						label={
							<span className="text-sm">{m["settings.appearance.base"]()}</span>
						}
					>
						<div className="flex gap-1 rounded-lg bg-muted p-1">
							{(["light", "dark"] as const).map((base) => (
								<button
									key={base}
									type="button"
									onClick={() => setBase(base)}
									className={cn(
										"rounded-md px-3 py-1 text-xs transition-colors",
										activeBase === base
											? "bg-background font-medium text-foreground shadow-sm"
											: "text-muted-foreground",
									)}
								>
									{base === "light"
										? m["settings.appearance.theme_light"]()
										: m["settings.appearance.theme_dark"]()}
								</button>
							))}
						</div>
					</SettingControlRow>

					{mode === "seed" ? (
						<ColorRow
							label={m["settings.appearance.color_seed"]()}
							value={seedInput.seed}
							onChange={(seed) => previewSeed({ ...seedInput, seed })}
						/>
					) : (
						<>
							<ColorRow
								label={m["settings.appearance.color_background"]()}
								value={custom.background}
								onChange={(background) =>
									previewCustom({ ...custom, background })
								}
							/>
							<ColorRow
								label={m["settings.appearance.color_card"]()}
								value={custom.card}
								onChange={(card) => previewCustom({ ...custom, card })}
							/>
							<ColorRow
								label={m["settings.appearance.color_primary"]()}
								value={custom.primary}
								onChange={(primary) => previewCustom({ ...custom, primary })}
							/>
						</>
					)}

					{warnings.length > 0 && (
						<div className="space-y-1.5 py-4">
							{warnings.map((warning) => (
								<p
									key={warning.key}
									className="flex items-start gap-2 text-amber-700 text-xs dark:text-amber-400"
								>
									<Warning className="mt-0.5 size-3.5 shrink-0" />
									{CONTRAST_MESSAGES[warning.key]({
										ratio: warning.ratio.toFixed(1),
									})}
								</p>
							))}
						</div>
					)}

					<SettingControlRow
						label={
							<span className="text-sm">
								{m["settings.appearance.corner_radius"]()}
							</span>
						}
					>
						<label className="flex items-center justify-end gap-3">
							<span className="text-muted-foreground text-xs tabular-nums">
								{radius.toFixed(2)}rem
							</span>
							<input
								type="range"
								min={0}
								max={1.2}
								step={0.05}
								value={radius}
								onChange={(event) => setRadius(Number(event.target.value))}
								className="w-36 accent-primary"
							/>
						</label>
					</SettingControlRow>
				</SettingRows>

				<div className="flex justify-end">
					<Button type="button" onClick={applyCustom}>
						{palette?.id === "custom" && <Check data-icon="inline-start" />}
						{m["settings.appearance.apply"]()}
					</Button>
				</div>
			</section>
		</div>
	);
}
