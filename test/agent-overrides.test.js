const { test } = require('node:test');
const assert = require('node:assert');
const {
  getAgentOverride,
  setAgentOverride,
  clearAgentOverride,
} = require('../src/agent-overrides');

test('agent-overrides management', () => {
  const overrides = new Map();
  const chatId = 111;
  const topicId = 222;

  assert.strictEqual(getAgentOverride(overrides, chatId, topicId), undefined);

  setAgentOverride(overrides, chatId, topicId, 'claude');
  assert.strictEqual(getAgentOverride(overrides, chatId, topicId), 'claude');

  clearAgentOverride(overrides, chatId, topicId);
  assert.strictEqual(getAgentOverride(overrides, chatId, topicId), undefined);
});

test('agent-overrides - root topic', () => {
  const overrides = new Map();
  const chatId = 111;

  setAgentOverride(overrides, chatId, undefined, 'gemini');
  assert.strictEqual(getAgentOverride(overrides, chatId, undefined), 'gemini');
  assert.strictEqual(getAgentOverride(overrides, chatId, 'root'), 'gemini');
});
