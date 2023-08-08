import { bytesToInteger, integerToBytes } from "@aicacia/hash";
import { N, R, concatUint8Array, encodeLine, randomUInt32 } from "./utils";

type Fetch = typeof fetch;

export type WebRTCFetch = Fetch & {
  close(): void;
};

type WebRTCResponse = {
  handled: boolean;
  readStatus: boolean;
  readHeaders: boolean;
  headers: Headers;
  status: number;
  statusText: string;
  stream: TransformStream;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  timeoutId?: ReturnType<typeof setTimeout>;
  handle: (response: Response) => void;
};

function createWebRTCResponse(
  resolve: (response: Response) => void,
  reject: (response: Response) => void,
) {
  const stream = new TransformStream();
  const webRTCResponse: WebRTCResponse = {
    handled: false,
    readStatus: false,
    readHeaders: false,
    headers: new Headers(),
    status: 200,
    statusText: "",
    stream,
    writer: stream.writable.getWriter(),
    handle(response) {
      if (webRTCResponse.handled) {
        return;
      }
      webRTCResponse.handled = true;
      clearTimeout(webRTCResponse.timeoutId);
      if (response.status >= 400) {
        reject(response);
      } else {
        resolve(response);
      }
    },
  };
  webRTCResponse.timeoutId = setTimeout(
    () => webRTCResponse.handle(new Response("Timeout", { status: 408 })),
    60000,
  );
  return webRTCResponse;
}

function WebRTCRequestToNativeResponse(
  webRTCRequest: WebRTCResponse,
): Response {
  return new Response(webRTCRequest.stream.readable, {
    status: webRTCRequest.status,
    statusText: webRTCRequest.statusText,
    headers: webRTCRequest.headers,
    // @ts-ignore
    duplex: "half",
  });
}

export function createWebRTCFetch(channel: RTCDataChannel): WebRTCFetch {
  const responses = new Map<number, WebRTCResponse>();
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  function createRequestId(
    resolve: (response: Response) => void,
    reject: (response: Response) => void,
  ) {
    let requestId = randomUInt32();
    while (responses.has(requestId)) {
      requestId = randomUInt32();
    }
    responses.set(requestId, createWebRTCResponse(resolve, reject));
    return requestId;
  }

  async function writeRequest(requestId: number, request: Request) {
    const url = new URL(request.url);
    const requestIdBytes = integerToBytes(new Uint8Array(4), requestId);
    channel.send(
      encodeLine(
        textEncoder,
        requestIdBytes,
        `${request.method} ${url.pathname + url.search} HTTP-WEBRTC/1`,
      ),
    );
    request.headers.forEach((value, key) => {
      channel.send(encodeLine(textEncoder, requestIdBytes, `${key}: ${value}`));
    });
    channel.send(encodeLine(textEncoder, requestIdBytes, "\r\n"));
    if (request.body) {
      const reader = request.body.getReader();
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
    channel.send(encodeLine(textEncoder, requestIdBytes, "\r\n"));
  }

  async function onResponseLine(requestId: number, line: Uint8Array) {
    const response = responses.get(requestId);
    if (response) {
      if (!response.readStatus) {
        response.readStatus = true;
        const [_version, status, statusText] = textDecoder
          .decode(line)
          .split(/\s+/);
        response.status = parseInt(status);
        response.statusText = statusText;
      } else if (!response.readHeaders) {
        if (line[0] === R && line[1] === N) {
          response.readHeaders = true;
          response.handle(WebRTCRequestToNativeResponse(response));
        } else {
          const [key, value] = textDecoder.decode(line).split(/\:\s+/);
          response.headers.append(key, value);
        }
      } else {
        await response.writer.ready;
        if (line[0] === R && line[1] === N) {
          response.writer.close();
          responses.delete(requestId);
        } else {
          response.writer.write(line);
        }
      }
    }
  }

  function onMessage(event: MessageEvent) {
    const array = new Uint8Array(event.data);
    const requestId = bytesToInteger(array);
    onResponseLine(requestId, array.slice(4));
  }
  channel.addEventListener("message", onMessage);

  function fetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      const request = new Request(input, init);
      writeRequest(createRequestId(resolve, reject), request);
    });
  }

  fetch.close = () => {
    channel.removeEventListener("message", onMessage);
  };

  return fetch;
}
