// Ported from ttu's reader-quick-settings (BSD-3-Clause, ッツ Reader Authors).

import { GearSix } from "@phosphor-icons/react";
import type { ReactNode } from "react";
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
import {
	type ReaderSettings,
	type ReaderTheme,
	SETTING_SUPPORT,
} from "@/lib/lumi/settings";
import { cn } from "@/lib/utils";

interface LumiQuickSettingsProps {
	settings: ReaderSettings;
	theme: ReaderTheme;
	onChange: (patch: Partial<ReaderSettings>) => void;
	onOpenSettings: () => void;
	onClose: () => void;
}

/** Dims + tags a row whose backing setting isn't wired yet. */
function Dim(props: { on: boolean; label: string; children: ReactNode }) {
	return (
		<div
			className={cn(!props.on && "pointer-events-none select-none opacity-40")}
		>
			<SettingRow label={props.label} hint={props.on ? undefined : "soon"}>
				{props.children}
			</SettingRow>
		</div>
	);
}

/** Quick settings popover; every change commits immediately. */
export function LumiQuickSettings(props: LumiQuickSettingsProps) {
	const { settings, theme, onChange, onOpenSettings, onClose } = props;
	const mix = (pct: number) => readerMix(theme, pct);

	return (
		<>
			<button
				type="button"
				aria-label="Close quick settings"
				className="fixed inset-0 z-[59] cursor-default"
				onClick={onClose}
			/>
			<div
				className="fade-in slide-in-from-top-2 writing-horizontal-tb fixed inset-x-0 top-0 z-[60] flex max-h-[85dvh] w-full animate-in flex-col gap-4 overflow-y-auto rounded-b-lg border-b p-4 shadow-xl duration-200 ease-out motion-reduce:animate-none sm:inset-x-auto sm:top-2 sm:right-2 sm:w-64 sm:rounded-lg sm:border"
				style={{
					color: theme.fontColor,
					backgroundColor: theme.backgroundColor,
					borderColor: mix(20),
				}}
			>
				<SettingsSection theme={theme} title="General">
					<Dim on={SETTING_SUPPORT.theme} label="Profile">
						<ThemedSelect theme={theme} value="default" onChange={() => {}}>
							<ThemedOption theme={theme} value="default">
								Default
							</ThemedOption>
						</ThemedSelect>
					</Dim>
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
					<SettingRow label="Side margin">
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
						/>
					</SettingRow>
					<Dim
						on={SETTING_SUPPORT.secondDimensionMaxValue}
						label="Reading area width"
					>
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
						/>
					</Dim>
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
