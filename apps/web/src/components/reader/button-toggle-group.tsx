/**
 * Port of ttu's button-toggle-group (BSD-3-Clause, ッツ Reader Authors).
 */

import { Pen, Trash } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

export interface ToggleOption<T extends string | number | boolean> {
	id: T;
	text: string;
	style?: CSSProperties;
	disabled?: boolean;
	title?: string;
	/** ttu: theme buttons get a thicker border when selected. */
	thickBorders?: boolean;
	/** ttu: edit/delete icons next to the selected option (custom themes). */
	showIcons?: boolean;
}

interface ButtonToggleGroupProps<T extends string | number | boolean> {
	options: ToggleOption<T>[];
	selectedOptionId: T;
	onSelect: (id: T) => void;
	onEdit?: (id: T) => void;
	onDelete?: (id: T) => void;
	children?: ReactNode;
}

export function ButtonToggleGroup<T extends string | number | boolean>({
	options,
	selectedOptionId,
	onSelect,
	onEdit,
	onDelete,
	children,
}: ButtonToggleGroupProps<T>) {
	return (
		<div className="-m-1 flex flex-wrap">
			{options.map((option) => {
				const selected = option.id === selectedOptionId;
				return (
					<div key={String(option.id)} className="flex">
						<button
							type="button"
							title={option.title ?? String(option.id)}
							disabled={option.disabled}
							className={`m-1 rounded-md p-2 text-lg ${
								selected && option.thickBorders ? "border-4" : "border-2"
							} ${
								selected
									? "border-blue-300 bg-gray-700 text-white"
									: "border-gray-400 bg-white text-black"
							} ${option.disabled ? "cursor-not-allowed opacity-30" : ""}`}
							style={option.style}
							onClick={() => {
								if (!option.disabled) onSelect(option.id);
							}}
						>
							{option.text}
						</button>
						{option.showIcons && selected && (
							<div className="mr-2 flex flex-col justify-around">
								<button
									type="button"
									title="Edit"
									onClick={() => onEdit?.(option.id)}
								>
									<Pen className="size-4" />
								</button>
								<button
									type="button"
									title="Delete"
									onClick={() => onDelete?.(option.id)}
								>
									<Trash className="size-4" />
								</button>
							</div>
						)}
					</div>
				);
			})}

			{children}
		</div>
	);
}
