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
	getDefaultHomeLayout,
	type HomeSectionId,
	type HomeSectionPreference,
	setHomeLayout,
	useHomeLayout,
} from "@/lib/home-layout-store";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

const sectionLabels = {
	continue: m["home.hero_continue"],
	"recently-added": m["home.recently_added"],
	"books-for-you": m["recs.books_for_you"],
	"audiobooks-for-you": m["recs.audiobooks_for_you"],
	popular: m["recs.mix_popular"],
	"your-collections": m["home.your_collections"],
	"book-series": m["home.book_series"],
	"audiobook-series": m["home.audiobook_series"],
	"random-books": m["home.random_books"],
	"random-audiobooks": m["home.random_audiobooks"],
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
				"rounded-2xl hover:bg-muted/50 motion-safe:transition-colors",
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
					<DotsSixVertical aria-hidden="true" />
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
						<CaretUp aria-hidden="true" />
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
						<CaretDown aria-hidden="true" />
					</Button>
				</div>

				<Switch
					id={switchId}
					checked={item.visible}
					onCheckedChange={(checked) => onVisibleChange(item.id, checked)}
					aria-label={m["home.organize_show"]({ name: label })}
				/>
			</div>
		</li>
	);
}

export function HomeLayoutModal(): JSX.Element {
	const layout = useHomeLayout();
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
		if (nextOpen) {
			setDraft(layout.map((item) => ({ ...item })));
		}
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
			<Button
				type="button"
				variant="outline"
				onClick={() => handleOpenChange(true)}
			>
				<ListDashes data-icon="inline-start" aria-hidden="true" />
				{m["home.organize_action"]()}
			</Button>

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
							onClick={() => {
								setDraft(getDefaultHomeLayout());
							}}
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
								setHomeLayout(draft);
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
