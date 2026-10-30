import type { DevelopmentSpecification } from '@bossflow/core';

export function renderSpecification(specification: DevelopmentSpecification): string {
  return [
    `# ${specification.title}`,
    '',
    '## Problem',
    '',
    specification.problem,
    '',
    '## Scope',
    '',
    renderList(specification.scope),
    '',
    '## Non-goals',
    '',
    renderList(specification.nonGoals),
    '',
    '## Acceptance criteria',
    '',
    renderList(specification.acceptanceCriteria),
    '',
    '## Constraints',
    '',
    renderList(specification.constraints),
    '',
  ].join('\n');
}

function renderList(items: readonly string[]): string {
  if (items.length === 0) {
    return '- None.';
  }

  return items.map((item) => `- ${item}`).join('\n');
}
