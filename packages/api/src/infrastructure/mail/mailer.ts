// src/services/mailer.ts

import { env } from "@nanahoshi-v2/env/server";
import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";

const transporter = nodemailer.createTransport({
	host: env.SMTP_HOST,
	port: Number(env.SMTP_PORT),
	secure: env.SMTP_SECURE === true,
	auth: {
		user: env.SMTP_USER,
		pass: env.SMTP_PASS,
	},
});

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
	const info = await transporter.sendMail({
		from: `"Nanahoshi" <${env.SMTP_USER}>`,
		to,
		subject,
		text,
		html,
		attachments,
	});
	return info;
}
