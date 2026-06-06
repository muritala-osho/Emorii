declare module "*.png" {
  const value: number;
  export default value;
}
declare module "*.jpg" {
  const value: number;
  export default value;
}
declare module "*.jpeg" {
  const value: number;
  export default value;
}
declare module "*.gif" {
  const value: number;
  export default value;
}
declare module "*.webp" {
  const value: number;
  export default value;
}

declare module "agora-rtc-sdk-ng" {
  const AgoraRTC: any;
  export default AgoraRTC;
  export const createClient: any;
  export const createMicrophoneAndCameraTracks: any;
}

declare module "react-native-iap" {
  export const initConnection: any;
  export const fetchProducts: any;
  export const getAvailablePurchases: any;
  export const getProducts: any;
  export const requestPurchase: any;
  export const finishTransaction: any;
  export const purchaseUpdatedListener: any;
  export const purchaseErrorListener: any;
  export type Product = any;
  export type Purchase = any;
}
