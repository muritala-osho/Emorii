const fs = require('fs');
const path = require('path');

const targets = [
  path.join(__dirname, '..', 'node_modules', '@expo', 'ngrok', 'src', 'client.js'),
];

const MARKER = '/* AFRO_NGROK_PATCHED */';

function patch(file) {
  if (!fs.existsSync(file)) return;
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes(MARKER)) return;

  const before = `} catch (error) {
      let clientError;
      try {
        const response = JSON.parse(error.response.body);
        clientError = new NgrokClientError(
          response.msg,
          error.response,
          response
        );
      } catch (e) {
        clientError = new NgrokClientError(
          error.response.body,
          error.response,
          error.response.body
        );
      }
      throw clientError;
    }`;

  const after = `} catch (error) {
      ${MARKER}
      if (!error || !error.response) {
        const e = new Error(
          "The legacy ngrok client bundled with Expo can no longer reach ngrok's servers. " +
          "Re-run with the modern WebSocket tunnel: " +
          "EXPO_FORCE_WEBCONTAINER_ENV=1 npx expo start --tunnel " +
          "(or use 'npm run tunnel' from this project)."
        );
        e.cause = error;
        throw e;
      }
      let clientError;
      try {
        const response = JSON.parse(error.response.body);
        clientError = new NgrokClientError(
          response.msg,
          error.response,
          response
        );
      } catch (e) {
        clientError = new NgrokClientError(
          error.response.body,
          error.response,
          error.response.body
        );
      }
      throw clientError;
    }`;

  if (!src.includes(before)) {
    console.warn('[patch-expo-ngrok] could not locate target block in', file);
    return;
  }

  src = src.replace(before, after);
  fs.writeFileSync(file, src);
  console.log('[patch-expo-ngrok] patched', path.relative(process.cwd(), file));
}

for (const f of targets) patch(f);
