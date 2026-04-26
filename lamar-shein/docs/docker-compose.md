# Docker Compose Deployment

This stack runs the React frontend and the Playwright scanner backend together.

From the repository root:

```bash
docker compose up -d --build
```

Open:

```txt
http://localhost:8181
```

If port `8181` is already in use:

```bash
FRONTEND_PORT=8282 docker compose up -d --build
```

## Services

- `frontend`: Nginx serving the built React app.
- `backend`: Node.js scanner API with Playwright Chromium installed.
- `shein-playwright-data`: Docker volume that keeps SHEIN browser sessions and scan cache across container restarts.

The frontend proxies:

```txt
/api/shein-cart-preview -> backend:8787/api/shein-cart-preview
```

So the React app can keep using the same relative API URL.

## Useful Commands

```bash
docker compose ps
docker compose logs -f backend
docker compose down
```

## Port 80

The frontend uses port `8181` by default. To expose the site on normal HTTP port `80`:

```bash
FRONTEND_PORT=80 docker compose up -d --build
```

## Notes

The scanner uses a persistent Playwright profile in `/data/playwright`. This is important for Spain links because SHEIN can challenge a brand-new Linux container browser after repeated reads.

Successful scans are cached by shared-cart identity, so repeated orders for the same link do not hit SHEIN again. The backend also spaces repeated scans for the same link.

## Refresh the Spain SHEIN Session

If Spain links start returning a verification or CAPTCHA error, refresh the persistent session.

From the VM:

```bash
docker compose exec backend npm run shein:session -- --country ES --headless --remote-debugging-port 9222
```

On your local machine, open an SSH tunnel to the VM:

```bash
ssh -L 9222:127.0.0.1:9222 hnada6885@34.30.155.206
```

Then open this locally:

```txt
http://127.0.0.1:9222
```

Open the SHEIN page target. If Chrome DevTools shows a screencast/preview button, use it to interact with the page and complete SHEIN verification. When the page is accepted, press `Ctrl+C` in the `shein:session` command. The backend will reuse the saved profile on future scans.

If your VM has a desktop/X11 session, you can run a visible browser instead:

```bash
docker compose exec backend npm run shein:session -- --country ES
```
