import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	restrictToParentElement,
	restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	CaretDown,
	CaretUp,
	DotsSixVertical,
	ListDashes,
} from "@phosphor-icons/react";
import { type CSSProperties, type JSX, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	getDefaultHomeLayout,
	type HomeSectionId,
	type HomeSectionPreference,
	setHomeLayout,
	useHomeLayout,
} from "@/lib/home-layout-store";
import type { HomeScope } from "@/lib/home-scope-store";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

const sectionLabels = {
	continue: m["home.recent"],
	"continue-reading": m["home.continue_reading"],
	"continue-listening": m["home.continue_listening"],
	"books-for-you": m["recs.books_for_you"],
	"audiobooks-for-you": m["recs.audiobooks_for_you"],
	"popular-books": m["recs.mix_popular_books"],
	"popular-audiobooks": m["recs.mix_popular_audiobooks"],
	"collections-books": m["home.your_collections"],
	"collections-audiobooks": m["home.your_collections"],
	"recent-books": m["home.recently_added_books"],
	"recent-audiobooks": m["home.recently_added_audiobooks"],
	"book-series": m["home.book_series"],
	"audiobook-series": m["home.audiobook_series"],
	"random-books": m["home.pick_something_random"],
	"random-audiobooks": m["home.pick_something_random"],
} as const satisfies Record<HomeSectionId, () => string>;

function labelFor(id: HomeSectionId): string {
	return sectionLabels[id]();
}

function SortableSectionRow({
	item,
	index,
	total,
	onMove,
	onVisibleChange,
}: {
	item: HomeSectionPreference;
	index: number;
	total: number;
	onMove: (index: number, delta: -1 | 1) => void;
	onVisibleChange: (id: HomeSectionId, visible: boolean) => void;
}): JSX.Element {
	const label = labelFor(item.id);
	const {
		attributes,
		isDragging,
		listeners,
		setActivatorNodeRef,
		setNodeRef,
		transform,
		transition,
	} = useSortable({
		id: item.id,
		transition: {
			duration: 160,
			easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
		},
	});
	const style: CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
	};
	const switchId = `home-section-${item.id}`;

	return (
		<li
			ref={setNodeRef}
			style={style}
			className={cn(
				"rounded-2xl transition-colors hover:bg-muted/50",
				!item.visible && "opacity-60",
				isDragging && "bg-muted shadow-sm",
			)}
		>
			<div className="flex min-h-16 items-center gap-1 py-2">
				<Button
					ref={setActivatorNodeRef}
					type="button"
					variant="ghost"
					size="icon"
					className="size-10 cursor-grab touch-none active:cursor-grabbing sm:size-8"
					{...attributes}
					{...listeners}
					aria-label={m["home.organize_drag"]({ name: label })}
				>
					<DotsSixVertical />
				</Button>

				<label
					htmlFor={switchId}
					className="min-w-0 flex-1 cursor-pointer font-medium text-sm"
				>
					{label}
				</label>

				<div className="flex shrink-0 items-center gap-0.5">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-10 sm:size-8"
						disabled={index === 0}
						onClick={() => onMove(index, -1)}
						aria-label={m["home.organize_move_up"]({ name: label })}
					>
						<CaretUp />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-10 sm:size-8"
						disabled={index === total - 1}
						onClick={() => onMove(index, 1)}
						aria-label={m["home.organize_move_down"]({ name: label })}
					>
						<CaretDown />
					</Button>
				</div>

				<Switch
					id={switchId}
					checked={item.visible}
					onCheckedChange={(checked) => onVisibleChange(item.id, checked)}
				/>
			</div>
		</li>
	);
}

export function HomeLayoutModal({ scope }: { scope: HomeScope }): JSX.Element {
	const layout = useHomeLayout(scope);
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<HomeSectionPreference[]>(() =>
		layout.map((item) => ({ ...item })),
	);
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 6 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) setDraft(layout.map((item) => ({ ...item })));
		setOpen(nextOpen);
	};

	const move = (index: number, delta: -1 | 1) => {
		const target = index + delta;
		if (target < 0 || target >= draft.length) return;
		setDraft((current) => arrayMove(current, index, target));
	};

	const setVisible = (id: HomeSectionId, visible: boolean) => {
		setDraft((current) =>
			current.map((item) => (item.id === id ? { ...item, visible } : item)),
		);
	};

	const handleDragEnd = ({ active, over }: DragEndEvent) => {
		if (!over || active.id === over.id) return;
		setDraft((current) => {
			const from = current.findIndex((item) => item.id === active.id);
			const to = current.findIndex((item) => item.id === over.id);
			return from === -1 || to === -1 ? current : arrayMove(current, from, to);
		});
	};

	const dragLabel = (id: string | number) => labelFor(id as HomeSectionId);
	const dragPosition = (id: string | number) =>
		draft.findIndex((item) => item.id === id) + 1;

	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ambient"
						size="icon"
						className="ms-auto size-11"
						aria-label={m["home.organize_action"]()}
						aria-haspopup="dialog"
						aria-expanded={open}
						onClick={() => handleOpenChange(true)}
					>
						<ListDashes aria-hidden="true" className="size-6" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={8}>
					{m["home.organize_action"]()}
				</TooltipContent>
			</Tooltip>

			<Modal
				open={open}
				onOpenChange={handleOpenChange}
				title={m["home.organize_title"]()}
				description={m["home.organize_description"]()}
				className="sm:max-w-lg"
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setDraft(getDefaultHomeLayout(scope))}
						>
							{m["common.reset"]()}
						</Button>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="button"
							onClick={() => {
								setHomeLayout(scope, draft);
								setOpen(false);
							}}
						>
							{m["common.save"]()}
						</Button>
					</>
				}
			>
				<div className="-mx-2 px-2">
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						modifiers={[restrictToVerticalAxis, restrictToParentElement]}
						onDragEnd={handleDragEnd}
						accessibility={{
							screenReaderInstructions: {
								draggable: m["home.organize_drag_instructions"](),
							},
							announcements: {
								onDragStart({ active }) {
									return m["home.organize_drag_started"]({
										name: dragLabel(active.id),
									});
								},
								onDragOver({ active, over }) {
									if (!over) return;
									return m["home.organize_drag_position"]({
										name: dragLabel(active.id),
										position: dragPosition(over.id),
										total: draft.length,
									});
								},
								onDragEnd({ active, over }) {
									if (!over) {
										return m["home.organize_drag_cancelled"]({
											name: dragLabel(active.id),
										});
									}
									return m["home.organize_drag_finished"]({
										name: dragLabel(active.id),
										position: dragPosition(over.id),
										total: draft.length,
									});
								},
								onDragCancel({ active }) {
									return m["home.organize_drag_cancelled"]({
										name: dragLabel(active.id),
									});
								},
							},
						}}
					>
						<SortableContext
							items={draft.map((item) => item.id)}
							strategy={verticalListSortingStrategy}
						>
							<ul className="flex flex-col gap-1">
								{draft.map((item, index) => (
									<SortableSectionRow
										key={item.id}
										item={item}
										index={index}
										total={draft.length}
										onMove={move}
										onVisibleChange={setVisible}
									/>
								))}
							</ul>
						</SortableContext>
					</DndContext>
				</div>
			</Modal>
		</>
	);
}
