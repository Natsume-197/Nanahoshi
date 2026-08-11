import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Check, Desktop, Moon, Sun, Warning } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { HomeLayoutModal } from "@/components/dashboard/home/home-layout-modal";
import {
	SettingControlRow,
	SettingRows,
} from "@/components/settings/setting-rows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useHideCardText } from "@/hooks/use-card-display-preferences";
import { useCornerRadius } from "@/hooks/use-corner-radius";
import { useOnUnmount } from "@/hooks/use-on-unmount";
import { applyStoredTheme, type Theme, useTheme } from "@/hooks/use-theme";
import {
	buildCustomPalette,
	buildGradientPalette,
	buildSeedPalette,
	type ContrastWarning,
	type CustomThemeInput,
	checkCustomContrast,
	DEFAULT_CUSTOM_INPUT,
	DEFAULT_GRADIENT_INPUT,
	DEFAULT_SEED_INPUT,
	type GradientThemeInput,
	gradientInputFromSeed,
	type PaletteBase,
	previewCustomVars,
	previewGradientVars,
	previewSeedVars,
	randomGradientInput,
	type SeedThemeInput,
} from "@/lib/theme-palettes";
import { cancelThemePreview, previewTheme } from "@/lib/theme-preview";
import { RADIUS_MAX, RADIUS_MIN, RADIUS_STEP } from "@/lib/theme-radius";
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
					aria-label={label}
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

type CustomMode = "seed" | "gradient" | "advanced";

const CUSTOM_MODES = ["seed", "gradient", "advanced"] as const;

const CUSTOM_MODE_LABELS: Record<CustomMode, () => string> = {
	seed: m["settings.appearance.custom_mode_seed"],
	gradient: m["settings.appearance.custom_mode_gradient"],
	advanced: m["settings.appearance.custom_mode_advanced"],
};

const CUSTOM_MODE_DESCRIPTIONS: Record<CustomMode, () => string> = {
	seed: m["settings.appearance.custom_desc_seed"],
	gradient: m["settings.appearance.custom_desc_gradient"],
	advanced: m["settings.appearance.custom_desc"],
};

const MAX_GRADIENT_STOPS = 5;

function cloneGradientInput(input: GradientThemeInput): GradientThemeInput {
	return {
		...input,
		stops: input.stops.map((stop) => ({ ...stop })),
	};
}

function hasDefaultGradientDesign(input: GradientThemeInput) {
	const defaults = DEFAULT_GRADIENT_INPUT[input.base];
	return (
		input.angle === defaults.angle &&
		input.intensity === defaults.intensity &&
		input.stops.length === defaults.stops.length &&
		input.stops.every(
			(stop, index) => stop.color === defaults.stops[index]?.color,
		)
	);
}

function normalizeHexColor(value: string) {
	const candidate = value.startsWith("#") ? value : `#${value}`;
	return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toLowerCase() : null;
}

/** Selectable icon + label row with an active check. */
function OptionButton({
	icon: Icon,
	label,
	hint,
	isActive,
	onSelect,
}: {
	icon: PhosphorIcon;
	label: string;
	hint?: string;
	isActive: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={() => {
				if (!isActive) onSelect();
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
				{label}
				{hint && (
					<span className="block font-normal text-muted-foreground text-xs">
						{hint}
					</span>
				)}
			</span>
			{isActive && <Check className="size-4 shrink-0 text-primary" />}
		</button>
	);
}

export function AppearanceSettings() {
	const { theme, palette, setTheme, setPalette } = useTheme();
	const [hideCardText, setHideCardText] = useHideCardText();
	const { radius: cornerRadius, setRadius: setCornerRadius } =
		useCornerRadius();
	const initialSeed =
		palette?.seed ?? DEFAULT_SEED_INPUT[palette?.base ?? "dark"];
	const initialGradient =
		palette?.gradient ??
		(palette?.seed
			? gradientInputFromSeed(palette.seed)
			: DEFAULT_GRADIENT_INPUT.dark);
	const [custom, setCustom] = useState<CustomThemeInput>(
		() => palette?.custom ?? DEFAULT_CUSTOM_INPUT.dark,
	);
	const [gradient, setGradient] = useState<GradientThemeInput>(() =>
		cloneGradientInput(initialGradient),
	);
	const [seedInput, setSeedInput] = useState<SeedThemeInput>(() => initialSeed);
	const [mode, setMode] = useState<CustomMode>(() =>
		palette?.custom ? "advanced" : palette?.seed ? "seed" : "gradient",
	);
	const [selectedStopId, setSelectedStopId] = useState(
		() => initialGradient.stops[0]?.id ?? "",
	);
	const [hexDraft, setHexDraft] = useState(
		() => initialGradient.stops[0]?.color.toUpperCase() ?? "",
	);

	const didPreviewRef = useRef(false);
	const nextStopIdRef = useRef(0);

	const activeBase = {
		seed: seedInput.base,
		gradient: gradient.base,
		advanced: custom.base,
	}[mode];
	const warnings = mode === "advanced" ? checkCustomContrast(custom) : [];
	const selectedStop =
		gradient.stops.find((stop) => stop.id === selectedStopId) ??
		gradient.stops[0];
	const selectedStopNumber = Math.max(
		1,
		gradient.stops.findIndex((stop) => stop.id === selectedStop?.id) + 1,
	);

	useEffect(() => {
		if (!selectedStop?.id) {
			setHexDraft("");
			return;
		}
		setHexDraft(selectedStop.color.toUpperCase());
	}, [selectedStop?.color, selectedStop?.id]);

	// Editor changes apply live (coalesced to one frame); Apply commits.
	const previewGradient = (next: GradientThemeInput) => {
		setGradient(next);
		didPreviewRef.current = true;
		previewTheme(() => ({ base: next.base, vars: previewGradientVars(next) }));
	};
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
				untouched ? DEFAULT_SEED_INPUT[base] : { ...seedInput, base },
			);
			return;
		}
		if (mode === "gradient") {
			// Untouched defaults follow the base swap; edited recipes keep their design.
			const next = hasDefaultGradientDesign(gradient)
				? {
						...cloneGradientInput(DEFAULT_GRADIENT_INPUT[base]),
						stops: DEFAULT_GRADIENT_INPUT[base].stops.map((stop, index) => ({
							...stop,
							id: gradient.stops[index]?.id ?? stop.id,
						})),
					}
				: { ...gradient, base };
			previewGradient(next);
			if (!next.stops.some((stop) => stop.id === selectedStopId)) {
				setSelectedStopId(next.stops[0]?.id ?? "");
			}
			return;
		}
		const defaults = DEFAULT_CUSTOM_INPUT[custom.base];
		const untouched =
			custom.background === defaults.background &&
			custom.card === defaults.card &&
			custom.primary === defaults.primary;
		// Untouched colors follow the base swap; edited ones are kept.
		previewCustom(untouched ? DEFAULT_CUSTOM_INPUT[base] : { ...custom, base });
	};

	const selectMode = (next: CustomMode) => {
		if (next === mode) return;
		setMode(next);
		if (next === "seed") {
			previewSeed(seedInput);
			return;
		}
		if (next === "gradient") {
			previewGradient(gradient);
			return;
		}
		previewCustom(custom);
	};

	const updateSelectedColor = (color: string) => {
		if (!selectedStop) return;
		previewGradient({
			...gradient,
			stops: gradient.stops.map((stop) =>
				stop.id === selectedStop.id ? { ...stop, color } : stop,
			),
		});
	};

	const addGradientStop = () => {
		if (gradient.stops.length >= MAX_GRADIENT_STOPS) return;
		const selectedIndex = Math.max(
			0,
			gradient.stops.findIndex((stop) => stop.id === selectedStop?.id),
		);
		const id = `gradient-stop-${Date.now().toString(36)}-${nextStopIdRef.current++}`;
		const nextStops = [...gradient.stops];
		nextStops.splice(selectedIndex + 1, 0, {
			id,
			color: selectedStop?.color ?? "#7C3AED",
		});
		setSelectedStopId(id);
		previewGradient({ ...gradient, stops: nextStops });
	};

	const removeSelectedStop = () => {
		if (!selectedStop || gradient.stops.length <= 1) return;
		const selectedIndex = gradient.stops.findIndex(
			(stop) => stop.id === selectedStop.id,
		);
		const nextStops = gradient.stops.filter(
			(stop) => stop.id !== selectedStop.id,
		);
		setSelectedStopId(
			nextStops[Math.min(selectedIndex, nextStops.length - 1)]?.id ?? "",
		);
		previewGradient({ ...gradient, stops: nextStops });
	};

	const surpriseGradient = () => {
		const next = randomGradientInput(gradient);
		setSelectedStopId(next.stops[0]?.id ?? "");
		previewGradient(next);
	};

	const resetGradient = () => {
		const next = cloneGradientInput(DEFAULT_GRADIENT_INPUT[gradient.base]);
		setSelectedStopId(next.stops[0]?.id ?? "");
		previewGradient(next);
	};

	const applyCustom = () => {
		didPreviewRef.current = false;
		if (mode === "seed") {
			setPalette(buildSeedPalette(seedInput));
			return;
		}
		if (mode === "gradient") {
			setPalette(buildGradientPalette(gradient));
			return;
		}
		setPalette(buildCustomPalette(custom));
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
					{THEME_OPTIONS.map(({ value, label, hint, icon }) => (
						<OptionButton
							key={value}
							icon={icon}
							label={label()}
							hint={hint?.()}
							isActive={!palette && value === theme}
							onSelect={() => setTheme(value)}
						/>
					))}
				</SettingRows>
				<SettingRows>
					<SettingControlRow
						label={
							<h3 className="font-medium text-base text-foreground">
								{m["settings.appearance.corner_radius"]()}
							</h3>
						}
						description={m["settings.appearance.corner_radius_desc"]()}
					>
						<div className="flex w-full items-center justify-end gap-3 sm:w-72">
							<span className="text-muted-foreground text-xs tabular-nums">
								{cornerRadius.toFixed(2)}rem
							</span>
							<Slider
								min={RADIUS_MIN}
								max={RADIUS_MAX}
								step={RADIUS_STEP}
								value={[cornerRadius]}
								aria-label={m["settings.appearance.corner_radius"]()}
								onValueChange={([value]) => {
									if (value !== undefined) setCornerRadius(value);
								}}
							/>
						</div>
					</SettingControlRow>
				</SettingRows>
			</section>

			<section className="flex flex-col gap-6">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
					<div className="flex min-w-0 flex-col gap-1">
						<h2 className="font-semibold text-foreground text-xl">
							{m["nav.home"]()}
						</h2>
						<p className="max-w-xl text-muted-foreground text-sm">
							{m["home.organize_description"]()}
						</p>
					</div>
					<div className="shrink-0">
						<HomeLayoutModal />
					</div>
				</div>
				<SettingRows>
					<SettingControlRow
						label={
							<h3 className="font-medium text-base text-foreground">
								{m["settings.appearance.card_text"]()}
							</h3>
						}
						description={m["settings.appearance.card_text_desc"]()}
					>
						<Switch
							aria-label={m["settings.appearance.card_text"]()}
							checked={!hideCardText}
							onCheckedChange={(checked) => setHideCardText(!checked)}
						/>
					</SettingControlRow>
				</SettingRows>
			</section>

			<section className="flex flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-foreground text-xl">
						{m["settings.appearance.custom_title"]()}
					</h2>
					<p className="text-muted-foreground text-sm">
						{CUSTOM_MODE_DESCRIPTIONS[mode]()}
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
						<fieldset
							aria-label={m["settings.appearance.custom_mode"]()}
							className="flex gap-1 rounded-lg border-0 bg-muted p-1"
						>
							{CUSTOM_MODES.map((value) => (
								<button
									key={value}
									type="button"
									aria-pressed={mode === value}
									onClick={() => selectMode(value)}
									className={cn(
										"rounded-md px-3 py-1 text-xs transition-colors",
										mode === value
											? "bg-background font-medium text-foreground shadow-sm"
											: "text-muted-foreground",
									)}
								>
									{CUSTOM_MODE_LABELS[value]()}
								</button>
							))}
						</fieldset>
					</SettingControlRow>

					<SettingControlRow
						label={
							<span className="text-sm">{m["settings.appearance.base"]()}</span>
						}
					>
						<fieldset
							aria-label={m["settings.appearance.base"]()}
							className="flex gap-1 rounded-lg border-0 bg-muted p-1"
						>
							{(["light", "dark"] as const).map((base) => (
								<button
									key={base}
									type="button"
									aria-pressed={activeBase === base}
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
						</fieldset>
					</SettingControlRow>

					{mode === "seed" && (
						<ColorRow
							label={m["settings.appearance.color_seed"]()}
							value={seedInput.seed}
							onChange={(seed) => previewSeed({ ...seedInput, seed })}
						/>
					)}

					{mode === "gradient" && (
						<>
							<SettingControlRow
								label={
									<span className="text-sm">
										{m["settings.appearance.gradient_colors"]()}
									</span>
								}
								controlClassName="sm:w-80"
							>
								<div className="flex w-full flex-col gap-3">
									<div className="flex flex-wrap items-center gap-2">
										{gradient.stops.map((stop, index) => (
											<Button
												key={stop.id}
												type="button"
												variant="outline"
												size="icon"
												aria-label={`${m["settings.appearance.gradient_colors"]()} ${index + 1}`}
												aria-pressed={stop.id === selectedStop?.id}
												onClick={() => setSelectedStopId(stop.id)}
												className={cn(
													"rounded-xl",
													stop.id === selectedStop?.id &&
														"border-ring ring-2 ring-ring/30",
												)}
											>
												<span
													className="size-5 rounded-lg border border-border/60"
													style={{ backgroundColor: stop.color }}
												/>
											</Button>
										))}
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={addGradientStop}
											disabled={gradient.stops.length >= MAX_GRADIENT_STOPS}
										>
											{m["settings.appearance.gradient_add_color"]()}
										</Button>
									</div>

									<div className="flex items-center gap-2">
										<Input
											type="color"
											value={selectedStop?.color ?? "#000000"}
											onChange={(event) =>
												updateSelectedColor(event.target.value)
											}
											aria-label={`${m["settings.appearance.gradient_color_picker"]()} ${selectedStopNumber}`}
											className="size-8 shrink-0 cursor-pointer p-1"
										/>
										<Input
											type="text"
											value={hexDraft}
											maxLength={7}
											spellCheck={false}
											aria-label={`${m["settings.appearance.gradient_hex"]()} ${selectedStopNumber}`}
											aria-invalid={!normalizeHexColor(hexDraft)}
											className="font-mono uppercase"
											onChange={(event) => {
												const next = event.target.value.toUpperCase();
												setHexDraft(next);
												const color = normalizeHexColor(next);
												if (color) updateSelectedColor(color);
											}}
											onBlur={() => {
												const color = normalizeHexColor(hexDraft);
												setHexDraft(
													color?.toUpperCase() ??
														selectedStop?.color.toUpperCase() ??
														"",
												);
											}}
										/>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={removeSelectedStop}
											disabled={gradient.stops.length <= 1}
										>
											{m["settings.appearance.gradient_remove_color"]()}
										</Button>
									</div>
								</div>
							</SettingControlRow>

							<SettingControlRow
								label={
									<span className="text-sm">
										{m["settings.appearance.gradient_direction"]()}
									</span>
								}
							>
								<div className="flex w-full items-center gap-3 sm:w-72">
									<Slider
										value={[gradient.angle]}
										min={0}
										max={359}
										step={1}
										disabled={gradient.stops.length < 2}
										aria-label={m["settings.appearance.gradient_direction"]()}
										onValueChange={([value]) => {
											if (value !== undefined) {
												previewGradient({ ...gradient, angle: value });
											}
										}}
									/>
									<span className="w-10 text-right text-muted-foreground text-xs tabular-nums">
										{gradient.angle}°
									</span>
								</div>
							</SettingControlRow>

							<SettingControlRow
								label={
									<span className="text-sm">
										{m["settings.appearance.gradient_intensity"]()}
									</span>
								}
							>
								<div className="flex w-full items-center gap-3 sm:w-72">
									<Slider
										value={[gradient.intensity]}
										min={0}
										max={100}
										step={1}
										aria-label={m["settings.appearance.gradient_intensity"]()}
										onValueChange={([value]) => {
											if (value !== undefined) {
												previewGradient({ ...gradient, intensity: value });
											}
										}}
									/>
									<span className="w-10 text-right text-muted-foreground text-xs tabular-nums">
										{gradient.intensity}%
									</span>
								</div>
							</SettingControlRow>
						</>
					)}

					{mode === "advanced" && (
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
						<div className="flex flex-col gap-1.5 py-4">
							{warnings.map((warning) => (
								<p
									key={warning.key}
									className="flex items-start gap-2 text-warning text-xs"
								>
									<Warning className="mt-0.5 size-3.5 shrink-0" />
									{CONTRAST_MESSAGES[warning.key]({
										ratio: warning.ratio.toFixed(1),
									})}
								</p>
							))}
						</div>
					)}
				</SettingRows>

				<div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
					{mode === "gradient" ? (
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={surpriseGradient}
							>
								{m["settings.appearance.gradient_surprise"]()}
							</Button>
							<Button type="button" variant="ghost" onClick={resetGradient}>
								{m["settings.appearance.gradient_reset"]()}
							</Button>
						</div>
					) : (
						<span />
					)}
					<Button type="button" onClick={applyCustom}>
						{palette?.id === "custom" && <Check data-icon="inline-start" />}
						{m["settings.appearance.apply"]()}
					</Button>
				</div>
			</section>
		</div>
	);
}
