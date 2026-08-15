/**
 * Port of ttu's custom theme dialog (settings-custom-theme.svelte +
 * settings-custom-theme-input.svelte) — BSD-3-Clause, ッツ Reader Authors.
 */

import { Copy } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import {
	readerMix,
	ThemedOption,
	ThemedSelect,
} from "@/components/reader/reader-controls";
import {
	type CustomReaderThemes,
	getReaderTheme,
	type ReaderTheme,
	type ReaderThemeColors,
	readerThemes,
} from "@/lib/reader/settings";

interface CustomThemeValue {
	hexExpression: string;
	alphaValue: number;
	rgbaExpression: string;
}

type ThemeAttribute = keyof ReaderThemeColors;

type CustomThemeDraft = Record<ThemeAttribute, CustomThemeValue>;

const whiteValue: CustomThemeValue = {
	hexExpression: "#ffffff",
	alphaValue: 1,
	rgbaExpression: "rgba(255,255,255,1)",
};

/** ttu defaults: white font on black background, everything else white. */
const defaultDraft: CustomThemeDraft = {
	fontColor: whiteValue,
	backgroundColor: {
		hexExpression: "#000000",
		alphaValue: 1,
		rgbaExpression: "rgba(0,0,0,1)",
	},
	selectionFontColor: whiteValue,
	selectionBackgroundColor: whiteValue,
	hintFuriganaShadowColor: whiteValue,
	hintFuriganaFontColor: whiteValue,
	tooltipTextFontColor: whiteValue,
};

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

function getThemeData(referenceObject: ReaderThemeColors): CustomThemeDraft {
	const result = {} as CustomThemeDraft;

	for (const [key, value] of Object.entries(referenceObject)) {
		const [r, g, b, a] = (value.match(/rgba\((.+)\)/)?.[1] || "0,0,0,1")
			.split(",")
			.map((x: string) => Number.parseFloat(x.trim()));

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
	return (
		<label
			className="flex h-11 min-w-0 items-center justify-between gap-3 rounded-xl px-3"
			style={{ backgroundColor: surfaceColor }}
		>
			<span className="min-w-0 flex-1 text-sm">{label}</span>
			<input
				type="color"
				aria-label={`${label} color`}
				className="size-8 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0 outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
				value={values.hexExpression}
				onChange={(event) => onColorChange(attribute, event.target.value)}
			/>
		</label>
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
	onClose: () => void;
}

export function ReaderCustomThemeDialog({
	theme,
	selectedTheme,
	existingThemes,
	customThemes,
	onSave,
	onClose,
}: ReaderCustomThemeDialogProps) {
	const existing = customThemes[selectedTheme];
	const [customTheme, setCustomTheme] = useState<CustomThemeDraft>(() =>
		existing ? getThemeData(existing) : defaultDraft,
	);
	const [themeToCopy, setThemeToCopy] = useState(existingThemes[0] ?? "");
	const [themeName, setThemeName] = useState(existing ? selectedTheme : "");
	const themeNameRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleKeyDown);
		requestAnimationFrame(() => themeNameRef.current?.focus());
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

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

	const handleCopyTheme = () => {
		// Strip `id` so it never ends up serialized as a color attribute.
		const { id: _id, ...colors } = getReaderTheme(themeToCopy, customThemes);
		setCustomTheme(getThemeData(colors));
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

		const colors = {} as Record<ThemeAttribute, string>;
		for (const [key, value] of Object.entries(customTheme)) {
			colors[key as ThemeAttribute] = value.rgbaExpression;
		}

		onSave(themeName, colors, selectedTheme);
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
				className="fade-in zoom-in-95 relative flex max-h-[min(31rem,calc(100dvh-1rem))] w-full max-w-sm animate-in flex-col overflow-hidden rounded-2xl shadow-2xl duration-200 motion-reduce:animate-none"
				style={{
					color: theme.fontColor,
					backgroundColor: readerMix(theme, 96),
					boxShadow: `0 24px 64px -24px ${readerMix(theme, 55)}`,
				}}
			>
				<header
					className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3"
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
						{selectedTheme ? "Edit theme" : "New theme"}
					</h2>
					<button
						type="button"
						className="h-10 w-fit cursor-pointer justify-self-end rounded-lg px-1.5 font-semibold text-sm outline-none transition-opacity hover:opacity-65 focus-visible:outline-2 focus-visible:outline-offset-2"
						style={{ color: theme.fontColor }}
						onClick={handleSave}
					>
						Save
					</button>
				</header>
				<div className="min-h-0 overflow-y-auto overscroll-contain p-3">
					<label className="block">
						<span className="mb-1.5 block px-1 font-medium text-[11px] uppercase tracking-wide opacity-55">
							Theme name
						</span>
						<input
							ref={themeNameRef}
							type="text"
							className="h-11 w-full rounded-xl border-0 bg-transparent px-3 text-sm outline-none transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2"
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
					<div
						className="mt-3 flex min-h-20 flex-col justify-between rounded-xl p-3"
						style={{
							color: customTheme.fontColor.rgbaExpression,
							backgroundColor: customTheme.backgroundColor.rgbaExpression,
							boxShadow: `inset 0 0 0 1px ${hairline}`,
						}}
					>
						<div className="font-serif text-base">Reading preview</div>
						<p className="max-w-sm font-serif text-xs opacity-80">
							A quiet page, shaped for the way you read.
						</p>
					</div>
					<div className="mt-3">
						<label
							className="mb-1.5 block px-1 font-medium text-[11px] uppercase tracking-wide opacity-55"
							htmlFor="copy-theme"
						>
							Start from
						</label>
						<div className="flex gap-2">
							<ThemedSelect
								id="copy-theme"
								theme={theme}
								value={themeToCopy}
								onChange={setThemeToCopy}
							>
								{existingThemes.map((id) => (
									<ThemedOption key={id} theme={theme} value={id}>
										{id}
									</ThemedOption>
								))}
							</ThemedSelect>
							<button
								type="button"
								className="flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 font-medium text-xs outline-none transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
								style={{ backgroundColor: surface }}
								onClick={handleCopyTheme}
							>
								<Copy aria-hidden="true" className="size-4" />
								Copy
							</button>
						</div>
					</div>
					<div className="mt-3">
						<h3 className="mb-1.5 px-1 font-medium text-[11px] uppercase tracking-wide opacity-55">
							Colors
						</h3>
						<div className="flex flex-col gap-2">
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
						className="mt-3 rounded-xl px-3 py-2.5"
						style={{ backgroundColor: surface }}
					>
						<summary className="cursor-pointer font-medium text-xs">
							More colors
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
