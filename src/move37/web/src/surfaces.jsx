import { memo, useDeferredValue, useEffect, useMemo, useState } from "react";

const TASK_TITLE_COLLATOR = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});
const TASK_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
});

function compareTaskNodes(left, right) {
  const leftWorking = left.workStartedAt ? 0 : 1;
  const rightWorking = right.workStartedAt ? 0 : 1;
  if (leftWorking !== rightWorking) {
    return leftWorking - rightWorking;
  }

  const leftScheduled = left.startDate ? 0 : 1;
  const rightScheduled = right.startDate ? 0 : 1;
  if (leftScheduled !== rightScheduled) {
    return leftScheduled - rightScheduled;
  }

  if (left.startDate && right.startDate) {
    const startDateCompare = left.startDate.localeCompare(right.startDate);
    if (startDateCompare !== 0) {
      return startDateCompare;
    }
  }

  if (left.bestBefore && right.bestBefore) {
    const dueDateCompare = left.bestBefore.localeCompare(right.bestBefore);
    if (dueDateCompare !== 0) {
      return dueDateCompare;
    }
  }

  return TASK_TITLE_COLLATOR.compare(left.title || "", right.title || "");
}

function formatTaskDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return TASK_DATE_FORMATTER.format(date);
}

function summarizeNotes(value) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > 140 ? `${normalized.slice(0, 139).trimEnd()}…` : normalized;
}

function setsEqual(left, right) {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

function buildTaskTree(graph, nodesById) {
  const parentMap = new Map(graph.nodes.map((node) => [node.id, []]));
  const childMap = new Map(graph.nodes.map((node) => [node.id, []]));

  graph.dependencies.forEach((edge) => {
    if (!parentMap.has(edge.childId) || !childMap.has(edge.parentId)) {
      return;
    }
    parentMap.get(edge.childId).push(edge.parentId);
    childMap.get(edge.parentId).push(edge.childId);
  });

  childMap.forEach((children, nodeId) => {
    children.sort((leftId, rightId) =>
      compareTaskNodes(nodesById.get(leftId) || {}, nodesById.get(rightId) || {}),
    );
    childMap.set(nodeId, children);
  });

  const roots = graph.nodes
    .filter((node) => (parentMap.get(node.id) || []).length === 0)
    .sort(compareTaskNodes)
    .map((node) => node.id);

  const searchTextById = new Map(
    graph.nodes.map((node) => [
      node.id,
      [node.title, node.notes, node.startDate, node.bestBefore]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    ]),
  );

  const descendantIdsByNodeId = new Map();

  function collectDescendants(nodeId, path = new Set()) {
    if (descendantIdsByNodeId.has(nodeId)) {
      return descendantIdsByNodeId.get(nodeId);
    }
    if (path.has(nodeId)) {
      return new Set();
    }

    const nextPath = new Set(path);
    nextPath.add(nodeId);
    const descendants = new Set();

    (childMap.get(nodeId) || []).forEach((childId) => {
      descendants.add(childId);
      collectDescendants(childId, nextPath).forEach((nestedId) => descendants.add(nestedId));
    });

    descendantIdsByNodeId.set(nodeId, descendants);
    return descendants;
  }

  const descendantCountById = new Map(
    graph.nodes.map((node) => [node.id, collectDescendants(node.id).size]),
  );

  return {
    parentMap,
    childMap,
    roots,
    searchTextById,
    descendantCountById,
    activeCount: graph.nodes.filter((node) => node.workStartedAt).length,
    scheduledCount: graph.nodes.filter((node) => node.startDate).length,
  };
}

function collectSelectedLineage(selectedId, parentMap) {
  if (!selectedId) {
    return new Set();
  }
  const lineage = new Set();
  const queue = [selectedId];

  while (queue.length) {
    const currentId = queue.shift();
    if (!currentId || lineage.has(currentId)) {
      continue;
    }
    lineage.add(currentId);
    (parentMap.get(currentId) || []).forEach((parentId) => {
      if (!lineage.has(parentId)) {
        queue.push(parentId);
      }
    });
  }

  return lineage;
}

function findMatchingTaskIds(roots, childMap, searchTextById, query) {
  if (!query) {
    return null;
  }

  const matches = new Set();

  function branchMatches(nodeId, path) {
    if (path.has(nodeId)) {
      return false;
    }
    const nextPath = new Set(path);
    nextPath.add(nodeId);
    const selfMatches = searchTextById.get(nodeId)?.includes(query) || false;
    let childMatches = false;

    (childMap.get(nodeId) || []).forEach((childId) => {
      if (branchMatches(childId, nextPath)) {
        childMatches = true;
      }
    });

    if (selfMatches || childMatches) {
      matches.add(nodeId);
      return true;
    }
    return false;
  }

  roots.forEach((rootId) => {
    branchMatches(rootId, new Set());
  });

  return matches;
}

const TaskListRow = memo(function TaskListRow({
  row,
  selectedId,
  onToggle,
  onSelectNode,
  onCreateChild,
}) {
  const {
    node,
    depth,
    hasChildren,
    isExpanded,
    descendantCount,
    isRoot,
  } = row;
  const notes = summarizeNotes(node.notes);
  const startLabel = node.startDate ? `Start ${formatTaskDate(node.startDate)}` : "No start";
  const dueLabel = node.bestBefore ? `Due ${formatTaskDate(node.bestBefore)}` : "";

  return (
    <article
      role="listitem"
      className={[
        "task-row",
        selectedId === node.id ? "selected" : "",
        node.workStartedAt ? "working" : "",
        isRoot ? "root" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--task-depth": depth }}
    >
      <div className="task-row-indent">
        <span className="task-row-rail" aria-hidden="true" />
        {hasChildren ? (
          <button
            type="button"
            className={`task-toggle ${isExpanded ? "open" : ""}`}
            onClick={() => onToggle(node.id)}
            aria-label={isExpanded ? "Collapse branch" : "Expand branch"}
          >
            <span className="task-toggle-glyph" />
          </button>
        ) : (
          <span className="task-leaf-glyph" aria-hidden="true" />
        )}
      </div>
      <button type="button" className="task-row-main" onClick={() => onSelectNode(node.id)}>
        <span className="task-row-kicker">{isRoot ? "root activity" : `level ${depth}`}</span>
        <strong>{node.title}</strong>
        {notes ? <span className="task-row-notes">{notes}</span> : null}
      </button>
      <div className="task-row-meta">
        {node.workStartedAt ? <span className="task-pill working">Working</span> : null}
        <span className={`task-pill ${node.startDate ? "scheduled" : "quiet"}`}>{startLabel}</span>
        {dueLabel ? <span className="task-pill due">{dueLabel}</span> : null}
        {descendantCount ? (
          <span className="task-pill neutral">{descendantCount} downstream</span>
        ) : null}
      </div>
      <button
        type="button"
        className="task-row-action"
        onClick={() => onCreateChild(node.id)}
        aria-label={`Add child activity to ${node.title}`}
        title="Add child activity"
      >
        Child
      </button>
    </article>
  );
});

function TaskListSurfaceInner({
  graph,
  nodesById,
  selectedId,
  onSelectNode,
  onCreateRoot,
  onCreateChild,
}) {
  const [searchValue, setSearchValue] = useState("");
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const deferredSearch = useDeferredValue(searchValue.trim().toLowerCase());

  const taskTree = useMemo(() => buildTaskTree(graph, nodesById), [graph, nodesById]);
  const selectedLineage = useMemo(
    () => collectSelectedLineage(selectedId, taskTree.parentMap),
    [selectedId, taskTree.parentMap],
  );

  useEffect(() => {
    setExpandedIds((current) => {
      const next = new Set([...current].filter((id) => nodesById.has(id)));
      taskTree.roots.forEach((id) => next.add(id));
      selectedLineage.forEach((id) => next.add(id));
      return setsEqual(current, next) ? current : next;
    });
  }, [nodesById, selectedLineage, taskTree.roots]);

  const matchingIds = useMemo(
    () =>
      findMatchingTaskIds(
        taskTree.roots,
        taskTree.childMap,
        taskTree.searchTextById,
        deferredSearch,
      ),
    [deferredSearch, taskTree.childMap, taskTree.roots, taskTree.searchTextById],
  );

  const visibleRows = useMemo(() => {
    const rows = [];
    const forceExpand = Boolean(deferredSearch);

    function visit(nodeId, depth, rootId, path) {
      if (path.has(nodeId)) {
        return;
      }
      if (matchingIds && !matchingIds.has(nodeId)) {
        return;
      }

      const node = nodesById.get(nodeId);
      if (!node) {
        return;
      }

      const children = (taskTree.childMap.get(nodeId) || []).filter(
        (childId) => !matchingIds || matchingIds.has(childId),
      );
      const isExpanded = forceExpand || expandedIds.has(nodeId);

      rows.push({
        id: nodeId,
        node,
        depth,
        isRoot: rootId === nodeId,
        hasChildren: children.length > 0,
        isExpanded,
        descendantCount: taskTree.descendantCountById.get(nodeId) || 0,
      });

      if (!isExpanded) {
        return;
      }

      const nextPath = new Set(path);
      nextPath.add(nodeId);
      children.forEach((childId) => {
        visit(childId, depth + 1, rootId, nextPath);
      });
    }

    taskTree.roots.forEach((rootId) => {
      visit(rootId, 0, rootId, new Set());
    });

    return rows;
  }, [
    deferredSearch,
    expandedIds,
    matchingIds,
    nodesById,
    taskTree.childMap,
    taskTree.descendantCountById,
    taskTree.roots,
  ]);

  const visibleNodeCount = matchingIds ? matchingIds.size : graph.nodes.length;

  function toggleExpanded(nodeId) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  function expandAll() {
    setExpandedIds(new Set(graph.nodes.map((node) => node.id)));
  }

  function collapseToRoots() {
    const next = new Set(taskTree.roots);
    selectedLineage.forEach((id) => next.add(id));
    setExpandedIds(next);
  }

  return (
    <div className="surface-content task-list-surface">
      <div className="task-list-hero">
        <div className="task-list-hero-copy">
          <p className="eyebrow">TASKS</p>
          <h2>Activities ledger</h2>
          <p className="task-list-subtitle">
            Faster tree navigation, cleaner hierarchy, and quick access to what is active now.
          </p>
        </div>
        <div className="surface-actions">
          <button type="button" className="ghost-button" onClick={onCreateRoot}>
            ADD ROOT
          </button>
        </div>
      </div>

      <div className="task-list-stats" aria-label="Activity list summary">
        <article className="task-stat">
          <span className="task-stat-label">Visible</span>
          <strong>{visibleNodeCount}</strong>
        </article>
        <article className="task-stat">
          <span className="task-stat-label">Roots</span>
          <strong>{taskTree.roots.length}</strong>
        </article>
        <article className="task-stat">
          <span className="task-stat-label">Scheduled</span>
          <strong>{taskTree.scheduledCount}</strong>
        </article>
        <article className="task-stat">
          <span className="task-stat-label">Working</span>
          <strong>{taskTree.activeCount}</strong>
        </article>
      </div>

      <div className="task-list-toolbar">
        <label className="task-search-field">
          <span>Filter activities</span>
          <input
            type="search"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Search title, notes, or dates"
          />
        </label>
        <div className="task-toolbar-actions">
          <button type="button" className="ghost-button" onClick={expandAll}>
            EXPAND ALL
          </button>
          <button type="button" className="ghost-button" onClick={collapseToRoots}>
            ROOTS ONLY
          </button>
        </div>
      </div>

      <div className="task-list-grid" role="list">
        {visibleRows.length ? (
          visibleRows.map((row) => (
            <TaskListRow
              key={row.id}
              row={row}
              selectedId={selectedId}
              onToggle={toggleExpanded}
              onSelectNode={onSelectNode}
              onCreateChild={onCreateChild}
            />
          ))
        ) : (
          <div className="task-list-empty">
            <p className="task-empty">
              {deferredSearch
                ? "No activities match this filter."
                : "No activities yet. Add a root to start the graph."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function taskListPropsEqual(previous, next) {
  return (
    previous.graph === next.graph &&
    previous.nodesById === next.nodesById &&
    previous.selectedId === next.selectedId
  );
}

export const TaskListSurface = memo(TaskListSurfaceInner, taskListPropsEqual);

function startOfDay(value) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(value, count) {
  const next = new Date(value);
  next.setDate(next.getDate() + count);
  return next;
}

function startOfWeek(value) {
  const next = startOfDay(value);
  const weekday = next.getDay();
  return addDays(next, -weekday);
}

function startOfMonth(value) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function eventOccursOnDay(event, day) {
  const start = startOfDay(new Date(event.startsAt));
  const end = startOfDay(new Date(event.endsAt));
  const nextDay = addDays(day, 1);
  return start < nextDay && end > day;
}

function formatDayLabel(value, options) {
  return new Intl.DateTimeFormat("en-GB", options).format(value);
}

export function getCalendarWindow(range, anchorDate) {
  const anchor = startOfDay(anchorDate);
  if (range === "day") {
    return { start: anchor, end: addDays(anchor, 1) };
  }
  if (range === "month") {
    const start = startOfMonth(anchor);
    return { start, end: new Date(start.getFullYear(), start.getMonth() + 1, 1) };
  }
  const start = startOfWeek(anchor);
  return { start, end: addDays(start, 7) };
}

export function shiftCalendarAnchor(range, anchorDate, direction) {
  if (range === "day") {
    return addDays(anchorDate, direction);
  }
  if (range === "month") {
    return new Date(anchorDate.getFullYear(), anchorDate.getMonth() + direction, 1);
  }
  return addDays(anchorDate, direction * 7);
}

function EventChip({ event, onSelectActivity }) {
  return (
    <button
      type="button"
      className={`calendar-event ${event.managedByMove37 ? "managed" : ""}`}
      onClick={() => {
        if (event.linkedActivityId) {
          onSelectActivity(event.linkedActivityId);
        }
      }}
    >
      <strong>{event.title}</strong>
      <span>
        {event.allDay
          ? "All day"
          : formatDayLabel(new Date(event.startsAt), {
              hour: "2-digit",
              minute: "2-digit",
            })}
      </span>
    </button>
  );
}

function DayColumn({ day, events, onSelectActivity }) {
  return (
    <section className="calendar-column">
      <header>
        <p>{formatDayLabel(day, { weekday: "short" })}</p>
        <strong>{formatDayLabel(day, { day: "2-digit", month: "short" })}</strong>
      </header>
      <div className="calendar-column-body">
        {events.length ? (
          events.map((event) => (
            <EventChip key={event.id} event={event} onSelectActivity={onSelectActivity} />
          ))
        ) : (
          <p className="task-empty">No events.</p>
        )}
      </div>
    </section>
  );
}

function buildMonthGrid(anchorDate) {
  const monthStart = startOfMonth(anchorDate);
  const gridStart = startOfWeek(monthStart);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export function CalendarSurface({
  range,
  anchorDate,
  onPrev,
  onNext,
  onToday,
  onRangeChange,
  onReconcile,
  reconciling,
  status,
  loading,
  events,
  onSelectActivity,
}) {
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(startOfWeek(anchorDate), index),
  );
  const dayEvents = events.filter((event) => eventOccursOnDay(event, startOfDay(anchorDate)));
  const monthDays = buildMonthGrid(anchorDate);

  return (
    <div className="surface-content calendar-surface">
      <div className="surface-header">
        <div>
          <p className="eyebrow">CALENDAR</p>
          <h2>{formatDayLabel(anchorDate, { month: "long", year: "numeric" })}</h2>
        </div>
        <div className="surface-actions">
          <button
            type="button"
            className={`ghost-button ${range === "day" ? "active" : ""}`}
            onClick={() => onRangeChange("day")}
          >
            DAY
          </button>
          <button
            type="button"
            className={`ghost-button ${range === "week" ? "active" : ""}`}
            onClick={() => onRangeChange("week")}
          >
            WEEK
          </button>
          <button
            type="button"
            className={`ghost-button ${range === "month" ? "active" : ""}`}
            onClick={() => onRangeChange("month")}
          >
            MONTH
          </button>
          <button type="button" className="ghost-button" onClick={onPrev}>
            PREV
          </button>
          <button type="button" className="ghost-button" onClick={onToday}>
            TODAY
          </button>
          <button type="button" className="ghost-button" onClick={onNext}>
            NEXT
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={onReconcile}
            disabled={reconciling}
          >
            {reconciling ? "SYNCING" : "SYNC"}
          </button>
        </div>
      </div>
      {!status?.connected ? (
        <div className="surface-banner">Apple Calendar is not configured.</div>
      ) : null}
      {loading ? <div className="surface-banner">Loading calendar…</div> : null}
      {range === "day" ? (
        <div className="calendar-columns single">
          <DayColumn
            day={startOfDay(anchorDate)}
            events={dayEvents}
            onSelectActivity={onSelectActivity}
          />
        </div>
      ) : null}
      {range === "week" ? (
        <div className="calendar-columns week">
          {weekDays.map((day) => (
            <DayColumn
              key={day.toISOString()}
              day={day}
              events={events.filter((event) => eventOccursOnDay(event, day))}
              onSelectActivity={onSelectActivity}
            />
          ))}
        </div>
      ) : null}
      {range === "month" ? (
        <div className="calendar-month-grid">
          {monthDays.map((day) => {
            const dayEventsForMonth = events.filter((event) => eventOccursOnDay(event, day));
            const visibleEvents = dayEventsForMonth.slice(0, 3);
            return (
              <section key={day.toISOString()} className="calendar-month-cell">
                <header>
                  <strong>{day.getDate()}</strong>
                </header>
                <div className="calendar-month-events">
                  {visibleEvents.map((event) => (
                    <EventChip key={event.id} event={event} onSelectActivity={onSelectActivity} />
                  ))}
                  {dayEventsForMonth.length > visibleEvents.length ? (
                    <span className="calendar-overflow">
                      +{dayEventsForMonth.length - visibleEvents.length} more
                    </span>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
