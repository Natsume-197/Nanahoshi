/**
 * Quick settings panel: the handful of settings worth changing mid-read.
 * Unlike the full settings overlay (draft, committed on close), every change
 * here commits immediately so the book updates in real time behind the panel.
 */

import {
	ArrowLeft,
	CaretRight,
	Check,
	Copy,
	CursorClick,
	Eye,
	GearSix,
	Pen,
	PencilSimple,
	Plus,
	Rows,
	TextT,
	Trash,
	Users,
	X,
} from "@phosphor-icons/react";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { Separator } from "@/components/ui/separator";
import type { ReaderProfile } from "@/features/reader/presentation/profiles";
import type {
	ReaderPresentation,
	ReaderPresentationChange,
} from "@/features/reader/presentation/reader-presentation";
import { canUsePageColumns } from "@/features/reader/presentation/reader-presentation";
import {
	type CustomReaderThemes,
	READER_FONT_SIZE_MAX,
	READER_FONT_SIZE_MIN,
	READER_LINE_HEIGHT_MAX,
	READER_LINE_HEIGHT_MIN,
	type ReaderSettings,
	type ReaderTheme,
	type ReaderThemeColors,
	readerThemes,
} from "@/features/reader/presentation/settings";
import type { VisualReaderSettings } from "@/features/reader/presentation/visual-settings";
import {
	viewportHeight,
	viewportWidth,
} from "@/features/reader/renderers/shared/viewport";
import {
	readerMix,
	Segmented,
	SliderRow,
	Stepper,
	ThemedOption,
	ThemedSelect,
	ThemedTextInput,
	Toggle,
} from "@/features/reader/ui/controls/reader-controls";
import { ReaderCustomThemeDialog } from "@/features/reader/ui/controls/reader-custom-theme";

interface ReaderQuickSettingsProps {
	open: boolean;
	presentation: ReaderPresentation;
	visualSettings: VisualReaderSettings;
	settings: ReaderSettings;
	theme: ReaderTheme;
	customThemes: CustomReaderThemes;
	profiles: ReaderProfile[];
	activeProfileId: string;
	isMobile: boolean;
	onProfileSwitch: (id: string) => void;
	onProfileCreate: (name: string) => void;
	onProfileRename: (id: string, name: string) => void;
	onProfileDuplicate: (id: string) => void;
	onProfileDelete: (id: string) => void;
	onCustomThemesChange: (next: CustomReaderThemes) => void;
	onChange: (patch: Partial<ReaderSettings>) => void;
	onVisualSettingsChange: (patch: Partial<VisualReaderSettings>) => void;
	onPresentationChange: (change: ReaderPresentationChange) => void;
	onOpenSettings: () => void;
	onClose: () => void;
}

const clampPct = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

type QuickSettingsCategory =
	| "profiles"
	| "visual"
	| "text"
	| "layout"
	| "behaviour";

function QuickSettingsSection({
	title,
	showTitle = true,
	children,
}: {
	title: string;
	showTitle?: boolean;
	children: ReactNode;
}) {
	return (
		<section className="flex min-w-0 flex-col gap-5 py-6 first:pt-3">
			{showTitle && (
				<h2 className="font-semibold text-base tracking-tight">{title}</h2>
			)}
			<div className="flex min-w-0 flex-col gap-4">{children}</div>
		</section>
	);
}

function QuickSettingsRow({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-11 min-w-0 flex-wrap items-center justify-between gap-3">
			<span className="min-w-0 flex-1 font-medium text-sm">{label}</span>
			<div className="ml-auto min-w-0 max-w-full shrink [&>*]:max-w-full">
				{children}
			</div>
		</div>
	);
}

export function ReaderQuickSettings({
	open,
	presentation,
	visualSettings,
	settings,
	theme,
	customThemes,
	profiles,
	activeProfileId,
	isMobile,
	onProfileSwitch,
	onProfileCreate,
	onProfileRename,
	onProfileDuplicate,
	onProfileDelete,
	onCustomThemesChange,
	onChange,
	onVisualSettingsChange,
	onPresentationChange,
	onOpenSettings,
	onClose,
}: ReaderQuickSettingsProps) {
	const mix = (pct: number) => readerMix(theme, pct);
	const verticalMode = settings.writingMode === "vertical-rl";
	const isVisual = presentation.resolvedAs === "visual";
	const canSelectPageColumns = canUsePageColumns(
		presentation.renderer,
		verticalMode,
	);
	const [selectedCategory, setSelectedCategory] =
		useState<QuickSettingsCategory | null>(null);
	const [profileRename, setProfileRename] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const [newProfileName, setNewProfileName] = useState("");
	const [customThemeDialog, setCustomThemeDialog] = useState<string | null>(
		null,
	);

	useEffect(() => {
		if (!open) {
			setSelectedCategory(null);
			setProfileRename(null);
			setNewProfileName("");
			setCustomThemeDialog(null);
		}
	}, [open]);

	const commitProfileRename = () => {
		if (profileRename) {
			onProfileRename(profileRename.id, profileRename.name);
		}
		setProfileRename(null);
	};

	const createProfileFromInput = () => {
		onProfileCreate(newProfileName);
		setNewProfileName("");
	};

	const themeIds = [
		...readerThemes.map((readerTheme) => readerTheme.id),
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
		const next = { ...customThemes };
		delete next[name];
		onCustomThemesChange(next);
		if (settings.theme === name) {
			onChange({ theme: readerThemes[0]?.id ?? "light-theme" });
		}
	};

	const activeCategory = selectedCategory;
	const settingsCategories = [
		{ id: "profiles" as const, label: "Profiles", icon: Users },
		{ id: "visual" as const, label: "Visual", icon: Eye },
		...(!isVisual ? [{ id: "text" as const, label: "Text", icon: TextT }] : []),
		{ id: "layout" as const, label: "Layout", icon: Rows },
		{ id: "behaviour" as const, label: "Behaviour", icon: CursorClick },
	];
	const settingsCategoryTitle =
		settingsCategories.find((category) => category.id === selectedCategory)
			?.label ?? "Reader settings";

	// Same %-of-screen mapping as the settings overlay (engine stores px).
	// viewport.ts helpers, not window.inner*: the engine measures in CSS px and
	// window.inner* can report physical px on HiDPI Linux.
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
	const firstDimensionPaddingPct = marginPct;
	const secondDimensionPaddingPct = clampPct(
		Math.round((100 - areaPct) / 2),
		0,
		30,
	);
	const horizontalPaddingPct = verticalMode
		? firstDimensionPaddingPct
		: secondDimensionPaddingPct;
	const verticalPaddingPct = verticalMode
		? secondDimensionPaddingPct
		: firstDimensionPaddingPct;

	const updatePhysicalPadding = (
		axis: "horizontal" | "vertical",
		nextValue: number,
	) => {
		const paddingPct = clampPct(nextValue, 0, 30);
		const currentValue =
			axis === "horizontal" ? horizontalPaddingPct : verticalPaddingPct;
		if (paddingPct === currentValue) return;
		const changesFirstDimension =
			(axis === "horizontal" && verticalMode) ||
			(axis === "vertical" && !verticalMode);

		if (changesFirstDimension) {
			onChange({
				firstDimensionMargin: Math.round((paddingPct / 100) * marginAxisPx()),
			});
			return;
		}

		onChange({
			secondDimensionMaxValue:
				paddingPct === 0
					? 0
					: Math.round((1 - (paddingPct * 2) / 100) * areaAxisPx()),
		});
	};
	const availableThemes = [
		...readerThemes.map(({ id, backgroundColor, fontColor }) => ({
			id,
			backgroundColor,
			fontColor,
		})),
		...Object.entries(customThemes).map(([id, colors]) => ({
			id,
			backgroundColor: colors.backgroundColor,
			fontColor: colors.fontColor,
		})),
	];
	const themeLabels: Record<string, string> = {
		"nanahoshi-theme": "Nanahoshi",
		"light-theme": "Light",
		"ecru-theme": "Sepia",
		"dark-theme": "Dark",
		"attribute-theme": "Contrast",
		"black-theme": "Black",
	};
	const readerThemeStyle = {
		"--primary": theme.fontColor,
		"--primary-foreground": theme.backgroundColor,
		"--ring": theme.fontColor,
	} as CSSProperties;

	const settingsContent = (
		<>
			{(!activeCategory || activeCategory === "profiles") && (
				<QuickSettingsSection
					title="Profiles"
					showTitle={activeCategory === null}
				>
					<div className="flex flex-col gap-2">
						{profiles.map((profile) => {
							const selected = profile.id === activeProfileId;
							return (
								<div
									key={profile.id}
									className="flex min-w-0 items-center gap-1"
								>
									{profileRename?.id === profile.id ? (
										<>
											<ThemedTextInput
												ariaLabel="Profile name"
												theme={theme}
												value={profileRename.name}
												onChange={(name) =>
													setProfileRename({ id: profile.id, name })
												}
												onKeyDown={(key) => {
													if (key === "Enter") commitProfileRename();
												}}
											/>
											<button
												type="button"
												aria-label="Save profile name"
												title="Save profile name"
												className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none transition-[opacity,scale] duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
												onClick={commitProfileRename}
											>
												<Check
													aria-hidden="true"
													className="size-4"
													weight="bold"
												/>
											</button>
										</>
									) : (
										<>
											<button
												type="button"
												aria-pressed={selected}
												className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md px-2 text-left outline-none transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
												style={
													selected ? { backgroundColor: mix(8) } : undefined
												}
												onClick={() => onProfileSwitch(profile.id)}
											>
												<span
													aria-hidden="true"
													className="size-2 shrink-0 rounded-full"
													style={{
														backgroundColor: selected
															? theme.fontColor
															: mix(25),
													}}
												/>
												<span className="min-w-0 flex-1 truncate font-medium text-sm">
													{profile.name}
												</span>
												{selected && (
													<span className="shrink-0 text-xs opacity-55">
														Active
													</span>
												)}
											</button>
											<button
												type="button"
												aria-label={`Rename ${profile.name}`}
												title="Rename profile"
												className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none transition-[opacity,scale] duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
												onClick={() =>
													setProfileRename({
														id: profile.id,
														name: profile.name,
													})
												}
											>
												<Pen aria-hidden="true" className="size-4" />
											</button>
											<button
												type="button"
												aria-label={`Duplicate ${profile.name}`}
												title="Duplicate profile"
												className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none transition-[opacity,scale] duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
												onClick={() => onProfileDuplicate(profile.id)}
											>
												<Copy aria-hidden="true" className="size-4" />
											</button>
											{profiles.length > 1 && (
												<button
													type="button"
													aria-label={`Delete ${profile.name}`}
													title="Delete profile"
													className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none transition-[opacity,scale] duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
													onClick={() => onProfileDelete(profile.id)}
												>
													<Trash aria-hidden="true" className="size-4" />
												</button>
											)}
										</>
									)}
								</div>
							);
						})}
					</div>
					<div className="flex items-center gap-2">
						<ThemedTextInput
							ariaLabel="New profile name"
							theme={theme}
							value={newProfileName}
							placeholder="New profile name"
							onChange={setNewProfileName}
							onKeyDown={(key) => {
								if (key === "Enter") createProfileFromInput();
							}}
						/>
						<button
							type="button"
							aria-label="Create profile from current settings"
							title="Create profile from current settings"
							className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none transition-[opacity,scale] duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
							onClick={createProfileFromInput}
						>
							<Plus aria-hidden="true" className="size-5" />
						</button>
					</div>
					<p className="text-xs opacity-55">
						New profiles copy your current reading settings.
					</p>
				</QuickSettingsSection>
			)}

			{(!activeCategory || activeCategory === "visual") && (
				<QuickSettingsSection
					title="Visual"
					showTitle={activeCategory === null}
				>
					<fieldset aria-label="Reading theme">
						<legend className="mb-3 font-semibold text-sm">Themes</legend>
						<div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
							{availableThemes.map((option) => {
								const selected = option.id === settings.theme;
								return (
									<button
										key={option.id}
										type="button"
										aria-pressed={selected}
										className="group relative min-w-0 cursor-pointer rounded-xl p-1 text-left outline-none transition-[scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
										style={{
											boxShadow: selected
												? `0 0 0 2px ${theme.fontColor}`
												: undefined,
										}}
										onClick={() => onChange({ theme: option.id })}
									>
										<span
											aria-hidden="true"
											className="relative flex h-16 flex-col justify-between rounded-lg p-2 shadow-sm"
											style={{
												backgroundColor: option.backgroundColor,
												boxShadow: `inset 0 0 0 1px ${mix(12)}`,
											}}
										>
											<span
												className="font-serif text-lg leading-none"
												style={{ color: option.fontColor }}
											>
												Aa
											</span>
											<span
												className="w-3/5 text-[8px] leading-tight opacity-75"
												style={{ color: option.fontColor }}
											>
												Aa Aa
											</span>
											{selected && (
												<Check
													className="absolute top-2 right-2 size-4"
													weight="bold"
													style={{ color: option.fontColor }}
												/>
											)}
										</span>
										<span
											className="mt-1 block truncate px-1 font-medium text-[11px]"
											style={{ color: selected ? theme.fontColor : mix(68) }}
										>
											{themeLabels[option.id] ?? option.id}
										</span>
									</button>
								);
							})}
							<button
								type="button"
								className="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl p-2 text-sm outline-none transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
								style={{ backgroundColor: mix(6), color: mix(72) }}
								onClick={() => setCustomThemeDialog("")}
							>
								<Plus aria-hidden="true" className="size-5" weight="bold" />
								<span className="font-medium text-[11px]">Create theme</span>
							</button>
						</div>
					</fieldset>
					{customThemes[settings.theme] && (
						<div className="flex items-center justify-between gap-3 rounded-xl px-1 py-1">
							<div className="min-w-0 text-sm">
								<div className="font-medium">{settings.theme}</div>
								<div className="text-xs opacity-55">Custom theme</div>
							</div>
							<div className="flex shrink-0 items-center gap-1">
								<button
									type="button"
									aria-label={`Edit ${settings.theme}`}
									title="Edit custom theme"
									className="flex size-10 cursor-pointer items-center justify-center rounded-full outline-none transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
									style={{ backgroundColor: mix(7) }}
									onClick={() => setCustomThemeDialog(settings.theme)}
								>
									<PencilSimple aria-hidden="true" className="size-4" />
								</button>
								<button
									type="button"
									aria-label={`Delete ${settings.theme}`}
									title="Delete custom theme"
									className="flex size-10 cursor-pointer items-center justify-center rounded-full outline-none transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
									style={{ backgroundColor: mix(7) }}
									onClick={() => handleCustomThemeDelete(settings.theme)}
								>
									<Trash aria-hidden="true" className="size-4" />
								</button>
							</div>
						</div>
					)}
					<QuickSettingsRow label="Character counter">
						<Toggle
							theme={theme}
							value={settings.showCharacterCounter}
							onChange={(showCharacterCounter) =>
								onChange({ showCharacterCounter })
							}
						/>
					</QuickSettingsRow>
					<QuickSettingsRow label="Percentage">
						<Toggle
							theme={theme}
							value={settings.showPercentage}
							onChange={(showPercentage) => onChange({ showPercentage })}
						/>
					</QuickSettingsRow>
					{isVisual && (
						<QuickSettingsRow label="Progress indicator">
							<div className="w-52 max-w-full">
								<Segmented
									theme={theme}
									ariaLabel="Progress indicator"
									options={[
										{ id: "text", text: "Page number" },
										{ id: "page-lines", text: "Page ticks" },
										{ id: "bar", text: "Progress bar" },
									]}
									selected={visualSettings.progressStyle}
									onSelect={(progressStyle) =>
										onVisualSettingsChange({ progressStyle })
									}
								/>
							</div>
						</QuickSettingsRow>
					)}
				</QuickSettingsSection>
			)}

			{!isVisual && (!activeCategory || activeCategory === "text") && (
				<>
					{!activeCategory && (
						<Separator style={{ backgroundColor: mix(14) }} />
					)}
					<QuickSettingsSection
						title="Text"
						showTitle={activeCategory === null}
					>
						<QuickSettingsRow label="Text size">
							<fieldset aria-label="Text size">
								<Stepper
									theme={theme}
									compact
									display={`${settings.fontSize}`}
									canDecrease={settings.fontSize > READER_FONT_SIZE_MIN}
									canIncrease={settings.fontSize < READER_FONT_SIZE_MAX}
									onStep={(direction) =>
										onChange({
											fontSize: Math.min(
												READER_FONT_SIZE_MAX,
												Math.max(
													READER_FONT_SIZE_MIN,
													settings.fontSize + direction,
												),
											),
										})
									}
								/>
							</fieldset>
						</QuickSettingsRow>
						<QuickSettingsRow label="Font">
							<div className="w-40">
								<Segmented
									theme={theme}
									ariaLabel="Font"
									options={[
										{ id: "Noto Serif JP", text: "Serif" },
										{ id: "Noto Sans JP", text: "Sans" },
									]}
									selected={settings.fontFamilyGroupOne}
									onSelect={(fontFamilyGroupOne) =>
										onChange({ fontFamilyGroupOne })
									}
								/>
							</div>
						</QuickSettingsRow>
						<QuickSettingsRow label="Font weight">
							<div className="w-40">
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
										<ThemedOption
											key={weight}
											theme={theme}
											value={String(weight)}
										>
											{weight}
										</ThemedOption>
									))}
								</ThemedSelect>
							</div>
						</QuickSettingsRow>
						<QuickSettingsRow label="Text orientation">
							<div className="w-40">
								<Segmented
									theme={theme}
									ariaLabel="Text orientation"
									options={[
										{ id: "horizontal-tb", text: "Horizontal" },
										{ id: "vertical-rl", text: "Vertical" },
									]}
									selected={settings.writingMode}
									onSelect={(writingMode) => onChange({ writingMode })}
								/>
							</div>
						</QuickSettingsRow>
						<QuickSettingsRow label="Justify text">
							<Toggle
								theme={theme}
								value={settings.enableTextJustification}
								onChange={(enableTextJustification) =>
									onChange({ enableTextJustification })
								}
							/>
						</QuickSettingsRow>
						<QuickSettingsRow label="Pretty text wrap">
							<Toggle
								theme={theme}
								value={settings.enableTextWrapPretty}
								onChange={(enableTextWrapPretty) =>
									onChange({ enableTextWrapPretty })
								}
							/>
						</QuickSettingsRow>
						<QuickSettingsRow label="Prioritize reader styles">
							<Toggle
								theme={theme}
								value={settings.prioritizeReaderStyles}
								onChange={(prioritizeReaderStyles) =>
									onChange({ prioritizeReaderStyles })
								}
							/>
						</QuickSettingsRow>
						<QuickSettingsRow label="Hide furigana">
							<Toggle
								theme={theme}
								value={settings.hideFurigana}
								onChange={(hideFurigana) => onChange({ hideFurigana })}
							/>
						</QuickSettingsRow>
						{settings.hideFurigana && (
							<QuickSettingsRow label="Hide style">
								<div className="w-52 max-w-full">
									<Segmented
										theme={theme}
										ariaLabel="Furigana hide style"
										options={[
											{ id: "Hide", text: "Hide" },
											{ id: "Partial", text: "Partial" },
											{ id: "Toggle", text: "Toggle" },
											{ id: "Full", text: "Full" },
										]}
										selected={settings.furiganaStyle}
										onSelect={(furiganaStyle) => onChange({ furiganaStyle })}
									/>
								</div>
							</QuickSettingsRow>
						)}
						<QuickSettingsRow label="Paragraph indentation">
							<fieldset
								className="w-48 max-w-full"
								aria-label="Paragraph indentation"
							>
								<SliderRow
									theme={theme}
									min={0}
									max={10}
									step={0.5}
									value={settings.textIndentation}
									format={(textIndentation) => `${textIndentation}em`}
									onChange={(textIndentation) => onChange({ textIndentation })}
								/>
							</fieldset>
						</QuickSettingsRow>
						<QuickSettingsRow label="Paragraph spacing">
							<div className="w-40">
								<Segmented
									theme={theme}
									ariaLabel="Paragraph spacing"
									options={[
										{ id: "auto", text: "Auto" },
										{ id: "manual", text: "Manual" },
									]}
									selected={settings.textMarginMode}
									onSelect={(textMarginMode) => onChange({ textMarginMode })}
								/>
							</div>
						</QuickSettingsRow>
						{settings.textMarginMode === "manual" && (
							<QuickSettingsRow label="Paragraph spacing size">
								<fieldset
									className="w-48 max-w-full"
									aria-label="Paragraph spacing size"
								>
									<SliderRow
										theme={theme}
										min={0}
										max={10}
										step={0.5}
										value={settings.textMarginValue}
										format={(textMarginValue) => `${textMarginValue}em`}
										onChange={(textMarginValue) =>
											onChange({ textMarginValue })
										}
									/>
								</fieldset>
							</QuickSettingsRow>
						)}
					</QuickSettingsSection>
				</>
			)}

			{!activeCategory && <Separator style={{ backgroundColor: mix(14) }} />}
			{(!activeCategory || activeCategory === "layout") && (
				<QuickSettingsSection
					title="Layout"
					showTitle={activeCategory === null}
				>
					{isVisual ? (
						<>
							<label
								htmlFor="reader-quick-page-layout"
								className="flex flex-col gap-2"
							>
								<div className="font-medium text-sm">Page layout</div>
								<ThemedSelect
									id="reader-quick-page-layout"
									theme={theme}
									value={presentation.visualLayout}
									onChange={(layout) =>
										onVisualSettingsChange({
											layout: layout as VisualReaderSettings["layout"],
										})
									}
								>
									<ThemedOption theme={theme} value="horizontal-strip">
										Horizontal strip
									</ThemedOption>
									<ThemedOption theme={theme} value="single-page">
										Single page
									</ThemedOption>
									<ThemedOption theme={theme} value="two-page-spread">
										Two-page spread
									</ThemedOption>
									<ThemedOption theme={theme} value="vertical-strip">
										Vertical strip
									</ThemedOption>
								</ThemedSelect>
							</label>
							{presentation.visualLayout !== "vertical-strip" && (
								<div className="flex flex-col gap-2">
									<div className="font-medium text-sm">Reading direction</div>
									<Segmented
										theme={theme}
										ariaLabel="Reading direction"
										options={[
											{ id: "auto", text: "Auto" },
											{ id: "rtl", text: "Visual" },
											{ id: "ltr", text: "Western" },
										]}
										selected={visualSettings.readingDirection}
										onSelect={(readingDirection) =>
											onVisualSettingsChange({ readingDirection })
										}
									/>
								</div>
							)}
						</>
					) : (
						<>
							<QuickSettingsRow label="Flow">
								<div className="w-52 max-w-full">
									<Segmented
										theme={theme}
										ariaLabel="Reading flow"
										options={[
											{ id: "scroll", text: "Continuous" },
											{ id: "paginated", text: "Pages" },
											{ id: "focus", text: "Focus" },
										]}
										selected={presentation.textLayout}
										onSelect={(value) =>
											onPresentationChange({ type: "text-layout", value })
										}
									/>
								</div>
							</QuickSettingsRow>
							{canSelectPageColumns && (
								<QuickSettingsRow label="Columns">
									<div className="w-40">
										<Segmented
											theme={theme}
											ariaLabel="Columns"
											options={[
												{ id: 0, text: "Auto" },
												{ id: 1, text: "1" },
												{ id: 2, text: "2" },
											]}
											selected={Math.min(settings.pageColumns, 2)}
											onSelect={(pageColumns) => onChange({ pageColumns })}
										/>
									</div>
								</QuickSettingsRow>
							)}
							<QuickSettingsRow label="Line height">
								<fieldset aria-label="Line height">
									<Stepper
										theme={theme}
										compact
										display={settings.lineHeight.toFixed(2)}
										canDecrease={settings.lineHeight > READER_LINE_HEIGHT_MIN}
										canIncrease={settings.lineHeight < READER_LINE_HEIGHT_MAX}
										onStep={(direction) =>
											onChange({
												lineHeight: Math.min(
													READER_LINE_HEIGHT_MAX,
													Math.max(
														READER_LINE_HEIGHT_MIN,
														Math.round(
															(settings.lineHeight + direction * 0.05) * 100,
														) / 100,
													),
												),
											})
										}
									/>
								</fieldset>
							</QuickSettingsRow>
							<QuickSettingsRow label="Horizontal padding">
								<fieldset aria-label="Horizontal padding">
									<Stepper
										theme={theme}
										compact
										display={`${horizontalPaddingPct}%`}
										canDecrease={horizontalPaddingPct > 0}
										canIncrease={horizontalPaddingPct < 30}
										onStep={(direction) =>
											updatePhysicalPadding(
												"horizontal",
												horizontalPaddingPct + direction,
											)
										}
									/>
								</fieldset>
							</QuickSettingsRow>
							<QuickSettingsRow label="Vertical padding">
								<fieldset aria-label="Vertical padding">
									<Stepper
										theme={theme}
										compact
										display={`${verticalPaddingPct}%`}
										canDecrease={verticalPaddingPct > 0}
										canIncrease={verticalPaddingPct < 30}
										onStep={(direction) =>
											updatePhysicalPadding(
												"vertical",
												verticalPaddingPct + direction,
											)
										}
									/>
								</fieldset>
							</QuickSettingsRow>
						</>
					)}
				</QuickSettingsSection>
			)}

			{!activeCategory && <Separator style={{ backgroundColor: mix(14) }} />}
			{(!activeCategory || activeCategory === "behaviour") && (
				<QuickSettingsSection
					title="Behaviour"
					showTitle={activeCategory === null}
				>
					{presentation.renderer === "text-scroll" && (
						<QuickSettingsRow label="Keep position on resize">
							<Toggle
								theme={theme}
								ariaLabel="Keep position on resize"
								value={settings.autoPositionOnResize}
								onChange={(autoPositionOnResize) =>
									onChange({ autoPositionOnResize })
								}
							/>
						</QuickSettingsRow>
					)}
					{!isVisual && (
						<QuickSettingsRow label="Disable wheel navigation">
							<Toggle
								theme={theme}
								value={settings.disableWheelNavigation}
								onChange={(disableWheelNavigation) =>
									onChange({ disableWheelNavigation })
								}
							/>
						</QuickSettingsRow>
					)}
				</QuickSettingsSection>
			)}

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

			{activeCategory === null && (
				<>
					<Separator style={{ backgroundColor: mix(14) }} />
					<button
						type="button"
						className="my-2 flex min-h-14 w-full cursor-pointer items-center gap-3 px-1 text-start outline-none transition-[opacity,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
						style={{ color: theme.fontColor }}
						onClick={onOpenSettings}
					>
						<span className="min-w-0 flex-1 font-medium text-sm">
							Advanced settings
						</span>
						<CaretRight
							aria-hidden="true"
							className="size-4 shrink-0 opacity-55"
						/>
					</button>
				</>
			)}
		</>
	);

	const categoryList = (
		<div className="flex min-w-0 flex-col gap-2">
			{settingsCategories.map((category) => {
				const Icon = category.icon;
				return (
					<button
						key={category.id}
						type="button"
						className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-4 text-start outline-none transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
						style={{ backgroundColor: mix(5) }}
						onClick={() => setSelectedCategory(category.id)}
					>
						<Icon
							aria-hidden="true"
							className="size-5 shrink-0"
							weight="bold"
						/>
						<span className="min-w-0 flex-1 font-medium text-sm">
							{category.label}
						</span>
						<CaretRight
							aria-hidden="true"
							className="size-4 shrink-0 opacity-55"
						/>
					</button>
				);
			})}
			<button
				type="button"
				className="mt-3 flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-4 text-start outline-none transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
				style={{ color: theme.fontColor, backgroundColor: mix(5) }}
				onClick={onOpenSettings}
			>
				<GearSix aria-hidden="true" className="size-5 shrink-0" weight="bold" />
				<span className="min-w-0 flex-1 font-medium text-sm">
					Advanced settings
				</span>
				<CaretRight aria-hidden="true" className="size-4 shrink-0 opacity-55" />
			</button>
		</div>
	);

	if (isMobile) {
		return (
			<Drawer
				open={open}
				modal={false}
				onOpenChange={(open) => !open && onClose()}
				showSwipeHandle
			>
				<DrawerContent
					className="reader-quick-settings-sheet writing-horizontal-tb rounded-t-[1.75rem] rounded-b-none border-x-0 border-b-0 [--drawer-inset:0px] [&_[data-slot=drawer-swipe-handle]:after]:bg-current [&_[data-slot=drawer-swipe-handle]:after]:opacity-30"
					style={
						{
							...readerThemeStyle,
							"--drawer-content-height": "60dvh",
							"--drawer-content-max-height": "60dvh",
							color: theme.fontColor,
							backgroundColor: theme.backgroundColor,
							borderColor: mix(20),
						} as CSSProperties
					}
				>
					<DrawerHeader className="px-[max(1rem,var(--safe-area-left))] pt-2 pr-[max(1rem,var(--safe-area-right))] pb-3 text-start">
						<div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2">
							{selectedCategory ? (
								<button
									type="button"
									aria-label="Back to settings categories"
									title="Back"
									className="flex size-11 cursor-pointer items-center justify-center rounded-full outline-none transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
									style={{ backgroundColor: mix(7) }}
									onClick={() => setSelectedCategory(null)}
								>
									<ArrowLeft aria-hidden="true" className="size-5" />
								</button>
							) : (
								<span aria-hidden="true" />
							)}
							<DrawerTitle
								id="reader-quick-settings-title"
								className="truncate text-center text-base"
								style={{ color: theme.fontColor }}
							>
								{settingsCategoryTitle}
							</DrawerTitle>
							<span aria-hidden="true" />
						</div>
						<DrawerDescription className="sr-only">
							Adjust reading settings. Changes apply immediately.
						</DrawerDescription>
					</DrawerHeader>
					<div className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto overscroll-contain px-[max(1rem,var(--safe-area-left))] pt-1 pr-[max(1rem,var(--safe-area-right))] pb-[max(1rem,var(--safe-area-bottom))]">
						{selectedCategory === null ? categoryList : settingsContent}
					</div>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<aside
			aria-hidden={!open}
			aria-describedby="reader-quick-settings-description"
			aria-labelledby="reader-quick-settings-title"
			data-reader-overlay
			inert={!open}
			className={`writing-horizontal-tb fixed inset-y-0 right-0 z-[60] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden border-s shadow-[-12px_0_28px_-16px_rgba(0,0,0,0.35)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-[var(--ease-smooth-out)] ${
				open
					? "pointer-events-auto translate-x-0"
					: "pointer-events-none translate-x-full"
			}`}
			style={{
				...readerThemeStyle,
				color: theme.fontColor,
				backgroundColor: theme.backgroundColor,
				borderColor: mix(20),
			}}
		>
			<header className="grid min-h-14 shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 px-4 pt-[var(--safe-area-top)] pr-[max(1rem,var(--safe-area-right))]">
				{selectedCategory ? (
					<button
						type="button"
						aria-label="Back to settings categories"
						title="Back"
						className="flex size-11 cursor-pointer items-center justify-center rounded-full outline-none transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
						style={{ backgroundColor: mix(7) }}
						onClick={() => setSelectedCategory(null)}
					>
						<ArrowLeft aria-hidden="true" className="size-5" />
					</button>
				) : (
					<span aria-hidden="true" />
				)}
				<h2
					id="reader-quick-settings-title"
					className="truncate text-center font-semibold text-base tracking-tight"
				>
					{settingsCategoryTitle}
				</h2>
				<button
					type="button"
					aria-label="Close settings"
					title="Close"
					className="flex size-11 cursor-pointer items-center justify-center justify-self-end rounded-full outline-none transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
					style={{ backgroundColor: mix(7) }}
					onClick={onClose}
				>
					<X aria-hidden="true" className="size-5" />
				</button>
				<p id="reader-quick-settings-description" className="sr-only">
					Adjust reading settings. Changes apply immediately.
				</p>
			</header>
			<div className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto overscroll-contain px-4 pt-1 pr-[max(1rem,var(--safe-area-right))] pb-[max(1rem,var(--safe-area-bottom))]">
				{selectedCategory === null ? categoryList : settingsContent}
			</div>
		</aside>
	);
}
