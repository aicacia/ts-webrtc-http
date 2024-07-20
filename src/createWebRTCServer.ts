import { bytesToInteger, integerToBytes } from "@aicacia/hash";
import { parseRequest, writeRequestOrResponse } from "@aicacia/http";
import {
	bufferedWritableStream,
	DEFAULT_MAX_MESSAGE_SIZE,
	writableStreamFromChannel,
} from "./utils";

interface WebRTCConnection {
	stream: TransformStream<Uint8Array, Uint8Array>;
	writer: WritableStreamDefaultWriter<Uint8Array>;
}

function createWebRTCConnection(): WebRTCConnection {
	const stream = new TransformStream<Uint8Array>();
	return {
		stream,
		writer: stream.writable.getWriter(),
	};
}

export function createWebRTCServer(
	channel: RTCDataChannel,
	handler: (request: Request) => Promise<Response> | Response,
) {
	const connections = new Map<number, WebRTCConnection>();

	async function handle(connectionId: number, connection: WebRTCConnection) {
		const request = await parseRequest(connection.stream.readable.getReader());
		const response = await handler(request);
		const writableStream = bufferedWritableStream(
			writableStreamFromChannel(
				channel,
				integerToBytes(new Uint8Array(4), connectionId),
				DEFAULT_MAX_MESSAGE_SIZE,
			),
		);
		await writeRequestOrResponse(writableStream, response);
	}

	async function onData(connectionId: number, chunk: Uint8Array) {
		let connection = connections.get(connectionId);
		if (!connection) {
			connection = createWebRTCConnection();
			connections.set(connectionId, connection);
			handle(connectionId, connection);
		}
		await connection.writer.write(chunk);
	}

	async function onMessage(event: MessageEvent) {
		const chunk = new Uint8Array(event.data);
		const connectionId = bytesToInteger(chunk);
		await onData(connectionId, chunk.slice(4));
	}
	channel.addEventListener("message", onMessage);

	return () => {
		channel.removeEventListener("message", onMessage);
	};
}
