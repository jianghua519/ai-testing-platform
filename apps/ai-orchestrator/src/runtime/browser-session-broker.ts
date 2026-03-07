import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { HumanMessage, isAIMessage } from '@langchain/core/messages';
import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { z } from 'zod';

import type {
  ExplorationArtifact,
  ExplorationExecutionMode,
  ExplorationRecordingEvent,
  ExplorationSession,
} from '../types.js';
import type { AiOrchestratorConfig } from './config.js';
import { createToolCapableChatModel } from './providers.js';

const require = createRequire(import.meta.url);

interface SessionRuntime {
  client: MultiServerMCPClient;
  tools: DynamicStructuredTool[];
  outputDir: string;
}

export interface BrowserSessionRecordStepContext {
  recordingId: string;
  appendEvent(event: ExplorationRecordingEvent): Promise<void>;
  updateSampleDataset(values: Record<string, unknown>): Promise<void>;
}

export interface RunExplorationOptions {
  exploration: ExplorationSession;
  executionMode: ExplorationExecutionMode;
  instruction: string;
  startUrl: string;
  scriptProfile?: string;
  recordStepContext: BrowserSessionRecordStepContext;
}

export interface BrowserExplorationResult {
  summary: string;
  lastSnapshotMarkdown: string | null;
  sampleDataset: Record<string, unknown>;
}

export interface BrowserAssistResult {
  reply: string;
  lastSnapshotMarkdown: string | null;
}

const MCP_SERVER_NAME = 'playwright';

const RECORD_STEP_TOOL_SCHEMA = z.object({
  eventType: z.enum(['open', 'click', 'input', 'upload', 'assert', 'wait']),
  pageUrl: z.string().optional(),
  locatorStrategy: z.enum(['text', 'label', 'placeholder', 'test_id', 'css', 'xpath']).optional(),
  locatorValue: z.string().optional(),
  payload: z.record(z.string(), z.any()).optional(),
});

const normalizeToolOutput = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeToolOutput(item)).join('\n').trim();
  }

  if (value && typeof value === 'object') {
    if ('content' in value) {
      return normalizeToolOutput((value as { content: unknown }).content);
    }

    return JSON.stringify(value, null, 2);
  }

  return String(value ?? '').trim();
};

const mergeSampleDataset = (
  current: Record<string, unknown>,
  event: ExplorationRecordingEvent,
): Record<string, unknown> => {
  const payload = event.payload ?? {};
  const next = { ...current };
  const variableKey = typeof payload.variable_key === 'string' ? payload.variable_key : null;
  const fileKey = typeof payload.file_key === 'string' ? payload.file_key : null;
  if (variableKey && payload.value !== undefined) {
    next[variableKey] = payload.value;
  }
  if (fileKey && payload.value !== undefined) {
    next[fileKey] = payload.value;
  }
  return next;
};

const quoteCode = (value: string): string => JSON.stringify(value);

const findChromiumExecutable = async (explicitPath: string | null): Promise<string | null> => {
  if (explicitPath && existsSync(explicitPath)) {
    return explicitPath;
  }

  const roots = ['/ms-playwright', '/opt/microsoft/msedge', '/usr/bin'];
  for (const root of roots) {
    if (!existsSync(root)) {
      continue;
    }

    if (root === '/usr/bin') {
      for (const candidate of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
        const fullPath = path.join(root, candidate);
        if (existsSync(fullPath)) {
          return fullPath;
        }
      }
      continue;
    }

    const directories = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const directory of directories) {
      if (!directory.isDirectory() || !directory.name.startsWith('chromium-')) {
        continue;
      }

      const candidates = [
        path.join(root, directory.name, 'chrome-linux', 'chrome'),
        path.join(root, directory.name, 'chrome-linux64', 'chrome'),
      ];
      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }

  return null;
};

const listFilesRecursively = async (root: string): Promise<string[]> => {
  const output: string[] = [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      output.push(...await listFilesRecursively(fullPath));
      continue;
    }
    if (entry.isFile()) {
      output.push(fullPath);
    }
  }
  return output;
};

const classifyArtifactKind = (filePath: string): ExplorationArtifact['kind'] => {
  if (filePath.endsWith('.zip')) {
    return 'trace';
  }
  if (filePath.endsWith('.webm')) {
    return 'video';
  }
  if (filePath.endsWith('.png')) {
    return 'screenshot';
  }
  if (filePath.endsWith('.md')) {
    return 'snapshot';
  }
  if (filePath.endsWith('console.jsonl') || filePath.includes('console')) {
    return 'console';
  }
  if (filePath.endsWith('network.jsonl') || filePath.includes('network')) {
    return 'network';
  }
  if (filePath.endsWith('session.json')) {
    return 'session';
  }
  return 'other';
};

export class BrowserSessionBroker {
  readonly #config: AiOrchestratorConfig;
  readonly #sessions = new Map<string, SessionRuntime>();

  constructor(config: AiOrchestratorConfig) {
    this.#config = config;
  }

  async close(): Promise<void> {
    for (const explorationId of [...this.#sessions.keys()]) {
      await this.stopSession(explorationId).catch(() => {
        // Best-effort cleanup.
      });
    }
  }

  async runExploration(options: RunExplorationOptions): Promise<BrowserExplorationResult> {
    const session = await this.#ensureSession(options.exploration.id);
    const browserTools = session.tools;
    const snapshotTool = this.#getTool(browserTools, 'browser_snapshot');
    const navigateTool = this.#getTool(browserTools, 'browser_navigate');

    let sampleDataset = { ...options.exploration.sampleDataset };
    const recordStep = tool(async (input) => {
      const event: ExplorationRecordingEvent = {
        eventType: input.eventType,
        pageUrl: input.pageUrl,
        locator: input.locatorStrategy && input.locatorValue
          ? { strategy: input.locatorStrategy, value: input.locatorValue }
          : undefined,
        payload: input.payload ? structuredClone(input.payload) as Record<string, unknown> : undefined,
        capturedAt: new Date().toISOString(),
      };
      sampleDataset = mergeSampleDataset(sampleDataset, event);
      await options.recordStepContext.appendEvent(event);
      await options.recordStepContext.updateSampleDataset(sampleDataset);
      return JSON.stringify({ accepted: true, eventType: event.eventType });
    }, {
      name: 'record_step',
      description: 'Persist one deterministic recording step after a browser action or assertion.',
      schema: RECORD_STEP_TOOL_SCHEMA,
    });

    if (options.executionMode === 'scripted' || this.#config.provider === 'mock') {
      await this.#runScriptedProfileFlow(session.tools, options.startUrl, recordStep, options.scriptProfile);
      const snapshot = normalizeToolOutput(await snapshotTool.invoke({}));
      return {
        summary: 'Scripted Playwright MCP exploration completed.',
        lastSnapshotMarkdown: snapshot || null,
        sampleDataset,
      };
    }

    const model = createToolCapableChatModel(this.#config);
    if (!model) {
      throw new Error('tool-capable chat model is required for AI exploration');
    }

    await navigateTool.invoke({ url: options.startUrl });
    await recordStep.invoke({
      eventType: 'open',
      pageUrl: options.startUrl,
      payload: { url: options.startUrl },
    });

    const agent = createReactAgent({
      llm: model,
      tools: [...browserTools, recordStep],
      prompt: [
        'You are exploring a browser to create deterministic test recording events.',
        'Use browser tools to inspect and interact with the current page.',
        'Immediately after every business-relevant action or assertion, call record_step.',
        'Prefer stable locators in this order: label, text, test_id, css.',
        'For typed inputs, include payload.variable_key and payload.value.',
        'For uploads, include payload.file_key and payload.value.',
        'For assertions, use payload.assertions with operators like url_contains, text_contains, visible.',
        'Do not call browser_close during exploration. Stop when the user goal is complete.',
      ].join('\n'),
    });

    const result = await agent.invoke({
      messages: [
        new HumanMessage([
          `Start URL: ${options.startUrl}`,
          `Instruction: ${options.instruction}`,
          'The browser is already on the start URL. Complete the target flow and record every deterministic step.',
        ].join('\n')),
      ],
    });
    const lastAiMessage = [...result.messages].reverse().find(isAIMessage);
    const snapshot = normalizeToolOutput(await snapshotTool.invoke({}));
    return {
      summary: normalizeToolOutput(lastAiMessage?.content) || 'AI exploration completed.',
      lastSnapshotMarkdown: snapshot || null,
      sampleDataset,
    };
  }

  async runBrowserAssist(exploration: ExplorationSession, instruction: string): Promise<BrowserAssistResult> {
    const session = await this.#ensureSession(exploration.id);
    const snapshotTool = this.#getTool(session.tools, 'browser_snapshot');

    if (this.#config.provider === 'mock') {
      const snapshot = normalizeToolOutput(await snapshotTool.invoke({}));
      return {
        reply: snapshot ? `当前页面快照如下：\n${snapshot}` : '当前页面没有可读快照。',
        lastSnapshotMarkdown: snapshot || null,
      };
    }

    const model = createToolCapableChatModel(this.#config);
    if (!model) {
      throw new Error('tool-capable chat model is required for browser assist');
    }

    const agent = createReactAgent({
      llm: model,
      tools: session.tools,
      prompt: [
        'You are a browser assistant operating on an already-open Playwright MCP session.',
        'Use browser tools to inspect or act based on the user instruction.',
        'Do not close the browser.',
      ].join('\n'),
    });

    const result = await agent.invoke({
      messages: [new HumanMessage(instruction)],
    });
    const lastAiMessage = [...result.messages].reverse().find(isAIMessage);
    const snapshot = normalizeToolOutput(await snapshotTool.invoke({}));
    return {
      reply: normalizeToolOutput(lastAiMessage?.content) || 'Browser assist completed.',
      lastSnapshotMarkdown: snapshot || null,
    };
  }

  async stopSession(explorationId: string): Promise<ExplorationArtifact[]> {
    const session = this.#sessions.get(explorationId);
    if (!session) {
      return [];
    }

    try {
      const closeTool = session.tools.find((item) => item.name === 'browser_close');
      if (closeTool) {
        await closeTool.invoke({});
      }
    } catch {
      // Ignore close errors; client.close still runs below.
    }

    await session.client.close();
    this.#sessions.delete(explorationId);

    const files = await listFilesRecursively(session.outputDir);
    const artifacts: ExplorationArtifact[] = [];
    for (const filePath of files) {
      const fileStat = await stat(filePath).catch(() => null);
      artifacts.push({
        kind: classifyArtifactKind(filePath),
        path: filePath,
        sizeBytes: fileStat?.size ?? null,
      });
    }
    return artifacts.sort((left, right) => left.path.localeCompare(right.path));
  }

  async #ensureSession(explorationId: string): Promise<SessionRuntime> {
    const existing = this.#sessions.get(explorationId);
    if (existing) {
      return existing;
    }

    const runtime = await this.#createSessionRuntime(explorationId);
    this.#sessions.set(explorationId, runtime);
    return runtime;
  }

  async #createSessionRuntime(explorationId: string): Promise<SessionRuntime> {
    const outputRoot = this.#config.playwrightOutputRoot || os.tmpdir();
    await mkdir(outputRoot, { recursive: true });
    const outputDir = await mkdtemp(path.join(outputRoot, `${explorationId}-`));
    const executablePath = await findChromiumExecutable(this.#config.playwrightExecutablePath);
    const cliPath = path.join(
      path.dirname(require.resolve('@playwright/mcp/package.json')),
      'cli.js',
    );
    const args = [
      cliPath,
      '--isolated',
      '--allow-unrestricted-file-access',
      '--output-mode',
      'file',
      '--output-dir',
      outputDir,
      '--save-video',
      `${this.#config.playwrightVideoWidth}x${this.#config.playwrightVideoHeight}`,
      '--browser',
      this.#config.playwrightBrowser,
    ];
    if (this.#config.playwrightHeadless) {
      args.push('--headless');
    }
    if (this.#config.playwrightSaveTrace) {
      args.push('--save-trace');
    }
    if (executablePath) {
      args.push('--executable-path', executablePath);
    }

    const client = new MultiServerMCPClient({
      prefixToolNameWithServerName: false,
      throwOnLoadError: true,
      useStandardContentBlocks: true,
      mcpServers: {
        [MCP_SERVER_NAME]: {
          transport: 'stdio',
          command: process.execPath,
          args,
          cwd: process.cwd(),
          env: {
            ...Object.fromEntries(
              Object.entries(process.env)
                .filter(([key, value]) => typeof value === 'string')
                .map(([key, value]) => [key, value as string]),
            ),
            PLAYWRIGHT_MCP_HEADLESS: this.#config.playwrightHeadless ? '1' : '0',
          },
        },
      },
    });
    const tools = await client.getTools(MCP_SERVER_NAME);
    return {
      client,
      tools,
      outputDir,
    };
  }

  async #runScriptedProfileFlow(
    tools: DynamicStructuredTool[],
    startUrl: string,
    recordStep: DynamicStructuredTool,
    scriptProfile: string | undefined,
  ): Promise<void> {
    if (scriptProfile && scriptProfile !== 'profile_form') {
      throw new Error(`unsupported scripted exploration profile: ${scriptProfile}`);
    }

    const navigate = this.#getTool(tools, 'browser_navigate');
    const runCode = this.#getTool(tools, 'browser_run_code');
    const waitFor = this.#getTool(tools, 'browser_wait_for');
    const uploadPath = process.env.AI_ORCHESTRATOR_SCRIPTED_UPLOAD_PATH ?? '/tmp/ai-orchestrator-avatar-smoke.txt';

    await navigate.invoke({ url: startUrl });
    await recordStep.invoke({
      eventType: 'open',
      pageUrl: startUrl,
      payload: { url: startUrl },
    });

    await runCode.invoke({
      code: `async (page) => {
        await page.getByRole('link', { name: ${quoteCode('开始填写资料')} }).click();
        return page.url();
      }`,
    });
    await recordStep.invoke({
      eventType: 'click',
      locatorStrategy: 'text',
      locatorValue: '开始填写资料',
    });

    await runCode.invoke({
      code: `async (page) => {
        await page.getByLabel(${quoteCode('Display Name')}).fill(${quoteCode('Smoke User')});
        await page.getByLabel(${quoteCode('Avatar')}).setInputFiles(${quoteCode(uploadPath)});
        return true;
      }`,
    });
    await recordStep.invoke({
      eventType: 'input',
      locatorStrategy: 'label',
      locatorValue: 'Display Name',
      payload: {
        variable_key: 'displayName',
        value: 'Smoke User',
      },
    });
    await recordStep.invoke({
      eventType: 'upload',
      locatorStrategy: 'label',
      locatorValue: 'Avatar',
      payload: {
        file_key: 'avatarFilePath',
        value: uploadPath,
      },
    });

    await runCode.invoke({
      code: `async (page) => {
        await page.getByRole('button', { name: ${quoteCode('保存资料')} }).click();
        return true;
      }`,
    });
    await recordStep.invoke({
      eventType: 'click',
      locatorStrategy: 'text',
      locatorValue: '保存资料',
    });

    await waitFor.invoke({ text: '已保存' });
    await recordStep.invoke({
      eventType: 'assert',
      payload: {
        assertions: [
          { operator: 'url_contains', expected: '/profile-form' },
          { operator: 'text_contains', expected: '已保存', locator: { strategy: 'text', value: '已保存' } },
        ],
      },
    });
  }

  #getTool(tools: DynamicStructuredTool[], name: string): DynamicStructuredTool {
    const toolInstance = tools.find((item) => item.name === name);
    if (!toolInstance) {
      throw new Error(`missing Playwright MCP tool: ${name}`);
    }

    return toolInstance;
  }
}
