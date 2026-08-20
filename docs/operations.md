# Nanahoshi operations

## Configuration

Nanahoshi reads server configuration from `apps/server/.env` when using the
repository scripts. Start from `.env.example`; do not commit the populated file.
Keep `NAMESPACE_UUID` stable for the lifetime of the installation because book
identifiers derive from it. Keep `DOWNLOAD_SECRET` and `BETTER_AUTH_SECRET`
private and use different random values.

If a reverse proxy fronts the API, set `TRUSTED_PROXY_IPS` to the exact socket
IP address(es) of that proxy. Nanahoshi ignores `X-Forwarded-For` from every
other peer so clients cannot forge audit IP addresses.

## Backup before an upgrade

`bun run backup` creates a timestamped directory under `backups/` containing a
custom-format PostgreSQL dump and an archive of the persistent server-data
volume. Set `BACKUP_DIR` to place it on separate storage. The command also runs
`pg_restore --list` so a truncated database dump fails immediately.

```bash
BACKUP_DIR=/mnt/backups/nanahoshi bun run backup
```

Copy backups off the Docker host and apply retention and encryption appropriate
for your installation. A backup stored only beside the live volumes is not a
disaster-recovery copy.

## Restore drill

Restores overwrite application data. Stop the web, API and worker containers
first, then run the restore command with the exact backup directory and explicit
confirmation:

```bash
RESTORE_FROM=/mnt/backups/nanahoshi/2026-08-20T120000Z \
CONFIRM_RESTORE=nanahoshi bun run restore
```

Start the stack, wait for healthchecks and verify login, membership, collections,
catalog visibility and reading progress. Perform this drill periodically on an
isolated host rather than discovering restore problems during an incident.
