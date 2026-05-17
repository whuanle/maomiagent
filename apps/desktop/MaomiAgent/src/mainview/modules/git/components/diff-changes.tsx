type ChangeInput = {
  additions: number;
  deletions: number;
};

type Props = {
  className?: string;
  changes: ChangeInput | ChangeInput[];
  variant?: "default" | "bars";
};

function joinClassName(...values: Array<string | undefined | false>): string | undefined {
  const next = values.filter(Boolean).join(" ");
  return next || undefined;
}

function totalizeChanges(changes: ChangeInput | ChangeInput[]): ChangeInput {
  if (Array.isArray(changes)) {
    return changes.reduce(
      (acc, item) => ({
        additions: acc.additions + (item.additions || 0),
        deletions: acc.deletions + (item.deletions || 0),
      }),
      { additions: 0, deletions: 0 },
    );
  }

  return {
    additions: changes.additions || 0,
    deletions: changes.deletions || 0,
  };
}

export function WorkspaceDiffChanges(props: Props) {
  const variant = props.variant ?? "default";
  const totals = totalizeChanges(props.changes);
  const additions = Math.max(0, totals.additions);
  const deletions = Math.max(0, totals.deletions);
  const total = additions + deletions;
  const mutedBlockColor = "#98a2b3";
  const additionBlockColor = "#16a34a";
  const deletionBlockColor = "#dc2626";

  const visibleBlocks = (() => {
    const totalBlocks = 5;

    if (additions === 0 && deletions === 0) {
      return Array.from({ length: totalBlocks }, () => mutedBlockColor);
    }

    if (total < 5) {
      const addedBlocks = additions > 0 ? 1 : 0;
      const deletedBlocks = deletions > 0 ? 1 : 0;
      return [
        ...Array.from({ length: addedBlocks }, () => additionBlockColor),
        ...Array.from({ length: deletedBlocks }, () => deletionBlockColor),
        ...Array.from({ length: totalBlocks - addedBlocks - deletedBlocks }, () => mutedBlockColor),
      ].slice(0, totalBlocks);
    }

    const ratio = additions > deletions
      ? additions / Math.max(1, deletions)
      : deletions / Math.max(1, additions);

    let blocksForColors = totalBlocks;
    if (total < 20 || ratio < 4) {
      blocksForColors = totalBlocks - 1;
    }

    const percentAdded = additions / total;
    const percentDeleted = deletions / total;
    const rawAdded = percentAdded * blocksForColors;
    const rawDeleted = percentDeleted * blocksForColors;

    let addedBlocks = additions > 0 ? Math.max(1, Math.round(rawAdded)) : 0;
    let deletedBlocks = deletions > 0 ? Math.max(1, Math.round(rawDeleted)) : 0;

    if (additions > 0 && additions <= 5) {
      addedBlocks = Math.min(addedBlocks, 1);
    } else if (additions <= 10) {
      addedBlocks = Math.min(addedBlocks, 2);
    }

    if (deletions > 0 && deletions <= 5) {
      deletedBlocks = Math.min(deletedBlocks, 1);
    } else if (deletions <= 10) {
      deletedBlocks = Math.min(deletedBlocks, 2);
    }

    const allocated = addedBlocks + deletedBlocks;
    if (allocated > blocksForColors) {
      if (rawAdded > rawDeleted) {
        addedBlocks = blocksForColors - deletedBlocks;
      } else {
        deletedBlocks = blocksForColors - addedBlocks;
      }
    }

    const neutralBlocks = Math.max(0, totalBlocks - addedBlocks - deletedBlocks);
    return [
      ...Array.from({ length: addedBlocks }, () => additionBlockColor),
      ...Array.from({ length: deletedBlocks }, () => deletionBlockColor),
      ...Array.from({ length: neutralBlocks }, () => mutedBlockColor),
    ].slice(0, totalBlocks);
  })();

  if (variant === "default" && total <= 0) {
    return null;
  }

  return (
    <div
      data-component="workspace-diff-changes"
      data-variant={variant}
      className={joinClassName("workspace-diff-changes", props.className)}
    >
      {variant === "bars" ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 14" fill="none">
          {visibleBlocks.map((color, index) => (
            <rect
              key={`${color}-${index}`}
              x={index * 4}
              width="2"
              height="14"
              rx="1"
              fill={color}
            />
          ))}
        </svg>
      ) : (
        <>
          <span data-slot="workspace-diff-additions">{`+${additions}`}</span>
          <span data-slot="workspace-diff-deletions">{`-${deletions}`}</span>
        </>
      )}
    </div>
  );
}