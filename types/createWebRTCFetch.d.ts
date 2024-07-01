type Fetch = typeof fetch;
export type WebRTCFetch = Fetch & {
    destroy(): void;
};
export declare function createWebRTCFetch(channel: RTCDataChannel): WebRTCFetch;
export {};
