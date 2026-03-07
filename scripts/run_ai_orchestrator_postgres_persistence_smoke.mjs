import assert from 'node:assert/strict';

const baseUrl = process.env.AI_ORCHESTRATOR_BASE_URL ?? 'http://127.0.0.1:8081';
const verifyThreadId = process.env.AI_ORCHESTRATOR_VERIFY_THREAD_ID?.trim() || null;

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
assertOk(health.body.storeMode === 'postgres', 'persistence smoke requires AI_ORCHESTRATOR_STORE_MODE=postgres');

if (!verifyThreadId) {
  const createdThread = await postJson('/api/v1/assistant/threads', {
    title: 'postgres persistence smoke thread',
    tenantId: 'tenant-ai-persist',
    projectId: 'project-ai-persist',
    userId: 'qa',
  });
  assertOk(createdThread.status === 201, 'thread creation failed');

  const threadId = createdThread.body.thread.id;
  const rememberTurn = await postJson(`/api/v1/assistant/threads/${threadId}/messages`, {
    content: '记住 assistant thread 已经持久化到 postgres。',
  });
  assertOk(rememberTurn.status === 200, 'remember turn failed');

  const recallTurn = await postJson(`/api/v1/assistant/threads/${threadId}/messages`, {
    content: '你记得什么？',
  });
  assertOk(recallTurn.status === 200, 'recall turn failed');
  assertOk(
    typeof recallTurn.body.assistantMessage.content === 'string'
      && recallTurn.body.assistantMessage.content.includes('assistant thread 已经持久化到 postgres'),
    'assistant recall did not include remembered fact',
  );

  const fetchedThread = await getJson(`/api/v1/assistant/threads/${threadId}`);
  assertOk(fetchedThread.status === 200, 'fetch thread failed');
  assertOk(fetchedThread.body.thread.factCount === 1, 'thread should contain 1 fact');
  assertOk(fetchedThread.body.thread.messageCount === 4, 'thread should contain 4 messages');

  console.log(JSON.stringify({
    status: 'seeded',
    threadId,
    provider: health.body.provider,
    model: health.body.model,
    storeMode: health.body.storeMode,
    factCount: fetchedThread.body.thread.factCount,
    messageCount: fetchedThread.body.thread.messageCount,
  }, null, 2));
} else {
  const fetchedThread = await getJson(`/api/v1/assistant/threads/${verifyThreadId}`);
  assertOk(fetchedThread.status === 200, 'fetch thread after restart failed');
  assertOk(fetchedThread.body.thread.factCount === 1, 'thread should still contain 1 fact after restart');
  assertOk(fetchedThread.body.thread.messageCount === 4, 'thread should still contain 4 messages after restart');
  assertOk(
    fetchedThread.body.thread.facts.some((fact) => fact.content.includes('assistant thread 已经持久化到 postgres')),
    'remembered fact missing after restart',
  );

  console.log(JSON.stringify({
    status: 'verified',
    threadId: verifyThreadId,
    provider: health.body.provider,
    model: health.body.model,
    storeMode: health.body.storeMode,
    factCount: fetchedThread.body.thread.factCount,
    messageCount: fetchedThread.body.thread.messageCount,
  }, null, 2));
}
