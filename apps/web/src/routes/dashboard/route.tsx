import { env } from "@nanahoshi-v2/env/web";
import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import {
	ArrowRight,
	ChevronsLeft,
	ChevronsRight,
	Home,
	Loader2,
	Menu,
	Search,
	Settings,
	Shield,
	User,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Logo, LogoIcon } from "@/components/logo";
import { OrgSwitcher } from "@/components/org-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { UserMenu } from "@/components/user-menu";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard")({
	component: DashboardLayout,
});

const navItems = [
	{ to: "/dashboard", label: "Home", icon: Home, exact: true },
	{ to: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

const MAX_DROPDOWN_RESULTS = 6;

function HeaderSearch() {
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const debouncedQuery = useDebounce(query, 300);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const { data: books, isLoading } = useQuery({
		...orpc.books.search.queryOptions({
			input: { query: debouncedQuery },
		}),
		enabled: debouncedQuery.length > 0,
	});

	const showDropdown = open && query.length > 0;

	// Close dropdown on click outside
	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	// Close dropdown on Escape
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				setOpen(false);
				inputRef.current?.blur();
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	function handleSeeAll() {
		const currentQuery = query;
		setOpen(false);
		setQuery("");
		navigate({ to: "/dashboard/search", search: { q: currentQuery } });
	}

	function handleBookClick(uuid: string) {
		setOpen(false);
		setQuery("");
		navigate({ to: "/dashboard/books/$uuid", params: { uuid } });
	}

	const displayedBooks = books?.slice(0, MAX_DROPDOWN_RESULTS);

	return (
		<div ref={containerRef} className="relative mx-auto w-full max-w-md">
			<div className="relative">
				<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					ref={inputRef}
					type="search"
					placeholder="What do you want to read?"
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					className="h-9 rounded-full border-border/50 bg-muted/40 pl-9 text-sm placeholder:text-muted-foreground/60 focus-visible:border-primary/30 focus-visible:bg-muted/60 focus-visible:ring-primary/20"
				/>
			</div>

			{/* Dropdown results */}
			{showDropdown && (
				<div className="absolute top-[calc(100%+6px)] right-0 left-0 z-50 overflow-hidden rounded-xl border border-border/60 bg-popover shadow-xl shadow-black/20">
					{isLoading && (
						<div className="flex items-center gap-2 px-4 py-3 text-muted-foreground text-sm">
							<Loader2 className="size-4 animate-spin" />
							Searching...
						</div>
					)}

					{!isLoading && displayedBooks && displayedBooks.length > 0 && (
						<div className="py-1.5">
							{displayedBooks.map(
								(book: {
									id: number;
									uuid: string;
									title: string | null;
									filename: string;
									cover: string | null;
									authors?: { name: string }[];
								}) => {
									const coverFilename = book.cover?.split("/").pop();
									const displayTitle = book.title ?? book.filename;
									const authorText = book.authors
										?.map((a) => a.name)
										.join(", ");

									return (
										<button
											key={book.id}
											type="button"
											onClick={() => handleBookClick(book.uuid)}
											className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60"
										>
											<div className="size-10 shrink-0 overflow-hidden rounded-md bg-muted">
												{coverFilename ? (
													<img
														src={`${env.VITE_SERVER_URL}/api/data/covers/${coverFilename}?width=80&height=120`}
														alt={displayTitle}
														className="h-full w-full object-cover"
													/>
												) : (
													<div className="flex h-full w-full items-center justify-center text-muted-foreground text-[10px]">
														No cover
													</div>
												)}
											</div>
											<div className="min-w-0 flex-1">
												<p className="truncate font-medium text-sm">
													{displayTitle}
												</p>
												{authorText && (
													<p className="truncate text-muted-foreground text-xs">
														{authorText}
													</p>
												)}
											</div>
										</button>
									);
								},
							)}
						</div>
					)}

					{!isLoading &&
						debouncedQuery &&
						books &&
						books.length === 0 && (
							<div className="px-4 py-3 text-muted-foreground text-sm">
								No results for &ldquo;{debouncedQuery}&rdquo;
							</div>
						)}

					{/* See all results link */}
					{!isLoading && books && books.length > 0 && (
						<div className="border-border/40 border-t">
							<button
								type="button"
								onClick={handleSeeAll}
								className="flex w-full items-center justify-between px-4 py-2.5 text-left text-primary text-sm transition-colors hover:bg-muted/40"
							>
								<span>See all results</span>
								<ArrowRight className="size-4" />
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function DashboardLayout() {
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [collapsed, setCollapsed] = useState(false);
	const location = useLocation();
	const { data: session } = authClient.useSession();

	// Reader pages get full viewport — no sidebar or header
	if (location.pathname.endsWith("/read")) {
		return <Outlet />;
	}

	const sidebarContent = (
		<>
			{/* Logo + collapse toggle */}
			<div
				className={`flex h-16 items-center ${collapsed ? "justify-center px-2" : "justify-between px-5"}`}
			>
				{!collapsed && (
					<Link to="/dashboard" className="flex items-center gap-2">
						<LogoIcon className="size-6 shrink-0" />
						<Logo className="h-5" />
					</Link>
				)}
				<button
					type="button"
					onClick={() => setCollapsed(!collapsed)}
					className="hidden lg:flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
				>
					{collapsed ? (
						<ChevronsRight className="size-4" />
					) : (
						<ChevronsLeft className="size-4" />
					)}
				</button>
			</div>

			{/* Navigation */}
			<nav
				className={`flex-1 space-y-0.5 py-2 ${collapsed ? "px-2" : "px-3"}`}
			>
				{navItems.map(({ to, label, icon: Icon, ...rest }) => {
					const exact = "exact" in rest && rest.exact;
					const isActive = exact
						? location.pathname === to
						: location.pathname.startsWith(to);

					return (
						<Link
							key={to}
							to={to}
							title={collapsed ? label : undefined}
							onClick={() => setSidebarOpen(false)}
							className={`relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
								collapsed ? "justify-center px-0" : ""
							} ${
								isActive
									? "font-semibold text-foreground before:absolute before:top-1/2 before:left-0 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary"
									: "font-medium text-muted-foreground hover:text-foreground"
							}`}
						>
							<Icon className="size-5 shrink-0" />
							{!collapsed && <span>{label}</span>}
						</Link>
					);
				})}
				{session?.user.role === "admin" && (
					<Link
						to="/dashboard/admin"
						title={collapsed ? "Admin" : undefined}
						onClick={() => setSidebarOpen(false)}
						className={`relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
							collapsed ? "justify-center px-0" : ""
						} ${
							location.pathname.startsWith("/dashboard/admin")
								? "font-semibold text-foreground before:absolute before:top-1/2 before:left-0 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary"
								: "font-medium text-muted-foreground hover:text-foreground"
						}`}
					>
						<Shield className="size-5 shrink-0" />
						{!collapsed && <span>Admin</span>}
					</Link>
				)}
			</nav>

			{/* User menu */}
			<div
				className={`border-sidebar-border border-t p-3 ${collapsed ? "flex justify-center p-2" : ""}`}
			>
				<UserMenu collapsed={collapsed} />
			</div>
		</>
	);

	return (
		<div className="flex h-screen overflow-hidden bg-background">
			{/* Mobile overlay */}
			{sidebarOpen && (
				<div
					className="fixed inset-0 z-40 bg-black/50 lg:hidden"
					onClick={() => setSidebarOpen(false)}
					onKeyDown={() => {}}
				/>
			)}

			{/* Mobile sidebar */}
			<aside
				className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-sidebar-border border-r bg-sidebar transition-transform duration-200 lg:hidden ${
					sidebarOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				{/* Mobile close button */}
				<div className="absolute top-4 right-3">
					<button type="button" onClick={() => setSidebarOpen(false)}>
						<X className="size-5" />
					</button>
				</div>
				{sidebarContent}
			</aside>

			{/* Desktop sidebar */}
			<aside
				className={`hidden lg:flex h-full flex-col border-sidebar-border border-r bg-sidebar transition-all duration-200 ${
					collapsed ? "w-16" : "w-64"
				}`}
			>
				{sidebarContent}
			</aside>

			{/* Main content */}
			<div className="flex flex-1 flex-col overflow-hidden">
				{/* Header with search */}
				<header className="flex h-14 shrink-0 items-center gap-3 border-border/40 border-b px-4 lg:px-6">
					<Button
						variant="outline"
						size="icon"
						className="lg:hidden"
						onClick={() => setSidebarOpen(true)}
					>
						<Menu className="size-5" />
					</Button>
					<LogoIcon className="size-5 lg:hidden" />

					<HeaderSearch />

					<div className="shrink-0">
						<OrgSwitcher />
					</div>
				</header>

				{/* Page content */}
				<main className="flex-1 overflow-y-auto bg-[length:100%_300px] bg-gradient-to-b from-muted/20 to-transparent bg-no-repeat">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
