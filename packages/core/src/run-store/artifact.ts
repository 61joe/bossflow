import type { ArtifactKind, ArtifactReference } from '../contracts/index.js';
import type { WorkflowRun } from '../workflow/index.js';

export function findActiveArtifact(
  run: WorkflowRun,
  kind: ArtifactKind,
  fileName: string,
): ArtifactReference | undefined {
  return [...(run.artifacts ?? [])]
    .reverse()
    .find(
      (artifact) =>
        artifact.kind === kind &&
        artifact.fileName === fileName &&
        artifact.supersededAt === undefined,
    );
}

export function findActiveArtifactByFileName(
  run: WorkflowRun,
  fileName: string,
): ArtifactReference | undefined {
  return [...(run.artifacts ?? [])]
    .reverse()
    .find((artifact) => artifact.fileName === fileName && artifact.supersededAt === undefined);
}
