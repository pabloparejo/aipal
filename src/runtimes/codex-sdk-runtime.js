const {
  parsePositiveNumber,
} = require('./runtime-types');

function timeoutAfter(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Promise((_, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`Codex SDK run timed out after ${ms}ms`);
      err.code = 'AIPAL_CODEX_SDK_TIMEOUT';
      reject(err);
    }, ms);
    if (typeof timer.unref === 'function') timer.unref();
  });
}

async function loadSdkModule() {
  try {
    return require('@openai/codex-sdk');
  } catch (requireErr) {
    try {
      return await import('@openai/codex-sdk');
    } catch (importErr) {
      const err = new Error(
        `Unable to load @openai/codex-sdk: ${importErr.message || requireErr.message}`
      );
      err.code = 'AIPAL_CODEX_SDK_UNAVAILABLE';
      throw err;
    }
  }
}

function resolveCodexCtor(mod) {
  if (!mod) return null;
  if (typeof mod.Codex === 'function') return mod.Codex;
  if (mod.default && typeof mod.default.Codex === 'function') {
    return mod.default.Codex;
  }
  if (typeof mod.default === 'function') return mod.default;
  return null;
}

async function runWithTimeout(task, timeoutMs) {
  const timeoutPromise = timeoutAfter(timeoutMs);
  if (!timeoutPromise) return task;
  return Promise.race([task, timeoutPromise]);
}

function normalizeThreadId(result, thread) {
  if (result && typeof result.threadId === 'string' && result.threadId) {
    return result.threadId;
  }
  if (result && typeof result.thread_id === 'string' && result.thread_id) {
    return result.thread_id;
  }
  if (thread && typeof thread.id === 'function') {
    const id = thread.id();
    if (typeof id === 'string' && id) return id;
  }
  if (thread && typeof thread.id === 'string' && thread.id) {
    return thread.id;
  }
  return undefined;
}

function extractFinalFromEvents(events) {
  if (!Array.isArray(events)) return '';
  const allMessages = [];
  const finalMessages = [];

  for (const event of events) {
    if (!event || typeof event !== 'object') continue;

    if (event.type === 'item.completed' && event.item) {
      const item = event.item;
      const text = typeof item.text === 'string' ? item.text.trim() : '';
      if (!text) continue;
      allMessages.push(text);
      const channel = String(
        item.channel ||
          item.message?.channel ||
          item.metadata?.channel ||
          ''
      ).toLowerCase();
      if (channel === 'final') {
        finalMessages.push(text);
      }
      continue;
    }

    const textCandidate = [
      event.output_text,
      event.text,
      event.response,
      event.result,
      event.delta?.text,
      event.message?.text,
      event.message,
    ].find((candidate) => typeof candidate === 'string' && candidate.trim());

    if (textCandidate) {
      allMessages.push(textCandidate.trim());
    }
  }

  if (finalMessages.length > 0) return finalMessages.join('\n').trim();
  if (allMessages.length > 0) return allMessages[allMessages.length - 1].trim();
  return '';
}

function normalizeText(result) {
  if (typeof result === 'string') return result.trim();
  if (!result || typeof result !== 'object') return '';

  const direct = [
    result.output_text,
    result.text,
    result.response,
    result.result,
  ].find((candidate) => typeof candidate === 'string' && candidate.trim());
  if (direct) return direct.trim();

  const nested = [
    result.output,
    result.items,
    result.events,
    result.messages,
  ];

  for (const value of nested) {
    const parsed = extractFinalFromEvents(value);
    if (parsed) return parsed;
  }

  return '';
}

async function invokeRun(thread, prompt, options) {
  const payloads = [
    [prompt, options],
    [{ prompt, ...options }],
    [{ input: prompt, ...options }],
    [prompt],
  ];

  if (typeof thread.run === 'function') {
    for (const args of payloads) {
      try {
        return await thread.run(...args);
      } catch (err) {
        if (args !== payloads[payloads.length - 1]) continue;
        throw err;
      }
    }
  }

  if (typeof thread.execute === 'function') {
    for (const args of payloads) {
      try {
        return await thread.execute(...args);
      } catch (err) {
        if (args !== payloads[payloads.length - 1]) continue;
        throw err;
      }
    }
  }

  const err = new Error('Thread does not expose run/execute method');
  err.code = 'AIPAL_CODEX_SDK_INVALID_THREAD';
  throw err;
}

function createCodexSdkRuntime(options = {}) {
  const {
    timeoutMs,
    logger = console,
    createClient,
    verbose = false,
  } = options;

  const normalizedTimeoutMs = parsePositiveNumber(timeoutMs, 0);
  const threadCache = new Map();
  let clientPromise = null;

  async function getClient() {
    if (!clientPromise) {
      clientPromise = (async () => {
        if (typeof createClient === 'function') {
          return createClient();
        }
        const mod = await loadSdkModule();
        const CodexCtor = resolveCodexCtor(mod);
        if (typeof CodexCtor !== 'function') {
          const err = new Error('Could not find Codex export in @openai/codex-sdk');
          err.code = 'AIPAL_CODEX_SDK_INVALID_EXPORT';
          throw err;
        }
        return new CodexCtor();
      })();
    }
    return clientPromise;
  }

  async function resumeThread(client, threadId) {
    if (!threadId) return null;
    if (threadCache.has(threadId)) {
      return threadCache.get(threadId);
    }

    const resumeCandidates = [
      client.resumeThread,
      client.resume,
    ].filter((fn) => typeof fn === 'function');

    if (resumeCandidates.length === 0) return null;

    for (const resume of resumeCandidates) {
      try {
        const thread = await resume.call(client, threadId);
        threadCache.set(threadId, thread);
        return thread;
      } catch (err) {
        if (verbose) {
          logger.warn(`Codex SDK resume failed for ${threadId}: ${err.message || err}`);
        }
      }
    }

    return null;
  }

  async function startThread(client) {
    const starters = [
      client.startThread,
      client.createThread,
      client.newThread,
    ].filter((fn) => typeof fn === 'function');

    if (starters.length === 0) {
      const err = new Error('Codex SDK client does not expose startThread/createThread');
      err.code = 'AIPAL_CODEX_SDK_INVALID_CLIENT';
      throw err;
    }

    for (const starter of starters) {
      const thread = await starter.call(client);
      const threadId = normalizeThreadId(undefined, thread);
      if (threadId) {
        threadCache.set(threadId, thread);
      }
      return thread;
    }

    const err = new Error('Unable to create Codex SDK thread');
    err.code = 'AIPAL_CODEX_SDK_THREAD_START_FAILED';
    throw err;
  }

  async function run(input = {}) {
    const {
      prompt,
      threadId,
      model,
      thinking,
    } = input;

    const client = await getClient();
    let thread = await resumeThread(client, threadId);
    let resumed = Boolean(thread);
    if (!thread) {
      thread = await startThread(client);
      resumed = false;
    }

    const runOptions = {};
    if (model) runOptions.model = model;
    if (thinking) {
      runOptions.model_reasoning_effort = thinking;
      runOptions.reasoningEffort = thinking;
    }

    const result = await runWithTimeout(
      invokeRun(thread, String(prompt || ''), runOptions),
      normalizedTimeoutMs
    );

    const text = normalizeText(result);
    const resolvedThreadId = normalizeThreadId(result, thread) || threadId;
    if (resolvedThreadId && !threadCache.has(resolvedThreadId)) {
      threadCache.set(resolvedThreadId, thread);
    }

    if (!text) {
      const err = new Error('Codex SDK returned an empty response');
      err.code = 'AIPAL_CODEX_SDK_EMPTY';
      throw err;
    }

    return {
      text,
      threadId: resolvedThreadId,
      resumed,
      sawStructured: true,
      rawOutput: result,
    };
  }

  return {
    run,
    _testing: {
      normalizeText,
      normalizeThreadId,
      extractFinalFromEvents,
      threadCache,
    },
  };
}

module.exports = {
  createCodexSdkRuntime,
};
