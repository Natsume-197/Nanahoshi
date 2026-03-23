import { useQuery } from "@tanstack/react-query";
import {
	ArrowLeft,
	Check,
	ChevronRight,
	Folder,
	Home,
	Search,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { orpc } from "@/utils/orpc";

interface DirectoryPickerProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}

export function DirectoryPicker({
	value,
	onChange,
	placeholder,
}: DirectoryPickerProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [exploringPath, setExploringPath] = useState(value || "/");
	const [searchTerm, setSearchTerm] = useState("");
	const prevIsOpenRef = useRef(isOpen);

	// Reset exploring path when dialog opens
	if (isOpen && !prevIsOpenRef.current) {
		setExploringPath(value || "/");
		setSearchTerm("");
	}
	prevIsOpenRef.current = isOpen;

	const { data: directories, isLoading } = useQuery(
		orpc.files.getDirectories.queryOptions({
			input: { location: exploringPath },
		}),
	);

	const filteredDirectories = useMemo(() => {
		if (!directories) return [];
		if (!searchTerm) return directories;
		return directories.filter((d) =>
			d.name.toLowerCase().includes(searchTerm.toLowerCase()),
		);
	}, [directories, searchTerm]);

	const handleNavigate = (path: string) => {
		setExploringPath(path);
		setSearchTerm("");
	};

	const handleGoBack = () => {
		const parts = exploringPath.split("/").filter(Boolean);
		if (parts.length === 0) return;
		parts.pop();
		setExploringPath(`/${parts.join("/")}`);
	};

	const handleConfirm = (path?: string) => {
		onChange(path || exploringPath);
		setIsOpen(false);
	};

	const breadcrumbs = useMemo(() => {
		const parts = exploringPath.split("/").filter(Boolean);
		const crumbs = [{ name: "Root", path: "/" }];
		let currentPath = "";
		for (const part of parts) {
			currentPath += `/${part}`;
			crumbs.push({ name: part, path: currentPath });
		}
		return crumbs;
	}, [exploringPath]);

	return (
		<div className="flex w-full items-center gap-2">
			<Input
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				className="flex-1"
			/>
			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogTrigger asChild>
					<Button variant="outline" size="sm" className="h-8 shrink-0">
						Browse
					</Button>
				</DialogTrigger>
				<DialogContent className="flex h-[80vh] max-w-2xl flex-col p-0 sm:max-w-2xl">
					<DialogHeader className="border-b p-4">
						<DialogTitle>Select Directory</DialogTitle>
						<div className="no-scrollbar mt-4 flex items-center gap-2 overflow-x-auto pb-1">
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={handleGoBack}
								disabled={exploringPath === "/"}
							>
								<ArrowLeft className="size-4" />
							</Button>
							<div className="flex items-center gap-1 text-xs">
								{breadcrumbs.map((crumb, i) => (
									<div key={crumb.path} className="flex items-center gap-1">
										{i > 0 && (
											<ChevronRight className="size-3 text-muted-foreground" />
										)}
										<Button
											variant="ghost"
											size="xs"
											className={cn(
												"max-w-[120px] gap-1 truncate",
												i === breadcrumbs.length - 1
													? "font-medium text-foreground"
													: "text-muted-foreground",
											)}
											onClick={() => handleNavigate(crumb.path)}
										>
											{i === 0 && <Home className="size-3" />}
											{crumb.name}
										</Button>
									</div>
								))}
							</div>
						</div>
					</DialogHeader>

					<div className="border-b p-4">
						<div className="relative">
							<Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								placeholder="Search in this folder..."
								className="h-9 pl-9"
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
							/>
						</div>
					</div>

					<div className="flex-1 overflow-y-auto p-2">
						{isLoading ? (
							<div className="flex h-full items-center justify-center p-8">
								<div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
							</div>
						) : filteredDirectories.length === 0 ? (
							<div className="flex h-full flex-col items-center justify-center p-8 text-center">
								<Folder className="mb-2 size-12 text-muted-foreground/20" />
								<p className="text-muted-foreground text-sm">
									No directories found
								</p>
							</div>
						) : (
							<div className="grid grid-cols-1 gap-1">
								{filteredDirectories.map((dir) => (
									<div
										key={dir.path}
										className="group flex items-center justify-between rounded-md p-2 transition-colors hover:bg-accent"
									>
										<Button
											variant="ghost"
											className="flex flex-1 justify-start gap-3"
											onClick={() => handleNavigate(dir.path)}
										>
											<Folder className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
											<span className="truncate text-sm">{dir.name}</span>
										</Button>
										<Button
											variant="ghost"
											size="sm"
											className="h-8 px-2 opacity-0 transition-opacity group-hover:opacity-100"
											onClick={() => handleConfirm(dir.path)}
										>
											<Check className="mr-2 size-4" />
											Select
										</Button>
									</div>
								))}
							</div>
						)}
					</div>

					<div className="flex items-center justify-between border-t bg-muted/30 p-4">
						<div className="max-w-[70%] truncate text-muted-foreground text-xs">
							<span className="mr-1 font-medium">Current:</span>
							{exploringPath}
						</div>
						<div className="flex gap-2">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setIsOpen(false)}
							>
								Cancel
							</Button>
							<Button size="sm" onClick={() => handleConfirm()}>
								Use Current
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
