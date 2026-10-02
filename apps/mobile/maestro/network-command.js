/* global http, MAESTRO_NETWORK_URL, MAESTRO_NETWORK_TOKEN, COMMAND */
const response = http.post(MAESTRO_NETWORK_URL + '/__network/' + COMMAND, {
  headers: { Authorization: 'Bearer ' + MAESTRO_NETWORK_TOKEN },
  body: '',
});
if (response.status !== 200) throw new Error('Network command failed: ' + COMMAND);
