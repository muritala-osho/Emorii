/**
 * expo-av → expo-audio + expo-video compatibility shim.
 *
 * Re-exports an `Audio` namespace, `Video` component, `ResizeMode`, and
 * `InterruptionMode*` enums whose surface matches the subset of expo-av the
 * rest of the codebase depends on, but which is implemented on top of
 * expo-audio (~55) and expo-video (~55). The goal is a drop-in replacement so
 * each call site only needs its `import { ... } from "expo-av"` swapped to
 * `import { ... } from "@/utils/expoAvCompat"`.
 */
import React, { useEffect, useRef } from "react";
import { StyleProp, ViewStyle } from "react-native";
import {
  AudioPlayer,
  AudioRecorder,
  AudioStatus,
  RecordingPresets,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync as expoAudioSetAudioModeAsync,
} from "expo-audio";
import { VideoView, useVideoPlayer } from "expo-video";

/* ─────────────────────────────────────────────────────────────────────────── */
/* InterruptionMode enums (string-valued for expo-audio's `interruptionMode`). */
/* ─────────────────────────────────────────────────────────────────────────── */

export const InterruptionModeIOS = {
  MixWithOthers: "mixWithOthers" as const,
  DoNotMix: "doNotMix" as const,
  DuckOthers: "duckOthers" as const,
};

export const InterruptionModeAndroid = {
  DoNotMix: "doNotMix" as const,
  DuckOthers: "duckOthers" as const,
};

/* ─────────────────────────────────────────────────────────────────────────── */
/* ResizeMode (mirrors expo-av strings; mapped to expo-video's contentFit).    */
/* ─────────────────────────────────────────────────────────────────────────── */

export const ResizeMode = {
  CONTAIN: "contain" as const,
  COVER: "cover" as const,
  STRETCH: "stretch" as const,
};

type ResizeModeValue = "contain" | "cover" | "stretch";

const resizeModeToContentFit = (
  m: ResizeModeValue | string | undefined,
): "contain" | "cover" | "fill" => {
  switch (m) {
    case "cover":
      return "cover";
    case "stretch":
      return "fill";
    case "contain":
    default:
      return "contain";
  }
};

/* ─────────────────────────────────────────────────────────────────────────── */
/* setAudioModeAsync — translate expo-av field names to expo-audio.            */
/* ─────────────────────────────────────────────────────────────────────────── */

type LegacyAudioMode = {
  playsInSilentModeIOS?: boolean;
  allowsRecordingIOS?: boolean;
  staysActiveInBackground?: boolean;
  playThroughEarpieceAndroid?: boolean;
  shouldDuckAndroid?: boolean;
  interruptionModeIOS?: string;
  interruptionModeAndroid?: string;
  // Allow any newer expo-audio fields to pass through unchanged.
  [k: string]: any;
};

const translateAudioMode = (mode: LegacyAudioMode): Record<string, any> => {
  const out: Record<string, any> = {};

  if (mode.playsInSilentModeIOS !== undefined)
    out.playsInSilentMode = mode.playsInSilentModeIOS;
  if (mode.allowsRecordingIOS !== undefined)
    out.allowsRecording = mode.allowsRecordingIOS;
  if (mode.staysActiveInBackground !== undefined)
    out.shouldPlayInBackground = mode.staysActiveInBackground;
  if (mode.playThroughEarpieceAndroid !== undefined)
    out.shouldRouteThroughEarpiece = mode.playThroughEarpieceAndroid;

  // Unify both legacy interruption mode fields into expo-audio's single
  // `interruptionMode`. iOS takes precedence if both are provided.
  const interruption =
    mode.interruptionModeIOS ?? mode.interruptionModeAndroid;
  if (interruption !== undefined) {
    out.interruptionMode = interruption;
  } else if (mode.shouldDuckAndroid) {
    // Approximate the legacy `shouldDuckAndroid: true` behavior.
    out.interruptionMode = "duckOthers";
  }

  // Pass through any keys we didn't explicitly translate (forward-compatible).
  for (const k of Object.keys(mode)) {
    if (
      k === "playsInSilentModeIOS" ||
      k === "allowsRecordingIOS" ||
      k === "staysActiveInBackground" ||
      k === "playThroughEarpieceAndroid" ||
      k === "shouldDuckAndroid" ||
      k === "interruptionModeIOS" ||
      k === "interruptionModeAndroid"
    ) {
      continue;
    }
    out[k] = (mode as any)[k];
  }

  return out;
};

const setAudioModeAsyncFn = async (mode: LegacyAudioMode): Promise<void> => {
  return expoAudioSetAudioModeAsync(translateAudioMode(mode) as any);
};

/* ─────────────────────────────────────────────────────────────────────────── */
/* Sound — wraps expo-audio's AudioPlayer with the legacy expo-av API.         */
/* ─────────────────────────────────────────────────────────────────────────── */

type LegacyStatus = {
  isLoaded: boolean;
  isPlaying: boolean;
  positionMillis: number;
  durationMillis: number;
  didJustFinish: boolean;
  isBuffering: boolean;
  rate: number;
  volume: number;
  isLooping: boolean;
};

type StatusUpdateCb = (status: LegacyStatus) => void;

type SoundOptions = {
  shouldPlay?: boolean;
  isLooping?: boolean;
  volume?: number;
  rate?: number;
  shouldCorrectPitch?: boolean;
  positionMillis?: number;
  progressUpdateIntervalMillis?: number;
};

const toLegacyStatus = (
  player: AudioPlayer,
  s?: AudioStatus | null,
): LegacyStatus => {
  const currentTime =
    s?.currentTime !== undefined ? s.currentTime : player.currentTime;
  const duration = s?.duration !== undefined ? s.duration : player.duration;
  const playing = s?.playing !== undefined ? s.playing : player.playing;
  const isLoaded = s?.isLoaded !== undefined ? s.isLoaded : player.isLoaded;
  return {
    isLoaded: !!isLoaded,
    isPlaying: !!playing,
    positionMillis: Math.round((currentTime || 0) * 1000),
    durationMillis: Math.round((duration || 0) * 1000),
    didJustFinish: !!(s && (s as any).didJustFinish),
    isBuffering: !!(s as any)?.isBuffering,
    rate: player.playbackRate ?? 1,
    volume: player.volume ?? 1,
    isLooping: !!player.loop,
  };
};

class SoundImpl {
  private player: AudioPlayer;
  private subscription: { remove: () => void } | null = null;
  private statusCb: StatusUpdateCb | null = null;
  private released = false;

  constructor(player: AudioPlayer) {
    this.player = player;
  }

  static async createAsync(
    source: any,
    initialStatus: SoundOptions = {},
    onStatusUpdate?: StatusUpdateCb,
  ): Promise<{ sound: SoundImpl; status: LegacyStatus }> {
    const updateInterval = initialStatus.progressUpdateIntervalMillis ?? 500;
    const player = createAudioPlayer(source, { updateInterval });

    if (initialStatus.isLooping !== undefined)
      player.loop = !!initialStatus.isLooping;
    if (initialStatus.volume !== undefined) player.volume = initialStatus.volume;
    if (initialStatus.rate !== undefined) {
      try {
        player.setPlaybackRate(
          initialStatus.rate,
          initialStatus.shouldCorrectPitch ? "high" : "low",
        );
      } catch {
        /* setPlaybackRate may throw before the source is loaded */
      }
    }
    if (
      initialStatus.positionMillis !== undefined &&
      initialStatus.positionMillis > 0
    ) {
      try {
        await player.seekTo(initialStatus.positionMillis / 1000);
      } catch {
        /* ignore early seek errors */
      }
    }
    if (initialStatus.shouldPlay) {
      try {
        player.play();
      } catch {
        /* play before load is queued */
      }
    }

    const sound = new SoundImpl(player);
    if (onStatusUpdate) sound.setOnPlaybackStatusUpdate(onStatusUpdate);
    return { sound, status: toLegacyStatus(player) };
  }

  setOnPlaybackStatusUpdate(cb: StatusUpdateCb | null): void {
    if (this.subscription) {
      try {
        this.subscription.remove();
      } catch {
        /* ignore */
      }
      this.subscription = null;
    }
    this.statusCb = cb;
    if (cb && !this.released) {
      this.subscription = this.player.addListener(
        "playbackStatusUpdate",
        (status: AudioStatus) => {
          try {
            cb(toLegacyStatus(this.player, status));
          } catch {
            /* swallow listener errors to mirror expo-av tolerance */
          }
        },
      );
    }
  }

  async getStatusAsync(): Promise<LegacyStatus> {
    return toLegacyStatus(this.player);
  }

  async playAsync(): Promise<LegacyStatus> {
    if (!this.released) this.player.play();
    return toLegacyStatus(this.player);
  }

  async pauseAsync(): Promise<LegacyStatus> {
    if (!this.released) this.player.pause();
    return toLegacyStatus(this.player);
  }

  async stopAsync(): Promise<LegacyStatus> {
    if (this.released) return toLegacyStatus(this.player);
    try {
      this.player.pause();
    } catch {
      /* ignore */
    }
    try {
      await this.player.seekTo(0);
    } catch {
      /* ignore */
    }
    return toLegacyStatus(this.player);
  }

  async setPositionAsync(positionMillis: number): Promise<LegacyStatus> {
    if (!this.released) {
      try {
        await this.player.seekTo((positionMillis || 0) / 1000);
      } catch {
        /* ignore */
      }
    }
    return toLegacyStatus(this.player);
  }

  async setRateAsync(
    rate: number,
    shouldCorrectPitch?: boolean,
  ): Promise<LegacyStatus> {
    if (!this.released) {
      try {
        this.player.setPlaybackRate(
          rate,
          shouldCorrectPitch ? "high" : "low",
        );
      } catch {
        /* ignore */
      }
    }
    return toLegacyStatus(this.player);
  }

  async setVolumeAsync(volume: number): Promise<LegacyStatus> {
    if (!this.released) this.player.volume = volume;
    return toLegacyStatus(this.player);
  }

  async setIsLoopingAsync(isLooping: boolean): Promise<LegacyStatus> {
    if (!this.released) this.player.loop = !!isLooping;
    return toLegacyStatus(this.player);
  }

  async unloadAsync(): Promise<void> {
    if (this.released) return;
    this.released = true;
    if (this.subscription) {
      try {
        this.subscription.remove();
      } catch {
        /* ignore */
      }
      this.subscription = null;
    }
    this.statusCb = null;
    try {
      this.player.pause();
    } catch {
      /* ignore */
    }
    try {
      (this.player as any).remove?.();
    } catch {
      /* ignore */
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Recording — wraps expo-audio's AudioRecorder with the legacy expo-av API.   */
/* ─────────────────────────────────────────────────────────────────────────── */

class RecordingImpl {
  private recorder: AudioRecorder | null = null;
  private prepared = false;
  private uri: string | null = null;

  constructor() {}

  static async createAsync(
    options: any = RecordingPresets.HIGH_QUALITY,
  ): Promise<{ recording: RecordingImpl; status: any }> {
    const rec = new RecordingImpl();
    await rec.prepareToRecordAsync(options);
    await rec.startAsync();
    return { recording: rec, status: { canRecord: true, isRecording: true } };
  }

  async prepareToRecordAsync(options: any = RecordingPresets.HIGH_QUALITY): Promise<void> {
    // expo-audio's AudioRecorder constructor is not surfaced by the package's
    // top-level entry; reach into its internal AudioModule (which Metro
    // resolves per-platform via AudioModule.{js,web.js}). Recording paths in
    // this app are already gated by `Platform.OS !== 'web'`, so this require
    // only ever runs on native.
    if (!this.recorder) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AudioModule = require("expo-audio/build/AudioModule").default;
      const RecorderCtor = AudioModule?.AudioRecorder;
      if (!RecorderCtor) {
        throw new Error(
          "expo-audio AudioRecorder is unavailable on this platform",
        );
      }
      this.recorder = new RecorderCtor(options);
    }
    if (this.recorder) {
      await this.recorder.prepareToRecordAsync(options);
    }
    this.prepared = true;
  }

  async startAsync(): Promise<void> {
    if (!this.recorder) {
      throw new Error("Recording must be prepared before starting");
    }
    this.recorder.record();
  }

  async pauseAsync(): Promise<void> {
    try {
      this.recorder?.pause();
    } catch {
      /* ignore */
    }
  }

  async stopAndUnloadAsync(): Promise<void> {
    if (!this.recorder) return;
    try {
      await this.recorder.stop();
    } catch {
      /* ignore */
    }
    // Capture the URI before releasing the underlying SharedObject.
    this.uri = this.recorder.uri ?? this.uri;
    try {
      (this.recorder as any).release?.();
    } catch {
      /* ignore */
    }
    this.recorder = null;
    this.prepared = false;
  }

  getURI(): string | null {
    return this.recorder?.uri ?? this.uri;
  }
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Audio namespace — combines everything under the legacy `Audio` symbol.      */
/* ─────────────────────────────────────────────────────────────────────────── */

// A namespace lets call sites use `Audio.Sound` as both a value (the class)
// and a type (its instance type), matching expo-av's surface. We export each
// class as both a `const` (value) and a `type` of the same name so usages like
// `Audio.Sound | null` (type position) and `new Audio.Recording()` (value
// position) and `Audio.Sound.createAsync(...)` (static method) all type-check.
export namespace Audio {
  export const Sound = SoundImpl;
  export type Sound = SoundImpl;
  export const Recording = RecordingImpl;
  export type Recording = RecordingImpl;
  export const RecordingOptionsPresets = RecordingPresets;
  export const setAudioModeAsync = setAudioModeAsyncFn;
  export const requestPermissionsAsync = requestRecordingPermissionsAsync;
  export const getPermissionsAsync = requestRecordingPermissionsAsync;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Video — wraps expo-video's VideoView/useVideoPlayer with expo-av's props.   */
/* ─────────────────────────────────────────────────────────────────────────── */

type VideoSource = { uri: string } | number | string;

type VideoStatusCb = (status: LegacyStatus) => void;

export interface VideoProps {
  source: VideoSource;
  style?: StyleProp<ViewStyle>;
  resizeMode?: ResizeModeValue | string;
  shouldPlay?: boolean;
  isLooping?: boolean;
  isMuted?: boolean;
  volume?: number;
  useNativeControls?: boolean;
  onPlaybackStatusUpdate?: VideoStatusCb;
  onLoad?: (data: any) => void;
  onError?: (e: any) => void;
}

const normalizeVideoSource = (source: VideoSource): any => {
  if (typeof source === "object" && source !== null && "uri" in source) {
    return source.uri;
  }
  return source as any;
};

export const Video: React.FC<VideoProps> = ({
  source,
  style,
  resizeMode,
  shouldPlay,
  isLooping,
  isMuted,
  volume,
  useNativeControls,
  onPlaybackStatusUpdate,
}) => {
  const normalized = normalizeVideoSource(source);
  const finishedRef = useRef(false);

  const player = useVideoPlayer(normalized, (p) => {
    try {
      if (isLooping !== undefined) p.loop = !!isLooping;
      if (isMuted !== undefined) p.muted = !!isMuted;
      if (volume !== undefined) p.volume = volume;
      if (shouldPlay) p.play();
    } catch {
      /* configuration errors before load are ignored */
    }
  });

  // Apply prop changes after init so callers can drive playback.
  useEffect(() => {
    try {
      if (isLooping !== undefined) player.loop = !!isLooping;
    } catch {
      /* ignore */
    }
  }, [player, isLooping]);

  useEffect(() => {
    try {
      if (isMuted !== undefined) player.muted = !!isMuted;
    } catch {
      /* ignore */
    }
  }, [player, isMuted]);

  useEffect(() => {
    try {
      if (volume !== undefined) player.volume = volume;
    } catch {
      /* ignore */
    }
  }, [player, volume]);

  useEffect(() => {
    try {
      if (shouldPlay) player.play();
      else if (shouldPlay === false) player.pause();
    } catch {
      /* ignore */
    }
  }, [player, shouldPlay]);

  // Bridge expo-video events back to expo-av's onPlaybackStatusUpdate shape.
  useEffect(() => {
    if (!onPlaybackStatusUpdate) return;

    const emit = (extra: Partial<LegacyStatus> = {}) => {
      const status: LegacyStatus = {
        isLoaded: (player as any).status === "readyToPlay",
        isPlaying: !!player.playing,
        positionMillis: Math.round(((player as any).currentTime || 0) * 1000),
        durationMillis: Math.round(((player as any).duration || 0) * 1000),
        didJustFinish: false,
        isBuffering: false,
        rate: (player as any).playbackRate ?? 1,
        volume: (player as any).volume ?? 1,
        isLooping: !!(player as any).loop,
        ...extra,
      };
      try {
        onPlaybackStatusUpdate(status);
      } catch {
        /* swallow listener errors */
      }
    };

    const subs: { remove: () => void }[] = [];
    try {
      subs.push(
        (player as any).addListener("statusChange", () => {
          finishedRef.current = false;
          emit();
        }),
      );
    } catch {
      /* ignore */
    }
    try {
      subs.push(
        (player as any).addListener("timeUpdate", () => emit()),
      );
    } catch {
      /* ignore */
    }
    try {
      subs.push(
        (player as any).addListener("playToEnd", () => {
          if (finishedRef.current) return;
          finishedRef.current = true;
          emit({ didJustFinish: true });
        }),
      );
    } catch {
      /* ignore */
    }
    try {
      subs.push(
        (player as any).addListener("playingChange", () => emit()),
      );
    } catch {
      /* ignore */
    }

    // Fire once immediately so consumers see initial state.
    emit();

    return () => {
      for (const s of subs) {
        try {
          s.remove();
        } catch {
          /* ignore */
        }
      }
    };
  }, [player, onPlaybackStatusUpdate]);

  return (
    <VideoView
      player={player}
      style={style as any}
      contentFit={resizeModeToContentFit(resizeMode) as any}
      nativeControls={!!useNativeControls}
    />
  );
};

const _default = { Audio, Video, ResizeMode, InterruptionModeIOS, InterruptionModeAndroid };
export default _default;
