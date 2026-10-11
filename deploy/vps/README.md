# api.publisle.xyz — VPS runbook

The website talks to a tiny API for health status today and PDF export later.
Everything needed to provision the OVH VPS lives in this directory.

## Components

| File                   | Purpose                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `server.mjs`           | Zero-dependency Node 24 service: `GET /health`, `POST /pdf/compile` (503 until enabled) |
| `publisle-api.service` | systemd unit (locked down: `ProtectSystem=strict`, no capabilities)                     |
| `Caddyfile`            | Automatic HTTPS for `api.publisle.xyz`, reverse proxy to `127.0.0.1:8787`               |
| `install.sh`           | Idempotent provisioning: Node 24, Caddy, ufw (22/80/443), systemd                       |

## One-time setup

1. DNS: add an `A` (and `AAAA` if available) record `api.publisle.xyz` → the VPS IPv4/IPv6.
2. Copy this directory to the server and run:
   ```sh
   scp -r deploy/vps/* user@vps:/tmp/publisle-api/
   ssh user@vps
   sudo bash /tmp/publisle-api/install.sh
   ```
3. Verify: `curl https://api.publisle.xyz/health` → `{"status":"ok","services":{"pdf":false}}`.

The site consumes this via `PUBLIC_API_URL` (default `https://api.publisle.xyz`)
in `sites/www/src/lib/api.ts`. The playground shows an "API" status pill once
`PUBLIC_PDF_ENABLED=true` is set at build time.

## Enabling PDF later

The PDF service runs the Research CLI export (`publisle export --to pdf`) on
the VPS. When it lands:

1. Implement the handler behind `POST /pdf/compile` in `server.mjs` (or a
   supervised worker) honoring the site's `CompilePdfRequest` shape.
2. Set `PDF_ENABLED=true` in the systemd unit, `systemctl restart publisle-api`.
3. Set `PUBLIC_PDF_ENABLED=true` in the site workflow env and redeploy.

No site restructuring required — the client contract already exists.
