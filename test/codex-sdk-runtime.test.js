const assert = require('node:assert/strict');
const test = require('node:test');

const { createCodexSdkRuntime } = require('../src/runtimes/codex-sdk-runtime');

test('sdk runtime resumes existing thread when available', async () => {
  let resumeCalls = 0;
  const resumedThread = {
    id: () => 't-1',
    run: async () => ({ text: 'resumed-response' }),
  };

  const runtime = createCodexSdkRuntime({
    createClient: async () => ({
      resumeThread: async (threadId) => {
        resumeCalls += 1;
        assert.equal(threadId, 't-1');
        return resumedThread;
      },
      startThread: async () => {
        throw new Error('startThread should not be called');
      },
    }),
    timeoutMs: 1000,
  });

  const result = await runtime.run({ prompt: 'hello', threadId: 't-1' });
  assert.equal(result.text, 'resumed-response');
  assert.equal(result.threadId, 't-1');
  assert.equal(resumeCalls, 1);
});

test('sdk runtime creates new thread when resume fails', async () => {
  let started = 0;
  const runtime = createCodexSdkRuntime({
    createClient: async () => ({
      resumeThread: async () => {
        throw new Error('stale thread id');
      },
      startThread: async () => {
        started += 1;
        return {
          id: () => 't-new',
          run: async () => ({ text: 'fresh-thread-response' }),
        };
      },
    }),
    timeoutMs: 1000,
  });

  const result = await runtime.run({ prompt: 'hello', threadId: 'stale-id' });
  assert.equal(started, 1);
  assert.equal(result.threadId, 't-new');
  assert.equal(result.text, 'fresh-thread-response');
});

test('sdk runtime prefers final channel content from events', async () => {
  const runtime = createCodexSdkRuntime({
    createClient: async () => ({
      startThread: async () => ({
        id: () => 't-final',
        run: async () => ({
          events: [
            {
              type: 'item.completed',
              item: { type: 'message', channel: 'commentary', text: 'intermediate' },
            },
            {
              type: 'item.completed',
              item: { type: 'message', channel: 'final', text: 'final-output' },
            },
          ],
        }),
      }),
    }),
    timeoutMs: 1000,
  });

  const result = await runtime.run({ prompt: 'hello' });
  assert.equal(result.text, 'final-output');
});

test('sdk runtime throws timeout error when run takes too long', async () => {
  const runtime = createCodexSdkRuntime({
    createClient: async () => ({
      startThread: async () => ({
        id: () => 't-timeout',
        run: async () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ text: 'late' }), 50);
          }),
      }),
    }),
    timeoutMs: 1,
  });

  await assert.rejects(
    () => runtime.run({ prompt: 'hello' }),
    (err) => err && err.code === 'AIPAL_CODEX_SDK_TIMEOUT'
  );
});
