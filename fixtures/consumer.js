'use strict'

const { workerData, parentPort } = require('node:worker_threads')
const { SharedArrayBufferReadable } = require('..')

const readable = new SharedArrayBufferReadable({
  sharedArrayBuffer: workerData.sharedArrayBuffer
})

const chunks = []
readable.on('data', (chunk) => {
  chunks.push(chunk)
})

const interval = setInterval(() => {}, 100000000)

readable.on('end', () => {
  clearInterval(interval)
  parentPort.postMessage({ chunks })
})
