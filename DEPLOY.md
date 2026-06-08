# Deployment guide — revcolevschi.fr

## Prerequisites

- Docker and Docker Compose installed on the VPS
- DNS: `revcolevschi.fr` and `www.revcolevschi.fr` must point to the VPS IP (A records)
- Port 80 and 443 open in the VPS firewall

## First-time setup

**1. Create the `.env` file from the example:**

```bash
cp .env.example .env
```

Edit `.env` and replace every placeholder with real values:

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | Password for the `predictor_user` PostgreSQL account. Use `openssl rand -base64 32`. |
| `AUTH_SECRET` | Secret used to sign JWT tokens. Use `openssl rand -base64 48`. |
| `FOOTBALL_API_KEY` | Your football data API key. |
| `NODE_ENV` | Set to `production` on the VPS. |

> **Security note:** The database was previously exposed on port 5432 with the default password
> `predictor_password`. If the VPS was publicly reachable during that time, treat that password
> as compromised — change `POSTGRES_PASSWORD` in `.env`, then recreate the db container:
> `docker compose up -d --build db`. PostgreSQL will re-read the env var and update the password
> on first start if the data volume is wiped, or you can change it manually with `psql`.

**2. Start the stack:**

```bash
docker compose up -d --build
```

Caddy will automatically obtain a Let's Encrypt certificate for `revcolevschi.fr` and
`www.revcolevschi.fr` on first start (requires DNS to be propagated and ports 80/443 open).

## Day-to-day operations

```bash
# Rebuild and restart everything (e.g. after a code change)
docker compose up -d --build

# Restart a single service without rebuilding
docker compose restart backend

# View all logs (follow)
docker compose logs -f

# Check that the TLS certificate was obtained
docker compose logs caddy

# Stop everything (data is preserved in the postgres_data volume)
docker compose down
```

## Architecture

```
Internet
   │  443 / 80
   ▼
 Caddy  (TLS termination, Let's Encrypt)
   │  :80 (internal)
   ▼
 nginx  (frontend container)
   ├── /api/*  ──►  backend:3001
   └── /*      ──►  React SPA (static files)
                         │
                    backend:3001
                         │
                    db:5432 (PostgreSQL, internal only)
```

All inter-service communication happens on the internal Docker network.
Only Caddy is reachable from the internet (ports 80 and 443).
