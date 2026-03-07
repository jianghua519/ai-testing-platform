import type { EnvProfile, WebStepPlanDraft } from '@aiwtp/web-dsl-schema';

const normalizeCapability = (capability: string): string => capability.trim().toLowerCase();

export const normalizeCapabilities = (capabilities: string[]): string[] => Array.from(new Set(
  capabilities
    .map(normalizeCapability)
    .filter((capability) => capability.length > 0),
));

export const buildWebRunRequiredCapabilities = (
  plan: WebStepPlanDraft,
  envProfile: EnvProfile,
): string[] => normalizeCapabilities([
  'web',
  `browser:${envProfile.browserProfile.browser ?? plan.browserProfile.browser}`,
]);
