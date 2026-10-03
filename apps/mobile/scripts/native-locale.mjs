import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const tags = {
  en: ['en-US', 'en_US'],
  zh: ['zh-Hant-TW', 'zh_TW'],
  'zh-CN': ['zh-Hans-CN', 'zh_CN'],
  jp: ['ja-JP', 'ja_JP'],
};

/** Temporary OS-provided app locale; no JavaScript translation overrides. */
export function configureNativeLocale(platform, device, locale) {
  assert(Object.hasOwn(tags, locale), 'Unsupported acceptance locale');
  const [language, region] = tags[locale];
  const run = (command, args) =>
    execFileSync(command, args, {
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  if (platform === 'android') {
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    const adb = sdk ? join(sdk, 'platform-tools', 'adb') : 'adb';
    const command = (...args) => run(adb, ['-s', device, 'shell', 'cmd', 'locale', ...args]);
    const original = command('get-app-locales', 'host.exp.exponent').match(/are \[(.*)\]/)?.[1];
    assert(original !== undefined, 'Cannot read original Android app locale');
    command('set-app-locales', 'host.exp.exponent', '--locales', language);
    return () =>
      original
        ? command('set-app-locales', 'host.exp.exponent', '--locales', original)
        : command('set-app-locales', 'host.exp.exponent');
  }
  assert.equal(platform, 'ios');
  const command = (...args) => run('xcrun', ['simctl', 'spawn', device, 'defaults', ...args]);
  const read = (key) => {
    try {
      return command('read', 'host.exp.Exponent', key);
    } catch (error) {
      if (/does not exist|not found|Could not find key/.test(String(error.stderr)))
        return undefined;
      throw error;
    }
  };
  const languages = read('AppleLanguages');
  const regionBefore = read('AppleLocale');
  const restore = () => {
    if (languages === undefined) command('delete', 'host.exp.Exponent', 'AppleLanguages');
    else command('write', 'host.exp.Exponent', 'AppleLanguages', languages);
    if (regionBefore === undefined) command('delete', 'host.exp.Exponent', 'AppleLocale');
    else command('write', 'host.exp.Exponent', 'AppleLocale', '-string', regionBefore);
  };
  command('write', 'host.exp.Exponent', 'AppleLanguages', '-array', language);
  try {
    command('write', 'host.exp.Exponent', 'AppleLocale', '-string', region);
  } catch (error) {
    restore();
    throw error;
  }
  return restore;
}
