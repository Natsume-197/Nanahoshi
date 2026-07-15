// Ported from ttu's reader-settings (BSD-3-Clause, ッツ Reader Authors).

import {
	ArrowLeft,
	BookOpenText,
	HardDrive,
	Palette,
	Pen,
	Plus,
	Rows,
	TextT,
	Trash,
	Users,
	X,
} from "@phosphor-icons/react";
import { type ComponentType, type ReactNode, useState } from "react";
import {
	readerMix,
	Segmented,
	SliderRow,
	Stepper,
	ThemedOption,
	ThemedSelect,
	ThemedTextInput,
	Toggle,
} from "@/components/reader/reader-controls";
import { ReaderCustomThemeDialog } from "@/components/reader/reader-custom-theme";
import { type ReaderSettings, SETTING_SUPPORT } from "@/lib/lumi/settings";
import {
	type CustomReaderThemes,
	getReaderTheme,
	type ReaderThemeColors,
	readerThemes,
} from "@/lib/reader/settings";
import { cn } from "@/lib/utils";

/** Settings categories shown in the nav rail. */
type SettingsCategory =
	| "profiles"
	| "theme"
	| "layout"
	| "text"
	| "reading"
	| "storage";

/** Sidebar categories, in display order. */
const CATEGORIES: {
	key: SettingsCategory;
	label: string;
	desc: string;
	icon: ComponentType<{ className?: string }>;
}[] = [
	{
		key: "profiles",
		label: "Profiles",
		desc: "Named setups synced across your devices.",
		icon: Users,
	},
	{
		key: "theme",
		label: "Theme",
		desc: "Colors for the page and text.",
		icon: Palette,
	},
	{
		key: "layout",
		label: "Layout",
		desc: "How the book flows and fills the screen.",
		icon: Rows,
	},
	{
		key: "text",
		label: "Text",
		desc: "Fonts, sizing and paragraph shape.",
		icon: TextT,
	},
	{
		key: "reading",
		label: "Reading",
		desc: "Progress display, images and furigana.",
		icon: BookOpenText,
	},
	{
		key: "storage",
		label: "Storage",
		desc: "Books kept on this device for offline reading.",
		icon: HardDrive,
	},
];

/** Props for the lumi settings panel. */
interface LumiSettingsPanelProps {
	open: boolean;
	settings: ReaderSettings;
	customThemes: CustomReaderThemes;
	onChange: (patch: Partial<ReaderSettings>) => void;
	onCustomThemesChange: (next: CustomReaderThemes) => void;
	onClose: () => void;
}

/** Small "Soon" badge for rows not yet wired to the engine. */
function SoonTag() {
	return (
		<span className="rounded border px-1 py-0.5 font-medium text-[10px] uppercase tracking-wide opacity-70">
			Soon
		</span>
	);
}

/** Full-screen reader settings overlay for the lumi reader. */
export function LumiSettingsPanel(props: LumiSettingsPanelProps) {
	const {
		open,
		settings,
		customThemes,
		onChange,
		onCustomThemesChange,
		onClose,
	} = props;
	const [category, setCategory] = useState<SettingsCategory>("theme");
	// null = closed, "" = creating, name = editing that theme.
	const [customThemeDialog, setCustomThemeDialog] = useState<string | null>(
		null,
	);

	const theme = getReaderTheme(settings.theme, customThemes);
	const mix = (pct: number) => readerMix(theme, pct);
	const verticalMode = settings.writingMode === "vertical-rl";
	const isPaginated = settings.viewMode === "paginated";

	if (!open) return null;

	const themeIds = [
		...readerThemes.map((t) => t.id),
		...Object.keys(customThemes),
	];

	const handleCustomThemeSave = (
		name: string,
		colors: ReaderThemeColors,
		previousName: string,
	) => {
		const next = { ...customThemes };
		if (previousName && previousName !== name) delete next[previousName];
		next[name] = colors;
		onCustomThemesChange(next);
		onChange({ theme: name });
		setCustomThemeDialog(null);
	};

	const handleCustomThemeDelete = (name: string) => {
		onChange({ theme: themeIds[themeIds.length - 2] || "light-theme" });
		const next = { ...customThemes };
		delete next[name];
		onCustomThemesChange(next);
	};

	// Render helper, not a component (a component would drop input focus).
	const row = (
		label: string,
		control: ReactNode,
		opts?: { hint?: string; wide?: boolean; soon?: boolean },
	) => (
		<div
			className={cn(
				"flex flex-col gap-2 border-b py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
				opts?.soon && "pointer-events-none select-none opacity-40",
			)}
			style={{ borderColor: mix(10) }}
		>
			<div className="min-w-0">
				<div className="flex items-center gap-2 text-sm">
					{label}
					{opts?.soon && <SoonTag />}
				</div>
				{opts?.hint && (
					<div className="mt-0.5 text-xs opacity-50">{opts.hint}</div>
				)}
			</div>
			<div className={`w-full shrink-0 ${opts?.wide ? "sm:w-80" : "sm:w-56"}`}>
				{control}
			</div>
		</div>
	);

	const themeSwatch = (
		id: string,
		colors: { fontColor: string; backgroundColor: string },
	) => (
		<button
			type="button"
			title={id}
			className="h-11 w-11 cursor-pointer rounded-md text-lg transition-shadow duration-150"
			style={{
				color: colors.fontColor,
				backgroundColor: colors.backgroundColor,
				boxShadow:
					settings.theme === id
						? `0 0 0 2px ${theme.backgroundColor}, 0 0 0 4px ${theme.fontColor}`
						: `inset 0 0 0 1px ${mix(25)}`,
			}}
			onClick={() => onChange({ theme: id })}
		>
			ぁあ
		</button>
	);

	const categoryContent: Record<SettingsCategory, ReactNode> = {
		profiles: (
			<div className="pointer-events-none select-none py-6 opacity-40">
				<div className="flex items-center gap-2">
					<span className="text-sm">Setting profiles</span>
					<SoonTag />
				</div>
				<p className="mt-2 text-xs opacity-70">
					The lumi reader keeps a single local settings set for now.
				</p>
			</div>
		),

		theme: (
			<>
				<div className="flex flex-wrap items-center gap-2">
					{readerThemes.map((t) => (
						<span key={t.id}>{themeSwatch(t.id, t)}</span>
					))}
				</div>
				<div className="mt-5">
					<div className="mb-2 text-sm opacity-70">Custom themes</div>
					<div className="flex flex-wrap items-center gap-2">
						{Object.entries(customThemes).map(([name, colors]) => (
							<div key={name} className="flex items-center">
								{themeSwatch(name, colors)}
								{settings.theme === name && (
									<div className="ml-1 flex flex-col">
										<button
											type="button"
											title="Edit Theme"
											className="flex h-5 w-8 cursor-pointer items-center justify-center opacity-60 transition-opacity duration-150 hover:opacity-100"
											onClick={() => setCustomThemeDialog(name)}
										>
											<Pen className="size-3.5" />
										</button>
										<button
											type="button"
											title="Delete Theme"
											className="flex h-5 w-8 cursor-pointer items-center justify-center opacity-60 transition-opacity duration-150 hover:opacity-100"
											onClick={() => handleCustomThemeDelete(name)}
										>
											<Trash className="size-3.5" />
										</button>
									</div>
								)}
							</div>
						))}
						<button
							type="button"
							title="Create Custom Theme"
							className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border opacity-70 transition-opacity duration-150 hover:opacity-100"
							style={{ borderColor: mix(25) }}
							onClick={() => setCustomThemeDialog("")}
						>
							<Plus className="size-5" />
						</button>
					</div>
				</div>
			</>
		),

		layout: (
			<div className="flex flex-col">
				{row(
					"View mode",
					<Segmented
						theme={theme}
						options={[
							{ id: "continuous", text: "Continuous" },
							{ id: "paginated", text: "Paginated" },
						]}
						selected={settings.viewMode}
						onSelect={(viewMode) => onChange({ viewMode })}
					/>,
					{ hint: "Scroll the whole book or flip pages" },
				)}
				{row(
					"Writing mode",
					<Segmented
						theme={theme}
						options={[
							{ id: "horizontal-tb", text: "Horizontal" },
							{ id: "vertical-rl", text: "Vertical" },
						]}
						selected={settings.writingMode}
						onSelect={(writingMode) => onChange({ writingMode })}
					/>,
					{ hint: "Vertical reads right-to-left, like print" },
				)}
				{verticalMode &&
					row(
						"Text orientation",
						<Segmented
							theme={theme}
							options={[
								{ id: "mixed", text: "Mixed" },
								{ id: "upright", text: "Upright" },
							]}
							selected={settings.verticalTextOrientation}
							onSelect={(verticalTextOrientation) =>
								onChange({ verticalTextOrientation })
							}
						/>,
						{
							hint: "How latin characters rotate in vertical text",
							soon: !SETTING_SUPPORT.verticalTextOrientation,
						},
					)}
				{row(
					verticalMode ? "Side margin" : "Top/bottom margin",
					<SliderRow
						theme={theme}
						min={0}
						max={30}
						step={1}
						value={settings.firstDimensionMargin}
						format={(pct) => `${pct}%`}
						onChange={(firstDimensionMargin) =>
							onChange({ firstDimensionMargin })
						}
					/>,
					{ hint: "Empty space around the text, as % of screen" },
				)}
				{row(
					verticalMode ? "Reading area height" : "Reading area width",
					<SliderRow
						theme={theme}
						min={30}
						max={100}
						step={1}
						value={
							settings.secondDimensionMaxValue === 0
								? 100
								: settings.secondDimensionMaxValue
						}
						format={(pct) => (pct >= 100 ? "Full" : `${pct}%`)}
						onChange={(secondDimensionMaxValue) =>
							onChange({ secondDimensionMaxValue })
						}
					/>,
					{
						hint: "How much of the screen the text can use",
						soon: !SETTING_SUPPORT.secondDimensionMaxValue,
					},
				)}
				{isPaginated &&
					row(
						"Avoid page break",
						<Toggle
							theme={theme}
							value={settings.avoidPageBreak}
							onChange={(avoidPageBreak) => onChange({ avoidPageBreak })}
						/>,
						{
							hint: "Keep paragraphs whole on each page",
							soon: !SETTING_SUPPORT.avoidPageBreak,
						},
					)}
				{isPaginated &&
					!verticalMode &&
					row(
						"Page columns",
						<Segmented
							theme={theme}
							options={[
								{ id: 0, text: "Auto" },
								{ id: 1, text: "1" },
								{ id: 2, text: "2" },
							]}
							selected={Math.min(settings.pageColumns, 2)}
							onSelect={(pageColumns) => onChange({ pageColumns })}
						/>,
					)}
			</div>
		),

		text: (
			<div className="flex flex-col">
				{row(
					"Font size",
					<SliderRow
						theme={theme}
						min={12}
						max={60}
						step={1}
						value={settings.fontSize}
						format={(fontSize) => `${fontSize}px`}
						onChange={(fontSize) => onChange({ fontSize })}
					/>,
				)}
				{row(
					"Line height",
					<SliderRow
						theme={theme}
						min={1.2}
						max={2.4}
						step={0.05}
						value={settings.lineHeight}
						format={(lineHeight) => lineHeight.toFixed(2)}
						onChange={(lineHeight) => onChange({ lineHeight })}
					/>,
				)}
				{row(
					"Font family (serif)",
					<>
						<ThemedTextInput
							theme={theme}
							value={settings.fontFamilyGroupOne}
							list="lumi-serif-fonts"
							onChange={(value) =>
								onChange({ fontFamilyGroupOne: value || "Noto Serif JP" })
							}
						/>
						<datalist id="lumi-serif-fonts">
							<option value="Noto Serif JP" />
							<option value="serif" />
						</datalist>
					</>,
					{ hint: "Used for the main body text" },
				)}
				{row(
					"Font family (sans)",
					<ThemedTextInput
						theme={theme}
						value={settings.fontFamilyGroupTwo}
						onChange={(value) =>
							onChange({ fontFamilyGroupTwo: value || "Noto Sans JP" })
						}
					/>,
					{ soon: !SETTING_SUPPORT.fontFamilyGroupTwo },
				)}
				{row(
					"Font weight",
					<ThemedSelect
						theme={theme}
						value={
							settings.fontWeight === null
								? "default"
								: String(settings.fontWeight)
						}
						onChange={(value) =>
							onChange({
								fontWeight:
									value === "default" ? null : Number.parseInt(value, 10),
							})
						}
					>
						<ThemedOption theme={theme} value="default">
							Default
						</ThemedOption>
						{[300, 400, 500, 600, 700].map((weight) => (
							<ThemedOption key={weight} theme={theme} value={String(weight)}>
								{weight}
							</ThemedOption>
						))}
					</ThemedSelect>,
					{ soon: !SETTING_SUPPORT.fontWeight },
				)}
				{row(
					"Paragraph indentation",
					<SliderRow
						theme={theme}
						min={0}
						max={10}
						step={0.5}
						value={settings.textIndentation}
						format={(v) => `${v}em`}
						onChange={(textIndentation) => onChange({ textIndentation })}
					/>,
					{
						hint: "First-line indent of each paragraph",
						soon: !SETTING_SUPPORT.textIndentation,
					},
				)}
				{row(
					"Paragraph spacing",
					<Segmented
						theme={theme}
						options={[
							{ id: "auto", text: "Auto" },
							{ id: "manual", text: "Manual" },
						]}
						selected={settings.textMarginMode}
						onSelect={(textMarginMode) => onChange({ textMarginMode })}
					/>,
					{
						hint: "Space between paragraphs",
						soon: !SETTING_SUPPORT.textMarginMode,
					},
				)}
				{settings.textMarginMode === "manual" &&
					row(
						"Paragraph spacing size",
						<SliderRow
							theme={theme}
							min={0}
							max={10}
							step={0.5}
							value={settings.textMarginValue}
							format={(v) => `${v}em`}
							onChange={(textMarginValue) => onChange({ textMarginValue })}
						/>,
						{ soon: !SETTING_SUPPORT.textMarginValue },
					)}
				{row(
					"Text justification",
					<Toggle
						theme={theme}
						value={settings.enableTextJustification}
						onChange={(enableTextJustification) =>
							onChange({ enableTextJustification })
						}
					/>,
					{
						hint: "Align text to both edges",
						soon: !SETTING_SUPPORT.enableTextJustification,
					},
				)}
				{row(
					"Pretty text wrap",
					<Toggle
						theme={theme}
						value={settings.enableTextWrapPretty}
						onChange={(enableTextWrapPretty) =>
							onChange({ enableTextWrapPretty })
						}
					/>,
					{
						hint: "Balances line endings",
						soon: !SETTING_SUPPORT.enableTextWrapPretty,
					},
				)}
				{verticalMode &&
					row(
						"Font kerning",
						<Toggle
							theme={theme}
							value={settings.enableFontKerning}
							onChange={(enableFontKerning) => onChange({ enableFontKerning })}
						/>,
						{
							hint: "Better spacing in vertical text (vkrn)",
							soon: !SETTING_SUPPORT.enableFontKerning,
						},
					)}
				{verticalMode &&
					row(
						"Proportional metrics",
						<Toggle
							theme={theme}
							value={settings.enableFontVPAL}
							onChange={(enableFontVPAL) => onChange({ enableFontVPAL })}
						/>,
						{
							hint: "Proportional vertical spacing (vpal)",
							soon: !SETTING_SUPPORT.enableFontVPAL,
						},
					)}
				{row(
					"Prioritize reader styles",
					<Toggle
						theme={theme}
						value={settings.prioritizeReaderStyles}
						onChange={(prioritizeReaderStyles) =>
							onChange({ prioritizeReaderStyles })
						}
					/>,
					{ hint: "Override the book's own text colors" },
				)}
			</div>
		),

		reading: (
			<div className="flex flex-col">
				{row(
					"Character counter",
					<Toggle
						theme={theme}
						value={settings.showCharacterCounter}
						onChange={(showCharacterCounter) =>
							onChange({ showCharacterCounter })
						}
					/>,
					{ hint: "Progress in characters, bottom-right corner" },
				)}
				{row(
					"Percentage",
					<Toggle
						theme={theme}
						value={settings.showPercentage}
						onChange={(showPercentage) => onChange({ showPercentage })}
					/>,
					{ hint: "Progress as % of the book" },
				)}
				{row(
					"Blur images",
					<Toggle
						theme={theme}
						value={settings.hideSpoilerImage}
						onChange={(hideSpoilerImage) => onChange({ hideSpoilerImage })}
					/>,
					{
						hint: "Hide images until clicked, avoids spoilers",
						soon: !SETTING_SUPPORT.hideSpoilerImage,
					},
				)}
				{settings.hideSpoilerImage &&
					row(
						"Blur which images",
						<Segmented
							theme={theme}
							options={[
								{ id: "all", text: "All" },
								{ id: "after-toc", text: "After ToC" },
							]}
							selected={settings.blurMode}
							onSelect={(blurMode) => onChange({ blurMode })}
						/>,
						{ soon: !SETTING_SUPPORT.blurMode },
					)}
				{row(
					"Hide furigana",
					<Toggle
						theme={theme}
						value={settings.hideFurigana}
						onChange={(hideFurigana) => onChange({ hideFurigana })}
					/>,
					{
						hint: "Practice readings without hints",
						soon: !SETTING_SUPPORT.hideFurigana,
					},
				)}
				{settings.hideFurigana &&
					row(
						"Hide style",
						<Segmented
							theme={theme}
							options={[
								{ id: "Hide", text: "Hide" },
								{ id: "Partial", text: "Partial" },
								{ id: "Toggle", text: "Toggle" },
								{ id: "Full", text: "Full" },
							]}
							selected={settings.furiganaStyle}
							onSelect={(furiganaStyle) => onChange({ furiganaStyle })}
						/>,
						{ wide: true, soon: !SETTING_SUPPORT.furiganaStyle },
					)}
				{row(
					"Disable wheel navigation",
					<Toggle
						theme={theme}
						value={settings.disableWheelNavigation}
						onChange={(disableWheelNavigation) =>
							onChange({ disableWheelNavigation })
						}
					/>,
					{ hint: "Mouse wheel stops flipping pages" },
				)}
				{!isPaginated &&
					row(
						"Auto position on resize",
						<Toggle
							theme={theme}
							value={settings.autoPositionOnResize}
							onChange={(autoPositionOnResize) =>
								onChange({ autoPositionOnResize })
							}
						/>,
						{
							hint: "Keep your place when the window changes",
							soon: !SETTING_SUPPORT.autoPositionOnResize,
						},
					)}
			</div>
		),

		storage: (
			<>
				<div className="flex flex-col">
					{row(
						"Max downloaded books",
						<Stepper
							theme={theme}
							display={String(settings.maxCachedBooks)}
							onStep={(direction) =>
								onChange({
									maxCachedBooks: Math.max(
										1,
										settings.maxCachedBooks + direction,
									),
								})
							}
						/>,
						{ hint: "Older books are removed first" },
					)}
				</div>
				<div className="pointer-events-none mt-5 select-none opacity-40">
					<div className="mb-2 flex items-center gap-2">
						<span className="text-sm">Downloaded books</span>
						<SoonTag />
					</div>
					<p className="text-xs opacity-70">
						Per-book cache management lands later.
					</p>
				</div>
			</>
		),
	};

	return (
		<div
			className="fade-in writing-horizontal-tb fixed inset-0 z-[70] flex animate-in flex-col duration-200 motion-reduce:animate-none"
			style={{ color: theme.fontColor, backgroundColor: theme.backgroundColor }}
		>
			<div
				className="flex h-13 shrink-0 items-center gap-1 border-b px-2 md:hidden"
				style={{ borderColor: mix(12) }}
			>
				<button
					type="button"
					aria-label="Leave Settings"
					className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md opacity-70 transition-opacity duration-150 hover:opacity-100"
					onClick={onClose}
				>
					<ArrowLeft className="size-5" />
				</button>
				<span className="font-medium text-sm">Reader Settings</span>
			</div>
			<div
				className="flex shrink-0 gap-1 overflow-x-auto border-b px-3 py-2 md:hidden"
				style={{ borderColor: mix(12) }}
			>
				{CATEGORIES.map(({ key, label, icon: Icon }) => (
					<button
						key={key}
						type="button"
						className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm transition-colors duration-150"
						style={
							category === key ? { backgroundColor: mix(10) } : { opacity: 0.6 }
						}
						onClick={() => setCategory(key)}
					>
						<Icon className="size-4" />
						{label}
					</button>
				))}
			</div>

			<div className="flex min-h-0 flex-1">
				<div
					className="hidden min-h-0 flex-[1_0_14rem] justify-end overflow-y-auto py-14 pr-2 pl-4 md:flex"
					style={{ backgroundColor: mix(4) }}
				>
					<nav className="w-52 shrink-0">
						<div className="mb-1.5 px-2.5 font-semibold text-xs uppercase tracking-wide opacity-50">
							Reader Settings
						</div>
						{CATEGORIES.map(({ key, label, icon: Icon }) => {
							const active = category === key;
							return (
								<button
									key={key}
									type="button"
									className={cn(
										"mb-0.5 flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors duration-150",
										active ? "font-medium" : "opacity-60 hover:opacity-100",
									)}
									style={active ? { backgroundColor: mix(10) } : undefined}
									onClick={() => setCategory(key)}
								>
									<Icon className="size-4 shrink-0" />
									{label}
								</button>
							);
						})}
					</nav>
				</div>

				<div className="flex min-h-0 flex-[3_1_0%]">
					<div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
						<div className="max-w-2xl px-4 py-6 md:px-10 md:py-14">
							<h2 className="font-semibold text-base">
								{CATEGORIES.find((c) => c.key === category)?.label}
							</h2>
							<p className="mb-4 text-xs opacity-50">
								{CATEGORIES.find((c) => c.key === category)?.desc}
							</p>
							{categoryContent[category]}
						</div>
					</div>
					<div className="hidden w-24 shrink-0 pt-14 md:block">
						<div className="flex flex-col items-center">
							<button
								type="button"
								aria-label="Leave Settings"
								className="flex size-9 cursor-pointer items-center justify-center rounded-full border-2 opacity-60 transition-opacity duration-150 hover:opacity-100"
								style={{ borderColor: mix(35) }}
								onClick={onClose}
							>
								<X className="size-4.5" />
							</button>
							<span className="mt-1 font-semibold text-[11px] opacity-50">
								ESC
							</span>
						</div>
					</div>
				</div>
			</div>

			{customThemeDialog !== null && (
				<ReaderCustomThemeDialog
					theme={theme}
					selectedTheme={customThemeDialog}
					existingThemes={themeIds}
					customThemes={customThemes}
					onSave={handleCustomThemeSave}
					onClose={() => setCustomThemeDialog(null)}
				/>
			)}
		</div>
	);
}
