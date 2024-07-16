"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWebRTCServer = createWebRTCServer;
const tslib_1 = require("tslib");
const hash_1 = require("@aicacia/hash");
const HTTP_1 = require("./HTTP");
const utils_1 = require("./utils");
function createWebRTCConnection() {
    const stream = new TransformStream();
    return {
        stream,
        writer: stream.writable.getWriter(),
    };
}
function createWebRTCServer(channel, handler) {
    const connections = new Map();
    function handle(connectionId, connection) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const request = yield (0, HTTP_1.parseHTTPRequest)(connection.stream.readable.getReader());
            const response = yield handler(request);
            const writableStream = (0, utils_1.bufferedWritableStream)((0, utils_1.writableStreamFromChannel)(channel, (0, hash_1.integerToBytes)(new Uint8Array(4), connectionId), utils_1.DEFAULT_MAX_MESSAGE_SIZE));
            yield (0, HTTP_1.writeHTTPRequestOrResponse)(writableStream, response);
        });
    }
    function onData(connectionId, chunk) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            let connection = connections.get(connectionId);
            if (!connection) {
                connection = createWebRTCConnection();
                connections.set(connectionId, connection);
                handle(connectionId, connection);
            }
            yield connection.writer.write(chunk);
        });
    }
    function onMessage(event) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const chunk = new Uint8Array(event.data);
            const connectionId = (0, hash_1.bytesToInteger)(chunk);
            yield onData(connectionId, chunk.slice(4));
        });
    }
    channel.addEventListener("message", onMessage);
    return () => {
        channel.removeEventListener("message", onMessage);
    };
}
