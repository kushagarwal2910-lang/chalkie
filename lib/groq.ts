import {
  followUpJsonSchema,
  followUpPlanSchema,
  lessonJsonSchema,
  lessonPlanSchema,
  type FollowUpPlan,
  type LessonPlan,
  type ResearchSource,
} from "@/lib/lesson-schema";
import { normalizeLessonLayout } from "@/lib/lesson-layout";
import { groqFetch, GroqHttpError, type GroqCallOptions } from "@/lib/groq-pool";

export const GROQ_MODEL = "openai/gpt-oss-120b";

type GroqMessage = { role: "system" | "user" | "assistant"; content: string };

async function groqRequest<T>(path: string, init: RequestInit, options: GroqCallOptions = {}): Promise<T> {
  try {
    return (await (await groqFetch(path, init, options)).json()) as T;
  } catch (error) {
    if (error instanceof GroqHttpError) {
      try {
        const parsed = JSON.parse(error.body) as { error?: { code?: string; failed_generation?: string } };
        const failed = parsed.error?.failed_generation;
        if (path === "/chat/completions" && parsed.error?.code === "json_validate_failed" && failed) {
          return { choices: [{ message: { content: failed } }] } as T;
        }
      } catch { /* use the original request error */ }
    }
    throw error;
  }
}

const detailedVisualRoles = new Set(["subject", "component", "input", "output"]);

function cleanAndParseJson(raw: string): any {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }
  return JSON.parse(cleaned);
}

const BACKDROP_ROLES = new Set(["environment", "container", "layer", "field", "path"]);

function repairAndValidateLessonPlan(plan: LessonPlan): LessonPlan {
  // 1. Ensure every visual object has at least one part (containers have their own structural chassis)
  for (const obj of plan.objects) {
    if (BACKDROP_ROLES.has(obj.role) || obj.shapeType === "frame") {
      continue;
    }
    if (!obj.parts || obj.parts.length === 0) {
      obj.parts = [{
        type: "rect",
        x: 10,
        y: 10,
        width: Math.max(40, obj.width - 20),
        height: Math.max(30, obj.height - 20),
        data: "",
        text: "",
        fill: "slate",
        stroke: "ink",
        strokeWidth: 2,
        opacity: 1,
      }];
    }
  }

  // 2. Guarantee 100% teaching coverage without fatal errors
  const taught = new Set(plan.segments.flatMap((segment) => segment.targetIds));
  const untaught = plan.objects.filter((object) => detailedVisualRoles.has(object.role) && !taught.has(object.id));
  if (untaught.length && plan.segments.length > 0) {
    const lastSegment = plan.segments[plan.segments.length - 1];
    for (const obj of untaught) {
      if (!lastSegment.targetIds.includes(obj.id)) {
        lastSegment.targetIds.push(obj.id);
      }
    }
  }

  // 3. Quantitative axes check: if quantitative and axes missing, auto-add axes part
  const strategyRequestsPlot = /\b(graph|plot|chart|coordinate system|x-axis|y-axis|axes)\b/i.test(plan.visualStrategy);
  const quantitative = plan.diagramType === "quantitative" || strategyRequestsPlot;
  if (quantitative) {
    const hasAxes = plan.objects.some((obj) => obj.parts.some((p) => p.type === "axes"));
    if (!hasAxes && plan.objects.length > 0) {
      plan.objects[0].parts.unshift({
        type: "axes",
        x: 10,
        y: 10,
        width: Math.max(80, plan.objects[0].width - 20),
        height: Math.max(60, plan.objects[0].height - 20),
        data: "x:Time|y:Value",
        text: "",
        fill: "none",
        stroke: "ink",
        strokeWidth: 2,
        opacity: 1,
      });
    }
  }

  return plan;
}

export async function createLessonWithGroq(question: string, context: string, sources: ResearchSource[], options: GroqCallOptions = {}): Promise<LessonPlan> {
  const system = `You are Chalkie's visual diagram engine: openai/gpt-oss-120b. Return only the strict JSON object.

CORE MISSION: TEACH BY SHOWING REAL VISUAL DIAGRAMS — STRICT BAN ON FLOWCHARTS & LABELED BOXES!
- Learners use Chalkie because they want to SEE how things actually look and operate in real life!
- STRICTLY FORBIDDEN:
  * NEVER generate flowcharts, process flow boxes, or box-and-arrow sequences (e.g. [Step 1] -> [Step 2] -> [Step 3]).
  * NEVER generate generic rectangle cards or text boxes with names of components.
  * NEVER use shapeType: "geo" or "note" or "frame" for functional components. Use shapeType: "custom" for ALL visual objects, composed with expressive vector parts.
  * NEVER put sentences, paragraphs, or dense explanations on the canvas. Canvas text is strictly 1-2 word anatomical/physical labels (e.g. "Control Gate", "Floating Gate", "Tunnel Oxide", "Trapped Electrons", "Gold Pins"). All teaching and storytelling belong in the spoken narration segments.

VISUAL PARADIGM BY DOMAIN (WHAT TO DRAW):
1. HARDWARE, ELECTRONICS & COMPUTING (e.g. Flash Drive, SSD, CPU, RAM, GPU, Transistor):
   - Draw an EXPLAINER CUTAWAY showing BOTH the macro device and the magnified microscopic mechanism!
   - For example, for "How a Pendrive / Flash Drive Stores Data":
     * Object 1: USB Plug & Housing (rect chassis with silver fill, 4 gold contact pin strips rect/line with fill "yellow", circuit board line traces).
     * Object 2: Controller Microchip (dark silicon rect with pin leads polyline, bus lines).
     * Object 3: Magnified Floating-Gate Transistor Cell:
       - Control Gate: top metallic electrode rect (fill: "slate", stroke: "ink").
       - Interpoly Dielectric: insulating barrier rect (fill: "violet" with 0.3 opacity).
       - Floating Gate: the charge trap conductive plate rect (fill: "cyan" with 0.5 opacity, stroke: "blue").
       - Tunnel Oxide: bottom thin insulator layer rect (fill: "orange" with 0.2 opacity).
       - Silicon Substrate Base: source & drain p-well rect (fill: "slate", stroke: "ink").
     * Object 4: Trapped Electrons: inside the floating gate! Use type: "particles" with count 16-24 (fill: "cyan", stroke: "blue") representing trapped negative charge!
     * Object 5: Tunneling Pulse / Voltage Arc: high-voltage injection path or wave injecting charge through the oxide barrier into the floating gate (stroke: "cyan" | "violet", strokeWidth: 3).
   - For a CPU: Draw the ALU with adder/shifter circuits, register bit grid, instruction decoder, and clock pulse wave!
2. MECHANICS, ENGINES & PHYSICAL SYSTEMS (e.g. Car Engine, Hydraulics, Rockets, Turbines):
   - Draw cutaway chambers (rect/polygon), piston head with compression rings, wrist pin and connecting rod, intake/exhaust valves (polygon/polyline), spark plug arc (path/wave), and fuel/fluid particle fields (particles)!
3. BIOLOGY, ANATOMY & MEDICINE (e.g. Heart, Neuron, Vaccine, Virus, DNA):
   - Draw anatomical organ cutaways, cell lipid bilayer membranes, receptor protein pockets, Y-shaped antibodies, or synaptic terminal vesicles with neurotransmitter particles!
4. PHYSICS & CHEMISTRY (e.g. Atom, Laser, Battery, Greenhouse, Quantum):
   - Draw nucleus with orbital shells (ellipse), photon wave packets (wave), electrolyte ions (particles), cathode/anode plates!
5. QUANTITATIVE & ECONOMICS (e.g. Supply & Demand, Velocity, Thermodynamics):
   - Draw complete coordinate frame with "axes" primitive (data: "x:Label|y:Label"), smooth plotted curves (path/polyline), equilibrium points (ellipse), and shift arrows!
6. URBAN PLANNING, ARCHITECTURE, CIVILIZATIONS & ANCIENT HISTORY (e.g. Indus Valley, Roman Aqueduct, Mohenjo-Daro, Pyramids, Grid Cities):
   - Draw an AUTHENTIC UNIFIED ARCHITECTURAL PLAN, NOT disconnected empty boxes!
   - For Indus Valley City Planning:
     * Zone 1 (West - Elevated Citadel Platform):
       - Mud-brick retaining platform/bastion (polygon/rect with slate fill).
       - The Great Bath (rect with blue/cyan water fill, stepped access ledges rect on north/south).
       - Granary structure with ventilated air ducts (rect with orange/terracotta fill).
     * Zone 2 (East - Lower Town Residential Grid):
       - Orthogonal Street Grid: Broad North-South main boulevard and East-West cross streets intersecting at crisp 90-degree right angles (lines/rects).
       - Courtyard Houses: Clustered brick houses with central open courtyards and private well rooms (circle/rect).
       - Advanced Covered Drainage Network: Baked-brick drain channels running alongside street curbs, with inspection traps and soak pits!
   - Compose the entire city layout as a single harmonious plan with West Citadel and East Lower Town side-by-side, fitting cleanly within 1000x600 total canvas!

SPATIAL GEOMETRY & COMPOSITION (1000x620 Bounded Presentation Canvas):
- Maximum total canvas bounds for all objects combined MUST fit within x ≈ 60..1020, y ≈ 60..640!
- NEVER scatter 3 huge containers horizontally side-by-side that blow out past 1020px width!
- If dividing into zones, use at most 2 side-by-side primary columns (e.g. Left Zone x ≈ 80..480, Right Zone x ≈ 520..980).
- Maintain at least 32px margin between independent objects. Never overlap distinct physical parts!
- If using an enclosure or housing backdrop (role: "container" or "environment"), make it wrap its internal parts cleanly.
- Vector parts coordinates are local to the object (x=0,y=0 top-left of object; width and height > 0). All parts MUST fit strictly within (width, height) of the parent object. NEVER draw parts that exceed the object's width or height!
- Primitive grammar in parts:
  * rect: plates, gates, chambers, layers, chips, pins, contacts.
  * ellipse: atoms, particles, charge carriers, lenses, nodes, wheels.
  * path / polyline / polygon: cutaways, contours, channels, membranes, circuits.
  * particles: trapped electrons, gas molecules, fluid particles, photons (data: integer count 6-36).
  * wave: periodic signal, AC current, EM wave, light frequency (data: cycle count 2-12).
  * coil: spring, inductor, magnetic field, helix (data: turn count 3-16).
  * radial: gear, rotor, optical rays, turbine (data: spoke count 4-24).
  * line / arrow: force vectors, ray tracings, flow direction.
  * axes: quantitative frame (data: "x:Variable|y:Variable").

CONNECTIONS:
- Connections represent real physical flow, force, or data transfer.
- Keep connection labels EMPTY or strictly 1 word (e.g. "charge", "data", "tunnel"). NEVER write sentences on arrows!
- Arrowhead can be "arrow", "triangle", "dot", "diamond", or "bar".

TEACHING SEGMENTS & HIGH-PRECISION AUDIO SYNCHRONIZATION:
- Create 3-6 narration segments that explain the visual story step by step.
- Mention the target object's label naturally in the narration text (e.g. "Inside the floating gate, electrons are trapped..."). This allows the live laser pointer and camera to highlight the exact visual in perfect synchronization with the spoken voice!
- Actions: "reveal", "focus", "trace", "pulse", "flow", "orbit", "rotate".
- Duration: 5000 to 14000 ms per segment, matching spoken narration pacing.`;

  const messages: GroqMessage[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: `Question: ${question}\n\nRanked evidence:\n${context}\n\nSource metadata:\n${JSON.stringify(
        sources.slice(0, 6).map(({ id, title, publisher }) => ({ id, title, publisher })),
      )}`,
    },
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await groqRequest<{ choices: Array<{ message: { content: string } }> }>("/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: attempt === 0 ? messages : [...messages, { role: "user" as const, content: `Retry with a compact but complete scene. Correct this validation problem: ${lastError instanceof Error ? lastError.message : "the first scene was incomplete"}. Include every required top-level array, especially connections and segments, and finish the JSON.` }],
        temperature: attempt === 0 ? 0.25 : 0.1,
        max_completion_tokens: attempt === 0 ? 3800 : 4200,
        reasoning_effort: "low",
        response_format: { type: "json_schema", json_schema: lessonJsonSchema },
      }),
    }, options);

    const raw = result.choices[0]?.message.content;
    if (!raw) {
      lastError = new Error("Groq returned an empty lesson");
      continue;
    }
    try {
      const json = cleanAndParseJson(raw);
      const parsed = lessonPlanSchema.parse(json);
      const repaired = repairAndValidateLessonPlan(parsed);
      return normalizeLessonLayout(repaired);
    } catch (error) {
      lastError = error;
      console.warn(`[chalkie] invalid scene graph attempt ${attempt + 1}`, error);
    }
  }
  console.error("[chalkie] invalid scene graph", lastError);
  throw new Error("The visual plan was incomplete. Please try the question again.");
}

export async function createFollowUpWithGroq(question: string, context: string, sources: ResearchSource[], currentLesson: LessonPlan, options: GroqCallOptions = {}): Promise<FollowUpPlan> {
  const system = `You are Chalkie's conversational visual teacher, running as openai/gpt-oss-120b. Return only the strict JSON object.

The learner is asking a follow-up about an existing infinite whiteboard. Answer only from the supplied ranked evidence. First inspect the existing visual inventory and decide whether it already contains enough geometry to teach the answer.

DECISION PROTOCOL (COVERAGE):
1. EXISTING VISUAL ON CANVAS (coverage: "existing"):
   - If the learner's doubt relates to an idea, component, stage, or relationship already present on the whiteboard (e.g. "What does Decode do?", "Why does the arrow point back to Fetch?", "What is the Control Unit?"):
   - Set coverage to "existing".
   - Set objects and connections to EMPTY ARRAYS ([]).
   - Set targetIds to the exact existing object ID(s).
   - In segments, create 1-3 spoken narration segments with action: "focus" or "trace" pointing to those existing shape IDs.
   - The live laser pointer and camera will fly directly to those existing objects, spotlight them, and explain the answer while the student listens!

2. NEW EXTENSION FROM RAG CONTEXT (coverage: "append"):
   - If the learner asks about a concept NOT yet drawn on the whiteboard (e.g. "What about cache memory?", "How does pipelining handle branch hazards?"):
   - Set coverage to "append".
   - Create only the missing visual extension (2-4 objects, 1-3 connections).
   - Use shapeType: "custom" (for realistic cutaways, schematics, and diagrams built with vector parts). NEVER use flowchart boxes or generic rectangles!
   - Connect the new extension back to a relevant existing object by referencing its existing ID in connection from/to.
   - Design the extension with clean, non-overlapping coordinates in local 1160x700 space.
   - The application will place the new extension beside the lesson on tldraw's infinite whiteboard, pan the camera over, and guide the student through the new visual using the laser pointer and audio narration!

Preserve the same rich vector grammar and teaching standard as the original scene:
- Canvas text must be strictly minimal: 1-2 word labels (e.g. "L1 Cache", "Data Bus"). Absolutely no paragraph text on the whiteboard! Storytelling and intuition belong in spoken narration.
- Ensure all physical structures and components have high-contrast visible outlines (stroke: "ink" | "slate" | "blue", strokeWidth: 2-4) and clear fills—never use white or invisible borders on the white canvas.

Part coordinates are local to each object. line/arrow width and height are endpoint deltas. polygon/polyline data contains numeric point pairs. path data uses only SVG M/L/H/V/C/S/Q/T/A/Z commands and numbers. radial, coil, wave, and particles use an integer count in data. For a quantitative graph, use one axes part with data exactly like "x:Time (seconds)|y:Velocity (m/s)", keep every plot mark inside its reserved plotting rectangle, use meaningful axis names, and set that object's labelPlacement to none. Every part includes every required field even when irrelevant.

Create 1-4 concise narration segments in teacherly causal order. The answer field is a short direct answer; segment narration is what will be spoken aloud. Select reveal/focus/trace/move/rotate/pulse/flow/orbit only when it teaches something. In append mode, order segment targets so new geometry appears step by step while it is explained. Every target and connection endpoint must reference either an existing inventory ID or a new object ID. Keep new top-level objects separated by at least 48px and avoid connector crossings. Do not output raw tldraw records, markdown, HTML, scripts, or executable code.`;

  const inventory = currentLesson.objects.slice(-60).map(({ id, label, role, x, y, width, height }) => ({ id, label, role, x, y, width, height }));
  const baseMessages: GroqMessage[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: `Original question: ${currentLesson.question}\nCurrent lesson summary: ${currentLesson.summary}\nCurrent visual strategy: ${currentLesson.visualStrategy}\n\nExisting visual inventory:\n${JSON.stringify(inventory)}\n\nFollow-up question: ${question}\n\nRanked evidence from the original research index:\n${context || "No stored passage was available; be explicit about uncertainty and use only the current lesson."}\n\nAvailable sources:\n${JSON.stringify(sources.slice(0, 12).map(({ id, title, publisher, score }) => ({ id, title, publisher, score })))}`,
    },
  ];
  const existingIds = new Set(currentLesson.objects.map((object) => object.id));
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await groqRequest<{ choices: Array<{ message: { content: string } }> }>("/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: attempt === 0 ? 0.2 : 0.1,
        max_completion_tokens: attempt === 0 ? 2200 : 2600,
        reasoning_effort: "low",
        messages: attempt === 0 ? baseMessages : [...baseMessages, {
          role: "user" as const,
          content: `Retry the extension as a real explanatory drawing, not labeled placeholder geometry. Correct this validation problem: ${lastError instanceof Error ? lastError.message : "the first extension was incomplete"}. Every physical subject/component/input/output must use at least three purposeful vector parts, and every new object must appear in the teaching segments.`,
        }],
        response_format: { type: "json_schema", json_schema: followUpJsonSchema },
      }),
    }, options);

    const raw = result.choices[0]?.message.content;
    if (!raw) {
      lastError = new Error("Groq returned an empty follow-up");
      continue;
    }
    try {
      const json = cleanAndParseJson(raw);
      const parsed = followUpPlanSchema.parse(json);
      const coverage = parsed.coverage === "append" && parsed.objects.length ? "append" : "existing";
      if (coverage === "append") {
        for (const obj of parsed.objects) {
          if (BACKDROP_ROLES.has(obj.role) || obj.shapeType === "frame") continue;
          if (!obj.parts || obj.parts.length === 0) {
            obj.parts = [{
              type: "rect",
              x: 10,
              y: 10,
              width: Math.max(40, obj.width - 20),
              height: Math.max(30, obj.height - 20),
              data: "",
              text: "",
              fill: "slate",
              stroke: "ink",
              strokeWidth: 2,
              opacity: 1,
            }];
          }
        }
        const narratedIds = new Set(parsed.segments.flatMap((segment) => segment.targetIds));
        const untaught = parsed.objects.filter((object) => !narratedIds.has(object.id));
        if (untaught.length && parsed.segments.length > 0) {
          const lastSegment = parsed.segments[parsed.segments.length - 1];
          for (const obj of untaught) {
            if (!lastSegment.targetIds.includes(obj.id)) {
              lastSegment.targetIds.push(obj.id);
            }
          }
        }
      }

      const newIds = new Set(parsed.objects.map((object) => object.id));
      const allowed = new Set([...existingIds, ...newIds]);
      const fallback = parsed.objects[0]?.id ?? currentLesson.objects[0]?.id;
      const targetIds = parsed.targetIds.filter((id) => allowed.has(id));
      return {
        ...parsed,
        coverage,
        objects: coverage === "existing" ? [] : parsed.objects,
        connections: coverage === "existing" ? [] : parsed.connections.filter((connection) => allowed.has(connection.from) && allowed.has(connection.to) && connection.from !== connection.to),
        targetIds: targetIds.length ? targetIds : fallback ? [fallback] : parsed.targetIds,
        segments: parsed.segments.map((segment) => {
          const validTargets = segment.targetIds.filter((id) => allowed.has(id));
          return { ...segment, targetIds: validTargets.length ? validTargets : targetIds.length ? targetIds : fallback ? [fallback] : segment.targetIds };
        }),
      };
    } catch (error) {
      lastError = error;
      console.warn(`[chalkie] invalid follow-up attempt ${attempt + 1}`, error);
    }
  }
  console.error("[chalkie] invalid follow-up plan", lastError);
  throw new Error("The follow-up explanation was incomplete. Please ask again.");
}

export async function rerankWithGroq(question: string, candidates: Array<{ id: string; title: string; text: string }>, options: GroqCallOptions = {}): Promise<string[]> {
  if (candidates.length < 2) return candidates.map((candidate) => candidate.id);

  try {
    const result = await groqRequest<{ choices: Array<{ message: { content: string } }> }>("/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        max_completion_tokens: 500,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: "Rank evidence by how directly it helps answer the user's exact question. Return JSON only." },
          { role: "user", content: JSON.stringify({ question, candidates }) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ranked_evidence",
            strict: true,
            schema: { type: "object", additionalProperties: false, required: ["ids"], properties: { ids: { type: "array", items: { type: "string" } } } },
          },
        },
      }),
    }, { ...options, timeoutMs: 45000 });
    const ids = JSON.parse(result.choices[0]?.message.content ?? "{}") as { ids?: string[] };
    const allowed = new Set(candidates.map((candidate) => candidate.id));
    const ranked = (ids.ids ?? []).filter((id) => allowed.has(id));
    return [...ranked, ...candidates.map((candidate) => candidate.id).filter((id) => !ranked.includes(id))];
  } catch {
    return candidates.map((candidate) => candidate.id);
  }
}
