const assert = require('node:assert/strict');
const test = require('node:test');

const { createCodexRuntimeManager } = require('../src/runtimes/runtime-factory');

function createMockCodexAgent() {
  return {
    id: 'codex',
    needsPty: false,
    mergeStderr: false,
    buildCommand: ({ promptExpression }) => `codex exec --json ${promptExpression}`,
    parseOutput: (output) => ({
      text: String(output || '').trim(),
      threadId: 'cli-thread',
      sawJson: true,
    }),
  };
}

test('runtime manager uses SDK in auto mode when SDK succeeds', async () => {
  const manager = createCodexRuntimeManager({
    env: {
      AIPAL_CODEX_RUNTIME: 'auto',
      AIPAL_CODEX_SDK_FALLBACK: 'true',
    },
    codexAgent: createMockCodexAgent(),
    execLocal: async () => 'cli-output',
    wrapCommandWithPty: (cmd) => cmd,
    shellQuote: (value) => `'${value}'`,
    agentTimeoutMs: 1000,
    agentMaxBuffer: 1024,
    createSdkClient: async () => ({
      startThread() {
        return {
          id: () => 'sdk-thread-1',
          run: async () => ({ text: 'sdk-output', threadId: 'sdk-thread-1' }),
        };
      },
    }),
  });

  const result = await manager.run({ prompt: 'hello' });
  assert.equal(result.runtime, 'codex-sdk');
  assert.equal(result.fallback, false);
  assert.equal(result.text, 'sdk-output');
  assert.equal(result.threadId, 'sdk-thread-1');
});

test('runtime manager falls back to CLI in auto mode when SDK fails', async () => {
  const manager = createCodexRuntimeManager({
    env: {
      AIPAL_CODEX_RUNTIME: 'auto',
      AIPAL_CODEX_SDK_FALLBACK: 'true',
    },
    codexAgent: createMockCodexAgent(),
    execLocal: async () => 'cli-output',
    wrapCommandWithPty: (cmd) => cmd,
    shellQuote: (value) => `'${value}'`,
    agentTimeoutMs: 1000,
    agentMaxBuffer: 1024,
    createSdkClient: async () => ({
      startThread() {
        return {
          run: async () => {
            const err = new Error('sdk down');
            err.code = 'AIPAL_CODEX_SDK_DOWN';
            throw err;
          },
        };
      },
    }),
  });

  const result = await manager.run({ prompt: 'hello' });
  assert.equal(result.runtime, 'codex-cli');
  assert.equal(result.fallback, true);
  assert.equal(result.text, 'cli-output');
  assert.equal(result.fallbackReason, 'AIPAL_CODEX_SDK_DOWN');
});

test('runtime manager throws on SDK errors when fallback is disabled', async () => {
  const manager = createCodexRuntimeManager({
    env: {
      AIPAL_CODEX_RUNTIME: 'auto',
      AIPAL_CODEX_SDK_FALLBACK: 'false',
    },
    codexAgent: createMockCodexAgent(),
    execLocal: async () => 'cli-output',
    wrapCommandWithPty: (cmd) => cmd,
    shellQuote: (value) => `'${value}'`,
    agentTimeoutMs: 1000,
    agentMaxBuffer: 1024,
    createSdkClient: async () => ({
      startThread() {
        return {
          run: async () => {
            const err = new Error('sdk failed');
            err.code = 'AIPAL_CODEX_SDK_FAIL';
            throw err;
          },
        };
      },
    }),
  });

  await assert.rejects(
    () => manager.run({ prompt: 'hello' }),
    (err) => err && err.code === 'AIPAL_CODEX_SDK_FAIL'
  );
});

test('runtime manager honors explicit CLI mode', async () => {
  const manager = createCodexRuntimeManager({
    env: {
      AIPAL_CODEX_RUNTIME: 'cli',
      AIPAL_CODEX_SDK_FALLBACK: 'true',
    },
    codexAgent: createMockCodexAgent(),
    execLocal: async () => 'cli-only',
    wrapCommandWithPty: (cmd) => cmd,
    shellQuote: (value) => `'${value}'`,
    agentTimeoutMs: 1000,
    agentMaxBuffer: 1024,
    createSdkClient: async () => ({
      startThread() {
        return {
          run: async () => ({ text: 'sdk-should-not-run' }),
        };
      },
    }),
  });

  const result = await manager.run({ prompt: 'hello' });
  assert.equal(result.runtime, 'codex-cli');
  assert.equal(result.text, 'cli-only');
});

test('runtime manager honors explicit SDK mode', async () => {
  const manager = createCodexRuntimeManager({
    env: {
      AIPAL_CODEX_RUNTIME: 'sdk',
      AIPAL_CODEX_SDK_FALLBACK: 'true',
    },
    codexAgent: createMockCodexAgent(),
    execLocal: async () => 'cli-should-not-run',
    wrapCommandWithPty: (cmd) => cmd,
    shellQuote: (value) => `'${value}'`,
    agentTimeoutMs: 1000,
    agentMaxBuffer: 1024,
    createSdkClient: async () => ({
      startThread() {
        return {
          id: () => 'sdk-thread-2',
          run: async () => ({ text: 'sdk-only', threadId: 'sdk-thread-2' }),
        };
      },
    }),
  });

  const result = await manager.run({ prompt: 'hello' });
  assert.equal(result.runtime, 'codex-sdk');
  assert.equal(result.fallback, false);
  assert.equal(result.text, 'sdk-only');
});
