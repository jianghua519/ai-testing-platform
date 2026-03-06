import type { CompileIssue } from '@aiwtp/web-dsl-schema';
import { createCompileContext } from './context.js';
import { buildCompileResponse } from './emitters/build-compile-response.js';
import { bindExecution } from './phases/bind-execution.js';
import { finalize } from './phases/finalize.js';
import { injectDefaults } from './phases/inject-defaults.js';
import { lowerControlFlow } from './phases/lower-control-flow.js';
import { normalize } from './phases/normalize.js';
import { resolveReferences } from './phases/resolve-references.js';
import { schemaValidate } from './phases/schema-validate.js';
import type { CompileRequest, CompileResponse, DslCompiler } from './types.js';

export class DefaultDslCompiler implements DslCompiler {
  async compile(request: CompileRequest): Promise<CompileResponse> {
    const context = createCompileContext(request);
    schemaValidate(context);

    if (context.diagnostics.hasErrors()) {
      return buildCompileResponse(context);
    }

    normalize(context);
    injectDefaults(context);
    resolveReferences(context);
    lowerControlFlow(context);
    bindExecution(context);
    finalize(context);

    return buildCompileResponse(context);
  }

  async validate(request: CompileRequest): Promise<CompileIssue[]> {
    const context = createCompileContext(request);
    schemaValidate(context);
    return context.diagnostics.getIssues();
  }
}
