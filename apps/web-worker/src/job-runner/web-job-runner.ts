import { DefaultDslCompiler } from '@aiwtp/dsl-compiler';
import { RegistryBasedPlaywrightAdapter } from '@aiwtp/playwright-adapter';
import type { CompileResponse } from '@aiwtp/dsl-compiler';
import type { JobMetadata, WebWorkerJob, WebWorkerResult } from './types.js';
import type { ResultPublisher } from '../reporting/types.js';
import type { BrowserLauncher } from '../session/browser-launcher.js';
import { openExecutionSession } from '../session/session-manager.js';

const buildMetadata = (job: WebWorkerJob): JobMetadata => ({
  jobId: job.jobId,
  runId: job.runId,
  tenantId: job.tenantId,
  projectId: job.projectId,
});

export class WebJobRunner {
  constructor(
    private readonly compiler = new DefaultDslCompiler(),
    private readonly adapter = new RegistryBasedPlaywrightAdapter(),
    private readonly publisher: ResultPublisher,
    private readonly browserLauncher: BrowserLauncher,
  ) {}

  async run(job: WebWorkerJob): Promise<WebWorkerResult> {
    const metadata = buildMetadata(job);
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
      const session = await openExecutionSession(browser, compileResponse.compiledPlan);
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
