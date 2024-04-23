import { bytesToInteger, integerToBytes } from '@aicacia/hash';
import {
	DEFAULT_TIMEOUT_MS,
	N,
	PROTOCAL,
	R,
	concatUint8Array,
	encodeLine,
	randomUInt32
} from './utils';

type Fetch = typeof fetch;

export type WebRTCFetch = Fetch & {
	destroy(): void;
};

type WebRTCConnection = {
	connectionId: number;
	url: URL;
	handled: boolean;
	readStatus: boolean;
	readHeaders: boolean;
	headers: Headers;
	status: number;
	statusText: string;
	stream: TransformStream;
	writer: WritableStreamDefaultWriter<Uint8Array>;
	timeoutId?: ReturnType<typeof setTimeout>;
	handle: (error: Error | undefined, response?: Response) => void;
};

function webRTCConnectionToNativeResponse(webRTCConnection: WebRTCConnection): Response {
	const response = new Response(webRTCConnection.stream.readable, {
		status: webRTCConnection.status,
		statusText: webRTCConnection.statusText,
		headers: webRTCConnection.headers,
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-expect-error
		duplex: 'half'
	});
	Object.defineProperty(response, 'url', {
		value: `webrtc-http:${webRTCConnection.url.pathname}${webRTCConnection.url.search}`
	});
	return response;
}

export function createWebRTCFetch(channel: RTCDataChannel): WebRTCFetch {
	const responses = new Map<number, WebRTCConnection>();
	const textEncoder = new TextEncoder();
	const textDecoder = new TextDecoder();

	function createWebRTCConnection(
		connectionId: number,
		request: Request,
		resolve: (response: Response) => void,
		reject: (error: Error) => void
	) {
		const stream = new TransformStream();
		const WebRTCConnection: WebRTCConnection = {
			connectionId,
			url: new URL(request.url),
			handled: false,
			readStatus: false,
			readHeaders: false,
			headers: new Headers(),
			status: 200,
			statusText: '',
			stream,
			writer: stream.writable.getWriter(),
			handle(error, response) {
				if (WebRTCConnection.handled) {
					reject(new TypeError('Response already handled'));
					return;
				}
				WebRTCConnection.handled = true;
				if (error) {
					reject(error);
				} else if (response) {
					resolve(response);
				} else {
					reject(new TypeError('No response'));
				}
			}
		};
		WebRTCConnection.timeoutId = setTimeout(
			() => WebRTCConnection.handle(new TypeError('Request timed out')),
			DEFAULT_TIMEOUT_MS
		);
		return WebRTCConnection;
	}

	function createConnection(
		request: Request,
		resolve: (response: Response) => void,
		reject: (error: Error) => void
	) {
		let connectionId = randomUInt32();
		while (responses.has(connectionId)) {
			connectionId = randomUInt32();
		}
		const connection = createWebRTCConnection(connectionId, request, resolve, reject);
		responses.set(connectionId, connection);
		return connection;
	}

	async function writeRequest(connectionId: number, request: Request) {
		const url = new URL(request.url);
		const connectionIdBytes = integerToBytes(new Uint8Array(4), connectionId);
		channel.send(
			encodeLine(
				textEncoder,
				connectionIdBytes,
				`${request.method} ${url.pathname + url.search} ${PROTOCAL}`
			)
		);
		request.headers.forEach((value, key) => {
			channel.send(encodeLine(textEncoder, connectionIdBytes, `${key}: ${value}`));
		});
		channel.send(encodeLine(textEncoder, connectionIdBytes, '\r\n'));
		if (request.body) {
			const reader = request.body.getReader();
			while (true) {
				const { done, value } = await reader.read();
				if (value) {
					channel.send(concatUint8Array(connectionIdBytes, value));
				}
				if (done) {
					break;
				}
			}
		}
		channel.send(encodeLine(textEncoder, connectionIdBytes, '\r\n'));
	}

	async function onConnectionMessage(connectionId: number, line: Uint8Array) {
		const response = responses.get(connectionId);
		if (response) {
			if (!response.readStatus) {
				response.readStatus = true;
				const [_version, status, statusText] = textDecoder.decode(line).split(/\s+/, 3);
				response.status = parseInt(status);
				response.statusText = statusText;
			} else if (!response.readHeaders) {
				if (line[0] === R && line[1] === N) {
					response.readHeaders = true;
					response.handle(undefined, webRTCConnectionToNativeResponse(response));
				} else {
					const [key, value] = textDecoder.decode(line).split(/\:\s+/);
					response.headers.append(key, value);
				}
			} else {
				await response.writer.ready;
				if (line[0] === R && line[1] === N) {
					responses.delete(connectionId);
					clearTimeout(response.timeoutId);
					response.timeoutId = undefined;
					await response.writer.close();
				} else {
					await response.writer.write(line);
				}
			}
		}
	}

	async function onMessage(event: MessageEvent) {
		const array = new Uint8Array(event.data);
		const connectionId = bytesToInteger(array);
		await onConnectionMessage(connectionId, array.slice(4));
	}
	channel.addEventListener('message', onMessage);

	function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
		return new Promise(async (resolve, reject) => {
			const request = new Request(input, init);
			const connection = createConnection(request, resolve, reject);
			await writeRequest(connection.connectionId, request);
		});
	}

	fetch.destroy = () => channel.removeEventListener('message', onMessage);

	return fetch;
}
