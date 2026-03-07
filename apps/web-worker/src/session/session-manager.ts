import {
  createExecutionSession,
  type ExecutionSession,
  type StepExecutionController,
  type StepLifecycleObserver,
} from '@aiwtp/playwright-adapter';
import type { Browser } from 'playwright-core';
import type { CompiledWebPlan } from '@aiwtp/web-dsl-schema';
import path from 'node:path';
import type { JobMetadata } from '../job-runner/types.js';
import { prepareArtifactCapture } from './playwright-artifact-collector.js';

export interface SessionRuntimeOptions {
  metadata: JobMetadata;
  controller?: StepExecutionController;
  observer?: StepLifecycleObserver;
}

export const openExecutionSession = async (
  browser: Browser,
  plan: CompiledWebPlan,
  options: SessionRuntimeOptions,
): Promise<ExecutionSession> => {
  const artifactRoot = path.join(
    process.env.WEB_WORKER_ARTIFACT_ROOT ?? '/tmp/aiwtp-artifacts',
    options.metadata.runId,
    options.metadata.runItemId,
    `attempt-${options.metadata.attemptNo}`,
  );
  const artifactCapture = await prepareArtifactCapture(artifactRoot, options.metadata, plan);

  return createExecutionSession({
    browser,
    contextOptions: {
      viewport: plan.browserProfile.viewport,
      storageState: plan.browserProfile.storageStateRef,
      ...artifactCapture.contextOptions,
    },
    variables: plan.runtimeVariables,
    artifacts: artifactCapture.collector,
    controller: options.controller,
    observer: options.observer,
  });
};
