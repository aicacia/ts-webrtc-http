import { bytesToInteger, integerToBytes } from "@aicacia/hash";
import { parseHTTPRequest, writeHTTPRequestOrResponse } from "./HTTP";
import { bufferedWritableStream, DEFAULT_MAX_MESSAGE_SIZE, writableStreamFromChannel, } from "./utils";
function createWebRTCConnection() {
    const stream = new TransformStream();
    return {
        stream,
        writer: stream.writable.getWriter(),
    };
}
export function createWebRTCServer(channel, handler) {
    const connections = new Map();
    async function handle(connectionId, connection) {
        const request = await parseHTTPRequest(connection.stream.readable.getReader());
        const response = await handler(request);
        const writableStream = bufferedWritableStream(writableStreamFromChannel(channel, integerToBytes(new Uint8Array(4), connectionId), DEFAULT_MAX_MESSAGE_SIZE));
        await writeHTTPRequestOrResponse(writableStream, response);
    }
    async function onData(connectionId, chunk) {
        let connection = connections.get(connectionId);
        if (!connection) {
            connection = createWebRTCConnection();
            connections.set(connectionId, connection);
            handle(connectionId, connection);
        }
        await connection.writer.write(chunk);
    }
    async function onMessage(event) {
        const chunk = new Uint8Array(event.data);
        const connectionId = bytesToInteger(chunk);
        await onData(connectionId, chunk.slice(4));
    }
    channel.addEventListener("message", onMessage);
    return () => {
        channel.removeEventListener("message", onMessage);
    };
}
