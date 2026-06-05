"use client";

import { Slider as SliderPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

function Slider({
	className,
	defaultValue,
	value,
	min = 0,
	max = 100,
	...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
	const _values = React.useMemo(
		() =>
			Array.isArray(value)
				? value
				: Array.isArray(defaultValue)
					? defaultValue
					: [min, max],
		[value, defaultValue, min, max],
	);

	return (
		<SliderPrimitive.Root
			data-slot="slider"
			defaultValue={defaultValue}
			value={value}
			min={min}
			max={max}
			className={cn(
				"relative flex w-full touch-none select-none items-center data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col data-disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Track
				data-slot="slider-track"
				className="relative grow overflow-hidden rounded-2xl bg-input/90 data-horizontal:h-1 data-vertical:h-full data-horizontal:w-full data-vertical:w-1"
			>
				<SliderPrimitive.Range
					data-slot="slider-range"
					className="absolute select-none bg-primary data-horizontal:h-full data-vertical:w-full"
				/>
			</SliderPrimitive.Track>
			{Array.from({ length: _values.length }, (_, index) => (
				<SliderPrimitive.Thumb
					data-slot="slider-thumb"
					key={index}
					className="block size-4 shrink-0 select-none rounded-2xl bg-white not-dark:bg-clip-padding shadow-md ring-1 ring-black/10 transition-[color,box-shadow] duration-200 hover:ring-4 hover:ring-ring/30 focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50"
				/>
			))}
		</SliderPrimitive.Root>
	);
}

export { Slider };
