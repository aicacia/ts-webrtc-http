import { DEFAULT_BUFFER_SIZE, readAll, writeToUint8Array, } from "./utils";
const HEADER_REGEX = /^([^: \t]+):[ \t]*((?:.*[^ \t])|)/;
const HEADER_CONTINUE_REGEX = /^[ \t]+(.*[^ \t])/;
const REQUEST_REGEX = /^([A-Z-]+) ([^ ]+) HTTP\/(\d)\.(\d)$/;
const RESPONSE_REGEX = /^HTTP\/(\d)\.(\d) (\d{3}) ?(.*)$/;
const NEWLINE = "\n".charCodeAt(0);
const RETURN = "\r".charCodeAt(0);
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
export class HTTPRequest extends Request {
    constructor(input, init) {
        const headersInit = init?.headers;
        super(input, init);
        if (headersInit) {
            const headers = new Headers(headersInit);
            Object.defineProperty(this, "headers", {
                value: headers,
                writable: false,
            });
        }
    }
}
export async function parseHTTPRequest(reader) {
    const textReader = createTextReader(reader);
    const [method, url] = await readRequestStartLine(textReader);
    const [headers, chunked, contentLength] = await readHeaders(textReader);
    const body = streamBody(textReader, chunked, contentLength);
    return new HTTPRequest(url, {
        method,
        headers,
        body,
        mode: "same-origin",
        credentials: "include",
        // @ts-expect-error
        duplex: "half",
    });
}
export async function parseHTTPResponse(reader) {
    const textReader = createTextReader(reader);
    const [statusCode, statusText] = await readResponseStartLine(textReader);
    const [headers, chunked, contentLength] = await readHeaders(textReader);
    const body = streamBody(textReader, chunked, contentLength);
    return new Response(body, {
        status: statusCode,
        statusText: statusText,
        headers,
    });
}
export async function writeHTTPRequestOrResponse(writableStream, requestOrResponse) {
    const writer = writableStream.getWriter();
    const [request, response] = requestOrResponse instanceof Request
        ? [requestOrResponse, null]
        : [null, requestOrResponse];
    if (request) {
        await writer.write(TEXT_ENCODER.encode(`${request.method} ${request.url} HTTP/1.1\r\n`));
    }
    else {
        await writer.write(TEXT_ENCODER.encode(`HTTP/1.1 ${response.status} ${response.statusText}\r\n`));
    }
    const headers = requestOrResponse.headers;
    let contentLength = 0;
    let chunked = false;
    if (requestOrResponse.body) {
        contentLength = Number.parseInt(headers.get("Content-Length") || "0", 10);
        chunked = headers.get("Transfer-Encoding")?.toLowerCase() === "chunked";
    }
    for (const [key, value] of headers.entries()) {
        await writer.write(TEXT_ENCODER.encode(`${key}: ${value}\r\n`));
    }
    if (requestOrResponse.body) {
        if (request) {
            const body = await readAll(requestOrResponse.body.getReader());
            await writer.write(TEXT_ENCODER.encode(`Content-Length: ${body.byteLength}\r\n\r\n`));
            await writer.write(body);
            writer.releaseLock();
            writableStream.close();
        }
        else {
            await writer.write(TEXT_ENCODER.encode("\r\n"));
            writer.releaseLock();
            await streamBody(createTextReader(requestOrResponse.body.getReader()), chunked, contentLength)?.pipeTo(writableStream);
        }
    }
    else {
        await writer.write(TEXT_ENCODER.encode("\r\n"));
    }
}
async function readRequestStartLine(reader) {
    const { done, value: startLine } = await reader.readLine();
    if (done) {
        throw new Error("Unexpected end of request");
    }
    const match = REQUEST_REGEX.exec(startLine);
    if (!match) {
        throw new Error(`Invalid request line: ${startLine}`);
    }
    return [match[1], match[2], +match[3], +match[4]];
}
async function readResponseStartLine(reader) {
    const { done, value: startLine } = await reader.readLine();
    if (done) {
        throw new Error("Unexpected end of request");
    }
    const match = RESPONSE_REGEX.exec(startLine);
    if (!match) {
        throw new Error(`Invalid response line: ${startLine}`);
    }
    return [+match[3], match[4], +match[1], +match[2]];
}
async function readHeaders(reader) {
    const headers = new Headers();
    let chunked = false;
    let contentLength = 0;
    while (true) {
        const { done, value: line } = await reader.readLine();
        if (done) {
            throw new Error("Unexpected end of headers");
        }
        if (line === "") {
            break;
        }
        const match = HEADER_REGEX.exec(line);
        if (!match) {
            throw new Error(`Invalid header line: ${line}`);
        }
        let value = match[2];
        while (true) {
            const continueMatch = HEADER_CONTINUE_REGEX.exec(value);
            if (!continueMatch) {
                break;
            }
            value = continueMatch[1];
        }
        const key = match[1].toLowerCase();
        if (key === "transfer-encoding" && value.toLowerCase() === "chunked") {
            chunked = true;
        }
        else if (key === "content-length") {
            contentLength = +value;
        }
        headers.append(match[1], value);
    }
    return [headers, chunked, contentLength];
}
function streamBody(reader, chunked, contentLength) {
    if (!chunked && contentLength === 0) {
        return null;
    }
    const stream = new TransformStream();
    streamBodyFromReaderToWriter(reader, stream.writable, chunked, contentLength);
    return stream.readable;
}
async function streamBodyFromReaderToWriter(reader, writableStream, chunked, contentLength) {
    const writer = writableStream.getWriter();
    try {
        if (chunked) {
            while (true) {
                const { done, value: line } = await reader.readLine();
                if (done) {
                    throw new Error("Unexpected end of stream");
                }
                if (HEADER_REGEX.exec(line)) {
                    await reader.readLine();
                    break;
                }
                const chunkSize = Number.parseInt(line, 16);
                if (!chunkSize) {
                    break;
                }
                let bytesLeft = chunkSize;
                while (bytesLeft > 0) {
                    const { done, value: bytes } = await reader.read(chunkSize);
                    if (done) {
                        throw new Error("Unexpected end of stream");
                    }
                    bytesLeft -= bytes.byteLength;
                    await writer.write(bytes);
                }
                await reader.readLine();
            }
        }
        else {
            let bytesLeft = contentLength;
            while (bytesLeft > 0) {
                const { done, value: bytes } = await reader.read(bytesLeft);
                if (done) {
                    throw new Error("Unexpected end of stream");
                }
                bytesLeft -= bytes.byteLength;
                await writer.write(bytes);
            }
        }
    }
    finally {
        reader.releaseLock();
        writer.releaseLock();
        writableStream.close();
    }
}
function createTextReader(reader, bufferSize = DEFAULT_BUFFER_SIZE) {
    let buffer = new Uint8Array(bufferSize);
    let bufferOffset = 0;
    let bufferLength = 0;
    let doneReading = false;
    async function tryFillTo(offset) {
        if (doneReading) {
            return offset < bufferLength;
        }
        while (offset > bufferLength) {
            const { done, value: bytes } = await reader.read();
            if (done) {
                doneReading = true;
                break;
            }
            buffer = writeToUint8Array(buffer, bufferLength, bytes);
            bufferLength += bytes.byteLength;
        }
        return offset < bufferLength;
    }
    async function readLine() {
        let index = bufferOffset;
        let hasData = true;
        while (hasData) {
            if (buffer[index] === RETURN && buffer[index + 1] === NEWLINE) {
                const line = TEXT_DECODER.decode(buffer.slice(bufferOffset, index));
                bufferOffset = index + 2;
                return { done: false, value: line };
            }
            index++;
            if (index >= bufferLength) {
                hasData = await tryFillTo(index);
            }
        }
        return { done: true };
    }
    async function read(byteCount) {
        const byteLength = bufferOffset + byteCount;
        await tryFillTo(byteLength);
        const maxBytesToRead = Math.min(bufferLength - bufferOffset, byteCount);
        if (maxBytesToRead === 0) {
            return { done: true };
        }
        const bytes = buffer.slice(bufferOffset, bufferOffset + maxBytesToRead);
        bufferOffset += maxBytesToRead;
        return { done: false, value: bytes };
    }
    function releaseLock() {
        reader.releaseLock();
    }
    return {
        readLine,
        read,
        releaseLock,
    };
}
