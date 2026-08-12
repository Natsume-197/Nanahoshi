/**
 * Quick settings popover: the handful of settings worth changing mid-read.
 * Unlike the full settings overlay (draft, committed on close), every change
 * here commits immediately so the book updates in real time behind the panel.
 */

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { CaretRight, Check } from "@phosphor-icons/react";
import type { CSSProperties, ReactNode } from "react";
import {
	readerMix,
	Segmented,
	Stepper,
	ThemedOption,
	ThemedSelect,
	Toggle,
} from "@/components/reader/reader-controls";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { Separator } from "@/components/ui/separator";
import type { MangaReaderSettings } from "@/lib/reader/manga-settings";
import type {
	ReaderPresentation,
	ReaderPresentationChange,
} from "@/lib/reader/reader-presentation";
import {
	type CustomReaderThemes,
	READER_FONT_SIZE_MAX,
	READER_FONT_SIZE_MIN,
	READER_LINE_HEIGHT_MAX,
	READER_LINE_HEIGHT_MIN,
	type ReaderSettings,
	type ReaderTheme,
	readerThemes,
} from "@/lib/reader/settings";
import { viewportHeight, viewportWidth } from "@/lib/reader/viewport";

interface ReaderQuickSettingsProps {
	presentation: ReaderPresentation;
	mangaSettings: MangaReaderSettings;
	settings: ReaderSettings;
	theme: ReaderTheme;
	customThemes: CustomReaderThemes;
	isMobile: boolean;
	onChange: (patch: Partial<ReaderSettings>) => void;
	onMangaSettingsChange: (patch: Partial<MangaReaderSettings>) => void;
	onPresentationChange: (change: ReaderPresentationChange) => void;
	onOpenSettings: () => void;
	onClose: () => void;
}

const clampPct = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

function QuickSettingsSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="flex min-w-0 flex-col gap-5 py-6 first:pt-3">
			<h2 className="font-semibold text-base tracking-tight">{title}</h2>
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
	presentation,
	mangaSettings,
	settings,
	theme,
	customThemes,
	isMobile,
	onChange,
	onMangaSettingsChange,
	onPresentationChange,
	onOpenSettings,
	onClose,
}: ReaderQuickSettingsProps) {
	const mix = (pct: number) => readerMix(theme, pct);
	const verticalMode = settings.writingMode === "vertical-rl";
	const isComic = presentation.resolvedAs === "comic";

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
		"water-theme": "Water",
		"gray-theme": "Gray",
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
			<QuickSettingsSection title="Theme">
				<fieldset
					className="scrollbar-none flex w-full min-w-0 max-w-full snap-x snap-proximity gap-3 overflow-x-auto overscroll-x-contain pe-8 pb-2 [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y]"
					aria-label="Reading theme"
				>
					{availableThemes.map((option) => {
						const selected = option.id === settings.theme;
						return (
							<button
								key={option.id}
								type="button"
								aria-pressed={selected}
								className="flex w-14 shrink-0 cursor-pointer snap-start flex-col items-center gap-1.5 rounded-xl py-1 outline-none transition-[color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]"
								style={{ color: selected ? theme.fontColor : mix(62) }}
								onClick={() => onChange({ theme: option.id })}
							>
								<span
									aria-hidden="true"
									className="relative flex size-10 items-center justify-center rounded-full"
									style={{
										backgroundColor: option.backgroundColor,
										boxShadow: selected
											? `0 0 0 2px ${theme.backgroundColor}, 0 0 0 4px ${theme.fontColor}`
											: `0 0 0 1px ${mix(18)}`,
									}}
								>
									{selected && (
										<Check
											className="size-4"
											weight="bold"
											style={{ color: option.fontColor }}
										/>
									)}
								</span>
								<span className="max-w-full truncate text-xs">
									{themeLabels[option.id] ?? option.id}
								</span>
							</button>
						);
					})}
				</fieldset>
			</QuickSettingsSection>

			{!isComic && (
				<>
					<Separator style={{ backgroundColor: mix(14) }} />
					<QuickSettingsSection title="Text">
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
						<QuickSettingsRow label="Justify text">
							<Toggle
								theme={theme}
								value={settings.enableTextJustification}
								onChange={(enableTextJustification) =>
									onChange({ enableTextJustification })
								}
							/>
						</QuickSettingsRow>
					</QuickSettingsSection>
				</>
			)}

			<Separator style={{ backgroundColor: mix(14) }} />
			<QuickSettingsSection title="Layout">
				{isComic ? (
					<>
						<label
							htmlFor="reader-quick-page-layout"
							className="flex flex-col gap-2"
						>
							<div className="font-medium text-sm">Page layout</div>
							<ThemedSelect
								id="reader-quick-page-layout"
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
						</label>
						{presentation.comicLayout !== "vertical-strip" && (
							<div className="flex flex-col gap-2">
								<div className="font-medium text-sm">Reading direction</div>
								<Segmented
									theme={theme}
									ariaLabel="Reading direction"
									options={[
										{ id: "auto", text: "Auto" },
										{ id: "rtl", text: "Manga" },
										{ id: "ltr", text: "Western" },
									]}
									selected={mangaSettings.readingDirection}
									onSelect={(readingDirection) =>
										onMangaSettingsChange({ readingDirection })
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
				<CaretRight aria-hidden="true" className="size-4 shrink-0 opacity-55" />
			</button>
		</>
	);

	if (isMobile) {
		return (
			<Drawer
				open
				onOpenChange={(open) => !open && onClose()}
				overlayClassName="bg-black/15 supports-backdrop-filter:backdrop-blur-none"
				showSwipeHandle
			>
				<DrawerContent
					className="writing-horizontal-tb rounded-t-[1.75rem] rounded-b-none border-x-0 border-b-0 [--drawer-content-max-height:min(64dvh,40rem)] [--drawer-inset:0px] [&_[data-slot=drawer-swipe-handle]:after]:bg-current [&_[data-slot=drawer-swipe-handle]:after]:opacity-30"
					style={{
						...readerThemeStyle,
						color: theme.fontColor,
						backgroundColor: theme.backgroundColor,
						borderColor: mix(20),
					}}
				>
					<DrawerHeader className="px-[max(1rem,var(--safe-area-left))] pt-2 pr-[max(1rem,var(--safe-area-right))] pb-3 text-start">
						<DrawerTitle
							id="reader-quick-settings-title"
							className="text-base"
							style={{ color: theme.fontColor }}
						>
							Reader settings
						</DrawerTitle>
						<DrawerDescription className="sr-only">
							Adjust reading settings. Changes apply immediately.
						</DrawerDescription>
					</DrawerHeader>
					<div className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto overscroll-contain px-[max(1rem,var(--safe-area-left))] pt-1 pr-[max(1rem,var(--safe-area-right))] pb-[max(1rem,var(--safe-area-bottom))]">
						{settingsContent}
					</div>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<DialogPrimitive.Root
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Backdrop className="fixed inset-0 z-[59] bg-transparent" />
				<DialogPrimitive.Popup
					data-reader-overlay
					className="fade-in slide-in-from-top-2 writing-horizontal-tb fixed top-[max(0.75rem,var(--safe-area-top))] right-[max(0.75rem,var(--safe-area-right))] z-[60] flex max-h-[min(calc(100dvh-1.5rem-var(--safe-area-top)-var(--safe-area-bottom)),48rem)] w-[min(24rem,calc(100vw-1.5rem))] animate-in flex-col overflow-hidden rounded-2xl border shadow-xl duration-200 ease-out motion-reduce:animate-none"
					style={{
						...readerThemeStyle,
						color: theme.fontColor,
						backgroundColor: theme.backgroundColor,
						borderColor: mix(20),
					}}
				>
					<header className="flex min-h-14 shrink-0 items-center px-4">
						<DialogPrimitive.Title
							id="reader-quick-settings-title"
							className="font-semibold text-base tracking-tight"
						>
							Reader settings
						</DialogPrimitive.Title>
						<DialogPrimitive.Description className="sr-only">
							Adjust reading settings. Changes apply immediately.
						</DialogPrimitive.Description>
					</header>
					<div className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto overscroll-contain px-4 pt-1 pb-4">
						{settingsContent}
					</div>
				</DialogPrimitive.Popup>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
