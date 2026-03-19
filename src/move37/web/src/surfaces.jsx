import { memo, useMemo } from "react";

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

function TaskListSurfaceInner({
  graph,
  selectedId,
  onSelectNode,
}) {
  const activities = useMemo(
    () =>
      graph.nodes
        .filter((node) => node.kind !== "note")
        .sort(compareTaskNodes),
    [graph.nodes],
  );

  return (
    <div className="task-list-panel">
      <header className="task-list-panel-header">
        <div>
          <p className="eyebrow">TASKS</p>
          <h2>Activities</h2>
        </div>
        <span className="task-list-count">{activities.length}</span>
      </header>

      <div className="task-list-minimal" role="list">
        {activities.length ? (
          activities.map((node) => {
            const metaLabel = node.workStartedAt
              ? "Working"
              : node.startDate
                ? formatTaskDate(node.startDate)
                : node.bestBefore
                  ? `Due ${formatTaskDate(node.bestBefore)}`
                  : "";
            return (
              <button
                key={node.id}
                type="button"
                role="listitem"
                className={`task-list-item ${selectedId === node.id ? "selected" : ""}`}
                onClick={() => onSelectNode(node.id)}
              >
                <span className="task-list-item-title">{node.title}</span>
                {metaLabel ? (
                  <span className={`task-list-item-meta ${node.workStartedAt ? "working" : ""}`}>
                    {metaLabel}
                  </span>
                ) : null}
              </button>
            );
          })
        ) : (
          <p className="task-empty">No activities yet.</p>
        )}
      </div>
    </div>
  );
}

function taskListPropsEqual(previous, next) {
  return (
    previous.graph === next.graph &&
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
