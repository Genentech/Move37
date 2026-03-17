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

function TaskListBranch({
  node,
  childMap,
  nodesById,
  path,
  depth,
  selectedId,
  onSelectNode,
  onCreateChild,
}) {
  const [open, setOpen] = useState(depth === 0);
  const nextPath = new Set(path);
  nextPath.add(node.id);
  const children = (childMap.get(node.id) || [])
    .map((childId) => nodesById.get(childId))
    .filter(Boolean)
    .sort((left, right) => left.title.localeCompare(right.title));

  return (
    <section className={`task-branch depth-${depth} ${open ? "open" : ""}`}>
      <div className={`task-summary ${selectedId === node.id ? "selected" : ""}`}>
        <button
          type="button"
          className={`task-toggle ${open ? "open" : ""}`}
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Collapse branch" : "Expand branch"}
        >
          <span className="task-toggle-glyph" />
        </button>
        <button type="button" className="task-title-button" onClick={() => onSelectNode(node.id)}>
          <span>{node.title}</span>
          <span className="task-summary-meta">
            {node.startDate ? node.startDate : "unscheduled"}
          </span>
        </button>
        <button
          type="button"
          className="task-inline-action"
          onClick={() => onCreateChild(node.id)}
          aria-label={`Add child activity to ${node.title}`}
          title="Add child activity"
        >
          +
        </button>
      </div>
      <div className="task-branch-collapse">
        <div className="task-branch-body">
          {node.notes ? <p className="task-notes">{node.notes}</p> : null}
          {children.length ? (
            <div className="task-children">
              {children.map((child) =>
                nextPath.has(child.id) ? null : (
                  <TaskListBranch
                    key={`${node.id}:${child.id}`}
                    node={child}
                    childMap={childMap}
                    nodesById={nodesById}
                    path={nextPath}
                    depth={depth + 1}
                    selectedId={selectedId}
                    onSelectNode={onSelectNode}
                    onCreateChild={onCreateChild}
                  />
                ),
              )}
            </div>
          ) : (
            <p className="task-empty">No child tasks.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export function TaskListSurface({
  graph,
  nodesById,
  selectedId,
  onSelectNode,
  onCreateRoot,
  onCreateChild,
}) {
  const parentMap = new Map(graph.nodes.map((node) => [node.id, []]));
  const childMap = new Map(graph.nodes.map((node) => [node.id, []]));
  graph.dependencies.forEach((edge) => {
    if (!parentMap.has(edge.childId) || !childMap.has(edge.parentId)) {
      return;
    }
    parentMap.get(edge.childId).push(edge.parentId);
    childMap.get(edge.parentId).push(edge.childId);
  });
  const roots = graph.nodes
    .filter((node) => (parentMap.get(node.id) || []).length === 0)
    .sort((left, right) => left.title.localeCompare(right.title));

  return (
    <div className="surface-content task-list-surface">
      <div className="surface-header">
        <div>
          <p className="eyebrow">TASKS</p>
          <h2>Dependency list</h2>
        </div>
        <div className="surface-actions">
          <button type="button" className="ghost-button" onClick={onCreateRoot}>
            ADD ROOT
          </button>
        </div>
      </div>
      <div className="task-list-grid">
        {roots.map((node) => (
          <TaskListBranch
            key={node.id}
            node={node}
            childMap={childMap}
            nodesById={nodesById}
            path={new Set()}
            depth={0}
            selectedId={selectedId}
            onSelectNode={onSelectNode}
            onCreateChild={onCreateChild}
          />
        ))}
      </div>
    </div>
  );
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
      <span>{event.allDay ? "All day" : formatDayLabel(new Date(event.startsAt), { hour: "2-digit", minute: "2-digit" })}</span>
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
          <button type="button" className={`ghost-button ${range === "day" ? "active" : ""}`} onClick={() => onRangeChange("day")}>
            DAY
          </button>
          <button type="button" className={`ghost-button ${range === "week" ? "active" : ""}`} onClick={() => onRangeChange("week")}>
            WEEK
          </button>
          <button type="button" className={`ghost-button ${range === "month" ? "active" : ""}`} onClick={() => onRangeChange("month")}>
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
          <button type="button" className="ghost-button" onClick={onReconcile} disabled={reconciling}>
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
          <DayColumn day={startOfDay(anchorDate)} events={dayEvents} onSelectActivity={onSelectActivity} />
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
import { useState } from "react";
