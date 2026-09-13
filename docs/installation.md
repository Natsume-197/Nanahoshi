# Install Nanahoshi

Nanahoshi runs with Docker and Docker Compose v2. The stack contains the application
(web + API and a background worker in one container), PostgreSQL/PGroonga and Redis.
[s6-overlay](https://github.com/just-containers/s6-overlay) supervises the two
application processes, which run as the unprivileged `nanahoshi` user.
The initial release workflow publishes Linux amd64 images. ARM64 is not yet a
verified release target.

## First installation

Create a folder and save these two files in it:

- [`docker-compose.yml`](../docker-compose.yml)
- [`.env.example`](../.env.example), renamed to `.env`

Edit `.env` with your public URL:

```dotenv
APP_URL=http://localhost:3000
```

In `docker-compose.yml`, replace `./books` in `./books:/books:ro` with your host
book directory. The left side of `3000:3000` selects the host port.

For access from a phone or another computer, set `APP_URL` to your server's LAN
address, for example `http://192.168.1.20:3000`. Changing the port also requires
changing the port in `APP_URL`. Use the configured URL to access the application.
Paths containing spaces are supported. Both application and worker receive the
same book directory at `/books`.

Fill the five empty required settings in `.env`: generate a separate UUID for
`NAMESPACE_UUID` and `DOWNLOAD_SECRET` with `uuidgen`, and a separate random value
for `DB_PASSWORD`, `REDIS_PASSWORD` and `BETTER_AUTH_SECRET` with
`openssl rand -hex 32`. A password manager can also generate these values;
`BETTER_AUTH_SECRET` must be at least 32 characters. Keep `.env` private
(`chmod 600 .env` on Linux) and preserve these values when upgrading or restoring.

The image tag `latest` in Compose selects the latest stable image. To pin a
version, replace it with a published `vX.Y.Z` tag. Prereleases do not update `latest`.
See [Publishing a release](releasing.md) to build and publish an image.

```sh
docker compose up -d
```

Open `APP_URL`, create your administrator account and workspace, then create a
library pointing to `/books`. Migrations run automatically. No Bun installation
or image compilation is needed on your computer when using published images.

Optional settings for SMTP, Discord, SSO and server analytics go in `.env`;
both application and worker read this file. Use `.env` for these settings rather
than shell exports. Keep the Docker connection defaults in the
template; the three public URL settings follow `APP_URL` automatically.
For [Portainer on Docker Standalone](https://docs.portainer.io/2.33-lts/user/docker/stacks/add),
import the `.env` values as stack environment variables and change
`env_file: .env` to `env_file: stack.env`. Set `SERVER_URL`, `CORS_ORIGIN`
and `BETTER_AUTH_URL` to the full public URL in Portainer's variable editor.

## Storage and permissions

PostgreSQL, application data and Redis queues use named volumes. Keep the Compose
project name when upgrading an existing installation so it uses the same volumes.
Do not use `docker compose down -v` unless you intend to erase this installation.

The external books mount is read-only by default. Allow directory traversal and
file reads for the container user on the host/NAS; an inaccessible mount cannot be
scanned. Uploads write to the selected library folder, so `/books:ro` cannot accept
uploads. To upload into your host book folder, change the mount to `./books:/books`
and grant write access to the container user.

Alternatively, keep the external mount read-only and create a folder in the
application volume:

```sh
docker compose exec server mkdir -p /app/apps/server/data/books
```

Create a library pointing to `/app/apps/server/data/books` and upload there.

Check startup and installation problems with:

```sh
docker compose ps
docker compose logs --tail 100 server
```

The application's health endpoint is `/health`. The web UI, API, OPDS and WebSocket
all use the same public port. Choose hardware for your catalog and workloads;
conversion and recommendations can use substantially more memory than idle browsing.

If either API or worker exits unexpectedly, s6 stops the container with an error;
Compose's `restart: unless-stopped` restarts the whole application. Its healthcheck
checks both processes and the HTTP endpoint. A normal stop gives the processes
30 seconds to finish; Compose allows 40 seconds for the full shutdown.
Both processes share container resource limits; the worker retains its lower CPU
priority. Logs from both processes appear under the `server` service.

## Updates and backups

The optional [`backup.sh`](../scripts/backup.sh) and
[`restore.sh`](../scripts/restore.sh) scripts work alongside your Compose file.
Save them in a `scripts/` subdirectory of your installation folder. Use the scripts
from the same Git tag as your installed version; no source checkout is needed.

Before updating, create a backup (the script briefly stops and restarts any running
application container to keep database and files consistent):

```sh
bash scripts/backup.sh
```

The backup includes PostgreSQL, application data, `.env` and `docker-compose.yml`.
Back up the external book directory separately. The script checks archive readability;
validate your recovery procedure by restoring into a disposable installation.

Set the application image tag in `docker-compose.yml` to the desired release, then:

```sh
docker compose pull
docker compose up -d --remove-orphans
```

Existing source installations moving to this distribution should preserve their
original secrets and project name, set `APP_URL`, and move custom book mounts to
the shared application volumes. Copy any missing internal connection settings
from `.env.example` into the existing `.env`. The old separate `web` and `worker` containers are no longer needed. Both web and API are now available on the host port configured in Compose.

When migrating from a Compose file with a separate worker, stop the old stack
with `docker compose down` before replacing the file; preserve its named volumes.

If an older `.env` contains `BOOKS_PATH`, `SERVER_PORT` or `NANAHOSHI_VERSION`,
move those values into Compose's book mount, host port and image tag before
upgrading. These environment variables are no longer read.

To restore, use the backup's application version, stop the application, and
restore `config.env` to `.env` with private permissions. Also restore the saved
`docker-compose.yml` (or recreate it for older backups). On a new host, adjust
`APP_URL` in `.env` and the book mount in Compose while preserving the secrets. Then:

```sh
docker compose up -d --wait postgres redis
docker compose create server
CONFIRM_RESTORE=nanahoshi RESTORE_FROM=/absolute/path/to/backup bash scripts/restore.sh
docker compose up -d
```

Restore replaces database and application data and clears stale Redis jobs.
Rescan libraries afterward to rebuild pending work. Downgrading an image does not
undo database migrations; restore a compatible backup when reverting versions.

## HTTPS and existing reverse proxies

The basic LAN installation does not require an additional proxy. If you already
use a reverse proxy for HTTPS, forward the public URL to the application port and
set `APP_URL=https://books.example.com`. Support WebSocket upgrades and streaming;
configure `TRUSTED_PROXY_IPS` explicitly for client IP forwarding. Never trust
arbitrary forwarded client IPs. HTTPS enables secure authentication cookies.

## Build from source

From a source checkout, prepare `.env` as above and set the application image
in `docker-compose.yml` to `ghcr.io/natsume-197/nanahoshi:local`:

```sh
docker build -t ghcr.io/natsume-197/nanahoshi:local .
docker compose up -d
```

The root `Dockerfile` has separate build stages for frontend and API/worker.
The final image includes both; s6 runs the API and worker as separate processes.

Browser analytics are optional build settings: pass
`--build-arg PUBLIC_POSTHOG_KEY=... --build-arg VITE_POSTHOG_HOST=...`
to `docker build`.
Setting these two variables in a running container does not change its browser bundle.
