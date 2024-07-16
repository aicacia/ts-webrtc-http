import { bytesToInteger, integerToBytes } from "@aicacia/hash";
import { bufferedWritableStream, DEFAULT_MAX_MESSAGE_SIZE, randomUInt32, writableStreamFromChannel, } from "./utils";
import { HTTPRequest, parseHTTPResponse, writeHTTPRequestOrResponse, } from "./HTTP";
export function createWebRTCFetch(channel) {
    const connections = new Map();
    function createWebRTCConnection() {
        let connectionId = randomUInt32();
        while (connections.has(connectionId)) {
            connectionId = randomUInt32();
        }
        const idBytes = integerToBytes(new Uint8Array(4), connectionId);
        const stream = new TransformStream();
        const connection = {
            idBytes,
            stream,
            writer: stream.writable.getWriter(),
        };
        connections.set(connectionId, connection);
        return connection;
    }
    async function onData(connectionId, chunk) {
        const connection = connections.get(connectionId);
        if (!connection) {
            throw new Error(`No connection found for id: ${connectionId}`);
        }
        await connection.writer.write(chunk);
    }
    async function onMessage(event) {
        const chunk = new Uint8Array(event.data);
        const connectionId = bytesToInteger(chunk);
        await onData(connectionId, chunk.slice(4));
    }
    channel.addEventListener("message", onMessage);
    const fetch = (input, init) => {
        return new Promise((resolve, reject) => {
            const request = new HTTPRequest(input, init);
            const connection = createWebRTCConnection();
            const writableStream = bufferedWritableStream(writableStreamFromChannel(channel, connection.idBytes, DEFAULT_MAX_MESSAGE_SIZE));
            writeHTTPRequestOrResponse(writableStream, request)
                .then(() => parseHTTPResponse(connection.stream.readable.getReader()).then(resolve))
                .catch(reject);
        });
    };
    fetch.destroy = () => channel.removeEventListener("message", onMessage);
    return fetch;
}
