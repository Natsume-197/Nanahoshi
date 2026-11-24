import { logger } from "@nanahoshi/api/lib/logger";
import type {
	StartupRefusal,
	StartupRefusalCode,
} from "./config/startup-refusal";

// When the server can't start, it used to exit, and the container's restart
// policy started it again a few seconds later, forever. Now it stays up in
// safe mode: it opens no database, answers every page with why it stopped and
// which release it runs, and fails its health check, so the updater and any
// orchestrator see it is not serving. After an hour it exits and the restart
// policy tries again; a newer image or a fixed configuration is the cure.

export const SAFE_MODE_DURATION_MS = 60 * 60_000;

type Locale = "en" | "es" | "ja";

const TEXT: Record<
	Locale,
	{
		title: string;
		lead: string;
		release: string;
		since: string;
		retry: string;
		logs: string;
		reasons: Record<StartupRefusalCode, string>;
	}
> = {
	en: {
		title: "Nanahoshi didn't start",
		lead: "The server stopped before serving anything, so your library and its data are unchanged.",
		release: "Release",
		since: "Stopped at",
		retry: "It tries to start again by itself at",
		logs: "The container logs have the details.",
		reasons: {
			"database-newer":
				"This database was already upgraded by a newer Nanahoshi. An older release can't open it: run the newer image again.",
			"backup-failed":
				"The database backup before this update failed, so the update didn't change anything. Free disk space or fix the backup, then restart. NANAHOSHI_PRE_UPDATE_BACKUP=false skips the backup.",
			"migration-failed":
				"Updating the database failed. The backup taken just before is in Settings › Data & Backups once the server runs again, and in data/backups.",
			"startup-failed":
				"Something the server needs at startup failed, such as the database or Redis connection.",
		},
	},
	es: {
		title: "Nanahoshi no se inició",
		lead: "El servidor se detuvo antes de servir nada, así que tu biblioteca y sus datos siguen igual.",
		release: "Versión",
		since: "Detenido a las",
		retry: "Volverá a intentarlo solo a las",
		logs: "Los registros del contenedor tienen los detalles.",
		reasons: {
			"database-newer":
				"Esta base de datos ya la actualizó un Nanahoshi más nuevo. Una versión anterior no puede abrirla: vuelve a usar la imagen más nueva.",
			"backup-failed":
				"Falló la copia de seguridad previa a esta actualización, así que la actualización no cambió nada. Libera espacio o arregla la copia y reinicia. NANAHOSHI_PRE_UPDATE_BACKUP=false omite la copia.",
			"migration-failed":
				"Falló la actualización de la base de datos. La copia tomada justo antes está en Ajustes › Data & Backups cuando el servidor vuelva a funcionar, y en data/backups.",
			"startup-failed":
				"Falló algo que el servidor necesita al arrancar, como la conexión con la base de datos o Redis.",
		},
	},
	ja: {
		title: "Nanahoshi を起動できませんでした",
		lead: "サーバーは何も提供する前に停止したため、ライブラリとデータは変更されていません。",
		release: "リリース",
		since: "停止時刻",
		retry: "次の時刻に自動で再起動を試みます",
		logs: "詳細はコンテナのログにあります。",
		reasons: {
			"database-newer":
				"このデータベースは新しい Nanahoshi によって更新済みです。古いリリースでは開けません。新しいイメージで起動してください。",
			"backup-failed":
				"更新前のデータベースのバックアップに失敗したため、更新は何も変更していません。空き容量を確保するかバックアップを修正して再起動してください。NANAHOSHI_PRE_UPDATE_BACKUP=false でバックアップを省略できます。",
			"migration-failed":
				"データベースの更新に失敗しました。直前に取ったバックアップは、サーバーが再び動くと「設定 › Data & Backups」に、また data/backups にあります。",
			"startup-failed":
				"データベースや Redis への接続など、起動に必要な処理が失敗しました。",
		},
	},
};

export function pickLocale(acceptLanguage: string | null): Locale {
	for (const part of (acceptLanguage ?? "").split(",")) {
		const tag = part.trim().slice(0, 2).toLowerCase();
		if (tag === "es" || tag === "ja" || tag === "en") return tag;
	}
	return "en";
}

function escapeHtml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

export interface SafeModeState {
	code: StartupRefusalCode;
	release: string;
	since: Date;
	retryAt: Date;
}

export function renderSafeModePage(state: SafeModeState, locale: Locale) {
	const t = TEXT[locale];
	const time = (date: Date) =>
		`<time datetime="${date.toISOString()}">${escapeHtml(date.toISOString().replace("T", " ").slice(0, 16))} UTC</time>`;
	return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="60">
<title>${escapeHtml(t.title)}</title>
<style>
:root{color-scheme:light dark;--bg:#faf9f7;--fg:#1f1d1a;--muted:#6b665f;--card:#fff;--border:#e6e2dc}
@media (prefers-color-scheme:dark){:root{--bg:#1a1917;--fg:#ece9e4;--muted:#a19b92;--card:#24221f;--border:#3a3732}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{max-width:34rem;margin:1rem;padding:2rem;background:var(--card);border:1px solid var(--border);border-radius:1rem}
h1{margin:0 0 .5rem;font-size:1.4rem}p{margin:.75rem 0}.muted{color:var(--muted);font-size:.9rem}
dl{display:grid;grid-template-columns:auto 1fr;gap:.25rem 1rem;margin:1.25rem 0 0;font-size:.9rem}dt{color:var(--muted)}dd{margin:0}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(t.title)}</h1>
<p>${escapeHtml(t.reasons[state.code])}</p>
<p class="muted">${escapeHtml(t.lead)} ${escapeHtml(t.logs)}</p>
<dl>
<dt>${escapeHtml(t.release)}</dt><dd>${escapeHtml(state.release)}</dd>
<dt>${escapeHtml(t.since)}</dt><dd>${time(state.since)}</dd>
<dt>${escapeHtml(t.retry)}</dt><dd>${time(state.retryAt)}</dd>
</dl>
</main>
</body>
</html>`;
}

export function createSafeModeHandler(state: SafeModeState) {
	const summary = {
		safeMode: true,
		code: state.code,
		release: state.release,
		since: state.since.toISOString(),
		retryAt: state.retryAt.toISOString(),
	};
	return (request: Request): Response => {
		const { pathname } = new URL(request.url);
		if (
			pathname === "/health" ||
			pathname === "/safe-mode.json" ||
			pathname.startsWith("/rpc") ||
			pathname.startsWith("/api")
		) {
			return Response.json(summary, {
				status: 503,
				headers: { "Retry-After": "60", "Cache-Control": "no-store" },
			});
		}
		return new Response(
			renderSafeModePage(
				state,
				pickLocale(request.headers.get("accept-language")),
			),
			{
				status: 503,
				headers: {
					"Content-Type": "text/html; charset=utf-8",
					"Retry-After": "60",
					"Cache-Control": "no-store",
				},
			},
		);
	};
}

/** Log the refusal, and plan the exit that lets the restart policy try again. */
export function enterSafeMode(
	refusal: StartupRefusal,
	release: string,
	role: "api" | "worker",
	now = new Date(),
): SafeModeState {
	logger.error(
		{ err: refusal, code: refusal.code, release, role },
		"Startup failed; staying in safe mode",
	);
	const retryAt = new Date(now.getTime() + SAFE_MODE_DURATION_MS);
	setTimeout(() => {
		logger.info({ role }, "Leaving safe mode to try starting again");
		process.exit(1);
	}, SAFE_MODE_DURATION_MS);
	return { code: refusal.code, release, since: now, retryAt };
}
