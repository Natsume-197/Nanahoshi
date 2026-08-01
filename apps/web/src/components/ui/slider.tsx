"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import * as React from "react";

import { cn } from "@/lib/utils";

function Slider({
	className,
	defaultValue,
	value,
	min = 0,
	max = 100,
	onValueChange,
	onValueCommitted,
	...props
}: SliderPrimitive.Root.Props<readonly number[]>) {
	const _values = React.useMemo(
		() =>
			Array.isArray(value)
				? value
				: Array.isArray(defaultValue)
					? defaultValue
					: [min],
		[value, defaultValue, min],
	);
	const isRange = _values.length > 1;
	const primitiveValue = isRange ? value : value?.[0];
	const primitiveDefaultValue = isRange ? defaultValue : defaultValue?.[0];

	return (
		<SliderPrimitive.Root<number | readonly number[]>
			data-slot="slider"
			defaultValue={primitiveDefaultValue}
			value={primitiveValue}
			min={min}
			max={max}
			onValueChange={(nextValue, eventDetails) =>
				onValueChange?.(
					Array.isArray(nextValue) ? nextValue : [nextValue],
					eventDetails,
				)
			}
			onValueCommitted={(nextValue, eventDetails) =>
				onValueCommitted?.(
					Array.isArray(nextValue) ? nextValue : [nextValue],
					eventDetails,
				)
			}
			className={cn(
				"relative flex w-full touch-none select-none items-center data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col data-disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Control
				data-slot="slider-control"
				className="relative flex grow items-center data-horizontal:h-1 data-vertical:h-full data-horizontal:w-full data-vertical:w-1"
			>
				<SliderPrimitive.Track
					data-slot="slider-track"
					className="relative grow overflow-hidden rounded-2xl bg-input/90 data-horizontal:h-1 data-vertical:h-full data-horizontal:w-full data-vertical:w-1"
				>
					<SliderPrimitive.Indicator
						data-slot="slider-range"
						className="absolute select-none bg-primary data-horizontal:h-full data-vertical:w-full"
					/>
				</SliderPrimitive.Track>
				{Array.from({ length: _values.length }, (_, index) => (
					<SliderPrimitive.Thumb
						data-slot="slider-thumb"
						key={index}
						index={index}
						className="block size-4 shrink-0 select-none rounded-2xl bg-primary-foreground bg-clip-padding shadow-md ring-1 ring-foreground/10 transition-[color,box-shadow] duration-200 hover:ring-4 hover:ring-ring/30 focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50"
					/>
				))}
			</SliderPrimitive.Control>
		</SliderPrimitive.Root>
	);
}

export { Slider };
