import { env } from "@nanahoshi/env/server";
import nodemailer, { type Transporter } from "nodemailer";
import type Mail from "nodemailer/lib/mailer";

/** SMTP is optional: only Send to Kindle needs it (email invitations were removed). */
export function isMailerConfigured(): boolean {
	return Boolean(env.SMTP_USER && env.SMTP_PASS);
}

export class MailerNotConfiguredError extends Error {
	constructor() {
		super(
			"Email is not configured on this server. Set the SMTP_USER and SMTP_PASS environment variables to enable sending emails.",
		);
	}
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
	if (!isMailerConfigured()) throw new MailerNotConfiguredError();
	transporter ??= nodemailer.createTransport({
		host: env.SMTP_HOST,
		port: Number(env.SMTP_PORT),
		secure: env.SMTP_SECURE === true,
		auth: {
			user: env.SMTP_USER,
			pass: env.SMTP_PASS,
		},
	});
	return transporter;
}

export async function sendMail({
	to,
	subject,
	text,
	html,
	attachments,
}: {
	to: string;
	subject: string;
	text?: string;
	html?: string;
	attachments?: Mail.Attachment[];
}) {
	const info = await getTransporter().sendMail({
		from: `"Nanahoshi" <${env.SMTP_USER}>`,
		to,
		subject,
		text,
		html,
		attachments,
	});
	return info;
}
