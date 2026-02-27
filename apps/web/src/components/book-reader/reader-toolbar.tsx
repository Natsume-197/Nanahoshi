import { env } from "@nanahoshi-v2/env/web";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Clock, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReaderToolbarProps {
	title: string;
	bookUuid: string;
	formattedTime: string;
	visible: boolean;
}

export function ReaderToolbar({
	title,
	bookUuid,
	formattedTime,
	visible,
}: ReaderToolbarProps) {
	return (
		<div
			className={`absolute top-0 right-0 left-0 z-10 flex items-center gap-3 border-b bg-background/95 px-4 py-2 backdrop-blur transition-all duration-200 ${
				visible
					? "pointer-events-auto translate-y-0 opacity-100"
					: "pointer-events-none -translate-y-full opacity-0"
			}`}
		>
			<Link to="/dashboard/books/$uuid" params={{ uuid: bookUuid }}>
				<Button variant="ghost" size="icon">
					<ArrowLeft className="size-5" />
				</Button>
			</Link>

			<h1 className="min-w-0 flex-1 truncate font-medium text-sm">{title}</h1>

			<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
				<Clock className="size-3.5" />
				<span className="tabular-nums">{formattedTime}</span>
			</div>

			<a
				href={`${env.VITE_SERVER_URL}/reader/settings`}
				target="_blank"
				rel="noreferrer"
				onClick={(e) => e.stopPropagation()}
			>
				<Button variant="ghost" size="icon">
					<Settings className="size-5" />
				</Button>
			</a>
		</div>
	);
}
