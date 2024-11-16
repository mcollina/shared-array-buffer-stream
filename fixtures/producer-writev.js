'use strict'

const { workerData } = require('node:worker_threads')
const { SharedArrayBufferWritable } = require('..')

const writable = new SharedArrayBufferWritable({
  sharedArrayBuffer: workerData.sharedArrayBuffer
})

writable.cork()
writable.write('Hello, A!')
writable.write('Hello, B!')
writable.write('Hello, C!')
writable.uncork()
writable.end()

const interval = setInterval(() => {}, 100000000)

writable.on('close', () => {
  clearInterval(interval)
})
