// src/emails/OrganizationInvitationEmail.tsx
/** @jsxImportSource hono/jsx */
import { html } from "hono/html";

interface Props {
	email: string;
	restoreLink: string;
}

export function RestorePasswordEmail(props: Props) {
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
							<h1>Restore your password!</h1>
							<p>
								<a
									href={props.restoreLink}
									style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;"
								>
									Restore password
								</a>
							</p>
							<p>
								If the button above doesn’t work, use this link:
								<br />
								{props.restoreLink}
							</p>
							<hr />
							<small>This password restoration was sent to {props.email}</small>
						</td>
					</tr>
				</table>
			</body>
		</html>
	);
}
