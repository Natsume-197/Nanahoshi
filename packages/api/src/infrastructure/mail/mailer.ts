// src/services/mailer.ts
import nodemailer from "nodemailer";
import { env } from "@nanahoshi-v2/env/server";

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
	html,
}: {
	to: string;
	subject: string;
	html: string;
}) {
	const info = await transporter.sendMail({
		from: `"Nanahoshi" <${env.SMTP_USER}>`,
		to,
		subject,
		html,
	});
	return info;
}
