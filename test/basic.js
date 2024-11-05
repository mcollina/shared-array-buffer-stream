'use strict'

const { test } = require('node:test')
const { join } = require('node:path')
const { Worker } = require('node:worker_threads')
const { SharedArrayBufferReadable } = require('../')
const { once } = require('node:events')

test('producer to consumer', async (t) => {
  const sharedArrayBuffer = new SharedArrayBuffer(1024, {
    maxByteLength: 16 * 1024 * 1024
  })

  const worker = new Worker(join(__dirname, '..', 'fixtures', 'producer.js'), {
    workerData: { sharedArrayBuffer }
  })
  const readable = new SharedArrayBufferReadable({ sharedArrayBuffer, worker })

  for await (const chunk of readable) {
    t.assert.equal(chunk.toString(), 'Hello, World!')
  }

  await once(worker, 'exit')
})
