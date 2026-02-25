// src/emails/OrganizationInvitationEmail.tsx
/** @jsxImportSource hono/jsx */
import { html } from "hono/html";

interface Props {
	email: string;
	invitedByUsername: string;
	invitedByEmail: string;
	teamName: string;
	inviteLink: string;
}

export function OrganizationInvitationEmail(props: Props) {
	return (
		<html lang="en">
			<body style="font-family: sans-serif; background: #f9f9f9; padding: 40px;">
				<table
					align="center"
					width="600"
					style="background: white; border-radius: 8px; padding: 40px;"
				>
					<tr>
						<td>
							<h1>You're invited!</h1>
							<p>
								<strong>{props.invitedByUsername}</strong> (
								{props.invitedByEmail}) has invited you to join{" "}
								<strong>{props.teamName}</strong>.
							</p>
							<p>
								<a
									href={props.inviteLink}
									style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;"
								>
									Accept Invitation
								</a>
							</p>
							<p>
								If the button above doesn’t work, use this link:
								<br />
								{props.inviteLink}
							</p>
							<hr />
							<small>This invitation was sent to {props.email}</small>
						</td>
					</tr>
				</table>
			</body>
		</html>
	);
}
