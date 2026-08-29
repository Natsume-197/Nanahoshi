import {
	type KeyboardEvent,
	type PointerEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	type CustomReaderThemes,
	getReaderTheme,
	type ReaderTheme,
	type ReaderThemeColors,
	readerThemes,
} from "@/features/reader/presentation/settings";
import {
	readerMix,
	ThemedOption,
	ThemedSelect,
} from "@/features/reader/ui/controls/reader-controls";

interface CustomThemeValue {
	hexExpression: string;
	alphaValue: number;
	rgbaExpression: string;
}

type ThemeAttribute = keyof ReaderThemeColors;

type CustomThemeDraft = Record<ThemeAttribute, CustomThemeValue>;

const NANAHOSHI_THEME_ID = "nanahoshi-theme";

interface HsvColor {
	h: number;
	s: number;
	v: number;
}

const clampColorValue = (value: number) => Math.min(1, Math.max(0, value));

function hexToHsv(hex: string): HsvColor {
	const numeric = Number.parseInt(hex.slice(1), 16);
	const red = ((numeric >> 16) & 255) / 255;
	const green = ((numeric >> 8) & 255) / 255;
	const blue = (numeric & 255) / 255;
	const max = Math.max(red, green, blue);
	const min = Math.min(red, green, blue);
	const delta = max - min;
	let hue = 0;

	if (delta !== 0) {
		if (max === red) hue = ((green - blue) / delta) % 6;
		else if (max === green) hue = (blue - red) / delta + 2;
		else hue = (red - green) / delta + 4;
		hue *= 60;
		if (hue < 0) hue += 360;
	}

	return { h: hue, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToHex({ h, s, v }: HsvColor): string {
	const hue = ((h % 360) + 360) % 360;
	const chroma = v * s;
	const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
	const match = v - chroma;
	const [red, green, blue] =
		hue < 60
			? [chroma, x, 0]
			: hue < 120
				? [x, chroma, 0]
				: hue < 180
					? [0, chroma, x]
					: hue < 240
						? [0, x, chroma]
						: hue < 300
							? [x, 0, chroma]
							: [chroma, 0, x];

	return `#${[red, green, blue]
		.map((channel) =>
			Math.round((channel + match) * 255)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
}

function hexToRgbValue(hex: string) {
	const numeric = Number.parseInt(hex.slice(1), 16);
	return `${numeric >> 16}, ${(numeric >> 8) & 255}, ${numeric & 255}`;
}

function rgbToHex(value: string): string | null {
	const channels = value
		.split(/[\s,]+/)
		.filter(Boolean)
		.map(Number);
	if (
		channels.length !== 3 ||
		channels.some(
			(channel) => !Number.isInteger(channel) || channel < 0 || channel > 255,
		)
	) {
		return null;
	}
	return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRGB(h: string, alpha: number) {
	let r = "0";
	let g = "0";
	let b = "0";

	if (h.length === 4) {
		r = `0x${h[1]}${h[1]}`;
		g = `0x${h[2]}${h[2]}`;
		b = `0x${h[3]}${h[3]}`;
	} else if (h.length === 7) {
		r = `0x${h[1]}${h[2]}`;
		g = `0x${h[3]}${h[4]}`;
		b = `0x${h[5]}${h[6]}`;
	}

	return `rgba(${+r},${+g},${+b},${alpha})`;
}

function oklchToRgb(lightness: number, chroma: number, hue: number) {
	const angle = (hue * Math.PI) / 180;
	const a = chroma * Math.cos(angle);
	const b = chroma * Math.sin(angle);
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const linear = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
	return linear.map((channel) => {
		const srgb =
			channel <= 0.0031308
				? 12.92 * channel
				: 1.055 * channel ** (1 / 2.4) - 0.055;
		return Math.round(Math.min(1, Math.max(0, srgb)) * 255);
	}) as [number, number, number];
}

function parseThemeColor(value: string): [number, number, number, number] {
	const rgba = value.match(/rgba?\((.+)\)/)?.[1]?.split(",");
	if (rgba) {
		const [red, green, blue, alpha = 1] = rgba.map((part) =>
			Number.parseFloat(part.trim()),
		);
		return [red ?? 0, green ?? 0, blue ?? 0, alpha ?? 1];
	}

	const oklch = value.match(
		/oklch\(\s*([\d.]+)(%)?\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/i,
	);
	if (oklch) {
		const lightness = Number.parseFloat(oklch[1]) / (oklch[2] ? 100 : 1);
		const [red, green, blue] = oklchToRgb(
			lightness,
			Number.parseFloat(oklch[3]),
			Number.parseFloat(oklch[4]),
		);
		return [red, green, blue, Number.parseFloat(oklch[5] ?? "1")];
	}

	return [0, 0, 0, 1];
}

function getThemeData(referenceObject: ReaderThemeColors): CustomThemeDraft {
	const result = {} as CustomThemeDraft;

	for (const [key, value] of Object.entries(referenceObject)) {
		const [r, g, b, a] = parseThemeColor(value);

		result[key as ThemeAttribute] = {
			hexExpression: `#${r.toString(16).padStart(2, "0")}${g
				.toString(16)
				.padStart(2, "0")}${b.toString(16).padStart(2, "0")}`,
			alphaValue: a ?? 1,
			rgbaExpression: value,
		};
	}

	return result;
}

function getDraftColors(customTheme: CustomThemeDraft): ReaderThemeColors {
	const colors = {} as Record<ThemeAttribute, string>;
	for (const [key, value] of Object.entries(customTheme)) {
		colors[key as ThemeAttribute] = value.rgbaExpression;
	}
	return colors;
}

interface ColorInputRowProps {
	label: string;
	attribute: ThemeAttribute;
	values: CustomThemeValue;
	surfaceColor: string;
	onColorChange: (attribute: ThemeAttribute, value: string) => void;
}

function ColorInputRow({
	label,
	attribute,
	values,
	surfaceColor,
	onColorChange,
}: ColorInputRowProps) {
	const [open, setOpen] = useState(false);
	const [hsv, setHsv] = useState(() => hexToHsv(values.hexExpression));
	const [hexDraft, setHexDraft] = useState(values.hexExpression);
	const [rgbDraft, setRgbDraft] = useState(() =>
		hexToRgbValue(values.hexExpression),
	);
	const [isDragging, setIsDragging] = useState(false);

	useEffect(() => {
		setHsv(hexToHsv(values.hexExpression));
		setHexDraft(values.hexExpression);
		setRgbDraft(hexToRgbValue(values.hexExpression));
	}, [values.hexExpression]);

	const commitHsv = (nextHsv: HsvColor) => {
		setHsv(nextHsv);
		const nextColor = hsvToHex(nextHsv);
		setHexDraft(nextColor);
		setRgbDraft(hexToRgbValue(nextColor));
		onColorChange(attribute, nextColor);
	};

	const updatePlane = (event: PointerEvent<HTMLDivElement>) => {
		const bounds = event.currentTarget.getBoundingClientRect();
		commitHsv({
			...hsv,
			s: clampColorValue((event.clientX - bounds.left) / bounds.width),
			v: 1 - clampColorValue((event.clientY - bounds.top) / bounds.height),
		});
	};

	const updateHue = (event: PointerEvent<HTMLDivElement>) => {
		const bounds = event.currentTarget.getBoundingClientRect();
		commitHsv({
			...hsv,
			h: clampColorValue((event.clientX - bounds.left) / bounds.width) * 360,
		});
	};

	const handlePlaneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (
			!["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.key)
		)
			return;
		event.preventDefault();
		const step = event.shiftKey ? 0.1 : 0.02;
		commitHsv({
			...hsv,
			s:
				event.key === "ArrowLeft"
					? clampColorValue(hsv.s - step)
					: event.key === "ArrowRight"
						? clampColorValue(hsv.s + step)
						: hsv.s,
			v:
				event.key === "ArrowDown"
					? clampColorValue(hsv.v - step)
					: event.key === "ArrowUp"
						? clampColorValue(hsv.v + step)
						: hsv.v,
		});
	};

	const handleHueKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (
			!["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.key)
		)
			return;
		event.preventDefault();
		const step = event.shiftKey ? 10 : 1;
		const direction =
			event.key === "ArrowDown" || event.key === "ArrowLeft" ? -1 : 1;
		commitHsv({ ...hsv, h: (hsv.h + direction * step + 360) % 360 });
	};

	const beginDrag =
		(update: (event: PointerEvent<HTMLDivElement>) => void) =>
		(event: PointerEvent<HTMLDivElement>) => {
			event.currentTarget.setPointerCapture(event.pointerId);
			setIsDragging(true);
			update(event);
		};

	return (
		<div
			className="overflow-hidden rounded-xl"
			style={{ backgroundColor: surfaceColor }}
		>
			<div className="flex h-11 min-w-0 items-center justify-between gap-3 px-3">
				<span className="min-w-0 flex-1 text-sm">{label}</span>
				<button
					type="button"
					aria-expanded={open}
					aria-label={`Choose ${label} color`}
					className="size-8 shrink-0 cursor-pointer rounded-full border border-current/30 outline-none transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2"
					style={{ backgroundColor: values.hexExpression }}
					onClick={() => setOpen((current) => !current)}
				/>
			</div>
			{open && (
				<div className="border-t p-3" style={{ borderColor: surfaceColor }}>
					<div
						role="slider"
						tabIndex={0}
						aria-label={`${label} saturation and brightness`}
						aria-valuenow={Math.round(hsv.s * 100)}
						aria-valuetext={`saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
						className="relative h-32 cursor-crosshair touch-none overflow-hidden rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
						style={{
							backgroundColor: `hsl(${hsv.h} 100% 50%)`,
							backgroundImage:
								"linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
						}}
						onKeyDown={handlePlaneKeyDown}
						onPointerDown={beginDrag(updatePlane)}
						onPointerMove={(event) => {
							if (event.currentTarget.hasPointerCapture(event.pointerId))
								updatePlane(event);
						}}
						onPointerUp={() => setIsDragging(false)}
					>
						<span
							className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.4)]"
							style={{
								left: `calc(${hsv.s} * (100% - 0.75rem) + 0.375rem)`,
								top: `calc(${1 - hsv.v} * (100% - 0.75rem) + 0.375rem)`,
								transition: isDragging
									? undefined
									: "left 80ms linear, top 80ms linear",
							}}
						/>
					</div>
					<div
						role="slider"
						tabIndex={0}
						aria-label={`${label} hue`}
						aria-valuemin={0}
						aria-valuemax={360}
						aria-valuenow={Math.round(hsv.h)}
						className="relative mt-3 flex h-6 cursor-pointer touch-none items-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
						onKeyDown={handleHueKeyDown}
						onPointerDown={beginDrag(updateHue)}
						onPointerMove={(event) => {
							if (event.currentTarget.hasPointerCapture(event.pointerId))
								updateHue(event);
						}}
						onPointerUp={() => setIsDragging(false)}
					>
						<span
							aria-hidden="true"
							className="h-2.5 w-full rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]"
							style={{
								background:
									"linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
							}}
						/>
						<span
							className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.4)]"
							style={{
								left: `calc(${hsv.h / 360} * (100% - 1rem) + 0.5rem)`,
								backgroundColor: `hsl(${hsv.h} 100% 50%)`,
							}}
						/>
					</div>
					<div className="mt-3 grid grid-cols-2 gap-2">
						<label className="grid gap-1">
							<span className="font-semibold text-[10px] uppercase tracking-[0.08em] opacity-60">
								HEX
							</span>
							<input
								aria-label={`${label} hex value`}
								className="h-9 rounded-lg bg-black/10 px-2 font-mono text-xs outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
								spellCheck={false}
								value={hexDraft}
								onChange={(event) => {
									const nextValue = event.target.value;
									setHexDraft(nextValue);
									if (!/^#[0-9a-f]{6}$/i.test(nextValue)) return;
									const nextColor = nextValue.toLowerCase();
									setHsv(hexToHsv(nextColor));
									setRgbDraft(hexToRgbValue(nextColor));
									onColorChange(attribute, nextColor);
								}}
							/>
						</label>
						<label className="grid gap-1">
							<span className="font-semibold text-[10px] uppercase tracking-[0.08em] opacity-60">
								RGB
							</span>
							<input
								aria-label={`${label} RGB value`}
								className="h-9 rounded-lg bg-black/10 px-2 font-mono text-xs outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
								spellCheck={false}
								value={rgbDraft}
								onChange={(event) => {
									const nextValue = event.target.value;
									setRgbDraft(nextValue);
									const nextColor = rgbToHex(nextValue);
									if (!nextColor) return;
									setHsv(hexToHsv(nextColor));
									setHexDraft(nextColor);
									onColorChange(attribute, nextColor);
								}}
							/>
						</label>
					</div>
				</div>
			)}
		</div>
	);
}

interface ReaderCustomThemeDialogProps {
	/** Overlay theme the dialog chrome derives its colors from. */
	theme: ReaderTheme;
	/** Custom theme name being edited, or "" when creating a new one. */
	selectedTheme: string;
	existingThemes: string[];
	customThemes: CustomReaderThemes;
	onSave: (
		name: string,
		colors: ReaderThemeColors,
		previousName: string,
	) => void;
	/** Applies the draft to the reader without persisting it. */
	onPreview: (colors: ReaderThemeColors) => void;
	onClose: () => void;
}

export function ReaderCustomThemeDialog({
	theme,
	selectedTheme,
	existingThemes,
	customThemes,
	onSave,
	onPreview,
	onClose,
}: ReaderCustomThemeDialogProps) {
	const existing = customThemes[selectedTheme];
	const [customTheme, setCustomTheme] = useState<CustomThemeDraft>(() => {
		if (existing) return getThemeData(existing);
		const { id: _id, ...colors } = getReaderTheme(
			NANAHOSHI_THEME_ID,
			customThemes,
		);
		return getThemeData(colors);
	});
	const [themeToCopy, setThemeToCopy] = useState(NANAHOSHI_THEME_ID);
	const [themeName, setThemeName] = useState(existing ? selectedTheme : "");
	const themeNameRef = useRef<HTMLInputElement>(null);
	const onPreviewRef = useRef(onPreview);
	onPreviewRef.current = onPreview;

	useEffect(() => {
		const handleKeyDown = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleKeyDown);
		requestAnimationFrame(() => themeNameRef.current?.focus());
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	useEffect(() => {
		onPreviewRef.current(getDraftColors(customTheme));
	}, [customTheme]);

	const handleColorValueChange = (attribute: ThemeAttribute, value: string) => {
		setCustomTheme((prev) => ({
			...prev,
			[attribute]: {
				hexExpression: value,
				alphaValue: prev[attribute].alphaValue,
				rgbaExpression: hexToRGB(value, prev[attribute].alphaValue),
			},
		}));
	};

	const handleStartFromChange = (themeId: string) => {
		setThemeToCopy(themeId);
		// Strip `id` so it never ends up serialized as a color attribute.
		const { id: _id, ...colors } = getReaderTheme(themeId, customThemes);
		setCustomTheme(getThemeData(colors));
	};

	const handleRestore = () => {
		handleStartFromChange(NANAHOSHI_THEME_ID);
	};

	const handleSave = () => {
		const nameInput = themeNameRef.current;
		nameInput?.setCustomValidity("");

		if (!themeName) {
			nameInput?.setCustomValidity("You have to enter a Name!");
			nameInput?.reportValidity();
			return;
		}

		if (readerThemes.some((t) => t.id === themeName)) {
			nameInput?.setCustomValidity("This Name is reserved!");
			nameInput?.reportValidity();
			return;
		}

		onSave(themeName, getDraftColors(customTheme), selectedTheme);
	};

	const surface = readerMix(theme, 7);
	const hairline = readerMix(theme, 20);

	return (
		<div
			className="writing-horizontal-tb fixed inset-0 z-[80] flex items-end justify-center p-2 sm:items-center sm:p-4"
			role="dialog"
			aria-modal="true"
			aria-labelledby="custom-theme-title"
		>
			<button
				type="button"
				aria-label="Close dialog"
				className="fade-in absolute inset-0 animate-in bg-black/35 backdrop-blur-[2px] duration-200 motion-reduce:animate-none"
				onClick={onClose}
			/>
			<section
				className="fade-in zoom-in-95 relative flex max-h-[min(40rem,calc(100dvh-1rem))] w-full max-w-md animate-in flex-col overflow-hidden rounded-2xl shadow-2xl duration-200 motion-reduce:animate-none"
				style={{
					color: theme.fontColor,
					backgroundColor: theme.backgroundColor,
				}}
			>
				<header
					className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4"
					style={{ boxShadow: `inset 0 -1px ${hairline}` }}
				>
					<button
						type="button"
						className="h-10 w-fit cursor-pointer rounded-lg px-1.5 text-sm outline-none transition-opacity hover:opacity-65 focus-visible:outline-2 focus-visible:outline-offset-2"
						onClick={onClose}
					>
						Cancel
					</button>
					<h2 id="custom-theme-title" className="font-semibold text-sm">
						{selectedTheme ? "Edit theme" : "Create theme"}
					</h2>
					<div className="justify-self-end">
						<button
							type="button"
							className="h-10 cursor-pointer rounded-lg px-1.5 font-semibold text-sm outline-none transition-opacity hover:opacity-65 focus-visible:outline-2 focus-visible:outline-offset-2"
							style={{ color: theme.fontColor }}
							onClick={handleSave}
						>
							Save
						</button>
					</div>
				</header>
				<div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">
					<div className="space-y-2">
						<div>
							<h3 className="font-semibold text-sm">Theme details</h3>
							<p className="mt-1 text-xs leading-5 opacity-60">
								Give the theme a name, then choose the colors you want to read
								with.
							</p>
						</div>
						<label className="block">
							<span className="mb-1.5 block font-medium text-[11px] uppercase tracking-wide opacity-55">
								Theme name
							</span>
							<input
								ref={themeNameRef}
								type="text"
								className="h-11 w-full rounded-xl border-0 bg-transparent px-3 text-base outline-none transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 sm:text-sm"
								style={{
									color: theme.fontColor,
									backgroundColor: surface,
									boxShadow: `inset 0 0 0 1px ${hairline}`,
								}}
								placeholder="Evening paper"
								value={themeName}
								onChange={(event) => setThemeName(event.target.value)}
							/>
						</label>
					</div>
					<div className="mt-6">
						<div className="mb-1.5 flex items-center justify-between gap-3">
							<label
								className="font-medium text-[11px] uppercase tracking-wide opacity-55"
								htmlFor="copy-theme"
							>
								Start from
							</label>
							{!selectedTheme && (
								<button
									type="button"
									className="cursor-pointer rounded-md px-1 text-xs outline-none transition-opacity hover:opacity-65 focus-visible:outline-2 focus-visible:outline-offset-2"
									onClick={handleRestore}
								>
									Restore Nanahoshi
								</button>
							)}
						</div>
						<ThemedSelect
							id="copy-theme"
							theme={theme}
							value={themeToCopy}
							onChange={handleStartFromChange}
						>
							{existingThemes.map((id) => (
								<ThemedOption key={id} theme={theme} value={id}>
									{id}
								</ThemedOption>
							))}
						</ThemedSelect>
					</div>
					<div className="mt-6">
						<h3 className="mb-2 font-semibold text-sm">Colors</h3>
						<p className="mb-3 text-xs leading-5 opacity-60">
							Set the two colors that shape your reading page.
						</p>
						<div className="grid gap-2">
							<ColorInputRow
								label="Text"
								attribute="fontColor"
								values={customTheme.fontColor}
								surfaceColor={surface}
								onColorChange={handleColorValueChange}
							/>
							<ColorInputRow
								label="Page"
								attribute="backgroundColor"
								values={customTheme.backgroundColor}
								surfaceColor={surface}
								onColorChange={handleColorValueChange}
							/>
						</div>
					</div>
					<details
						className="mt-6 rounded-xl px-3 py-3"
						style={{ backgroundColor: surface }}
					>
						<summary className="cursor-pointer font-medium text-sm">
							Fine-tune other colors
						</summary>
						<div className="mt-2 flex flex-col gap-2">
							<ColorInputRow
								label="Furigana"
								attribute="hintFuriganaFontColor"
								values={customTheme.hintFuriganaFontColor}
								surfaceColor={readerMix(theme, 12)}
								onColorChange={handleColorValueChange}
							/>
							<ColorInputRow
								label="Furigana shadow"
								attribute="hintFuriganaShadowColor"
								values={customTheme.hintFuriganaShadowColor}
								surfaceColor={readerMix(theme, 12)}
								onColorChange={handleColorValueChange}
							/>
							<ColorInputRow
								label="Footer"
								attribute="tooltipTextFontColor"
								values={customTheme.tooltipTextFontColor}
								surfaceColor={readerMix(theme, 12)}
								onColorChange={handleColorValueChange}
							/>
						</div>
					</details>
				</div>
			</section>
		</div>
	);
}
