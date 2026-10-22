// Runs the Convex CLI with the right deploy key from .env.local.
//   node scripts/convex.mjs dev     → npx convex dev    (CONVEX_DEPLOY_KEY_DEV)
//   node scripts/convex.mjs deploy  → npx convex deploy (CONVEX_DEPLOY_KEY_PROD)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const target = process.argv[2];
const extraArgs = process.argv.slice(3);
const keyName = { dev: 'CONVEX_DEPLOY_KEY_DEV', deploy: 'CONVEX_DEPLOY_KEY_PROD' }[target];

if (!keyName) {
  console.error('Usage: node scripts/convex.mjs <dev|deploy> [convex args]');
  process.exit(1);
}

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const key = process.env[keyName] ?? '';
if (!key || key.includes('TAYTA_TAHAN')) {
  console.error(`${keyName} puuttuu tiedostosta .env.local (katso .env.example).`);
  process.exit(1);
}

// The Convex CLI reads only CONVEX_DEPLOY_KEY; never print it.
const env = { ...process.env, CONVEX_DEPLOY_KEY: key };
delete env.CONVEX_DEPLOYMENT;
const result = spawnSync('npx', ['convex', target, ...extraArgs], { stdio: 'inherit', env });
process.exit(result.status ?? 1);
