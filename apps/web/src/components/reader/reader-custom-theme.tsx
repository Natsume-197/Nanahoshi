/**
 * Port of ttu's custom theme dialog (settings-custom-theme.svelte +
 * settings-custom-theme-input.svelte) — BSD-3-Clause, ッツ Reader Authors.
 */

import { useRef, useState } from "react";
import type { ToggleOption } from "@/components/reader/button-toggle-group";
import {
	type CustomReaderThemes,
	getReaderTheme,
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

const buttonClasses =
	"inline-block min-w-[32px] cursor-pointer rounded px-4 font-medium leading-9 text-cyan-900 no-underline sm:min-w-[64px]";

interface ColorInputRowProps {
	label: string;
	attribute: ThemeAttribute;
	values: CustomThemeValue;
	onColorChange: (attribute: ThemeAttribute, value: string) => void;
	onAlphaChange: (attribute: ThemeAttribute, value: number) => void;
}

function ColorInputRow({
	label,
	attribute,
	values,
	onColorChange,
	onAlphaChange,
}: ColorInputRowProps) {
	return (
		<>
			<span>{label}</span>
			<input
				type="color"
				className="border border-black"
				value={values.hexExpression}
				onChange={(event) => onColorChange(attribute, event.target.value)}
			/>
			<input
				type="number"
				step={0.1}
				min={0}
				max={1}
				className="border border-gray-400/50 px-1"
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
	/** Custom theme name being edited, or "" when creating a new one. */
	selectedTheme: string;
	existingThemes: ToggleOption<string>[];
	customThemes: CustomReaderThemes;
	onSave: (
		name: string,
		colors: ReaderThemeColors,
		previousName: string,
	) => void;
	onClose: () => void;
}

export function ReaderCustomThemeDialog({
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
	const [themeToCopy, setThemeToCopy] = useState(existingThemes[0]?.id ?? "");
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

	return (
		<div className="writing-horizontal-tb fixed inset-0 z-[80] h-full w-full">
			<button
				type="button"
				aria-label="Close dialog"
				className="absolute inset-0 bg-black/[.32]"
				onClick={onClose}
			/>
			<div className="relative top-1/2 left-1/2 inline-block max-w-[80vw] -translate-x-1/2 -translate-y-1/2">
				<section className="rounded bg-white p-6 text-black shadow-2xl">
					<div className="grid max-h-[60vh] grid-cols-1 items-center gap-2 overflow-auto sm:grid-cols-[auto_auto_5rem] sm:gap-4">
						<select
							className="border border-gray-400/50 p-1 sm:col-span-2"
							value={themeToCopy}
							onChange={(event) => setThemeToCopy(event.target.value)}
						>
							{existingThemes.map((theme) => (
								<option key={theme.id} value={theme.id}>
									{theme.id}
								</option>
							))}
						</select>
						<button
							type="button"
							className={buttonClasses}
							onClick={handleCopyTheme}
						>
							Copy
						</button>
						<span className="hidden sm:block">Attribute</span>
						<span className="hidden sm:block">Color</span>
						<span className="hidden sm:block">Alpha</span>
						<ColorInputRow
							label="Font"
							attribute="fontColor"
							values={customTheme.fontColor}
							onColorChange={handleColorValueChange}
							onAlphaChange={handleAlphaValueChange}
						/>
						<ColorInputRow
							label="Background"
							attribute="backgroundColor"
							values={customTheme.backgroundColor}
							onColorChange={handleColorValueChange}
							onAlphaChange={handleAlphaValueChange}
						/>
						<ColorInputRow
							label="Furigana Partial Hide Font"
							attribute="hintFuriganaFontColor"
							values={customTheme.hintFuriganaFontColor}
							onColorChange={handleColorValueChange}
							onAlphaChange={handleAlphaValueChange}
						/>
						<ColorInputRow
							label="Furigana Partial/Full Hide Shadow"
							attribute="hintFuriganaShadowColor"
							values={customTheme.hintFuriganaShadowColor}
							onColorChange={handleColorValueChange}
							onAlphaChange={handleAlphaValueChange}
						/>
						<ColorInputRow
							label="Footer Font"
							attribute="tooltipTextFontColor"
							values={customTheme.tooltipTextFontColor}
							onColorChange={handleColorValueChange}
							onAlphaChange={handleAlphaValueChange}
						/>
						<input
							ref={themeNameRef}
							type="text"
							className="border-0 border-gray-400/50 border-b-2 bg-transparent px-0.5 transition focus:border-black focus:outline-none sm:col-span-2"
							placeholder="Theme Name"
							value={themeName}
							onChange={(event) => setThemeName(event.target.value)}
						/>
						<button
							type="button"
							className="flex items-center justify-center rounded-md border-2 border-gray-400 p-2 text-lg"
							style={{
								color: customTheme.fontColor.rgbaExpression,
								backgroundColor: customTheme.backgroundColor.rgbaExpression,
							}}
						>
							ぁあ
						</button>
					</div>
					<footer className="mt-2 flex grow flex-wrap items-center justify-between pt-5">
						<button type="button" className={buttonClasses} onClick={onClose}>
							Cancel
						</button>
						<button
							type="button"
							className={buttonClasses}
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
