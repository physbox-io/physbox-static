/* ==========================================================================
   physbox.io - Modern Landing Page Interactive Script
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  
  // 1. Header Shrinking & Glassmorphism on Scroll
  const header = document.getElementById('main-header');
  
  const handleScroll = () => {
    if (window.scrollY > 20) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };
  
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll(); // Run once in case page loads scrolled down


  // 2. Scroll Reveal Animations (Intersection Observer)
  const revealElements = document.querySelectorAll('.reveal');
  
  if ('IntersectionObserver' in window) {
    const observerOptions = {
      root: null, // Viewport
      threshold: 0.10, // Trigger when 10% of element is visible
      rootMargin: '0px 0px -40px 0px' // Slightly offset trigger
    };
    
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          // Once animated, we don't need to track it anymore
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);
    
    revealElements.forEach(el => revealObserver.observe(el));
  } else {
    // Fallback for older browsers
    revealElements.forEach(el => el.classList.add('active'));
  }


  // 3. Interactive Scientific Simulator Background Canvas
  const canvas = document.getElementById('canvas-bg');
  const ctx = canvas.getContext('2d');
  
  let isMobile = false;
  let mouse = { x: null, y: null, radius: 150 };
  
  // Custom theme colors matching products
  const colors = {
    violet: 'rgba(139, 92, 246, 0.45)', // Primary
    green: '#10b981',                   // Circuit (Emerald)
    cyan: '#06b6d4',                    // Physics (Teal)
    pink: '#ec4899'                     // Process (Magenta)
  };
  
  // Simulation Entities arrays
  let circuitNodes = [];
  let currentPackets = [];
  let physicsLinks = [];
  let caGrid = [];
  const caRows = 16;
  const caCols = 28;
  let caUpdateTimer = 0;
  
  const resizeCanvas = () => {
    isMobile = window.innerWidth < 768;
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    
    ctx.scale(dpr, dpr);
    
    initSimulationBackground();
  };
  
  // Initialize thematic entities
  const initSimulationBackground = () => {
    circuitNodes = [];
    currentPackets = [];
    physicsLinks = [];
    caGrid = [];
    
    const scaleFactor = isMobile ? 0.45 : 1;
    
    // A. Initialize Circuit Nodes and Components (Emerald Green)
    const nodeCount = Math.floor(40 * scaleFactor);
    const componentTypes = ['R', 'C', 'L', 'D', 'T', 'NODE'];
    
    for (let i = 0; i < nodeCount; i++) {
      circuitNodes.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        radius: Math.random() * 2 + 1,
        type: componentTypes[Math.floor(Math.random() * componentTypes.length)],
        connections: []
      });
    }
    
    // Establish logical circuit wires (connections) based on proximity
    for (let i = 0; i < circuitNodes.length; i++) {
      for (let j = i + 1; j < circuitNodes.length; j++) {
        const dx = circuitNodes[i].x - circuitNodes[j].x;
        const dy = circuitNodes[i].y - circuitNodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 140 && circuitNodes[i].connections.length < 2) {
          circuitNodes[i].connections.push(j);
          // Spawn electrical current packet moving along this connection
          currentPackets.push({
            from: i,
            to: j,
            progress: Math.random(),
            speed: (Math.random() * 0.0025 + 0.0015)
          });
        }
      }
    }
    
    // B. Initialize Physics Double Pendulums (Teal/Cyan)
    // These are genuinely integrated - see rk4Pendulum() below. State is
    // [theta1, theta2, omega1, omega2]; lengths are in pixels, treated as metres
    // scaled by GRAVITY so the motion reads well at screen scale.
    const linkCount = Math.floor(4 * scaleFactor);
    for (let i = 0; i < linkCount; i++) {
      const link = {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        // Start near the top so there is real potential energy to convert
        state: [
          Math.PI * (0.55 + Math.random() * 0.5),
          Math.PI * (0.55 + Math.random() * 0.5),
          0,
          0
        ],
        len1: Math.random() * 30 + 40,
        len2: Math.random() * 25 + 30,
        m1: 1.0,
        m2: 1.0
      };
      link.E0 = pendulumEnergy(link);
      physicsLinks.push(link);
    }
    
    // C. Initialize Cellular Automata Forest Grid (Wildfire Spreader)
    for (let r = 0; r < caRows; r++) {
      caGrid[r] = [];
      for (let c = 0; c < caCols; c++) {
        caGrid[r][c] = {
          state: 0, // 0 = unburned tree, 1 = ignited/burning, 2 = glowing embers, 3 = ash
          intensity: 0 // glow brightness multiplier
        };
      }
    }
    // Spark a few cellular nodes initially
    for (let i = 0; i < 4; i++) {
      const r = Math.floor(Math.random() * caRows);
      const c = Math.floor(Math.random() * caCols);
      caGrid[r][c].state = 1;
      caGrid[r][c].intensity = 1.0;
    }
  };
  
  // --------------------------------------------------------------------------
  // Real solvers driving the background. Nothing here is faked: the pendulums
  // obey the Lagrangian equations of motion and the RLC obeys Kirchhoff, both
  // stepped with classical 4th-order Runge-Kutta.
  // --------------------------------------------------------------------------

  const GRAVITY = 320;           // px/s^2 - gravity at screen scale
  const PENDULUM_DT = 0.004;     // 4 ms fixed step
  const PENDULUM_SUBSTEPS = 4;   // ~16 ms of sim per animation frame
  // 1.5 solver steps per frame (~5.6 s for the trace to cross the screen).
  // Fractional, so an accumulator carries the remainder between frames rather
  // than rounding the playback rate up to a whole step.
  const RLC_STEPS_PER_FRAME = 1.5;
  let rlcStepAccum = 0;

  // Telemetry accumulators read by the hero readout
  let energyDriftSum = 0;
  let energyDriftCount = 0;
  let fpsFrames = 0;
  let fpsLast = performance.now();
  let fpsValue = 0;

  // Double pendulum equations of motion.
  // y = [t1, t2, w1, w2] -> dy/dt. Standard Lagrangian derivation for two
  // point masses on massless rods.
  const pendulumDerivs = (link, y) => {
    const [t1, t2, w1, w2] = y;
    const { len1: L1, len2: L2, m1, m2 } = link;

    const d = t1 - t2;
    const sd = Math.sin(d);
    const cd = Math.cos(d);
    const denom = 2 * m1 + m2 - m2 * Math.cos(2 * d);

    const a1 = (-GRAVITY * (2 * m1 + m2) * Math.sin(t1)
      - m2 * GRAVITY * Math.sin(t1 - 2 * t2)
      - 2 * sd * m2 * (w2 * w2 * L2 + w1 * w1 * L1 * cd)) / (L1 * denom);

    const a2 = (2 * sd * (w1 * w1 * L1 * (m1 + m2)
      + GRAVITY * (m1 + m2) * Math.cos(t1)
      + w2 * w2 * L2 * m2 * cd)) / (L2 * denom);

    return [w1, w2, a1, a2];
  };

  // Classical RK4 step
  const rk4Pendulum = (link, dt) => {
    const y = link.state;
    const add = (a, b, s) => a.map((v, i) => v + b[i] * s);

    const k1 = pendulumDerivs(link, y);
    const k2 = pendulumDerivs(link, add(y, k1, dt / 2));
    const k3 = pendulumDerivs(link, add(y, k2, dt / 2));
    const k4 = pendulumDerivs(link, add(y, k3, dt));

    for (let i = 0; i < 4; i++) {
      y[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
  };

  // Total mechanical energy (kinetic + potential). A good integrator keeps this
  // near-constant; the drift we report is the real accumulated error.
  const pendulumEnergy = (link) => {
    const [t1, t2, w1, w2] = link.state;
    const { len1: L1, len2: L2, m1, m2 } = link;

    const T = 0.5 * m1 * L1 * L1 * w1 * w1
      + 0.5 * m2 * (L1 * L1 * w1 * w1 + L2 * L2 * w2 * w2
        + 2 * L1 * L2 * w1 * w2 * Math.cos(t1 - t2));
    const V = -(m1 + m2) * GRAVITY * L1 * Math.cos(t1) - m2 * GRAVITY * L2 * Math.cos(t2);

    return T + V;
  };

  // --- Series RLC transient (the same class of problem Volt hands to Ngspice) --
  // L*di/dt = Vin - R*i - Vc  ;  C*dVc/dt = i
  // Tuned for a calm, legible trace: f0 ~ 700 Hz, zeta ~ 0.35. Still clearly
  // underdamped so each square-wave edge rings, but the ringing is broad
  // (~29 samples per cycle) and settles rather than buzzing.
  const rlc = {
    R: 62,           // ohms
    L: 0.02,         // henries
    C: 2.585e-6,     // farads
    vc: 0,           // capacitor voltage
    i: 0,            // inductor current
    t: 0,
    dt: 1 / 20000,   // 50 us fixed step
    trace: [],       // recent Vc samples for the scrolling waveform
    maxTrace: 500    // 25 ms window at one sample per step
  };

  // Square-wave excitation, 60 Hz, 0-5V - the classic step-response test
  const rlcSource = (t) => (Math.sin(2 * Math.PI * 60 * t) >= 0 ? 5 : 0);

  const rlcDerivs = (t, vc, i) => [
    (rlcSource(t) - rlc.R * i - vc) / rlc.L,  // di/dt
    i / rlc.C                                  // dvc/dt
  ];

  const stepRLC = (steps) => {
    const h = rlc.dt;
    for (let n = 0; n < steps; n++) {
      const { t, vc, i } = rlc;

      const [di1, dv1] = rlcDerivs(t, vc, i);
      const [di2, dv2] = rlcDerivs(t + h / 2, vc + dv1 * h / 2, i + di1 * h / 2);
      const [di3, dv3] = rlcDerivs(t + h / 2, vc + dv2 * h / 2, i + di2 * h / 2);
      const [di4, dv4] = rlcDerivs(t + h, vc + dv3 * h, i + di3 * h);

      rlc.i += (h / 6) * (di1 + 2 * di2 + 2 * di3 + di4);
      rlc.vc += (h / 6) * (dv1 + 2 * dv2 + 2 * dv3 + dv4);
      rlc.t += h;

      // One trace sample per solver step - at 700 Hz ringing that is ~29
      // samples per cycle, so the waveform reads cleanly instead of aliasing.
      rlc.trace.push(rlc.vc);
    }

    if (rlc.trace.length > rlc.maxTrace) {
      rlc.trace.splice(0, rlc.trace.length - rlc.maxTrace);
    }
  };

  // Update Cellular Automata Grid rules (Process wildfires)
  const updateCellularAutomata = () => {
    let nextGrid = [];
    for (let r = 0; r < caRows; r++) {
      nextGrid[r] = [];
      for (let c = 0; c < caCols; c++) {
        nextGrid[r][c] = { ...caGrid[r][c] };
      }
    }
    
    const probSpread = isMobile ? 0.04 : 0.08;
    
    for (let r = 0; r < caRows; r++) {
      for (let c = 0; c < caCols; c++) {
        const cell = caGrid[r][c];
        
        if (cell.state === 1) { // If cell is currently burning
          // Ignite neighbors
          const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
          dirs.forEach(([dr, dc]) => {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < caRows && nc >= 0 && nc < caCols) {
              if (caGrid[nr][nc].state === 0 && Math.random() < probSpread) {
                nextGrid[nr][nc].state = 1;
                nextGrid[nr][nc].intensity = 1.0;
              }
            }
          });
          
          // Transition this cell to cooling embers
          nextGrid[r][c].state = 2;
        } else if (cell.state === 2) { // Cooling embers
          nextGrid[r][c].intensity -= 0.04;
          if (nextGrid[r][c].intensity <= 0.1) {
            nextGrid[r][c].state = 3; // Burned out / dead ash
            nextGrid[r][c].intensity = 0;
          }
        } else if (cell.state === 3) {
          // Slowly recover tree state over time (forest regrowth model)
          if (Math.random() < 0.002) {
            nextGrid[r][c].state = 0;
          }
        } else if (cell.state === 0) {
          // Occasionally spark tree spontaneously (lightning strike)
          if (Math.random() < 0.0001) {
            nextGrid[r][c].state = 1;
            nextGrid[r][c].intensity = 1.0;
          }
        }
      }
    }
    
    caGrid = nextGrid;
  };
  
  // Draw the live RLC transient as a faint scrolling trace along the base of
  // the viewport. This is the actual solver output, not a decorative sine.
  const drawRLCTrace = () => {
    if (rlc.trace.length < 2) return;

    const h = window.innerHeight;
    const w = window.innerWidth;
    const baseY = h * 0.86;
    const amp = Math.min(h * 0.09, 70);
    const step = w / (rlc.maxTrace - 1);

    ctx.save();
    ctx.beginPath();
    rlc.trace.forEach((v, idx) => {
      // Vc swings roughly 0-7V on this square-wave drive; normalise about 2.5V
      const x = idx * step;
      const y = baseY - ((v - 2.5) / 5) * amp;
      idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(16, 185, 129, 0.5)';
    ctx.shadowBlur = 6;
    ctx.stroke();

    // Leading probe dot at the newest sample
    const lastY = baseY - ((rlc.trace[rlc.trace.length - 1] - 2.5) / 5) * amp;
    ctx.beginPath();
    ctx.arc((rlc.trace.length - 1) * step, lastY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.7)';
    ctx.fill();
    ctx.restore();
  };

  // Push solver state into the hero readout (throttled to ~4 Hz so the
  // numbers stay legible rather than strobing)
  const liveEnergyEl = document.getElementById('live-energy');
  const liveVcEl = document.getElementById('live-vc');
  const liveFpsEl = document.getElementById('live-fps');
  let telemetryLast = 0;

  const updateTelemetry = (now) => {
    // Rolling FPS
    fpsFrames++;
    if (now - fpsLast >= 500) {
      fpsValue = Math.round((fpsFrames * 1000) / (now - fpsLast));
      fpsFrames = 0;
      fpsLast = now;
    }

    if (now - telemetryLast < 250) return;
    telemetryLast = now;

    if (liveEnergyEl && energyDriftCount > 0) {
      const drift = (energyDriftSum / energyDriftCount) * 100;
      liveEnergyEl.textContent = `${drift < 0.01 ? '<0.01' : drift.toFixed(2)}%`;
    }
    if (liveVcEl) liveVcEl.textContent = `${rlc.vc.toFixed(2)} V`;
    if (liveFpsEl && fpsValue) liveFpsEl.textContent = String(fpsValue);

    energyDriftSum = 0;
    energyDriftCount = 0;
  };

  // Animation/Update loop
  const animate = (now = performance.now()) => {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    const scaleFactor = isMobile ? 0.6 : 1.0;

    // Advance the circuit solver and draw its trace
    rlcStepAccum += RLC_STEPS_PER_FRAME;
    const rlcSteps = Math.floor(rlcStepAccum);
    rlcStepAccum -= rlcSteps;
    if (rlcSteps > 0) stepRLC(rlcSteps);
    drawRLCTrace();

    // ----------------------------------------------------------------------
    // 1. Draw Process Grid (Cellular Automata Wildfires)
    // ----------------------------------------------------------------------
    caUpdateTimer++;
    if (caUpdateTimer >= 12) { // Slow speed for organic forest fires
      updateCellularAutomata();
      caUpdateTimer = 0;
    }
    
    const cellW = window.innerWidth / caCols;
    const cellH = window.innerHeight / caRows;
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.01)';
    ctx.lineWidth = 0.5;
    
    for (let r = 0; r < caRows; r++) {
      for (let c = 0; c < caCols; c++) {
        const cell = caGrid[r][c];
        
        // Faintly draw grid lines
        ctx.strokeRect(c * cellW, r * cellH, cellW, cellH);
        
        if (cell.state > 0 && cell.intensity > 0) {
          // Draw soft glowing wildfire cell
          ctx.fillStyle = `rgba(236, 72, 153, ${cell.intensity * 0.045})`; // Soft Magenta
          ctx.fillRect(c * cellW + 1, r * cellH + 1, cellW - 2, cellH - 2);
          
          if (cell.state === 1) {
            ctx.fillStyle = `rgba(251, 146, 60, ${cell.intensity * 0.08})`; // Orange core fire
            ctx.fillRect(c * cellW + cellW/3, r * cellH + cellH/3, cellW/3, cellH/3);
          }
        }
      }
    }
    
    // ----------------------------------------------------------------------
    // 2. Draw Circuit Wires and Nodes (Emerald Green)
    // ----------------------------------------------------------------------
    circuitNodes.forEach(node => {
      // Gentle drift
      node.x += node.vx;
      node.y += node.vy;
      
      // Screen wrap
      if (node.x < -20) node.x = window.innerWidth + 20;
      if (node.x > window.innerWidth + 20) node.x = -20;
      if (node.y < -20) node.y = window.innerHeight + 20;
      if (node.y > window.innerHeight + 20) node.y = -20;
      
      // Interaction with cursor
      if (mouse.x !== null && mouse.y !== null) {
        const dx = mouse.x - node.x;
        const dy = mouse.y - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < mouse.radius) {
          // Gentle drift towards cursor
          const force = (mouse.radius - dist) / mouse.radius;
          node.x += (dx / dist) * force * 0.2;
          node.y += (dy / dist) * force * 0.2;
        }
      }
      
      // Draw Node
      if (node.type === 'NODE') {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      } else {
        // Draw beautiful miniature schematic component (R, C, L, or D)
        ctx.save();
        ctx.translate(node.x, node.y);
        
        // Subtle background boundary circle for the component housing
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.03)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.12)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        
        // Neon green stroke for the schematic symbol
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.75)';
        ctx.lineWidth = 1.0;
        ctx.lineJoin = 'miter';
        ctx.lineCap = 'butt';
        
        if (node.type === 'R') {
          // Resistor: High-fidelity zigzag path
          ctx.beginPath();
          ctx.moveTo(-10, 0);
          ctx.lineTo(-6, 0);   // Left lead
          ctx.lineTo(-4.5, -3.5);
          ctx.lineTo(-2.5, 3.5);
          ctx.lineTo(-0.5, -3.5);
          ctx.lineTo(1.5, 3.5);
          ctx.lineTo(3.5, -3.5);
          ctx.lineTo(5.5, 3.5);
          ctx.lineTo(7, 0);
          ctx.lineTo(10, 0);   // Right lead
          ctx.stroke();
        } else if (node.type === 'C') {
          // Capacitor: Parallel plate lines with lead bars
          ctx.beginPath();
          // Left plate & lead
          ctx.moveTo(-10, 0);
          ctx.lineTo(-2.5, 0);
          ctx.moveTo(-2.5, -5.5);
          ctx.lineTo(-2.5, 5.5);
          // Right plate & lead
          ctx.moveTo(2.5, -5.5);
          ctx.lineTo(2.5, 5.5);
          ctx.moveTo(2.5, 0);
          ctx.lineTo(10, 0);
          ctx.stroke();
        } else if (node.type === 'L') {
          // Inductor: 3 elegant continuous loops
          ctx.beginPath();
          ctx.moveTo(-10, 0);
          ctx.lineTo(-6, 0); // Left lead
          ctx.arc(-4, 0, 2, Math.PI, 0, false);
          ctx.arc(0, 0, 2, Math.PI, 0, false);
          ctx.arc(4, 0, 2, Math.PI, 0, false);
          ctx.lineTo(10, 0); // Right lead
          ctx.stroke();
        } else if (node.type === 'D') {
          // Diode: Triangle and vertical line bar
          ctx.beginPath();
          // Left lead
          ctx.moveTo(-10, 0);
          ctx.lineTo(-3, 0);
          
          // Triangle pointing right
          ctx.moveTo(-3, -3.5);
          ctx.lineTo(-3, 3.5);
          ctx.lineTo(2.5, 0);
          ctx.closePath();
          
          // Vertical bar and right lead
          ctx.moveTo(2.5, -3.5);
          ctx.lineTo(2.5, 3.5);
          ctx.moveTo(2.5, 0);
          ctx.lineTo(10, 0);
          ctx.stroke();
        } else if (node.type === 'T') {
          // Transistor (NPN): Compact, self-contained symbol without long horizontal leads
          ctx.beginPath();
          // Base lead & vertical plate
          ctx.moveTo(-5, 0);
          ctx.lineTo(-2, 0);
          ctx.moveTo(-2, -4.5);
          ctx.lineTo(-2, 4.5);
          
          // Collector (short slanted line only)
          ctx.moveTo(-2, -1);
          ctx.lineTo(3.5, -4);
          
          // Emitter (short slanted line only)
          ctx.moveTo(-2, 1);
          ctx.lineTo(3.5, 4);
          ctx.stroke();
          
          // Compact NPN emitter arrow pointing down-right
          ctx.beginPath();
          ctx.moveTo(1.2, 2.7);
          ctx.lineTo(3.5, 4);
          ctx.lineTo(2.7, 1.8);
          ctx.fillStyle = 'rgba(16, 185, 129, 0.75)';
          ctx.fill();
        }
        
        ctx.restore();
      }
    });
    
    // Draw Wires (lines)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 0.75;
    
    circuitNodes.forEach((node, i) => {
      node.connections.forEach(j => {
        const target = circuitNodes[j];
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      });
    });
    
    // Update and Draw Live Current Packets (glowing neon green flow)
    currentPackets.forEach(packet => {
      packet.progress += packet.speed;
      if (packet.progress >= 1.0) {
        packet.progress = 0;
        // Swap endpoints to flow back and forth
        const temp = packet.from;
        packet.from = packet.to;
        packet.to = temp;
      }
      
      const nodeA = circuitNodes[packet.from];
      const nodeB = circuitNodes[packet.to];
      
      const px = nodeA.x + (nodeB.x - nodeA.x) * packet.progress;
      const py = nodeA.y + (nodeB.y - nodeA.y) * packet.progress;
      
      ctx.beginPath();
      ctx.arc(px, py, 1.75, 0, Math.PI * 2);
      ctx.fillStyle = colors.green;
      ctx.shadowColor = colors.green;
      ctx.shadowBlur = 4;
      ctx.fill();
      ctx.shadowBlur = 0; // Reset shadow glow
    });
    
    // ----------------------------------------------------------------------
    // 3. Draw Physics Swing Linkages (Teal/Cyan Double Pendulums)
    // ----------------------------------------------------------------------
    physicsLinks.forEach(link => {
      // Drift root pivot
      link.x += link.vx;
      link.y += link.vy;
      
      if (link.x < -100) link.x = window.innerWidth + 100;
      if (link.x > window.innerWidth + 100) link.x = -100;
      if (link.y < -100) link.y = window.innerHeight + 100;
      if (link.y > window.innerHeight + 100) link.y = -100;
      
      // Integrate the real equations of motion with fixed 4ms RK4 substeps
      for (let s = 0; s < PENDULUM_SUBSTEPS; s++) {
        rk4Pendulum(link, PENDULUM_DT);
      }

      // Accumulate energy drift for the hero telemetry readout
      energyDriftSum += Math.abs((pendulumEnergy(link) - link.E0) / link.E0);
      energyDriftCount++;

      // Calculate joint positions
      const x1 = link.x + Math.sin(link.state[0]) * link.len1 * scaleFactor;
      const y1 = link.y + Math.cos(link.state[0]) * link.len1 * scaleFactor;
      const x2 = x1 + Math.sin(link.state[1]) * link.len2 * scaleFactor;
      const y2 = y1 + Math.cos(link.state[1]) * link.len2 * scaleFactor;

      // Cursor nudges the outer bob by applying angular velocity - a real
      // impulse into the state vector, which the solver then carries forward.
      if (mouse.x !== null && mouse.y !== null) {
        const dx = mouse.x - x2;
        const dy = mouse.y - y2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < mouse.radius && dist > 0) {
          const force = (mouse.radius - dist) / mouse.radius;
          link.state[3] += (dx / dist) * force * 0.35;
          // The nudge does work on the system, so re-baseline the reference
          // energy - otherwise we would report user input as solver error.
          link.E0 = pendulumEnergy(link);
        }
      }

      // Draw Linkage Bars
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.18)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(link.x, link.y);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      
      // Draw Joints
      ctx.fillStyle = colors.cyan;
      ctx.beginPath();
      ctx.arc(link.x, link.y, 2.5, 0, Math.PI * 2); // Base joint
      ctx.arc(x1, y1, 2, 0, Math.PI * 2); // Middle joint
      ctx.fill();
      
      // Draw Tip Weight (Pulsing mass)
      ctx.fillStyle = colors.cyan;
      ctx.shadowColor = colors.cyan;
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.arc(x2, y2, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0; // Reset
    });

    updateTelemetry(now);

    requestAnimationFrame(animate);
  };
  
  // Mouse and Touch Interaction Listeners
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  
  window.addEventListener('mouseleave', () => {
    mouse.x = null;
    mouse.y = null;
  });
  
  // Interactive Spontaneous Sparks on Click (Process wildfires & current bursts!)
  window.addEventListener('click', (e) => {
    // 1. Spontaneously spark a cellular automata fire grid locally at cursor coordinates!
    const c = Math.floor((e.clientX / window.innerWidth) * caCols);
    const r = Math.floor((e.clientY / window.innerHeight) * caRows);
    
    if (r >= 0 && r < caRows && c >= 0 && c < caCols) {
      // Ignite a 3x3 block of cells
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < caRows && nc >= 0 && nc < caCols) {
            caGrid[nr][nc].state = 1;
            caGrid[nr][nc].intensity = 1.0;
          }
        }
      }
    }
    
    // 2. Spawn 5 new floating circuit current packets temporarily
    const nodeCount = circuitNodes.length;
    for (let i = 0; i < 4; i++) {
      const idxA = Math.floor(Math.random() * nodeCount);
      const idxB = Math.floor(Math.random() * nodeCount);
      if (idxA !== idxB) {
        currentPackets.push({
          from: idxA,
          to: idxB,
          progress: 0,
          speed: (Math.random() * 0.004 + 0.0025)
        });
      }
    }
    
    // Prune old current packets if we exceed capacity
    if (currentPackets.length > 80) {
      currentPackets.splice(0, 20);
    }
  });
  
  window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      mouse.x = e.touches[0].clientX;
      mouse.y = e.touches[0].clientY;
    }
  }, { passive: true });
  
  window.addEventListener('touchend', () => {
    mouse.x = null;
    mouse.y = null;
  });
  
  // Start scientific simulation canvas background.
  // Visitors who ask for reduced motion get a static page - the canvas is
  // hidden in CSS, so we skip the solver loop entirely rather than burn CPU
  // rendering to an invisible surface. The telemetry readout is stepped once
  // so it shows real values instead of em-dashes.
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  if (prefersReducedMotion) {
    // Step far enough to leave the circuit mid-transient, so the readout shows
    // a real solved value rather than the zero initial condition.
    stepRLC(200);
    physicsLinks.forEach(link => {
      rk4Pendulum(link, PENDULUM_DT);
      energyDriftSum += Math.abs((pendulumEnergy(link) - link.E0) / link.E0);
      energyDriftCount++;
    });
    updateTelemetry(performance.now() + 1000);
    const fpsEl = document.getElementById('live-fps');
    if (fpsEl) fpsEl.textContent = 'paused';
  } else {
    requestAnimationFrame(animate);
  }

  // 4. Interactive Simulator Screenshot Toggles (Stylized vs. Raw)
  const mockupWrappers = document.querySelectorAll('.sim-mockup-wrapper');
  
  mockupWrappers.forEach(wrapper => {
    const img = wrapper.querySelector('.sim-mockup');
    const badge = wrapper.querySelector('.mockup-toggle-badge');
    const options = badge.querySelectorAll('.badge-option');
    
    const toggleScreenshot = (targetMode) => {
      const currentMode = img.getAttribute('data-state');
      if (currentMode === targetMode) return;
      
      // Trigger fade out
      img.classList.add('fade-out');
      
      setTimeout(() => {
        // Swap image source
        if (targetMode === 'raw') {
          img.src = img.getAttribute('data-raw');
          img.setAttribute('data-state', 'raw');
        } else {
          img.src = img.getAttribute('data-stylized');
          img.setAttribute('data-state', 'stylized');
        }
        
        // Update badge UI active state
        options.forEach(opt => {
          if (opt.getAttribute('data-mode') === targetMode) {
            opt.classList.add('active');
          } else {
            opt.classList.remove('active');
          }
        });
        
        // Trigger fade in
        img.classList.remove('fade-out');
      }, 250); // Matches CSS transition timing
    };
    
    // Click on toggle badge options
    options.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent wrapper double click
        const mode = opt.getAttribute('data-mode');
        toggleScreenshot(mode);
      });
    });
    
    // Playful interaction: click wrapper anywhere to toggle!
    wrapper.addEventListener('click', () => {
      const currentMode = img.getAttribute('data-state');
      const nextMode = currentMode === 'stylized' ? 'raw' : 'stylized';
      toggleScreenshot(nextMode);
    });
  });

  // 5. Asynchronous Newsletter Form Handler (Mocked Success)
  const newsletterForm = document.getElementById('newsletter-form');
  const newsletterEmail = document.getElementById('newsletter-email');
  const newsletterSubmit = document.getElementById('newsletter-submit');
  
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = newsletterEmail.value;
      
      // Visual feedback: disabling elements & showing loading state
      newsletterEmail.disabled = true;
      newsletterSubmit.disabled = true;
      newsletterSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      
      try {
        // Fire actual network request
        await fetch('https://api.physbox.io/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        
        // This will throw/fail since the API doesn't exist yet
      } catch (err) {
        // Trapping the error silently so the user never sees a network failure
        console.warn('Silent Subscription Trap:', err.message);
      } finally {
        // Simulate success in the UI after a brief realistic network latency delay
        setTimeout(() => {
          newsletterSubmit.innerHTML = '<i class="fas fa-check"></i>';
          newsletterSubmit.style.background = 'var(--circuit-color)'; // Glow Green on success
          newsletterEmail.value = '';
          newsletterEmail.placeholder = 'Subscribed successfully!';
          
          // Reset button state after a few seconds
          setTimeout(() => {
            newsletterEmail.disabled = false;
            newsletterSubmit.disabled = false;
            newsletterSubmit.innerHTML = '<i class="fas fa-arrow-right"></i>';
            newsletterSubmit.style.background = ''; // Reverts to primary styling
            newsletterEmail.placeholder = 'Enter your email';
          }, 3500);
        }, 800);
      }
    });
  }

  // 6. Interactive Repository Clone Modal Handlers
  const repoModal = document.getElementById('repo-modal');
  const openModalBtns = [
    document.getElementById('nav-btn-github'),
    document.getElementById('hero-btn-github'),
    document.getElementById('pledge-btn-clone'),
    document.getElementById('footer-link-github'),
    document.getElementById('social-link-github')
  ];
  const closeModalBtn = document.getElementById('modal-close-btn');

  const openRepoModal = (e) => {
    if (e) e.preventDefault();
    repoModal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Stop background scrolling
  };

  const closeRepoModal = () => {
    repoModal.classList.remove('active');
    document.body.style.overflow = ''; // Restore scrolling
  };

  openModalBtns.forEach(btn => {
    if (btn) btn.addEventListener('click', openRepoModal);
  });

  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeRepoModal);
  }

  // Close modal when clicking on the overlay background itself
  if (repoModal) {
    repoModal.addEventListener('click', (e) => {
      if (e.target === repoModal) {
        closeRepoModal();
      }
    });
  }

  // Copy to clipboard with success feedback state
  const copyBtns = document.querySelectorAll('.btn-copy');
  copyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input) {
        // Select & Copy
        input.select();
        navigator.clipboard.writeText(input.value).then(() => {
          // Success feedback animation
          const icon = btn.querySelector('i');
          icon.className = 'fas fa-check';
          btn.style.color = 'var(--circuit-color)'; // Green checkmark
          
          setTimeout(() => {
            icon.className = 'far fa-clipboard';
            btn.style.color = '';
          }, 2000);
        }).catch(err => {
          console.error('Failed to copy: ', err);
        });
      }
    });
  });

  // 8. Copy handlers for multi-line code blocks (MCP install & config)
  const copyBlockBtns = document.querySelectorAll('.btn-copy-block');
  copyBlockBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.getAttribute('data-copy-target'));
      if (!target) return;

      navigator.clipboard.writeText(target.textContent.trim()).then(() => {
        const icon = btn.querySelector('i');
        icon.className = 'fas fa-check';
        btn.style.color = 'var(--circuit-color)';
        btn.style.borderColor = 'var(--circuit-color)';

        setTimeout(() => {
          icon.className = 'far fa-clipboard';
          btn.style.color = '';
          btn.style.borderColor = '';
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy: ', err);
      });
    });
  });

  // 9. Interactive Category Filter Pills (tutorials.html)
  const filterPills = document.querySelectorAll('.filter-pill');
  const articles = {
    all: document.querySelector('.article-main:not(.category-article)'),
    cnc: document.querySelector('.article-main:not(.category-article)'),
    circuit: document.getElementById('article-volt'),
    physics: document.getElementById('article-mesh'),
    process: document.getElementById('article-flux')
  };

  if (filterPills.length > 0) {
    filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        // Toggle active pill state
        filterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        // Determine active filter
        const filterId = pill.id.replace('filter-', '');

        // Hide all articles first
        Object.values(articles).forEach(art => {
          if (art) art.style.display = 'none';
        });

        // Show target article
        const targetArticle = articles[filterId] || articles.all;
        if (targetArticle) {
          targetArticle.style.display = 'block';
          targetArticle.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });
  }

});

