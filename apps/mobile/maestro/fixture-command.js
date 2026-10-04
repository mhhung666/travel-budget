/* global http, MAESTRO_CONTROL_URL, MAESTRO_CONTROL_TOKEN, COMMAND */
// Runs on the Maestro host, not the device. This is the disposable harness only.
const response = http.post(MAESTRO_CONTROL_URL + '/' + COMMAND, {
  headers: { Authorization: 'Bearer ' + MAESTRO_CONTROL_TOKEN },
  body: '',
});
if (response.status !== 200) throw new Error('Fixture command failed: ' + COMMAND);
// Only commands that end sessions must have ended at least one, or the scenario proves nothing.
if (['revoke-a', 'expire-a', 'revoke-writer', 'expire-writer'].includes(COMMAND)) {
  const count = JSON.parse(response.body).affectedSessions;
  if (!Number.isInteger(count) || count < 1)
    throw new Error('No active session was invalidated: ' + COMMAND);
}
