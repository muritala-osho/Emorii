const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const https = require('https');
const crypto = require('crypto');
const querystring = require('querystring');
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const { encrypt, decrypt } = require('../utils/cryptoTokens');

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

// Sign OAuth state with HMAC so it cannot be forged. Format:
//   base64url( JSON({uid, n, e}) ) + "." + base64url( hmac )
// Falls back to JWT_SECRET so we don't need a new env var.
const STATE_SECRET = process.env.SPOTIFY_STATE_SECRET || process.env.JWT_SECRET;
if (!STATE_SECRET) {
  throw new Error('[spotify] SPOTIFY_STATE_SECRET (or JWT_SECRET) must be set. Refusing to start without a signing secret.');
}
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const signState = (userId) => {
  const payload = { uid: String(userId), n: crypto.randomBytes(16).toString('hex'), e: Date.now() + STATE_TTL_MS };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', STATE_SECRET).update(body).digest());
  return `${body}.${sig}`;
};

const verifyState = (state) => {
  if (typeof state !== 'string' || !state.includes('.')) return null;
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const expected = b64url(crypto.createHmac('sha256', STATE_SECRET).update(body).digest());
  // constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const json = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!json?.uid || !json?.e || Date.now() > json.e) return null;
    return json.uid;
  } catch {
    return null;
  }
};

const SPOTIFY_SCOPES = [
  'user-read-currently-playing',
  'user-read-recently-played',
  'user-top-read',
  'user-read-email',
  'user-read-private',
].join(' ');

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const options = { hostname, path, method: 'POST', headers };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    const options = { hostname, path, method: 'GET', headers };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function refreshSpotifyToken(user) {
  const refreshToken = decrypt(user.spotify?.refreshToken);
  if (!refreshToken) return null;
  const body = querystring.stringify({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const credentials = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const result = await httpsPost('accounts.spotify.com', '/api/token', {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(body),
  }, body);
  if (result.status === 200 && result.data.access_token) {
    const expiry = new Date(Date.now() + result.data.expires_in * 1000);
    await User.findByIdAndUpdate(user._id, {
      'spotify.accessToken': encrypt(result.data.access_token),
      'spotify.tokenExpiry': expiry,
      ...(result.data.refresh_token ? { 'spotify.refreshToken': encrypt(result.data.refresh_token) } : {}),
    });
    return result.data.access_token;
  }
  return null;
}

async function getValidAccessToken(user) {
  if (!user.spotify?.connected) return null;
  const now = new Date();
  const expiry = user.spotify.tokenExpiry ? new Date(user.spotify.tokenExpiry) : null;
  if (expiry && expiry > now && user.spotify.accessToken) {
    return decrypt(user.spotify.accessToken);
  }
  return await refreshSpotifyToken(user);
}

router.get('/auth-url', protect, async (req, res) => {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_REDIRECT_URI) {
    return res.status(503).json({ success: false, message: 'Spotify integration not configured' });
  }
  const state = signState(req.user._id);
  const params = querystring.stringify({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: SPOTIFY_SCOPES,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    state,
    show_dialog: 'true',
  });
  const authUrl = `https://accounts.spotify.com/authorize?${params}`;
  res.json({ success: true, authUrl });
});

router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.send('<html><body><script>window.location.href=\'emorii://spotify?error=oauth_error\';</script><p>Spotify connection failed. You can close this window.</p></body></html>');
  }
  if (!code || !state) {
    return res.status(400).send('<html><body><p>Invalid request. Please try again.</p></body></html>');
  }
  try {
    const userId = verifyState(state);
    if (!userId) {
      return res.status(400).send('<html><body><p>Invalid or expired state parameter. Please retry from the app.</p></body></html>');
    }
    const body = querystring.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
    });
    const credentials = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const tokenResult = await httpsPost('accounts.spotify.com', '/api/token', {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    }, body);

    if (tokenResult.status !== 200 || !tokenResult.data.access_token) {
      logger.error('Spotify token error:', tokenResult.data);
      return res.send('<html><body><p>Failed to connect Spotify. Please try again.</p></body></html>');
    }

    const { access_token, refresh_token, expires_in } = tokenResult.data;
    const tokenExpiry = new Date(Date.now() + expires_in * 1000);

    const profileResult = await httpsGet('api.spotify.com', '/v1/me', {
      'Authorization': `Bearer ${access_token}`,
    });

    const spotifyProfile = profileResult.data;

    await User.findByIdAndUpdate(userId, {
      'spotify.connected': true,
      'spotify.userId': spotifyProfile.id || '',
      'spotify.displayName': spotifyProfile.display_name || '',
      'spotify.accessToken': encrypt(access_token),
      'spotify.refreshToken': encrypt(refresh_token || ''),
      'spotify.tokenExpiry': tokenExpiry,
    });

    res.send(`
      <html>
        <head><meta charset="utf-8"><title>Spotify Connected</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:40px;background:#191414;color:#1DB954;">
          <h2>✅ Spotify Connected!</h2>
          <p style="color:#fff;">Your Spotify account has been linked successfully.</p>
          <p style="color:#aaa;font-size:14px;">You can now close this browser and return to the app.</p>
          <script>
            setTimeout(function() {
              window.location.href = 'emorii://spotify?success=true';
            }, 800);
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    logger.error('Spotify callback error:', err);
    res.status(500).send('<html><body><p>Server error. Please try again.</p></body></html>');
  }
});

router.delete('/disconnect', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      'spotify.connected': false,
      'spotify.userId': '',
      'spotify.displayName': '',
      'spotify.accessToken': '',
      'spotify.refreshToken': '',
      'spotify.tokenExpiry': null,
    });
    res.json({ success: true, message: 'Spotify disconnected' });
  } catch (err) {
    logger.error('Spotify disconnect error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/search', protect, async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) {
    return res.status(400).json({ success: false, message: 'Search query required' });
  }
  try {
    const user = await User.findById(req.user._id).select('spotify');
    const accessToken = await getValidAccessToken(user);
    if (!accessToken) {
      return res.status(401).json({ success: false, message: 'Spotify not connected or token expired' });
    }
    // market:'from_token' uses the user's own Spotify country instead of
    // hard-coding 'US', which caused 403/empty results for non-US accounts.
    const searchPath = `/v1/search?${querystring.stringify({ q: q.trim(), type: 'track', limit: 10, market: 'from_token' })}`;
    const result = await httpsGet('api.spotify.com', searchPath, {
      'Authorization': `Bearer ${accessToken}`,
    });
    if (result.status !== 200) {
      logger.error('Spotify search API error:', result.status, result.data);
      const msg = result.data?.error?.message || 'Spotify search failed';
      return res.status(result.status).json({ success: false, message: msg });
    }
    const tracks = (result.data.tracks?.items || []).map((track) => ({
      id: track.id,
      title: track.name,
      artist: track.artists?.map((a) => a.name).join(', ') || '',
      album: track.album?.name || '',
      albumArt: track.album?.images?.[0]?.url || '',
      spotifyUri: track.uri,
      previewUrl: track.preview_url || '',
    }));
    res.json({ success: true, tracks });
  } catch (err) {
    logger.error('Spotify search error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/set-song', protect, async (req, res) => {
  const { title, artist, spotifyUri, albumArt, previewUrl } = req.body;
  if (!title) {
    return res.status(400).json({ success: false, message: 'Song title required' });
  }
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        favoriteSong: {
          title: title.trim(),
          artist: (artist || '').trim(),
          spotifyUri: spotifyUri || '',
          albumArt: albumArt || '',
          previewUrl: previewUrl || '',
        },
      },
      { new: true }
    ).select('favoriteSong spotify');
    res.json({ success: true, favoriteSong: updatedUser.favoriteSong });
  } catch (err) {
    logger.error('Set song error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/track/:trackId', protect, async (req, res) => {
  const { trackId } = req.params;
  if (!trackId) {
    return res.status(400).json({ success: false, message: 'Track ID required' });
  }
  try {
    const user = await User.findById(req.user._id).select('spotify');
    const accessToken = await getValidAccessToken(user);
    if (!accessToken) {
      return res.status(401).json({ success: false, message: 'Spotify not connected or token expired' });
    }
    const result = await httpsGet('api.spotify.com', `/v1/tracks/${trackId}`, {
      'Authorization': `Bearer ${accessToken}`,
    });
    if (result.status !== 200) {
      return res.status(result.status).json({ success: false, message: 'Failed to fetch track' });
    }
    const track = result.data;
    res.json({
      success: true,
      track: {
        id: track.id,
        title: track.name,
        artist: track.artists?.map((a) => a.name).join(', ') || '',
        album: track.album?.name || '',
        albumArt: track.album?.images?.[0]?.url || '',
        spotifyUri: track.uri,
        previewUrl: track.preview_url || '',
      },
    });
  } catch (err) {
    logger.error('Spotify track fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('spotify favoriteSong');
    res.json({
      success: true,
      connected: user?.spotify?.connected || false,
      displayName: user?.spotify?.displayName || '',
      favoriteSong: user?.favoriteSong || null,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
