import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type {
  ArtifactCaptureMode,
  ArtifactReference,
  BrowserProfile,
  CompiledStep,
  CompiledWebPlan,
  PlanExecutionResult,
  StepExecutionStatus,
  StepResult,
} from '@aiwtp/web-dsl-schema';
import type { ArtifactCollector, ExecutionSession } from '@aiwtp/playwright-adapter';
import type { JobMetadata } from '../job-runner/types.js';
import { createArtifactStorageFromEnv } from './artifact-storage.js';

interface PlaywrightArtifactCollectorConfig {
  rootDir: string;
  metadata: JobMetadata;
  plan: CompiledWebPlan;
}

export interface ArtifactCaptureSetup {
  collector: PlaywrightArtifactCollector;
  contextOptions: {
    recordVideo?: {
      dir: string;
      size?: {
        width: number;
        height: number;
      };
    };
  };
}

const flattenSteps = (steps: CompiledStep[]): CompiledStep[] =>
  steps.flatMap((step) => [step, ...flattenSteps(step.children)]);

const sanitizeSegment = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'artifact';

const shouldCapture = (mode: ArtifactCaptureMode, status: StepExecutionStatus | PlanExecutionResult['status']): boolean => {
  if (status === 'skipped' || status === 'pending' || status === 'running') {
    return false;
  }
  if (mode === 'always') {
    return true;
  }
  if (mode === 'none') {
    return false;
  }
  return status === 'failed' || status === 'error' || status === 'canceled';
};

const findMaxVideoPolicy = (steps: CompiledStep[]): ArtifactCaptureMode =>
  flattenSteps(steps).reduce<ArtifactCaptureMode>((current, step) => {
    const mode = step.artifactPolicy.video;
    if (mode === 'always') {
      return 'always';
    }
    if (mode === 'on_failure' && current === 'none') {
      return 'on_failure';
    }
    return current;
  }, 'none');

export class PlaywrightArtifactCollector implements ArtifactCollector {
  private readonly stepDir: string;
  private readonly traceDir: string;
  private readonly videoDir: string;
  private readonly videoStagingDir: string;
  private readonly planVideoMode: ArtifactCaptureMode;
  private readonly storage: ReturnType<typeof createArtifactStorageFromEnv>;
  private traceStarted = false;
  private activeTraceStepId?: string;

  constructor(private readonly config: PlaywrightArtifactCollectorConfig) {
    this.stepDir = path.join(config.rootDir, 'steps');
    this.traceDir = path.join(config.rootDir, 'traces');
    this.videoDir = path.join(config.rootDir, 'videos');
    this.videoStagingDir = path.join(config.rootDir, 'video-staging');
    this.planVideoMode = findMaxVideoPolicy(config.plan.compiledSteps);
    this.storage = createArtifactStorageFromEnv(config.rootDir, config.metadata);
  }

  buildContextOptions(profile: BrowserProfile): ArtifactCaptureSetup['contextOptions'] {
    if (this.planVideoMode === 'none') {
      return {};
    }

    return {
      recordVideo: {
        dir: this.videoStagingDir,
        size: profile.viewport,
      },
    };
  }

  async beforeStep(step: CompiledStep, session: ExecutionSession): Promise<void> {
    if (step.artifactPolicy.trace === 'none') {
      return;
    }

    await mkdir(this.traceDir, { recursive: true });
    if (!this.traceStarted) {
      await session.context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
      });
      this.traceStarted = true;
    }

    await session.context.tracing.startChunk({
      name: `${sanitizeSegment(step.sourceStepId)}-${Date.now()}`,
      title: step.name,
    });
    this.activeTraceStepId = step.sourceStepId;
  }

  async collectForStep(step: CompiledStep, stepResult: StepResult, session: ExecutionSession): Promise<ArtifactReference[]> {
    const artifacts: ArtifactReference[] = [];

    const screenshotArtifact = await this.captureScreenshot(step, stepResult.status, session);
    if (screenshotArtifact) {
      artifacts.push(screenshotArtifact);
    }

    const traceArtifact = await this.captureTrace(step, stepResult.status, session);
    if (traceArtifact) {
      artifacts.push(traceArtifact);
    }

    return artifacts;
  }

  async finalizePlan(_plan: CompiledWebPlan, _planResult: PlanExecutionResult, session: ExecutionSession): Promise<ArtifactReference[]> {
    if (this.traceStarted) {
      if (this.activeTraceStepId) {
        await session.context.tracing.stopChunk();
        this.activeTraceStepId = undefined;
      }
      await session.context.tracing.stop();
      this.traceStarted = false;
    }

    return [];
  }

  async finalizeAfterContextClose(_plan: CompiledWebPlan, planResult: PlanExecutionResult, session: ExecutionSession): Promise<ArtifactReference[]> {
    if (!shouldCapture(this.planVideoMode, planResult.status)) {
      try {
        await session.page.video()?.delete();
      } catch {
        // Best-effort cleanup only.
      }
      return [];
    }

    const video = session.page.video();
    if (!video) {
      return [];
    }

    await mkdir(this.videoDir, { recursive: true });
    const targetPath = path.join(
      this.videoDir,
      `${sanitizeSegment(this.config.metadata.jobId)}-${sanitizeSegment(this.config.metadata.runItemId)}.webm`,
    );
    await video.saveAs(targetPath);
    return [
      await this.storage.persistArtifact({
        kind: 'video',
        filePath: targetPath,
        contentType: 'video/webm',
        metadata: {
          scope: 'plan',
          plan_id: this.config.plan.compiledPlanId,
          run_id: this.config.metadata.runId,
          run_item_id: this.config.metadata.runItemId,
        },
      }),
    ];
  }

  private async captureScreenshot(
    step: CompiledStep,
    status: StepExecutionStatus,
    session: ExecutionSession,
  ): Promise<ArtifactReference | undefined> {
    if (!shouldCapture(step.artifactPolicy.screenshot, status)) {
      return undefined;
    }

    try {
      await mkdir(this.stepDir, { recursive: true });
      const filePath = path.join(
        this.stepDir,
        `${sanitizeSegment(step.sourceStepId)}-${sanitizeSegment(status)}.png`,
      );
      await session.page.screenshot({ path: filePath, fullPage: true });
      return await this.storage.persistArtifact({
        kind: 'screenshot',
        filePath,
        contentType: 'image/png',
        metadata: {
          scope: 'step',
          step_id: step.sourceStepId,
          status,
        },
      });
    } catch {
      return undefined;
    }
  }

  private async captureTrace(
    step: CompiledStep,
    status: StepExecutionStatus,
    session: ExecutionSession,
  ): Promise<ArtifactReference | undefined> {
    if (!this.traceStarted || this.activeTraceStepId !== step.sourceStepId) {
      return undefined;
    }

    try {
      if (!shouldCapture(step.artifactPolicy.trace, status)) {
        await session.context.tracing.stopChunk();
        return undefined;
      }

      const filePath = path.join(
        this.traceDir,
        `${sanitizeSegment(step.sourceStepId)}-${sanitizeSegment(status)}.zip`,
      );
      await session.context.tracing.stopChunk({ path: filePath });
      return await this.storage.persistArtifact({
        kind: 'trace',
        filePath,
        contentType: 'application/zip',
        metadata: {
          scope: 'step',
          step_id: step.sourceStepId,
          status,
        },
      });
    } catch {
      return undefined;
    } finally {
      this.activeTraceStepId = undefined;
    }
  }
}

export const prepareArtifactCapture = async (
  rootDir: string,
  metadata: JobMetadata,
  plan: CompiledWebPlan,
): Promise<ArtifactCaptureSetup> => {
  const collector = new PlaywrightArtifactCollector({
    rootDir,
    metadata,
    plan,
  });
  await mkdir(rootDir, { recursive: true });
  return {
    collector,
    contextOptions: collector.buildContextOptions(plan.browserProfile),
  };
};
