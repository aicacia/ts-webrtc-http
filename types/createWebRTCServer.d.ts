export declare function createWebRTCServer(channel: RTCDataChannel, handler: (request: Request) => Promise<Response> | Response): () => void;
