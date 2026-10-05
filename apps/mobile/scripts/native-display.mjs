import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const execute = (command, args) =>
  execFileSync(command, args, {
    encoding: 'utf8',
    timeout: 15000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** Change only requested simulator settings, returning a restoration for the original values. */
export function configureNativeDisplay(platform, device, settings, run = execute) {
  assert(['ios', 'android'].includes(platform), 'Unsupported platform');
  const { appearance, textSize } = settings;
  assert(!appearance || ['light', 'dark'].includes(appearance), 'Use --appearance light|dark');
  assert(!textSize || ['default', 'largest'].includes(textSize), 'Use --text-size default|largest');
  const undo = [];
  const restore = () => {
    const errors = [];
    for (const action of undo.toReversed()) {
      try {
        action();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, 'Unable to restore simulator display');
  };
  try {
    if (platform === 'ios') {
      const ui = (...args) => run('xcrun', ['simctl', 'ui', device, ...args]);
      if (appearance) {
        const before = ui('appearance');
        undo.push(() => ui('appearance', before));
        ui('appearance', appearance);
      }
      if (textSize) {
        const before = ui('content_size');
        undo.push(() => ui('content_size', before));
        ui(
          'content_size',
          textSize === 'largest' ? 'accessibility-extra-extra-extra-large' : 'large'
        );
      }
    } else {
      const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
      const adb = sdk ? join(sdk, 'platform-tools', 'adb') : 'adb';
      const shell = (...args) => run(adb, ['-s', device, 'shell', ...args]);
      if (appearance) {
        const before = shell('cmd', 'uimode', 'night').match(
          /Night mode: (yes|no|auto|custom)/
        )?.[1];
        assert(before, 'Cannot read original Android appearance');
        undo.push(() => shell('cmd', 'uimode', 'night', before));
        shell('cmd', 'uimode', 'night', appearance === 'dark' ? 'yes' : 'no');
      }
      if (textSize) {
        const before = shell('settings', 'get', 'system', 'font_scale');
        assert(before === 'null' || Number(before) > 0, 'Cannot read original Android text size');
        undo.push(() =>
          before === 'null'
            ? shell('settings', 'delete', 'system', 'font_scale')
            : shell('settings', 'put', 'system', 'font_scale', before)
        );
        shell('settings', 'put', 'system', 'font_scale', textSize === 'largest' ? '2.0' : '1.0');
      }
    }
  } catch (error) {
    restore();
    throw error;
  }
  return restore;
}
