import { Button } from "@nanahoshi/ui/components/button";
import { cn } from "@nanahoshi/ui/lib/utils";
import { ArrowLeft } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { m } from "@/paraglide/messages";

/** The journey's question screens: name, account, books. */
export const ONBOARDING_STEPS = 3;

/**
 * One question per screen: an optional picture, a short title, a line of
 * context, the answer, then the way forward. Each step rises in on its own
 * key; reduced motion just swaps it.
 */
export function OnboardingShell({
	stepKey,
	step,
	onBack,
	visual,
	title,
	lead,
	children,
	footer,
}: {
	stepKey: string;
	/** 1-based place among the question screens; no dots without it. */
	step?: number;
	onBack?: () => void;
	visual?: ReactNode;
	title: ReactNode;
	lead?: ReactNode;
	children?: ReactNode;
	footer?: ReactNode;
}) {
	return (
		<main className="flex min-h-dvh flex-col bg-background">
			<div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 py-6 sm:px-6 sm:py-10">
				<div className="flex h-10 items-center justify-between">
					{onBack ? (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="-ms-2 rounded-full"
							onClick={onBack}
							aria-label={m["setup.back"]()}
						>
							<ArrowLeft aria-hidden="true" />
						</Button>
					) : (
						<span />
					)}
					{step !== undefined && <StepDots step={step} />}
				</div>
				<div
					key={stepKey}
					className="fade-in slide-in-from-bottom-3 flex flex-1 animate-in flex-col justify-center py-8 duration-500 ease-out-quart motion-reduce:animate-none"
				>
					{visual && <div className="mb-10">{visual}</div>}
					<h1 className="text-balance font-semibold text-3xl tracking-tight sm:text-4xl">
						{title}
					</h1>
					{lead && (
						<p className="mt-3 text-pretty text-muted-foreground leading-relaxed">
							{lead}
						</p>
					)}
					{children && <div className="mt-8">{children}</div>}
					{footer && <div className="mt-10">{footer}</div>}
				</div>
			</div>
		</main>
	);
}

function StepDots({ step }: { step: number }) {
	return (
		<div
			role="img"
			aria-label={m["onboarding.step_of"]({ step, total: ONBOARDING_STEPS })}
			className="flex items-center gap-1.5"
		>
			{Array.from({ length: ONBOARDING_STEPS }, (_, index) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decoration
					key={index}
					className={cn(
						"h-1.5 rounded-full transition-all duration-300 ease-out-quart",
						index + 1 === step
							? "w-6 bg-foreground"
							: index + 1 < step
								? "w-1.5 bg-foreground/60"
								: "w-1.5 bg-border",
					)}
				/>
			))}
		</div>
	);
}

/** The primary way forward, with why it can't be taken yet right under it. */
export function OnboardingAction({
	label,
	blockedReason,
	pending,
	type = "button",
	onClick,
}: {
	label: string;
	blockedReason?: string | null;
	pending?: boolean;
	type?: "button" | "submit";
	onClick?: () => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<Button
				type={type}
				size="lg"
				className="h-12 w-full text-base"
				disabled={!!blockedReason || pending}
				onClick={onClick}
				aria-describedby={blockedReason ? "onboarding-blocked" : undefined}
			>
				{label}
			</Button>
			{blockedReason && (
				<p
					id="onboarding-blocked"
					className="text-center text-muted-foreground text-sm"
				>
					{blockedReason}
				</p>
			)}
		</div>
	);
}

const SPINES = [
	{ h: "h-20", w: "w-4", tone: "bg-foreground/85" },
	{ h: "h-24", w: "w-5", tone: "bg-foreground/55" },
	{ h: "h-16", w: "w-3.5", tone: "bg-foreground/70" },
	{ h: "h-28", w: "w-5", tone: "bg-foreground" },
	{ h: "h-20", w: "w-4", tone: "bg-foreground/40" },
	{ h: "h-24", w: "w-3.5", tone: "bg-foreground/65" },
	{ h: "h-[4.5rem]", w: "w-4", tone: "bg-foreground/80", lean: true },
] as const;

/** Seven spines on a shelf (七星, seven stars): the welcome's picture, while
 * a new server has no covers to show yet. */
export function SevenSpines() {
	return (
		<div aria-hidden="true" className="flex flex-col items-start">
			<div className="flex items-end gap-1 ps-2">
				{SPINES.map((spine, index) => (
					<span
						key={`${spine.h}-${index.toString()}`}
						className={cn(
							"fade-in slide-in-from-bottom-6 animate-in rounded-[3px] fill-mode-both duration-700 ease-out-quart motion-reduce:animate-none",
							spine.h,
							spine.w,
							spine.tone,
							"lean" in spine && "ms-1.5 origin-bottom-left rotate-12",
						)}
						style={{ animationDelay: `${index * 70}ms` }}
					/>
				))}
			</div>
			<span className="mt-px h-1 w-56 rounded-full bg-border" />
		</div>
	);
}
