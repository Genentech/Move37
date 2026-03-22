import { useEffect, useMemo, useRef, useState } from "react";
import {
  useActivityGraph,
  useAppleCalendarIntegration,
  useNotes,
  useSchedulingReplan,
} from "@move37/sdk/react";
import "./App.css";
import {
  buildIndexes,
  collectAncestors,
  collectDescendants,
  computeGraphLayout,
  createNodeId,
  fibonacciSphere,
  formatHours,
  rotateX,
  rotateY,
  wouldCreateCycle,
} from "./graph";

const TOPBAR_MESSAGES = [
  "human operating system for the AI age",
  "graph is now backed by the move37 api",
  "right click nodes to edit the network",
];
const SEARCH_PLACEHOLDER = "search:activity";
const EMPTY_GRAPH = { nodes: [], dependencies: [], schedules: [] };
const DEFAULT_VIEWPORT_STATE = getDefaultViewport({ width: 1200, height: 760 });
const SURFACE_TRANSITION_MS = 160;
const SYNC_MODE_COPY = {
  dry_run: {
    title: "Dry run",
    description: "Compute a proposed schedule and review the changes before anything is written to calendars.",
    actionLabel: "Run dry run",
  },
  apply: {
    title: "Apply",
    description: "Compute the new schedule, persist it in Move37, and sync the result to connected calendars.",
    actionLabel: "Apply plan",
  },
};
const DEFAULT_APPLE_BASE_URL = "https://caldav.icloud.com";
const LINEAR_TITLE_COLLATOR = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function getLevelNoise(level, sessionSeed) {
  const base = Math.sin(sessionSeed * 97.13 + level * 53.71) * 43758.5453;
  return base - Math.floor(base);
}

function getLevelShellStyle(level, maxLevel, sessionSeed = 0) {
  const ratio = maxLevel <= 0 ? 0 : level / maxLevel;
  const noise = getLevelNoise(level, sessionSeed);
  const hue = 198 + noise * 12;
  const saturation = 52 + noise * 18;
  const lightness = 38 + ratio * 10 + noise * 14;
  const alpha = 0.018 + noise * 0.05;
  return {
    fill: `hsla(${hue}, ${saturation}%, ${Math.max(16, lightness - 24)}%, ${alpha})`,
    glow: `hsla(${hue}, ${Math.max(44, saturation - 8)}%, ${lightness}%, ${0.05 + noise * 0.12})`,
  };
}

function getLevelPalette(level, maxLevel, sessionSeed = 0) {
  const ratio = maxLevel <= 0 ? 1 : level / maxLevel;
  const noise = getLevelNoise(level, sessionSeed);
  const hue = 204 + noise * 10 - ratio * 8;
  const saturation = 42 + noise * 24;
  const fillLightness = 24 + noise * 18 + ratio * 20;
  const strokeLightness = 42 + noise * 16 + ratio * 16;
  const haloLightness = 36 + noise * 18 + ratio * 18;
  const edgeLightness = 36 + noise * 18 + ratio * 20;
  const scheduleHue = 166 + noise * 14;
  return {
    nodeFill: `hsl(${hue}, ${saturation}%, ${fillLightness}%)`,
    nodeStroke: `hsl(${hue - 3}, ${Math.max(40, saturation - 8)}%, ${strokeLightness}%)`,
    nodeHaloFill: `hsla(${hue - 4}, ${Math.max(36, saturation - 10)}%, ${haloLightness}%, ${0.12 + noise * 0.08})`,
    nodeLabelFill: `hsl(${hue - 1}, ${Math.max(34, saturation - 12)}%, ${Math.min(88, fillLightness + 18)}%)`,
    edgeStroke: `hsla(${hue - 2}, ${Math.max(34, saturation - 10)}%, ${edgeLightness}%, ${0.72 + noise * 0.16})`,
    edgeScheduleStroke: `hsla(${scheduleHue}, ${54 + ratio * 26}%, ${50 + ratio * 26}%, 0.94)`,
  };
}

function getLevelVisualStyle(level, maxLevel, sessionSeed = 0) {
  const palette = getLevelPalette(level, maxLevel, sessionSeed);
  return {
    "--node-fill": palette.nodeFill,
    "--node-stroke": palette.nodeStroke,
    "--node-halo-fill": palette.nodeHaloFill,
    "--node-label-fill": palette.nodeLabelFill,
    "--edge-stroke": palette.edgeStroke,
    "--edge-schedule-stroke": palette.edgeScheduleStroke,
  };
}

function getNodeRenderRadius(node) {
  return 3.1 + Math.max(0, node.level) * 1.25 + node.depth * 0.9;
}

function compareLinearNodes(left, right) {
  const leftStart = String(left?.startDate || "").trim();
  const rightStart = String(right?.startDate || "").trim();
  if (leftStart || rightStart) {
    if (!leftStart) {
      return 1;
    }
    if (!rightStart) {
      return -1;
    }
    const dateCompare = leftStart.localeCompare(rightStart);
    if (dateCompare !== 0) {
      return dateCompare;
    }
  }

  const leftDue = String(left?.bestBefore || "").trim();
  const rightDue = String(right?.bestBefore || "").trim();
  if (leftDue || rightDue) {
    if (!leftDue) {
      return 1;
    }
    if (!rightDue) {
      return -1;
    }
    const dueCompare = leftDue.localeCompare(rightDue);
    if (dueCompare !== 0) {
      return dueCompare;
    }
  }

  return LINEAR_TITLE_COLLATOR.compare(left?.title || "", right?.title || "");
}

function formatScheduleTimestamp(value) {
  if (!value) {
    return "Not scheduled";
  }
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function formatDeltaMinutes(value) {
  if (value == null) {
    return "Scheduled";
  }
  if (value === 0) {
    return "No change";
  }
  const sign = value > 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(value);
  if (absoluteMinutes % 1440 === 0) {
    return `${sign}${absoluteMinutes / 1440}d`;
  }
  if (absoluteMinutes >= 60 && absoluteMinutes % 60 === 0) {
    return `${sign}${absoluteMinutes / 60}h`;
  }
  return `${sign}${absoluteMinutes}m`;
}

function formatSchedulingCode(code) {
  const normalized = String(code || "")
    .replaceAll("_", " ")
    .trim();
  if (!normalized) {
    return "Scheduling issue";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="2.7" className="icon-globe-outline" />
      <path d="M12 4.7v2.2" className="icon-map-line" />
      <path d="M12 17.1v2.2" className="icon-map-line" />
      <path d="M19.3 12h-2.2" className="icon-map-line" />
      <path d="M6.9 12H4.7" className="icon-map-line" />
      <path d="M17.2 6.8l-1.5 1.5" className="icon-map-line" />
      <path d="M8.3 15.7l-1.5 1.5" className="icon-map-line" />
      <path d="M17.2 17.2l-1.5-1.5" className="icon-map-line" />
      <path d="M8.3 8.3L6.8 6.8" className="icon-map-line" />
    </svg>
  );
}

function interpolateProjectedGraphs(fromProjected, toProjected, nodes, progress) {
  const byId = {};
  const ordered = nodes
    .map((node) => {
      const from = fromProjected.byId[node.id];
      const to = toProjected.byId[node.id];
      if (!from || !to) {
        return null;
      }
      const projectedNode = {
        ...node,
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
        z: from.z + (to.z - from.z) * progress,
        depth: from.depth + (to.depth - from.depth) * progress,
        angle: from.angle + (to.angle - from.angle) * progress,
        radialRatio: from.radialRatio + (to.radialRatio - from.radialRatio) * progress,
      };
      byId[node.id] = projectedNode;
      return projectedNode;
    })
    .filter(Boolean);

  ordered.sort((left, right) => left.z - right.z);

  return {
    byId,
    ordered,
    centerX: fromProjected.centerX + (toProjected.centerX - fromProjected.centerX) * progress,
    centerY: fromProjected.centerY + (toProjected.centerY - fromProjected.centerY) * progress,
    radius: fromProjected.radius + (toProjected.radius - fromProjected.radius) * progress,
  };
}

function buildPinchedEdgePath(from, to, fromWidth, toWidth, midWidth) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const perpX = -dy / length;
  const perpY = dx / length;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const fromLeftX = from.x + perpX * fromWidth;
  const fromLeftY = from.y + perpY * fromWidth;
  const fromRightX = from.x - perpX * fromWidth;
  const fromRightY = from.y - perpY * fromWidth;
  const midLeftX = midX + perpX * midWidth;
  const midLeftY = midY + perpY * midWidth;
  const midRightX = midX - perpX * midWidth;
  const midRightY = midY - perpY * midWidth;
  const toLeftX = to.x + perpX * toWidth;
  const toLeftY = to.y + perpY * toWidth;
  const toRightX = to.x - perpX * toWidth;
  const toRightY = to.y - perpY * toWidth;
  return `M ${fromLeftX} ${fromLeftY} L ${midLeftX} ${midLeftY} L ${toLeftX} ${toLeftY} L ${toRightX} ${toRightY} L ${midRightX} ${midRightY} L ${fromRightX} ${fromRightY} Z`;
}

function getLinearFrame(centerX, centerY, radius) {
  return {
    left: centerX - radius * 1.08,
    right: centerX + radius * 1.08,
    top: centerY - radius * 0.86,
    bottom: centerY + radius * 0.86,
  };
}

function getLinearColumnX(level, maxLevel, centerX, radius) {
  const frame = getLinearFrame(centerX, 0, radius);
  const span = frame.right - frame.left;
  const steps = Math.max(maxLevel, 1);
  return frame.left + ((maxLevel - level) / steps) * span;
}

function projectLinearPoint({
  level,
  maxLevel,
  linearOrder,
  linearCount,
  centerX,
  centerY,
  radius,
}) {
  const frame = getLinearFrame(centerX, centerY, radius);
  const steps = Math.max(maxLevel, 1);
  const x = frame.left + ((maxLevel - level) / steps) * (frame.right - frame.left);
  const y =
    linearCount <= 1
      ? centerY
      : frame.top + (linearOrder / Math.max(linearCount - 1, 1)) * (frame.bottom - frame.top);
  return {
    x,
    y,
    z: level * 0.0008,
    depth: 1,
  };
}

function getModeMorphSequence(fromMode, toMode) {
  if (fromMode === toMode) {
    return [];
  }
  if (fromMode === "3d" && toMode === "linear") {
    return ["2d", "linear"];
  }
  if (fromMode === "linear" && toMode === "3d") {
    return ["2d", "3d"];
  }
  return [toMode];
}

function buildAmbientTreeFlow(graph, layout) {
  if (!graph.nodes.length) {
    return { dependencyEdgeIds: new Set(), scheduleEdgeIds: new Set() };
  }

  const maxLevel = Math.max(0, ...graph.nodes.map((node) => layout.finalLevels.get(node.id) || 0));
  const outerCandidates = graph.nodes.filter(
    (node) => (layout.finalLevels.get(node.id) || 0) === maxLevel,
  );
  const outerPool = outerCandidates.length ? outerCandidates : graph.nodes;
  const outerNode = outerPool[Math.floor(Math.random() * outerPool.length)] || null;
  if (!outerNode) {
    return { dependencyEdgeIds: new Set(), scheduleEdgeIds: new Set() };
  }

  const ancestorIds = collectAncestors(outerNode.id, layout.parentMap);
  const nodeIds = new Set([outerNode.id, ...ancestorIds]);
  const dependencyEdgeIds = new Set();
  const scheduleEdgeIds = new Set();

  graph.dependencies.forEach((edge) => {
    if (nodeIds.has(edge.parentId) && nodeIds.has(edge.childId)) {
      dependencyEdgeIds.add(getDependencyEdgeId(edge));
    }
  });

  graph.schedules.forEach((edge) => {
    if (nodeIds.has(edge.earlierId) && nodeIds.has(edge.laterId)) {
      scheduleEdgeIds.add(getScheduleEdgeId(edge));
    }
  });

  return {
    dependencyEdgeIds,
    scheduleEdgeIds,
  };
}

function buildLevelScheduleOrder(levelNodeIds, schedules, nodeOrder) {
  const levelSet = new Set(levelNodeIds);
  const adjacency = new Map();
  const indegree = new Map();

  schedules.forEach((rule) => {
    if (!levelSet.has(rule.earlierId) || !levelSet.has(rule.laterId)) {
      return;
    }
    if (!adjacency.has(rule.earlierId)) {
      adjacency.set(rule.earlierId, []);
      indegree.set(rule.earlierId, 0);
    }
    if (!adjacency.has(rule.laterId)) {
      adjacency.set(rule.laterId, []);
      indegree.set(rule.laterId, 0);
    }
    adjacency.get(rule.earlierId).push(rule.laterId);
    indegree.set(rule.laterId, indegree.get(rule.laterId) + 1);
  });

  const scheduledIds = [...adjacency.keys()];
  if (!scheduledIds.length) {
    return { scheduledIds: [], scheduledSet: new Set() };
  }

  const queue = scheduledIds
    .filter((id) => indegree.get(id) === 0)
    .sort((left, right) => nodeOrder.get(left) - nodeOrder.get(right));
  const ordered = [];

  while (queue.length) {
    const id = queue.shift();
    ordered.push(id);
    (adjacency.get(id) || []).forEach((nextId) => {
      indegree.set(nextId, indegree.get(nextId) - 1);
      if (indegree.get(nextId) === 0) {
        queue.push(nextId);
        queue.sort((left, right) => nodeOrder.get(left) - nodeOrder.get(right));
      }
    });
  }

  if (ordered.length !== scheduledIds.length) {
    throw new Error("Scheduling cycle detected on level.");
  }

  return { scheduledIds: ordered, scheduledSet: new Set(scheduledIds) };
}

function buildLevelClusters(levelNodeIds, parentMap, nodeOrder, scheduledIds) {
  const parentBuckets = new Map();

  levelNodeIds.forEach((id) => {
    const parents = parentMap.get(id) || [];
    parents.forEach((parentId) => {
      if (!parentBuckets.has(parentId)) {
        parentBuckets.set(parentId, []);
      }
      parentBuckets.get(parentId).push(id);
    });
  });

  const roots = new Map(levelNodeIds.map((id) => [id, id]));

  function find(id) {
    const parent = roots.get(id);
    if (parent === id) {
      return id;
    }
    const root = find(parent);
    roots.set(id, root);
    return root;
  }

  function union(left, right) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      roots.set(rightRoot, leftRoot);
    }
  }

  [...parentBuckets.values()].forEach((bucket) => {
    if (!Array.isArray(bucket) || bucket.length < 2) {
      return;
    }
    const [first, ...rest] = bucket;
    rest.forEach((id) => union(first, id));
  });

  const grouped = new Map();
  levelNodeIds.forEach((id) => {
    const root = find(id);
    if (!grouped.has(root)) {
      grouped.set(root, []);
    }
    grouped.get(root).push(id);
  });

  const scheduleIndex = new Map(scheduledIds.map((id, index) => [id, index]));

  return [...grouped.values()]
    .map((members) => {
      const scheduledMembers = members
        .filter((id) => scheduleIndex.has(id))
        .sort((left, right) => scheduleIndex.get(left) - scheduleIndex.get(right));
      const unscheduledMembers = members
        .filter((id) => !scheduleIndex.has(id))
        .sort((left, right) => nodeOrder.get(left) - nodeOrder.get(right));
      return {
        members: [...scheduledMembers, ...unscheduledMembers],
        firstScheduledIndex: scheduledMembers.length
          ? scheduleIndex.get(scheduledMembers[0])
          : Number.POSITIVE_INFINITY,
        firstNodeOrder: Math.min(...members.map((id) => nodeOrder.get(id))),
      };
    })
    .sort((left, right) => {
      if (left.firstScheduledIndex !== right.firstScheduledIndex) {
        return left.firstScheduledIndex - right.firstScheduledIndex;
      }
      return left.firstNodeOrder - right.firstNodeOrder;
    });
}

function normalizePoint(point) {
  const length = Math.hypot(point.x, point.y, point.z) || 1;
  return {
    x: point.x / length,
    y: point.y / length,
    z: point.z / length,
  };
}

function crossPoint(left, right) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function projectLevelPoint({
  angle,
  radialRatio,
  centerX,
  centerY,
  radius,
  viewMode,
  rotationX,
  rotationY,
}) {
  const basePoint = {
    x: Math.cos(angle) * radialRatio,
    y: Math.sin(angle) * radialRatio,
    z: 0,
  };

  if (viewMode === "2d") {
    return {
      x: centerX + basePoint.x * radius,
      y: centerY + basePoint.y * radius,
      z: radialRatio * 0.001,
      depth: 1,
      basePoint,
    };
  }

  const perspective = 3.2;
  const rotated = rotateX(rotateY(basePoint, rotationY), rotationX);
  const depth = perspective / (perspective - rotated.z);
  return {
    x: centerX + rotated.x * radius * depth,
    y: centerY + rotated.y * radius * depth,
    z: rotated.z,
    depth,
    basePoint,
  };
}

function projectSpatialPoint({ point, centerX, centerY, radius, rotationX, rotationY }) {
  const perspective = 3.2;
  const rotated = rotateX(rotateY(point, rotationY), rotationX);
  const depth = perspective / (perspective - rotated.z);
  return {
    x: centerX + rotated.x * radius * depth,
    y: centerY + rotated.y * radius * depth,
    z: rotated.z,
    depth,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildClockwiseArcPath(from, to, options) {
  if (from.level !== to.level || from.radialRatio == null || to.radialRatio == null) {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }

  if (options.viewMode === "3d") {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }

  if (options.viewMode === "linear") {
    const bend = clamp(Math.abs(to.y - from.y) * 0.22 + 32, 28, 96);
    const controlX = from.x + bend;
    return `M ${from.x} ${from.y} C ${controlX} ${from.y}, ${controlX} ${to.y}, ${to.x} ${to.y}`;
  }

  const startAngle = Math.atan2(from.y - options.centerY, from.x - options.centerX);
  let delta = Math.atan2(to.y - options.centerY, to.x - options.centerX) - startAngle;
  while (delta <= 0) {
    delta += Math.PI * 2;
  }
  const fromDistance = Math.hypot(from.x - options.centerX, from.y - options.centerY);
  const toDistance = Math.hypot(to.x - options.centerX, to.y - options.centerY);
  const averageRadius = (fromDistance + toDistance) / 2;
  const largeArcFlag = delta > Math.PI ? 1 : 0;
  return `M ${from.x} ${from.y} A ${averageRadius} ${averageRadius} 0 ${largeArcFlag} 1 ${to.x} ${to.y}`;
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.2" className="icon-globe-outline" />
      <ellipse cx="12" cy="12" rx="3.9" ry="8.2" className="icon-globe-line" />
      <path d="M3.8 12h16.4" className="icon-globe-line" />
      <path d="M5.2 8.6c2.1 1 4.4 1.5 6.8 1.5s4.7-.5 6.8-1.5" className="icon-globe-line" />
      <path d="M5.2 15.4c2.1-1 4.4-1.5 6.8-1.5s4.7.5 6.8 1.5" className="icon-globe-line" />
    </svg>
  );
}

function RingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3.8 6.4l5.1-2.3l6.2 2.1l5.1-2.2v13.6l-5.1 2.3l-6.2-2.1l-5.1 2.2z"
        className="icon-map-outline"
      />
      <path d="M8.9 4.1v13.6" className="icon-map-line" />
      <path d="M15.1 6.2v13.6" className="icon-map-line" />
    </svg>
  );
}

function LinearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.4 5v14" className="icon-map-line" />
      <path d="M10.1 5v14" className="icon-map-line" />
      <path d="M14.8 5v14" className="icon-map-line" />
      <path d="M19.5 5v14" className="icon-map-line" />
      <circle cx="5.4" cy="8.2" r="1.25" className="icon-globe-outline" />
      <circle cx="10.1" cy="12" r="1.25" className="icon-globe-outline" />
      <circle cx="14.8" cy="15.6" r="1.25" className="icon-globe-outline" />
      <circle cx="19.5" cy="9.8" r="1.25" className="icon-globe-outline" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6.2h14v12.4H5z" className="icon-map-outline" />
      <path d="M8 4.6v3.2" className="icon-map-line" />
      <path d="M16 4.6v3.2" className="icon-map-line" />
      <path d="M5 9.3h14" className="icon-map-line" />
      <path d="M8.2 12.2h2.3" className="icon-map-line" />
      <path d="M13.5 12.2h2.3" className="icon-map-line" />
      <path d="M8.2 16h2.3" className="icon-map-line" />
    </svg>
  );
}

function CenterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 9V4.5H9" className="icon-map-line" />
      <path d="M15 4.5h4.5V9" className="icon-map-line" />
      <path d="M19.5 15v4.5H15" className="icon-map-line" />
      <path d="M9 19.5H4.5V15" className="icon-map-line" />
      <circle cx="12" cy="12" r="2.4" className="icon-globe-outline" />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4.5h8.8L18 7.7v11.8H6z" className="icon-map-outline" />
      <path d="M14.8 4.5v3.2H18" className="icon-map-line" />
      <path d="M8.4 10.2h7.2" className="icon-map-line" />
      <path d="M8.4 13.4h7.2" className="icon-map-line" />
      <path d="M8.4 16.6h4.8" className="icon-map-line" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4.8h11.7L19 7.1v12.1H5z" className="icon-map-outline" />
      <path d="M8 4.8v5.3h7.2V4.8" className="icon-map-line" />
      <path d="M8.4 15.1h7.2" className="icon-map-line" />
    </svg>
  );
}

function ExitIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7l10 10" className="icon-map-line" />
      <path d="M17 7L7 17" className="icon-map-line" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4.8v9.8" className="icon-map-line" />
      <path d="M8.3 10.9L12 14.6l3.7-3.7" className="icon-map-line" />
      <path d="M5 18.2h14" className="icon-map-outline" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9.2 14.8l-1.8 1.8a3.1 3.1 0 0 1-4.4-4.4l3-3a3.1 3.1 0 0 1 4.4 0" className="icon-map-line" />
      <path d="M14.8 9.2l1.8-1.8a3.1 3.1 0 1 1 4.4 4.4l-3 3a3.1 3.1 0 0 1-4.4 0" className="icon-map-line" />
      <path d="M9.1 14.9l5.8-5.8" className="icon-map-line" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M10.5 3.5a7 7 0 1 0 4.24 12.58l4.84 4.84a1 1 0 1 0 1.42-1.42l-4.84-4.84A7 7 0 0 0 10.5 3.5Zm0 2a5 5 0 1 1 0 10a5 5 0 0 1 0-10Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ZoomResetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.2 4.8H4.8v2.4" className="icon-map-line" />
      <path d="M16.8 4.8h2.4v2.4" className="icon-map-line" />
      <path d="M19.2 16.8v2.4h-2.4" className="icon-map-line" />
      <path d="M7.2 19.2H4.8v-2.4" className="icon-map-line" />
      <path d="M9.2 9.2l2.8 2.8l2.8-2.8" className="icon-map-line" />
      <path d="M12 12V7.8" className="icon-map-line" />
      <path d="M9.2 14.8l2.8-2.8l2.8 2.8" className="icon-map-line" />
      <path d="M12 12v4.2" className="icon-map-line" />
    </svg>
  );
}

function ExpandLevelsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.4 16.8L12 11.2l5.6 5.6" className="icon-map-line" />
      <path d="M6.4 12.2L12 6.6l5.6 5.6" className="icon-map-line" />
    </svg>
  );
}

function CollapseLevelsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.4 7.2L12 12.8l5.6-5.6" className="icon-map-line" />
      <path d="M6.4 11.8L12 17.4l5.6-5.6" className="icon-map-line" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.4 6.4l8.6 5.6l-8.6 5.6z" className="icon-map-outline" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.2 6.2v11.6" className="icon-map-line" />
      <path d="M15.8 6.2v11.6" className="icon-map-line" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.2 7.2h9.6v9.6H7.2z" className="icon-map-outline" />
    </svg>
  );
}

function cloneGraph(graph) {
  return JSON.parse(JSON.stringify(graph));
}

function normalizeSchedules(schedules, nodes, baseLevels) {
  if (!Array.isArray(schedules)) {
    return [];
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  const seen = new Set();
  return schedules.filter((rule) => {
    if (!rule?.earlierId || !rule?.laterId) {
      return false;
    }
    if (!nodeIds.has(rule.earlierId) || !nodeIds.has(rule.laterId)) {
      return false;
    }
    if (baseLevels.get(rule.earlierId) !== baseLevels.get(rule.laterId)) {
      return false;
    }
    const key = `${rule.earlierId}~>${rule.laterId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function sanitizeGraph(graph) {
  const nextGraph = cloneGraph(graph);
  const layout = computeGraphLayout({
    nodes: nextGraph.nodes,
    dependencies: nextGraph.dependencies,
    schedules: [],
  });
  nextGraph.schedules = normalizeSchedules(nextGraph.schedules, nextGraph.nodes, layout.baseLevels);
  return nextGraph;
}

function getDefaultViewport(size) {
  // default sphere location and zoom
  return {
    zoom: 2.00,
    panOffset: {
      x: Math.round(size.width * -0.24),
      y: Math.round(size.height * -0.16),
    },
  };
}

function replaceNode(graph, nodeId, updater) {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === nodeId ? updater(node) : node)),
  };
}

function defaultForm(node) {
  return {
    title: node?.title || "",
    notes: node?.notes || "",
    startDate: node?.startDate || "",
    bestBefore: node?.bestBefore || "",
    expectedTime: node?.expectedTime ?? "",
    realTime: node?.realTime ?? "",
    expectedEffort: node?.expectedEffort ?? "",
    realEffort: node?.realEffort ?? "",
  };
}

function serializeNoteForEditor(note) {
  if (!note) {
    return "";
  }
  return note.body ? `${note.title}\n${note.body}` : note.title || "";
}

function parseNoteDraft(value) {
  const newlineIndex = value.indexOf("\n");
  if (newlineIndex === -1) {
    return {
      title: value.trim(),
      body: "",
    };
  }
  return {
    title: value.slice(0, newlineIndex).trim(),
    body: value.slice(newlineIndex + 1),
  };
}

function toNumberOrNull(value) {
  if (value === "" || value == null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getWorkingHours(node, now) {
  const base = Number(node.realTime || 0);
  if (!node.workStartedAt) {
    return base;
  }
  const elapsedMs = Math.max(0, now - new Date(node.workStartedAt).getTime());
  return base + elapsedMs / 1000 / 60 / 60;
}

function getFocusSessionMs(node, now) {
  if (!node?.workStartedAt) {
    return 0;
  }
  return Math.max(0, now - new Date(node.workStartedAt).getTime());
}

function formatFocusClock(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function getFocusSummary(node) {
  const raw = `${node?.notes || ""}`.trim().replace(/\s+/g, " ");
  if (!raw) {
    return "Focused task in progress.";
  }
  if (raw.length <= 88) {
    return raw;
  }
  return `${raw.slice(0, 85).trimEnd()}...`;
}

function buildSelectedDetails(node, layout, graph, now) {
  if (!node) {
    return null;
  }
  const ancestorIds = collectAncestors(node.id, layout.parentMap);
  const totalExpectedChainTime =
    [...ancestorIds, node.id].reduce((sum, id) => {
      const target = graph.nodes.find((entry) => entry.id === id);
      return sum + Number(target?.expectedTime || 0);
    }, 0);
  const directParents = layout.parentMap.get(node.id) || [];
  const directChildren = layout.childMap.get(node.id) || [];
  return {
    level: layout.finalLevels.get(node.id) || 0,
    baseLevel: layout.baseLevels.get(node.id) || 0,
    scheduled: layout.scheduledIds.has(node.id),
    parentCount: directParents.length,
    childCount: directChildren.length,
    chainExpectedTime: totalExpectedChainTime,
    liveRealTime: getWorkingHours(node, now),
    parents: directParents,
    children: directChildren,
  };
}

function ActivitySummaryBody({ node, details }) {
  return (
    <div className="activity-overlay-body">
      <header className="activity-overlay-header">
        <p className="eyebrow">ACTIVITY</p>
        <h2>{node.title}</h2>
      </header>
      <dl className="activity-summary-list">
        <div className="activity-summary-row">
          <dt>Level</dt>
          <dd>{details.level}</dd>
        </div>
        <div className="activity-summary-row">
          <dt>Completion in</dt>
          <dd>
            {details.parentCount} {details.parentCount === 1 ? "parent" : "parents"} and{" "}
            {formatHours(details.chainExpectedTime)}
          </dd>
        </div>
        <div className="activity-summary-row">
          <dt>Expected work</dt>
          <dd>{node.expectedEffort ?? "n/a"}</dd>
        </div>
        <div className="activity-summary-row">
          <dt>Work</dt>
          <dd>{node.realEffort ?? "n/a"}</dd>
        </div>
        <div className="activity-summary-row">
          <dt>Scheduled</dt>
          <dd>{details.scheduled ? "yes" : "no"}</dd>
        </div>
        <div className="activity-summary-row">
          <dt>Start date</dt>
          <dd>{node.startDate || "n/a"}</dd>
        </div>
        <div className="activity-summary-row">
          <dt>Latest by</dt>
          <dd>{node.bestBefore || "n/a"}</dd>
        </div>
      </dl>
    </div>
  );
}

function computeFocusRotation(point) {
  if (!point) {
    return null;
  }
  const yaw = Math.atan2(-point.x, point.z);
  const yawAligned = rotateY(point, yaw);
  const pitch = Math.atan2(yawAligned.y, yawAligned.z);
  return {
    rotationY: yaw,
    rotationX: pitch,
  };
}

const TRANSITION_MS = {
  outgoingNodes: 170,
  outgoingEdges: 150,
  layoutShift: 210,
  incomingEdges: 80,
  incomingNodes: 80,
};

function getDependencyEdgeId(edge) {
  return `${edge.parentId}->${edge.childId}`;
}

function getScheduleEdgeId(edge) {
  return `${edge.earlierId}~>${edge.laterId}`;
}

function buildGraphDiff(fromGraph, toGraph) {
  const fromNodeIds = new Set(fromGraph.nodes.map((node) => node.id));
  const toNodeIds = new Set(toGraph.nodes.map((node) => node.id));
  const fromDependencyIds = new Set(fromGraph.dependencies.map(getDependencyEdgeId));
  const toDependencyIds = new Set(toGraph.dependencies.map(getDependencyEdgeId));
  const fromScheduleIds = new Set(fromGraph.schedules.map(getScheduleEdgeId));
  const toScheduleIds = new Set(toGraph.schedules.map(getScheduleEdgeId));

  const removedNodeIds = new Set([...fromNodeIds].filter((id) => !toNodeIds.has(id)));
  const addedNodeIds = new Set([...toNodeIds].filter((id) => !fromNodeIds.has(id)));
  const removedDependencyEdgeIds = new Set(
    [...fromDependencyIds].filter((id) => !toDependencyIds.has(id)),
  );
  const addedDependencyEdgeIds = new Set(
    [...toDependencyIds].filter((id) => !fromDependencyIds.has(id)),
  );
  const removedScheduleEdgeIds = new Set(
    [...fromScheduleIds].filter((id) => !toScheduleIds.has(id)),
  );
  const addedScheduleEdgeIds = new Set(
    [...toScheduleIds].filter((id) => !fromScheduleIds.has(id)),
  );

  return {
    removedNodeIds,
    addedNodeIds,
    removedDependencyEdgeIds,
    addedDependencyEdgeIds,
    removedScheduleEdgeIds,
    addedScheduleEdgeIds,
    persistentNodeIds: new Set([...fromNodeIds].filter((id) => toNodeIds.has(id))),
    persistentDependencyEdgeIds: new Set(
      [...fromDependencyIds].filter((id) => toDependencyIds.has(id)),
    ),
    persistentScheduleEdgeIds: new Set(
      [...fromScheduleIds].filter((id) => toScheduleIds.has(id)),
    ),
  };
}

function buildTransitionPhases(diff) {
  const phases = [];
  if (diff.removedNodeIds.size) {
    phases.push("outgoing-nodes");
  }
  if (diff.removedDependencyEdgeIds.size || diff.removedScheduleEdgeIds.size) {
    phases.push("outgoing-edges");
  }
  phases.push("layout-shift");
  if (diff.addedDependencyEdgeIds.size || diff.addedScheduleEdgeIds.size) {
    phases.push("incoming-edges");
  }
  if (diff.addedNodeIds.size) {
    phases.push("incoming-nodes");
  }
  return phases;
}

function getPhaseDuration(phase) {
  switch (phase) {
    case "outgoing-nodes":
      return TRANSITION_MS.outgoingNodes;
    case "outgoing-edges":
      return TRANSITION_MS.outgoingEdges;
    case "layout-shift":
      return TRANSITION_MS.layoutShift;
    case "incoming-edges":
      return TRANSITION_MS.incomingEdges;
    case "incoming-nodes":
      return TRANSITION_MS.incomingNodes;
    default:
      return 0;
  }
}

function buildNodeLayoutMap(graph, layout, rotation2D) {
  const nodeOrder = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const grouped = new Map();
  graph.nodes.forEach((node) => {
    const level = layout.finalLevels.get(node.id) || 0;
    if (!grouped.has(level)) {
      grouped.set(level, []);
    }
    grouped.get(level).push(node.id);
  });

  const byId = new Map();
    [...grouped.entries()]
      .sort(([left], [right]) => left - right)
      .forEach(([level, ids]) => {
        const { scheduledIds, scheduledSet } = buildLevelScheduleOrder(ids, graph.schedules, nodeOrder);
        const clusters = buildLevelClusters(ids, layout.parentMap, nodeOrder, scheduledIds);
        const ratio = layout.maxLevel === 0 ? 0.18 : 0.12 + (level / layout.maxLevel) * 0.88;
        const isCenteredCore = level === 0 && ids.length === 1;
        const clusterCount = Math.max(1, clusters.length);
        const sector = clusterCount === 1 ? Math.PI * 1.25 : (Math.PI * 2) / clusterCount;
        const clusterDescriptors = clusters
          .map((cluster, clusterIndex) => {
            const parentIds = [
              ...new Set(cluster.members.flatMap((id) => layout.parentMap.get(id) || [])),
            ];
            const parentAngles = parentIds
              .map((id) => byId.get(id)?.angle)
              .filter((value) => Number.isFinite(value));
            const desiredAngle = parentAngles.length
              ? Math.atan2(
                  parentAngles.reduce((sum, angle) => sum + Math.sin(angle), 0),
                  parentAngles.reduce((sum, angle) => sum + Math.cos(angle), 0),
                )
              : -Math.PI / 2 + (clusterIndex / clusterCount) * Math.PI * 2 + rotation2D;
            const parentPoints = parentIds
              .map((id) => byId.get(id)?.point3d)
              .filter((point) => point && (point.x !== 0 || point.y !== 0 || point.z !== 0));
            const desiredDirection = parentPoints.length
              ? normalizePoint(
                  parentPoints.reduce(
                    (sum, point) => ({
                      x: sum.x + point.x,
                      y: sum.y + point.y,
                      z: sum.z + point.z,
                    }),
                    { x: 0, y: 0, z: 0 },
                  ),
                )
              : fibonacciSphere(clusterIndex, clusterCount);

            return {
              cluster,
              desiredAngle,
              desiredDirection,
            };
          })
          .sort((left, right) => left.desiredAngle - right.desiredAngle);

        clusterDescriptors.forEach(({ cluster, desiredAngle, desiredDirection }) => {
          const centerAngle = isCenteredCore ? -Math.PI / 2 : desiredAngle;
          const surfaceCenter = isCenteredCore
            ? { x: 0, y: 0, z: 0 }
            : {
                x: desiredDirection.x * ratio,
                y: desiredDirection.y * ratio,
                z: desiredDirection.z * ratio,
              };
          const surfaceDirection = isCenteredCore ? null : normalizePoint(surfaceCenter);
          const tangentReference =
            surfaceDirection && Math.abs(surfaceDirection.y) > 0.9
              ? { x: 1, y: 0, z: 0 }
              : { x: 0, y: 1, z: 0 };
          const tangentA = surfaceDirection
            ? normalizePoint(crossPoint(surfaceDirection, tangentReference))
            : null;
          const tangentB =
            surfaceDirection && tangentA ? normalizePoint(crossPoint(surfaceDirection, tangentA)) : null;
          const memberSpacing =
            cluster.members.length <= 1
              ? 0
              : Math.min(0.24, sector / Math.max(3, cluster.members.length + 1));
          const totalSpan = memberSpacing * Math.max(0, cluster.members.length - 1);

          cluster.members.forEach((id, memberIndex) => {
            const angle = isCenteredCore
              ? -Math.PI / 2
              : centerAngle - totalSpan / 2 + memberIndex * memberSpacing;
            const localAngle =
              cluster.members.length <= 1
                ? 0
                : -Math.PI / 2 + (memberIndex / cluster.members.length) * Math.PI * 2;
            const localSpread =
              cluster.members.length <= 1 ? 0 : Math.min(0.12, 0.04 + cluster.members.length * 0.012);
            const point3d =
              isCenteredCore || !surfaceDirection || !tangentA || !tangentB
                ? { x: 0, y: 0, z: 0 }
                : (() => {
                    const lifted = normalizePoint({
                      x:
                        surfaceDirection.x +
                        tangentA.x * Math.cos(localAngle) * localSpread +
                        tangentB.x * Math.sin(localAngle) * localSpread,
                      y:
                        surfaceDirection.y +
                        tangentA.y * Math.cos(localAngle) * localSpread +
                        tangentB.y * Math.sin(localAngle) * localSpread,
                      z:
                        surfaceDirection.z +
                        tangentA.z * Math.cos(localAngle) * localSpread +
                        tangentB.z * Math.sin(localAngle) * localSpread,
                    });
                    return {
                      x: lifted.x * ratio,
                      y: lifted.y * ratio,
                      z: lifted.z * ratio,
                    };
                  })();
            byId.set(id, {
              level,
              baseLevel: layout.baseLevels.get(id) || 0,
              scheduled: layout.scheduledIds.has(id),
              radialRatio: isCenteredCore ? 0 : ratio,
              angle,
              point3d,
              scheduleIndex: scheduledSet.has(id) ? scheduledIds.indexOf(id) : null,
              linearOrder: 0,
              linearCount: 1,
            });
          });
        });
      });

  [...grouped.entries()].forEach(([, ids]) => {
    const orderedIds = [...ids].sort((left, right) => {
      const compared = compareLinearNodes(nodeById.get(left), nodeById.get(right));
      if (compared !== 0) {
        return compared;
      }
      return nodeOrder.get(left) - nodeOrder.get(right);
    });
    orderedIds.forEach((id, linearOrder) => {
      const current = byId.get(id);
      if (!current) {
        return;
      }
      byId.set(id, {
        ...current,
        linearOrder,
        linearCount: orderedIds.length,
      });
    });
  });

  return byId;
}

function buildProjectedGraph(graph, nodeLayout, options) {
  const {
    size,
    zoom,
    viewMode,
    maxLevel = 0,
    rotationX,
    rotationY,
    panOffset = { x: 0, y: 0 },
    focusNodeId = null,
    focusTarget = null,
  } = options;
  let centerX = size.width / 2 + panOffset.x;
  let centerY = size.height / 2 + panOffset.y;
  const radius = Math.min(size.width, size.height) * 0.39 * zoom;
  const byId = {};
  const ordered = graph.nodes.map((node) => {
    const spatial = nodeLayout.get(node.id) || {
      level: 0,
      baseLevel: 0,
      scheduled: false,
      radialRatio: 0,
      angle: -Math.PI / 2,
      point3d: { x: 0, y: 0, z: 0 },
      linearOrder: 0,
      linearCount: 1,
    };
    const point =
      viewMode === "linear"
        ? projectLinearPoint({
            level: spatial.level,
            maxLevel,
            linearOrder: spatial.linearOrder,
            linearCount: spatial.linearCount,
            centerX,
            centerY,
            radius,
          })
        : viewMode === "2d"
        ? projectLevelPoint({
            angle: spatial.angle,
            radialRatio: spatial.radialRatio,
            centerX,
            centerY,
            radius,
            viewMode,
            rotationX,
            rotationY,
          })
        : projectSpatialPoint({
            point: spatial.point3d,
            centerX,
            centerY,
            radius,
            rotationX,
            rotationY,
          });
    const projectedNode = {
      ...node,
      level: spatial.level,
      baseLevel: spatial.baseLevel,
      scheduleOffset: 0,
      scheduled: spatial.scheduled,
      angle: spatial.angle,
      radialRatio: spatial.radialRatio,
      point3d: spatial.point3d,
      linearOrder: spatial.linearOrder,
      linearCount: spatial.linearCount,
      x: point.x,
      y: point.y,
      z: point.z,
      depth: point.depth,
    };
    byId[node.id] = projectedNode;
    return projectedNode;
  });

  if (focusNodeId && focusTarget && byId[focusNodeId]) {
    const offsetX = focusTarget.x - byId[focusNodeId].x;
    const offsetY = focusTarget.y - byId[focusNodeId].y;
    centerX += offsetX;
    centerY += offsetY;
    ordered.forEach((node) => {
      node.x += offsetX;
      node.y += offsetY;
      byId[node.id] = node;
    });
  }

  ordered.sort((left, right) => left.z - right.z);
  return { ordered, byId, centerX, centerY, radius };
}

function buildLevelShells(maxLevel, sessionSeed = 0) {
  const boundedMax = Math.max(maxLevel, 0);
  return Array.from({ length: boundedMax + 1 }, (_, level) => {
    const ratio = boundedMax === 0 ? 0.18 : 0.12 + (level / boundedMax) * 0.88;
    return {
      level,
      ratio,
      ...getLevelShellStyle(level, boundedMax, sessionSeed),
    };
  });
}

export default function App() {
  const defaultLocalToken = useMemo(() => {
    if (import.meta.env.VITE_MOVE37_API_TOKEN) {
      return import.meta.env.VITE_MOVE37_API_TOKEN;
    }
    if (!import.meta.env.DEV) {
      return undefined;
    }
    const hostname = window.location.hostname.toLowerCase();
    if (
      hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname === "0.0.0.0"
      || hostname.endsWith(".local")
    ) {
      return "move37-dev-token";
    }
    return undefined;
  }, []);
  const shellRef = useRef(null);
  const searchInputRef = useRef(null);
  const urlInputRef = useRef(null);
  const browseInputRef = useRef(null);
  const dockRef = useRef(null);
  const viewportInitializedRef = useRef(false);
  const dragRef = useRef({ active: false, mode: null, x: 0, y: 0, angle: 0 });
  const transitionTimersRef = useRef([]);
  const modeMorphFrameRef = useRef(0);
  const modeMorphQueueRef = useRef([]);
  const viewportTweenFrameRef = useRef(0);
  const surfaceCloseTimerRef = useRef(0);
  const pendingSurfaceActionRef = useRef(null);
  const levelSeedRef = useRef(Math.random() * 10000);
  const apiOptions = useMemo(
    () => ({
      baseUrl: import.meta.env.VITE_MOVE37_API_BASE_URL || "",
      token: defaultLocalToken,
    }),
    [defaultLocalToken],
  );
  const [surfaceMode, setSurfaceMode] = useState("graph");
  const [viewMode, setViewMode] = useState("3d");
  const {
    graph: canonicalGraph,
    error: apiError,
    loading: graphLoading,
    reload: reloadGraph,
    createActivity,
    deleteActivity,
    deleteDependency,
    forkActivity,
    insertBetween,
    replaceDependencies,
    startWork: startWorkMutation,
    stopWork: stopWorkMutation,
    updateActivity,
  } = useActivityGraph(apiOptions);
  const {
    createNote,
    getNote,
    importNoteFromUrl,
    importTxtNotes,
    updateNote,
  } = useNotes(apiOptions);
  const {
    loading: syncPending,
    run: runSchedulingReplan,
    clear: clearSchedulingRun,
  } = useSchedulingReplan(apiOptions);
  const {
    status: appleIntegrationStatus,
    loading: appleIntegrationLoading,
    mutating: appleIntegrationMutating,
    error: appleIntegrationError,
    connect: connectAppleCalendar,
    disconnect: disconnectAppleCalendar,
    updatePreferences: updateAppleCalendarPreferences,
  } = useAppleCalendarIntegration(apiOptions);
  const [graph, setGraph] = useState(() => sanitizeGraph(EMPTY_GRAPH));
  const [transition, setTransition] = useState(null);
  const [modeMorph, setModeMorph] = useState(null);
  const [surfaceClosingMode, setSurfaceClosingMode] = useState(null);
  const [size, setSize] = useState({ width: 1200, height: 760 });
  const [autoRotation, setAutoRotation] = useState(0);
  const [rotationX, setRotationX] = useState(0.52);
  const [rotationY, setRotationY] = useState(0);
  const [rotation2D, setRotation2D] = useState(0);
  const [minVisibleLevel, setMinVisibleLevel] = useState(0);
  const [zoom, setZoom] = useState(DEFAULT_VIEWPORT_STATE.zoom);
  const [panOffset, setPanOffset] = useState(DEFAULT_VIEWPORT_STATE.panOffset);
  const [isDragging, setIsDragging] = useState(false);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [messageIndex, setMessageIndex] = useState(0);
  const [messageVisible, setMessageVisible] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isModeMenuExpanded, setIsModeMenuExpanded] = useState(false);
  const [searchState, setSearchState] = useState("idle");
  const [nodesVisible, setNodesVisible] = useState(true);
  const [contextMenu, setContextMenu] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [form, setForm] = useState(defaultForm(null));
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [appleSettingsForm, setAppleSettingsForm] = useState({
    username: "",
    password: "",
    baseUrl: DEFAULT_APPLE_BASE_URL,
    writableCalendarId: "",
  });
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncRunMode, setSyncRunMode] = useState("dry_run");
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState("");
  const [leftPanel, setLeftPanel] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [activeNote, setActiveNote] = useState(null);
  const [draftNoteNodeId, setDraftNoteNodeId] = useState(null);
  const [isImportMenuExpanded, setIsImportMenuExpanded] = useState(false);
  const [importPopoverMode, setImportPopoverMode] = useState(null);
  const [urlImportValue, setUrlImportValue] = useState("");
  const [urlImportLoading, setUrlImportLoading] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [ambientFlow, setAmbientFlow] = useState({
    dependencyEdgeIds: new Set(),
    scheduleEdgeIds: new Set(),
  });
  const [workingId, setWorkingId] = useState(null);
  const [focusedWorkId, setFocusedWorkId] = useState(null);
  const isTransitioning = transition != null;
  const isMorphing = modeMorph != null;
  const displayViewMode = modeMorph ? modeMorph.to : viewMode;
  const defaultViewport = useMemo(() => getDefaultViewport(size), [size]);
  const displayedSurfaceMode = surfaceClosingMode || (surfaceMode !== "graph" ? surfaceMode : null);
  const graphSuspended = displayedSurfaceMode != null;
  const levelSeed = levelSeedRef.current;

  function clearTransitionTimers() {
    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    transitionTimersRef.current = [];
  }

  function stopViewportTween() {
    if (viewportTweenFrameRef.current) {
      cancelAnimationFrame(viewportTweenFrameRef.current);
      viewportTweenFrameRef.current = 0;
    }
  }

  function clearSurfaceCloseTimer() {
    if (surfaceCloseTimerRef.current) {
      window.clearTimeout(surfaceCloseTimerRef.current);
      surfaceCloseTimerRef.current = 0;
    }
  }

  useEffect(() => {
    if (!canonicalGraph || isTransitioning) {
      return;
    }
    setGraph(sanitizeGraph(canonicalGraph));
  }, [canonicalGraph, isTransitioning]);

  useEffect(() => {
    if (!apiError) {
      return;
    }
    setError(apiError.message);
  }, [apiError]);

  useEffect(() => {
    if (!appleIntegrationStatus) {
      return;
    }
    setAppleSettingsForm((current) => ({
      username: appleIntegrationStatus.ownerEmail || current.username,
      password: "",
      baseUrl: appleIntegrationStatus.baseUrl || current.baseUrl || DEFAULT_APPLE_BASE_URL,
      writableCalendarId: appleIntegrationStatus.writableCalendarId || current.writableCalendarId,
    }));
  }, [
    appleIntegrationStatus?.baseUrl,
    appleIntegrationStatus?.ownerEmail,
    appleIntegrationStatus?.writableCalendarId,
  ]);

  useEffect(() => {
    if (!appleIntegrationError) {
      return;
    }
    setSettingsError(appleIntegrationError.message);
  }, [appleIntegrationError]);

  useEffect(() => {
    const node = shellRef.current;
    if (!node) {
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setSize({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(340, Math.floor(entry.contentRect.height)),
      });
      if (!viewportInitializedRef.current) {
        viewportInitializedRef.current = true;
        const measuredSize = {
          width: Math.max(320, Math.floor(entry.contentRect.width)),
          height: Math.max(340, Math.floor(entry.contentRect.height)),
        };
        const nextViewport = getDefaultViewport(measuredSize);
        setZoom(nextViewport.zoom);
        setPanOffset(nextViewport.panOffset);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      clearTransitionTimers();
      clearSurfaceCloseTimer();
      if (modeMorphFrameRef.current) {
        cancelAnimationFrame(modeMorphFrameRef.current);
      }
      stopViewportTween();
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") {
        return;
      }
      if (settingsModalOpen) {
        closeSettingsModal();
        return;
      }
      if (syncModalOpen) {
        closeSyncModal();
        return;
      }
      if (sheet) {
        closeSheet();
        return;
      }
      if (contextMenu) {
        setContextMenu(null);
        return;
      }
      if (displayedSurfaceMode) {
        closeSurfaceOverlay();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [contextMenu, displayedSurfaceMode, settingsModalOpen, sheet, surfaceClosingMode, surfaceMode, syncModalOpen]);

  useEffect(() => {
    const shouldRotate3D =
      (!isMorphing && viewMode === "3d") || (isMorphing && modeMorph.to === "3d");
    if (graphSuspended || !shouldRotate3D || isPointerDown) {
      return undefined;
    }
    let frame = 0;
    let last = 0;
    const tick = (timestamp) => {
      if (!last) {
        last = timestamp;
      }
      const delta = timestamp - last;
      last = timestamp;
      setAutoRotation((value) => (value + delta * 0.00004) % (Math.PI * 2));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [graphSuspended, isMorphing, isPointerDown, modeMorph?.to, viewMode]);

  useEffect(() => {
    if (graphSuspended || viewMode !== "2d" || isPointerDown || isMorphing) {
      return undefined;
    }
    let frame = 0;
    let last = 0;
    const tick = (timestamp) => {
      if (!last) {
        last = timestamp;
      }
      const delta = timestamp - last;
      last = timestamp;
      setRotation2D((value) => (value + delta * 0.000022) % (Math.PI * 2));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [graphSuspended, isMorphing, isPointerDown, viewMode]);

  useEffect(
    () => () => {
      if (modeMorphFrameRef.current) {
        cancelAnimationFrame(modeMorphFrameRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!modeMorph || modeMorph.progress !== 0) {
      return undefined;
    }
    const duration = 860;
    let start = 0;
    const { from, to } = modeMorph;
    const tick = (timestamp) => {
      if (!start) {
        start = timestamp;
      }
      const progress = Math.min(1, (timestamp - start) / duration);
      setModeMorph({ from, to, progress });
      if (progress >= 1) {
        setViewMode(to);
        const [nextMode, ...restQueue] = modeMorphQueueRef.current;
        modeMorphQueueRef.current = restQueue;
        if (nextMode) {
          setModeMorph({ from: to, to: nextMode, progress: 0 });
        } else {
          setModeMorph(null);
        }
        modeMorphFrameRef.current = 0;
        return;
      }
      modeMorphFrameRef.current = requestAnimationFrame(tick);
    };
    modeMorphFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (modeMorphFrameRef.current) {
        cancelAnimationFrame(modeMorphFrameRef.current);
        modeMorphFrameRef.current = 0;
      }
    };
  }, [modeMorph?.from, modeMorph?.to]);

  useEffect(() => {
    const holdMs = 9000;
    const fadeMs = 750;
    let holdTimer = 0;
    let fadeTimer = 0;
    const schedule = () => {
      holdTimer = window.setTimeout(() => {
        setMessageVisible(false);
        fadeTimer = window.setTimeout(() => {
          setMessageIndex((value) => (value + 1) % TOPBAR_MESSAGES.length);
          setMessageVisible(true);
          schedule();
        }, fadeMs);
      }, holdMs);
    };
    schedule();
    return () => {
      window.clearTimeout(holdTimer);
      window.clearTimeout(fadeTimer);
    };
  }, []);

  useEffect(() => {
    if (!workingId) {
      return undefined;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [workingId]);

  useEffect(() => {
    if (!error) {
      return undefined;
    }
    const timer = window.setTimeout(() => setError(""), 4500);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!isSearchExpanded) {
      return;
    }
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isSearchExpanded]);

  useEffect(() => {
    if (importPopoverMode !== "url") {
      return;
    }
    const timer = window.setTimeout(() => {
      urlInputRef.current?.focus();
      urlInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [importPopoverMode]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") {
        return;
      }
      if (importPopoverMode === "url") {
        event.preventDefault();
        setImportPopoverMode(null);
        setUrlImportValue("");
        setUrlImportLoading(false);
        setIsImportMenuExpanded(false);
        return;
      }
      if (document.activeElement === searchInputRef.current && isSearchExpanded) {
        event.preventDefault();
        setIsSearchExpanded(false);
        return;
      }
      if (leftPanel === "note-editor") {
        event.preventDefault();
        closeLeftPanel();
        return;
      }
      if (isImportMenuExpanded) {
        event.preventDefault();
        setIsImportMenuExpanded(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [importPopoverMode, isImportMenuExpanded, isSearchExpanded, leftPanel]);

  useEffect(() => {
    if (!isImportMenuExpanded) {
      return undefined;
    }
    const onPointerDown = (event) => {
      if (dockRef.current?.contains(event.target)) {
        return;
      }
      setIsImportMenuExpanded(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [isImportMenuExpanded]);

  const layout = useMemo(() => computeGraphLayout(graph), [graph]);

  useEffect(() => {
    setMinVisibleLevel((current) => Math.min(Math.max(current, 0), layout.maxLevel));
  }, [layout.maxLevel]);

  useEffect(() => {
    if (graphSuspended || selectedId || isTransitioning || graph.nodes.length === 0) {
      setAmbientFlow({ dependencyEdgeIds: new Set(), scheduleEdgeIds: new Set() });
      return undefined;
    }

    const refreshAmbient = () => {
      setAmbientFlow(buildAmbientTreeFlow(graph, layout));
    };
    refreshAmbient();
    const groupTimer = window.setInterval(refreshAmbient, 8000);
    return () => {
      window.clearInterval(groupTimer);
    };
  }, [graph, graphSuspended, isTransitioning, layout, selectedId]);

  const nodesById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  );
  const nodeLayout = useMemo(() => buildNodeLayoutMap(graph, layout, rotation2D), [graph, layout, rotation2D]);

  const focusNodeId = focusedWorkId || workingId;
  const focusNode = focusNodeId ? nodesById.get(focusNodeId) || null : null;

  useEffect(() => {
    if (!focusNodeId) {
      return;
    }
    const level = layout.finalLevels.get(focusNodeId);
    if (level == null || level >= minVisibleLevel) {
      return;
    }
    setMinVisibleLevel(level);
  }, [focusNodeId, layout.finalLevels, minVisibleLevel]);
  useEffect(() => {
    if (!selectedId || focusNodeId) {
      return;
    }
    const level = layout.finalLevels.get(selectedId);
    if (level != null && level < minVisibleLevel) {
      setSelectedId(null);
    }
  }, [focusNodeId, layout.finalLevels, minVisibleLevel, selectedId]);
  const workingPoint = useMemo(() => {
    if (!focusNodeId || !focusNode) {
      return null;
    }
    const spatial = nodeLayout.get(focusNodeId);
    if (!spatial) {
      return null;
    }
    return {
      x: spatial.point3d?.x ?? Math.cos(spatial.angle) * spatial.radialRatio,
      y: spatial.point3d?.y ?? Math.sin(spatial.angle) * spatial.radialRatio,
      z: spatial.point3d?.z ?? 0,
    };
  }, [focusNode, focusNodeId, nodeLayout]);
  const focusRotation = useMemo(() => computeFocusRotation(workingPoint), [workingPoint]);
  const effectiveRotationX = focusNodeId && focusRotation ? focusRotation.rotationX : rotationX;
  const effectiveRotationY =
    focusNodeId && focusRotation ? focusRotation.rotationY + autoRotation : rotationY + autoRotation;
  const effectivePanOffset = focusNodeId ? { x: 0, y: 0 } : panOffset;
  const focusTarget = useMemo(() => {
    if (!focusNodeId) {
      return null;
    }
    const dockRect = dockRef.current?.getBoundingClientRect();
    const dockLeft = dockRect?.left ?? size.width * 0.47;
    const anchorX = Math.max(size.width * 0.18, dockLeft - 124);
    return {
      x: anchorX,
      y: size.height * 0.58,
    };
  }, [focusNodeId, size.height, size.width]);

  const projected = useMemo(
    () =>
      buildProjectedGraph(graph, nodeLayout, {
        size,
        zoom,
        viewMode,
        maxLevel: layout.maxLevel,
        rotationX: effectiveRotationX,
        rotationY: effectiveRotationY,
        panOffset: effectivePanOffset,
        focusNodeId,
        focusTarget,
      }),
    [effectivePanOffset, effectiveRotationX, effectiveRotationY, focusNodeId, focusTarget, graph, layout.maxLevel, nodeLayout, size, viewMode, zoom],
  );
  const projected2D = useMemo(
    () =>
      buildProjectedGraph(graph, nodeLayout, {
        size,
        zoom,
        viewMode: "2d",
        maxLevel: layout.maxLevel,
        rotationX: effectiveRotationX,
        rotationY: effectiveRotationY,
        panOffset: effectivePanOffset,
        focusNodeId,
        focusTarget,
      }),
    [effectivePanOffset, effectiveRotationX, effectiveRotationY, focusNodeId, focusTarget, graph, layout.maxLevel, nodeLayout, size, zoom],
  );
  const projected3D = useMemo(
    () =>
      buildProjectedGraph(graph, nodeLayout, {
        size,
        zoom,
        viewMode: "3d",
        maxLevel: layout.maxLevel,
        rotationX: effectiveRotationX,
        rotationY: effectiveRotationY,
        panOffset: effectivePanOffset,
        focusNodeId,
        focusTarget,
      }),
    [effectivePanOffset, effectiveRotationX, effectiveRotationY, focusNodeId, focusTarget, graph, layout.maxLevel, nodeLayout, size, zoom],
  );
  const projectedLinear = useMemo(
    () =>
      buildProjectedGraph(graph, nodeLayout, {
        size,
        zoom,
        viewMode: "linear",
        maxLevel: layout.maxLevel,
        rotationX: effectiveRotationX,
        rotationY: effectiveRotationY,
        panOffset: effectivePanOffset,
        focusNodeId,
        focusTarget,
      }),
    [effectivePanOffset, effectiveRotationX, effectiveRotationY, focusNodeId, focusTarget, graph, layout.maxLevel, nodeLayout, size, zoom],
  );

  const transitionFromNodeLayout = useMemo(
    () =>
      transition ? buildNodeLayoutMap(transition.fromGraph, transition.fromLayout, rotation2D) : null,
    [rotation2D, transition],
  );
  const transitionToNodeLayout = useMemo(
    () =>
      transition ? buildNodeLayoutMap(transition.toGraph, transition.toLayout, rotation2D) : null,
    [rotation2D, transition],
  );
  const transitionFromProjected = useMemo(
    () =>
      transition && transitionFromNodeLayout
        ? buildProjectedGraph(transition.fromGraph, transitionFromNodeLayout, {
            size,
            zoom,
            viewMode,
            maxLevel: transition.fromLayout.maxLevel,
            rotationX: effectiveRotationX,
            rotationY: effectiveRotationY,
            panOffset: effectivePanOffset,
            focusNodeId,
            focusTarget,
          })
        : null,
    [
      effectivePanOffset,
      effectiveRotationX,
      effectiveRotationY,
      focusNodeId,
      focusTarget,
      size,
      transition,
      transitionFromNodeLayout,
      viewMode,
      zoom,
    ],
  );
  const transitionToProjected = useMemo(
    () =>
      transition && transitionToNodeLayout
        ? buildProjectedGraph(transition.toGraph, transitionToNodeLayout, {
            size,
            zoom,
            viewMode,
            maxLevel: transition.toLayout.maxLevel,
            rotationX: effectiveRotationX,
            rotationY: effectiveRotationY,
            panOffset: effectivePanOffset,
            focusNodeId,
            focusTarget,
          })
        : null,
    [
      effectivePanOffset,
      effectiveRotationX,
      effectiveRotationY,
      focusNodeId,
      focusTarget,
      size,
      transition,
      transitionToNodeLayout,
      viewMode,
      zoom,
    ],
  );

  const selected = selectedId ? nodesById.get(selectedId) || null : null;
  const selectedDetails = useMemo(
    () => buildSelectedDetails(selected, layout, graph, now),
    [graph, layout, now, selected],
  );
  const levelShells = useMemo(
    () => buildLevelShells(layout.maxLevel, levelSeed),
    [layout.maxLevel, levelSeed],
  );

  const selectedDependencyEdges = useMemo(
    () =>
      graph.dependencies.filter(
        (edge) => edge.parentId === selectedId || edge.childId === selectedId,
      ),
    [graph.dependencies, selectedId],
  );

  const selectedScheduleEdges = useMemo(
    () =>
      graph.schedules.filter(
        (edge) => edge.earlierId === selectedId || edge.laterId === selectedId,
      ),
    [graph.schedules, selectedId],
  );

  const highlightedDependencyIds = useMemo(() => {
    if (!selectedId) {
      return new Set();
    }
    return new Set([
      selectedId,
      ...collectAncestors(selectedId, layout.parentMap),
      ...collectDescendants(selectedId, layout.childMap),
    ]);
  }, [layout.childMap, layout.parentMap, selectedId]);

  const renderState = useMemo(() => {
    if (!transition || !transitionFromProjected || !transitionToProjected) {
      return {
        projected,
        dependencyEdges: graph.dependencies.map((edge) => ({
          ...edge,
          id: getDependencyEdgeId(edge),
          transitionState: "",
        })),
        scheduleEdges: graph.schedules.map((edge) => ({
          ...edge,
          id: getScheduleEdgeId(edge),
          transitionState: "",
        })),
        nodes: projected.ordered.map((node) => ({
          ...node,
          transitionState: "",
        })),
        levelShells: levelShells.map((shell) => ({
          ...shell,
          transitionState: "",
        })),
      };
    }

    const outgoingPhase =
      transition.phase === "outgoing-nodes" || transition.phase === "outgoing-edges";
    const baseProjected = outgoingPhase ? transitionFromProjected : transitionToProjected;
    const dependencyEdges = [];
    const scheduleEdges = [];
    const nodes = [];

    if (outgoingPhase) {
      transition.fromGraph.dependencies.forEach((edge) => {
        dependencyEdges.push({
          ...edge,
          id: getDependencyEdgeId(edge),
          transitionState:
            transition.phase === "outgoing-edges" &&
            transition.removedDependencyEdgeIds.has(getDependencyEdgeId(edge))
              ? "exiting"
              : "",
        });
      });
      transition.fromGraph.schedules.forEach((edge) => {
        scheduleEdges.push({
          ...edge,
          id: getScheduleEdgeId(edge),
          transitionState:
            transition.phase === "outgoing-edges" &&
            transition.removedScheduleEdgeIds.has(getScheduleEdgeId(edge))
              ? "exiting"
              : "",
        });
      });
      transitionFromProjected.ordered.forEach((node) => {
        if (
          transition.phase === "outgoing-edges" &&
          transition.removedNodeIds.has(node.id)
        ) {
          return;
        }
        nodes.push({
          ...node,
          transitionState:
            transition.phase === "outgoing-nodes" && transition.removedNodeIds.has(node.id)
              ? "exiting"
              : "",
        });
      });

      return {
        projected: baseProjected,
        dependencyEdges,
        scheduleEdges,
        nodes,
        levelShells: buildLevelShells(transition.fromLayout.maxLevel, levelSeed).map((shell) => ({
          ...shell,
          transitionState: "",
        })),
      };
    }

    transition.toGraph.dependencies.forEach((edge) => {
      const edgeId = getDependencyEdgeId(edge);
      if (transition.phase === "layout-shift" && transition.addedDependencyEdgeIds.has(edgeId)) {
        return;
      }
      dependencyEdges.push({
        ...edge,
        id: edgeId,
        transitionState: transition.addedDependencyEdgeIds.has(edgeId) ? "entering" : "moving",
      });
    });
    transition.toGraph.schedules.forEach((edge) => {
      const edgeId = getScheduleEdgeId(edge);
      if (transition.phase === "layout-shift" && transition.addedScheduleEdgeIds.has(edgeId)) {
        return;
      }
      scheduleEdges.push({
        ...edge,
        id: edgeId,
        transitionState: transition.addedScheduleEdgeIds.has(edgeId) ? "entering" : "moving",
      });
    });
    transitionToProjected.ordered.forEach((node) => {
      if (
        (transition.phase === "layout-shift" || transition.phase === "incoming-edges") &&
        transition.addedNodeIds.has(node.id)
      ) {
        return;
      }
      nodes.push({
        ...node,
        transitionState: transition.addedNodeIds.has(node.id) ? "entering" : "moving",
      });
    });

    const shellMap = new Map();
    if (transition.phase === "layout-shift") {
      buildLevelShells(transition.fromLayout.maxLevel, levelSeed).forEach((shell) => {
        shellMap.set(shell.level, {
          ...shell,
          transitionState: "exiting",
        });
      });
      buildLevelShells(transition.toLayout.maxLevel, levelSeed).forEach((shell) => {
        shellMap.set(shell.level, {
          ...shell,
          transitionState: shellMap.has(shell.level) ? "moving" : "entering",
        });
      });
    } else {
      buildLevelShells(transition.toLayout.maxLevel, levelSeed).forEach((shell) => {
        shellMap.set(shell.level, {
          ...shell,
          transitionState: "",
        });
      });
    }

    return {
      projected: baseProjected,
      dependencyEdges,
      scheduleEdges,
      nodes,
      levelShells: [...shellMap.values()],
    };
  }, [
    graph.dependencies,
    graph.schedules,
    levelShells,
    projected,
    transition,
    transitionFromProjected,
    transitionToProjected,
    levelSeed,
  ]);
  const renderMaxLevel = useMemo(
    () => Math.max(0, ...renderState.levelShells.map((shell) => shell.level)),
    [renderState.levelShells],
  );
  const visibleNodeState = useMemo(
    () => renderState.nodes.filter((node) => (node.level ?? 0) >= minVisibleLevel),
    [minVisibleLevel, renderState.nodes],
  );
  const visibleNodeStateById = useMemo(
    () => new Map(visibleNodeState.map((node) => [node.id, node])),
    [visibleNodeState],
  );
  const visibleLevelShells = useMemo(
    () => renderState.levelShells.filter((shell) => shell.level >= minVisibleLevel),
    [minVisibleLevel, renderState.levelShells],
  );
  const visibleDependencyEdges = useMemo(
    () =>
      renderState.dependencyEdges.filter(
        (edge) => visibleNodeStateById.has(edge.parentId) && visibleNodeStateById.has(edge.childId),
      ),
    [renderState.dependencyEdges, visibleNodeStateById],
  );
  const visibleScheduleEdges = useMemo(
    () =>
      renderState.scheduleEdges.filter(
        (edge) => visibleNodeStateById.has(edge.earlierId) && visibleNodeStateById.has(edge.laterId),
      ),
    [renderState.scheduleEdges, visibleNodeStateById],
  );

  function getProjectedForMode(mode) {
    if (mode === "linear") {
      return projectedLinear;
    }
    if (mode === "2d") {
      return projected2D;
    }
    return projected3D;
  }

  const displayProjected = useMemo(() => {
    if (transition || !modeMorph) {
      return renderState.projected;
    }
    const fromProjected = getProjectedForMode(modeMorph.from);
    const toProjected = getProjectedForMode(modeMorph.to);
    return interpolateProjectedGraphs(fromProjected, toProjected, visibleNodeState, modeMorph.progress);
  }, [modeMorph, projected2D, projected3D, projectedLinear, renderState.projected, transition, visibleNodeState]);
  const displayNodes = useMemo(() => {
    if (!displayProjected?.ordered) {
      return visibleNodeState;
    }
    const nodeStateById = new Map(visibleNodeState.map((node) => [node.id, node]));
    return displayProjected.ordered
      .filter((projectedNode) => nodeStateById.has(projectedNode.id))
      .map((projectedNode) => ({
        ...nodeStateById.get(projectedNode.id),
        ...projectedNode,
      }));
  }, [displayProjected, visibleNodeState]);
  const staticShellProjection = useMemo(
    () => ({
      centerX: size.width / 2 + effectivePanOffset.x,
      centerY: size.height / 2 + effectivePanOffset.y,
      radius: Math.min(size.width, size.height) * 0.39 * zoom,
    }),
    [effectivePanOffset.x, effectivePanOffset.y, size.height, size.width, zoom],
  );
  const sphereProjection = graphSuspended ? staticShellProjection : displayProjected;
  const showDynamicGraph = !graphSuspended;
  const sphereShellWeight = useMemo(() => {
    if (!modeMorph) {
      return viewMode === "linear" ? 0 : 1;
    }
    if (modeMorph.from === "linear" && modeMorph.to === "2d") {
      return modeMorph.progress;
    }
    if (modeMorph.from === "2d" && modeMorph.to === "linear") {
      return 1 - modeMorph.progress;
    }
    return modeMorph.to === "linear" ? 0 : 1;
  }, [modeMorph, viewMode]);
  const linearGuideWeight = useMemo(() => {
    if (!modeMorph) {
      return viewMode === "linear" ? 1 : 0;
    }
    if (modeMorph.from === "linear" && modeMorph.to === "2d") {
      return 1 - modeMorph.progress;
    }
    if (modeMorph.from === "2d" && modeMorph.to === "linear") {
      return modeMorph.progress;
    }
    return modeMorph.to === "linear" ? 1 : 0;
  }, [modeMorph, viewMode]);
  const linearColumns = useMemo(() => {
    const levels = [];
    for (let level = layout.maxLevel; level >= minVisibleLevel; level -= 1) {
      levels.push({
        level,
        x: getLinearColumnX(level, layout.maxLevel, projectedLinear.centerX, projectedLinear.radius),
      });
    }
    return levels;
  }, [layout.maxLevel, minVisibleLevel, projectedLinear.centerX, projectedLinear.radius]);
  const canCollapseLevels = minVisibleLevel < layout.maxLevel;
  const canExpandLevels = minVisibleLevel > 0;
  const showLinearControls = displayViewMode === "linear" && !isMorphing;

  useEffect(() => {
    const active = graph.nodes.find((node) => node.workStartedAt);
    setWorkingId(active?.id || null);
  }, [graph]);

  useEffect(() => {
    if (focusedWorkId && !nodesById.has(focusedWorkId)) {
      setFocusedWorkId(null);
    }
  }, [focusedWorkId, nodesById]);

  useEffect(() => {
    if (workingId) {
      setSelectedId(workingId);
    }
  }, [workingId]);

  function updateGraph(mutator) {
    const draft = cloneGraph(graph);
    mutator(draft);
    const nextGraph = sanitizeGraph(draft);
    setGraph(nextGraph);
    return nextGraph;
  }

  function runLightweightMutation(mutator, action) {
    if (isTransitioning) {
      return;
    }
    const previousGraph = cloneGraph(graph);
    try {
      updateGraph(mutator);
    } catch (nextError) {
      setError(nextError.message);
      return;
    }
    void action().catch((nextError) => {
      setGraph(sanitizeGraph(canonicalGraph || previousGraph));
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    });
  }

  function startStructuralTransition(operation, mutator, action) {
    if (isTransitioning) {
      return;
    }
    const fromGraph = cloneGraph(graph);
    const draft = cloneGraph(graph);
    mutator(draft);
    const toGraph = sanitizeGraph(draft);
    const diff = buildGraphDiff(fromGraph, toGraph);
    const hasStructuralChange =
      diff.removedNodeIds.size ||
      diff.addedNodeIds.size ||
      diff.removedDependencyEdgeIds.size ||
      diff.addedDependencyEdgeIds.size ||
      diff.removedScheduleEdgeIds.size ||
      diff.addedScheduleEdgeIds.size;
    if (!hasStructuralChange) {
      setGraph(toGraph);
      if (action) {
        void action().catch((nextError) => {
          setGraph(sanitizeGraph(canonicalGraph || fromGraph));
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        });
      }
      return;
    }

    clearTransitionTimers();
    const fromLayout = computeGraphLayout(fromGraph);
    const toLayout = computeGraphLayout(toGraph);
    const phases = buildTransitionPhases(diff);
    const transitionId = Date.now();
    const selectedRemoved = selectedId && diff.removedNodeIds.has(selectedId);
    setContextMenu(null);

    setTransition({
      id: transitionId,
      type: "structural",
      operation,
      phase: phases[0],
      fromGraph,
      toGraph,
      fromLayout,
      toLayout,
      ...diff,
    });

    let elapsed = 0;
    phases.forEach((phase) => {
      const timer = window.setTimeout(() => {
        setTransition((current) =>
          current && current.id === transitionId ? { ...current, phase } : current,
        );
        if (phase === "outgoing-edges" && selectedRemoved) {
          setSelectedId(null);
        }
        if (phase === "layout-shift") {
          setGraph(toGraph);
        }
      }, elapsed);
      transitionTimersRef.current.push(timer);
      elapsed += getPhaseDuration(phase);
    });

    transitionTimersRef.current.push(
      window.setTimeout(() => {
        setTransition((current) => (current && current.id === transitionId ? null : current));
        clearTransitionTimers();
      }, elapsed),
    );

    if (action) {
      void action().catch((nextError) => {
        clearTransitionTimers();
        setTransition(null);
        setGraph(sanitizeGraph(canonicalGraph || fromGraph));
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      });
    }
  }

  async function runSearch() {
    if (searchState === "searching") {
      return;
    }
    const query = searchQuery.trim().toLowerCase();
    setSelectedId(null);
    setNodesVisible(false);
    setSearchState("searching");
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    const found = query
      ? graph.nodes.find((node) => {
          const title = node.title.toLowerCase();
          const id = node.id.toLowerCase();
          return title.includes(query) || id.includes(query);
        })
      : null;
    setSearchState(found ? "success" : "failure");
    if (found) {
      const foundLevel = layout.finalLevels.get(found.id);
      if (foundLevel != null) {
        setMinVisibleLevel((current) => Math.min(current, foundLevel));
      }
      setSelectedId(found.id);
    }
    setNodesVisible(true);
    await new Promise((resolve) => window.setTimeout(resolve, 750));
    setSearchState("idle");
  }

  function handleSearchTrigger() {
    if (!isSearchExpanded) {
      setIsSearchExpanded(true);
      return;
    }
    void runSearch();
  }

  function closeSearchCommand() {
    setIsSearchExpanded(false);
    setSearchQuery("");
  }

  function toggleImportMenu() {
    setImportPopoverMode(null);
    setIsImportMenuExpanded((value) => !value);
  }

  function openUrlImportPopover() {
    setSyncModalOpen(false);
    setSettingsModalOpen(false);
    closeLeftPanel();
    setImportPopoverMode("url");
    setIsImportMenuExpanded(false);
  }

  function triggerBrowseImport() {
    setIsImportMenuExpanded(false);
    browseInputRef.current?.click();
  }

  function handleBrowseInputChange(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) {
      setIsImportMenuExpanded(false);
      return;
    }
    void importSelectedFiles(files);
  }

  function openSheet(nextSheet, nextForm = defaultForm(null)) {
    if (isTransitioning) {
      return;
    }
    setContextMenu(null);
    setSheet(nextSheet);
    setForm(nextForm);
  }

  function closeSheet() {
    setSheet(null);
    setForm(defaultForm(null));
  }

  function resetSyncState(nextMode = "dry_run") {
    setSyncRunMode(nextMode);
    setSyncResult(null);
    setSyncError("");
    clearSchedulingRun();
  }

  function openSyncModal() {
    setContextMenu(null);
    setIsImportMenuExpanded(false);
    setIsModeMenuExpanded(false);
    setSettingsModalOpen(false);
    setImportPopoverMode(null);
    closeLeftPanel();
    resetSyncState();
    setSyncModalOpen(true);
  }

  function closeSyncModal() {
    setSyncModalOpen(false);
    resetSyncState();
  }

  async function submitSyncPlan(event) {
    event.preventDefault();
    setSyncError("");
    try {
      const nextResult = await runSchedulingReplan({
        mode: syncRunMode,
        parameters: {},
      });
      setSyncResult(nextResult);
      if (syncRunMode === "apply") {
        await reloadGraph();
      }
    } catch (nextError) {
      setSyncError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  function openSettingsModal() {
    setContextMenu(null);
    setIsImportMenuExpanded(false);
    setIsModeMenuExpanded(false);
    setSyncModalOpen(false);
    setImportPopoverMode(null);
    closeLeftPanel();
    setSettingsError("");
    setSettingsModalOpen(true);
  }

  function closeSettingsModal() {
    setSettingsModalOpen(false);
    setSettingsError("");
    setAppleSettingsForm((current) => ({
      username: appleIntegrationStatus?.ownerEmail || current.username,
      password: "",
      baseUrl: appleIntegrationStatus?.baseUrl || current.baseUrl || DEFAULT_APPLE_BASE_URL,
      writableCalendarId: appleIntegrationStatus?.writableCalendarId || current.writableCalendarId,
    }));
  }

  async function submitAppleConnection(event) {
    event.preventDefault();
    setSettingsError("");
    if (!appleSettingsForm.username.trim() || !appleSettingsForm.password.trim()) {
      setSettingsError("Apple ID email and app-specific password are required.");
      return;
    }
    try {
      await connectAppleCalendar({
        username: appleSettingsForm.username.trim(),
        password: appleSettingsForm.password,
        baseUrl: (appleSettingsForm.baseUrl || DEFAULT_APPLE_BASE_URL).trim(),
        writableCalendarId: appleSettingsForm.writableCalendarId || undefined,
      });
      setAppleSettingsForm((current) => ({ ...current, password: "" }));
    } catch (nextError) {
      setSettingsError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function submitApplePreferences(event) {
    event.preventDefault();
    setSettingsError("");
    if (!appleSettingsForm.writableCalendarId) {
      setSettingsError("Choose a writable calendar first.");
      return;
    }
    try {
      await updateAppleCalendarPreferences({
        writableCalendarId: appleSettingsForm.writableCalendarId,
      });
    } catch (nextError) {
      setSettingsError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function handleAppleDisconnect() {
    setSettingsError("");
    try {
      await disconnectAppleCalendar();
      setAppleSettingsForm({
        username: "",
        password: "",
        baseUrl: DEFAULT_APPLE_BASE_URL,
        writableCalendarId: "",
      });
    } catch (nextError) {
      setSettingsError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  function isBackgroundTarget(target, currentTarget) {
    if (target === currentTarget) {
      return true;
    }
    const interactive = target?.closest?.(
      ".node-core, .node-halo, .node-soft-edge, .node-label, .edge-line, .edge-ribbon, .edge-hit-area",
    );
    if (interactive) {
      return false;
    }
    return true;
  }

  function getPointerAngle(event) {
    const bounds = shellRef.current?.getBoundingClientRect();
    if (!bounds) {
      return 0;
    }
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    return Math.atan2(event.clientY - centerY, event.clientX - centerX);
  }

  function onPointerDown(event) {
    setContextMenu(null);
    stopViewportTween();
    setIsPointerDown(true);
    const backgroundTarget = isBackgroundTarget(event.target, event.currentTarget);
    if (event.button !== 0 || isMorphing || !backgroundTarget) {
      return;
    }
    const panDrag = event.ctrlKey || event.metaKey;
    if (viewMode === "linear") {
      dragRef.current = {
        active: true,
        mode: "pan",
        x: event.clientX,
        y: event.clientY,
        angle: 0,
      };
      setIsDragging(true);
      return;
    }
    if (viewMode === "2d") {
      dragRef.current = {
        active: true,
        mode: panDrag ? "pan" : "2d",
        x: event.clientX,
        y: event.clientY,
        angle: getPointerAngle(event),
      };
      setIsDragging(true);
      return;
    }
    dragRef.current = {
      active: true,
      mode: panDrag ? "pan" : "3d",
      x: event.clientX,
      y: event.clientY,
      angle: 0,
    };
    setIsDragging(true);
  }

  function onPointerMove(event) {
    if (!dragRef.current.active) {
      return;
    }
    if (dragRef.current.mode === "pan") {
      const dx = event.clientX - dragRef.current.x;
      const dy = event.clientY - dragRef.current.y;
      dragRef.current.x = event.clientX;
      dragRef.current.y = event.clientY;
      setPanOffset((value) => ({ x: value.x + dx, y: value.y + dy }));
      return;
    }
    if (dragRef.current.mode === "2d") {
      const nextAngle = getPointerAngle(event);
      let delta = nextAngle - dragRef.current.angle;
      if (delta > Math.PI) {
        delta -= Math.PI * 2;
      } else if (delta < -Math.PI) {
        delta += Math.PI * 2;
      }
      dragRef.current.angle = nextAngle;
      setRotation2D((value) => value + delta);
      return;
    }
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    dragRef.current.x = event.clientX;
    dragRef.current.y = event.clientY;
    setRotationY((value) => value + dx * 0.0052);
    setRotationX((value) => {
      const next = value + dy * 0.0038;
      return Math.max(-1.45, Math.min(1.45, next));
    });
  }

  function stopDragging() {
    dragRef.current.active = false;
    dragRef.current.mode = null;
    setIsDragging(false);
    setIsPointerDown(false);
  }

  function closeSurfaceOverlay(afterClose = null) {
    clearSurfaceCloseTimer();
    if (surfaceMode === "graph" && !surfaceClosingMode) {
      if (afterClose) {
        afterClose();
      }
      return;
    }
    const closingMode = surfaceMode !== "graph" ? surfaceMode : surfaceClosingMode;
    if (!closingMode) {
      if (afterClose) {
        afterClose();
      }
      return;
    }
    pendingSurfaceActionRef.current = afterClose;
    setSurfaceClosingMode(closingMode);
    setSurfaceMode("graph");
    surfaceCloseTimerRef.current = window.setTimeout(() => {
      setSurfaceClosingMode(null);
      surfaceCloseTimerRef.current = 0;
      const callback = pendingSurfaceActionRef.current;
      pendingSurfaceActionRef.current = null;
      if (callback) {
        callback();
      }
    }, SURFACE_TRANSITION_MS);
  }

  function performGraphModeSwitch(nextMode) {
    if (nextMode === viewMode || isMorphing) {
      return;
    }
    const [firstMode, ...restModes] = getModeMorphSequence(viewMode, nextMode);
    if (!firstMode) {
      return;
    }
    modeMorphQueueRef.current = restModes;
    setModeMorph({ from: viewMode, to: firstMode, progress: 0 });
  }

  function switchViewMode(nextMode) {
    setIsModeMenuExpanded(false);
    if (surfaceMode !== "graph" || surfaceClosingMode) {
      closeSurfaceOverlay(() => performGraphModeSwitch(nextMode));
      return;
    }
    performGraphModeSwitch(nextMode);
  }

  function collapseAllLevels() {
    setMinVisibleLevel(layout.maxLevel);
  }

  function expandAllLevels() {
    setMinVisibleLevel(0);
  }

  function collapseAtLevel(level) {
    setMinVisibleLevel(Math.min(layout.maxLevel, Math.max(level + 1, 0)));
  }

  function maybeExpandNextLevel(nodeId) {
    if (minVisibleLevel <= 0) {
      return;
    }
    const nextLevel = minVisibleLevel - 1;
    const descendants = collectDescendants(nodeId, layout.childMap);
    const revealsNextLevel = [...descendants].some(
      (descendantId) => (layout.finalLevels.get(descendantId) || 0) === nextLevel,
    );
    if (revealsNextLevel) {
      setMinVisibleLevel(nextLevel);
    }
  }

  function onWheel(event) {
    if (isMorphing) {
      return;
    }
    stopViewportTween();
    if (event.cancelable) {
      event.preventDefault();
    }
    const zoomDelta = event.deltaY > 0 ? -0.08 : 0.08;
    setZoom((value) => Math.max(0.55, Math.min(1.8, value + zoomDelta)));
  }

  function openContextMenu(event, nodeId) {
    event.preventDefault();
    event.stopPropagation();
    if (isTransitioning) {
      return;
    }
    setSelectedId(nodeId);
    setContextMenu({
      kind: "node",
      x: event.clientX,
      y: event.clientY,
      nodeId,
    });
  }

  function openDependencyEdgeContextMenu(event, parentId, childId) {
    event.preventDefault();
    event.stopPropagation();
    if (isTransitioning) {
      return;
    }
    setSelectedId(childId);
    setContextMenu({
      kind: "dependency-edge",
      x: event.clientX,
      y: event.clientY,
      parentId,
      childId,
    });
  }

  function openScheduleEdgeContextMenu(event, earlierId, laterId) {
    event.preventDefault();
    event.stopPropagation();
    if (isTransitioning) {
      return;
    }
    setSelectedId(laterId);
    setContextMenu({
      kind: "schedule-edge",
      x: event.clientX,
      y: event.clientY,
      earlierId,
      laterId,
    });
  }

  function openBackgroundContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    if (isTransitioning || !isBackgroundTarget(event.target, event.currentTarget)) {
      return;
    }
    setContextMenu({
      kind: "background",
      x: event.clientX,
      y: event.clientY,
    });
  }

  function toggleSelectedNode(nodeId) {
    stopViewportTween();
    const node = nodesById.get(nodeId);
    if (node?.kind === "note") {
      if (node.linkedNoteId) {
        void openExistingNote(node.linkedNoteId);
      } else {
        openDraftNoteWorkspace();
      }
      return;
    }
    maybeExpandNextLevel(nodeId);
    setSelectedId((current) => (current === nodeId ? null : nodeId));
  }

  function animateViewport(nextState) {
    stopViewportTween();
    const startZoom = zoom;
    const startPan = panOffset;
    const targetZoom = nextState.zoom ?? zoom;
    const targetPan = nextState.panOffset ?? panOffset;
    const duration = 380;
    let start = 0;

    const tick = (timestamp) => {
      if (!start) {
        start = timestamp;
      }
      const progress = Math.min(1, (timestamp - start) / duration);
      const eased = 1 - (1 - progress) * (1 - progress) * (1 - progress);
      setZoom(startZoom + (targetZoom - startZoom) * eased);
      setPanOffset({
        x: startPan.x + (targetPan.x - startPan.x) * eased,
        y: startPan.y + (targetPan.y - startPan.y) * eased,
      });
      if (progress >= 1) {
        viewportTweenFrameRef.current = 0;
        return;
      }
      viewportTweenFrameRef.current = requestAnimationFrame(tick);
    };

    viewportTweenFrameRef.current = requestAnimationFrame(tick);
  }

  function recenterView() {
    animateViewport({ panOffset: defaultViewport.panOffset });
  }

  function removeDraftNoteNode() {
    if (!draftNoteNodeId) {
      return;
    }
    setGraph((current) =>
      sanitizeGraph({
        ...current,
        nodes: current.nodes.filter((node) => node.id !== draftNoteNodeId),
        dependencies: current.dependencies.filter(
          (edge) => edge.parentId !== draftNoteNodeId && edge.childId !== draftNoteNodeId,
        ),
        schedules: current.schedules.filter(
          (edge) => edge.earlierId !== draftNoteNodeId && edge.laterId !== draftNoteNodeId,
        ),
      }),
    );
    setDraftNoteNodeId(null);
  }

  function openDraftNoteWorkspace() {
    setSyncModalOpen(false);
    setSettingsModalOpen(false);
    stopViewportTween();
    setContextMenu(null);
    setSelectedId(null);
    setActiveNote(null);
    setNoteDraft("");
    setLeftPanel("note-editor");
    setImportPopoverMode(null);
    setIsImportMenuExpanded(false);
    if (!draftNoteNodeId) {
      const nodeId = `draft-note-${Date.now()}`;
      setDraftNoteNodeId(nodeId);
      setGraph((current) =>
        sanitizeGraph({
          ...current,
          nodes: [
            ...current.nodes,
            {
              id: nodeId,
              title: "Writing note",
              notes: "Draft note in progress.",
              kind: "note",
              linkedNoteId: null,
              startDate: "",
              bestBefore: "",
              expectedTime: null,
              realTime: 0,
              expectedEffort: null,
              realEffort: null,
              workStartedAt: null,
            },
          ],
        }),
      );
    }
  }

  async function openExistingNote(noteId) {
    try {
      removeDraftNoteNode();
      setContextMenu(null);
      const note = await getNote(noteId);
      setActiveNote(note);
      setNoteDraft(serializeNoteForEditor(note));
      setLeftPanel("note-editor");
      setImportPopoverMode(null);
      setIsImportMenuExpanded(false);
      setSelectedId(note.linkedActivityId || null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  function closeLeftPanel() {
    removeDraftNoteNode();
    setLeftPanel(null);
    setActiveNote(null);
    setNoteDraft("");
    recenterView();
  }

  async function submitNote(event) {
    event.preventDefault();
    const payload = parseNoteDraft(noteDraft);
    if (!payload.title) {
      setError("Note title is required.");
      return;
    }
    try {
      if (activeNote?.id) {
        const response = await updateNote(activeNote.id, payload);
        setGraph(sanitizeGraph(response.graph));
        await reloadGraph();
        setActiveNote(response.note);
        closeLeftPanel();
        return;
      }

      const draftId = draftNoteNodeId;
      if (draftId) {
        startStructuralTransition(
          "create-note",
          (draft) => {
            draft.nodes = draft.nodes.filter((node) => node.id !== draftId);
            draft.nodes.push({
              id: createNodeId(payload.title, draft.nodes),
              title: payload.title,
              notes: payload.body.trim().slice(0, 240),
              kind: "note",
              linkedNoteId: null,
              startDate: "",
              bestBefore: "",
              expectedTime: null,
              realTime: 0,
              expectedEffort: null,
              realEffort: null,
              workStartedAt: null,
            });
          },
          async () => {
            const response = await createNote(payload);
            setGraph(sanitizeGraph(response.graph));
            setDraftNoteNodeId(null);
            await reloadGraph();
            setSelectedId(response.note.linkedActivityId || null);
          },
        );
        setLeftPanel(null);
        setActiveNote(null);
        setNoteDraft("");
        recenterView();
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function importSelectedFiles(files) {
    if (!files.length) {
      return;
    }
    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append("files", file);
      });
      const response = await importTxtNotes(formData);
      setGraph(sanitizeGraph(response.graph));
      await reloadGraph();
      setIsImportMenuExpanded(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setIsImportMenuExpanded(false);
    }
  }

  async function submitUrlImport(event) {
    event.preventDefault();
    const url = urlImportValue.trim();
    if (!url) {
      setError("Enter a URL to import.");
      return;
    }
    setUrlImportLoading(true);
    try {
      const response = await importNoteFromUrl({ url });
      setGraph(sanitizeGraph(response.graph));
      await reloadGraph();
      setImportPopoverMode(null);
      setUrlImportValue("");
      setIsImportMenuExpanded(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setUrlImportLoading(false);
    }
  }

  function submitActivityForm(event) {
    event.preventDefault();
    const payload = {
      title: form.title.trim(),
      notes: form.notes.trim(),
      startDate: form.startDate || "",
      bestBefore: form.bestBefore || "",
      expectedTime: toNumberOrNull(form.expectedTime),
      realTime: toNumberOrNull(form.realTime) || 0,
      expectedEffort: toNumberOrNull(form.expectedEffort),
      realEffort: toNumberOrNull(form.realEffort),
    };
    if (!payload.title) {
      setError("Activity title is required.");
      return;
    }

    if (sheet?.type === "create") {
      startStructuralTransition("create", (draft) => {
        const id = createNodeId(payload.title, draft.nodes);
        draft.nodes.push({
          id,
          ...payload,
          workStartedAt: null,
        });
      }, () => createActivity(payload));
      closeSheet();
      return;
    }

    if (sheet?.type === "create-child" && sheet.parentId) {
      startStructuralTransition("create", (draft) => {
        const id = createNodeId(payload.title, draft.nodes);
        draft.nodes.push({
          id,
          ...payload,
          workStartedAt: null,
        });
        draft.dependencies.push({ parentId: sheet.parentId, childId: id });
      }, () =>
        createActivity({
          ...payload,
          parentIds: [sheet.parentId],
        }));
      closeSheet();
      return;
    }

    if (sheet?.type === "insert-between" && sheet.parentId && sheet.childId) {
      startStructuralTransition("insert-between", (draft) => {
        const id = createNodeId(payload.title, draft.nodes);
        draft.nodes.push({
          id,
          ...payload,
          workStartedAt: null,
        });
        draft.dependencies = draft.dependencies.filter(
          (edge) =>
            !(
              edge.parentId === sheet.parentId &&
              edge.childId === sheet.childId
            ),
        );
        draft.dependencies.push(
          { parentId: sheet.parentId, childId: id },
          { parentId: id, childId: sheet.childId },
        );
      }, () =>
        insertBetween(sheet.childId, {
          ...payload,
          parentId: sheet.parentId,
          childId: sheet.childId,
        }));
      closeSheet();
      return;
    }

    if (sheet?.type === "edit" && sheet.nodeId) {
      runLightweightMutation(
        (draft) => {
          const target = draft.nodes.find((node) => node.id === sheet.nodeId);
          if (!target) {
            return;
          }
          Object.assign(target, payload);
        },
        () =>
          updateActivity(
            sheet.nodeId,
            payload,
            (current) => replaceNode(current, sheet.nodeId, (node) => ({ ...node, ...payload })),
          ),
      );
      closeSheet();
    }
  }

  function startWork(nodeId) {
    if (isTransitioning) {
      return;
    }
    if (surfaceMode !== "graph" || surfaceClosingMode) {
      closeSurfaceOverlay();
    }
    setSelectedId(nodeId);
    setFocusedWorkId(nodeId);
    runLightweightMutation(
      (draft) => {
        draft.nodes.forEach((node) => {
          if (node.id !== nodeId && node.workStartedAt) {
            const elapsedMs = Math.max(0, Date.now() - new Date(node.workStartedAt).getTime());
            node.realTime = Number(node.realTime || 0) + elapsedMs / 1000 / 60 / 60;
            node.workStartedAt = null;
          }
        });
        const target = draft.nodes.find((node) => node.id === nodeId);
        if (target && !target.workStartedAt) {
          target.workStartedAt = new Date().toISOString();
        }
      },
      () =>
        startWorkMutation(nodeId, (current) => {
          const startedAt = new Date().toISOString();
          return {
            ...current,
            nodes: current.nodes.map((node) => {
              if (node.id === nodeId) {
                return node.workStartedAt ? node : { ...node, workStartedAt: startedAt };
              }
              if (!node.workStartedAt) {
                return node;
              }
              const elapsedMs = Math.max(0, Date.now() - new Date(node.workStartedAt).getTime());
              return {
                ...node,
                realTime: Number(node.realTime || 0) + elapsedMs / 1000 / 60 / 60,
                workStartedAt: null,
              };
            }),
          };
        }),
    );
    setContextMenu(null);
  }

  function stopWork(nodeId) {
    if (isTransitioning) {
      return;
    }
    runLightweightMutation(
      (draft) => {
        const target = draft.nodes.find((node) => node.id === nodeId);
        if (!target?.workStartedAt) {
          return;
        }
        const elapsedMs = Math.max(0, Date.now() - new Date(target.workStartedAt).getTime());
        target.realTime = Number(target.realTime || 0) + elapsedMs / 1000 / 60 / 60;
        target.workStartedAt = null;
      },
      () =>
        stopWorkMutation(nodeId, (current) =>
          replaceNode(current, nodeId, (node) => {
            if (!node.workStartedAt) {
              return node;
            }
            const elapsedMs = Math.max(0, Date.now() - new Date(node.workStartedAt).getTime());
            return {
              ...node,
              realTime: Number(node.realTime || 0) + elapsedMs / 1000 / 60 / 60,
              workStartedAt: null,
            };
          }),
        ),
    );
    setContextMenu(null);
  }

  function toggleFocusedWorkPlayback() {
    if (!focusNode) {
      return;
    }
    if (focusNode.workStartedAt) {
      stopWork(focusNode.id);
      return;
    }
    startWork(focusNode.id);
  }

  function stopFocusedSession() {
    if (focusNode?.workStartedAt) {
      stopWork(focusNode.id);
    }
    setFocusedWorkId(null);
  }

  function forkNode(nodeId) {
    startStructuralTransition("fork", (draft) => {
      const target = draft.nodes.find((node) => node.id === nodeId);
      if (!target) {
        return;
      }
      const id = createNodeId(`${target.title} fork`, draft.nodes);
      draft.nodes.push({
        ...target,
        id,
        title: `${target.title} fork`,
        workStartedAt: null,
      });
      const parentEdges = draft.dependencies
        .filter((edge) => edge.childId === nodeId)
        .map((edge) => ({ parentId: edge.parentId, childId: id }));
      const childEdges = draft.dependencies
        .filter((edge) => edge.parentId === nodeId)
        .map((edge) => ({ parentId: id, childId: edge.childId }));
      draft.dependencies.push(...parentEdges, ...childEdges);
    }, () => forkActivity(nodeId));
    setContextMenu(null);
  }

  function deleteEdge(context) {
    startStructuralTransition("delete-edge", (draft) => {
      if (context.kind === "dependency-edge") {
        draft.dependencies = draft.dependencies.filter(
          (edge) =>
            !(
              edge.parentId === context.parentId &&
              edge.childId === context.childId
            ),
        );
        return;
      }
    }, () => deleteDependency(context.parentId, context.childId));
    setContextMenu(null);
  }

  function deleteNode(nodeId, deleteTree = false) {
    startStructuralTransition("delete", (draft) => {
      const { parentMap, childMap } = buildIndexes(draft.nodes, draft.dependencies);
      const removeIds = new Set([nodeId]);
      if (deleteTree) {
        collectDescendants(nodeId, childMap).forEach((id) => removeIds.add(id));
      }

      if (!deleteTree) {
        const parents = parentMap.get(nodeId) || [];
        const children = childMap.get(nodeId) || [];
        children.forEach((childId) => {
          parents.forEach((parentId) => {
            const exists = draft.dependencies.some(
              (edge) => edge.parentId === parentId && edge.childId === childId,
            );
            if (!exists) {
              draft.dependencies.push({ parentId, childId });
            }
          });
        });
      }

      draft.nodes = draft.nodes.filter((node) => !removeIds.has(node.id));
      draft.dependencies = draft.dependencies.filter(
        (edge) => !removeIds.has(edge.parentId) && !removeIds.has(edge.childId),
      );
      draft.schedules = draft.schedules.filter(
        (rule) => !removeIds.has(rule.earlierId) && !removeIds.has(rule.laterId),
      );
    }, () => deleteActivity(nodeId, deleteTree));
    setContextMenu(null);
  }

  function openDependencySheet(nodeId) {
    const node = nodesById.get(nodeId);
    if (!node) {
      return;
    }
    const blocked = collectDescendants(nodeId, layout.childMap);
    const selectedParents = new Set((layout.parentMap.get(nodeId) || []).map(String));
    openSheet(
      { type: "dependencies", nodeId },
      {
        ...defaultForm(node),
        dependencyQuery: "",
        parentIds: graph.nodes
          .filter((entry) => entry.id !== nodeId && !blocked.has(entry.id))
          .map((entry) => ({
            id: entry.id,
            title: entry.title,
            checked: selectedParents.has(entry.id),
          })),
      },
    );
  }

  function submitDependencySheet(event) {
    event.preventDefault();
    const nodeId = sheet?.nodeId;
    if (!nodeId) {
      return;
    }
    const parentIds = (form.parentIds || [])
      .filter((entry) => entry.checked)
      .map((entry) => entry.id);
    try {
      startStructuralTransition("edit-dependencies", (draft) => {
        const nextDependencies = draft.dependencies.filter((edge) => edge.childId !== nodeId);
        parentIds.forEach((parentId) => {
          const nextEdge = { parentId, childId: nodeId };
          if (wouldCreateCycle(draft.nodes, nextDependencies, nextEdge)) {
            throw new Error("That dependency would create a cycle.");
          }
          nextDependencies.push(nextEdge);
        });
        draft.dependencies = nextDependencies;
        const nextLayout = computeGraphLayout(draft);
        draft.schedules = draft.schedules.filter((rule) => {
          const leftBase = nextLayout.baseLevels.get(rule.earlierId);
          const rightBase = nextLayout.baseLevels.get(rule.laterId);
          return leftBase === rightBase;
        });
      }, () => replaceDependencies(nodeId, parentIds));
      closeSheet();
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  function openAddDependencyActivity(nodeId) {
    const ancestorRoots = graph.nodes
      .filter((node) => (layout.parentMap.get(node.id) || []).length === 0)
      .map((node) => node.id);
    const selectedRoots = [...collectAncestors(nodeId, layout.parentMap)].filter(
      (candidateId) => (layout.parentMap.get(candidateId) || []).length === 0,
    );
    const parentSet = new Set(selectedRoots.length ? selectedRoots : ancestorRoots);
    openSheet(
      { type: "add-dependency-activity", nodeId },
      {
        ...defaultForm(null),
        dependencyQuery: "",
        parentIds: graph.nodes
          .map((node) => ({
            id: node.id,
            title: node.title,
            checked: parentSet.has(node.id),
          })),
      },
    );
  }

  function openCreateChildSheet(parentId) {
    const parent = nodesById.get(parentId);
    if (!parent) {
      return;
    }
    openSheet(
      { type: "create-child", parentId },
      {
        ...defaultForm(null),
        notes: `Child of ${parent.title}.`,
      },
    );
  }

  function submitAddDependencyActivity(event) {
    event.preventDefault();
    const payload = {
      title: form.title.trim(),
      notes: form.notes.trim(),
      startDate: form.startDate || "",
      bestBefore: form.bestBefore || "",
      expectedTime: toNumberOrNull(form.expectedTime),
      realTime: toNumberOrNull(form.realTime) || 0,
      expectedEffort: toNumberOrNull(form.expectedEffort),
      realEffort: toNumberOrNull(form.realEffort),
    };
    if (!payload.title) {
      setError("Activity title is required.");
      return;
    }
    try {
      startStructuralTransition("create", (draft) => {
        const id = createNodeId(payload.title, draft.nodes);
        draft.nodes.push({
          id,
          ...payload,
          workStartedAt: null,
        });
        (form.parentIds || [])
          .filter((entry) => entry.checked)
          .forEach((entry) => {
            const nextEdge = { parentId: entry.id, childId: id };
            if (wouldCreateCycle(draft.nodes, draft.dependencies, nextEdge)) {
              throw new Error("That dependency would create a cycle.");
            }
            draft.dependencies.push(nextEdge);
          });
      }, () =>
        createActivity({
          ...payload,
          parentIds: (form.parentIds || [])
            .filter((entry) => entry.checked)
            .map((entry) => entry.id),
        }));
      closeSheet();
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  const hasActivitySelection = Boolean(selected && selectedDetails && selected.kind !== "note");
  const showActivityInspector = hasActivitySelection && leftPanel !== "note-editor" && !focusNodeId;
  const focusProjectedNode = focusNodeId ? displayProjected.byId[focusNodeId] || null : null;
  const isZoomAdjusted = Math.abs(zoom - defaultViewport.zoom) > 0.001;
  const isPanAdjusted =
    Math.abs(panOffset.x - defaultViewport.panOffset.x) > 0.5 ||
    Math.abs(panOffset.y - defaultViewport.panOffset.y) > 0.5;

  return (
    <main
      className="app-shell"
      onClick={() => {
        setContextMenu(null);
        setIsImportMenuExpanded(false);
        setIsModeMenuExpanded(false);
      }}
    >
      <header className="topbar">
        <div className="brand">
          <p className="eyebrow">MOVE37</p>
        </div>
        <div className="topbar-actions" onClick={(event) => event.stopPropagation()}>
          {leftPanel === "note-editor" ? (
            <>
              <button
                type="submit"
                form="notes-editor-form"
                className="dock-button"
                aria-label="Save note"
                title="Save note"
              >
                <SaveIcon />
              </button>
            </>
          ) : null}
          {selected && selected.kind !== "note" && !focusNodeId ? (
            <button
              type="button"
              className="dock-button focus-play"
              onClick={() => startWork(selected.id)}
              aria-label="Start activity"
              title="Start activity"
            >
              <PlayIcon />
            </button>
          ) : null}
          {focusNode ? (
            <button
              type="button"
              className={`dock-button ${focusNode.workStartedAt ? "focus-pause" : "focus-play"}`}
              onClick={toggleFocusedWorkPlayback}
              aria-label={focusNode.workStartedAt ? "Pause activity" : "Resume activity"}
              title={focusNode.workStartedAt ? "Pause activity" : "Resume activity"}
            >
              {focusNode.workStartedAt ? <PauseIcon /> : <PlayIcon />}
            </button>
          ) : null}
          {focusNode ? (
            <button
              type="button"
              className="dock-button focus-stop"
              onClick={stopFocusedSession}
              aria-label="Stop focus"
              title="Stop focus"
            >
              <StopIcon />
            </button>
          ) : null}
          {!displayedSurfaceMode && hasActivitySelection ? (
            <button
              type="button"
              className="dock-button"
              onClick={() => setSelectedId(null)}
              aria-label="Close activity details"
              title="Close activity details"
            >
              <ExitIcon />
            </button>
          ) : null}
          <div
            ref={dockRef}
            className={`control-dock topbar-control-dock ${isImportMenuExpanded ? "expanded" : ""}`}
            aria-label="View controls"
          >
            <div className={`uri-search ${isSearchExpanded ? "expanded" : "collapsed"}`}>
              <button
                type="button"
                className="dock-button search-trigger"
                onClick={handleSearchTrigger}
                aria-label="Search activity"
                title="Search activity"
              >
                <SearchIcon />
              </button>
              <div className="uri-search-panel">
                {isSearchExpanded ? (
                  <>
                    <input
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void runSearch();
                        }
                      }}
                      placeholder={SEARCH_PLACEHOLDER}
                      aria-label="Search activity"
                    />
                    <button
                      type="button"
                      className="uri-search-close"
                      onClick={closeSearchCommand}
                      aria-label="Close search"
                      title="Close search"
                    >
                      <ExitIcon />
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            <div className={`dock-mode ${isModeMenuExpanded ? "expanded" : ""}`}>
              <button
                type="button"
                className={`dock-button ${isModeMenuExpanded || displayedSurfaceMode ? "active" : ""}`}
                onClick={() => {
                  setIsImportMenuExpanded(false);
                  setIsModeMenuExpanded((value) => !value);
                }}
                aria-label="Choose view mode"
                title="Choose view mode"
              >
                {viewMode === "linear" ? <LinearIcon /> : viewMode === "2d" ? <RingsIcon /> : <GlobeIcon />}
              </button>
              <div className="dock-mode-actions" aria-hidden={!isModeMenuExpanded}>
                <button
                  type="button"
                  className={`dock-subaction icon-only ${viewMode === "2d" ? "active" : ""}`}
                  onClick={() => switchViewMode("2d")}
                  title="2D view"
                >
                  <RingsIcon />
                </button>
                <button
                  type="button"
                  className={`dock-subaction icon-only ${viewMode === "3d" ? "active" : ""}`}
                  onClick={() => switchViewMode("3d")}
                  title="3D view"
                >
                  <GlobeIcon />
                </button>
                <button
                  type="button"
                  className={`dock-subaction icon-only ${viewMode === "linear" ? "active" : ""}`}
                  onClick={() => switchViewMode("linear")}
                  title="Linear view"
                >
                  <LinearIcon />
                </button>
              </div>
            </div>
            <button
              type="button"
              className="dock-button"
              onClick={expandAllLevels}
              aria-label="Expand all levels"
              title="Expand all levels"
              disabled={!canExpandLevels}
            >
              <ExpandLevelsIcon />
            </button>
            <button
              type="button"
              className="dock-button"
              onClick={collapseAllLevels}
              aria-label="Collapse all levels"
              title="Collapse all levels"
              disabled={!canCollapseLevels}
            >
              <CollapseLevelsIcon />
            </button>
            <button
              type="button"
              className={`dock-button ${syncModalOpen ? "active" : ""}`}
              onClick={() => syncModalOpen ? closeSyncModal() : openSyncModal()}
              aria-label="Open sync and replan controls"
              title="Sync / Replan"
            >
              <CalendarIcon />
            </button>
            <button
              type="button"
              className={`dock-button ${settingsModalOpen ? "active" : ""}`}
              onClick={() => settingsModalOpen ? closeSettingsModal() : openSettingsModal()}
              aria-label="Open settings"
              title="Settings"
            >
              <SettingsIcon />
            </button>
            <button
              type="button"
              className={`dock-button ${leftPanel === "note-editor" ? "active" : ""}`}
              onClick={() => {
                if (leftPanel === "note-editor") {
                  closeLeftPanel();
                  return;
                }
                openDraftNoteWorkspace();
              }}
              aria-label="Open notes workspace"
              title="Notes"
            >
              <NotesIcon />
            </button>
            <div className={`dock-import ${isImportMenuExpanded ? "expanded" : ""}`}>
              <button
                type="button"
                className={`dock-button ${isImportMenuExpanded || importPopoverMode === "url" ? "active" : ""}`}
                onClick={toggleImportMenu}
                aria-label="Open note import controls"
                title="Import notes"
              >
                <ImportIcon />
              </button>
              <div className="dock-import-actions" aria-hidden={!isImportMenuExpanded}>
                <button
                  type="button"
                  className="dock-subaction icon-only"
                  onClick={triggerBrowseImport}
                  title="Browse .txt files"
                  aria-label="Browse .txt files"
                >
                  <ImportIcon />
                </button>
                <button
                  type="button"
                  className="dock-subaction icon-only"
                  onClick={openUrlImportPopover}
                  title="Import from URL"
                  aria-label="Import from URL"
                >
                  <LinkIcon />
                </button>
              </div>
              <input
                ref={browseInputRef}
                type="file"
                accept=".txt,text/plain"
                multiple
                className="visually-hidden"
                onChange={handleBrowseInputChange}
              />
            </div>
            {isZoomAdjusted ? (
              <button
                type="button"
                className="dock-button"
                onClick={() => {
                  animateViewport({ zoom: defaultViewport.zoom });
                }}
                aria-label="Reset zoom"
                title="Reset zoom"
              >
                <ZoomResetIcon />
              </button>
            ) : null}
            {isPanAdjusted ? (
              <button
                type="button"
                className="dock-button"
                onClick={recenterView}
                aria-label="Recenter view"
                title="Recenter view"
              >
                <CenterIcon />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <p className={`status status-ticker ${messageVisible ? "visible" : "hidden"}`}>
        {TOPBAR_MESSAGES[messageIndex]}
      </p>

      {graphLoading && !canonicalGraph && <div className="banner">Loading graph from api...</div>}
      {error && <div className="banner">{error}</div>}

      {leftPanel === "note-editor" && (
        <aside className="notes-overlay" onClick={(event) => event.stopPropagation()}>
          <form id="notes-editor-form" className="notes-overlay-form" onSubmit={submitNote}>
            <textarea
              className="notes-editor"
              autoFocus
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder={`Title on the first line\n\nWrite the rest of the note below.`}
            />
          </form>
        </aside>
      )}

      {importPopoverMode === "url" && (
        <aside className="notes-overlay side-sheet-overlay" onClick={(event) => event.stopPropagation()}>
          <form
            className="notes-overlay-form side-sheet-form url-import-sidepanel"
            onSubmit={submitUrlImport}
          >
            <div className="url-import-toolbar">
              <button
                type="submit"
                className="overlay-icon-button"
                aria-label="Import note from URL"
                title="Import note from URL"
                disabled={urlImportLoading}
              >
                <ImportIcon />
              </button>
            </div>
            <label className="url-import-field">
              <span>URL</span>
              <input
                ref={urlInputRef}
                type="url"
                value={urlImportValue}
                onChange={(event) => setUrlImportValue(event.target.value)}
                placeholder="https://example.com/note.txt"
              />
            </label>
          </form>
        </aside>
      )}

      {syncModalOpen && (
        <aside className="notes-overlay side-sheet-overlay" onPointerDown={(event) => event.stopPropagation()}>
          <div className="notes-overlay-form side-sheet-form sync-sidepanel">
            <h2>Sync / Replan</h2>
            <p>
              Run the scheduling engine against the current graph and push the final result to calendars only when
              you choose <strong>Apply</strong>.
            </p>
            <form className="sheet-form" onSubmit={submitSyncPlan}>
              <div className="sync-mode-toggle" role="tablist" aria-label="Scheduling run mode">
                {Object.entries(SYNC_MODE_COPY).map(([mode, copy]) => (
                  <button
                    key={mode}
                    type="button"
                    className={`ghost-button sync-mode-button ${syncRunMode === mode ? "active" : ""}`}
                    onClick={() => {
                      setSyncRunMode(mode);
                      setSyncResult(null);
                      setSyncError("");
                      clearSchedulingRun();
                    }}
                  >
                    {copy.title}
                  </button>
                ))}
              </div>
              <p className="small">{SYNC_MODE_COPY[syncRunMode].description}</p>
              {syncError ? <div className="sync-feedback error">{syncError}</div> : null}
              {syncPending ? <div className="sync-feedback">Running scheduling engine…</div> : null}
              {syncResult ? (
                <div className="sync-results">
                  <p className="notes-overlay-status">
                    {syncResult.runMetadata.applied ? "Applied" : "Preview"} · {syncResult.runMetadata.engine}
                  </p>
                  {syncResult.status === "infeasible" ? (
                    <div className="sync-feedback error">
                      This schedule is infeasible with the current constraints. Review the conflicts below before applying.
                    </div>
                  ) : null}
                  <div className="metric-grid">
                    <div className="metric-card">
                      <span>Moved tasks</span>
                      <strong>{syncResult.summary.movedTasks}</strong>
                    </div>
                    <div className="metric-card">
                      <span>Conflicts</span>
                      <strong>{syncResult.summary.conflicts}</strong>
                    </div>
                    <div className="metric-card">
                      <span>Unscheduled</span>
                      <strong>{syncResult.summary.unscheduled}</strong>
                    </div>
                    <div className="metric-card">
                      <span>Projects affected</span>
                      <strong>{syncResult.summary.projectsAffected}</strong>
                    </div>
                  </div>

                  <section className="sync-section">
                    <div className="sync-section-header">
                      <h3>Task changes</h3>
                      <span>{syncResult.changes.length}</span>
                    </div>
                    {syncResult.changes.length ? (
                      <div className="sync-list">
                        {syncResult.changes.map((change) => (
                          <article key={change.activityId} className="sync-card">
                            <div className="sync-card-header">
                              <strong>{change.title}</strong>
                              <span>{formatDeltaMinutes(change.deltaMinutes)}</span>
                            </div>
                            <p className="small">
                              {formatScheduleTimestamp(change.previousStartsAt)} → {formatScheduleTimestamp(change.proposedStartsAt)}
                            </p>
                            {change.branchRootId ? <p className="small">Branch root: {change.branchRootId}</p> : null}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="small">No task moves were proposed.</p>
                    )}
                  </section>

                  <section className="sync-section">
                    <div className="sync-section-header">
                      <h3>Conflicts</h3>
                      <span>{syncResult.conflicts.length}</span>
                    </div>
                    {syncResult.conflicts.length ? (
                      <div className="sync-list">
                        {syncResult.conflicts.map((conflict) => (
                          <article key={`${conflict.activityId}-${conflict.code}`} className="sync-card">
                            <div className="sync-card-header">
                              <strong>{conflict.title}</strong>
                              <span>{formatSchedulingCode(conflict.code)}</span>
                            </div>
                            <p className="small">{conflict.message}</p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="small">No hard conflicts detected in this run.</p>
                    )}
                  </section>

                  <section className="sync-section">
                    <div className="sync-section-header">
                      <h3>Unscheduled</h3>
                      <span>{syncResult.unscheduled.length}</span>
                    </div>
                    {syncResult.unscheduled.length ? (
                      <div className="sync-list">
                        {syncResult.unscheduled.map((item) => (
                          <article key={`${item.activityId}-${item.code}`} className="sync-card">
                            <div className="sync-card-header">
                              <strong>{item.title}</strong>
                              <span>{formatSchedulingCode(item.code)}</span>
                            </div>
                            <p className="small">{item.message}</p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="small">Every task with enough data received a placement.</p>
                    )}
                  </section>

                  <section className="sync-section">
                    <div className="sync-section-header">
                      <h3>Project impact</h3>
                      <span>{syncResult.projectImpacts.length}</span>
                    </div>
                    {syncResult.projectImpacts.length ? (
                      <div className="sync-list">
                        {syncResult.projectImpacts.map((impact) => (
                          <article key={impact.branchRootId} className="sync-card">
                            <div className="sync-card-header">
                              <strong>{impact.projectTitle}</strong>
                              <span>{formatDeltaMinutes(impact.deltaMinutes)}</span>
                            </div>
                            <p className="small">
                              {formatScheduleTimestamp(impact.previousCompletionAt)} → {formatScheduleTimestamp(impact.proposedCompletionAt)}
                            </p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="small">No project completion shifts were detected.</p>
                    )}
                  </section>
                </div>
              ) : null}
              <div className="sheet-actions">
                <button type="submit" className="ghost-button" disabled={syncPending}>
                  {SYNC_MODE_COPY[syncRunMode].actionLabel}
                </button>
              </div>
            </form>
          </div>
        </aside>
      )}

      {settingsModalOpen && (
        <aside className="notes-overlay side-sheet-overlay" onPointerDown={(event) => event.stopPropagation()}>
          <div className="notes-overlay-form side-sheet-form settings-sidepanel">
            <h2>Settings</h2>
            <p>Manage integrations and choose which calendar Move37 writes to when you apply a plan.</p>
            <section className="settings-section">
              <div className="sync-section-header">
                <h3>Apple Calendar</h3>
                <span>{appleIntegrationStatus?.connected ? "Connected" : "Not connected"}</span>
              </div>
              {settingsError ? <div className="sync-feedback error">{settingsError}</div> : null}
              {appleIntegrationLoading ? <div className="sync-feedback">Loading Apple Calendar status…</div> : null}
              {!appleIntegrationStatus?.connected ? (
                <form className="sheet-form" onSubmit={submitAppleConnection}>
                  <label>
                    Apple ID email
                    <input
                      type="email"
                      value={appleSettingsForm.username}
                      onChange={(event) =>
                        setAppleSettingsForm((current) => ({ ...current, username: event.target.value }))
                      }
                      placeholder="name@icloud.com"
                    />
                  </label>
                  <label>
                    App-specific password
                    <input
                      type="password"
                      value={appleSettingsForm.password}
                      onChange={(event) =>
                        setAppleSettingsForm((current) => ({ ...current, password: event.target.value }))
                      }
                      placeholder="xxxx-xxxx-xxxx-xxxx"
                    />
                  </label>
                  <label>
                    CalDAV base URL
                    <input
                      type="url"
                      value={appleSettingsForm.baseUrl}
                      onChange={(event) =>
                        setAppleSettingsForm((current) => ({ ...current, baseUrl: event.target.value }))
                      }
                      placeholder={DEFAULT_APPLE_BASE_URL}
                    />
                  </label>
                  <p className="small">
                    For iCloud, use an app-specific password from your Apple account security settings.
                  </p>
                  <div className="sheet-actions">
                    <button type="submit" className="ghost-button icon-only" title="Connect Apple Calendar" aria-label="Connect Apple Calendar" disabled={appleIntegrationMutating}>
                      <LinkIcon />
                    </button>
                  </div>
                </form>
              ) : (
                <div className="settings-stack">
                  <div className="metric-grid">
                    <div className="metric-card">
                      <span>Apple ID</span>
                      <strong>{appleIntegrationStatus.ownerEmail || "Unknown"}</strong>
                    </div>
                    <div className="metric-card">
                      <span>Base URL</span>
                      <strong>{appleIntegrationStatus.baseUrl || DEFAULT_APPLE_BASE_URL}</strong>
                    </div>
                  </div>
                  <form className="sheet-form" onSubmit={submitApplePreferences}>
                    <label>
                      Writable calendar
                      <select
                        value={appleSettingsForm.writableCalendarId}
                        onChange={(event) =>
                          setAppleSettingsForm((current) => ({
                            ...current,
                            writableCalendarId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select a calendar</option>
                        {(appleIntegrationStatus.calendars || []).map((calendar) => (
                          <option key={calendar.id} value={calendar.id}>
                            {calendar.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="settings-calendar-list">
                      {(appleIntegrationStatus.calendars || []).map((calendar) => (
                        <div key={calendar.id} className="sync-card">
                          <div className="sync-card-header">
                            <strong>{calendar.name}</strong>
                            <span>
                              {calendar.id === appleIntegrationStatus.writableCalendarId ? "Target" : "Available"}
                            </span>
                          </div>
                          <p className="small">{calendar.id}</p>
                        </div>
                      ))}
                    </div>
                    <div className="sheet-actions split">
                      <button
                        type="button"
                        className="ghost-button icon-only"
                        onClick={handleAppleDisconnect}
                        disabled={appleIntegrationMutating}
                        title="Disconnect Apple Calendar"
                        aria-label="Disconnect Apple Calendar"
                      >
                        <ExitIcon />
                      </button>
                      <button type="submit" className="ghost-button" disabled={appleIntegrationMutating}>
                        Save target
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </section>
          </div>
        </aside>
      )}

      <section
        ref={shellRef}
        className={`sphere-area view-${displayViewMode} ${isDragging ? "dragging" : ""} ${searchState} ${leftPanel ? "panel-open" : ""} ${displayedSurfaceMode ? "surface-open" : ""} ${focusNodeId ? "work-focus" : ""}`}
        aria-label="Activity dependency network"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDragging}
        onPointerLeave={stopDragging}
        onWheel={onWheel}
        onContextMenu={openBackgroundContextMenu}
      >
        <svg viewBox={`0 0 ${size.width} ${size.height}`} role="img">
          <defs>
            <radialGradient id="sphere-halo" cx="50%" cy="50%">
              <stop offset="58%" stopColor="#86cbff" stopOpacity="0" />
              <stop offset="74%" stopColor="#7cc9ff" stopOpacity="0.2" />
              <stop offset="84%" stopColor="#5ca6f5" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#2a4f8f" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="sphere-halo-success" cx="50%" cy="50%">
              <stop offset="58%" stopColor="#3dff8f" stopOpacity="0" />
              <stop offset="74%" stopColor="#00ff66" stopOpacity="0.34" />
              <stop offset="84%" stopColor="#00d958" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#0a5a2d" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="sphere-halo-failure" cx="50%" cy="50%">
              <stop offset="58%" stopColor="#ff4d6d" stopOpacity="0" />
              <stop offset="74%" stopColor="#ff1e3c" stopOpacity="0.34" />
              <stop offset="84%" stopColor="#d80027" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#5f0b1a" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="sphere-vignette" cx="50%" cy="50%">
              <stop offset="0%" stopColor="#00000000" />
              <stop offset="62%" stopColor="#02061100" />
              <stop offset="82%" stopColor="#01040c96" />
              <stop offset="100%" stopColor="#000209d6" />
            </radialGradient>
            <marker
              id="schedule-arrow"
              viewBox="0 0 12 12"
              refX="10.2"
              refY="6"
              markerWidth="7"
              markerHeight="7"
              markerUnits="strokeWidth"
              orient="auto"
            >
              <path d="M1.6 1.2L10.2 6L1.6 10.8L4.1 6z" fill="context-stroke" />
            </marker>
            {showDynamicGraph
              ? visibleDependencyEdges.map((edge) => {
                  const from = displayProjected.byId[edge.parentId];
                  const to = displayProjected.byId[edge.childId];
                  if (!from || !to) {
                    return null;
                  }
                  const innerPalette = getLevelPalette(from.level ?? 0, renderMaxLevel, levelSeed);
                  const outerPalette = getLevelPalette(to.level ?? 0, renderMaxLevel, levelSeed);
                  return (
                    <linearGradient
                      key={`gradient-${edge.id}`}
                      id={`edge-gradient-${edge.id}`}
                      gradientUnits="userSpaceOnUse"
                      x1={to.x}
                      y1={to.y}
                      x2={from.x}
                      y2={from.y}
                    >
                      <stop offset="0%" stopColor={outerPalette.nodeFill} stopOpacity="0.88" />
                      <stop offset="100%" stopColor={innerPalette.nodeFill} stopOpacity="0.68" />
                    </linearGradient>
                  );
                })
              : null}
          </defs>

          <rect width={size.width} height={size.height} fill="url(#sphere-vignette)" data-background="true" />
          <ellipse
            cx={sphereProjection.centerX}
            cy={sphereProjection.centerY}
            rx={Math.min(size.width, size.height) * 0.44 * zoom}
            ry={Math.min(size.width, size.height) * 0.44 * zoom}
            className="sphere-glow"
            fill="url(#sphere-halo)"
            style={{ opacity: sphereShellWeight }}
          />
          <ellipse
            cx={sphereProjection.centerX}
            cy={sphereProjection.centerY}
            rx={Math.min(size.width, size.height) * 0.44 * zoom}
            ry={Math.min(size.width, size.height) * 0.44 * zoom}
            className="sphere-glow-success"
            fill="url(#sphere-halo-success)"
            style={{ opacity: sphereShellWeight }}
          />
          <ellipse
            cx={sphereProjection.centerX}
            cy={sphereProjection.centerY}
            rx={Math.min(size.width, size.height) * 0.44 * zoom}
            ry={Math.min(size.width, size.height) * 0.44 * zoom}
            className="sphere-glow-failure"
            fill="url(#sphere-halo-failure)"
            style={{ opacity: sphereShellWeight }}
          />
          {linearGuideWeight > 0 ? (
            <g className="linear-guides-backdrop" aria-hidden="true" style={{ opacity: linearGuideWeight }}>
              {linearColumns.map(({ level, x }) => {
                const shell = visibleLevelShells.find((entry) => entry.level === level);
                if (!shell) {
                  return null;
                }
                return (
                  <g key={`linear-guide-${level}`}>
                    <line
                      x1={x}
                      y1={projectedLinear.centerY - projectedLinear.radius * 0.95}
                      x2={x}
                      y2={projectedLinear.centerY + projectedLinear.radius * 0.95}
                      className="linear-guide-line"
                      stroke={shell.glow}
                      style={{
                        filter: `drop-shadow(0 0 ${7 + level * 1.6}px ${shell.glow})`,
                      }}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}
          <g className="graph-viewport">
            <g
              className={`sphere-shells ${focusNodeId ? "blurred" : ""}`}
              aria-hidden="true"
              style={{ opacity: sphereShellWeight }}
            >
              {[...visibleLevelShells].reverse().map((shell) => {
                const shellRadius = sphereProjection.radius * shell.ratio;
                return (
                  <ellipse
                    key={shell.level}
                    cx={sphereProjection.centerX}
                    cy={sphereProjection.centerY}
                    rx={shellRadius}
                    ry={shellRadius}
                    className={["sphere-shell", shell.transitionState ? `shell-${shell.transitionState}` : ""]
                      .filter(Boolean)
                      .join(" ")}
                    fill={shell.fill}
                    style={{
                      filter: `drop-shadow(0 0 ${6 + shell.level * 1.8}px ${shell.glow})`,
                    }}
                  />
                );
              })}
            </g>

            {showDynamicGraph ? (
              <g className={`graph-layer ${nodesVisible ? "visible" : "hidden"} ${focusNodeId ? "blurred" : ""}`}>
                {visibleDependencyEdges.map((edge) => {
                  const from = displayProjected.byId[edge.parentId];
                  const to = displayProjected.byId[edge.childId];
                  if (!from || !to) {
                    return null;
                  }
                  const ambientEdge =
                    !selectedId && !isTransitioning && ambientFlow.dependencyEdgeIds.has(edge.id);
                  if (!selectedId && !isTransitioning && !ambientEdge) {
                    return null;
                  }
                  const edgeStyle = getLevelVisualStyle(
                    Math.max(from.level ?? 0, to.level ?? 0),
                    renderMaxLevel,
                    levelSeed,
                  );
                  const active =
                    selectedId &&
                    highlightedDependencyIds.has(edge.parentId) &&
                    highlightedDependencyIds.has(edge.childId);
                  const dimmed = selectedId && !active;
                  const fromRadius = getNodeRenderRadius(from);
                  const toRadius = getNodeRenderRadius(to);
                  const fromWidth = Math.max(1.5, fromRadius * (active ? 0.52 : 0.44));
                  const toWidth = Math.max(1.8, toRadius * (active ? 0.56 : 0.48));
                  const midWidth = Math.max(
                    0.72,
                    Math.min(fromWidth, toWidth) * (active ? 0.26 : 0.18),
                  );
                  return (
                    <g key={edge.id}>
                      <line
                        className="edge-hit-area"
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        onContextMenu={!isTransitioning ? (event) =>
                          openDependencyEdgeContextMenu(event, edge.parentId, edge.childId)
                        : undefined}
                      />
                      <path
                        className={[
                          "edge-ribbon",
                          edge.transitionState ? `edge-${edge.transitionState}` : "",
                          ambientEdge ? "ambient-tree" : "",
                          active ? "active" : "",
                          dimmed ? "dimmed" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={edgeStyle}
                        d={buildPinchedEdgePath(
                          from,
                          to,
                          fromWidth,
                          toWidth,
                          midWidth,
                        )}
                        fill={`url(#edge-gradient-${edge.id})`}
                        onContextMenu={!isTransitioning ? (event) =>
                          openDependencyEdgeContextMenu(event, edge.parentId, edge.childId)
                        : undefined}
                      />
                    </g>
                  );
                })}

                {displayViewMode !== "3d" ? visibleScheduleEdges.map((edge) => {
                  const from = displayProjected.byId[edge.earlierId];
                  const to = displayProjected.byId[edge.laterId];
                  if (!from || !to || from.level !== to.level) {
                    return null;
                  }
                  const ambientSchedule =
                    !selectedId && !isTransitioning && ambientFlow.scheduleEdgeIds.has(edge.id);
                  if (!selectedId && !isTransitioning && !ambientSchedule) {
                    return null;
                  }
                  const active =
                    selectedId &&
                    highlightedDependencyIds.has(edge.earlierId) &&
                    highlightedDependencyIds.has(edge.laterId);
                  const dimmed = selectedId && !active;
                  const scheduleStyle = getLevelVisualStyle(
                    Math.max(from.level ?? 0, to.level ?? 0),
                    renderMaxLevel,
                    levelSeed,
                  );
                  return (
                    <g key={edge.id}>
                      <path
                        className="edge-hit-area"
                        d={buildClockwiseArcPath(from, to, {
                          centerX: sphereProjection.centerX,
                          centerY: sphereProjection.centerY,
                          radius: sphereProjection.radius,
                          viewMode: displayViewMode,
                          rotationX: effectiveRotationX,
                          rotationY: effectiveRotationY,
                        })}
                        onContextMenu={!isTransitioning ? (event) =>
                          openScheduleEdgeContextMenu(event, edge.earlierId, edge.laterId)
                        : undefined}
                      />
                      <path
                        className={[
                          "edge-line",
                          "schedule",
                          edge.transitionState ? `edge-${edge.transitionState}` : "",
                          ambientSchedule ? "ambient-tree" : "",
                          active ? "active" : "",
                          dimmed ? "dimmed" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={scheduleStyle}
                        d={buildClockwiseArcPath(from, to, {
                          centerX: sphereProjection.centerX,
                          centerY: sphereProjection.centerY,
                          radius: sphereProjection.radius,
                          viewMode: displayViewMode,
                          rotationX: effectiveRotationX,
                          rotationY: effectiveRotationY,
                        })}
                        fill="none"
                        markerEnd="url(#schedule-arrow)"
                        onContextMenu={!isTransitioning ? (event) =>
                          openScheduleEdgeContextMenu(event, edge.earlierId, edge.laterId)
                        : undefined}
                      />
                    </g>
                  );
                }) : null}

                {displayNodes.map((node) => {
                  const selectedNode = node.id === selectedId;
                  const relatedNode = !selectedNode && highlightedDependencyIds.has(node.id);
                  const dimmedNode = selectedId && !selectedNode && !relatedNode;
                  const radius = getNodeRenderRadius(node);
                  const visualStyle = getLevelVisualStyle(node.level, renderMaxLevel, levelSeed);
                  const labelOpacity = Math.max(0.3, Math.min(0.95, node.depth - 0.08));
                  const haloClass = [
                    "node-halo",
                    node.transitionState ? `node-${node.transitionState}` : "",
                    selectedNode ? "active" : "",
                    relatedNode ? "related" : "",
                    node.scheduled ? "scheduled" : "",
                    node.kind === "note" ? "note" : "",
                    dimmedNode ? "dimmed" : "",
                    focusNodeId === node.id ? "focus-source" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const coreClass = [
                    "node-core",
                    node.transitionState ? `node-${node.transitionState}` : "",
                    selectedNode ? "active" : "",
                    relatedNode ? "related" : "",
                    node.scheduled ? "scheduled" : "",
                    workingId === node.id ? "working" : "",
                    node.kind === "note" ? "note" : "",
                    dimmedNode ? "dimmed" : "",
                    focusNodeId === node.id ? "focus-source" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const labelClass = [
                    "node-label",
                    node.transitionState ? `node-${node.transitionState}` : "",
                    node.kind === "note" ? "note" : "",
                    dimmedNode ? "dimmed" : "",
                    focusNodeId === node.id ? "focus-source" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <g
                      key={node.id}
                      className={node.transitionState === "moving" ? "node-moving-group" : ""}
                      style={{
                        transform: `translate(${node.x}px, ${node.y}px)`,
                        ...visualStyle,
                      }}
                    >
                      <circle
                        r={radius + 6}
                        className={haloClass}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          toggleSelectedNode(node.id);
                        }}
                        onContextMenu={(event) => openContextMenu(event, node.id)}
                      />
                      <circle
                        r={radius + 1.5}
                        className="node-soft-edge"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          toggleSelectedNode(node.id);
                        }}
                        onContextMenu={(event) => openContextMenu(event, node.id)}
                      />
                      <circle
                        r={radius}
                        className={coreClass}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          toggleSelectedNode(node.id);
                        }}
                        onContextMenu={(event) => openContextMenu(event, node.id)}
                      />
                      <text
                        x={radius + 7}
                        y={-radius - 2}
                        className={labelClass}
                        opacity={labelOpacity}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          toggleSelectedNode(node.id);
                        }}
                        onContextMenu={(event) => openContextMenu(event, node.id)}
                      >
                        {node.title}
                      </text>
                    </g>
                  );
                })}
              </g>
            ) : null}
            {showDynamicGraph && focusProjectedNode ? (
              <g
                className="focus-node-overlay"
                style={{
                  transform: `translate(${focusProjectedNode.x}px, ${focusProjectedNode.y}px)`,
                  ...getLevelVisualStyle(focusProjectedNode.level, renderMaxLevel, levelSeed),
                }}
              >
                <circle r={getNodeRenderRadius(focusProjectedNode) * 4.4} className="node-halo active focus-node" />
                <circle r={getNodeRenderRadius(focusProjectedNode) * 2.5} className="node-soft-edge focus-node" />
                <circle r={getNodeRenderRadius(focusProjectedNode) * 1.92} className="node-core working focus-node" />
                <text
                  x={getNodeRenderRadius(focusProjectedNode) * 1.92 + 10}
                  y={-getNodeRenderRadius(focusProjectedNode) * 1.92 - 5}
                  className="node-label focus-node"
                >
                  {focusProjectedNode.title}
                </text>
              </g>
            ) : null}
          </g>
        </svg>
        {showLinearControls ? (
          <div className="linear-level-controls" onPointerDown={(event) => event.stopPropagation()}>
            {linearColumns.map(({ level, x }) => {
              const isOuterLevel = level === layout.maxLevel;
              return (
                <div
                  key={`linear-control-${level}`}
                  className="linear-level-control"
                  style={{ left: `${x}px` }}
                >
                  <span className="linear-level-badge">
                    {isOuterLevel ? "Outer" : level === 0 ? "Root" : `L${level}`}
                  </span>
                  {!isOuterLevel ? (
                    <button
                      type="button"
                      className="linear-level-collapse"
                      onClick={() => collapseAtLevel(level)}
                      title={`Collapse level ${level} and deeper levels`}
                    >
                      <CollapseLevelsIcon />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      {!displayedSurfaceMode && contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.kind === "background" ? (
            <button
              type="button"
              disabled={isTransitioning}
              onClick={() => openSheet({ type: "create" }, defaultForm(null))}
            >
              Add activity
            </button>
          ) : contextMenu.kind === "dependency-edge" ? (
            <>
              <button
                type="button"
                disabled={isTransitioning}
                onClick={() =>
                  openSheet(
                    {
                      type: "insert-between",
                      parentId: contextMenu.parentId,
                      childId: contextMenu.childId,
                    },
                    defaultForm(null),
                  )
                }
              >
                Add activity
              </button>
              <button type="button" disabled={isTransitioning} onClick={() => deleteEdge(contextMenu)}>
                Delete
              </button>
            </>
          ) : contextMenu.kind === "schedule-edge" ? (
            <>
              <button
                type="button"
                disabled={isTransitioning}
                onClick={() =>
                  openSheet(
                    { type: "edit", nodeId: contextMenu.laterId },
                    defaultForm(nodesById.get(contextMenu.laterId)),
                  )
                }
              >
                Edit date
              </button>
              <p className="small">Scheduling edge between activities on the same dependency level.</p>
            </>
          ) : (
            <>
              {nodesById.get(contextMenu.nodeId)?.kind === "note" ? (
                <button
                  type="button"
                  onClick={() => {
                    const noteId = nodesById.get(contextMenu.nodeId)?.linkedNoteId;
                    if (noteId) {
                      void openExistingNote(noteId);
                    }
                  }}
                >
                  Open note
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => setSelectedId(contextMenu.nodeId)}>
                    View
                  </button>
                  <button
                    type="button"
                    disabled={isTransitioning}
                    onClick={() =>
                      openSheet(
                        { type: "edit", nodeId: contextMenu.nodeId },
                        defaultForm(nodesById.get(contextMenu.nodeId)),
                      )
                    }
                  >
                    Edit
                  </button>
                  <button type="button" disabled={isTransitioning} onClick={() => openDependencySheet(contextMenu.nodeId)}>
                    Edit dependencies
                  </button>
                  <button type="button" disabled={isTransitioning} onClick={() => openAddDependencyActivity(contextMenu.nodeId)}>
                    Add dependency
                  </button>
                  <button
                    type="button"
                    disabled={isTransitioning}
                    onClick={() =>
                      openSheet(
                        { type: "edit", nodeId: contextMenu.nodeId },
                        defaultForm(nodesById.get(contextMenu.nodeId)),
                      )
                    }
                  >
                    Set date
                  </button>
                  <div className="context-divider" />
                  {workingId === contextMenu.nodeId ? (
                    <button type="button" disabled={isTransitioning} onClick={() => stopWork(contextMenu.nodeId)}>
                      Stop
                    </button>
                  ) : (
                    <button type="button" disabled={isTransitioning} onClick={() => startWork(contextMenu.nodeId)}>
                      Start
                    </button>
                  )}
                  <button type="button" disabled={isTransitioning} onClick={() => forkNode(contextMenu.nodeId)}>
                    Fork
                  </button>
                  <button type="button" disabled={isTransitioning} onClick={() => deleteNode(contextMenu.nodeId, false)}>
                    Delete
                  </button>
                  <button type="button" disabled={isTransitioning} onClick={() => deleteNode(contextMenu.nodeId, true)}>
                    Delete tree
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {showActivityInspector && (
        <aside className="notes-overlay activity-overlay" onClick={(event) => event.stopPropagation()}>
          <div className="notes-overlay-form activity-overlay-form">
            <ActivitySummaryBody node={selected} details={selectedDetails} />
          </div>
        </aside>
      )}

      {focusNode ? (
        <div className="work-focus-hud" onClick={(event) => event.stopPropagation()}>
          <p className="work-focus-title">{focusNode.title}</p>
          <p className="work-focus-summary">{getFocusSummary(focusNode)}</p>
          <p className="eyebrow work-focus-label">FOCUS</p>
          <strong className="work-focus-timer">{formatFocusClock(getFocusSessionMs(focusNode, now))}</strong>
          <span className="work-focus-total">{formatHours(getWorkingHours(focusNode, now))} total</span>
        </div>
      ) : null}

      {sheet && (
        <aside className="notes-overlay side-sheet-overlay" onPointerDown={(event) => event.stopPropagation()}>
          <div className="notes-overlay-form side-sheet-form">
            {(sheet.type === "create" || sheet.type === "create-child" || sheet.type === "edit" || sheet.type === "insert-between") && (
              <>
                <h2>
                  {sheet.type === "create"
                    ? "Create activity"
                    : sheet.type === "create-child"
                      ? "Create child activity"
                    : sheet.type === "insert-between"
                      ? "Insert activity between edge"
                      : "Edit activity"}
                </h2>
                <form className="sheet-form" onSubmit={submitActivityForm}>
                  <label>
                    Title
                    <input
                      value={form.title}
                      onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
                    />
                  </label>
                  <label>
                    Notes
                    <textarea
                      value={form.notes}
                      onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))}
                    />
                  </label>
                  <div className="field-row">
                    <label>
                      Start date
                      <input
                        type="date"
                        value={form.startDate}
                        onChange={(event) =>
                          setForm((value) => ({ ...value, startDate: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Best before
                      <input
                        type="date"
                        value={form.bestBefore}
                        onChange={(event) =>
                          setForm((value) => ({ ...value, bestBefore: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <div className="field-row">
                    <label>
                      Expected time (hours)
                      <input
                        type="number"
                        min="0"
                        step="0.25"
                        value={form.expectedTime}
                        onChange={(event) =>
                          setForm((value) => ({ ...value, expectedTime: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Real time (hours)
                      <input
                        type="number"
                        min="0"
                        step="0.25"
                        value={form.realTime}
                        onChange={(event) =>
                          setForm((value) => ({ ...value, realTime: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <div className="field-row">
                    <label>
                      Expected effort
                      <input
                        type="number"
                        min="0"
                        step="0.25"
                        value={form.expectedEffort}
                        onChange={(event) =>
                          setForm((value) => ({ ...value, expectedEffort: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Real effort
                      <input
                        type="number"
                        min="0"
                        step="0.25"
                        value={form.realEffort}
                        onChange={(event) =>
                          setForm((value) => ({ ...value, realEffort: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <div className="sheet-actions">
                    <button type="button" className="ghost-button" onClick={closeSheet}>
                      Cancel
                    </button>
                    <button type="submit" className="ghost-button">
                      Save
                    </button>
                  </div>
                </form>
              </>
            )}

            {sheet.type === "dependencies" && (
              <>
                <h2>Edit dependencies</h2>
                <form className="sheet-form" onSubmit={submitDependencySheet}>
                  <label>
                    <input
                      value={form.dependencyQuery || ""}
                      onChange={(event) =>
                        setForm((value) => ({ ...value, dependencyQuery: event.target.value }))
                      }
                      placeholder="search by title or id"
                    />
                  </label>
                  {(() => {
                    const query = (form.dependencyQuery || "").trim().toLowerCase();
                    const selectedParents = (form.parentIds || []).filter((entry) => entry.checked);
                    const matchingParents = (form.parentIds || [])
                      .filter((entry) => !entry.checked)
                      .filter((entry) =>
                        query
                          ? entry.title.toLowerCase().includes(query) ||
                            entry.id.toLowerCase().includes(query)
                          : false,
                      )
                      .slice(0, 8);

                    return (
                      <>
                        {query ? (
                          <div className="dependency-results">
                            {matchingParents.length > 0 ? (
                              matchingParents.map((entry) => (
                                <button
                                  key={entry.id}
                                  type="button"
                                  className="dependency-result"
                                  onClick={() =>
                                    setForm((value) => ({
                                      ...value,
                                      dependencyQuery: "",
                                      parentIds: value.parentIds.map((item) =>
                                        item.id === entry.id ? { ...item, checked: true } : item,
                                      ),
                                    }))
                                  }
                                >
                                  <span>{entry.title}</span>
                                  <strong>{entry.id}</strong>
                                </button>
                              ))
                            ) : (
                              <p className="small">No matching activities.</p>
                            )}
                          </div>
                        ) : null}

                        <div className="dependency-selected">
                          <p className="small">Selected: {selectedParents.length}</p>
                          {selectedParents.length > 0 ? (
                            <div className="dependency-chip-list">
                              {selectedParents.map((entry) => (
                                <button
                                  key={entry.id}
                                  type="button"
                                  className="dependency-chip"
                                  onClick={() =>
                                    setForm((value) => ({
                                      ...value,
                                      parentIds: value.parentIds.map((item) =>
                                        item.id === entry.id ? { ...item, checked: false } : item,
                                      ),
                                    }))
                                  }
                                >
                                  <span>{entry.title}</span>
                                  <strong className="dependency-chip-remove" aria-hidden="true">
                                    ×
                                  </strong>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="small">No parent selected yet.</p>
                          )}
                        </div>
                      </>
                    );
                  })()}
                  <div className="sheet-actions">
                    <button type="button" className="ghost-button" onClick={closeSheet}>
                      Cancel
                    </button>
                    <button type="submit" className="ghost-button">
                      Apply
                    </button>
                  </div>
                </form>
              </>
            )}

            {sheet.type === "add-dependency-activity" && (
              <>
                <h2>Add dependency activity</h2>
                <p>
                  This creates a new activity and attaches it to the selected root-side branch.
                </p>
                <form className="sheet-form" onSubmit={submitAddDependencyActivity}>
                  <label>
                    Title
                    <input
                      value={form.title}
                      onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
                    />
                  </label>
                  <label>
                    Notes
                    <textarea
                      value={form.notes}
                      onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))}
                    />
                  </label>
                  <div className="field-row">
                    <label>
                      Start date
                      <input
                        type="date"
                        value={form.startDate}
                        onChange={(event) =>
                          setForm((value) => ({ ...value, startDate: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Best before
                      <input
                        type="date"
                        value={form.bestBefore}
                        onChange={(event) =>
                          setForm((value) => ({ ...value, bestBefore: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Expected time (hours)
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={form.expectedTime}
                      onChange={(event) =>
                        setForm((value) => ({ ...value, expectedTime: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Search activities
                    <input
                      value={form.dependencyQuery || ""}
                      onChange={(event) =>
                        setForm((value) => ({ ...value, dependencyQuery: event.target.value }))
                      }
                      placeholder="search by title or id"
                    />
                  </label>
                  {(() => {
                    const query = (form.dependencyQuery || "").trim().toLowerCase();
                    const selectedParents = (form.parentIds || []).filter((entry) => entry.checked);
                    const matchingParents = (form.parentIds || [])
                      .filter((entry) => !entry.checked)
                      .filter((entry) =>
                        query
                          ? entry.title.toLowerCase().includes(query) ||
                            entry.id.toLowerCase().includes(query)
                          : false,
                      )
                      .slice(0, 8);

                    return (
                      <>
                        {query ? (
                          <div className="dependency-results">
                            {matchingParents.length > 0 ? (
                              matchingParents.map((entry) => (
                                <button
                                  key={entry.id}
                                  type="button"
                                  className="dependency-result"
                                  onClick={() =>
                                    setForm((value) => ({
                                      ...value,
                                      dependencyQuery: "",
                                      parentIds: value.parentIds.map((item) =>
                                        item.id === entry.id ? { ...item, checked: true } : item,
                                      ),
                                    }))
                                  }
                                >
                                  <span>{entry.title}</span>
                                  <strong>{entry.id}</strong>
                                </button>
                              ))
                            ) : (
                              <p className="small">No matching activities.</p>
                            )}
                          </div>
                        ) : null}

                        <div className="dependency-selected">
                          <p className="small">Selected: {selectedParents.length}</p>
                          {selectedParents.length > 0 ? (
                            <div className="dependency-chip-list">
                              {selectedParents.map((entry) => (
                                <button
                                  key={entry.id}
                                  type="button"
                                  className="dependency-chip"
                                  onClick={() =>
                                    setForm((value) => ({
                                      ...value,
                                      parentIds: value.parentIds.map((item) =>
                                        item.id === entry.id ? { ...item, checked: false } : item,
                                      ),
                                    }))
                                  }
                                >
                                  <span>{entry.title}</span>
                                  <strong className="dependency-chip-remove" aria-hidden="true">
                                    ×
                                  </strong>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="small">No parent selected yet.</p>
                          )}
                        </div>
                      </>
                    );
                  })()}
                  <div className="sheet-actions">
                    <button type="button" className="ghost-button" onClick={closeSheet}>
                      Cancel
                    </button>
                    <button type="submit" className="ghost-button">
                      Create
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </aside>
      )}

    </main>
  );
}
