import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const GITHUB_REPO_URL = "https://github.com/genentech/penrose-lamarck";
const GITHUB_MARK_PNG =
  "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const MOCK_EXERCISES = [
  {
    id: "ex-001",
    question: "Patient intake greeting in Danish",
    answer: "Hej, hvordan har du det i dag?",
    language: "da",
    tags: ["medical", "intro"],
    classes: ["conversation", "triage"],
    content_hash: "9fb2dd7fef12a9dc1a7d6ea1adcb4b31f4be44b655ec1f7bb8f627049be51201",
    created_at: "2026-02-27T08:00:00Z",
  },
  {
    id: "ex-002",
    question: "Record blood pressure values in Spanish",
    answer: "Presion arterial ciento veinte sobre ochenta",
    language: "es",
    tags: ["vitals", "cardiology"],
    classes: ["vocabulary", "cardiology"],
    content_hash: "ab8d42d59256ca212e0f132f5f1e910793e163dce8fd460d7e4f80bb6ba5d18d",
    created_at: "2026-02-27T08:05:00Z",
  },
  {
    id: "ex-003",
    question: "Explain fasting requirement before blood test",
    answer: "Do not eat for eight hours before the test",
    language: "en",
    tags: ["lab"],
    classes: ["conversation", "lab"],
    content_hash: "1cf4c9aa40d2f2a70d69493df43e03f2266fdb70cecf652646535f5984f0a03f",
    created_at: "2026-02-27T08:10:00Z",
  },
  {
    id: "ex-004",
    question: "Triage chest pain urgency phrasing",
    answer: "Chest pain with shortness of breath requires immediate assessment",
    language: "en",
    tags: ["triage", "urgent"],
    classes: ["triage", "cardiology"],
    content_hash: "cb7586faf57efadf89be9fa95f7dd584afdedec213d5fd3cc515d6f89ec4f4f7",
    created_at: "2026-02-27T08:14:00Z",
  },
  {
    id: "ex-005",
    question: "Medication reconciliation script",
    answer: "Please list all medicines and doses you take daily",
    language: "en",
    tags: ["pharmacy"],
    classes: ["conversation", "medication"],
    content_hash: "56f8d73001d5a8e4a4752da1d9093fc3b0f5a25dcf68d45f8d1031b9d3935642",
    created_at: "2026-02-27T08:20:00Z",
  },
  {
    id: "ex-006",
    question: "Post-op wound care vocabulary in Swedish",
    answer: "Byt forband och hall saaret rent",
    language: "sv",
    tags: ["surgery", "care"],
    classes: ["vocabulary", "postop"],
    content_hash: "fd7a5f1f8ce891aa5d2fcb2ebee79edce77d9b8a388f986a83dc9aace2cc1cb2",
    created_at: "2026-02-27T08:26:00Z",
  },
  {
    id: "ex-007",
    question: "Lab specimen confirmation checklist",
    answer: "Confirm patient name, date of birth, and specimen label match",
    language: "en",
    tags: ["lab", "safety"],
    classes: ["lab", "safety"],
    content_hash: "8b9f52bc24da4fdccf6f5924480f6e47df206e9ba3f36592577234132f3219fb",
    created_at: "2026-02-27T08:31:00Z",
  },
  {
    id: "ex-008",
    question: "Emergency allergy escalation sentence",
    answer: "Severe allergy signs require immediate physician notification",
    language: "en",
    tags: ["urgent", "allergy"],
    classes: ["triage", "safety"],
    content_hash: "13eb39c86d3c31fcb5808fd172ab62fdd8d446b89b604ec6c8eab5e458ba3da1",
    created_at: "2026-02-27T08:37:00Z",
  },
  {
    id: "ex-009",
    question: "Cardiology follow-up appointment phrase in Danish",
    answer: "Naeste kontrol hos hjertelaegen er om to uger",
    language: "da",
    tags: ["appointment", "cardiology"],
    classes: ["conversation", "cardiology"],
    content_hash: "06ea871f4d78e40ca9e93f7237466fc20faab81e2ccdb0f0fd544dc73dd3e7c8",
    created_at: "2026-02-27T08:43:00Z",
  },
  {
    id: "ex-010",
    question: "Antibiotic dosage confirmation",
    answer: "Take one tablet twice daily after meals",
    language: "en",
    tags: ["medication"],
    classes: ["medication", "vocabulary"],
    content_hash: "80aeeea5db5b9c34fc9d4bc9f8ccffbd85f5196dcc6d2fca9f55f106f53fbcce",
    created_at: "2026-02-27T08:48:00Z",
  },
  {
    id: "ex-011",
    question: "Discharge safety warning",
    answer: "Return to emergency if fever or breathing difficulty occurs",
    language: "en",
    tags: ["discharge", "safety"],
    classes: ["safety", "conversation"],
    content_hash: "5cc50abf78d6d084497f2f319b3b7ac0623e1117a8d82e4f0ea96f8cc603a8ed",
    created_at: "2026-02-27T08:55:00Z",
  },
  {
    id: "ex-012",
    question: "Post-op pain scale translation",
    answer: "Rate your pain from zero to ten",
    language: "en",
    tags: ["postop", "assessment"],
    classes: ["postop", "triage"],
    content_hash: "e2f4334f970712c8fcd1645f3d730fbc2d41cb5e1fceef5f78bde13d8fd6185b",
    created_at: "2026-02-27T09:00:00Z",
  },
];

function normalizeExercise(row, index) {
  const id = String(row.id || `exercise-${index + 1}`);
  const classes = Array.isArray(row.classes)
    ? row.classes.filter((value) => typeof value === "string" && value.trim())
    : [];
  return {
    id,
    uri: String(row.uri || `exercise://${id}`),
    question: String(row.question || id),
    answer: String(row.answer || ""),
    language: String(row.language || ""),
    tags: Array.isArray(row.tags) ? row.tags : [],
    classes,
    content_hash: String(row.content_hash || ""),
    created_at: String(row.created_at || ""),
  };
}

function buildClassEdges(exercises) {
  const edges = [];
  for (let left = 0; left < exercises.length; left += 1) {
    for (let right = left + 1; right < exercises.length; right += 1) {
      const sharedClasses = exercises[left].classes.filter((className) =>
        exercises[right].classes.includes(className)
      );
      if (!sharedClasses.length) {
        continue;
      }
      edges.push({
        source: exercises[left].id,
        target: exercises[right].id,
        sharedClasses: [...new Set(sharedClasses)].sort(),
        weight: sharedClasses.length,
      });
    }
  }
  return edges;
}

function fibonacciSphere(index, total) {
  if (total <= 1) {
    return { x: 0, y: 0, z: 1 };
  }
  const y = 1 - (index / (total - 1)) * 2;
  const radius = Math.sqrt(1 - y * y);
  const theta = GOLDEN_ANGLE * index;
  return {
    x: Math.cos(theta) * radius,
    y,
    z: Math.sin(theta) * radius,
  };
}

function rotateY(point, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos + point.z * sin,
    y: point.y,
    z: -point.x * sin + point.z * cos,
  };
}

function rotateX(point, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x,
    y: point.y * cos - point.z * sin,
    z: point.y * sin + point.z * cos,
  };
}

async function detectStandaloneDebug() {
  try {
    const response = await fetch("/health", { method: "GET" });
    if (!response.ok) {
      return false;
    }
    const payload = await response.json();
    return payload?.mode === "standalone-web";
  } catch {
    return true;
  }
}

export default function App() {
  const shellRef = useRef(null);
  const dragRef = useRef({ active: false, x: 0, y: 0 });
  const [size, setSize] = useState({ width: 1200, height: 760 });
  const [autoRotation, setAutoRotation] = useState(0);
  const [rotationX, setRotationX] = useState(0.52);
  const [rotationY, setRotationY] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [exercises, setExercises] = useState([]);
  const [modeLabel, setModeLabel] = useState("Detecting runtime mode...");
  const [selectedId, setSelectedId] = useState(null);

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
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = 0;
    const tick = (timestamp) => {
      if (!last) {
        last = timestamp;
      }
      const delta = timestamp - last;
      last = timestamp;
      setAutoRotation((value) => (value + delta * 0.00012) % (Math.PI * 2));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    async function load() {
      const standalone = await detectStandaloneDebug();
      if (standalone) {
        const normalized = MOCK_EXERCISES.map(normalizeExercise);
        setExercises(normalized);
        setModeLabel("Standalone debug mode: using local mock exercise graph.");
        return;
      }

      try {
        const response = await fetch("/v1/exercise/graph", { method: "GET" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        const normalized = Array.isArray(payload?.nodes)
          ? payload.nodes.map((node, index) =>
              normalizeExercise(
                {
                  id: node.id,
                  uri: node.uri || `exercise://${node.id || `exercise-${index + 1}`}`,
                  question: node.label || node.question,
                  answer: "",
                  language: node.language,
                  tags: node.tags,
                  classes: node.classes,
                },
                index
              )
            )
          : [];
        setExercises(normalized);
        setModeLabel("Doing now what our patients need next.");
      } catch {
        const normalized = MOCK_EXERCISES.map(normalizeExercise);
        setExercises(normalized);
        setModeLabel("debug:on");
      }
    }

    load();
  }, []);

  const edges = useMemo(() => buildClassEdges(exercises), [exercises]);

  const basePositions = useMemo(
    () => exercises.map((_, index) => fibonacciSphere(index, exercises.length)),
    [exercises]
  );

  const projected = useMemo(() => {
    const centerX = size.width / 2;
    const centerY = size.height / 2;
    const radius = Math.min(size.width, size.height) * 0.33 * zoom;
    const perspective = 2.95;
    const byId = {};
    const ordered = exercises.map((exercise, index) => {
      const rotated = rotateX(
        rotateY(basePositions[index], autoRotation + rotationY),
        rotationX
      );
      const depth = perspective / (perspective - rotated.z);
      const node = {
        ...exercise,
        x: centerX + rotated.x * radius * depth,
        y: centerY + rotated.y * radius * depth,
        z: rotated.z,
        depth,
      };
      byId[exercise.id] = node;
      return node;
    });
    ordered.sort((left, right) => left.z - right.z);
    return { ordered, byId };
  }, [autoRotation, basePositions, exercises, rotationX, rotationY, size.height, size.width, zoom]);

  const selected = useMemo(
    () => exercises.find((exercise) => exercise.id === selectedId) || null,
    [exercises, selectedId]
  );

  const selectedEdges = useMemo(
    () => edges.filter((edge) => edge.source === selectedId || edge.target === selectedId),
    [edges, selectedId]
  );

  function onPointerDown(event) {
    if (event.target === event.currentTarget) {
      setSelectedId(null);
    }
    dragRef.current = {
      active: true,
      x: event.clientX,
      y: event.clientY,
    };
    setIsDragging(true);
  }

  function onPointerMove(event) {
    if (!dragRef.current.active) {
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
    setIsDragging(false);
  }

  function onWheel(event) {
    event.preventDefault();
    const zoomDelta = event.deltaY > 0 ? -0.08 : 0.08;
    setZoom((value) => Math.max(0.55, Math.min(1.8, value + zoomDelta)));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <p className="eyebrow">PENROSE-LAMARCK</p>
          <p className="status">{modeLabel}</p>
        </div>
        <a
          className="github-link"
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Open GitHub repository"
          title="Open GitHub repository"
        >
          <img src={GITHUB_MARK_PNG} alt="GitHub" />
        </a>
      </header>

      <section
        ref={shellRef}
        className={`sphere-area ${isDragging ? "dragging" : ""}`}
        aria-label="Exercise class network"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDragging}
        onPointerLeave={stopDragging}
        onWheel={onWheel}
      >
        <svg viewBox={`0 0 ${size.width} ${size.height}`} role="img">
          <defs>
            <radialGradient id="sphere-halo" cx="50%" cy="50%">
              <stop offset="58%" stopColor="#86cbff" stopOpacity="0" />
              <stop offset="74%" stopColor="#7cc9ff" stopOpacity="0.2" />
              <stop offset="84%" stopColor="#5ca6f5" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#2a4f8f" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="sphere-vignette" cx="50%" cy="50%">
              <stop offset="0%" stopColor="#00000000" />
              <stop offset="62%" stopColor="#02061100" />
              <stop offset="82%" stopColor="#01040c96" />
              <stop offset="100%" stopColor="#000209d6" />
            </radialGradient>
          </defs>

          <rect width={size.width} height={size.height} fill="url(#sphere-vignette)" />

          <ellipse
            cx={size.width / 2}
            cy={size.height / 2}
            rx={Math.min(size.width, size.height) * 0.41 * zoom}
            ry={Math.min(size.width, size.height) * 0.41 * zoom}
            fill="url(#sphere-halo)"
          />

          {edges.map((edge) => {
            const from = projected.byId[edge.source];
            const to = projected.byId[edge.target];
            if (!from || !to) {
              return null;
            }
            const active = selectedId && (edge.source === selectedId || edge.target === selectedId);
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const length = Math.hypot(dx, dy) || 1;
            const nx = -dy / length;
            const ny = dx / length;
            const q1x = from.x + dx * 0.18;
            const q1y = from.y + dy * 0.18;
            const q3x = to.x - dx * 0.18;
            const q3y = to.y - dy * 0.18;
            const nodeThickness = (active ? 2.2 : 1.45) + edge.weight * 0.3;
            const taperThickness = (active ? 0.52 : 0.32) + edge.weight * 0.1;
            const midThickness = active ? 0.18 : 0.1;
            const points = [
              `${from.x + nx * nodeThickness},${from.y + ny * nodeThickness}`,
              `${q1x + nx * taperThickness},${q1y + ny * taperThickness}`,
              `${midX + nx * midThickness},${midY + ny * midThickness}`,
              `${q3x + nx * taperThickness},${q3y + ny * taperThickness}`,
              `${to.x + nx * nodeThickness},${to.y + ny * nodeThickness}`,
              `${to.x - nx * nodeThickness},${to.y - ny * nodeThickness}`,
              `${q3x - nx * taperThickness},${q3y - ny * taperThickness}`,
              `${midX - nx * midThickness},${midY - ny * midThickness}`,
              `${q1x - nx * taperThickness},${q1y - ny * taperThickness}`,
              `${from.x - nx * nodeThickness},${from.y - ny * nodeThickness}`,
            ].join(" ");
            return (
              <polygon
                key={`${edge.source}-${edge.target}`}
                points={points}
                fill={active ? "#8fe6ff" : "#6f8db64f"}
                opacity={active ? 0.82 : 0.38}
              />
            );
          })}

          {projected.ordered.map((exercise) => {
            const selectedNode = exercise.id === selectedId;
            const radius = 4.4 + exercise.classes.length * 0.65 + exercise.depth * 0.6;
            return (
              <g key={exercise.id} transform={`translate(${exercise.x} ${exercise.y})`}>
                <circle
                  r={radius + 5}
                  className={selectedNode ? "node-halo active" : "node-halo"}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelectedId(exercise.id);
                  }}
                />
                <circle
                  r={radius}
                  className={selectedNode ? "node-core active" : "node-core"}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelectedId(exercise.id);
                  }}
                />
                <text
                  x={radius + 7}
                  y={-radius - 2}
                  className="node-uri"
                  opacity={Math.max(0.25, Math.min(0.92, exercise.depth - 0.18))}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelectedId(exercise.id);
                  }}
                >
                  {exercise.uri}
                </text>
              </g>
            );
          })}
        </svg>
      </section>

      {selected && (
        <div
          className="details-backdrop"
          onPointerDown={() => setSelectedId(null)}
        >
          <aside
            className="details-modal"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <h2>{selected.question}</h2>
            <p>
              <strong>URI:</strong> {selected.uri}
            </p>
            <p>
              <strong>Solution:</strong> {selected.answer || "n/a"}
            </p>
            <p>
              <strong>Language:</strong> {selected.language || "n/a"}
            </p>
            <p>
              <strong>Classes:</strong>
            </p>
            <div className="chips">
              {selected.classes.map((className) => (
                <span key={className} className="chip">
                  {className}
                </span>
              ))}
              {selected.classes.length === 0 && <span className="chip">unclassified</span>}
            </div>
            <p className="small">
              Connections by class: {selectedEdges.length}
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}
