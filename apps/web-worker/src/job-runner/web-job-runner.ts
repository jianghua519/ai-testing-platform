import { DefaultDslCompiler } from '@aiwtp/dsl-compiler';
import { RegistryBasedPlaywrightAdapter, type StepExecutionController } from '@aiwtp/playwright-adapter';
import type { CompileResponse } from '@aiwtp/dsl-compiler';
import type { JobMetadata, WebWorkerJob, WebWorkerResult } from './types.js';
import type { ResultPublisher } from '../reporting/types.js';
import type { BrowserLauncher } from '../session/browser-launcher.js';
import { openExecutionSession } from '../session/session-manager.js';
import { PublishingStepObserver } from '../reporting/step-result-observer.js';
import type { StepControllerFactory, StepControllerProvider } from '../control/types.js';

const buildMetadata = (job: WebWorkerJob): JobMetadata => ({
  jobId: job.jobId,
  runId: job.runId,
  runItemId: job.runItemId,
  attemptNo: job.attemptNo,
  tenantId: job.tenantId,
  projectId: job.projectId,
  traceId: job.traceId,
  correlationId: job.correlationId,
});

const isControllerFactory = (
  provider?: StepControllerProvider,
): provider is StepControllerFactory => Boolean(provider && typeof provider === 'object' && 'create' in provider && typeof provider.create === 'function');

const resolveController = (
  provider: StepControllerProvider | undefined,
  metadata: JobMetadata,
): StepExecutionController | undefined => {
  if (!provider) {
    return undefined;
  }

  return isControllerFactory(provider) ? provider.create(metadata) : provider;
};

export class WebJobRunner {
  constructor(
    private readonly compiler = new DefaultDslCompiler(),
    private readonly adapter = new RegistryBasedPlaywrightAdapter(),
    private readonly publisher: ResultPublisher,
    private readonly browserLauncher: BrowserLauncher,
    private readonly controllerProvider?: StepControllerProvider,
  ) {}

  async run(job: WebWorkerJob): Promise<WebWorkerResult> {
    const metadata = buildMetadata(job);
    const controller = resolveController(this.controllerProvider, metadata);
    const compileResponse: CompileResponse = await this.compiler.compile({
      sourcePlan: job.plan,
      envProfile: job.envProfile,
      variableContext: job.variableContext,
    });

    if (!compileResponse.compiledPlan) {
      const result: WebWorkerResult = {
        metadata,
        status: 'compile_failed',
        issues: compileResponse.issues,
      };
      await this.publisher.publish(result);
      return result;
    }

    const browser = await this.browserLauncher.launch(compileResponse.compiledPlan.browserProfile);
    try {
      const session = await openExecutionSession(browser, compileResponse.compiledPlan, {
        controller,
        observer: new PublishingStepObserver(metadata, this.publisher),
      });
      try {
        const output = await this.adapter.executePlan(compileResponse.compiledPlan, session);
        const status = output.planResult.status === 'passed' ? 'executed' : 'execution_failed';
        const result: WebWorkerResult = {
          metadata,
          status,
          issues: compileResponse.issues,
          planResult: output.planResult,
        };
        await this.publisher.publish(result);
        return result;
      } finally {
        await session.context.close();
      }
    } finally {
      await browser.close();
    }
  }
}
