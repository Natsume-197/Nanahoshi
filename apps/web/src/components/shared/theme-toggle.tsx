import { Check, Monitor, Moon, Sun } from "lucide-react";
import type { Theme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

const options: { value: Theme; label: string; icon: typeof Sun }[] = [
	{ value: "light", label: "Light", icon: Sun },
	{ value: "dark", label: "Dark", icon: Moon },
	{ value: "system", label: "System", icon: Monitor },
];

export function ThemeOptions({
	value,
	onChange,
}: {
	value: Theme;
	onChange: (theme: Theme) => void;
}) {
	return (
		<>
			{options.map((opt) => {
				const isActive = value === opt.value;
				return (
					<button
						key={opt.value}
						type="button"
						onClick={() => onChange(opt.value)}
						className={cn(
							"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
							isActive
								? "bg-accent font-medium text-foreground"
								: "text-muted-foreground active:bg-accent/50",
						)}
					>
						<opt.icon className="size-5" />
						<span className="flex-1">{opt.label}</span>
						{isActive && <Check className="size-4 shrink-0 text-primary" />}
					</button>
				);
			})}
		</>
	);
}
