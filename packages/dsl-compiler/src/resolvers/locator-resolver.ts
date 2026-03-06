import type { LocatorDraft, ResolvedLocator } from '@aiwtp/web-dsl-schema';
import type { CompileContext } from '../types.js';

const toStabilityRank = (strategy: LocatorDraft['strategy']): ResolvedLocator['stabilityRank'] => {
  switch (strategy) {
    case 'role':
    case 'label':
    case 'test_id':
      return 'preferred';
    case 'text':
    case 'placeholder':
      return 'acceptable';
    default:
      return 'fragile';
  }
};

export const resolveLocator = (locator: LocatorDraft | undefined, _context: CompileContext): ResolvedLocator | undefined => {
  if (!locator) {
    return undefined;
  }

  return {
    strategy: locator.strategy,
    value: locator.value.trim(),
    framePath: locator.options?.framePath ?? [],
    nth: locator.options?.nth,
    stabilityRank: toStabilityRank(locator.strategy),
  };
};
