import { GitAiReviewWorkbenchNext } from "./git-ai-review-workbench-next";

type Props = Parameters<typeof GitAiReviewWorkbenchNext>[0];

export function GitCommitReviewWorkbench(props: Omit<Props, "surface">) {
  return <GitAiReviewWorkbenchNext {...props} surface="commit" />;
}
