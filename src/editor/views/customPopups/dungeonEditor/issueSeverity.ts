import type { LintIssue } from '../../../../utility/dungeonEditor/lint';

export type Severity = LintIssue['severity'];

/** A lint range inside an editable text: start, end, and how bad it is. */
export type IssueRange = [number, number, Severity];

/** The worse of a running severity and another. */
export function worse(a: Severity | null | undefined, b: Severity): Severity {
  return a === 'error' || b === 'error' ? 'error' : 'warning';
}

/** The worst severity among issues, or null when there are none. */
export function worstSeverity(issues: readonly LintIssue[] | undefined): Severity | null {
  let s: Severity | null = null;
  for (const i of issues ?? []) {
    s = worse(s, i.severity);
    if (s === 'error') break;
  }
  return s;
}
