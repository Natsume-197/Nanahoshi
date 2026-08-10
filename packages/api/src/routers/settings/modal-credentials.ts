import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

const MANAGED_CREDENTIALS_SCHEMA = "nanahoshi.modal-credentials.v1" as const;

const StoredModalCredentialsSchema = z.object({
	schema: z.literal(MANAGED_CREDENTIALS_SCHEMA),
	tokenId: z.string().min(1).max(4096),
	tokenSecret: z.string().min(1).max(4096),
});

export type ModalCredentials = {
	tokenId: string;
	tokenSecret: string;
};

export type ModalCredentialSource =
	| "environment"
	| "nanahoshi"
	| "profile"
	| null;

export type ModalCredentialStatus = {
	configured: boolean;
	source: ModalCredentialSource;
	managedConfigured: boolean;
};

type ModalCredentialStoreOptions = {
	credentialsPath?: string;
	profilePath?: string;
};

function runtimeCredentialsPath(): string {
	return path.resolve(process.cwd(), "data", "secrets", "modal.json");
}

function runtimeProfilePath(): string {
	return path.join(os.homedir(), ".modal.toml");
}

function hasEnvironmentCredentials(
	environment: Record<string, string | undefined>,
): boolean {
	return Boolean(
		environment.MODAL_TOKEN_ID?.trim() &&
			environment.MODAL_TOKEN_SECRET?.trim(),
	);
}

async function profileIsConfigured(profilePath: string): Promise<boolean> {
	try {
		const profile = await fs.readFile(profilePath, "utf8");
		const hasId = /token_id\s*=\s*["'][^"']+["']/.test(profile);
		const hasSecret = /token_secret\s*=\s*["'][^"']+["']/.test(profile);
		return hasId && hasSecret;
	} catch {
		return false;
	}
}

export class ModalCredentialStore {
	readonly #credentialsPath: string;
	readonly #profilePath: string;

	constructor(options: ModalCredentialStoreOptions = {}) {
		this.#credentialsPath = options.credentialsPath ?? runtimeCredentialsPath();
		this.#profilePath = options.profilePath ?? runtimeProfilePath();
	}

	async readManaged(): Promise<ModalCredentials | null> {
		let input: unknown;
		try {
			input = JSON.parse(await fs.readFile(this.#credentialsPath, "utf8"));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw new Error("Unable to read Nanahoshi Modal credentials", {
				cause: error,
			});
		}
		const parsed = StoredModalCredentialsSchema.safeParse(input);
		if (!parsed.success) {
			throw new Error("Nanahoshi Modal credentials are invalid");
		}
		return {
			tokenId: parsed.data.tokenId,
			tokenSecret: parsed.data.tokenSecret,
		};
	}

	async save(credentials: ModalCredentials): Promise<void> {
		const parsed = StoredModalCredentialsSchema.parse({
			schema: MANAGED_CREDENTIALS_SCHEMA,
			tokenId: credentials.tokenId.trim(),
			tokenSecret: credentials.tokenSecret.trim(),
		});
		const directory = path.dirname(this.#credentialsPath);
		await fs.mkdir(directory, { recursive: true, mode: 0o700 });
		await fs.chmod(directory, 0o700);
		const temporaryPath = `${this.#credentialsPath}.${crypto.randomUUID()}.tmp`;
		try {
			await fs.writeFile(temporaryPath, `${JSON.stringify(parsed)}\n`, {
				encoding: "utf8",
				flag: "wx",
				mode: 0o600,
			});
			await fs.rename(temporaryPath, this.#credentialsPath);
			await fs.chmod(this.#credentialsPath, 0o600);
		} catch (error) {
			await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
			throw error;
		}
	}

	async remove(): Promise<void> {
		await fs.rm(this.#credentialsPath, { force: true });
	}

	async status(
		environment: Record<string, string | undefined> = process.env,
	): Promise<ModalCredentialStatus> {
		const managedConfigured = (await this.readManaged()) !== null;
		if (hasEnvironmentCredentials(environment)) {
			return { configured: true, source: "environment", managedConfigured };
		}
		if (managedConfigured) {
			return { configured: true, source: "nanahoshi", managedConfigured: true };
		}
		if (await profileIsConfigured(this.#profilePath)) {
			return { configured: true, source: "profile", managedConfigured: false };
		}
		return { configured: false, source: null, managedConfigured: false };
	}

	async environment(
		base: Record<string, string | undefined> = process.env,
	): Promise<Record<string, string | undefined>> {
		if (hasEnvironmentCredentials(base)) return { ...base };
		const managed = await this.readManaged();
		if (!managed) return { ...base };
		return {
			...base,
			MODAL_TOKEN_ID: managed.tokenId,
			MODAL_TOKEN_SECRET: managed.tokenSecret,
		};
	}
}

export const modalCredentialStore = new ModalCredentialStore();
