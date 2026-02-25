import crypto from "crypto";
import { env } from "@nanahoshi-v2/env/server";

const SECRET = env.DOWNLOAD_SECRET;

export const generateSignedUrl = (uuid: string, ttlSeconds = 60) => {
	const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
	// We generate a key pair with uuid and exp, if user for any reason changes
	// any of this, the signature will be invalidate
	const sig = crypto
		.createHmac("sha256", SECRET)
		.update(`${uuid}:${exp}`)
		.digest("hex");
	return `${env.SERVER_URL}/download/${uuid}?exp=${exp}&sig=${sig}`;
};

export const verifySignature = (uuid: string, exp: number, sig: string) => {
	if (Date.now() / 1000 > exp) return false;
	const expected = crypto
		.createHmac("sha256", SECRET)
		.update(`${uuid}:${exp}`)
		.digest("hex");
	return expected === sig;
};
