# Nanahoshi

A modern, fast, self-hosted, multi-tenant digital library server for managing books and audiobooks. Set up your own and share your collection.

<img width="2560" height="1290" alt="image" src="https://github.com/user-attachments/assets/5906821d-bd13-4e7f-b56a-b2e6e441b02a" />

## Local setup

Requirements: Bun 1.3.14, Docker and Docker Compose.

```bash
cp .env.example apps/server/.env
# Fill every REQUIRED value in apps/server/.env
bun install --frozen-lockfile
bun run infra:up
bun run db:migrate
bun run dev
```

The web application is available at `http://localhost:3001` and the API at
`http://localhost:3000` with the example defaults. The first account created on
a fresh installation becomes the instance administrator. Later registrations
require an invitation according to the configured policy.

Before upgrading, create and verify a backup. Recovery procedures and the
configuration reference are documented in [docs/operations.md](docs/operations.md).

## Contribution and attribution

<table>
    <tr>
        <td align="center">
            <a href="https://github.com/Natsume-197">
                <img src="https://avatars.githubusercontent.com/u/36428207?v=4" width="100;" alt="Natsume-197"/>
                <br />
                <sub><b>Natsume-197</b></sub>
            </a>
        </td>
    </tr>
</table>
