import Constants from "expo-constants";

const isExpoGo =
  Constants.executionEnvironment === "storeClient" ||
  (Constants as any).appOwnership === "expo";

let _createAgoraRtcEngine: any = null;
let _RtcSurfaceView: any = null;
let _VideoSourceType: any = {};
let _ChannelProfileType: any = {};
let _ClientRoleType: any = {};
let _VideoMirrorModeType: any = {};
let _RenderModeType: any = {};
let _OrientationMode: any = {};
let _DegradationPreference: any = {};
let _available = false;

if (!isExpoGo) {
  try {
    const agora = require("react-native-agora");
    _createAgoraRtcEngine = agora.createAgoraRtcEngine;
    _RtcSurfaceView = agora.RtcSurfaceView;
    _VideoSourceType = agora.VideoSourceType;
    _ChannelProfileType = agora.ChannelProfileType;
    _ClientRoleType = agora.ClientRoleType;
    _VideoMirrorModeType = agora.VideoMirrorModeType;
    _RenderModeType = agora.RenderModeType;
    _OrientationMode = agora.OrientationMode;
    _DegradationPreference = agora.DegradationPreference;
    _available = true;
  } catch {
    _available = false;
  }
}

export const createAgoraRtcEngine = _createAgoraRtcEngine;
export const RtcSurfaceView = _RtcSurfaceView;
export const VideoSourceType = _VideoSourceType;
export const ChannelProfileType = _ChannelProfileType;
export const ClientRoleType = _ClientRoleType;
export const VideoMirrorModeType = _VideoMirrorModeType;
export const RenderModeType = _RenderModeType;
export const OrientationMode = _OrientationMode;
export const DegradationPreference = _DegradationPreference;
export const isAgoraAvailable = _available;
