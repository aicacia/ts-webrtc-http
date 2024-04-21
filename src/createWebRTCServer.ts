import { bytesToInteger, integerToBytes } from '@aicacia/hash';
import {
	DEFAULT_TIMEOUT_MS,
	N,
	PROTOCAL,
	R,
	concatUint8Array,
	encodeLine,
	statusCodeToStatusText
} from './utils';

interface WebRTCConnection {
	readHeaders: boolean;
	method: string;
	path: string;
	headers: Headers;
	stream: TransformStream<Uint8Array>;
	writer: WritableStreamDefaultWriter<Uint8Array>;
	timeoutId?: ReturnType<typeof setTimeout>;
}

function createWebRTCConnection(method: string, path: string): WebRTCConnection {
	const stream = new TransformStream<Uint8Array>();
	return {
		readHeaders: false,
		method,
		path,
		headers: new Headers(),
		stream,
		writer: stream.writable.getWriter()
	};
}

function webRTCConnectionToNativeRequest(webRTCConnection: WebRTCConnection): Request {
	return new Request(`webrtc-http:${webRTCConnection.path}`, {
		method: webRTCConnection.method,
		headers: webRTCConnection.headers,
		body:
			webRTCConnection.method === 'GET' || webRTCConnection.method === 'HEAD'
				? null
				: webRTCConnection.stream.readable,
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-expect-error
		duplex: 'half'
	});
}

export function createWebRTCServer(
	channel: RTCDataChannel,
	handler: (request: Request) => Promise<Response> | Response
) {
	const requests = new Map<number, WebRTCConnection>();
	const textEncoder = new TextEncoder();
	const textDecoder = new TextDecoder();

	async function onConnectionMessage(requestId: number, line: Uint8Array) {
		const request = requests.get(requestId);
		if (!request) {
			const [method, path, version] = textDecoder.decode(line).split(/\s+/);
			if (method && path && version) {
				const request = createWebRTCConnection(method, path);
				requests.set(requestId, request);
				request.timeoutId = setTimeout(() => requests.delete(requestId), DEFAULT_TIMEOUT_MS);
			}
		} else {
			if (!request.readHeaders) {
				if (line[0] === R && line[1] === N) {
					request.readHeaders = true;
					handle(requestId, webRTCConnectionToNativeRequest(request));
				} else {
					const [key, value] = textDecoder.decode(line).split(/\:\s+/, 2);
					request.headers.append(key, value);
				}
			} else {
				await request.writer.ready;
				if (line[0] === R && line[1] === N) {
					request.writer.close();
					requests.delete(requestId);
					clearTimeout(request.timeoutId);
					request.timeoutId = undefined;
				} else {
					request.writer.write(line);
				}
			}
		}
	}

	async function writeResponse(requestId: number, response: Response) {
		const requestIdBytes = integerToBytes(new Uint8Array(4), requestId);
		channel.send(
			encodeLine(
				textEncoder,
				requestIdBytes,
				`${PROTOCAL} ${response.status} ${statusCodeToStatusText(response.status)}`
			)
		);
		response.headers.forEach((value, key) => {
			channel.send(encodeLine(textEncoder, requestIdBytes, `${key}: ${value}`));
		});
		channel.send(encodeLine(textEncoder, requestIdBytes, '\r\n'));
		if (response.body) {
			const reader = response.body.getReader();
			while (true) {
				const { done, value } = await reader.read();
				if (value) {
					channel.send(concatUint8Array(requestIdBytes, value));
				}
				if (done) {
					break;
				}
			}
		}
		channel.send(encodeLine(textEncoder, requestIdBytes, '\r\n'));
	}

	async function handle(requestId: number, request: Request) {
		const response = await handler(request);
		await writeResponse(requestId, response);
	}

	function onMessage(event: MessageEvent) {
		const array = new Uint8Array(event.data);
		const requestId = bytesToInteger(array);
		onConnectionMessage(requestId, array.slice(4));
	}
	channel.addEventListener('message', onMessage);

	return () => {
		channel.removeEventListener('message', onMessage);
	};
}
