"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_BUFFER_SIZE = exports.DEFAULT_TIMEOUT_MS = exports.DEFAULT_MAX_MESSAGE_SIZE = void 0;
exports.concatUint8Array = concatUint8Array;
exports.writeToUint8Array = writeToUint8Array;
exports.randomUInt32 = randomUInt32;
exports.writableStreamFromChannel = writableStreamFromChannel;
exports.write = write;
exports.bufferedWritableStream = bufferedWritableStream;
exports.readAll = readAll;
const tslib_1 = require("tslib");
const rand_1 = require("@aicacia/rand");
exports.DEFAULT_MAX_MESSAGE_SIZE = 16384;
exports.DEFAULT_TIMEOUT_MS = 60000;
exports.DEFAULT_BUFFER_SIZE = 4096;
function concatUint8Array(a, b) {
    const bytes = new Uint8Array(a.byteLength + b.byteLength);
    bytes.set(a);
    bytes.set(b, a.byteLength);
    return bytes;
}
function writeToUint8Array(buffer, offset, chunk) {
    if (chunk.byteLength >= buffer.byteLength - offset) {
        const newBuffer = new Uint8Array(buffer.byteLength * 2);
        newBuffer.set(buffer);
        newBuffer.set(chunk, offset);
        return newBuffer;
    }
    buffer.set(chunk, offset);
    return buffer;
}
function randomUInt32() {
    return (Math.random() * rand_1.MAX_INT) | 0;
}
function writableStreamFromChannel(channel, idBytes, maxChannelMessageSize) {
    return new WritableStream({
        write(chunk) {
            console.log(new TextDecoder().decode(chunk));
            write(channel, concatUint8Array(idBytes, chunk), maxChannelMessageSize);
        },
    });
}
function write(channel, chunk, maxChannelMessageSize) {
    if (chunk.byteLength < maxChannelMessageSize) {
        channel.send(chunk);
    }
    else {
        let offset = 0;
        while (offset < chunk.byteLength) {
            const length = Math.min(maxChannelMessageSize, chunk.byteLength - offset);
            channel.send(chunk.slice(offset, offset + length));
            offset += length;
        }
    }
}
function bufferedWritableStream(writableStream, bufferSize = exports.DEFAULT_BUFFER_SIZE) {
    const buffer = new Uint8Array(bufferSize);
    let bufferOffset = 0;
    const writer = writableStream.getWriter();
    function write(chunk) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (chunk.byteLength > buffer.byteLength - bufferOffset) {
                yield flush();
            }
            if (chunk.byteLength >= buffer.byteLength) {
                yield writer.write(chunk);
            }
            else {
                buffer.set(chunk, bufferOffset);
                bufferOffset += chunk.byteLength;
            }
        });
    }
    function flush() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (bufferOffset > 0) {
                yield writer.write(buffer.slice(0, bufferOffset));
                bufferOffset = 0;
            }
        });
    }
    return new WritableStream({
        write,
        close() {
            return tslib_1.__awaiter(this, void 0, void 0, function* () {
                yield flush();
                yield writer.close();
            });
        },
    });
}
function readAll(reader) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        try {
            const { done, value: bytes } = yield reader.read();
            if (done) {
                return new Uint8Array();
            }
            let result = bytes;
            while (true) {
                const { done, value: bytes } = yield reader.read();
                if (done) {
                    break;
                }
                result = concatUint8Array(result, bytes);
            }
            return result;
        }
        finally {
            reader.releaseLock();
        }
    });
}
