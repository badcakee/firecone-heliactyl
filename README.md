![Heliactyl](https://github.com/OvernodeProjets/Heliactyl-fixed/assets/73477238/fe5aaf5c-1c01-4145-b37a-b91b184354b5)

<hr>


# Heliactyl v1.7 • The modern client panel for Pterodactyl


## Features

- Resource Management (Use it to create servers etc)
- Coins (Linkvertise earning and rewards)
- Renewal (Require coins for renewal)
- Coupons (which give resources & coins to a user)
- Servers (create, view, and edit servers)
- Login Queue (prevent overload)
- User System (auth, regen password, etc)
- Store (buy resources with coins)
- Dashboard (view resources)
- Join for Rewards (join Discord servers for coins)
- Admin (set/add/remove coins & resources, create/revoke coupons)
- API (for bots & other things)

## AI Development

This project is configured to use [Context7](https://github.com/upstash/context7) for AI-assisted development.
- **MCP Server**: `@upstash/context7-mcp` is installed as a dev dependency.
- **Rules**: Configuration files (`.cursorrules`, `.windsurfrules`, `CLAUDE.md`, `.github/copilot-instructions.md`) are set up to instruct AI agents to use Context7 for library documentation and code generation.

# Warning

We cannot force you to keep "Powered by Heliactyl" in the footer, but please consider keeping it. It helps to get more visibility for the project, which is getting better. We won't provide technical support for installations without the notice in the footer. We may DMCA the website under certain conditions.  
Please do keep the footer, though.

<hr>


# Install & Startup Guide (v1.7)

## Prerequisites
- Node.js 18+ (required by Express 5).
- PostgreSQL 12+ (set `database` in config.yml or `DATABASE_URL`).
- Pterodactyl panel domain + Application API key.

## 1. Configure Heliactyl
1. Copy config.example.yml → config.yml.
2. Update these fields in config.yml:
    - `website.port`, `website.secret`
    - `database` (Postgres URL)
    - `pterodactyl.domain`, `pterodactyl.key`, `pterodactyl.allowedNestId`
    - `api.client.oauth2.*` (Discord app credentials)
    - `api.client.coins.enabled` (enable coin features)

## 2. Install & Run

### Linux/macOS
```bash
npm install
npm start
```

### Windows (PowerShell)
```powershell
npm install
npm start
```

The app runs on http://localhost:2000 by default.

### Development mode
```bash
npm run dev
```

### Database migrations
```bash
npm run migrate
```

> On boot, the app runs `prisma db push --accept-data-loss` when a database URL is configured and applies a raw SQL patch for missing columns (see index.js).

### Pterodactyl deployment
Use the generic Node.js egg and set Node 18+ as the runtime version.

## Reverse Proxy (Nginx example)
```nginx
server {
    listen 80;
    server_name <domain>;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name <domain>;

    ssl_certificate /etc/letsencrypt/live/<domain>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<domain>/privkey.pem;
    ssl_session_cache shared:SSL:10m;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://localhost:<port>/;
        proxy_buffering off;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Running in background (PM2)
```bash
npm install -g pm2
pm2 start index.js --name "heliactyl"
pm2 save
```

## Assets & Themes
Static assets live in assets/ and theme templates live in themes/. The default theme references multiple vendor bundles, so keep assets/ intact when customizing.

## Troubleshooting

### `net::ERR_BLOCKED_BY_CLIENT` in the browser console

This message is emitted by the browser when an extension (most commonly an ad blocker or tracker blocker) actively blocks one of the dashboard's requests. The panel itself is still working—the browser is simply preventing a specific asset or third-party script from loading. Ask affected users to temporarily disable their content blocker for your Heliactyl domain or whitelist the blocked URL, and the warning will disappear.











