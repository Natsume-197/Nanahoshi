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
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Logo, LogoIcon } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserMenu } from "@/components/user-menu";
import { useDebounce } from "@/hooks/use-debounce";
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
const HEADER_SEARCH_MIN_QUERY_LENGTH = 1;
const HEADER_SEARCH_DEBOUNCE_MS = 300;

function HeaderSearch() {
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const normalizedQuery = query.trim();
	const debouncedQuery = useDebounce(
		normalizedQuery,
		HEADER_SEARCH_DEBOUNCE_MS,
	);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const shouldSearch =
		open && debouncedQuery.length >= HEADER_SEARCH_MIN_QUERY_LENGTH;

	const { data: searchResult, isFetching } = useQuery({
		...orpc.books.search.queryOptions({
			input: { query: debouncedQuery, limit: MAX_DROPDOWN_RESULTS + 1 },
		}),
		enabled: shouldSearch,
		staleTime: 60_000,
	});

	const books = searchResult?.books;
	const showDropdown = open && normalizedQuery.length > 0;

	// Close dropdown on click outside
	useEffect(() => {
		if (!open) return;

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
	}, [open]);

	// Close dropdown on Escape
	useEffect(() => {
		if (!open) return;

		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				setOpen(false);
				inputRef.current?.blur();
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [open]);

	const handleSeeAll = useCallback(() => {
		if (!normalizedQuery) return;
		setOpen(false);
		setQuery("");
		navigate({ to: "/dashboard/search", search: { q: normalizedQuery } });
	}, [navigate, normalizedQuery]);

	const handleBookClick = useCallback(
		(uuid: string) => {
			setOpen(false);
			setQuery("");
			navigate({ to: "/dashboard/books/$uuid", params: { uuid } });
		},
		[navigate],
	);

	const displayedBooks = useMemo(
		() => books?.slice(0, MAX_DROPDOWN_RESULTS),
		[books],
	);

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
					onKeyDown={(e) => {
						if (
							e.key === "Enter" &&
							normalizedQuery.length >= HEADER_SEARCH_MIN_QUERY_LENGTH
						) {
							handleSeeAll();
						}
					}}
					autoComplete="off"
					className="h-9 rounded-full border-border/50 bg-muted/40 pl-9 text-sm placeholder:text-muted-foreground/60 focus-visible:border-primary/30 focus-visible:bg-muted/60 focus-visible:ring-primary/20"
				/>
			</div>

			{/* Dropdown results */}
			{showDropdown && (
				<div className="absolute top-[calc(100%+6px)] right-0 left-0 z-50 overflow-hidden rounded-xl border border-border/60 bg-popover shadow-black/20 shadow-xl">
					{normalizedQuery.length < HEADER_SEARCH_MIN_QUERY_LENGTH && (
						<div className="px-4 py-3 text-muted-foreground text-sm">
							Type at least {HEADER_SEARCH_MIN_QUERY_LENGTH} characters.
						</div>
					)}

					{isFetching && shouldSearch && (
						<div className="flex items-center gap-2 px-4 py-3 text-muted-foreground text-sm">
							<Loader2 className="size-4 animate-spin" />
							Searching...
						</div>
					)}

					{!isFetching && displayedBooks && displayedBooks.length > 0 && (
						<div className="py-1.5">
							{displayedBooks.map((book) => {
								const coverFilename = book.cover?.split("/").pop();
								const displayTitle = book.title ?? book.filename;
								const authorText = book.authors?.map((a) => a.name).join(", ");

								return (
									<button
										key={book.uuid}
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
													loading="lazy"
													decoding="async"
												/>
											) : (
												<div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
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
							})}
						</div>
					)}

					{!isFetching && shouldSearch && books && books.length === 0 && (
						<div className="px-4 py-3 text-muted-foreground text-sm">
							No results for &ldquo;{debouncedQuery}&rdquo;
						</div>
					)}

					{/* See all results link */}
					{!isFetching && books && books.length > 0 && (
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
			{/* Navigation */}
			<nav className="flex-1 space-y-0.5 px-3 py-2">
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
							className={`relative flex items-center justify-start gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
								isActive
									? "font-semibold text-foreground before:absolute before:top-1/2 before:left-0 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary"
									: "font-medium text-muted-foreground hover:text-foreground"
							}`}
						>
							<Icon className="size-5 shrink-0" />
							<span
								className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-[140ms] ${
									collapsed ? "max-w-0 opacity-0" : "max-w-32 opacity-100"
								}`}
							>
								{label}
							</span>
						</Link>
					);
				})}
				{session?.user.role === "admin" && (
					<Link
						to="/dashboard/admin"
						title={collapsed ? "Admin" : undefined}
						onClick={() => setSidebarOpen(false)}
						className={`relative flex items-center justify-start gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
							location.pathname.startsWith("/dashboard/admin")
								? "font-semibold text-foreground before:absolute before:top-1/2 before:left-0 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary"
								: "font-medium text-muted-foreground hover:text-foreground"
						}`}
					>
						<Shield className="size-5 shrink-0" />
						<span
							className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-[140ms] ${
								collapsed ? "max-w-0 opacity-0" : "max-w-32 opacity-100"
							}`}
						>
							Admin
						</span>
					</Link>
				)}
			</nav>

			{/* Collapse sidebar button (desktop) */}
			<div
				className={`hidden border-sidebar-border border-t p-2 lg:block ${
					collapsed ? "px-2" : "px-3"
				}`}
			>
				<button
					type="button"
					onClick={() => setCollapsed(!collapsed)}
					className="flex h-9 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
				>
					{collapsed ? (
						<ChevronsRight className="size-4" />
					) : (
						<ChevronsLeft className="size-4" />
					)}
				</button>
			</div>
		</>
	);

	return (
		<div className="flex h-screen flex-col overflow-hidden bg-background">
			{/* Header with search */}
			<header className="z-30 flex h-14 shrink-0 items-center gap-3 border-border/40 border-b px-4 lg:px-6">
				<Button
					variant="outline"
					size="icon"
					className="lg:hidden"
					onClick={() => setSidebarOpen(true)}
				>
					<Menu className="size-5" />
				</Button>
				<LogoIcon className="size-5 lg:hidden" />
				<Link
					to="/dashboard"
					className="hidden shrink-0 items-center gap-2 lg:flex"
				>
					<LogoIcon className="size-5 shrink-0" />
					<Logo className="h-5" />
				</Link>

				<HeaderSearch />

				<div className="shrink-0">
					<UserMenu collapsed />
				</div>
			</header>

			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				{/* Mobile overlay */}
				{sidebarOpen && (
					<div
						className="fixed inset-x-0 top-14 bottom-0 z-40 bg-black/50 lg:hidden"
						onClick={() => setSidebarOpen(false)}
						onKeyDown={() => {}}
					/>
				)}

				{/* Mobile sidebar */}
				<aside
					className={`fixed top-14 bottom-0 left-0 z-50 flex w-64 flex-col border-sidebar-border border-r bg-sidebar transition-transform duration-150 lg:hidden ${
						sidebarOpen ? "translate-x-0" : "-translate-x-full"
					}`}
				>
					<div className="flex h-14 items-center justify-between border-sidebar-border border-b px-4">
						<Link
							to="/dashboard"
							onClick={() => setSidebarOpen(false)}
							className="flex items-center gap-2"
						>
							<LogoIcon className="size-5 shrink-0" />
							<Logo className="h-5" />
						</Link>
						<button type="button" onClick={() => setSidebarOpen(false)}>
							<X className="size-5" />
						</button>
					</div>
					<div className="min-h-0 flex-1">{sidebarContent}</div>
				</aside>

				{/* Desktop sidebar (below header) */}
				<aside
					className={`hidden h-full shrink-0 overflow-hidden flex-col border-sidebar-border border-r bg-sidebar transition-[width] duration-[180ms] ease-out lg:flex ${
						collapsed ? "w-16" : "w-64"
					}`}
				>
					{sidebarContent}
				</aside>

				{/* Page content */}
				<main className="min-w-0 flex-1 overflow-y-auto bg-[length:100%_300px] bg-gradient-to-b from-muted/20 to-transparent bg-no-repeat">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
