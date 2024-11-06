'use strict'

const { workerData } = require('node:worker_threads')
const { SharedArrayBufferWritable } = require('..')

const writable = new SharedArrayBufferWritable({
  sharedArrayBuffer: workerData.sharedArrayBuffer
})

writable.write('Hello, A!')
writable.write('Hello, B!')
writable.write('Hello, C!')
writable.flushSync()
writable.end()
