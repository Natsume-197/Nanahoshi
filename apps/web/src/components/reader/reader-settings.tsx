/**
 * Reader settings overlay. Settings model and behavior ported from ttu
 * (BSD-3-Clause, ッツ Reader Authors); chrome follows Nanahoshi's settings
 * modal: category nav on the left (chips on mobile), one category at a time,
 * each setting a vertical label/control row. Colors derive from the reading
 * theme; margins and reading area edit as % of screen instead of raw px.
 */

import { ArrowLeft, Rows, TextT, X } from "@phosphor-icons/react";
import { type ComponentType, type ReactNode, useState } from "react";
import {
	readerMix,
	Segmented,
	ThemedTextInput,
	Toggle,
} from "@/components/reader/reader-controls";
import type {
	ReadAs,
	ReaderPresentation,
	ReaderPresentationChange,
} from "@/lib/reader/reader-presentation";
import {
	type CustomReaderThemes,
	getReaderTheme,
	type ReaderSettings,
} from "@/lib/reader/settings";

type SettingsCategory = "layout" | "text";

const CATEGORIES: {
	key: SettingsCategory;
	label: string;
	desc: string;
	icon: ComponentType<{ className?: string }>;
}[] = [
	{
		key: "layout",
		label: "Layout",
		desc: "Fine-grained reading layout options.",
		icon: Rows,
	},
	{
		key: "text",
		label: "Text",
		desc: "Additional font and paragraph controls.",
		icon: TextT,
	},
];

interface ReaderSettingsOverlayProps {
	presentation: ReaderPresentation;
	settings: ReaderSettings;
	customThemes: CustomReaderThemes;
	onChange: (patch: Partial<ReaderSettings>) => void;
	onPresentationChange: (change: ReaderPresentationChange) => void;
	onClose: () => void;
}

export function ReaderSettingsOverlay({
	presentation,
	settings,
	customThemes,
	onChange,
	onPresentationChange,
	onClose,
}: ReaderSettingsOverlayProps) {
	const theme = getReaderTheme(settings.theme, customThemes);
	const mix = (pct: number) => readerMix(theme, pct);
	const verticalMode = settings.writingMode === "vertical-rl";
	const isComic = presentation.resolvedAs === "comic";
	const resolvedReadAs = isComic ? "Comic / manga" : "Text";
	const visibleCategories = isComic
		? CATEGORIES.filter(({ key }) => key !== "text")
		: CATEGORIES;

	const [category, setCategory] = useState<SettingsCategory>("layout");

	const iconButtonClasses =
		"flex h-11 w-11 shrink-0 cursor-pointer select-none items-center justify-center rounded-md opacity-70 transition-opacity duration-150 hover:opacity-100 sm:h-10 sm:w-10";
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

	const categoryContent: Record<SettingsCategory, ReactNode> = {
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
				{!isComic && (
					<>
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
						{presentation.engine === "text-paginated" &&
							row(
								"Avoid page break",
								<Toggle
									theme={theme}
									value={settings.avoidPageBreak}
									onChange={(avoidPageBreak) => onChange({ avoidPageBreak })}
								/>,
								{ hint: "Keep paragraphs whole on each page" },
							)}
					</>
				)}
			</div>
		),

		text: (
			<div className="flex flex-col">
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
			</div>
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
		</div>
	);
}
