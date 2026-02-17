function createCodexCliRuntime(options = {}) {
  const {
    agent,
    execLocal,
    wrapCommandWithPty,
    shellQuote,
    timeoutMs,
    maxBuffer,
    logger = console,
  } = options;

  if (!agent) throw new Error('Codex CLI runtime requires agent');
  if (typeof execLocal !== 'function') {
    throw new Error('Codex CLI runtime requires execLocal');
  }
  if (typeof shellQuote !== 'function') {
    throw new Error('Codex CLI runtime requires shellQuote');
  }

  async function run(input = {}) {
    const {
      prompt,
      threadId,
      thinking,
      model,
    } = input;

    const promptText = String(prompt || '');
    const promptBase64 = Buffer.from(promptText, 'utf8').toString('base64');
    const promptExpression = '"$PROMPT"';
    const agentCmd = agent.buildCommand({
      prompt: promptText,
      promptExpression,
      threadId,
      thinking,
      model,
    });

    const command = [
      `PROMPT_B64=${shellQuote(promptBase64)};`,
      'PROMPT=$(printf %s "$PROMPT_B64" | base64 --decode);',
      `${agentCmd}`,
    ].join(' ');

    let commandToRun = command;
    if (agent.needsPty) {
      commandToRun = wrapCommandWithPty(commandToRun);
    }
    if (agent.mergeStderr) {
      commandToRun = `${commandToRun} 2>&1`;
    }

    let output;
    let execError;
    try {
      output = await execLocal('bash', ['-lc', commandToRun], {
        timeout: timeoutMs,
        maxBuffer,
      });
    } catch (err) {
      execError = err;
      if (err && typeof err.stdout === 'string' && err.stdout.trim()) {
        output = err.stdout;
      } else {
        throw err;
      }
    }

    const parsed = agent.parseOutput(output);
    if (execError && !parsed.sawJson && !String(parsed.text || '').trim()) {
      throw execError;
    }
    if (execError) {
      logger.warn(
        `Codex CLI exited non-zero; returning stdout (code=${execError.code || 'unknown'})`
      );
    }

    return {
      text: parsed.text || output || '',
      threadId: parsed.threadId,
      sawStructured: Boolean(parsed.sawJson),
      rawOutput: output || '',
    };
  }

  return { run };
}

module.exports = {
  createCodexCliRuntime,
};
