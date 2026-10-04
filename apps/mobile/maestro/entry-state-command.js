/* global http, MAESTRO_CONTROL_URL, MAESTRO_CONTROL_TOKEN, EXPECT_EXPENSES, EXPECT_RECEIPTS */
// Runs on the Maestro host, not the device: compares what the backend stored for the Writer trip
// with what the scenario expects. The disposable harness only; the app never sees this channel.
const response = http.post(MAESTRO_CONTROL_URL + '/entry-state', {
  headers: { Authorization: 'Bearer ' + MAESTRO_CONTROL_TOKEN },
  body: '',
});
if (response.status !== 200) throw new Error('Fixture command failed: entry-state');
const state = JSON.parse(response.body);
if (state.expenses !== Number(EXPECT_EXPENSES) || state.receipts !== Number(EXPECT_RECEIPTS))
  throw new Error('Backend holds an unexpected state: ' + JSON.stringify(state));
