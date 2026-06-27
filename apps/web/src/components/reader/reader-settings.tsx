/**
 * Port of ttu's settings page (reader section) — BSD-3-Clause, ッツ Reader
 * Authors. Rendered as a full-screen overlay instead of a separate route.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
	ButtonToggleGroup,
	type ToggleOption,
} from "@/components/reader/button-toggle-group";
import { ReaderCustomThemeDialog } from "@/components/reader/reader-custom-theme";
import {
	CACHED_BOOKS_QUERY_KEY,
	useCachedBooks,
} from "@/hooks/use-cached-books";
import { clearCachedBooks, deleteCachedBook } from "@/lib/reader/db";
import {
	type BlurMode,
	type CustomReaderThemes,
	type FuriganaStyle,
	getReaderTheme,
	type ReaderSettings,
	type ReaderThemeColors,
	readerThemes,
	type TextMarginMode,
	type VerticalTextOrientation,
	type ViewMode,
	type WritingMode,
} from "@/lib/reader/settings";

const inputClasses =
	"mt-1 block w-full border-0 border-gray-400/50 border-b-2 bg-transparent px-0.5 transition focus:border-black focus:outline-none";

const optionsForToggle: ToggleOption<boolean>[] = [
	{ id: false, text: "Off" },
	{ id: true, text: "On" },
];

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

function SettingsItemGroup({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="pb-8 md:pb-3">
			<h2 className="mb-2 font-medium text-xl capitalize">{title}</h2>
			<div>{children}</div>
		</section>
	);
}

interface ReaderSettingsOverlayProps {
	settings: ReaderSettings;
	customThemes: CustomReaderThemes;
	/** Marks the book that is open behind the overlay in the cache list. */
	currentBookUuid?: string;
	onChange: (patch: Partial<ReaderSettings>) => void;
	onCustomThemesChange: (next: CustomReaderThemes) => void;
	onClose: () => void;
}

export function ReaderSettingsOverlay({
	settings,
	customThemes,
	currentBookUuid,
	onChange,
	onCustomThemesChange,
	onClose,
}: ReaderSettingsOverlayProps) {
	const theme = getReaderTheme(settings.theme, customThemes);
	const verticalMode = settings.writingMode === "vertical-rl";

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

	const optionsForTheme: ToggleOption<string>[] = [
		...readerThemes.map((t) => ({
			id: t.id,
			text: "ぁあ",
			style: {
				color: t.fontColor,
				backgroundColor: t.backgroundColor,
			},
			thickBorders: true,
		})),
		...Object.entries(customThemes).map(([name, colors]) => ({
			id: name,
			text: "ぁあ",
			style: {
				color: colors.fontColor,
				backgroundColor: colors.backgroundColor,
			},
			thickBorders: true,
			showIcons: true,
		})),
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
		onChange({
			theme: optionsForTheme[optionsForTheme.length - 2]?.id || "light-theme",
		});
		const next = { ...customThemes };
		delete next[name];
		onCustomThemesChange(next);
	};

	const optionsForViewMode: ToggleOption<ViewMode>[] = [
		{ id: "continuous", text: "Continuous" },
		{ id: "paginated", text: "Paginated" },
	];

	const isPaginated = settings.viewMode === "paginated";

	const optionsForWritingMode: ToggleOption<WritingMode>[] = [
		{ id: "horizontal-tb", text: "Horizontal" },
		{ id: "vertical-rl", text: "Vertical" },
	];

	const optionsForTextOrientation: ToggleOption<VerticalTextOrientation>[] = [
		{ id: "mixed", text: "Mixed" },
		{ id: "upright", text: "Upright" },
	];

	const optionsForMarginMode: ToggleOption<TextMarginMode>[] = [
		{ id: "auto", text: "Auto" },
		{ id: "manual", text: "Manual" },
	];

	const optionsForBlurMode: ToggleOption<BlurMode>[] = [
		{ id: "all", text: "All" },
		{ id: "after-toc", text: "After ToC" },
	];

	const optionsForFuriganaStyle: ToggleOption<FuriganaStyle>[] = [
		{ id: "Hide", text: "Hide" },
		{ id: "Partial", text: "Partial" },
		{ id: "Toggle", text: "Toggle" },
		{ id: "Full", text: "Full" },
	];

	const numberInput = (
		value: number,
		patch: (value: number) => Partial<ReaderSettings>,
		opts: { step: number; min: number; fallback?: number },
	) => (
		<input
			type="number"
			className={inputClasses}
			step={opts.step}
			min={opts.min}
			value={value}
			onChange={(event) => {
				const parsed = Number.parseFloat(event.target.value);
				onChange(
					patch(Number.isNaN(parsed) ? (opts.fallback ?? opts.min) : parsed),
				);
			}}
		/>
	);

	return (
		<div
			className="writing-horizontal-tb fixed inset-0 z-[70] overflow-y-auto"
			style={{
				color: theme.fontColor,
				backgroundColor: theme.backgroundColor,
			}}
		>
			<div className="relative flex h-12 items-center bg-gray-700 px-4 text-white md:px-8 xl:h-10">
				<button
					type="button"
					title="Leave Settings"
					className="flex h-12 w-12 cursor-pointer select-none items-center justify-center p-2.5 text-xl opacity-60 transition-opacity hover:opacity-100 xl:h-10 xl:w-10 xl:text-lg"
					onClick={onClose}
				>
					<ArrowLeft className="size-5" />
				</button>
				<span className="ml-2">Settings</span>
			</div>

			<div className="mx-auto px-4 pt-6 pb-16 md:px-8 lg:max-w-4xl xl:max-w-none 2xl:max-w-6xl">
				<div className="grid grid-cols-1 items-center sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-8">
					<div className="lg:col-span-2">
						<SettingsItemGroup title="Theme">
							<ButtonToggleGroup
								options={optionsForTheme}
								selectedOptionId={settings.theme}
								onSelect={(theme) => onChange({ theme })}
								onEdit={(name) => setCustomThemeDialog(name)}
								onDelete={handleCustomThemeDelete}
							>
								<button
									type="button"
									title="Create Custom Theme"
									className="m-1 rounded-md border-2 border-gray-400 p-2 text-lg"
									onClick={() => setCustomThemeDialog("")}
								>
									<Plus className="mx-2 size-5" />
								</button>
							</ButtonToggleGroup>
						</SettingsItemGroup>
					</div>
					<div className="h-full">
						<SettingsItemGroup title="View mode">
							<ButtonToggleGroup
								options={optionsForViewMode}
								selectedOptionId={settings.viewMode}
								onSelect={(viewMode) => onChange({ viewMode })}
							/>
						</SettingsItemGroup>
					</div>

					<SettingsItemGroup title="Font family (Group 1)">
						<input
							type="text"
							className={inputClasses}
							list="reader-serif-fonts"
							value={settings.fontFamilyGroupOne}
							onChange={(event) =>
								onChange({
									fontFamilyGroupOne: event.target.value || "Noto Serif JP",
								})
							}
						/>
						<datalist id="reader-serif-fonts">
							<option value="Noto Serif JP" />
							<option value="serif" />
						</datalist>
					</SettingsItemGroup>

					<SettingsItemGroup title="Font family (Group 2)">
						<input
							type="text"
							className={inputClasses}
							list="reader-sans-fonts"
							value={settings.fontFamilyGroupTwo}
							onChange={(event) =>
								onChange({
									fontFamilyGroupTwo: event.target.value || "Noto Sans JP",
								})
							}
						/>
						<datalist id="reader-sans-fonts">
							<option value="Noto Sans JP" />
							<option value="sans-serif" />
						</datalist>
					</SettingsItemGroup>

					<SettingsItemGroup title="Font Weight">
						<input
							type="number"
							className={inputClasses}
							step={100}
							min={100}
							max={900}
							placeholder="Default"
							value={settings.fontWeight ?? ""}
							onChange={(event) => {
								const parsed = Number.parseInt(event.target.value, 10);
								onChange({
									fontWeight: Number.isNaN(parsed) ? null : parsed,
								});
							}}
						/>
					</SettingsItemGroup>

					<SettingsItemGroup title="Font size">
						{numberInput(settings.fontSize, (fontSize) => ({ fontSize }), {
							step: 1,
							min: 1,
							fallback: 20,
						})}
					</SettingsItemGroup>

					<SettingsItemGroup title="Line Height">
						{numberInput(
							settings.lineHeight,
							(lineHeight) => ({
								lineHeight: lineHeight < 1 ? 1.65 : lineHeight,
							}),
							{ step: 0.05, min: 1, fallback: 1.65 },
						)}
					</SettingsItemGroup>

					<SettingsItemGroup title="Paragraph Indentation">
						{numberInput(
							settings.textIndentation,
							(textIndentation) => ({ textIndentation }),
							{ step: 0.5, min: 0 },
						)}
					</SettingsItemGroup>

					{settings.textMarginMode === "manual" && (
						<SettingsItemGroup title="Paragraph Margins">
							{numberInput(
								settings.textMarginValue,
								(textMarginValue) => ({ textMarginValue }),
								{ step: 0.5, min: 0 },
							)}
						</SettingsItemGroup>
					)}

					<SettingsItemGroup
						title={
							verticalMode
								? "Reader Left/right margin"
								: "Reader Top/bottom margin"
						}
					>
						{numberInput(
							settings.firstDimensionMargin,
							(firstDimensionMargin) => ({ firstDimensionMargin }),
							{ step: 1, min: 0 },
						)}
					</SettingsItemGroup>

					<SettingsItemGroup
						title={verticalMode ? "Reader Max height" : "Reader Max width"}
					>
						{numberInput(
							settings.secondDimensionMaxValue,
							(secondDimensionMaxValue) => ({ secondDimensionMaxValue }),
							{ step: 1, min: 0 },
						)}
					</SettingsItemGroup>

					<SettingsItemGroup title="Writing mode">
						<ButtonToggleGroup
							options={optionsForWritingMode}
							selectedOptionId={settings.writingMode}
							onSelect={(writingMode) => onChange({ writingMode })}
						/>
					</SettingsItemGroup>

					{verticalMode && (
						<>
							<SettingsItemGroup title="Enable Font Kerning">
								<ButtonToggleGroup
									options={optionsForToggle}
									selectedOptionId={settings.enableFontKerning}
									onSelect={(enableFontKerning) =>
										onChange({ enableFontKerning })
									}
								/>
							</SettingsItemGroup>

							<SettingsItemGroup title="Enable VPAL">
								<ButtonToggleGroup
									options={optionsForToggle}
									selectedOptionId={settings.enableFontVPAL}
									onSelect={(enableFontVPAL) => onChange({ enableFontVPAL })}
								/>
							</SettingsItemGroup>

							<SettingsItemGroup title="Text Orientation">
								<ButtonToggleGroup
									options={optionsForTextOrientation}
									selectedOptionId={settings.verticalTextOrientation}
									onSelect={(verticalTextOrientation) =>
										onChange({ verticalTextOrientation })
									}
								/>
							</SettingsItemGroup>
						</>
					)}

					<SettingsItemGroup title="Prioritize Reader Styles">
						<ButtonToggleGroup
							options={optionsForToggle}
							selectedOptionId={settings.prioritizeReaderStyles}
							onSelect={(prioritizeReaderStyles) =>
								onChange({ prioritizeReaderStyles })
							}
						/>
					</SettingsItemGroup>

					<SettingsItemGroup title="Enable Text Justification">
						<ButtonToggleGroup
							options={optionsForToggle}
							selectedOptionId={settings.enableTextJustification}
							onSelect={(enableTextJustification) =>
								onChange({ enableTextJustification })
							}
						/>
					</SettingsItemGroup>

					<SettingsItemGroup title="Enable Pretty Text Wrap">
						<ButtonToggleGroup
							options={optionsForToggle}
							selectedOptionId={settings.enableTextWrapPretty}
							onSelect={(enableTextWrapPretty) =>
								onChange({ enableTextWrapPretty })
							}
						/>
					</SettingsItemGroup>

					<SettingsItemGroup title="Paragraph Margin Mode">
						<ButtonToggleGroup
							options={optionsForMarginMode}
							selectedOptionId={settings.textMarginMode}
							onSelect={(textMarginMode) => onChange({ textMarginMode })}
						/>
					</SettingsItemGroup>

					<SettingsItemGroup title="Show Character Counter">
						<ButtonToggleGroup
							options={optionsForToggle}
							selectedOptionId={settings.showCharacterCounter}
							onSelect={(showCharacterCounter) =>
								onChange({ showCharacterCounter })
							}
						/>
					</SettingsItemGroup>

					<SettingsItemGroup title="Show Percentage">
						<ButtonToggleGroup
							options={optionsForToggle}
							selectedOptionId={settings.showPercentage}
							onSelect={(showPercentage) => onChange({ showPercentage })}
						/>
					</SettingsItemGroup>

					<SettingsItemGroup title="Disable Wheel Navigation">
						<ButtonToggleGroup
							options={optionsForToggle}
							selectedOptionId={settings.disableWheelNavigation}
							onSelect={(disableWheelNavigation) =>
								onChange({ disableWheelNavigation })
							}
						/>
					</SettingsItemGroup>

					<SettingsItemGroup title="Blur image">
						<ButtonToggleGroup
							options={optionsForToggle}
							selectedOptionId={settings.hideSpoilerImage}
							onSelect={(hideSpoilerImage) => onChange({ hideSpoilerImage })}
						/>
					</SettingsItemGroup>

					{settings.hideSpoilerImage && (
						<SettingsItemGroup title="Blur Mode">
							<ButtonToggleGroup
								options={optionsForBlurMode}
								selectedOptionId={settings.blurMode}
								onSelect={(blurMode) => onChange({ blurMode })}
							/>
						</SettingsItemGroup>
					)}

					<SettingsItemGroup title="Hide furigana">
						<ButtonToggleGroup
							options={optionsForToggle}
							selectedOptionId={settings.hideFurigana}
							onSelect={(hideFurigana) => onChange({ hideFurigana })}
						/>
					</SettingsItemGroup>

					{settings.hideFurigana && (
						<SettingsItemGroup title="Hide furigana style">
							<ButtonToggleGroup
								options={optionsForFuriganaStyle}
								selectedOptionId={settings.furiganaStyle}
								onSelect={(furiganaStyle) => onChange({ furiganaStyle })}
							/>
						</SettingsItemGroup>
					)}

					{!isPaginated && (
						<SettingsItemGroup title="Auto position on resize">
							<ButtonToggleGroup
								options={optionsForToggle}
								selectedOptionId={settings.autoPositionOnResize}
								onSelect={(autoPositionOnResize) =>
									onChange({ autoPositionOnResize })
								}
							/>
						</SettingsItemGroup>
					)}

					{isPaginated && (
						<>
							<SettingsItemGroup title="Avoid Page Break">
								<ButtonToggleGroup
									options={optionsForToggle}
									selectedOptionId={settings.avoidPageBreak}
									onSelect={(avoidPageBreak) => onChange({ avoidPageBreak })}
								/>
							</SettingsItemGroup>
							{settings.writingMode === "horizontal-tb" && (
								<SettingsItemGroup title="Page Columns">
									{numberInput(
										settings.pageColumns,
										(pageColumns) => ({
											pageColumns: Math.max(0, Math.round(pageColumns)),
										}),
										{ step: 1, min: 0 },
									)}
								</SettingsItemGroup>
							)}
						</>
					)}

					<SettingsItemGroup title="Max Downloaded Books">
						{numberInput(
							settings.maxCachedBooks,
							(maxCachedBooks) => ({
								maxCachedBooks: Math.max(1, Math.round(maxCachedBooks)),
							}),
							{ step: 1, min: 1, fallback: 10 },
						)}
					</SettingsItemGroup>
				</div>

				<SettingsItemGroup title="Downloaded Books">
					{(cachedBooks.data?.length ?? 0) === 0 ? (
						<p className="opacity-60">
							{cachedBooks.isPending
								? "Loading…"
								: "No books stored for offline reading."}
						</p>
					) : (
						<>
							<div className="mb-1 flex items-center justify-between text-sm opacity-60">
								<span>
									{formatBytes(
										(cachedBooks.data ?? []).reduce(
											(acc, book) => acc + book.sizeBytes,
											0,
										),
									)}{" "}
									total
								</span>
								<button
									type="button"
									className="cursor-pointer underline transition-opacity hover:opacity-70"
									onClick={() => clearCached.mutate()}
								>
									Delete all
								</button>
							</div>
							<ul className="divide-y divide-gray-400/30">
								{(cachedBooks.data ?? []).map((book) => (
									<li key={book.uuid} className="flex items-center gap-4 py-2">
										<div className="min-w-0 flex-1">
											<p className="truncate">
												{book.title}
												{book.uuid === currentBookUuid && (
													<span className="ml-2 text-sm opacity-60">
														(open)
													</span>
												)}
											</p>
											<p className="text-sm opacity-60">
												{formatBytes(book.sizeBytes)} ·{" "}
												{new Date(book.storedAt).toLocaleDateString()}
											</p>
										</div>
										<button
											type="button"
											title="Remove from cache"
											className="cursor-pointer p-2 opacity-60 transition-opacity hover:opacity-100"
											onClick={() => deleteCached.mutate(book.uuid)}
										>
											<Trash2 className="size-4" />
										</button>
									</li>
								))}
							</ul>
						</>
					)}
				</SettingsItemGroup>
			</div>

			{customThemeDialog !== null && (
				<ReaderCustomThemeDialog
					selectedTheme={customThemeDialog}
					existingThemes={optionsForTheme}
					customThemes={customThemes}
					onSave={handleCustomThemeSave}
					onClose={() => setCustomThemeDialog(null)}
				/>
			)}
		</div>
	);
}
