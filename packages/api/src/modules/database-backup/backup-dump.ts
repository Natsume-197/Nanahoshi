import { execFile, spawn } from "node:child_process";
import { chmod, open, rename, rm, stat } from "node:fs/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);
const developmentContainer = "nanahoshi-v2-postgres";

// A port is supplied only for local development. Production uses its installed clients.
export async function resolveBackupTools(developmentPort?: number) {
	try {
		await Promise.all([
			exec("pg_dump", ["--version"], { timeout: 10_000 }),
			exec("pg_restore", ["--version"], { timeout: 10_000 }),
		]);
		return "local" as const;
	} catch {
		if (developmentPort === undefined) return null;
	}
	try {
		// Avoid backing up a different local database when the configured port differs.
		const { stdout } = await exec(
			"docker",
			[
				"inspect",
				"--format",
				'{{json (index .NetworkSettings.Ports "5432/tcp")}}',
				developmentContainer,
			],
			{ timeout: 10_000 },
		);
		const ports = JSON.parse(stdout) as { HostPort: string }[] | null;
		if (!ports?.some((port) => Number(port.HostPort) === developmentPort))
			return null;
		await Promise.all(
			["pg_dump", "pg_restore"].map((tool) =>
				exec("docker", ["exec", developmentContainer, tool, "--version"], {
					timeout: 10_000,
				}),
			),
		);
		return "docker" as const;
	} catch {
		return null;
	}
}

function runDocker(
	args: string[],
	connection: NodeJS.ProcessEnv,
	input: number | "ignore",
	output: number | "ignore",
	timeout: number,
) {
	return new Promise<void>((resolve, reject) => {
		const child = spawn(
			"docker",
			[
				"exec",
				"-i",
				...["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"].flatMap(
					(key) => ["--env", key],
				),
				developmentContainer,
				...args,
			],
			{
				env: {
					...process.env,
					...connection,
					PGHOST: "127.0.0.1",
					PGPORT: "5432",
				},
				stdio: [input, output, "ignore"],
				timeout,
			},
		);
		child.on("error", reject);
		child.on("close", (code) =>
			code === 0
				? resolve()
				: reject(new Error("Docker PostgreSQL command failed")),
		);
	});
}

export async function createDatabaseDump(
	destination: string,
	connection: NodeJS.ProcessEnv,
	developmentPort?: number,
) {
	const temporary = `${destination}.partial`;
	try {
		const tools =
			developmentPort === undefined
				? "local"
				: await resolveBackupTools(developmentPort);
		if (!tools) throw new Error("PostgreSQL tools unavailable");
		if (tools === "docker") {
			// Stream through file descriptors so database size does not determine memory usage.
			const output = await open(temporary, "w", 0o600);
			try {
				await runDocker(
					["pg_dump", "--format=custom", "--no-password"],
					connection,
					"ignore",
					output.fd,
					60 * 60 * 1000,
				);
			} finally {
				await output.close();
			}
			const input = await open(temporary, "r");
			try {
				await runDocker(
					["pg_restore", "--list"],
					connection,
					input.fd,
					"ignore",
					60_000,
				);
			} finally {
				await input.close();
			}
		} else {
			await exec(
				"pg_dump",
				["--format=custom", "--no-password", "--file", temporary],
				{
					env: { ...process.env, ...connection },
					timeout: 60 * 60 * 1000,
				},
			);
			await chmod(temporary, 0o600);
			await exec("pg_restore", ["--list", temporary], {
				timeout: 60_000,
				maxBuffer: 16 * 1024 * 1024,
			});
		}
		await chmod(temporary, 0o600);
		if ((await stat(temporary)).size === 0)
			throw new Error("Empty database backup");
		await rename(temporary, destination);
	} catch {
		await rm(temporary, { force: true });
		// Do not surface command diagnostics: they may contain database connection details.
		throw new Error(
			"Database backup failed. Check disk space, database connectivity, PostgreSQL client version compatibility and Docker access in development.",
		);
	}
}
