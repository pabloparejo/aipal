const {
  CODEX_RUNTIME_AUTO,
  CODEX_RUNTIME_CLI,
  CODEX_RUNTIME_SDK,
  parseBooleanEnv,
  parsePositiveNumber,
  parseRuntimeMode,
} = require('./runtime-types');
const { createCodexCliRuntime } = require('./codex-cli-runtime');
const { createCodexSdkRuntime } = require('./codex-sdk-runtime');

function createCodexRuntimeManager(options = {}) {
  const {
    env = process.env,
    codexAgent,
    execLocal,
    wrapCommandWithPty,
    shellQuote,
    agentTimeoutMs,
    agentMaxBuffer,
    logger = console,
    createSdkClient,
  } = options;

  const mode = parseRuntimeMode(env.AIPAL_CODEX_RUNTIME);
  const sdkFallbackEnabled = parseBooleanEnv(
    env.AIPAL_CODEX_SDK_FALLBACK,
    true
  );
  const sdkVerbose = parseBooleanEnv(env.AIPAL_CODEX_SDK_LOG_VERBOSE, false);
  const sdkTimeoutMs = parsePositiveNumber(
    env.AIPAL_CODEX_SDK_TIMEOUT_MS,
    agentTimeoutMs
  );

  const cliRuntime = createCodexCliRuntime({
    agent: codexAgent,
    execLocal,
    wrapCommandWithPty,
    shellQuote,
    timeoutMs: agentTimeoutMs,
    maxBuffer: agentMaxBuffer,
    logger,
  });

  const sdkRuntime = createCodexSdkRuntime({
    timeoutMs: sdkTimeoutMs,
    logger,
    verbose: sdkVerbose,
    createClient: createSdkClient,
  });

  async function run(input = {}) {
    const runInput = {
      prompt: String(input.prompt || ''),
      threadId: input.threadId,
      thinking: input.thinking,
      model: input.model,
    };

    if (mode === CODEX_RUNTIME_CLI) {
      const result = await cliRuntime.run(runInput);
      return {
        ...result,
        runtime: 'codex-cli',
        fallback: false,
      };
    }

    if (mode === CODEX_RUNTIME_SDK) {
      const result = await sdkRuntime.run(runInput);
      return {
        ...result,
        runtime: 'codex-sdk',
        fallback: false,
      };
    }

    try {
      const result = await sdkRuntime.run(runInput);
      return {
        ...result,
        runtime: 'codex-sdk',
        fallback: false,
      };
    } catch (sdkErr) {
      if (!sdkFallbackEnabled) throw sdkErr;
      logger.warn(
        `Codex SDK failed, falling back to CLI reason=${sdkErr.code || 'unknown'} message=${sdkErr.message || sdkErr}`
      );
      const result = await cliRuntime.run(runInput);
      return {
        ...result,
        runtime: 'codex-cli',
        fallback: true,
        fallbackReason: sdkErr.code || 'unknown',
      };
    }
  }

  return {
    mode,
    sdkFallbackEnabled,
    sdkTimeoutMs,
    run,
    _testing: {
      cliRuntime,
      sdkRuntime,
    },
  };
}

module.exports = {
  createCodexRuntimeManager,
  CODEX_RUNTIME_AUTO,
  CODEX_RUNTIME_CLI,
  CODEX_RUNTIME_SDK,
};
