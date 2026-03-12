import { orpc } from "@/utils/orpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, Folder, Home, ArrowLeft, Search, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

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

	// Reset exploring path when opened
	useEffect(() => {
		if (isOpen) {
			setExploringPath(value || "/");
			setSearchTerm("");
		}
	}, [isOpen, value]);

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
		setExploringPath("/" + parts.join("/"));
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
					<Button variant="outline" size="sm" className="shrink-0 h-8">
						Browse
					</Button>
				</DialogTrigger>
				<DialogContent className="max-w-2xl sm:max-w-2xl h-[80vh] flex flex-col p-0">
					<DialogHeader className="p-4 border-b">
						<DialogTitle>Select Directory</DialogTitle>
						<div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
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
										{i > 0 && <ChevronRight className="size-3 text-muted-foreground" />}
										<button
											type="button"
											className={cn(
												"flex items-center gap-1 hover:text-foreground transition-colors max-w-[120px] truncate",
												i === breadcrumbs.length - 1 ? "text-foreground font-medium" : "text-muted-foreground"
											)}
											onClick={() => handleNavigate(crumb.path)}
										>
											{i === 0 && <Home className="size-3" />}
											{crumb.name}
										</button>
									</div>
								))}
							</div>

						</div>
					</DialogHeader>

					<div className="p-4 border-b">
						<div className="relative">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
							<Input
								placeholder="Search in this folder..."
								className="pl-9 h-9"
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
								<Folder className="size-12 text-muted-foreground/20 mb-2" />
								<p className="text-muted-foreground text-sm">No directories found</p>
							</div>
						) : (
							<div className="grid grid-cols-1 gap-1">
								{filteredDirectories.map((dir) => (
									<div
										key={dir.path}
										className="group flex items-center justify-between p-2 rounded-md hover:bg-accent transition-colors"
									>
										<button
											type="button"
											className="flex-1 flex items-center gap-3 text-left"
											onClick={() => handleNavigate(dir.path)}
										>
											<Folder className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
											<span className="text-sm truncate">{dir.name}</span>
										</button>
										<Button
											variant="ghost"
											size="sm"
											className="h-8 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
											onClick={() => handleConfirm(dir.path)}
										>
											<Check className="size-4 mr-2" />
											Select
										</Button>
									</div>
								))}
							</div>
						)}
					</div>

					<div className="p-4 border-t bg-muted/30 flex items-center justify-between">
						<div className="text-xs text-muted-foreground truncate max-w-[70%]">
							<span className="font-medium mr-1">Current:</span>
							{exploringPath}
						</div>
						<div className="flex gap-2">
							<Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
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
