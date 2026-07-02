/**
 * Port of ttu's custom theme dialog (settings-custom-theme.svelte +
 * settings-custom-theme-input.svelte) — BSD-3-Clause, ッツ Reader Authors.
 */

import { useRef, useState } from "react";
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
	borderColor: string;
	onColorChange: (attribute: ThemeAttribute, value: string) => void;
	onAlphaChange: (attribute: ThemeAttribute, value: number) => void;
}

function ColorInputRow({
	label,
	attribute,
	values,
	borderColor,
	onColorChange,
	onAlphaChange,
}: ColorInputRowProps) {
	return (
		<>
			<span className="text-sm opacity-70">{label}</span>
			<input
				type="color"
				className="h-9 w-full cursor-pointer rounded-md border sm:h-8"
				style={{ borderColor }}
				value={values.hexExpression}
				onChange={(event) => onColorChange(attribute, event.target.value)}
			/>
			<input
				type="number"
				step={0.1}
				min={0}
				max={1}
				className="h-9 rounded-md border bg-transparent px-2 text-sm outline-none sm:h-8"
				style={{ borderColor }}
				value={values.alphaValue}
				onChange={(event) => {
					let value = event.target.value
						? Number.parseFloat(event.target.value)
						: undefined;
					if (value === undefined || value < 0 || value > 1) {
						value = 1;
					}
					onAlphaChange(attribute, value);
				}}
			/>
		</>
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

	const handleAlphaValueChange = (attribute: ThemeAttribute, value: number) => {
		setCustomTheme((prev) => ({
			...prev,
			[attribute]: {
				hexExpression: prev[attribute].hexExpression,
				alphaValue: value,
				rgbaExpression: hexToRGB(prev[attribute].hexExpression, value),
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

	const hairline = readerMix(theme, 25);

	return (
		<div className="writing-horizontal-tb fixed inset-0 z-[80] h-full w-full">
			<button
				type="button"
				aria-label="Close dialog"
				className="fade-in absolute inset-0 animate-in bg-black/40 duration-200 motion-reduce:animate-none"
				onClick={onClose}
			/>
			<div className="relative top-1/2 left-1/2 inline-block w-[min(28rem,90vw)] -translate-x-1/2 -translate-y-1/2">
				<section
					className="fade-in zoom-in-95 animate-in rounded-lg border p-5 shadow-xl duration-200 motion-reduce:animate-none"
					style={{
						color: theme.fontColor,
						backgroundColor: theme.backgroundColor,
						borderColor: readerMix(theme, 15),
					}}
				>
					<h2 className="mb-4 font-medium text-sm">
						{selectedTheme ? "Edit Custom Theme" : "New Custom Theme"}
					</h2>
					<div className="grid max-h-[60vh] grid-cols-1 items-center gap-2 overflow-auto sm:grid-cols-[1fr_auto_4.5rem] sm:gap-x-4 sm:gap-y-3">
						<div className="sm:col-span-2">
							<ThemedSelect
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
						</div>
						<button
							type="button"
							className="h-9 cursor-pointer rounded-md border px-3 text-sm opacity-70 transition-opacity duration-150 hover:opacity-100 sm:h-8"
							style={{ borderColor: hairline }}
							onClick={handleCopyTheme}
						>
							Copy
						</button>
						<ColorInputRow
							label="Font"
							attribute="fontColor"
							values={customTheme.fontColor}
							borderColor={hairline}
							onColorChange={handleColorValueChange}
							onAlphaChange={handleAlphaValueChange}
						/>
						<ColorInputRow
							label="Background"
							attribute="backgroundColor"
							values={customTheme.backgroundColor}
							borderColor={hairline}
							onColorChange={handleColorValueChange}
							onAlphaChange={handleAlphaValueChange}
						/>
						<ColorInputRow
							label="Furigana partial hide font"
							attribute="hintFuriganaFontColor"
							values={customTheme.hintFuriganaFontColor}
							borderColor={hairline}
							onColorChange={handleColorValueChange}
							onAlphaChange={handleAlphaValueChange}
						/>
						<ColorInputRow
							label="Furigana hide shadow"
							attribute="hintFuriganaShadowColor"
							values={customTheme.hintFuriganaShadowColor}
							borderColor={hairline}
							onColorChange={handleColorValueChange}
							onAlphaChange={handleAlphaValueChange}
						/>
						<ColorInputRow
							label="Footer font"
							attribute="tooltipTextFontColor"
							values={customTheme.tooltipTextFontColor}
							borderColor={hairline}
							onColorChange={handleColorValueChange}
							onAlphaChange={handleAlphaValueChange}
						/>
						<div className="sm:col-span-2">
							<input
								ref={themeNameRef}
								type="text"
								className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none transition-colors duration-150 focus:border-current sm:h-8"
								style={{ borderColor: hairline, color: theme.fontColor }}
								placeholder="Theme Name"
								value={themeName}
								onChange={(event) => setThemeName(event.target.value)}
							/>
						</div>
						<div
							className="flex h-9 items-center justify-center rounded-md text-lg sm:h-8"
							style={{
								color: customTheme.fontColor.rgbaExpression,
								backgroundColor: customTheme.backgroundColor.rgbaExpression,
								boxShadow: `inset 0 0 0 1px ${hairline}`,
							}}
						>
							ぁあ
						</div>
					</div>
					<footer className="mt-5 flex items-center justify-end gap-2">
						<button
							type="button"
							className="h-9 cursor-pointer rounded-md px-3 text-sm opacity-70 transition-opacity duration-150 hover:opacity-100 sm:h-8"
							onClick={onClose}
						>
							Cancel
						</button>
						<button
							type="button"
							className="h-9 cursor-pointer rounded-md px-4 font-medium text-sm transition-opacity duration-150 hover:opacity-90 sm:h-8"
							style={{
								backgroundColor: theme.fontColor,
								color: theme.backgroundColor,
							}}
							onClick={handleSave}
						>
							Save
						</button>
					</footer>
				</section>
			</div>
		</div>
	);
}
