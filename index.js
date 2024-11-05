'use strict'

const { Readable, Writable } = require('node:stream')
const { read, write } = require('./lib/objects.js')
const assert = require('node:assert/strict')

const DATA_OFFSET = 128
const CLOSED = 2

class SharedArrayBufferReadable extends Readable {
  constructor (opts) {
    super(opts)

    assert.ok(opts.sharedArrayBuffer instanceof SharedArrayBuffer, 'sharedArrayBuffer must be an instance of SharedArrayBuffer')

    this._sharedArrayBuffer = opts.sharedArrayBuffer

    // Keep the first 4 bytes for metadata of the Readable size
    this._metaReadable = new Int32Array(this._sharedArrayBuffer, 0, 4)
    // Keep the next 8 bytes for metadata of the Writable size
    this._metaWritable = new Int32Array(this._sharedArrayBuffer, 4, 8)

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
      const chunk = read(this._sharedArrayBuffer, DATA_OFFSET)
      // Reset ._metaWritable
      Atomics.store(this._metaWritable, 0, 0)
      Atomics.notify(this._metaWritable, 0, 1)
      const more = this.push(chunk)
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
    this._metaReadable = new Int32Array(this._sharedArrayBuffer, 0, 4)
    // Keep the next 8 bytes for metadata of the Writable size
    this._metaWritable = new Int32Array(this._sharedArrayBuffer, 4, 8)

    Atomics.store(this._metaWritable, 0, 0)
  }

  _write (chunk, encoding, callback) {
    const res1 = Atomics.waitAsync(this._metaReadable, 0, 0)

    if (res1.async) {
      res1.value.then(() => {
        process.nextTick(() => {
          this._actualWrite(chunk, encoding, callback)
        })
      })
    } else {
      this._actualWrite(chunk, encoding, callback)
    }
  }

  _actualWrite (chunk, encoding, callback) {
    write(this._sharedArrayBuffer, chunk, DATA_OFFSET)
    Atomics.store(this._metaWritable, 0, 1)
    Atomics.notify(this._metaWritable, 0, 1)
    const res = Atomics.waitAsync(this._metaWritable, 0, 1)

    if (res.async) {
      res.value.then(() => {
        process.nextTick(callback)
      }).catch((err) => {
        process.nextTick(callback, err)
      })
    } else {
      process.nextTick(callback)
    }
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
