import {
  followUpJsonSchema,
  followUpPlanSchema,
  lessonJsonSchema,
  lessonPlanSchema,
  type FollowUpPlan,
  type LessonPlan,
  type ResearchSource,
  type VisualObject,
} from "./lesson-schema";
import { repairAndValidateLessonPlan, BACKDROP_ROLES } from "./lesson-layout";
import { applyElkLayout } from "./elk-spatial-layout";
import { groqFetch, GroqHttpError, type GroqCallOptions } from "./groq-pool";

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

function cleanAndParseJson(raw: string): any {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }
  return JSON.parse(cleaned);
}

export { repairAndValidateLessonPlan };


export async function createLessonWithGroq(question: string, context: string, sources: ResearchSource[], options: GroqCallOptions = {}): Promise<LessonPlan> {
  const system = `You are Chalkie's visual diagram engine: openai/gpt-oss-120b. Return only the strict JSON object.

CORE MISSION: TEACH BY SHOWING REAL VISUAL DIAGRAMS — STRICT BAN ON FLOWCHARTS & LABELED BOXES!
- Learners use Chalkie because they want to SEE how things actually look and operate in real life!
- STRICTLY FORBIDDEN:
  * NEVER generate flowcharts, process flow boxes, or box-and-arrow sequences (e.g. [Step 1] -> [Step 2] -> [Step 3]).
  * NEVER generate generic rectangle cards or text boxes with names of components.
  * NEVER use shapeType: "geo" or "note" or "frame" for functional components.
  * NEVER attempt to build graphs, charts, or complex diagrams by stacking crude "geo" rectangles, lines, or circles.
  * NEVER put sentences, paragraphs, or dense explanations on the canvas. Canvas text is strictly 1-2 word anatomical/physical labels. All teaching and storytelling belong in the spoken narration segments.

CHALKIE WHITEBOARD TEACHER ARCHITECTURE:
You are Chalkie, an expert, charismatic teacher explaining complex ideas live on a digital chalkboard!
A real whiteboard teacher NEVER shows a pre-generated, static UI dashboard card or web widget (no "3 Subsystems" buttons or "Master Component" boxes).
Instead, the teacher PROGRESSIVELY DRAWS an authentic chalkboard diagram step-by-step as they speak!

CRITICAL TEACHING RULES:
1. PROGRESSIVE WHITEBOARD CONSTRUCTION (3 to 6 VISUAL OBJECTS):
   - Every lesson MUST be decomposed into 3 to 6 distinct, meaningful visual objects that represent the actual physical components, mechanisms, layers, or forces of the topic.
   - For example, for "India's Electric Double-Stack Cargo Trains":
     * Object 1 (role: "subject", label: "WAG-12 Electric Locomotive"): The 12,000 HP twin-section heavy-haul electric engine with driver cab, headlights, and high-traction steel wheel bogies.
     * Object 2 (role: "component", label: "High-Reach Pantograph & 7.5m Wire"): High-clearance pantograph arm reaching up to the 7.5m overhead catenary wire (25 kV AC).
     * Object 3 (role: "component", label: "Double-Stack Container Wagon"): Low-floor well-car flatbed carrying two 40-foot shipping containers stacked vertically (lower + upper tier).
     * Object 4 (role: "output", label: "Dedicated Freight Corridor Track"): Heavy-haul trackbed with 32.5-tonne axle load capacity, reinforced ballast, and automated signaling.
   - For physics, chemistry, biology, or computing: Draw the actual physical mechanisms (piston, cell membrane, floating gate, nucleus, orbit, etc.) with rich SVG parts!

2. SYNCHRONIZED VOICE & LASER DRAWING:
   - In 'segments', each segment MUST introduce or focus on 1 or 2 specific objects via 'targetIds'.
   - As the voiceover speaks each segment, Chalkie's laser pointer DRAWS, REVEALS, or HIGHLIGHTS that specific object on the whiteboard in real time!
   - Spoken narration pacing should be natural and engaging as the whiteboard visual evolves.
   - CRITICAL: The sequence in which objects are introduced in speech does NOT dictate spatial coordinates! Spatial placement must strictly reflect physical and scientific reality (e.g. Moon is in the middle between Sun and Earth for a solar eclipse, regardless of which body is introduced first in narration).

3. RICH WHITEBOARD PARTS (shapeType: "custom"):
   - Every object uses shapeType: "custom" with rich, authentic 'parts' (rect, ellipse, line, arrow, particles, wave, radial, container, etc.).
   - If quantitative data is needed, use shapeType: "custom-chart".
   - If a complex vector illustration is needed, use shapeType: "custom-svg".
   - STRICTLY FORBIDDEN: NEVER emit static dashboard template cards. Chalkie is a live chalkboard drawing!


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
4. PHYSICS, CHEMISTRY & SUBATOMIC PARTICLES (e.g. Atom, Laser, Battery, Quarks, Quantum):
   - Draw authentic Bohr/Quantum atomic models and subatomic particle breakdowns:
     * For "Atom Structure / Overview":
       - Object 1: Atom Overview (role: "container", label: "Atom Structure", width: 440, height: 320):
         * Nucleus Part (type: "cluster", data: "protons:6|neutrons:6", fill: "red", stroke: "blue", width: 100, height: 100, x: 170, y: 110): Dense sphere of alternating red protons (+) and blue neutrons (n).
         * 1st Shell (type: "orbit", data: "2", stroke: "slate", width: 200, height: 200, x: 120, y: 60): True circular ring with 2 rotating cyan electrons (-).
         * 2nd Shell (type: "orbit", data: "4", stroke: "slate", width: 300, height: 300, x: 70, y: 10): Outer circular ring with 4 rotating cyan electrons (-).
       - Object 2: Proton Close-up (role: "component", label: "Proton (uud)", width: 140, height: 140):
         * Outer boundary (type: "ellipse", width: 130, height: 130, x: 5, y: 5, fill: "none", stroke: "ink", strokeWidth: 2).
         * Quarks triplet (type: "quarks", data: "u,u,d", width: 120, height: 120, x: 10, y: 10): 2 Up quarks (blue, +2/3) and 1 Down quark (red, -1/3) bound by gluon springs.
       - Object 3: Neutron Close-up (role: "component", label: "Neutron (udd)", width: 140, height: 140):
         * Outer boundary (type: "ellipse", width: 130, height: 130, x: 5, y: 5, fill: "none", stroke: "ink", strokeWidth: 2).
         * Quarks triplet (type: "quarks", data: "u,d,d", width: 120, height: 120, x: 10, y: 10): 1 Up quark (blue, +2/3) and 2 Down quarks (red, -1/3) bound by gluon springs.
       - Connections: Connect Atom -> Proton and Atom -> Neutron (clean directional links).
5. QUANTITATIVE, GRAPHS & COORDINATE PLOTS (e.g. Velocity-Time, Supply & Demand, Sigmoid, Loss Curves, Phase Diagrams, Normal Distribution, Waveforms):
   - COMPLETE GRAPH MANDATE: A graph MUST ALWAYS CONTAIN BOTH:
     (1) The coordinate frame with "axes" part: (type: "axes", data: "x:Independent Variable (units)|y:Dependent Variable (units)", width: W, height: H, stroke: "ink").
     (2) The plotted mathematical curve or trajectory: (type: "path" or "polyline", stroke: "cyan" | "yellow" | "green", strokeWidth: 3).
     (3) Plotted data points or key vertices: (type: "ellipse", data: "point", width: 10, height: 10, fill: "cyan" | "yellow", text: "Point Label").
   - NEVER emit axes without plotted data curves/points! NEVER emit points without the coordinate axes! Both MUST be present!
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
7. ASTRONOMY, ORBITS, GRAVITY & CELESTIAL MECHANICS (e.g. Moon Orbit, Satellites, Newton's Cannonball, Kepler's Laws, Gravity, Planetary Motion):
   - Draw an AUTHENTIC, DYNAMIC CELESTIAL ORBIT SYSTEM, NOT disconnected flat cardboard boxes!
   - STRICT BAN: NEVER emit "gravity", "velocity", "force", "orbit", or "acceleration" as standalone rectangle cards or text boxes!
   - For "Why the Moon Doesn't Fall Into Earth" or any satellite / orbital mechanics question:
     * Emit a primary orbital mechanics visual:
       - Object 1: Moon-Earth Orbital System (role: "subject", label: "Moon-Earth Orbital Mechanics", width: 520, height: 420):
         * Primary Part: type: "orbit", data: "celestial-moon-earth", stroke: "slate", strokeWidth: 2, width: 480, height: 380, x: 20, y: 20.
           THIS SINGLE PART AUTOMATICALLY RENDERS:
           (1) Central Earth sphere with blue oceanic radial gradient, atmospheric glow halo, continents, and "Earth" label.
           (2) Dashed circular orbital trajectory ring.
           (3) Revolving Moon with lunar craters and animated CSS revolution keyframes.
           (4) Forward Tangential Velocity vector (v, cyan arrow) showing inertia.
           (5) Inward Gravitational Acceleration vector (Fg, red arrow) showing Earth's gravitational pull.
           (6) Resultant curved trajectory arc (perpetual free-fall path).
     * Optional complementary visual:
       - Object 2: Perpetual Free-Fall Balance (role: "component", label: "Perpetual Free-Fall Principle", width: 340, height: 200):
         * Inward Gravitational Pull: type: "arrow", stroke: "red", strokeWidth: 3, text: "Fg (Gravity)", x: 20, y: 50, width: 140, height: 0.
         * Forward Tangential Inertia: type: "arrow", stroke: "cyan", strokeWidth: 3, text: "v (Tangential Velocity)", x: 20, y: 110, width: 140, height: 0.
         * Free-Fall Arc: type: "wave", stroke: "yellow", strokeWidth: 2.5, text: "Curved Orbit Resultant", x: 20, y: 150, width: 280, height: 30, data: "2".
   - Synchronize audio narration segments with:
     * Segment 1: Introduce Earth and the Moon at a distance. (action: "reveal", target: "Moon-Earth Orbital Mechanics")
     * Segment 2: Explain forward tangential velocity (v) — inertia keeps the Moon moving straight ahead. (action: "focus")
     * Segment 3: Explain Earth's inward gravitational pull (Fg) — gravity constantly pulls the Moon inward. (action: "trace")
     * Segment 4: Explain perpetual free-fall — as the Moon falls toward Earth, Earth's surface curves away at the same rate, resulting in a stable closed orbit! (action: "orbit")
    - FOR SOLAR ECLIPSE (Sun, Moon, Earth Alignment):
      * Physical spatial alignment MUST BE: Sun (left) -> Moon (center) -> Earth (right)!
      * The Moon physically passes DIRECTLY BETWEEN the Sun and Earth.
      * Sunlight travels from Sun toward Moon. The Moon blocks sunlight and casts its shadow (umbra/penumbra) onto Earth!
      * Connection 1: sun -> moon (label: "sunlight", color: "yellow", arrowhead: "arrow").
      * Connection 2: moon -> earth (label: "shadow", color: "cyan", arrowhead: "arrow").
      * STRICT ERROR TO AVOID: NEVER place Earth between Sun and Moon in a solar eclipse!
    - FOR LUNAR ECLIPSE:
      * Physical spatial alignment MUST BE: Sun (left) -> Earth (center) -> Moon (right)!
      * Earth is directly between the Sun and Moon, casting Earth's shadow onto the Moon.
      * Connection 1: sun -> earth (label: "sunlight", color: "yellow", arrowhead: "arrow").
      * Connection 2: earth -> moon (label: "shadow", color: "cyan", arrowhead: "arrow").
8. MACHINE LEARNING, ARTIFICIAL INTELLIGENCE & NEURAL NETWORKS (e.g. How Neural Networks Learn, Backpropagation, Deep Learning, Perceptron):
   - Draw an AUTHENTIC LAYERED NETWORK GRAPH WITH GOVERNING MATHEMATICAL EQUATIONS:
     * Object 1 (role: "input", label: "Input Layer (X)", width: 180, height: 360):
       - Ellipse parts x₁, x₂, x₃ representing incoming numerical features (fill: "blue", stroke: "cyan").
     * Object 2 (role: "component", label: "Hidden Layer (H)", width: 200, height: 420):
       - Ellipse parts h₁, h₂, h₃, h₄ representing hidden neurons applying weighted sums and activation (fill: "violet", stroke: "violet").
     * Object 3 (role: "output", label: "Output Layer (Ŷ)", width: 180, height: 360):
       - Ellipse part ŷ representing the network's prediction (fill: "green", stroke: "green").
     * Object 4 (role: "formula", label: "Governing Learning Equations", width: 320, height: 380):
       - Rect / Text parts displaying Forward Inference: ŷ = σ(W₂ · h + b)
       - Loss function: L = ½(y - ŷ)²
       - Backpropagation Gradient: ΔW = -η · (∂L / ∂W)
   - Connections: Input Layer -> Hidden Layer (label: "weights W1"), Hidden Layer -> Output Layer (label: "weights W2"), Output Layer -> Governing Learning Equations (label: "loss feedback").
   - Synchronize segments 1-to-1:
     * Segment 1 (target: "nn-input-layer"): Explains numerical features x entering the network at the Input Layer.
     * Segment 2 (target: "nn-hidden-layer"): Explains weighted sum W₁ · x and activation fire in hidden neurons.
     * Segment 3 (target: "nn-output-layer"): Explains forward propagation outputting prediction ŷ.
     * Segment 4 (target: "nn-formula-loss"): Explains computing Loss L and backpropagating gradient ΔW to update all weights.

SPATIAL GEOMETRY & COMPOSITION (Clean, Collision-Free Digital Chalkboard):
- REALITY-FIRST GEOMETRY & SCIENTIFIC TRUTH:
  * Diagrams must reflect authentic physical and spatial arrangements in nature and engineering:
    - Solar Eclipse: Sun (left) -> Moon (middle) -> Earth (right). The Moon physically blocks light from reaching Earth.
    - Lunar Eclipse: Sun (left) -> Earth (middle) -> Moon (right). Earth casts its shadow onto the Moon.
    - Vertical Systems: Atmospheric layers (Troposphere at bottom -> Exosphere at top), Earth geology (Crust at top -> Core at bottom), Ocean depth zones, and Engine pistons MUST be stacked vertically along the Y axis, NEVER flattened horizontally!
    - Orbits: Central primary attractor with orbiting bodies positioned along orbital trajectories.
- Top-level objects MUST be separated cleanly and never overlap unless one is explicitly a container or environment enclosing its children.
- Compound Containers: Leave at least 60px of vertical clearance at the top (internal parts start at y >= 60) so the container header title badge never collides with internal elements.
- GOVERNING FORMULAS & SCIENTIFIC RELATIONS: Whenever a topic is governed by mathematical equations, physical laws, or quantitative formulas (e.g. Machine Learning / Neural Networks -> Loss function L = ½(y - ŷ)² and Weight update Δw = -η(∂L/∂w); Central Limit Theorem -> X̄ ~ N(μ, σ²/n); Newton's Gravity -> F = G(m₁m₂/r²); Ohm's Law -> V = IR; Thermodynamics -> ΔU = Q - W, etc.), ALWAYS include a dedicated formula card (role: "formula", label: "Governing Formula", width: 300, height: 90) displaying the equations with clean mathematical text parts and explanation. Place it beside or beneath the main mechanism. Write formulas in clean Unicode math or clear readable equations (e.g. "X̄ ~ N(μ, σ²/n)"). NEVER wrap formulas in LaTeX delimiters like \( or \).
- Maintain generous margins between independent objects. Never overlap distinct physical parts!
- If using an enclosure or housing backdrop (role: "container" or "environment"), make it wrap its internal parts cleanly.
- Vector parts coordinates are local to the object (x=0,y=0 top-left of object; width and height > 0). All parts MUST fit strictly within (width, height) of the parent object. NEVER draw parts that exceed the object's width or height!
- Primitive grammar in parts:
  * rect: plates, gates, chambers, layers, chips, pins, contacts.
  * ellipse: atoms, particles, charge carriers, lenses, nodes, wheels.
  * orbit: true circular electron shell orbits with cyan electrons (data: integer electron count 1-32) OR celestial orbital systems (data: "celestial-moon-earth" or "celestial") showing Earth, revolving Moon with lunar craters, tangent velocity vector (v), and inward gravity vector (Fg).
  * cluster: dense nucleon cluster with alternating red protons (+) and blue neutrons (n) (data: "protons:X|neutrons:Y" or count).
  * quarks: subatomic quark triplet in equilateral triangle with colors and fractional charges (data: "u,u,d" or "u,d,d").
  * path / polyline / polygon: cutaways, contours, channels, membranes, circuits.
  * particles: trapped electrons, gas molecules, fluid particles, photons (data: integer count 6-36).
  * wave: periodic signal, AC current, EM wave, light frequency (data: cycle count 2-12).
  * coil: spring, inductor, magnetic field, helix (data: turn count 3-16).
  * radial: gear, rotor, optical rays, turbine (data: spoke count 4-24).
  * line / arrow: force vectors, ray tracings, flow direction.
  * axes: quantitative frame with labeled X and Y axes (data: "x:Independent Variable|y:Dependent Variable"). ALWAYS pair with plotted curve (polyline/path) and key data points (ellipse with data: "point").

CONNECTIONS:
- Connections represent real physical flow, force, or data transfer.
- Keep connection labels EMPTY or strictly 1 word (e.g. "charge", "data", "tunnel"). NEVER write sentences on arrows!
- Arrowhead can be "arrow", "triangle", "dot", "diamond", or "bar".

TEACHING SEGMENTS & STRICT AUDIO-VISUAL SYNCHRONIZATION:
- Create 3-6 narration segments that explain the visual story step by step.
- CRITICAL FIDELITY RULE: What Chalkie speaks aloud MUST MATCH 100% with what is visually spotlighted on the canvas!
- The narration for each segment MUST explicitly name the target visual object's label in its 'targetIds' (e.g. if target is "Hidden Layer (H)", say: "These features flow across weighted connections into the Hidden Layer...").
- The student watches the laser pointer and camera spotlight the object WHILE hearing Chalkie speak about it. Perfect 1-to-1 alignment is mandatory!
- Actions: "reveal", "focus", "trace", "pulse", "flow", "orbit", "rotate".
- Duration: 5000 to 14000 ms per segment, matching spoken narration pacing.
- VOICE PRONUNCIATION & PACING RULES:
  * Write spoken narration in natural, warm, conversational teacher English.
  * Use deliberate breath pauses with natural punctuation (commas, periods, short rhythmic clauses).
  * Avoid unpronounceable jargon clumps or jammed abbreviations (e.g., write "25 kilovolts" or pronounce acronyms cleanly).
  * Keep sentences clear, punchy, and rhythmic so the speech engine sounds articulate and human.`;

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
      return await applyElkLayout(parsed);
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

Create 1-4 concise narration segments in teacherly causal order. The answer field is a short direct answer; segment narration is what will be spoken aloud with clear pronunciation, natural commas and breath pauses, and rhythmic teacher phrasing. Select reveal/focus/trace/move/rotate/pulse/flow/orbit only when it teaches something. In append mode, order segment targets so new geometry appears step by step while it is explained. Every target and connection endpoint must reference either an existing inventory ID or a new object ID. Keep new top-level objects separated by at least 48px and avoid connector crossings. Do not output raw tldraw records, markdown, HTML, scripts, or executable code.`;

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
