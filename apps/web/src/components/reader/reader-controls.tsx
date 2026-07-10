/**
 * Shared themed controls for the reader chrome (header, quick settings,
 * settings overlay, ToC). All colors derive from the active reading theme,
 * mixed in oklab (oklch turns neutrals brown) — Nanahoshi's design language
 * applied over any reading theme.
 */

import { Minus, Plus } from "@phosphor-icons/react";
import { type CSSProperties, type ReactNode, useRef, useState } from "react";
import type { ReaderTheme } from "@/lib/reader/settings";

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
		<section className="flex flex-col gap-4">
			<h2
				className="border-b pb-1.5 font-medium text-xs uppercase tracking-wider opacity-50"
				style={{ borderColor: readerMix(theme, 15) }}
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
	onSelect,
}: {
	theme: ReaderTheme;
	options: SegmentedOption<T>[];
	selected: T;
	onSelect: (id: T) => void;
}) {
	return (
		<div
			className="flex overflow-hidden rounded-md border"
			style={{ borderColor: readerMix(theme, 25) }}
		>
			{options.map((option) => {
				const isSelected = option.id === selected;
				return (
					<button
						key={String(option.id)}
						type="button"
						className="h-9 flex-1 cursor-pointer px-2 text-sm transition-colors duration-150 sm:h-8"
						style={
							isSelected
								? {
										backgroundColor: theme.fontColor,
										color: theme.backgroundColor,
									}
								: undefined
						}
						onClick={() => {
							if (!isSelected) onSelect(option.id);
						}}
					>
						{option.text}
					</button>
				);
			})}
		</div>
	);
}

/** Boolean setting as an Off/On segmented pair. */
export function Toggle({
	theme,
	value,
	onChange,
}: {
	theme: ReaderTheme;
	value: boolean;
	onChange: (next: boolean) => void;
}) {
	return (
		<Segmented
			theme={theme}
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
	onStep,
}: {
	theme: ReaderTheme;
	display: string;
	onStep: (direction: -1 | 1) => void;
}) {
	return (
		<div
			className="flex h-9 items-center justify-between rounded-md border sm:h-8"
			style={{ borderColor: readerMix(theme, 25) }}
		>
			<button
				type="button"
				title="Decrease"
				className="flex h-full w-10 cursor-pointer items-center justify-center opacity-60 transition-opacity duration-150 hover:opacity-100"
				onClick={() => onStep(-1)}
			>
				<Minus className="size-4" />
			</button>
			<span className="text-sm tabular-nums">{display}</span>
			<button
				type="button"
				title="Increase"
				className="flex h-full w-10 cursor-pointer items-center justify-center opacity-60 transition-opacity duration-150 hover:opacity-100"
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
	onChange,
}: {
	theme: ReaderTheme;
	min: number;
	max: number;
	step: number;
	value: number;
	/** Human-readable rendering of a slider value, shown beside it live. */
	format: (value: number) => string;
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
		<div className="flex h-9 items-center gap-3 sm:h-8">
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
			<span className="w-14 shrink-0 text-right text-sm tabular-nums opacity-80">
				{format(shown)}
			</span>
		</div>
	);
}

export function ThemedSelect({
	theme,
	value,
	onChange,
	children,
}: {
	theme: ReaderTheme;
	value: string;
	onChange: (value: string) => void;
	children: ReactNode;
}) {
	return (
		<select
			className="h-9 w-full cursor-pointer rounded-md border bg-transparent px-2 text-sm sm:h-8"
			style={{ borderColor: readerMix(theme, 25), color: theme.fontColor }}
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
	onChange,
	onKeyDown,
}: {
	theme: ReaderTheme;
	value: string;
	placeholder?: string;
	list?: string;
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
			onChange={(event) => onChange(event.target.value)}
			onKeyDown={(event) => onKeyDown?.(event.key)}
		/>
	);
}
