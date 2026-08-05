/**
 * Quick settings popover: the handful of settings worth changing mid-read.
 * Unlike the full settings overlay (draft, committed on close), every change
 * here commits immediately so the book updates in real time behind the panel.
 */

import { GearSix } from "@phosphor-icons/react";
import {
	readerMix,
	Segmented,
	SettingRow,
	SettingsSection,
	SliderRow,
	Stepper,
	ThemedOption,
	ThemedSelect,
} from "@/components/reader/reader-controls";
import type { MangaReaderSettings } from "@/lib/reader/manga-settings";
import type { ReaderProfile } from "@/lib/reader/profiles";
import type {
	ReadAs,
	ReaderPresentation,
	ReaderPresentationChange,
} from "@/lib/reader/reader-presentation";
import type { ReaderSettings, ReaderTheme } from "@/lib/reader/settings";
import { viewportHeight, viewportWidth } from "@/lib/reader/viewport";

interface ReaderQuickSettingsProps {
	presentation: ReaderPresentation;
	mangaSettings: MangaReaderSettings;
	settings: ReaderSettings;
	theme: ReaderTheme;
	profiles: ReaderProfile[];
	activeProfileId: string;
	onProfileSwitch: (id: string) => void;
	onChange: (patch: Partial<ReaderSettings>) => void;
	onMangaSettingsChange: (patch: Partial<MangaReaderSettings>) => void;
	onPresentationChange: (change: ReaderPresentationChange) => void;
	onOpenSettings: () => void;
	onClose: () => void;
}

const clampPct = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

export function ReaderQuickSettings({
	presentation,
	mangaSettings,
	settings,
	theme,
	profiles,
	activeProfileId,
	onProfileSwitch,
	onChange,
	onMangaSettingsChange,
	onPresentationChange,
	onOpenSettings,
	onClose,
}: ReaderQuickSettingsProps) {
	const mix = (pct: number) => readerMix(theme, pct);
	const verticalMode = settings.writingMode === "vertical-rl";
	const isComic = presentation.resolvedAs === "comic";
	const resolvedReadAs = isComic ? "Comic / manga" : "Text";

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

	return (
		<>
			<button
				type="button"
				aria-label="Close quick settings"
				className="fixed inset-0 z-[59] cursor-default"
				onClick={onClose}
			/>
			{/* Mobile: full-width dropdown under the top edge (the settings overlay
			    is a vertical page there too); desktop: compact corner popover. */}
			<div
				className="fade-in slide-in-from-top-2 writing-horizontal-tb fixed inset-x-0 top-0 z-[60] flex max-h-[calc(100dvh-var(--safe-area-bottom))] w-full animate-in flex-col gap-4 overflow-y-auto rounded-b-lg border-b pt-[calc(1rem+var(--safe-area-top))] pr-[max(1rem,var(--safe-area-right))] pb-[max(1rem,var(--safe-area-bottom))] pl-[max(1rem,var(--safe-area-left))] shadow-xl duration-200 ease-out motion-reduce:animate-none sm:inset-x-auto sm:top-[max(0.5rem,var(--safe-area-top))] sm:right-[max(0.5rem,var(--safe-area-right))] sm:max-h-[calc(85dvh-var(--safe-area-top)-var(--safe-area-bottom))] sm:w-64 sm:rounded-lg sm:border sm:p-4"
				style={{
					color: theme.fontColor,
					backgroundColor: theme.backgroundColor,
					borderColor: mix(20),
				}}
			>
				<SettingsSection theme={theme} title="General">
					<SettingRow label="Profile">
						<ThemedSelect
							theme={theme}
							value={activeProfileId}
							onChange={onProfileSwitch}
						>
							{profiles.map((profile) => (
								<ThemedOption key={profile.id} theme={theme} value={profile.id}>
									{profile.name}
								</ThemedOption>
							))}
						</ThemedSelect>
					</SettingRow>
					<SettingRow
						label="Read as"
						hint={
							presentation.readAs === "auto"
								? `Automatic: ${resolvedReadAs}`
								: undefined
						}
					>
						<ThemedSelect
							theme={theme}
							value={presentation.readAs}
							onChange={(value) =>
								onPresentationChange({
									type: "read-as",
									value: value as ReadAs,
								})
							}
						>
							<ThemedOption theme={theme} value="auto">
								Automatic
							</ThemedOption>
							<ThemedOption theme={theme} value="text">
								Text
							</ThemedOption>
							{presentation.supportsComic && (
								<ThemedOption theme={theme} value="comic">
									Comic / manga
								</ThemedOption>
							)}
						</ThemedSelect>
					</SettingRow>
				</SettingsSection>

				{!isComic && (
					<SettingsSection theme={theme} title="Text">
						<SettingRow label="Font family">
							<Segmented
								theme={theme}
								options={[
									{ id: "Noto Serif JP", text: "Serif" },
									{ id: "Noto Sans JP", text: "Sans" },
								]}
								selected={settings.fontFamilyGroupOne}
								onSelect={(fontFamilyGroupOne) =>
									onChange({ fontFamilyGroupOne })
								}
							/>
						</SettingRow>
						<SettingRow label="Font size">
							<Stepper
								theme={theme}
								display={`${settings.fontSize}px`}
								onStep={(direction) =>
									onChange({
										fontSize: Math.max(1, settings.fontSize + direction),
									})
								}
							/>
						</SettingRow>
						<SettingRow label="Line height">
							<Stepper
								theme={theme}
								display={settings.lineHeight.toFixed(2)}
								onStep={(direction) =>
									onChange({
										// avoid float drift from repeated 0.05 steps
										lineHeight: Math.max(
											1,
											Math.round(
												(settings.lineHeight + direction * 0.05) * 100,
											) / 100,
										),
									})
								}
							/>
						</SettingRow>
					</SettingsSection>
				)}

				<SettingsSection theme={theme} title="Layout">
					{isComic ? (
						<>
							<SettingRow label="Page layout">
								<ThemedSelect
									theme={theme}
									value={presentation.comicLayout}
									onChange={(layout) =>
										onMangaSettingsChange({
											layout: layout as MangaReaderSettings["layout"],
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
							</SettingRow>
							{presentation.comicLayout !== "vertical-strip" && (
								<SettingRow label="Reading direction">
									<Segmented
										theme={theme}
										options={[
											{ id: "auto", text: "Auto" },
											{ id: "rtl", text: "RTL" },
											{ id: "ltr", text: "LTR" },
										]}
										selected={mangaSettings.readingDirection}
										onSelect={(readingDirection) =>
											onMangaSettingsChange({ readingDirection })
										}
									/>
								</SettingRow>
							)}
							<SettingRow label="Progress indicator">
								<ThemedSelect
									theme={theme}
									value={mangaSettings.progressStyle}
									onChange={(progressStyle) =>
										onMangaSettingsChange({
											progressStyle:
												progressStyle as MangaReaderSettings["progressStyle"],
										})
									}
								>
									<ThemedOption theme={theme} value="text">
										Page number
									</ThemedOption>
									<ThemedOption theme={theme} value="page-lines">
										Page ticks
									</ThemedOption>
									<ThemedOption theme={theme} value="bar">
										Progress bar
									</ThemedOption>
								</ThemedSelect>
							</SettingRow>
						</>
					) : (
						<>
							<SettingRow label="Text layout">
								<Segmented
									theme={theme}
									options={[
										{ id: "scroll", text: "Scroll" },
										{ id: "paginated", text: "Paginated" },
									]}
									selected={presentation.textLayout}
									onSelect={(value) =>
										onPresentationChange({
											type: "text-layout",
											value,
										})
									}
								/>
							</SettingRow>
							<SettingRow label="Writing mode">
								<Segmented
									theme={theme}
									options={[
										{ id: "horizontal-tb", text: "Horizontal" },
										{ id: "vertical-rl", text: "Vertical" },
									]}
									selected={settings.writingMode}
									onSelect={(writingMode) => onChange({ writingMode })}
								/>
							</SettingRow>
							<SettingRow
								label={verticalMode ? "Side margin" : "Top/bottom margin"}
							>
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
								/>
							</SettingRow>
							<SettingRow
								label={
									verticalMode ? "Reading area height" : "Reading area width"
								}
							>
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
								/>
							</SettingRow>
						</>
					)}
				</SettingsSection>

				<button
					type="button"
					className="flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border text-sm opacity-70 transition-opacity duration-150 hover:opacity-100 sm:h-8"
					style={{ borderColor: mix(25) }}
					onClick={onOpenSettings}
				>
					<GearSix className="size-4" />
					All settings
				</button>
			</div>
		</>
	);
}
