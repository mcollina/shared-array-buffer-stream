'use strict'

const { Readable, Writable } = require('node:stream')
const { read, write } = require('./lib/objects.js')
const assert = require('node:assert/strict')

const DATA_OFFSET = 128
const CLOSED = 2

// We are keeping the state as 64 bytes so that they sit in two different
// cache lanes and avoid false sharing
const STATE_READABLE_SIZE = 64
const STATE_WRITABLE_SIZE = 64

class SharedArrayBufferReadable extends Readable {
  constructor (opts) {
    super(opts)

    assert.ok(opts.sharedArrayBuffer instanceof SharedArrayBuffer, 'sharedArrayBuffer must be an instance of SharedArrayBuffer')

    this._sharedArrayBuffer = opts.sharedArrayBuffer
    this._worker = opts.worker

    if (this._worker) {
      this._worker.on('error', (err) => {
        this.destroy(err)
      })
      this._worker.on('exit', () => {
        this.destroy()
      })
    }

    // Keep the first 4 bytes for metadata of the Readable size
    this._metaReadable = new Int32Array(this._sharedArrayBuffer, 0, STATE_READABLE_SIZE)
    // Keep the next 8 bytes for metadata of the Writable size
    this._metaWritable = new Int32Array(this._sharedArrayBuffer, STATE_READABLE_SIZE, STATE_WRITABLE_SIZE)

    Atomics.store(this._metaReadable, 0, 0)
  }

  _read (size) {
    Atomics.store(this._metaReadable, 0, 1)
    Atomics.notify(this._metaReadable, 0, 1)

    const res = Atomics.waitAsync(this._metaWritable, 0, 0)

    const parse = () => {
      const state = Atomics.load(this._metaWritable, 0)
      if (state === CLOSED) {
        this.push(null)
        return
      }
      const chunks = read(this._sharedArrayBuffer, DATA_OFFSET)
      let more = true

      for (const chunk of chunks) {
        const buffer = Buffer.allocUnsafe(chunk.byteLength)
        chunk.copy(buffer)
        more = this.push(buffer)
      }

      // Reset ._metaWritable
      Atomics.store(this._metaWritable, 0, 0)
      // We need to notify two times because there might be two consumers
      // one from _write and one from flushSync()
      Atomics.notify(this._metaWritable, 0, 2)
      if (more) {
        Atomics.store(this._metaReadable, 0, 1)
        Atomics.notify(this._metaReadable, 0, 1)
      } else {
        Atomics.store(this._metaReadable, 0, 0)
      }
    }

    if (res.async) {
      // This promise is never rejected
      res.value.then(() => {
        return parse()
      })
    } else {
      parse()
    }
  }
}

class SharedArrayBufferWritable extends Writable {
  constructor (opts) {
    super(opts)

    assert.ok(opts.sharedArrayBuffer instanceof SharedArrayBuffer, 'sharedArrayBuffer must be an instance of SharedArrayBuffer')

    this._sharedArrayBuffer = opts.sharedArrayBuffer

    // Keep the first 4 bytes for metadata of the Readable size
    this._metaReadable = new Int32Array(this._sharedArrayBuffer, 0, STATE_READABLE_SIZE)
    // Keep the next 8 bytes for metadata of the Writable size
    this._metaWritable = new Int32Array(this._sharedArrayBuffer, STATE_READABLE_SIZE, STATE_WRITABLE_SIZE)

    Atomics.store(this._metaWritable, 0, 0)
  }

  _write (chunk, encoding, callback) {
    this._writev([{ chunk, encoding }], callback)
  }

  _writev (chunks, callback) {
    const res1 = Atomics.waitAsync(this._metaReadable, 0, 0)

    if (res1.async) {
      res1.value.then(() => {
        this._actualWrite(chunks, callback)
      })
    } else {
      this._actualWrite(chunks, callback)
    }
  }

  _actualWrite (chunks, callback) {
    const toWrite = new Array(chunks.length)
    for (let i = 0; i < chunks.length; i++) {
      toWrite[i] = chunks[i].chunk
    }
    write(this._sharedArrayBuffer, toWrite, DATA_OFFSET)
    Atomics.store(this._metaWritable, 0, 1)
    Atomics.notify(this._metaWritable, 0, 1)
    const res = Atomics.waitAsync(this._metaWritable, 0, 1)

    if (res.async) {
      res.value.then(() => {
        callback()
      }, (err) => {
        callback(err)
      })
    } else {
      callback()
    }
  }

  flushSync () {
    Atomics.wait(this._metaReadable, 0, 0)
    const buffer = this._writableState.getBuffer()

    // TODO add the timeout handling to avoid deadlocks
    Atomics.wait(this._metaWritable, 0, 1)

    const toWrite = new Array(buffer.length)
    for (let i = 0; i < buffer.length; i++) {
      toWrite[i] = buffer[i].chunk
    }

    write(this._sharedArrayBuffer, toWrite, DATA_OFFSET)
    Atomics.store(this._metaWritable, 0, 1)
    Atomics.notify(this._metaWritable, 0, 1)

    // Reset the buffer
    // https://github.com/nodejs/node/blob/58a7b0011a1858f4fde2fe553240153b39c13cd0/lib/internal/streams/writable.js#L362
    this._writableState.buffered = null
    this._writableState.bufferedIndex = 0
    this._writableState.allBuffers = true
    this._writableState.allNoop = true
  }

  _destroy (err, callback) {
    // TODO: handle errored state
    Atomics.store(this._metaWritable, 0, CLOSED)
    Atomics.notify(this._metaWritable, 0, 1)
    callback(err)
  }
}

module.exports.SharedArrayBufferReadable = SharedArrayBufferReadable
module.exports.SharedArrayBufferWritable = SharedArrayBufferWritable
