import { Button } from "@nanahoshi/ui/components/button";
import { Input } from "@nanahoshi/ui/components/input";
import { Label } from "@nanahoshi/ui/components/label";
import { cn } from "@nanahoshi/ui/lib/utils";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { LOCALE_NAMES } from "@/components/settings/sections/language";
import { useLocale } from "@/hooks/use-locale";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { serverSlug, usernameFromEmail } from "./onboarding";
import {
	OnboardingAction,
	OnboardingShell,
	SevenSpines,
} from "./onboarding-shell";

type Step = "hello" | "name" | "account";

/**
 * A fresh server's first minutes: hello (and the language), what to call the
 * library, and the admin account. Books come next, signed in, on /welcome.
 */
export function SetupFlow() {
	const [step, setStep] = useState<Step>("hello");
	const [name, setName] = useState("");

	if (step === "hello") return <Hello onStart={() => setStep("name")} />;
	if (step === "name")
		return (
			<NameStep
				name={name}
				onChange={setName}
				onBack={() => setStep("hello")}
				onNext={() => setStep("account")}
			/>
		);
	return <AccountStep serverName={name} onBack={() => setStep("name")} />;
}

function Hello({ onStart }: { onStart: () => void }) {
	const { locale, locales, setLocale } = useLocale();
	return (
		<OnboardingShell
			stepKey="hello"
			visual={<SevenSpines />}
			title={m["onboarding.hello_title"]()}
			lead={m["onboarding.hello_lead"]()}
			footer={
				<div className="flex flex-col gap-6">
					<OnboardingAction
						label={m["onboarding.hello_start"]()}
						onClick={onStart}
					/>
					<fieldset className="flex flex-wrap items-center justify-center gap-1">
						<legend className="sr-only">{m["settings.nav.language"]()}</legend>
						{locales.map((code) => (
							<button
								key={code}
								type="button"
								lang={code}
								aria-pressed={code === locale}
								onClick={() => code !== locale && setLocale(code)}
								className={cn(
									"rounded-full px-3 py-1.5 text-sm transition-colors",
									code === locale
										? "bg-muted font-medium text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{LOCALE_NAMES[code]}
							</button>
						))}
					</fieldset>
				</div>
			}
		/>
	);
}

const NAME_IDEAS = [
	() => m["onboarding.name_idea_home"](),
	() => m["onboarding.name_idea_shelf"](),
	() => m["onboarding.name_idea_nook"](),
];

function NameStep({
	name,
	onChange,
	onBack,
	onNext,
}: {
	name: string;
	onChange: (name: string) => void;
	onBack: () => void;
	onNext: () => void;
}) {
	const blocked = name.trim() ? null : m["onboarding.name_blocked"]();
	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (!blocked) onNext();
	};
	return (
		<OnboardingShell
			stepKey="name"
			step={1}
			onBack={onBack}
			title={m["onboarding.name_title"]()}
			lead={m["onboarding.name_lead"]()}
		>
			<form onSubmit={submit} className="flex flex-col gap-10">
				<div className="flex flex-col gap-3">
					<Label htmlFor="server-name" className="sr-only">
						{m["setup.server_name"]()}
					</Label>
					<Input
						id="server-name"
						autoFocus
						autoComplete="off"
						maxLength={60}
						value={name}
						onChange={(event) => onChange(event.target.value)}
						placeholder={m["onboarding.name_placeholder"]()}
						className="h-14 border-border bg-input px-4 text-lg md:text-lg"
					/>
					<div className="flex flex-wrap gap-2">
						{NAME_IDEAS.map((idea) => (
							<button
								key={idea()}
								type="button"
								onClick={() => onChange(idea())}
								className="rounded-full border border-border px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:border-foreground/30 hover:text-foreground"
							>
								{idea()}
							</button>
						))}
					</div>
				</div>
				<OnboardingAction
					type="submit"
					label={m["onboarding.continue"]()}
					blockedReason={blocked}
				/>
			</form>
		</OnboardingShell>
	);
}

function AccountStep({
	serverName,
	onBack,
}: {
	serverName: string;
	onBack: () => void;
}) {
	const [email, setEmail] = useState("");
	const [username, setUsername] = useState("");
	const [usernameTouched, setUsernameTouched] = useState(false);
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const shownUsername = usernameTouched ? username : usernameFromEmail(email);

	const setup = useMutation({
		...orpc.setup.complete.mutationOptions(),
		onSuccess: async () => {
			// Straight on, signed in, to the books step.
			const { error } = await authClient.signIn.email({ email, password });
			window.location.replace(error ? "/login" : "/welcome");
		},
	});

	const blocked = !email.includes("@")
		? m["onboarding.account_blocked_email"]()
		: shownUsername.length < 3
			? m["onboarding.account_blocked_username"]()
			: password.length < 8
				? m["onboarding.account_blocked_password"]()
				: null;

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (blocked || setup.isPending) return;
		setup.mutate({
			workspaceName: serverName.trim(),
			workspaceSlug: serverSlug(serverName),
			username: shownUsername,
			email: email.trim(),
			password,
		});
	};

	return (
		<OnboardingShell
			stepKey="account"
			step={2}
			onBack={setup.isPending ? undefined : onBack}
			title={m["onboarding.account_title"]()}
			lead={m["onboarding.account_lead"]({ name: serverName.trim() })}
		>
			<form onSubmit={submit} className="flex flex-col gap-10">
				<fieldset disabled={setup.isPending} className="flex flex-col gap-5">
					<div className="flex flex-col gap-2">
						<Label htmlFor="email">{m["auth.email"]()}</Label>
						<Input
							id="email"
							type="email"
							autoFocus
							autoComplete="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							placeholder={m["auth.email_placeholder"]()}
							className="h-12 border-border bg-input"
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="username">{m["auth.username"]()}</Label>
						<Input
							id="username"
							autoComplete="username"
							value={shownUsername}
							onChange={(event) => {
								setUsernameTouched(true);
								setUsername(
									event.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""),
								);
							}}
							maxLength={30}
							placeholder={m["setup.username_placeholder"]()}
							aria-describedby="username-hint"
							className="h-12 border-border bg-input"
						/>
						<p id="username-hint" className="text-muted-foreground text-xs">
							{m["onboarding.username_hint"]()}
						</p>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="password">{m["auth.password"]()}</Label>
						<div className="relative">
							<Input
								id="password"
								type={showPassword ? "text" : "password"}
								autoComplete="new-password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								placeholder={m["auth.password_min_placeholder"]()}
								className="h-12 border-border bg-input pe-12"
							/>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="absolute inset-y-0 end-1 my-auto rounded-full"
								onClick={() => setShowPassword((shown) => !shown)}
								aria-label={
									showPassword
										? m["onboarding.password_hide"]()
										: m["onboarding.password_show"]()
								}
								aria-pressed={showPassword}
							>
								{showPassword ? <EyeSlash /> : <Eye />}
							</Button>
						</div>
					</div>
				</fieldset>
				<div className="flex flex-col gap-3">
					{setup.isError && (
						<p
							role="alert"
							className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm"
						>
							{setup.error.message || m["setup.failed"]()}
						</p>
					)}
					<OnboardingAction
						type="submit"
						label={
							setup.isPending
								? m["onboarding.account_creating"]()
								: m["onboarding.account_create"]()
						}
						blockedReason={blocked}
						pending={setup.isPending}
					/>
				</div>
			</form>
		</OnboardingShell>
	);
}
