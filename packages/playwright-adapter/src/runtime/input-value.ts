import type { ResolvedInput } from '@aiwtp/web-dsl-schema';
import type { ExecutionSession } from '../types.js';

export const resolveInputValue = (input: ResolvedInput | undefined, session: ExecutionSession): string => {
  if (!input) {
    return '';
  }

  if (input.source === 'literal') {
    return input.value ?? '';
  }

  const resolved = session.variables.resolve(input.ref);
  return resolved == null ? '' : String(resolved);
};
