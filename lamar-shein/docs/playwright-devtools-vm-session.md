# Playwright DevTools VM Session Runbook

This documents how we connected a Playwright Chromium session running inside the VM/backend container to Chrome DevTools on the local machine.

Use this when SHEIN shows a CAPTCHA or verification page and the backend needs its persistent Playwright profile refreshed.

## What Is Happening

The backend scanner stores the Playwright browser profile in Docker volume storage:

```txt
/data/playwright
```

That folder is mounted from the `shein-playwright-data` Docker volume. It can contain browser cookies/session data, so treat it like sensitive runtime data. Do not commit it to git.

The debug connection path is:

```txt
local browser
  -> localhost:9222 on your laptop
  -> SSH tunnel
  -> localhost:9222 on the VM
  -> Docker port mapping
  -> backend container port 9222
  -> Playwright Chromium remote debugging endpoint
```

## Prerequisites On A New VM

Install the normal deployment requirements:

- Git
- Docker
- Docker Compose plugin
- SSH access from your local machine to the VM

Clone the repo on the VM:

```bash
git clone <repo-url> shein
cd shein
```

Build and start the app:

```bash
docker compose up -d --build
```

Check that the backend is healthy:

```bash
docker compose ps
```

## Start The SHEIN Session On The VM

From the repo root on the VM:

```bash
docker compose exec backend npm run shein:session -- --country ES --headless --remote-debugging-port 9222
```

Keep this command running.

What this does:

- Opens a persistent Playwright Chromium profile for Spain (`ES`).
- Runs headless, so it works on a VM without a desktop.
- Exposes Chromium remote debugging on container port `9222`.
- Reuses `/data/playwright/shein-es-profile`.

For Morocco, use:

```bash
docker compose exec backend npm run shein:session -- --country MA --headless --remote-debugging-port 9222
```

For a specific SHEIN URL:

```bash
docker compose exec backend npm run shein:session -- --url "https://m.shein.com/es/" --headless --remote-debugging-port 9222
```

## Open The SSH Tunnel From Your Local Machine

On your local machine, open a separate terminal:

```bash
ssh -L 9222:127.0.0.1:9222 <vm-user>@<vm-public-ip>
```

Example shape:

```bash
ssh -L 9222:127.0.0.1:9222 ubuntu@203.0.113.10
```

If you use an SSH key:

```bash
ssh -i ~/.ssh/<key-file> -L 9222:127.0.0.1:9222 <vm-user>@<vm-public-ip>
```

Keep this SSH session open while using DevTools.

## Open DevTools Locally

On your local machine, open:

```txt
http://127.0.0.1:9222
```

If the page does not show targets, open:

```txt
http://127.0.0.1:9222/json/list
```

Then open the `devtoolsFrontendUrl` or the SHEIN page target shown by Chrome.

In DevTools:

1. Select the SHEIN page target.
2. Use the page preview/screencast if it appears.
3. Complete the SHEIN verification or CAPTCHA.
4. Wait until SHEIN loads normally.

When the session is accepted, go back to the VM terminal running `npm run shein:session` and press:

```txt
Ctrl+C
```

The browser closes, but the accepted session remains in the Docker volume for the backend scanner to reuse.

## Test After Refreshing

Run the app normally:

```bash
docker compose up -d
```

Watch backend logs:

```bash
docker compose logs -f backend
```

Submit a customer order with a SHEIN shared cart link. The frontend calls:

```txt
POST /api/shein-cart-preview
```

The backend should reuse the refreshed Playwright profile and avoid the verification error.

## Moving To Another VM

You have two options.

### Option 1: Recreate The Session

This is simplest and safest.

1. Deploy the repo on the new VM.
2. Run the `shein:session` command on the new VM.
3. Open the SSH tunnel from your local machine.
4. Complete SHEIN verification in local DevTools.

### Option 2: Copy The Docker Profile Volume

Use this only if you intentionally want to move the existing browser session. The archive may contain cookies/session data.

On the old VM, find the volume name:

```bash
docker volume ls | grep shein-playwright-data
```

Export it:

```bash
docker run --rm -v <volume-name>:/data -v "$PWD":/backup alpine tar czf /backup/shein-playwright-data.tgz -C /data .
```

Copy the archive to your local machine or directly to the new VM:

```bash
scp <vm-user>@<old-vm-ip>:/path/to/shein/shein-playwright-data.tgz .
scp shein-playwright-data.tgz <vm-user>@<new-vm-ip>:/path/to/shein/
```

On the new VM, start the stack once so Docker creates the volume:

```bash
docker compose up -d --build
docker compose down
```

Find the new volume:

```bash
docker volume ls | grep shein-playwright-data
```

Import the archive:

```bash
docker run --rm -v <new-volume-name>:/data -v "$PWD":/backup alpine sh -c "rm -rf /data/* && tar xzf /backup/shein-playwright-data.tgz -C /data"
```

Start the stack again:

```bash
docker compose up -d
```

## Troubleshooting

If `http://127.0.0.1:9222` does not load locally:

- Confirm the `shein:session` command is still running on the VM.
- Confirm the SSH tunnel terminal is still open.
- Confirm Docker mapped the debug port:

```bash
docker compose ps
```

If local port `9222` is already in use, use another local port while keeping the VM side as `9222`:

```bash
ssh -L 9333:127.0.0.1:9222 <vm-user>@<vm-public-ip>
```

Then open:

```txt
http://127.0.0.1:9333
```

If SHEIN still shows verification after refreshing:

- Repeat the session refresh for the correct country (`ES`, `MA`, or URL-specific).
- Make sure you pressed `Ctrl+C` only after the verification was fully accepted.
- Check that the backend is using the same Docker volume and has not been recreated under a different Compose project name.

## Security Notes

- Keep the debug port bound to localhost on the VM. The compose file defaults to `127.0.0.1`.
- Do not run `SHEIN_DEBUG_BIND=0.0.0.0` on a public VM unless it is protected by firewall rules.
- Do not commit `.cache`, Playwright profiles, exported volume archives, screenshots, or scan output.
- Delete `shein-playwright-data.tgz` after migration if you no longer need it.
