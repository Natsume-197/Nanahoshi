import { Key } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import {
	AuthDivider,
	AuthField,
	AuthShell,
	authButtonClass,
	authLinkClass,
} from "@/components/forms/auth-shell";
import { OAuthErrorNotice } from "@/components/forms/oauth-error-notice";
import { DiscordIcon } from "@/components/shared/discord-icon";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import type { client } from "@/utils/orpc";

type SsoStatus = Awaited<ReturnType<typeof client.setup.ssoStatus>>;

export function SignInForm({
	sso,
	redirectTo,
	oauthError,
}: {
	sso: SsoStatus;
	redirectTo?: string;
	oauthError?: string;
}) {
	const inviteCode = redirectTo?.match(/^\/invite\/([^/?#]+)/)?.[1];
	const errorReturnPath = inviteCode ? redirectTo : "/login";
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (isSubmitting) return;
		const data = new FormData(event.currentTarget);
		const email = String(data.get("email") ?? "").trim();
		const password = String(data.get("password") ?? "");

		setIsSubmitting(true);
		try {
			const result = await authClient.signIn.email({ email, password });
			if (result.error) {
				toast.error(result.error.message || result.error.statusText);
				return;
			}
			toast.success(m["toast.sign_in_success"]());
			window.location.replace(redirectTo ?? "/dashboard");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<AuthShell
			title={m["auth.welcome_back"]()}
			subtitle={m["auth.sign_in_subtitle"]()}
			notice={<OAuthErrorNotice code={oauthError} />}
			footer={
				<>
					{m["auth.need_account"]()}{" "}
					<Link
						to="/sign-up"
						search={{ redirect: redirectTo }}
						className={authLinkClass}
					>
						{m["auth.sign_up_link"]()}
					</Link>
				</>
			}
		>
			<form method="post" onSubmit={handleSubmit} className="space-y-5">
				<fieldset className="flex flex-col gap-5" disabled={isSubmitting}>
					<AuthField
						name="email"
						label={m["auth.email"]()}
						type="email"
						autoComplete="username"
						placeholder={m["auth.email_placeholder"]()}
					/>
					<AuthField
						name="password"
						label={m["auth.password"]()}
						type="password"
						autoComplete="current-password"
						placeholder={m["auth.password_placeholder"]()}
						minLength={8}
					/>

					<Button type="submit" className={authButtonClass}>
						{isSubmitting ? m["auth.signing_in"]() : m["auth.sign_in"]()}
					</Button>
				</fieldset>
			</form>

			{(sso.discord || sso.enabled) && (
				<>
					<AuthDivider>{m["auth.or"]()}</AuthDivider>
					{sso.discord && (
						<Button
							variant="outline"
							className={authButtonClass}
							onClick={() =>
								authClient.signIn.social({
									provider: "discord",
									callbackURL: `${window.location.origin}${redirectTo ?? "/dashboard"}`,
									errorCallbackURL: `${window.location.origin}${errorReturnPath}`,
									additionalData: inviteCode ? { inviteCode } : undefined,
								})
							}
						>
							<DiscordIcon className="mr-2 size-4" />
							{m["auth.sign_in_discord"]()}
						</Button>
					)}

					{sso.enabled && (
						<Button
							variant="outline"
							className={`${authButtonClass} ${sso.discord ? "mt-3" : ""}`}
							onClick={() =>
								authClient.signIn.social({
									provider: sso.providerId,
									callbackURL: `${window.location.origin}${redirectTo ?? "/dashboard"}`,
									errorCallbackURL: `${window.location.origin}${errorReturnPath}`,
								})
							}
						>
							<Key className="mr-2 size-4" weight="bold" />
							{m["auth.sign_in_with"]({ provider: sso.label })}
						</Button>
					)}
				</>
			)}
		</AuthShell>
	);
}
