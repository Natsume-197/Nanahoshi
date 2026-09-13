# Publish Nanahoshi 1.0.0

## 1. Validate the release commit

Commit the reviewed changes and push them to `master`. Wait for all four CI jobs
to pass: code checks, migrations, backend integration and Docker application.
Do not commit `.env` or local data.

To build and test the image locally from the repository root:

```sh
bun install --frozen-lockfile
docker build -t nanahoshi:ci .
bash scripts/ci-container-smoke.sh
```

Use Bun 1.4.0 and install Chrome or Chromium. The script detects the browser;
for a custom location, set `INSTALLATION_E2E_BROWSER` to the actual executable.
It checks this before starting containers. The smoke test creates and removes
its own database, Redis and application volumes. It checks setup, login, book
scanning and upload, covers, downloads, session persistence and process shutdown.
It does not touch your normal Compose installation.

To run that image manually, set `image: nanahoshi:ci` in a separate installation's
`docker-compose.yml`, prepare `.env` as in the [installation guide](installation.md),
then run `docker compose up -d` there.

## 2. Publish the GitHub release

On GitHub, open **Releases → Draft a new release**:

1. Create tag **v1.0.0**, targeting the tested commit on **master**.
2. Set the title to **Nanahoshi 1.0.0** and add the release notes.
3. Leave **pre-release** unchecked and publish the release.

The **Release Docker image** workflow builds the image, runs the installation
test and publishes that same image as:

- `ghcr.io/natsume-197/nanahoshi:v1.0.0`
- `ghcr.io/natsume-197/nanahoshi:latest`

It authenticates with the repository's `GITHUB_TOKEN`; no personal token needs
to be added. This release supports **Linux amd64**. Prereleases publish their
version tag without updating `latest`.

## 3. Make the first package public

After the first image push, open the **nanahoshi** package on your GitHub profile,
then **Package settings → Change visibility → Public**. New container packages
start private, even when the repository is public. See
[GitHub's container registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

The workflow's final step checks anonymous access. If it failed while the package
was private, make the package public and rerun the failed job.

## 4. Verify installation from the published image

From a new folder, save `docker-compose.yml` and `.env.example` from the **v1.0.0**
tag, rename the latter to `.env`, and fill its required values. Set the image to
`ghcr.io/natsume-197/nanahoshi:v1.0.0`, then:

```sh
docker compose pull
docker compose up -d --wait
docker compose ps
```

Open your configured `APP_URL` and create the administrator account.
Use `v1.0.1`, `v1.1.0`, etc. for later releases; keep published version tags unchanged.
