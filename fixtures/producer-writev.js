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
writable.write('Hello, D!')
writable.cork()
writable.write('Hello, E!')
writable.write('Hello, F!')
writable.write('Hello, G!')
writable.uncork()
writable.end()

const interval = setInterval(() => {}, 100000000)

writable.on('close', () => {
  clearInterval(interval)
})
