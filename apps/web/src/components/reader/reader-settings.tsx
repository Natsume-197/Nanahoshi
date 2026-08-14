/**
 * Reader settings overlay. Settings model and behavior ported from ttu
 * (BSD-3-Clause, ッツ Reader Authors); chrome follows Nanahoshi's settings
 * modal: category nav on the left (chips on mobile), one category at a time,
 * each setting a vertical label/control row. Colors derive from the reading
 * theme; margins and reading area edit as % of screen instead of raw px.
 */

import {
	ArrowLeft,
	BookOpenText,
	Check,
	Copy,
	CursorClick,
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
	CACHED_BOOKS_QUERY_KEY,
	useCachedBooks,
} from "@/hooks/use-cached-books";
import { clearCachedBooks, deleteCachedBook } from "@/lib/reader/db";
import type { MangaReaderSettings } from "@/lib/reader/manga-settings";
import type { ReaderProfile } from "@/lib/reader/profiles";
import type {
	ReadAs,
	ReaderPresentation,
	ReaderPresentationChange,
} from "@/lib/reader/reader-presentation";
import {
	type CustomReaderThemes,
	getReaderTheme,
	READER_FONT_SIZE_MAX,
	READER_FONT_SIZE_MIN,
	READER_LINE_HEIGHT_MAX,
	READER_LINE_HEIGHT_MIN,
	type ReaderSettings,
	type ReaderThemeColors,
	readerThemes,
} from "@/lib/reader/settings";
import { viewportHeight, viewportWidth } from "@/lib/reader/viewport";

function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB"];
	let value = bytes;
	let unitIndex = -1;
	do {
		value /= 1024;
		unitIndex += 1;
	} while (value >= 1024 && unitIndex < units.length - 1);
	return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

const clampPct = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

type SettingsCategory =
	| "profiles"
	| "theme"
	| "layout"
	| "text"
	| "reading"
	| "behaviour"
	| "storage";

const CATEGORIES: {
	key: SettingsCategory;
	label: string;
	desc: string;
	icon: ComponentType<{ className?: string }>;
}[] = [
	{
		key: "profiles",
		label: "Profiles",
		desc: "Named setups synced across your devices — each device remembers its own choice.",
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
		key: "behaviour",
		label: "Behaviour",
		desc: "How the reader remembers your place and reacts to changes.",
		icon: CursorClick,
	},
	{
		key: "storage",
		label: "Storage",
		desc: "Books kept on this device for offline reading.",
		icon: HardDrive,
	},
];

interface ReaderSettingsOverlayProps {
	presentation: ReaderPresentation;
	mangaSettings: MangaReaderSettings;
	settings: ReaderSettings;
	customThemes: CustomReaderThemes;
	/** Marks the book that is open behind the overlay in the cache list. */
	currentBookUuid?: string;
	profiles: ReaderProfile[];
	activeProfileId: string;
	onProfileSwitch: (id: string) => void;
	onProfileCreate: (name: string) => void;
	onProfileRename: (id: string, name: string) => void;
	onProfileDuplicate: (id: string) => void;
	onProfileDelete: (id: string) => void;
	onChange: (patch: Partial<ReaderSettings>) => void;
	onMangaSettingsChange: (patch: Partial<MangaReaderSettings>) => void;
	onPresentationChange: (change: ReaderPresentationChange) => void;
	onCustomThemesChange: (next: CustomReaderThemes) => void;
	onClose: () => void;
}

export function ReaderSettingsOverlay({
	presentation,
	mangaSettings,
	settings,
	customThemes,
	currentBookUuid,
	profiles,
	activeProfileId,
	onProfileSwitch,
	onProfileCreate,
	onProfileRename,
	onProfileDuplicate,
	onProfileDelete,
	onChange,
	onMangaSettingsChange,
	onPresentationChange,
	onCustomThemesChange,
	onClose,
}: ReaderSettingsOverlayProps) {
	const theme = getReaderTheme(settings.theme, customThemes);
	const mix = (pct: number) => readerMix(theme, pct);
	const verticalMode = settings.writingMode === "vertical-rl";
	const isComic = presentation.resolvedAs === "comic";
	const isPaginated = presentation.engine === "text-paginated";
	const resolvedReadAs = isComic ? "Comic / manga" : "Text";
	const visibleCategories = isComic
		? CATEGORIES.filter(({ key }) => key !== "text")
		: CATEGORIES;

	const [category, setCategory] = useState<SettingsCategory>("profiles");

	const queryClient = useQueryClient();
	const invalidateCachedBooks = () =>
		queryClient.invalidateQueries({ queryKey: CACHED_BOOKS_QUERY_KEY });
	const cachedBooks = useCachedBooks();
	const deleteCached = useMutation({
		mutationFn: deleteCachedBook,
		onSettled: invalidateCachedBooks,
	});
	const clearCached = useMutation({
		mutationFn: clearCachedBooks,
		onSettled: invalidateCachedBooks,
	});

	// null = closed, "" = creating a new theme, name = editing that theme.
	const [customThemeDialog, setCustomThemeDialog] = useState<string | null>(
		null,
	);
	// null = not renaming; else the profile being renamed and its draft name.
	const [profileRename, setProfileRename] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const [newProfileName, setNewProfileName] = useState("");

	const commitProfileRename = () => {
		if (profileRename) onProfileRename(profileRename.id, profileRename.name);
		setProfileRename(null);
	};

	const createProfileFromInput = () => {
		onProfileCreate(newProfileName);
		setNewProfileName("");
	};

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
		if (previousName && previousName !== name) {
			delete next[previousName];
		}
		next[name] = colors;
		onCustomThemesChange(next);
		onChange({ theme: name });
		setCustomThemeDialog(null);
	};

	const handleCustomThemeDelete = (name: string) => {
		// ttu: fall back to the theme right before the deleted (last) one.
		onChange({ theme: themeIds[themeIds.length - 2] || "light-theme" });
		const next = { ...customThemes };
		delete next[name];
		onCustomThemesChange(next);
	};

	// ── Human units: margins and reading area as % of the screen ──────────
	// The engine stores px; the UI converts against the axis each one affects.
	// Must use the same CSS-px measure as the engine (viewport.ts): on HiDPI
	// Linux window.inner* can report physical px, silently multiplying the
	// stored value against what the layout actually uses.
	const marginAxisPx = () =>
		verticalMode ? viewportWidth() : viewportHeight();
	const areaAxisPx = () => (verticalMode ? viewportHeight() : viewportWidth());

	const marginPct = clampPct(
		Math.round((settings.firstDimensionMargin / marginAxisPx()) * 100),
		0,
		30,
	);
	const areaPct =
		settings.secondDimensionMaxValue === 0
			? 100
			: clampPct(
					Math.round((settings.secondDimensionMaxValue / areaAxisPx()) * 100),
					30,
					100,
				);

	const iconButtonClasses =
		"flex h-11 w-11 shrink-0 cursor-pointer select-none items-center justify-center rounded-md opacity-70 transition-opacity duration-150 hover:opacity-100 sm:h-10 sm:w-10";
	const smallIconClasses =
		"flex h-9 w-9 cursor-pointer items-center justify-center rounded-md opacity-60 transition-opacity duration-150 hover:opacity-100";

	// Plain render helpers (not components): defining components inline would
	// remount them per keystroke and drop input focus.
	const row = (
		label: string,
		control: ReactNode,
		opts?: { hint?: string; wide?: boolean },
	) => (
		<div
			className="flex flex-col gap-2 border-b py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
			style={{ borderColor: mix(10) }}
		>
			<div className="min-w-0">
				<div className="text-sm">{label}</div>
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
			<>
				<div className="flex flex-col">
					{profiles.map((profile) => {
						const selected = profile.id === activeProfileId;
						return (
							<div
								key={profile.id}
								className="flex items-center gap-2 border-b py-2 last:border-b-0"
								style={{ borderColor: mix(10) }}
							>
								{profileRename?.id === profile.id ? (
									<>
										<div className="min-w-0 flex-1">
											<ThemedTextInput
												theme={theme}
												value={profileRename.name}
												onChange={(name) =>
													setProfileRename({ id: profile.id, name })
												}
												onKeyDown={(key) => {
													if (key === "Enter") commitProfileRename();
												}}
											/>
										</div>
										<button
											type="button"
											title="Save name"
											className={smallIconClasses}
											onClick={commitProfileRename}
										>
											<Check className="size-4" />
										</button>
									</>
								) : (
									<>
										<button
											type="button"
											title={
												selected ? profile.name : `Switch to ${profile.name}`
											}
											className="flex h-10 min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
											onClick={() => onProfileSwitch(profile.id)}
										>
											<span
												className="h-2 w-2 shrink-0 rounded-full transition-colors duration-150"
												style={{
													backgroundColor: selected ? theme.fontColor : mix(25),
												}}
											/>
											<span
												className={`truncate text-sm ${selected ? "font-medium" : "opacity-70"}`}
											>
												{profile.name}
											</span>
											{selected && (
												<span className="shrink-0 text-xs opacity-50">
													Active
												</span>
											)}
										</button>
										<button
											type="button"
											title="Rename Profile"
											className={smallIconClasses}
											onClick={() =>
												setProfileRename({
													id: profile.id,
													name: profile.name,
												})
											}
										>
											<Pen className="size-4" />
										</button>
										<button
											type="button"
											title="Duplicate Profile"
											className={smallIconClasses}
											onClick={() => onProfileDuplicate(profile.id)}
										>
											<Copy className="size-4" />
										</button>
										{profiles.length > 1 && (
											<button
												type="button"
												title="Delete Profile"
												className={smallIconClasses}
												onClick={() => onProfileDelete(profile.id)}
											>
												<Trash className="size-4" />
											</button>
										)}
									</>
								)}
							</div>
						);
					})}
				</div>
				<div className="mt-4 flex items-center gap-2">
					<div className="min-w-0 flex-1">
						<ThemedTextInput
							theme={theme}
							value={newProfileName}
							placeholder="New profile name"
							onChange={setNewProfileName}
							onKeyDown={(key) => {
								if (key === "Enter") createProfileFromInput();
							}}
						/>
					</div>
					<button
						type="button"
						title="Create Profile from current settings"
						className={smallIconClasses}
						onClick={createProfileFromInput}
					>
						<Plus className="size-5" />
					</button>
				</div>
				<p className="mt-2 text-xs opacity-50">
					New profiles copy the settings you are editing right now.
				</p>
			</>
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
					"Read as",
					<Segmented
						theme={theme}
						options={[
							{ id: "auto", text: "Automatic" },
							{ id: "text", text: "Text" },
							...(presentation.supportsComic
								? [{ id: "comic" as const, text: "Comic / manga" }]
								: []),
						]}
						selected={presentation.readAs}
						onSelect={(value: ReadAs) =>
							onPresentationChange({ type: "read-as", value })
						}
					/>,
					{
						hint:
							presentation.readAs === "auto"
								? `Automatic currently uses ${resolvedReadAs}`
								: "Choose how the book is interpreted",
						wide: true,
					},
				)}
				{isComic ? (
					<>
						{row(
							"Page layout",
							<Segmented
								theme={theme}
								options={[
									{ id: "horizontal-strip", text: "Horizontal strip" },
									{ id: "single-page", text: "Single page" },
									{ id: "two-page-spread", text: "Two-page spread" },
									{ id: "vertical-strip", text: "Vertical strip" },
								]}
								selected={presentation.comicLayout}
								onSelect={(layout) => onMangaSettingsChange({ layout })}
							/>,
							{
								hint: "Choose a horizontal strip, one or two fitted pages, or a vertical strip",
								wide: true,
							},
						)}
						{presentation.comicLayout !== "vertical-strip" &&
							row(
								"Reading direction",
								<Segmented
									theme={theme}
									options={[
										{ id: "auto", text: "Auto" },
										{ id: "rtl", text: "Right to left" },
										{ id: "ltr", text: "Left to right" },
									]}
									selected={mangaSettings.readingDirection}
									onSelect={(readingDirection) =>
										onMangaSettingsChange({ readingDirection })
									}
								/>,
								{
									hint: "Auto uses the publication language when direction metadata is unavailable",
								},
							)}
					</>
				) : (
					<>
						{row(
							"Text layout",
							<Segmented
								theme={theme}
								options={[
									{ id: "scroll", text: "Continuous" },
									{ id: "paginated", text: "Paginated" },
									{ id: "focus", text: "Focus" },
								]}
								selected={presentation.textLayout}
								onSelect={(value) =>
									onPresentationChange({
										type: "text-layout",
										value,
									})
								}
							/>,
							{
								hint: "Read continuously, page by page, or one centered sentence at a time",
							},
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
								{ hint: "How latin characters rotate in vertical text" },
							)}
						{row(
							verticalMode ? "Side margin" : "Top/bottom margin",
							<SliderRow
								theme={theme}
								min={0}
								max={30}
								step={1}
								value={marginPct}
								format={(pct) => `${pct}%`}
								onChange={(pct) =>
									onChange({
										firstDimensionMargin: Math.round(
											(pct / 100) * marginAxisPx(),
										),
									})
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
								value={areaPct}
								format={(pct) => (pct >= 100 ? "Full" : `${pct}%`)}
								onChange={(pct) =>
									onChange({
										secondDimensionMaxValue:
											pct >= 100 ? 0 : Math.round((pct / 100) * areaAxisPx()),
									})
								}
							/>,
							{ hint: "How much of the screen the text can use" },
						)}
						{isPaginated &&
							row(
								"Avoid page break",
								<Toggle
									theme={theme}
									value={settings.avoidPageBreak}
									onChange={(avoidPageBreak) => onChange({ avoidPageBreak })}
								/>,
								{ hint: "Keep paragraphs whole on each page" },
							)}
						{!verticalMode &&
							row(
								"Columns",
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
								{ hint: "Automatic, one or two columns in paginated layout" },
							)}
					</>
				)}
			</div>
		),

		text: (
			<div className="flex flex-col">
				{row(
					"Font size",
					<SliderRow
						theme={theme}
						min={READER_FONT_SIZE_MIN}
						max={READER_FONT_SIZE_MAX}
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
						min={READER_LINE_HEIGHT_MIN}
						max={READER_LINE_HEIGHT_MAX}
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
							list="reader-serif-fonts"
							onChange={(value) =>
								onChange({ fontFamilyGroupOne: value || "Noto Serif JP" })
							}
						/>
						<datalist id="reader-serif-fonts">
							<option value="Noto Serif JP" />
							<option value="serif" />
						</datalist>
					</>,
					{ hint: "Used for the main body text" },
				)}
				{row(
					"Font family (sans)",
					<>
						<ThemedTextInput
							theme={theme}
							value={settings.fontFamilyGroupTwo}
							list="reader-sans-fonts"
							onChange={(value) =>
								onChange({ fontFamilyGroupTwo: value || "Noto Sans JP" })
							}
						/>
						<datalist id="reader-sans-fonts">
							<option value="Noto Sans JP" />
							<option value="sans-serif" />
						</datalist>
					</>,
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
				)}
				{row(
					"Paragraph indentation",
					<SliderRow
						theme={theme}
						min={0}
						max={10}
						step={0.5}
						value={settings.textIndentation}
						format={(textIndentation) => `${textIndentation}em`}
						onChange={(textIndentation) => onChange({ textIndentation })}
					/>,
					{ hint: "First-line indent of each paragraph" },
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
					{ hint: "Space between paragraphs" },
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
							format={(textMarginValue) => `${textMarginValue}em`}
							onChange={(textMarginValue) => onChange({ textMarginValue })}
						/>,
					)}
				{row(
					"Justify text",
					<Toggle
						theme={theme}
						value={settings.enableTextJustification}
						onChange={(enableTextJustification) =>
							onChange({ enableTextJustification })
						}
					/>,
					{ hint: "Align text to both edges" },
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
					{ hint: "Balances line endings" },
				)}
				{verticalMode &&
					row(
						"Font kerning",
						<Toggle
							theme={theme}
							value={settings.enableFontKerning}
							onChange={(enableFontKerning) => onChange({ enableFontKerning })}
						/>,
						{ hint: "Better spacing in vertical text (vkrn)" },
					)}
				{verticalMode &&
					row(
						"Proportional metrics",
						<Toggle
							theme={theme}
							value={settings.enableFontVPAL}
							onChange={(enableFontVPAL) => onChange({ enableFontVPAL })}
						/>,
						{ hint: "Proportional vertical spacing (vpal)" },
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
					{ hint: "Override the book's own styling" },
				)}
			</div>
		),

		reading: (
			<div className="flex flex-col">
				{isComic &&
					row(
						"Progress indicator",
						<Segmented
							theme={theme}
							options={[
								{ id: "text", text: "Page number" },
								{ id: "page-lines", text: "Page ticks" },
								{ id: "bar", text: "Progress bar" },
							]}
							selected={mangaSettings.progressStyle}
							onSelect={(progressStyle) =>
								onMangaSettingsChange({ progressStyle })
							}
						/>,
						{
							hint: "Show page text, one light segment per page, or a single bar",
						},
					)}
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
				{!isComic && (
					<>
						{row(
							"Hide furigana",
							<Toggle
								theme={theme}
								value={settings.hideFurigana}
								onChange={(hideFurigana) => onChange({ hideFurigana })}
							/>,
							{ hint: "Practice readings without hints" },
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
								{ wide: true },
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
					</>
				)}
			</div>
		),

		behaviour: (
			<div className="flex flex-col">
				{row(
					"Save reading position",
					<Segmented
						theme={theme}
						options={[
							{ id: "automatic", text: "Automatic" },
							{ id: "bookmark", text: "Bookmark" },
						]}
						selected={settings.readingPositionMode}
						onSelect={(readingPositionMode) =>
							onChange({ readingPositionMode })
						}
					/>,
					{
						hint:
							settings.readingPositionMode === "automatic"
								? "Resume from where you last stopped reading"
								: "Resume from the marker you place manually",
					},
				)}
				{presentation.engine === "text-scroll" &&
					row(
						"Keep position on resize",
						<Toggle
							theme={theme}
							value={settings.autoPositionOnResize}
							onChange={(autoPositionOnResize) =>
								onChange({ autoPositionOnResize })
							}
						/>,
						{ hint: "Keep the same text at the reading edge" },
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
				<div className="mt-5">
					<div className="mb-2 flex items-center justify-between">
						<span className="text-sm opacity-70">Downloaded books</span>
						{(cachedBooks.data?.length ?? 0) > 0 && (
							<button
								type="button"
								className="cursor-pointer text-xs underline opacity-60 transition-opacity duration-150 hover:opacity-100"
								onClick={() => clearCached.mutate()}
							>
								Delete all (
								{formatBytes(
									(cachedBooks.data ?? []).reduce(
										(acc, book) => acc + book.sizeBytes,
										0,
									),
								)}
								)
							</button>
						)}
					</div>
					{(cachedBooks.data?.length ?? 0) === 0 ? (
						<p className="text-sm opacity-50">
							{cachedBooks.isPending
								? "Loading…"
								: "No books stored for offline reading."}
						</p>
					) : (
						<div className="flex flex-col">
							{(cachedBooks.data ?? []).map((book) => (
								<div
									key={book.uuid}
									className="flex items-center gap-4 border-b py-2 last:border-b-0"
									style={{ borderColor: mix(10) }}
								>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm">
											{book.title}
											{book.uuid === currentBookUuid && (
												<span className="ml-2 text-xs opacity-60">(open)</span>
											)}
										</p>
										<p className="text-xs opacity-50">
											{formatBytes(book.sizeBytes)} ·{" "}
											{new Date(book.storedAt).toLocaleDateString()}
										</p>
									</div>
									<button
										type="button"
										title="Remove from cache"
										className={smallIconClasses}
										onClick={() => deleteCached.mutate(book.uuid)}
									>
										<Trash className="size-4" />
									</button>
								</div>
							))}
						</div>
					)}
				</div>
			</>
		),
	};

	return (
		<div
			className="fade-in writing-horizontal-tb fixed inset-0 z-[70] flex animate-in flex-col duration-200 motion-reduce:animate-none"
			style={{
				color: theme.fontColor,
				backgroundColor: theme.backgroundColor,
			}}
		>
			{/* Mobile: slim top bar + category chips (Discord drills into pages;
			    chips are the compact equivalent). */}
			<div
				className="flex h-13 shrink-0 items-center gap-1 border-b px-2 md:hidden"
				style={{ borderColor: mix(12) }}
			>
				<button
					type="button"
					title="Leave Settings"
					aria-label="Leave Settings"
					className={iconButtonClasses}
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
				{visibleCategories.map(({ key, label, icon: Icon }) => (
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

			{/* Desktop: Discord-style two-zone layout. */}
			<div className="flex min-h-0 flex-1">
				{/* Left zone: tinted rail, nav column hugging the content. */}
				<div
					className="hidden min-h-0 flex-[1_0_14rem] justify-end overflow-y-auto py-14 pr-2 pl-4 md:flex"
					style={{ backgroundColor: mix(4) }}
				>
					<nav className="w-52 shrink-0">
						<div className="mb-1.5 px-2.5 font-semibold text-xs uppercase tracking-wide opacity-50">
							Reader Settings
						</div>
						{visibleCategories.map(({ key, label, icon: Icon }) => {
							const active = category === key;
							return (
								<button
									key={key}
									type="button"
									className={`mb-0.5 flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors duration-150 ${
										active ? "font-medium" : "opacity-60 hover:opacity-100"
									}`}
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

				{/* Right zone: one category at a time + ESC circle. */}
				<div className="flex min-h-0 flex-[3_1_0%]">
					<div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
						<div className="max-w-2xl px-4 py-6 md:px-10 md:py-14">
							<h2 className="font-semibold text-base">
								{visibleCategories.find((c) => c.key === category)?.label}
							</h2>
							<p className="mb-4 text-xs opacity-50">
								{visibleCategories.find((c) => c.key === category)?.desc}
							</p>
							{categoryContent[category]}
						</div>
					</div>
					<div className="hidden w-24 shrink-0 pt-14 md:block">
						<div className="flex flex-col items-center">
							<button
								type="button"
								title="Leave Settings"
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
