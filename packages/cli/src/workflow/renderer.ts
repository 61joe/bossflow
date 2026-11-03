import type { ProjectContextBundle, TechnicalPlan } from '@bossflow/core';

import type { WorkflowStatusReport } from './types.js';

export function renderTechnicalPlan(plan: TechnicalPlan): string {
  const lines = [
    '# Technical Plan',
    '',
    plan.summary,
    '',
    '## Affected Paths',
    ...plan.affectedPaths.map((affectedPath) => `- ${affectedPath}`),
    '',
    '## Tasks',
  ];
  for (const task of plan.tasks) {
    lines.push(
      '',
      `### ${task.id}: ${task.title}`,
      '',
      task.description,
      '',
      `- Dependencies: ${task.dependencies.length === 0 ? 'none' : task.dependencies.join(', ')}`,
      `- Affected paths: ${task.affectedPaths.join(', ')}`,
      `- Acceptance criteria: ${task.acceptanceCriteria.join('; ')}`,
    );
  }
  lines.push('', '## Interface Changes');
  if (plan.interfaceChanges.length === 0) {
    lines.push('- None.');
  } else {
    lines.push(...plan.interfaceChanges.map((change) => `- ${change.path}: ${change.description}`));
  }
  lines.push('', '## Risks');
  if (plan.risks.length === 0) {
    lines.push('- None.');
  } else {
    lines.push(
      ...plan.risks.map(
        (risk) => `- ${risk.severity}: ${risk.description} (Mitigation: ${risk.mitigation})`,
      ),
    );
  }
  lines.push('', '## Verification Commands');
  lines.push(
    ...plan.verificationCommands.map(
      (command) =>
        `- ${command.id}: ${[command.command, ...command.args].join(' ')} ` +
        `(${command.required ? 'required' : 'optional'}, ${command.timeoutMs} ms)`,
    ),
  );
  return `${lines.join('\n')}\n`;
}

export function renderRepositoryContext(context: ProjectContextBundle): string {
  const sections = [
    '# Project Profile',
    '```json',
    JSON.stringify(context.profile, null, 2),
    '```',
  ];
  for (const document of context.documents) {
    sections.push(
      '',
      `## ${document.path}${document.truncated ? ' (truncated)' : ''}`,
      document.content,
    );
  }
  return sections.join('\n');
}

export function renderWorkflowStatus(report: WorkflowStatusReport): string {
  const lines = [
    `Run: ${report.run.id}`,
    `Stage: ${report.run.stage}`,
    `Goal: ${report.run.goal}`,
    `Revision: ${report.run.workflowRevision ?? 1}`,
    `Artifacts: ${report.artifactLines.length}`,
    ...report.artifactLines.map((line) => `  - ${line}`),
    `Approvals: ${report.approvalLines.length}`,
    ...report.approvalLines.map((line) => `  - ${line}`),
    `Verification: ${report.verificationLine}`,
    `Review: ${report.reviewLine}`,
    `Next action: ${report.nextAction}`,
  ];
  if (report.run.failure !== undefined) {
    lines.push(`Failure: ${report.run.failure.code}: ${report.run.failure.message}`);
  }
  return `${lines.join('\n')}\n`;
}
