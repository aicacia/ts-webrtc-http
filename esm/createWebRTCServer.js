import { bytesToInteger, integerToBytes } from '@aicacia/hash';
import { DEFAULT_TIMEOUT_MS, N, PROTOCAL, R, concatUint8Array, encodeLine, statusCodeToStatusText } from './utils';
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
export function createWebRTCServer(channel, handler) {
    const requests = new Map();
    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();
    async function writeResponse(requestId, response) {
        const requestIdBytes = integerToBytes(new Uint8Array(4), requestId);
        channel.send(encodeLine(textEncoder, requestIdBytes, `${PROTOCAL} ${response.status} ${statusCodeToStatusText(response.status)}`));
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
    async function handle(requestId, request) {
        const response = await handler(request);
        await writeResponse(requestId, response);
    }
    async function onConnectionMessage(requestId, line) {
        const request = requests.get(requestId);
        if (!request) {
            const [method, path, version] = textDecoder.decode(line).split(/\s+/);
            if (method && path && version) {
                const request = createWebRTCConnection(method, path);
                requests.set(requestId, request);
                request.timeoutId = setTimeout(() => requests.delete(requestId), DEFAULT_TIMEOUT_MS);
            }
        }
        else {
            if (!request.readHeaders) {
                if (line[0] === R && line[1] === N) {
                    request.readHeaders = true;
                    await handle(requestId, webRTCConnectionToNativeRequest(request));
                }
                else {
                    const [key, value] = textDecoder.decode(line).split(/\:\s+/, 2);
                    request.headers.append(key, value);
                }
            }
            else {
                await request.writer.ready;
                if (line[0] === R && line[1] === N) {
                    requests.delete(requestId);
                    clearTimeout(request.timeoutId);
                    request.timeoutId = undefined;
                    await request.writer.close();
                }
                else {
                    await request.writer.write(line);
                }
            }
        }
    }
    async function onMessage(event) {
        const array = new Uint8Array(event.data);
        const requestId = bytesToInteger(array);
        await onConnectionMessage(requestId, array.slice(4));
    }
    channel.addEventListener('message', onMessage);
    return () => {
        channel.removeEventListener('message', onMessage);
    };
}
