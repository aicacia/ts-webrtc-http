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

interface WebRTCRequest {
	readHeaders: boolean;
	method: string;
	path: string;
	headers: Headers;
	stream: TransformStream<Uint8Array>;
	writer: WritableStreamDefaultWriter<Uint8Array>;
	timeoutId?: ReturnType<typeof setTimeout>;
}

function createWebRTCRequest(method: string, path: string): WebRTCRequest {
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

function WebRTCRequestToNativeRequest(webRTCRequest: WebRTCRequest): Request {
	return new Request(webRTCRequest.path, {
		method: webRTCRequest.method,
		headers: webRTCRequest.headers,
		body:
			webRTCRequest.method === 'GET' || webRTCRequest.method === 'HEAD'
				? null
				: webRTCRequest.stream.readable,
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-expect-error
		duplex: 'half'
	});
}

export function createWebRTCServer(
	channel: RTCDataChannel,
	handler: (request: Request) => Promise<Response> | Response
) {
	const requests = new Map<number, WebRTCRequest>();
	const textEncoder = new TextEncoder();
	const textDecoder = new TextDecoder();

	async function onRequestLine(requestId: number, line: Uint8Array) {
		const request = requests.get(requestId);
		if (!request) {
			const [method, path, version] = textDecoder.decode(line).split(/\s+/);
			if (method && path && version) {
				const request = createWebRTCRequest(method, path);
				requests.set(requestId, request);
				request.timeoutId = setTimeout(() => requests.delete(requestId), DEFAULT_TIMEOUT_MS);
			}
		} else {
			if (!request.readHeaders) {
				if (line[0] === R && line[1] === N) {
					request.readHeaders = true;
					handle(requestId, WebRTCRequestToNativeRequest(request));
				} else {
					const [key, value] = textDecoder.decode(line).split(/\:\s+/);
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
		console.log(request);
		await writeResponse(requestId, response);
	}

	function onMessage(event: MessageEvent) {
		const array = new Uint8Array(event.data);
		const requestId = bytesToInteger(array);
		onRequestLine(requestId, array.slice(4));
	}
	channel.addEventListener('message', onMessage);

	return () => {
		channel.removeEventListener('message', onMessage);
	};
}
