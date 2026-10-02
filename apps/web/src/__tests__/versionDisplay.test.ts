import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const rootFile = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

describe('application version contracts', () => {
  it('uses package.json as the build-time version source', () => {
    const packageJson = JSON.parse(rootFile('package.json')) as { version: string };
    const nextConfig = rootFile('next.config.ts');

    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(nextConfig).toContain("import packageJson from './package.json'");
    expect(nextConfig).toContain('APP_VERSION: packageJson.version');
  });

  it('renders the injected version on the personal settings page', () => {
    const settingsPage = rootFile('src', 'app', '(app)', 'settings', 'page.tsx');

    expect(settingsPage).toContain("t('version', { version: process.env.APP_VERSION ?? 'dev' })");
  });

  it.each(['en', 'zh', 'zh-CN', 'jp'])('defines the version label in %s', (locale) => {
    const messages = JSON.parse(rootFile('src', 'i18n', 'messages', `${locale}.json`)) as {
      settings: { version?: string };
    };

    expect(messages.settings.version).toContain('{version}');
  });
});
