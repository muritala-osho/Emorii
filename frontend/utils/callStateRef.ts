/**
 * Module-level shared call state — a plain mutable object that is updated by
 * VoiceCallScreen / VideoCallScreen and read by IncomingCallHandler.
 *
 * WHY NOT A REACT CONTEXT?
 * Socket event handlers in IncomingCallHandler run synchronously when a new
 * call:incoming event arrives. React context updates propagate asynchronously
 * through useState → useEffect → ref-sync cycles that can lag 200–400 ms
 * behind the actual clearCall() call in VoiceCallScreen. A plain module-level
 * object is updated synchronously at the point of the end-call action, so the
 * grace-window check in IncomingCallHandler always sees the freshest value.
 */
export const callStateRef = {
  /**
   * Unix timestamp (Date.now()) of the most recent local end-call action.
   * Set by VoiceCallScreen and VideoCallScreen on every path that clears the
   * active call (user hangup, remote hangup, engine disconnect, mic denied).
   * Read by IncomingCallHandler's busy-check to extend the false-busy grace
   * window for incoming calls that arrive immediately after a call ends.
   */
  lastCallEndedAt: 0,
};
