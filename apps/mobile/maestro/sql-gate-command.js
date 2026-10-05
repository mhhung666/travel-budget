/* global http, MAESTRO_SQL_GATE_URL, MAESTRO_SQL_GATE_TOKEN, COMMAND */
// Host control only. The instrumented native SQLite wrapper contains no control credential.
const response = http.post(MAESTRO_SQL_GATE_URL + '/__gate/' + COMMAND, {
  headers: { Authorization: 'Bearer ' + MAESTRO_SQL_GATE_TOKEN },
  body: '',
});
if (response.status !== 200) throw new Error('Native SQLite gate failed: ' + COMMAND);
