import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import {
	AuthDivider,
	AuthField,
	AuthShell,
	authButtonClass,
	authLinkClass,
	authNoticeClass,
} from "@/components/forms/auth-shell";
import { OAuthErrorNotice } from "@/components/forms/oauth-error-notice";
import { DiscordIcon } from "@/components/shared/discord-icon";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import type { client } from "@/utils/orpc";

type SsoStatus = Awaited<ReturnType<typeof client.setup.ssoStatus>>;
export function SignUpForm({
	sso,
	redirectTo,
	oauthError,
}: {
	sso: SsoStatus;
	redirectTo?: string;
	oauthError?: string;
}) {
	const inviteCode = redirectTo?.match(/^\/invite\/([^/?#]+)/)?.[1];
	const errorReturnPath = inviteCode ? redirectTo : "/sign-up";
	const registrationClosed = sso.signup.policy === "closed";
	const emailSignUp = sso.signup.email;
	const discordSignUp = sso.signup.discord;
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (isSubmitting) return;
		const data = new FormData(event.currentTarget);
		const name = String(data.get("name") ?? "").trim();
		const username = String(data.get("username") ?? "").trim();
		const email = String(data.get("email") ?? "").trim();
		const password = String(data.get("password") ?? "");

		setIsSubmitting(true);
		try {
			const result = await authClient.signUp.email(
				{ email, password, name, username: username.toLowerCase() },
				{
					headers: inviteCode ? { "x-invite-code": inviteCode } : undefined,
				},
			);
			if (result.error) {
				toast.error(result.error.message || result.error.statusText);
				return;
			}
			toast.success(m["toast.sign_up_success"]());
			window.location.replace(redirectTo ?? "/dashboard");
		} finally {
			setIsSubmitting(false);
		}
	};

	const footer = (
		<>
			{m["auth.have_account"]()}{" "}
			<Link
				to="/login"
				search={{ redirect: redirectTo }}
				className={authLinkClass}
			>
				{m["auth.sign_in_link"]()}
			</Link>
		</>
	);

	if (registrationClosed) {
		return (
			<AuthShell
				title={m["auth.create_account"]()}
				notice={
					<p className={authNoticeClass}>{m["auth.signup_closed_note"]()}</p>
				}
				footer={footer}
			>
				<Button variant="outline" className={authButtonClass} asChild>
					<Link to="/login" search={{ redirect: redirectTo }}>
						{m["auth.sign_in_link"]()}
					</Link>
				</Button>
			</AuthShell>
		);
	}

	return (
		<AuthShell
			title={m["auth.create_account"]()}
			subtitle={m["auth.sign_up_subtitle"]()}
			notice={
				<>
					{!inviteCode && (
						<p className={authNoticeClass}>{m["auth.invite_only_note"]()}</p>
					)}
					{!emailSignUp && (
						<p className={authNoticeClass}>
							{m["auth.email_signup_disabled_note"]()}
						</p>
					)}
					<OAuthErrorNotice code={oauthError} />
				</>
			}
			footer={footer}
		>
			{emailSignUp && (
				<form method="post" onSubmit={handleSubmit} className="space-y-5">
					<fieldset className="flex flex-col gap-5" disabled={isSubmitting}>
						<AuthField
							name="name"
							label={m["auth.name"]()}
							placeholder={m["auth.name_placeholder"]()}
							autoComplete="name"
							minLength={2}
						/>
						<AuthField
							name="username"
							label={m["auth.username"]()}
							placeholder={m["auth.username_placeholder"]()}
							autoComplete="username"
							minLength={3}
							maxLength={30}
							pattern="[a-zA-Z0-9_]+"
						/>
						<AuthField
							name="email"
							label={m["auth.email"]()}
							placeholder={m["auth.email_placeholder"]()}
							autoComplete="email"
							type="email"
						/>
						<AuthField
							name="password"
							label={m["auth.password"]()}
							placeholder={m["auth.password_min_placeholder"]()}
							autoComplete="new-password"
							type="password"
							minLength={8}
						/>

						<Button type="submit" className={authButtonClass}>
							{isSubmitting
								? m["auth.creating_account"]()
								: m["auth.sign_up"]()}
						</Button>
					</fieldset>
				</form>
			)}

			{discordSignUp && emailSignUp && (
				<AuthDivider>{m["auth.or"]()}</AuthDivider>
			)}

			{discordSignUp && (
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
					{m["auth.sign_up_discord"]()}
				</Button>
			)}
		</AuthShell>
	);
}
