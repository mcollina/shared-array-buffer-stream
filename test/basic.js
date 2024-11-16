'use strict'

const { test } = require('node:test')
const { join } = require('node:path')
const { Worker } = require('node:worker_threads')
const { SharedArrayBufferReadable, SharedArrayBufferWritable } = require('../')
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

test('consumer to producer', async (t) => {
  const sharedArrayBuffer = new SharedArrayBuffer(1024, {
    maxByteLength: 16 * 1024 * 1024
  })

  const worker = new Worker(join(__dirname, '..', 'fixtures', 'consumer.js'), {
    workerData: { sharedArrayBuffer }
  })
  const writable = new SharedArrayBufferWritable({ sharedArrayBuffer, worker })

  writable.write('Hello, World!')
  writable.end()

  const [{ chunks }] = await once(worker, 'message')
  t.assert.deepEqual(chunks, [Buffer.from('Hello, World!')])

  await once(worker, 'exit')
})

test('flushSync', async (t) => {
  t.plan(4)

  const sharedArrayBuffer = new SharedArrayBuffer(1024, {
    maxByteLength: 16 * 1024 * 1024
  })

  const worker = new Worker(join(__dirname, '..', 'fixtures', 'producer-flushSync.js'), {
    workerData: { sharedArrayBuffer }
  })
  const readable = new SharedArrayBufferReadable({ sharedArrayBuffer, worker, objectMode: true })

  const expected = [
    'Hello, A!',
    'Hello, B!',
    'Hello, C!'
  ]

  try {
    for await (const chunk of readable) {
      t.assert.equal(chunk.toString(), expected.shift())
    }
  } catch (err) {
    t.assert.equal(err.code, 'ERR_STREAM_PREMATURE_CLOSE')
  }
})

test('writev', async (t) => {
  t.plan(3)

  const sharedArrayBuffer = new SharedArrayBuffer(1024, {
    maxByteLength: 16 * 1024 * 1024
  })

  const worker = new Worker(join(__dirname, '..', 'fixtures', 'producer-writev.js'), {
    workerData: { sharedArrayBuffer }
  })
  const readable = new SharedArrayBufferReadable({ sharedArrayBuffer, worker, objectMode: true })

  const expected = [
    'Hello, A!',
    'Hello, B!',
    'Hello, C!'
  ]

  for await (const chunk of readable) {
    t.assert.equal(chunk.toString(), expected.shift())
  }
})
