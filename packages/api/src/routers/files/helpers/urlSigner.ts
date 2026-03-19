import crypto from "node:crypto";
import { env } from "@nanahoshi-v2/env/server";

const SECRET = env.DOWNLOAD_SECRET;

function sign(uuid: string, exp: number): string {
	return crypto
		.createHmac("sha256", SECRET)
		.update(`${uuid}:${exp}`)
		.digest("hex");
}

export const generateSignedUrl = (uuid: string, ttlSeconds = 60) => {
	const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
	const sig = sign(uuid, exp);
	return `${env.SERVER_URL}/download/${uuid}?exp=${exp}&sig=${sig}`;
};

export const generateSignedPath = (uuid: string, ttlSeconds = 60) => {
	const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
	const sig = sign(uuid, exp);
	return `/download/${uuid}?exp=${exp}&sig=${sig}`;
};

export const verifySignature = (uuid: string, exp: number, sig: string) => {
	if (Date.now() / 1000 > exp) return false;
	return sign(uuid, exp) === sig;
};
