import { spawn } from 'node:child_process';

const DEFAULT_DEVICE = 'iPhone 13';

function printUsage() {
  console.log(`
Usage:
  npm run shein:mobile -- <url> [--device "Pixel 5"]
  npm run shein:mobile -- --url-base64 <base64-url> [--device "Pixel 5"]

Examples:
  npm run shein:mobile -- "https://example.com/shared-cart"
  npm run shein:mobile -- "https://example.com/shared-cart" --device "Pixel 5"
`);
}

function parseArgs(argv) {
  const args = [...argv];
  let device = DEFAULT_DEVICE;
  let url = null;

  while (args.length > 0) {
    const arg = args.shift();

    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }

    if (arg === '--device') {
      device = args.shift();
      continue;
    }

    if (arg === '--url-base64') {
      url = Buffer.from(args.shift() ?? '', 'base64').toString('utf8');
      continue;
    }

    if (!url) {
      url = arg;
    }
  }

  return { url, device };
}

function validateUrl(value) {
  if (!value) {
    throw new Error('Missing URL.');
  }

  const parsed = new URL(value);

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https links can be opened.');
  }

  return parsed.toString();
}

const { url, device, help } = parseArgs(process.argv.slice(2));

if (help) {
  printUsage();
  process.exit(0);
}

let normalizedUrl;

try {
  normalizedUrl = validateUrl(url);
} catch (error) {
  console.error(error.message);
  printUsage();
  process.exit(1);
}

if (!device) {
  console.error('Missing value after --device.');
  printUsage();
  process.exit(1);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(
  npx,
  [
    '--yes',
    'playwright@latest',
    'open',
    '--browser=chromium',
    '--device',
    device,
    normalizedUrl,
  ],
  { stdio: 'inherit' },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
