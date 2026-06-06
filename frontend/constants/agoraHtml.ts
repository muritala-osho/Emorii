export const AGORA_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agora Call Bridge</title>
  <script src="https://download.agora.io/sdk/release/AgoraRTC_N-4.20.0.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #000; overflow: hidden; }
    #local-video {
      position: absolute;
      bottom: 120px;
      right: 12px;
      width: 110px;
      height: 150px;
      z-index: 20;
      border-radius: 14px;
      overflow: hidden;
      border: 2px solid rgba(255,255,255,0.35);
      box-shadow: 0 4px 16px rgba(0,0,0,0.6);
      touch-action: none;
      cursor: grab;
      will-change: transform;
      -webkit-user-select: none;
      user-select: none;
    }
    #local-video:active { cursor: grabbing; }
    #local-video.switching {
      opacity: 0.45;
      transition: opacity 0.15s ease;
    }
    #remote-video {
      width: 100vw;
      height: 100vh;
      object-fit: cover;
      position: absolute;
      top: 0;
      left: 0;
    }
  </style>
</head>
<body>
  <div id="remote-video"></div>
  <div id="local-video"></div>
<script>
  var client = null;
  var localAudioTrack = null;
  var localVideoTrack = null;
  var joined = false;
  var callType = 'voice';
  var currentFacingMode = 'user';

  /* ── Draggable local video with snap-to-corner ── */
  (function() {
    var el = document.getElementById('local-video');
    var startX = 0, startY = 0, origLeft = 0, origTop = 0;
    var isDragging = false;
    var MARGIN = 12;

    function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }

    function snapToCorner() {
      var W = window.innerWidth;
      var H = window.innerHeight;
      var rect = el.getBoundingClientRect();
      var cx = rect.left + rect.width  / 2;
      var cy = rect.top  + rect.height / 2;
      var goRight  = cx > W / 2;
      var goBottom = cy > H / 2;
      var targetLeft = goRight  ? (W - el.offsetWidth  - MARGIN) : MARGIN;
      var targetTop  = goBottom ? (H - el.offsetHeight - MARGIN) : (MARGIN + 56);
      el.style.transition = 'left 0.22s cubic-bezier(0.25,0.46,0.45,0.94), top 0.22s cubic-bezier(0.25,0.46,0.45,0.94)';
      el.style.left = targetLeft + 'px';
      el.style.top  = targetTop  + 'px';
      setTimeout(function() { el.style.transition = ''; }, 250);
    }

    el.addEventListener('touchstart', function(e) {
      if (e.touches.length !== 1) return;
      isDragging = true;
      var t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      var rect = el.getBoundingClientRect();
      origLeft = rect.left;
      origTop  = rect.top;
      el.style.right  = 'auto';
      el.style.bottom = 'auto';
      el.style.transition = '';
      el.style.left = origLeft + 'px';
      el.style.top  = origTop  + 'px';
      e.preventDefault();
    }, { passive: false });

    el.addEventListener('touchmove', function(e) {
      if (!isDragging || e.touches.length !== 1) return;
      var t = e.touches[0];
      var newLeft = clamp(origLeft + t.clientX - startX, 0, window.innerWidth  - el.offsetWidth);
      var newTop  = clamp(origTop  + t.clientY - startY, 0, window.innerHeight - el.offsetHeight);
      el.style.left = newLeft + 'px';
      el.style.top  = newTop  + 'px';
      e.preventDefault();
    }, { passive: false });

    el.addEventListener('touchend', function() {
      if (!isDragging) return;
      isDragging = false;
      snapToCorner();
    });
  })();

  function postToNative(data) {
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }
    } catch (e) {}
  }

  async function joinChannel(appId, channel, token, uid, type) {
    try {
      callType = type || 'voice';
      client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

      client.on('user-published', async function(user, mediaType) {
        await client.subscribe(user, mediaType);
        if (mediaType === 'audio') {
          user.audioTrack && user.audioTrack.play();
          postToNative({ type: 'remote-user-joined', uid: user.uid });
        }
        if (mediaType === 'video' && callType === 'video') {
          user.videoTrack && user.videoTrack.play('remote-video');
          postToNative({ type: 'remote-video-started', uid: user.uid });
        }
      });

      client.on('user-unpublished', function(user, mediaType) {
        if (mediaType === 'video') {
          postToNative({ type: 'remote-video-stopped', uid: user.uid });
        }
      });

      client.on('user-left', function(user) {
        postToNative({ type: 'remote-user-left', uid: user.uid });
      });

      client.on('connection-state-change', function(curState) {
        postToNative({ type: 'connectionState', state: curState });
      });

      await client.join(appId, channel, token || null, uid || 0);
      joined = true;

      var audioConfig = {
        encoderConfig: {
          sampleRate: 48000,
          stereo: false,
          bitrate: 64,
        },
        AEC: true, ANS: true, AGC: true,
      };

      if (callType === 'video') {
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack(audioConfig);
        localVideoTrack = await AgoraRTC.createCameraVideoTrack({
          facingMode: currentFacingMode, encoderConfig: '720p_1'
        });
        localVideoTrack.play('local-video');
        await client.publish([localAudioTrack, localVideoTrack]);
        postToNative({ type: 'local-video-started' });
      } else {
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack(audioConfig);
        await client.publish([localAudioTrack]);
      }

      postToNative({ type: 'joined', uid: client.uid });
    } catch (e) {
      postToNative({ type: 'error', message: e.message || 'Failed to join channel' });
    }
  }

  async function leaveChannel() {
    try {
      if (localAudioTrack) { localAudioTrack.stop(); localAudioTrack.close(); localAudioTrack = null; }
      if (localVideoTrack) { localVideoTrack.stop(); localVideoTrack.close(); localVideoTrack = null; }
      if (client && joined) { await client.leave(); }
      joined = false;
      postToNative({ type: 'left' });
    } catch (e) {
      postToNative({ type: 'error', message: e.message || 'Failed to leave channel' });
    }
  }

  async function switchCamera() {
    if (!localVideoTrack || callType !== 'video') return;
    try {
      currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
      var track = localVideoTrack.getMediaStreamTrack();
      if (track) {
        await track.applyConstraints({ facingMode: currentFacingMode });
        postToNative({ type: 'cameraSwitched', facingMode: currentFacingMode });
        return;
      }
    } catch (e) {}
    try {
      localVideoTrack.stop(); localVideoTrack.close(); localVideoTrack = null;
      await client.unpublish();
      localVideoTrack = await AgoraRTC.createCameraVideoTrack({
        facingMode: currentFacingMode, encoderConfig: '720p_1'
      });
      localVideoTrack.play('local-video');
      await client.publish([localAudioTrack, localVideoTrack]);
      postToNative({ type: 'cameraSwitched', facingMode: currentFacingMode });
    } catch (e) {
      postToNative({ type: 'error', message: 'Camera switch failed: ' + e.message });
    }
  }

  async function setSpeaker(on) {
    try {
      var devices = await AgoraRTC.getPlaybackDevices();
      if (!devices || devices.length === 0) return;
      var speaker = devices.find(function(d) {
        return on
          ? (d.label.toLowerCase().includes('speaker') || d.label.toLowerCase().includes('phone'))
          : (d.label.toLowerCase().includes('earpiece') || d.label.toLowerCase().includes('receiver'));
      });
      var target = speaker || devices[0];
      if (client) {
        client.remoteUsers.forEach(function(u) {
          if (u.audioTrack) {
            u.audioTrack.setPlaybackDevice(target.deviceId).catch(function() {});
          }
        });
      }
    } catch (e) {}
  }

  function handleMessage(event) {
    try {
      var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (!data || !data.action) return;
      switch (data.action) {
        case 'join':    joinChannel(data.appId, data.channel, data.token, data.uid, data.callType); break;
        case 'leave':   leaveChannel(); break;
        case 'mute':    if (localAudioTrack) localAudioTrack.setMuted(data.muted === true); break;
        case 'camera':  if (localVideoTrack) localVideoTrack.setMuted(data.off === true); break;
        case 'switch-camera': switchCamera(); break;
        case 'speaker': setSpeaker(data.on === true); break;
        default: break;
      }
    } catch (e) {
      postToNative({ type: 'error', message: 'Message parse error: ' + e.message });
    }
  }

  window.addEventListener('message', handleMessage);
  document.addEventListener('message', handleMessage);
</script>
</body>
</html>`;
