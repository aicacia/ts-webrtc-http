"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWebRTCFetch = createWebRTCFetch;
const tslib_1 = require("tslib");
const hash_1 = require("@aicacia/hash");
const utils_1 = require("./utils");
const HTTP_1 = require("./HTTP");
function createWebRTCFetch(channel) {
    const connections = new Map();
    function createWebRTCConnection() {
        let connectionId = (0, utils_1.randomUInt32)();
        while (connections.has(connectionId)) {
            connectionId = (0, utils_1.randomUInt32)();
        }
        const idBytes = (0, hash_1.integerToBytes)(new Uint8Array(4), connectionId);
        const stream = new TransformStream();
        const connection = {
            idBytes,
            stream,
            writer: stream.writable.getWriter(),
        };
        connections.set(connectionId, connection);
        return connection;
    }
    function onData(connectionId, chunk) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const connection = connections.get(connectionId);
            if (!connection) {
                throw new Error(`No connection found for id: ${connectionId}`);
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
    const fetch = (input, init) => {
        return new Promise((resolve, reject) => {
            const request = new HTTP_1.HTTPRequest(input, init);
            const connection = createWebRTCConnection();
            const writableStream = (0, utils_1.bufferedWritableStream)((0, utils_1.writableStreamFromChannel)(channel, connection.idBytes, utils_1.DEFAULT_MAX_MESSAGE_SIZE));
            (0, HTTP_1.writeHTTPRequestOrResponse)(writableStream, request)
                .then(() => (0, HTTP_1.parseHTTPResponse)(connection.stream.readable.getReader()).then(resolve))
                .catch(reject);
        });
    };
    fetch.destroy = () => channel.removeEventListener("message", onMessage);
    return fetch;
}
