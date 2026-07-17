import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireEnv } from '@nexusdesk/utils';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULTS: Record<string, string> = {
  TURN_EXTERNAL_IP: '127.0.0.1',
  TURN_MIN_PORT: '49160',
  TURN_MAX_PORT: '49200',
  TURN_TLS_CERT_PATH: '/etc/coturn/certs/fullchain.pem',
  TURN_TLS_KEY_PATH: '/etc/coturn/certs/privkey.pem',
};

/**
 * Renders coturn.conf.template against process.env (falling back to
 * DEFAULTS) and writes the result to the given output path. Used by the
 * relay/coturn Docker image entrypoint at container start.
 */
function renderTemplate(templatePath: string, env: Record<string, string | undefined>): string {
  const template = readFileSync(templatePath, 'utf8');

  return template.replace(/\$\{([A-Z_]+)\}/g, (match, name: string) => {
    const value = env[name] ?? DEFAULTS[name];
    if (value === undefined) {
      throw new Error(`Missing value for coturn template variable: ${name}`);
    }
    return value;
  });
}

function main(): void {
  requireEnv('TURN_SHARED_SECRET');
  requireEnv('TURN_REALM');

  const templatePath = join(__dirname, '..', 'coturn.conf.template');
  const outputPath = process.env['COTURN_OUTPUT_PATH'] ?? join(__dirname, '..', 'turnserver.conf');

  const rendered = renderTemplate(templatePath, process.env);
  writeFileSync(outputPath, rendered, 'utf8');

  process.stdout.write(`coturn configuration written to ${outputPath}\n`);
}

main();
