import { openSheinSession } from '../server/sheinCartScanner.mjs';

function printUsage() {
  console.log(`
Usage:
  npm run shein:session -- --country ES
  npm run shein:session -- --url "https://m.shein.com/es/cart/share/landing?..."
  npm run shein:session -- --country ES --headless --remote-debugging-port 9222

Notes:
  - Default mode opens a headed Chromium browser with the persistent SHEIN profile.
  - Use --headless with --remote-debugging-port on a server without a desktop.
  - Press Ctrl+C after the SHEIN verification/session is ready.
`);
}

function parseArgs(argv) {
  const result = {
    country: 'ES',
    url: '',
    headless: false,
    remoteDebuggingPort: 0,
  };
  const args = [...argv];

  while (args.length > 0) {
    const arg = args.shift();

    if (arg === '--help' || arg === '-h') return { ...result, help: true };

    if (arg === '--country') {
      result.country = args.shift() || result.country;
      continue;
    }

    if (arg === '--url') {
      result.url = args.shift() || '';
      continue;
    }

    if (arg === '--headless') {
      result.headless = true;
      continue;
    }

    if (arg === '--remote-debugging-port') {
      result.remoteDebuggingPort = Number(args.shift() || 0);
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  return result;
}

try {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  await openSheinSession(args);
} catch (error) {
  console.error(error?.message || String(error));
  printUsage();
  process.exit(1);
}
