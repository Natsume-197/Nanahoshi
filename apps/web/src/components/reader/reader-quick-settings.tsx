/**
 * Quick settings popover: the handful of settings worth changing mid-read.
 * Unlike the full settings overlay (draft, committed on close), every change
 * here commits immediately so the book updates in real time behind the panel.
 */

import { Settings } from "lucide-react";
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
import type { ReaderProfile } from "@/lib/reader/profiles";
import type { ReaderSettings, ReaderTheme } from "@/lib/reader/settings";

interface ReaderQuickSettingsProps {
	settings: ReaderSettings;
	theme: ReaderTheme;
	profiles: ReaderProfile[];
	activeProfileId: string;
	onProfileSwitch: (id: string) => void;
	onChange: (patch: Partial<ReaderSettings>) => void;
	onOpenSettings: () => void;
	onClose: () => void;
}

const clampPct = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

export function ReaderQuickSettings({
	settings,
	theme,
	profiles,
	activeProfileId,
	onProfileSwitch,
	onChange,
	onOpenSettings,
	onClose,
}: ReaderQuickSettingsProps) {
	const mix = (pct: number) => readerMix(theme, pct);
	const verticalMode = settings.writingMode === "vertical-rl";

	// Same %-of-screen mapping as the settings overlay (engine stores px).
	const marginAxisPx = () =>
		verticalMode ? window.innerWidth : window.innerHeight;
	const areaAxisPx = () =>
		verticalMode ? window.innerHeight : window.innerWidth;

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
				className="fade-in slide-in-from-top-2 writing-horizontal-tb fixed inset-x-0 top-0 z-[60] flex max-h-[85dvh] w-full animate-in flex-col gap-4 overflow-y-auto rounded-b-lg border-b p-4 shadow-xl duration-200 ease-out motion-reduce:animate-none sm:inset-x-auto sm:top-2 sm:right-2 sm:w-64 sm:rounded-lg sm:border"
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
				</SettingsSection>

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
										Math.round((settings.lineHeight + direction * 0.05) * 100) /
											100,
									),
								})
							}
						/>
					</SettingRow>
				</SettingsSection>

				<SettingsSection theme={theme} title="Layout">
					<SettingRow label="View mode">
						<Segmented
							theme={theme}
							options={[
								{ id: "continuous", text: "Continuous" },
								{ id: "paginated", text: "Paginated" },
							]}
							selected={settings.viewMode}
							onSelect={(viewMode) => onChange({ viewMode })}
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
							display={`${marginPct}%`}
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
						label={verticalMode ? "Reading area height" : "Reading area width"}
					>
						<SliderRow
							theme={theme}
							min={30}
							max={100}
							step={1}
							value={areaPct}
							display={areaPct === 100 ? "Full" : `${areaPct}%`}
							onChange={(pct) =>
								onChange({
									secondDimensionMaxValue:
										pct >= 100 ? 0 : Math.round((pct / 100) * areaAxisPx()),
								})
							}
						/>
					</SettingRow>
				</SettingsSection>

				<button
					type="button"
					className="flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border text-sm opacity-70 transition-opacity duration-150 hover:opacity-100 sm:h-8"
					style={{ borderColor: mix(25) }}
					onClick={onOpenSettings}
				>
					<Settings className="size-4" />
					All settings
				</button>
			</div>
		</>
	);
}
