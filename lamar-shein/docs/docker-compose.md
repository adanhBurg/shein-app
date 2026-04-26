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

## Notes

The scanner works in Docker for the Morocco sample link. The Spain shared-cart link can still trigger SHEIN anti-bot behavior in a Linux container even though it works from the local Windows Playwright run. If this happens in production, run the backend outside Docker on a Windows host or use a browser environment/proxy that SHEIN does not challenge.
