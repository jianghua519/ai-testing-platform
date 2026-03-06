import type { CompileIssue } from '@aiwtp/web-dsl-schema';
import type { DiagnosticCollector } from '../types.js';

export class BasicDiagnosticCollector implements DiagnosticCollector {
  private readonly issues: CompileIssue[] = [];

  add(issue: CompileIssue): void {
    this.issues.push(issue);
  }

  hasErrors(): boolean {
    return this.issues.some((issue) => issue.severity === 'error');
  }

  getIssues(): CompileIssue[] {
    return [...this.issues];
  }
}
