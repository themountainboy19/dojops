import type { ScanFinding } from "@dojops/scanner";

/**
 * Emits GitHub Actions annotations for scan findings.
 * When running inside GitHub Actions (GITHUB_ACTIONS env var set),
 * outputs `::error` or `::warning` annotations that appear inline
 * on pull request diffs.
 */
export function emitGitHubAnnotations(findings: ScanFinding[]): void {
  if (!process.env.GITHUB_ACTIONS) return;

  for (const finding of findings) {
    const level =
      finding.severity === "HIGH" || finding.severity === "CRITICAL" ? "error" : "warning";

    const filePart = finding.file
      ? `file=${finding.file}${finding.line ? `,line=${finding.line}` : ""}`
      : "";

    const message = finding.message
      .replace(/%/g, "%25")
      .replace(/\r/g, "%0D")
      .replace(/\n/g, "%0A");

    if (filePart) {
      console.log(`::${level} ${filePart}::${message}`);
    } else {
      console.log(`::${level}::${message}`);
    }
  }
}
