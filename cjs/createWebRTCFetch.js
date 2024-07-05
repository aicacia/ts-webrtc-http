"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWebRTCFetch = void 0;
const tslib_1 = require("tslib");
const hash_1 = require("@aicacia/hash");
const utils_1 = require("./utils");
function webRTCConnectionToNativeResponse(webRTCConnection) {
    const response = new Response(webRTCConnection.stream.readable, {
        status: webRTCConnection.status,
        statusText: webRTCConnection.statusText,
        headers: webRTCConnection.headers,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        duplex: "half",
    });
    Object.defineProperty(response, "url", {
        value: `webrtc-http:${webRTCConnection.url.pathname}${webRTCConnection.url.search}`,
    });
    return response;
}
function createWebRTCFetch(channel) {
    const responses = new Map();
    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();
    function createWebRTCConnection(connectionId, request, resolve, reject) {
        const stream = new TransformStream();
        const WebRTCConnection = {
            connectionId,
            url: new URL(request.url),
            handled: false,
            readStatus: false,
            readHeaders: false,
            headers: new Headers(),
            status: 200,
            statusText: "",
            stream,
            writer: stream.writable.getWriter(),
            handle(error, response) {
                if (WebRTCConnection.handled) {
                    reject(new TypeError("Response already handled"));
                    return;
                }
                WebRTCConnection.handled = true;
                if (error) {
                    reject(error);
                }
                else if (response) {
                    resolve(response);
                }
                else {
                    reject(new TypeError("No response"));
                }
            },
        };
        WebRTCConnection.timeoutId = setTimeout(() => WebRTCConnection.handle(new TypeError("Request timed out")), utils_1.DEFAULT_TIMEOUT_MS);
        return WebRTCConnection;
    }
    function createConnection(request, resolve, reject) {
        let connectionId = (0, utils_1.randomUInt32)();
        while (responses.has(connectionId)) {
            connectionId = (0, utils_1.randomUInt32)();
        }
        const connection = createWebRTCConnection(connectionId, request, resolve, reject);
        responses.set(connectionId, connection);
        return connection;
    }
    function writeRequest(connectionId, request) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const url = new URL(request.url);
            const connectionIdBytes = (0, hash_1.integerToBytes)(new Uint8Array(4), connectionId);
            channel.send((0, utils_1.encodeLine)(textEncoder, connectionIdBytes, `${request.method} ${url.pathname + url.search} ${utils_1.PROTOCAL}`));
            request.headers.forEach((value, key) => {
                channel.send((0, utils_1.encodeLine)(textEncoder, connectionIdBytes, `${key}: ${value}`));
            });
            channel.send((0, utils_1.encodeLine)(textEncoder, connectionIdBytes, "\r\n"));
            if (request.body) {
                const reader = request.body.getReader();
                while (true) {
                    const { done, value } = yield reader.read();
                    if (value) {
                        channel.send((0, utils_1.concatUint8Array)(connectionIdBytes, value));
                    }
                    if (done) {
                        break;
                    }
                }
            }
            channel.send((0, utils_1.encodeLine)(textEncoder, connectionIdBytes, "\r\n"));
        });
    }
    function onConnectionMessage(connectionId, line) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const response = responses.get(connectionId);
            if (response) {
                if (!response.readStatus) {
                    response.readStatus = true;
                    const [_version, status, statusText] = textDecoder
                        .decode(line)
                        .split(/\s+/, 3);
                    response.status = Number.parseInt(status);
                    response.statusText = statusText;
                }
                else if (!response.readHeaders) {
                    if (line[0] === utils_1.R && line[1] === utils_1.N) {
                        response.readHeaders = true;
                        response.handle(undefined, webRTCConnectionToNativeResponse(response));
                    }
                    else {
                        const [key, value] = textDecoder.decode(line).split(/\:\s+/);
                        response.headers.append(key, value);
                    }
                }
                else {
                    yield response.writer.ready;
                    if (line[0] === utils_1.R && line[1] === utils_1.N) {
                        responses.delete(connectionId);
                        clearTimeout(response.timeoutId);
                        response.timeoutId = undefined;
                        yield response.writer.close();
                    }
                    else {
                        yield response.writer.write(line);
                    }
                }
            }
        });
    }
    function onMessage(event) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const array = new Uint8Array(event.data);
            const connectionId = (0, hash_1.bytesToInteger)(array);
            yield onConnectionMessage(connectionId, array.slice(4));
        });
    }
    channel.addEventListener("message", onMessage);
    function fetch(input, init) {
        return new Promise((resolve, reject) => {
            const request = new Request(input, init);
            const connection = createConnection(request, resolve, reject);
            writeRequest(connection.connectionId, request);
        });
    }
    fetch.destroy = () => channel.removeEventListener("message", onMessage);
    return fetch;
}
exports.createWebRTCFetch = createWebRTCFetch;
