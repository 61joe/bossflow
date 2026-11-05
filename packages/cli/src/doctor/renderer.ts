import type { DoctorPreflightReport } from './types.js';

export function renderDoctorPreflight(report: DoctorPreflightReport): readonly string[] {
  const lines = [`Run readiness: ${report.status}`];
  for (const check of report.checks) {
    lines.push(`- ${check.label}: ${check.passed ? 'passed' : 'failed'} - ${check.detail}`);
    if (!check.passed && check.remedy !== undefined) {
      lines.push(`  Remedy: ${check.remedy}`);
    }
  }
  return lines;
}
