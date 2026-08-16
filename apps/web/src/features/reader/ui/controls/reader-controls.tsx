/**
 * Shared themed controls for the reader chrome (header, quick settings,
 * settings overlay, ToC). All colors derive from the active reading theme,
 * mixed in oklab (oklch turns neutrals brown) — Nanahoshi's design language
 * applied over any reading theme.
 */

import { Minus, Plus } from "@phosphor-icons/react";
import { type CSSProperties, type ReactNode, useRef, useState } from "react";
import type { ReaderTheme } from "@/features/reader/presentation/settings";
import { cn } from "@/lib/utils";

export function readerMix(theme: ReaderTheme, pct: number): string {
	return `color-mix(in oklab, ${theme.fontColor} ${pct}%, ${theme.backgroundColor})`;
}

export function SettingsSection({
	theme,
	title,
	children,
}: {
	theme: ReaderTheme;
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-3">
			<h2
				className="px-0.5 font-semibold text-sm"
				style={{ color: readerMix(theme, 68) }}
			>
				{title}
			</h2>
			{children}
		</section>
	);
}

export function SettingRow({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<div className="min-w-0">
			<div className="mb-1.5 flex items-baseline justify-between gap-2">
				<span className="text-sm opacity-70">{label}</span>
				{hint && <span className="text-xs opacity-40">{hint}</span>}
			</div>
			{children}
		</div>
	);
}

export interface SegmentedOption<T extends string | number | boolean> {
	id: T;
	text: string;
}

export function Segmented<T extends string | number | boolean>({
	theme,
	options,
	selected,
	ariaLabel,
	onSelect,
}: {
	theme: ReaderTheme;
	options: SegmentedOption<T>[];
	selected: T;
	ariaLabel?: string;
	onSelect: (id: T) => void;
}) {
	return (
		<fieldset
			aria-label={ariaLabel}
			className="flex min-w-0 overflow-hidden rounded-xl p-1"
			style={{
				backgroundColor: readerMix(theme, 8),
				boxShadow: `inset 0 0 0 1px ${readerMix(theme, 10)}`,
			}}
		>
			{options.map((option) => {
				const isSelected = option.id === selected;
				return (
					<button
						key={String(option.id)}
						type="button"
						aria-pressed={isSelected}
						className="h-10 flex-1 cursor-pointer rounded-lg px-2 font-medium text-sm outline-none transition-[background-color,color,box-shadow,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 active:scale-[0.96] sm:h-8"
						style={
							isSelected
								? {
										backgroundColor: readerMix(theme, 16),
										boxShadow: `0 1px 2px ${readerMix(theme, 12)}`,
										color: theme.fontColor,
									}
								: { color: readerMix(theme, 62) }
						}
						onClick={() => {
							if (!isSelected) onSelect(option.id);
						}}
					>
						{option.text}
					</button>
				);
			})}
		</fieldset>
	);
}

/** Boolean setting as an Off/On segmented pair. */
export function Toggle({
	theme,
	value,
	onChange,
	ariaLabel,
}: {
	theme: ReaderTheme;
	value: boolean;
	onChange: (next: boolean) => void;
	ariaLabel?: string;
}) {
	return (
		<Segmented
			theme={theme}
			ariaLabel={ariaLabel}
			options={[
				{ id: false, text: "Off" },
				{ id: true, text: "On" },
			]}
			selected={value}
			onSelect={onChange}
		/>
	);
}

export function Stepper({
	theme,
	display,
	compact = false,
	canDecrease = true,
	canIncrease = true,
	onStep,
}: {
	theme: ReaderTheme;
	display: string;
	compact?: boolean;
	canDecrease?: boolean;
	canIncrease?: boolean;
	onStep: (direction: -1 | 1) => void;
}) {
	return (
		<div
			className={cn(
				"flex h-11 items-center justify-between rounded-xl sm:h-8",
				compact ? "w-fit" : "w-full",
			)}
			style={{
				backgroundColor: readerMix(theme, 8),
				boxShadow: `inset 0 0 0 1px ${readerMix(theme, 10)}`,
			}}
		>
			<button
				type="button"
				aria-label="Decrease"
				disabled={!canDecrease}
				className="flex h-full w-11 cursor-pointer items-center justify-center opacity-60 transition-[opacity,scale] duration-150 hover:opacity-100 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-25 sm:w-10"
				onClick={() => onStep(-1)}
			>
				<Minus className="size-4" />
			</button>
			<span className="min-w-12 px-1 text-center font-medium text-sm tabular-nums">
				{display}
			</span>
			<button
				type="button"
				aria-label="Increase"
				disabled={!canIncrease}
				className="flex h-full w-11 cursor-pointer items-center justify-center opacity-60 transition-[opacity,scale] duration-150 hover:opacity-100 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-25 sm:w-10"
				onClick={() => onStep(1)}
			>
				<Plus className="size-4" />
			</button>
		</div>
	);
}

export function SliderRow({
	theme,
	min,
	max,
	step,
	value,
	format,
	showValue = true,
	onChange,
}: {
	theme: ReaderTheme;
	min: number;
	max: number;
	step: number;
	value: number;
	/** Human-readable rendering of a slider value, shown beside it live. */
	format: (value: number) => string;
	showValue?: boolean;
	onChange: (value: number) => void;
}) {
	// Commits on release, not per drag tick: every committed change re-styles
	// and re-layouts the (huge) book document behind the panel, and a commit
	// per tick freezes the drag. The thumb and label track the drag locally.
	const [draft, setDraft] = useState<number | null>(null);
	const draftRef = useRef<number | null>(null);

	const shown = draft ?? value;

	const handleInput = (next: number) => {
		draftRef.current = next;
		setDraft(next);
	};

	const commit = () => {
		if (draftRef.current !== null && draftRef.current !== value) {
			onChange(draftRef.current);
		}
		draftRef.current = null;
		setDraft(null);
	};

	return (
		<div className="flex h-11 items-center gap-3 sm:h-8">
			<input
				type="range"
				className="h-1 min-w-0 flex-1 cursor-pointer"
				style={{ accentColor: theme.fontColor } as CSSProperties}
				min={min}
				max={max}
				step={step}
				value={shown}
				onChange={(event) => handleInput(Number.parseFloat(event.target.value))}
				onPointerUp={commit}
				onKeyUp={commit}
				onBlur={commit}
			/>
			{showValue && (
				<span className="w-14 shrink-0 text-right text-sm tabular-nums opacity-80">
					{format(shown)}
				</span>
			)}
		</div>
	);
}

export function ThemedSelect({
	id,
	theme,
	value,
	onChange,
	children,
}: {
	id?: string;
	theme: ReaderTheme;
	value: string;
	onChange: (value: string) => void;
	children: ReactNode;
}) {
	return (
		<select
			id={id}
			className="h-11 w-full cursor-pointer rounded-xl border-0 px-3 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-1 sm:h-8 sm:text-sm"
			style={{
				backgroundColor: readerMix(theme, 8),
				boxShadow: `inset 0 0 0 1px ${readerMix(theme, 10)}`,
				color: theme.fontColor,
			}}
			value={value}
			onChange={(event) => onChange(event.target.value)}
		>
			{children}
		</select>
	);
}

/** Option styled for ThemedSelect (the popup list is UA-rendered). */
export function ThemedOption({
	theme,
	value,
	children,
}: {
	theme: ReaderTheme;
	value: string;
	children: ReactNode;
}) {
	return (
		<option
			value={value}
			style={{
				color: theme.fontColor,
				backgroundColor: theme.backgroundColor,
			}}
		>
			{children}
		</option>
	);
}

export function ThemedTextInput({
	theme,
	value,
	placeholder,
	list,
	ariaLabel,
	onChange,
	onKeyDown,
}: {
	theme: ReaderTheme;
	value: string;
	placeholder?: string;
	list?: string;
	ariaLabel?: string;
	onChange: (value: string) => void;
	onKeyDown?: (key: string) => void;
}) {
	return (
		<input
			type="text"
			className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none transition-colors duration-150 focus:border-current sm:h-8"
			style={{ borderColor: readerMix(theme, 25), color: theme.fontColor }}
			value={value}
			placeholder={placeholder}
			list={list}
			aria-label={ariaLabel}
			onChange={(event) => onChange(event.target.value)}
			onKeyDown={(event) => onKeyDown?.(event.key)}
		/>
	);
}
