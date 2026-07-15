import { env } from "@nanahoshi-v2/env/server";
import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";

/** SMTP is optional: only email invitations and Send to Kindle need it. */
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

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
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
