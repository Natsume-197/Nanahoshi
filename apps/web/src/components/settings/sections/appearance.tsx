import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import {
	ArrowCounterClockwise,
	Desktop,
	Moon,
	Palette,
	Shuffle,
	Sun,
	Warning,
} from "@phosphor-icons/react";
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
	type StoredPalette,
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
		<div className="flex h-11 min-w-0 items-center justify-between gap-3 rounded-xl bg-surface-card px-3">
			<span className="min-w-0 flex-1 text-sm">{label}</span>
			<label className="flex shrink-0 items-center justify-end gap-2">
				<span className="text-muted-foreground text-xs uppercase tabular-nums">
					{value}
				</span>
				<input
					type="color"
					aria-label={label}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					className="size-8 cursor-pointer rounded-full border border-border bg-transparent p-0.5 transition-transform hover:scale-105"
				/>
			</label>
		</div>
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

const THEME_PRESETS = [
	{
		id: "rose",
		label: () => m["settings.appearance.preset_rose"](),
		colors: ["#ec4899", "#f9a8d4", "#881337"],
	},
	{
		id: "forest",
		label: () => m["settings.appearance.preset_forest"](),
		colors: ["#34d399", "#fde68a", "#14532d"],
	},
	{
		id: "ocean",
		label: () => m["settings.appearance.preset_ocean"](),
		colors: ["#38bdf8", "#a5f3fc", "#164e63"],
	},
	{
		id: "ember",
		label: () => m["settings.appearance.preset_ember"](),
		colors: ["#fb923c", "#fed7aa", "#7c2d12"],
	},
	{
		id: "iris",
		label: () => m["settings.appearance.preset_iris"](),
		colors: ["#a78bfa", "#f5d0fe", "#4c1d95"],
	},
];

/** A small schematic of the app, drawn with CSS so no image assets are needed. */
function SchemeIllustration({ scheme }: { scheme: Theme }) {
	const renderSurface = (dark: boolean) => (
		<div
			className="absolute inset-0 flex"
			style={{
				background: dark ? "#242129" : "#f3f7f5",
				color: dark ? "#e5ddea" : "#344a42",
			}}
		>
			<div
				className="flex w-[23%] flex-col gap-1.5 p-[4%]"
				style={{ background: dark ? "#1b181f" : "#e0ebe5" }}
			>
				{[0, 1, 2, 3].map((i) => (
					<span
						key={i}
						className="h-2 rounded-full"
						style={{
							background: "currentColor",
							opacity: i === 1 ? 0.24 : 0.09,
						}}
					/>
				))}
			</div>
			<div className="relative flex-1 p-[5%]">
				<div className="mb-3 ml-auto h-2 w-1/3 rounded-full bg-current opacity-15" />
				<div className="h-2 w-3/5 rounded-full bg-current opacity-20" />
				<div className="mt-1.5 h-2 w-2/5 rounded-full bg-current opacity-15" />
				<div className="absolute right-[6%] bottom-[9%] left-[6%] flex h-5 items-center justify-between rounded-md bg-current/5 px-2 ring-1 ring-current/10">
					<span className="h-1.5 w-1/3 rounded-full bg-current opacity-15" />
					<span
						className="size-2.5 rounded-full"
						style={{ background: dark ? "#a78bfa" : "#4f8271" }}
					/>
				</div>
			</div>
		</div>
	);
	return (
		<div
			aria-hidden="true"
			className="relative aspect-[1.9] w-full overflow-hidden rounded-xl"
		>
			{renderSurface(scheme === "dark")}
			{scheme === "system" && (
				<div className="absolute inset-0 [clip-path:inset(0_0_0_50%)]">
					{renderSurface(true)}
				</div>
			)}
		</div>
	);
}

function ThemeOrb({
	colors,
	base,
	label,
	active,
	onSelect,
}: {
	colors: string[];
	base: PaletteBase;
	label: string;
	active: boolean;
	onSelect: () => void;
}) {
	const Icon = base === "dark" ? Moon : Sun;
	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={active}
			onClick={onSelect}
			className={cn(
				"relative size-10 shrink-0 rounded-full p-1 transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4 sm:size-16 min-[360px]:size-14",
				active && "ring-2 ring-primary ring-offset-2 ring-offset-surface-card",
			)}
		>
			<span
				className="block size-full rounded-full shadow-md ring-1 ring-black/5"
				style={{
					background: `radial-gradient(at 32% 25%, ${colors[0]}, transparent 65%), radial-gradient(at 75% 80%, ${colors[1]}, transparent 65%), ${base === "light" ? "#faf5f1" : colors[2]}`,
				}}
			/>
			<span className="absolute -right-1 -bottom-1 rounded-full bg-surface-card p-1 text-foreground">
				<Icon className="size-3" />
			</span>
		</button>
	);
}

export function AppearanceSettings({
	customizer = false,
	onCustomize,
}: {
	customizer?: boolean;
	onCustomize?: () => void;
} = {}) {
	const { theme, palette, setTheme, setPalette } = useTheme();
	const [hideCardText, setHideCardText] = useHideCardText();
	const { radius: cornerRadius, setRadius: setCornerRadius } =
		useCornerRadius();
	const initialBase =
		palette?.base ??
		(theme === "light"
			? "light"
			: theme === "dark"
				? "dark"
				: typeof document === "undefined" ||
						document.documentElement.classList.contains("dark")
					? "dark"
					: "light");
	const [dirty, setDirty] = useState(false);
	const initialSeed = palette?.seed ?? DEFAULT_SEED_INPUT[initialBase];
	const initialGradient =
		palette?.gradient ??
		(palette?.seed
			? gradientInputFromSeed(palette.seed)
			: DEFAULT_GRADIENT_INPUT[initialBase]);
	const [custom, setCustom] = useState<CustomThemeInput>(
		() => palette?.custom ?? DEFAULT_CUSTOM_INPUT[initialBase],
	);
	const [gradient, setGradient] = useState<GradientThemeInput>(() =>
		cloneGradientInput(initialGradient),
	);
	const [seedInput, setSeedInput] = useState<SeedThemeInput>(() => initialSeed);
	const [mode, setMode] = useState<CustomMode>(() =>
		palette?.custom ? "advanced" : palette?.gradient ? "gradient" : "seed",
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
		setDirty(true);
		previewTheme(() => ({ base: next.base, vars: previewGradientVars(next) }));
	};
	const previewSeed = (next: SeedThemeInput) => {
		setSeedInput(next);
		didPreviewRef.current = true;
		setDirty(true);
		previewTheme(() => ({ base: next.base, vars: previewSeedVars(next) }));
	};
	const previewCustom = (next: CustomThemeInput) => {
		setCustom(next);
		didPreviewRef.current = true;
		setDirty(true);
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
			previewSeed({ ...seedInput, base: activeBase });
			return;
		}
		if (next === "gradient") {
			previewGradient({ ...gradient, base: activeBase });
			return;
		}
		previewCustom(
			custom.base === activeBase ? custom : DEFAULT_CUSTOM_INPUT[activeBase],
		);
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

	const discardCustom = () => {
		cancelThemePreview();
		applyStoredTheme();
		didPreviewRef.current = false;
		setDirty(false);
		setSeedInput(initialSeed);
		setGradient(cloneGradientInput(initialGradient));
		setCustom(palette?.custom ?? DEFAULT_CUSTOM_INPUT[initialBase]);
		setMode(
			palette?.custom ? "advanced" : palette?.gradient ? "gradient" : "seed",
		);
	};

	const applyCustom = () => {
		setDirty(false);
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

	const choosePalette = (next: StoredPalette) => {
		didPreviewRef.current = false;
		setDirty(false);
		setPalette(next);
		setSeedInput(next.seed ?? DEFAULT_SEED_INPUT[next.base]);
		setGradient(
			cloneGradientInput(next.gradient ?? DEFAULT_GRADIENT_INPUT[next.base]),
		);
		setCustom(next.custom ?? DEFAULT_CUSTOM_INPUT[next.base]);
		setMode(next.custom ? "advanced" : next.gradient ? "gradient" : "seed");
	};
	const choosePlainTheme = (next: Theme) => {
		didPreviewRef.current = false;
		setDirty(false);
		setTheme(next);
		const base =
			next === "system"
				? window.matchMedia("(prefers-color-scheme: dark)").matches
					? "dark"
					: "light"
				: next;
		setSeedInput(DEFAULT_SEED_INPUT[base]);
		setGradient(cloneGradientInput(DEFAULT_GRADIENT_INPUT[base]));
		setCustom(DEFAULT_CUSTOM_INPUT[base]);
		setMode("seed");
	};
	const chooseScheme = (next: Theme) => {
		if (!palette || next === "system") {
			choosePlainTheme(next);
			return;
		}
		const updated = palette.gradient
			? buildGradientPalette({ ...palette.gradient, base: next })
			: palette.seed
				? buildSeedPalette({ ...palette.seed, base: next })
				: palette.custom
					? buildCustomPalette({ ...palette.custom, base: next })
					: null;
		if (updated) choosePalette({ ...updated, id: palette.id });
		else choosePlainTheme(next);
	};
	const openEditor = () => {
		onCustomize?.();
	};

	// Leaving the section with an uncommitted preview reverts to the saved theme.
	useOnUnmount(() => {
		if (!didPreviewRef.current) return;
		cancelThemePreview();
		applyStoredTheme();
	});

	return (
		<div className={cn("flex flex-col", !customizer && "gap-8")}>
			{!customizer && (
				<section className="flex flex-col gap-6">
					<div className="flex flex-col gap-1">
						<h2 className="font-semibold text-foreground text-xl">
							{m["settings.appearance.title"]()}
						</h2>
						<p className="text-muted-foreground text-sm">
							{m["settings.appearance.desc"]()}
						</p>
					</div>
					<h3 className="font-medium text-sm">
						{m["settings.appearance.color_scheme"]()}
					</h3>
					<div className="grid grid-cols-3 gap-2 sm:gap-3">
						{[THEME_OPTIONS[2], THEME_OPTIONS[0], THEME_OPTIONS[1]].map(
							({ value, label, hint }) => (
								<button
									key={value}
									type="button"
									aria-label={label()}
									title={hint?.()}
									aria-pressed={value === theme}
									onClick={() => chooseScheme(value)}
									className={cn(
										"flex min-w-0 flex-col items-center gap-2 rounded-2xl bg-surface-card p-2 text-sm transition-colors hover:bg-surface-card-hover focus-visible:outline-2 focus-visible:outline-ring sm:p-3",
										value === theme && "ring-1 ring-primary",
									)}
								>
									<SchemeIllustration scheme={value} />
									<span>{label()}</span>
								</button>
							),
						)}
					</div>
				</section>
			)}

			{!customizer && (
				<section className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h3 className="font-medium">{m["settings.appearance.themes"]()}</h3>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={openEditor}
						>
							<Palette />
							{m["settings.appearance.customize"]()}
						</Button>
					</div>
					<div className="grid grid-cols-2 gap-3 md:grid-cols-3">
						<div className="flex flex-col gap-5 rounded-2xl bg-surface-card p-4">
							<div className="flex justify-center gap-3 py-2 sm:gap-5">
								{(["light", "dark"] as const).map((base) => (
									<ThemeOrb
										key={base}
										colors={
											base === "light"
												? ["#ffffff", "#ddd6fe", "#e5e7eb"]
												: ["#383b50", "#18181b", "#17171c"]
										}
										base={base}
										label={`Nanahoshi · ${base === "light" ? m["settings.appearance.theme_light"]() : m["settings.appearance.theme_dark"]()}`}
										active={!palette && initialBase === base}
										onSelect={() => choosePlainTheme(base)}
									/>
								))}
							</div>
							<span className="font-medium text-sm">Nanahoshi</span>
						</div>
						{THEME_PRESETS.map((preset) => (
							<div
								key={preset.id}
								className="flex flex-col gap-5 rounded-2xl bg-surface-card p-4"
							>
								<div className="flex justify-center gap-3 py-2 sm:gap-5">
									{(["light", "dark"] as const).map((base) => (
										<ThemeOrb
											key={base}
											colors={
												base === "light"
													? [
															preset.colors[0],
															preset.colors[1],
															preset.colors[2],
														]
													: [preset.colors[2], preset.colors[0], "#17171c"]
											}
											base={base}
											label={`${preset.label()} · ${base === "light" ? m["settings.appearance.theme_light"]() : m["settings.appearance.theme_dark"]()}`}
											active={
												palette?.id === `preset-${preset.id}` &&
												palette.base === base
											}
											onSelect={() =>
												choosePalette({
													...buildGradientPalette({
														base,
														stops: preset.colors.map((color, index) => ({
															id: `color-${index}`,
															color,
														})),
														angle: 135,
														intensity: base === "light" ? 35 : 50,
													}),
													id: `preset-${preset.id}`,
												})
											}
										/>
									))}
								</div>
								<span className="font-medium text-sm">{preset.label()}</span>
							</div>
						))}
					</div>
				</section>
			)}
			{customizer && (
				<section className="flex flex-col gap-5">
					<div>
						<h3 className="font-semibold text-sm">
							{m["settings.appearance.custom_title"]()}
						</h3>
						<p className="mt-1 text-muted-foreground text-xs leading-5">
							{m["settings.appearance.editor_desc"]()}
						</p>
					</div>

					<div>
						<p className="mb-1.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
							{m["settings.appearance.custom_mode"]()}
						</p>
						<fieldset
							aria-label={m["settings.appearance.custom_mode"]()}
							className="grid min-w-0 grid-cols-3 gap-1 rounded-xl border-0 bg-surface-card p-1"
						>
							{CUSTOM_MODES.map((value) => (
								<button
									key={value}
									type="button"
									aria-pressed={mode === value}
									onClick={() => selectMode(value)}
									className={cn(
										"min-w-0 rounded-lg px-2 py-2 text-center font-medium text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring",
										mode === value
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									<span className="truncate">
										{CUSTOM_MODE_LABELS[value]()}
									</span>
								</button>
							))}
						</fieldset>
						<p className="mt-2 text-muted-foreground text-xs leading-5">
							{CUSTOM_MODE_DESCRIPTIONS[mode]()}
						</p>
					</div>
					<SettingRows>
						<div className="rounded-xl bg-surface-card p-3">
							<p className="mb-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
								{m["settings.appearance.base"]()}
							</p>
							<fieldset
								aria-label={m["settings.appearance.base"]()}
								className="grid grid-cols-2 gap-1 rounded-lg border-0 bg-muted p-1"
							>
								{(["light", "dark"] as const).map((base) => (
									<button
										key={base}
										type="button"
										aria-pressed={activeBase === base}
										onClick={() => setBase(base)}
										className={cn(
											"rounded-md px-3 py-1.5 text-xs transition-colors",
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
						</div>

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
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={surpriseGradient}
											>
												<Shuffle />
												{m["settings.appearance.gradient_surprise"]()}
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={resetGradient}
											>
												<ArrowCounterClockwise />
												{m["settings.appearance.gradient_reset"]()}
											</Button>
										</div>

										<div className="flex flex-wrap items-center gap-2">
											{gradient.stops.map((stop, index) => (
												<Button
													key={stop.id}
													type="button"
													variant="ghost"
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
												variant="ghost"
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
												variant="ghost"
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
					<div className="sticky -bottom-5 z-10 -mx-5 flex flex-wrap items-center justify-between gap-3 border-border border-t bg-background/95 px-5 pt-4 pb-1 backdrop-blur-sm">
						<p role="status" className="text-muted-foreground text-sm">
							{dirty
								? m["settings.appearance.unsaved"]()
								: m["settings.appearance.saved"]()}
						</p>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="ghost"
								disabled={!dirty}
								onClick={discardCustom}
							>
								{m["settings.appearance.discard"]()}
							</Button>
							<Button type="button" disabled={!dirty} onClick={applyCustom}>
								{m["settings.appearance.apply"]()}
							</Button>
						</div>
					</div>
				</section>
			)}
			{!customizer && (
				<section className="flex flex-col gap-6">
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
			)}
			{!customizer && (
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
			)}
		</div>
	);
}
