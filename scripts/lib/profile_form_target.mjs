import http from 'node:http';
import { once } from 'node:events';

const readRequestBody = (request) =>
  new Promise((resolve, reject) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => resolve(raw));
    request.on('error', reject);
  });

export const startProfileFormTargetServer = async ({
  bindHost = '0.0.0.0',
  publicHost = '127.0.0.1',
  title = 'AI Orchestrator Workflow Smoke',
} = {}) => {
  const submissions = [];
  const hits = [];

  const renderHomePage = () => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <a href="/profile-form">开始填写资料</a>
    </main>
  </body>
</html>`;

  const renderProfileFormPage = () => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>Profile Form</title>
  </head>
  <body>
    <main>
      <h1>资料表单</h1>
      <form id="profile-form">
        <label>
          Display Name
          <input id="display-name" aria-label="Display Name" type="text" />
        </label>
        <label>
          Avatar
          <input id="avatar-file" aria-label="Avatar" type="file" />
        </label>
        <button type="submit">保存资料</button>
      </form>
      <section id="result-banner" data-status="idle" hidden>
        <p id="result-message"></p>
        <p id="result-file"></p>
      </section>
    </main>
    <script>
      document.getElementById('profile-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const displayName = document.getElementById('display-name').value;
        const fileInput = document.getElementById('avatar-file');
        const selectedFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        const response = await fetch('/submit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            displayName,
            fileName: selectedFile ? selectedFile.name : null,
          }),
        });
        const payload = await response.json();
        const banner = document.getElementById('result-banner');
        banner.hidden = false;
        banner.dataset.status = 'saved';
        document.getElementById('result-message').textContent = payload.message;
        document.getElementById('result-file').textContent = payload.fileName || 'none';
      });
    </script>
  </body>
</html>`;

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    hits.push({
      method: request.method ?? 'GET',
      pathname: url.pathname,
      at: new Date().toISOString(),
    });

    if ((request.method ?? 'GET') === 'GET' && (url.pathname === '/' || url.pathname === '/home')) {
      response.statusCode = 200;
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(renderHomePage());
      return;
    }

    if ((request.method ?? 'GET') === 'GET' && url.pathname === '/profile-form') {
      response.statusCode = 200;
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(renderProfileFormPage());
      return;
    }

    if ((request.method ?? 'GET') === 'POST' && url.pathname === '/submit') {
      const rawBody = await readRequestBody(request);
      const body = rawBody ? JSON.parse(rawBody) : {};
      submissions.push({
        displayName: body.displayName ?? null,
        fileName: body.fileName ?? null,
      });
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({
        ok: true,
        message: `已保存 ${body.displayName ?? ''}`.trim(),
        fileName: body.fileName ?? null,
      }));
      return;
    }

    response.statusCode = 404;
    response.setHeader('content-type', 'text/plain; charset=utf-8');
    response.end('Not Found');
  });

  server.listen(0, bindHost);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('target server failed to bind to an ephemeral port');
  }

  return {
    port: address.port,
    submissions,
    hits,
    getBaseUrl(hostname = publicHost) {
      return `http://${hostname}:${address.port}`;
    },
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
};
