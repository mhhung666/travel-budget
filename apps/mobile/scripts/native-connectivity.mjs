import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/** Temporary emulator radio settings; restore the original state even after a failed flow. */
export function createNativeConnectivity(device) {
  assert(
    /^emulator-\d+$/.test(device),
    'Airplane mode control is limited to the acceptance emulator'
  );
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const adb = sdk ? join(sdk, 'platform-tools', 'adb') : 'adb';
  const shell = (...args) =>
    execFileSync(adb, ['-s', device, 'shell', ...args], {
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  let before;
  const restore = () => {
    if (!before) return;
    shell('cmd', 'connectivity', 'airplane-mode', before.airplane === '1' ? 'enable' : 'disable');
    shell('svc', 'wifi', before.wifi === '1' || before.wifi === '2' ? 'enable' : 'disable');
    shell('svc', 'data', before.data === '1' ? 'enable' : 'disable');
    before = undefined;
  };
  return {
    command(command) {
      if (command === 'native-radio-online') {
        restore();
        return { restored: true };
      }
      assert.equal(command, 'native-radio-offline', 'Unknown radio command');
      before ??= {
        airplane: shell('settings', 'get', 'global', 'airplane_mode_on'),
        wifi: shell('settings', 'get', 'global', 'wifi_on'),
        data: shell('settings', 'get', 'global', 'mobile_data'),
      };
      shell('cmd', 'connectivity', 'airplane-mode', 'enable');
      shell('svc', 'wifi', 'disable');
      shell('svc', 'data', 'disable');
      assert.equal(shell('settings', 'get', 'global', 'airplane_mode_on'), '1');
      return { airplane: true };
    },
    close: restore,
  };
}
