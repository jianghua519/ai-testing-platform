import assert from 'node:assert/strict';

const baseUrl = process.env.AI_ORCHESTRATOR_BASE_URL ?? 'http://127.0.0.1:8081';

const assertOk = (condition, message) => {
  assert.equal(condition, true, message);
};

const getJson = async (pathname) => {
  const response = await fetch(new URL(pathname, baseUrl));
  const body = await response.json();
  return { status: response.status, body };
};

const postJson = async (pathname, body) => {
  const response = await fetch(new URL(pathname, baseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return { status: response.status, body: payload };
};

const health = await getJson('/healthz');
assertOk(health.status === 200, 'healthz status should be 200');
assertOk(health.body.status === 'ok', 'healthz payload should be ok');
assertOk(health.body.provider === 'mock', 'smoke requires AI_PROVIDER=mock');

const createdThread = await postJson('/api/v1/assistant/threads', {
  title: 'mock smoke thread',
  tenantId: 'tenant-smoke',
  projectId: 'project-smoke',
});
assertOk(createdThread.status === 201, 'thread creation failed');

const threadId = createdThread.body.thread.id;

const rememberTurn = await postJson(`/api/v1/assistant/threads/${threadId}/messages`, {
  content: '记住 当前项目默认 AI provider 使用 google gemini。',
});
assertOk(rememberTurn.status === 200, 'remember turn failed');
assertOk(rememberTurn.body.thread.factCount === 1, 'fact count after remember should be 1');

const recallTurn = await postJson(`/api/v1/assistant/threads/${threadId}/messages`, {
  content: '你记得什么？',
});
assertOk(recallTurn.status === 200, 'recall turn failed');
assertOk(
  typeof recallTurn.body.assistantMessage.content === 'string'
    && recallTurn.body.assistantMessage.content.includes('当前项目默认 AI provider 使用 google gemini'),
  'assistant recall did not include remembered fact',
);

const fetchedThread = await getJson(`/api/v1/assistant/threads/${threadId}`);
assertOk(fetchedThread.status === 200, 'fetch thread failed');
assertOk(fetchedThread.body.thread.messageCount === 4, 'thread should contain 4 messages');
assertOk(fetchedThread.body.thread.factCount === 1, 'thread should contain 1 fact');

console.log(JSON.stringify({
  status: 'ok',
  threadId,
  provider: health.body.provider,
  model: health.body.model,
  factCount: fetchedThread.body.thread.factCount,
  messageCount: fetchedThread.body.thread.messageCount,
  assistantReply: recallTurn.body.assistantMessage.content,
}, null, 2));
