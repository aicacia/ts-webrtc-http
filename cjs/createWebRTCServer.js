"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWebRTCServer = void 0;
const tslib_1 = require("tslib");
const hash_1 = require("@aicacia/hash");
const utils_1 = require("./utils");
function createWebRTCConnection(method, path) {
    const stream = new TransformStream();
    return {
        readHeaders: false,
        method,
        path,
        headers: new Headers(),
        stream,
        writer: stream.writable.getWriter()
    };
}
function webRTCConnectionToNativeRequest(webRTCConnection) {
    return new Request(`webrtc-http:${webRTCConnection.path}`, {
        method: webRTCConnection.method,
        headers: webRTCConnection.headers,
        body: webRTCConnection.method === 'GET' || webRTCConnection.method === 'HEAD'
            ? null
            : webRTCConnection.stream.readable,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        duplex: 'half'
    });
}
function createWebRTCServer(channel, handler) {
    const requests = new Map();
    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();
    function writeResponse(requestId, response) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const requestIdBytes = (0, hash_1.integerToBytes)(new Uint8Array(4), requestId);
            channel.send((0, utils_1.encodeLine)(textEncoder, requestIdBytes, `${utils_1.PROTOCAL} ${response.status} ${(0, utils_1.statusCodeToStatusText)(response.status)}`));
            response.headers.forEach((value, key) => {
                channel.send((0, utils_1.encodeLine)(textEncoder, requestIdBytes, `${key}: ${value}`));
            });
            channel.send((0, utils_1.encodeLine)(textEncoder, requestIdBytes, '\r\n'));
            if (response.body) {
                const reader = response.body.getReader();
                while (true) {
                    const { done, value } = yield reader.read();
                    if (value) {
                        channel.send((0, utils_1.concatUint8Array)(requestIdBytes, value));
                    }
                    if (done) {
                        break;
                    }
                }
            }
            channel.send((0, utils_1.encodeLine)(textEncoder, requestIdBytes, '\r\n'));
        });
    }
    function handle(requestId, request) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const response = yield handler(request);
            yield writeResponse(requestId, response);
        });
    }
    function onConnectionMessage(requestId, line) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const request = requests.get(requestId);
            if (!request) {
                const [method, path, version] = textDecoder.decode(line).split(/\s+/);
                if (method && path && version) {
                    const request = createWebRTCConnection(method, path);
                    requests.set(requestId, request);
                    request.timeoutId = setTimeout(() => requests.delete(requestId), utils_1.DEFAULT_TIMEOUT_MS);
                }
            }
            else {
                if (!request.readHeaders) {
                    if (line[0] === utils_1.R && line[1] === utils_1.N) {
                        request.readHeaders = true;
                        yield handle(requestId, webRTCConnectionToNativeRequest(request));
                    }
                    else {
                        const [key, value] = textDecoder.decode(line).split(/\:\s+/, 2);
                        request.headers.append(key, value);
                    }
                }
                else {
                    yield request.writer.ready;
                    if (line[0] === utils_1.R && line[1] === utils_1.N) {
                        requests.delete(requestId);
                        clearTimeout(request.timeoutId);
                        request.timeoutId = undefined;
                        yield request.writer.close();
                    }
                    else {
                        yield request.writer.write(line);
                    }
                }
            }
        });
    }
    function onMessage(event) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const array = new Uint8Array(event.data);
            const requestId = (0, hash_1.bytesToInteger)(array);
            yield onConnectionMessage(requestId, array.slice(4));
        });
    }
    channel.addEventListener('message', onMessage);
    return () => {
        channel.removeEventListener('message', onMessage);
    };
}
exports.createWebRTCServer = createWebRTCServer;
