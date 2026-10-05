import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configureNativeDisplay } from './native-display.mjs';

test('iOS restores the exact appearance and accessibility size in reverse order', () => {
  const calls = [];
  const run = (_, args) => {
    const command = args.slice(3);
    calls.push(command);
    if (command.length === 1) return command[0] === 'appearance' ? 'dark' : 'extra-large';
    return '';
  };
  configureNativeDisplay('ios', 'device', { appearance: 'light', textSize: 'largest' }, run)();
  assert.deepEqual(calls.slice(-2), [
    ['content_size', 'extra-large'],
    ['appearance', 'dark'],
  ]);
  assert(calls.some((args) => args[1] === 'accessibility-extra-extra-extra-large'));
});

test('Android restores automatic appearance and an unset font scale without inventing defaults', () => {
  const calls = [];
  const run = (_, args) => {
    const command = args.slice(3);
    calls.push(command);
    if (command.join(' ') === 'cmd uimode night') return 'Night mode: auto';
    if (command.join(' ') === 'settings get system font_scale') return 'null';
    return '';
  };
  configureNativeDisplay('android', 'device', { appearance: 'dark', textSize: 'largest' }, run)();
  assert.deepEqual(calls.slice(-2), [
    ['settings', 'delete', 'system', 'font_scale'],
    ['cmd', 'uimode', 'night', 'auto'],
  ]);
});

test('a partial configuration failure rolls back both settings', () => {
  const calls = [];
  const run = (_, args) => {
    const command = args.slice(3);
    calls.push(command);
    if (command.length === 1) return command[0] === 'appearance' ? 'light' : 'large';
    if (command[1] === 'accessibility-extra-extra-extra-large') throw new Error('setting failed');
    return '';
  };
  assert.throws(
    () => configureNativeDisplay('ios', 'device', { appearance: 'dark', textSize: 'largest' }, run),
    /setting failed/
  );
  assert.deepEqual(calls.slice(-2), [
    ['content_size', 'large'],
    ['appearance', 'light'],
  ]);
});

test('restoration attempts all settings even when one fails', () => {
  const calls = [];
  const run = (_, args) => {
    const command = args.slice(3);
    calls.push(command);
    if (command.length === 1) return command[0] === 'appearance' ? 'light' : 'extra-large';
    if (command[1] === 'extra-large') throw new Error('restore failed');
    return '';
  };
  const restore = configureNativeDisplay(
    'ios',
    'device',
    { appearance: 'dark', textSize: 'default' },
    run
  );
  assert.throws(restore, AggregateError);
  assert.deepEqual(calls.at(-1), ['appearance', 'light']);
});
