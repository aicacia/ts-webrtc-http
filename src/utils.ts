import { MAX_INT } from "@aicacia/rand";

export const DEFAULT_MAX_MESSAGE_SIZE = 16384;
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_BUFFER_SIZE = 4096;

export function concatUint8Array(a: Uint8Array, b: Uint8Array) {
  const bytes = new Uint8Array(a.byteLength + b.byteLength);
  bytes.set(a);
  bytes.set(b, a.byteLength);
  return bytes;
}

export function writeToUint8Array(
  buffer: Uint8Array,
  offset: number,
  chunk: Uint8Array
): Uint8Array {
  if (chunk.byteLength >= buffer.byteLength - offset) {
    const newBuffer = new Uint8Array(buffer.byteLength * 2);
    newBuffer.set(buffer);
    newBuffer.set(chunk, offset);
    return newBuffer;
  }
  buffer.set(chunk, offset);
  return buffer;
}

export function randomUInt32() {
  return (Math.random() * MAX_INT) | 0;
}

export function writableStreamFromChannel(
  channel: RTCDataChannel,
  idBytes: Uint8Array,
  maxChannelMessageSize: number
) {
  return new WritableStream({
    write(chunk: Uint8Array) {
      console.log(new TextDecoder().decode(chunk));
      write(channel, concatUint8Array(idBytes, chunk), maxChannelMessageSize);
    },
  });
}

export function write(
  channel: RTCDataChannel,
  chunk: Uint8Array,
  maxChannelMessageSize: number
) {
  if (chunk.byteLength < maxChannelMessageSize) {
    channel.send(chunk);
  } else {
    let offset = 0;
    while (offset < chunk.byteLength) {
      const length = Math.min(maxChannelMessageSize, chunk.byteLength - offset);
      channel.send(chunk.slice(offset, offset + length));
      offset += length;
    }
  }
}

export function bufferedWritableStream(
  writableStream: WritableStream<Uint8Array>,
  bufferSize = DEFAULT_BUFFER_SIZE
): WritableStream<Uint8Array> {
  const buffer = new Uint8Array(bufferSize);
  let bufferOffset = 0;
  const writer = writableStream.getWriter();
  async function write(chunk: Uint8Array) {
    if (chunk.byteLength > buffer.byteLength - bufferOffset) {
      await flush();
    }
    if (chunk.byteLength >= buffer.byteLength) {
      await writer.write(chunk);
    } else {
      buffer.set(chunk, bufferOffset);
      bufferOffset += chunk.byteLength;
    }
  }
  async function flush() {
    if (bufferOffset > 0) {
      await writer.write(buffer.slice(0, bufferOffset));
      bufferOffset = 0;
    }
  }
  return new WritableStream({
    write,
    async close() {
      await flush();
      await writer.close();
    },
  });
}

export async function readAll(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<Uint8Array> {
  try {
    const { done, value: bytes } = await reader.read();
    if (done) {
      return new Uint8Array();
    }
    let result = bytes;
    while (true) {
      const { done, value: bytes } = await reader.read();
      if (done) {
        break;
      }
      result = concatUint8Array(result, bytes);
    }
    return result;
  } finally {
    reader.releaseLock();
  }
}
