import type { CSSProperties } from "react";

import {
  getGitHistoryGraphColumnWidth,
  getGitHistoryGraphLaneX,
  type GitHistoryGraphRow,
} from "./branch-model";

const GRAPH_ROW_HEIGHT = 58;
const GRAPH_CENTER_Y = 29;
const GRAPH_BOTTOM_Y = 58;
const GRAPH_CURVE_CONTROL_Y = 24;

type Props = {
  row?: GitHistoryGraphRow;
  laneCount: number;
  isHead: boolean;
  isActive: boolean;
};

export function BranchCommitGraph(props: Props) {
  const columnWidth = getGitHistoryGraphColumnWidth(props.laneCount);
  const nodeRadius = props.isHead ? 4.4 : props.isActive ? 4 : 3.5;
  const ringRadius = props.isHead ? 7.1 : props.isActive ? 6.2 : 0;
  const strokeWidth = props.isHead ? 1.9 : props.isActive ? 1.7 : 1.35;

  return (
    <span
      className="git-page-branch-commit-graph"
      style={{ "--git-page-branch-graph-width": `${columnWidth}px` } as CSSProperties}
      aria-hidden="true"
    >
      {!props.row ? (
        <span className="git-page-branch-commit-graph-fallback" />
      ) : (
        <svg
          className="git-page-branch-commit-graph-svg"
          viewBox={`0 0 ${columnWidth} ${GRAPH_ROW_HEIGHT}`}
          preserveAspectRatio="none"
        >
          {props.row.lanesBefore.map((lane, index) => (
            <line
              key={`before:${props.row?.hash}:${lane.hash}:${index}`}
              x1={getGitHistoryGraphLaneX(index)}
              y1={0}
              x2={getGitHistoryGraphLaneX(index)}
              y2={GRAPH_CENTER_Y}
              stroke={lane.color}
              strokeOpacity={index === props.row?.nodeLane || props.isActive ? 0.96 : 0.72}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {props.row.lanesAfter.map((lane, index) => (
            <line
              key={`after:${props.row?.hash}:${lane.hash}:${index}`}
              x1={getGitHistoryGraphLaneX(index)}
              y1={GRAPH_CENTER_Y}
              x2={getGitHistoryGraphLaneX(index)}
              y2={GRAPH_BOTTOM_Y}
              stroke={lane.color}
              strokeOpacity={index === props.row?.nodeLane || props.isActive ? 0.96 : 0.72}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {props.row.transitions.map((link, index) => (
            <path
              key={`transition:${props.row?.hash}:${index}`}
              d={`M ${getGitHistoryGraphLaneX(link.from)} ${GRAPH_CENTER_Y} C ${getGitHistoryGraphLaneX(link.from)} ${GRAPH_CURVE_CONTROL_Y} ${getGitHistoryGraphLaneX(link.to)} ${GRAPH_CURVE_CONTROL_Y} ${getGitHistoryGraphLaneX(link.to)} ${GRAPH_BOTTOM_Y}`}
              fill="none"
              stroke={link.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeOpacity={0.88}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {props.row.parentEdges.map((link, index) => (
            <path
              key={`parent:${props.row?.hash}:${index}`}
              d={`M ${getGitHistoryGraphLaneX(link.from)} ${GRAPH_CENTER_Y} C ${getGitHistoryGraphLaneX(link.from)} ${GRAPH_CURVE_CONTROL_Y} ${getGitHistoryGraphLaneX(link.to)} ${GRAPH_CURVE_CONTROL_Y} ${getGitHistoryGraphLaneX(link.to)} ${GRAPH_BOTTOM_Y}`}
              fill="none"
              stroke={link.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeOpacity={0.96}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {ringRadius > 0 ? (
            <circle
              cx={getGitHistoryGraphLaneX(props.row.nodeLane)}
              cy={GRAPH_CENTER_Y}
              r={ringRadius}
              fill="var(--app-surface, #ffffff)"
              stroke={props.row.nodeColor}
              strokeWidth={1.4}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          <circle
            cx={getGitHistoryGraphLaneX(props.row.nodeLane)}
            cy={GRAPH_CENTER_Y}
            r={nodeRadius}
            fill={props.row.nodeColor}
            stroke="var(--app-surface, #ffffff)"
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </span>
  );
}