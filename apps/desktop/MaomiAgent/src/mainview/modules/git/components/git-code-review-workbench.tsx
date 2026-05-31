import { GitAiReviewWorkbenchNext } from "./git-ai-review-workbench-next";

type Props = Parameters<typeof GitAiReviewWorkbenchNext>[0];

export function GitCodeReviewWorkbench(props: Omit<Props, "surface">) {
  return <GitAiReviewWorkbenchNext {...props} surface="code" />;
}
