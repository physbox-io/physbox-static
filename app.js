/* ==========================================================================
   physbox.io - Interactive Simulation & Architectural Canvas Script
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  
  // 1. Header Shrinking on Scroll
  const header = document.getElementById('main-header');
  
  const handleScroll = () => {
    if (!header) return;
    if (window.scrollY > 20) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };
  
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();


  // 2. Scroll Reveal Animations (Intersection Observer)
  const revealElements = document.querySelectorAll('.reveal');
  
  if ('IntersectionObserver' in window) {
    const observerOptions = {
      root: null,
      threshold: 0.08,
      rootMargin: '0px 0px -30px 0px'
    };
    
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);
    
    revealElements.forEach(el => revealObserver.observe(el));
  } else {
    revealElements.forEach(el => el.classList.add('active'));
  }


  // ==========================================================================
  // 3. Ambient Background Canvas (Drafting Grid + Subtle Elements)
  // ==========================================================================
  const bgCanvas = document.getElementById('canvas-bg');
  if (bgCanvas) {
    const bgCtx = bgCanvas.getContext('2d');
    let bgNodes = [];
    let bgPackets = [];

    const resizeBgCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      bgCanvas.width = window.innerWidth * dpr;
      bgCanvas.height = window.innerHeight * dpr;
      bgCanvas.style.width = `${window.innerWidth}px`;
      bgCanvas.style.height = `${window.innerHeight}px`;
      bgCtx.scale(dpr, dpr);

      bgNodes = [];
      bgPackets = [];
      const nodeCount = Math.floor(Math.min(window.innerWidth / 45, 30));

      for (let i = 0; i < nodeCount; i++) {
        bgNodes.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          radius: Math.random() * 2 + 1.5
        });
      }

      for (let i = 0; i < bgNodes.length; i++) {
        for (let j = i + 1; j < bgNodes.length; j++) {
          const dx = bgNodes[i].x - bgNodes[j].x;
          const dy = bgNodes[i].y - bgNodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            bgPackets.push({ from: i, to: j, progress: Math.random(), speed: 0.0015 + Math.random() * 0.002 });
          }
        }
      }
    };

    resizeBgCanvas();
    window.addEventListener('resize', resizeBgCanvas);

    const animateBg = () => {
      bgCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      // Draw gentle node connections
      bgCtx.lineWidth = 1;
      for (let i = 0; i < bgNodes.length; i++) {
        const n = bgNodes[i];
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > window.innerWidth) n.vx *= -1;
        if (n.y < 0 || n.y > window.innerHeight) n.vy *= -1;

        bgCtx.fillStyle = 'rgba(79, 70, 229, 0.25)';
        bgCtx.beginPath();
        bgCtx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        bgCtx.fill();
      }

      for (let i = 0; i < bgPackets.length; i++) {
        const p = bgPackets[i];
        const n1 = bgNodes[p.from];
        const n2 = bgNodes[p.to];
        if (!n1 || !n2) continue;

        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 160) {
          const alpha = (1 - dist / 160) * 0.12;
          bgCtx.strokeStyle = `rgba(15, 23, 42, ${alpha})`;
          bgCtx.beginPath();
          bgCtx.moveTo(n1.x, n1.y);
          bgCtx.lineTo(n2.x, n2.y);
          bgCtx.stroke();

          // Packet
          p.progress += p.speed;
          if (p.progress > 1) p.progress = 0;
          const px = n1.x + dx * p.progress;
          const py = n1.y + dy * p.progress;
          bgCtx.fillStyle = 'rgba(5, 150, 105, 0.4)';
          bgCtx.beginPath();
          bgCtx.arc(px, py, 1.8, 0, Math.PI * 2);
          bgCtx.fill();
        }
      }

      requestAnimationFrame(animateBg);
    };

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReducedMotion) {
      requestAnimationFrame(animateBg);
    }
  }


  // ==========================================================================
  // 4. Hero Live Interactive Solver Console Stage
  // ==========================================================================
  const stageCanvas = document.getElementById('hero-stage-canvas');
  if (stageCanvas) {
    const sCtx = stageCanvas.getContext('2d');
    let currentEngine = 'mesh'; // 'mesh', 'etch', 'volt', 'flux'
    let isPaused = false;
    let stageWidth = 800;
    let stageHeight = 360;
    let stageMouse = { x: null, y: null, isDown: false };

    // Metrics elements
    const liveEnergyEl = document.getElementById('live-energy');
    const liveVcEl = document.getElementById('live-vc');
    const liveFpsEl = document.getElementById('live-fps');
    const hudPrimaryEl = document.getElementById('stage-hud-primary');
    const hudSecondaryEl = document.getElementById('stage-hud-secondary');
    const hudLabelEl = document.getElementById('hud-label');
    const hudValEl = document.getElementById('hud-val');
    const hudSublabelEl = document.getElementById('hud-sublabel');
    const stageFooterText = document.getElementById('stage-footer-text');

    // Control elements
    const ctrlVolt = document.getElementById('ctrl-group-volt');
    const ctrlEtch = document.getElementById('ctrl-group-etch');
    const ctrlMesh = document.getElementById('ctrl-group-mesh');
    const ctrlFlux = document.getElementById('ctrl-group-flux');
    const voltFreqSlider = document.getElementById('volt-freq-slider');
    const voltFreqVal = document.getElementById('volt-freq-val');
    const btnEtchMaterial = document.getElementById('btn-etch-material');
    const etchMatLabel = document.getElementById('etch-mat-label');
    const btnEtchPattern = document.getElementById('btn-etch-pattern');
    const btnMeshFling = document.getElementById('btn-mesh-fling');
    const btnMeshReset = document.getElementById('btn-mesh-reset');
    const btnFluxSpark = document.getElementById('btn-flux-spark');
    const btnFluxWind = document.getElementById('btn-flux-wind');
    const fluxWindLabel = document.getElementById('flux-wind-label');
    const btnPlayPause = document.getElementById('btn-stage-pause');
    const iconPlayPause = document.getElementById('icon-stage-playpause');

    // FPS calculation
    let frameCount = 0;
    let lastFpsTime = performance.now();
    let curFps = 60;

    const resizeStage = () => {
      const rect = stageCanvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      stageWidth = rect.width;
      stageHeight = rect.height;
      stageCanvas.width = rect.width * dpr;
      stageCanvas.height = rect.height * dpr;
      sCtx.scale(dpr, dpr);
    };

    resizeStage();
    window.addEventListener('resize', resizeStage);

    // ------------------------------------------------------------------------
    // Engine 1: VOLT - Analog RLC Transients & Oscilloscope
    // ------------------------------------------------------------------------
    let voltOscFreq = 60; // Hz
    let voltTime = 0;
    let voltWaveHistory = [];
    const maxWavePoints = 300;

    // RLC parameters: R=40 ohm, L=15 mH, C=10 uF (Underdamped ringing)
    const R_val = 35;
    const L_val = 0.015;
    const C_val = 0.00001;
    const alpha_rlc = R_val / (2 * L_val);
    const omega0_rlc = 1 / Math.sqrt(L_val * C_val);
    const omega_d = Math.sqrt(Math.max(0, omega0_rlc * omega0_rlc - alpha_rlc * alpha_rlc));

    const computeVoltSample = (t) => {
      const period = 1 / voltOscFreq;
      const tInPeriod = t % period;
      const isHigh = tInPeriod < period / 2;
      const vTarget = isHigh ? 5.0 : 0.0;
      const vPrev = isHigh ? 0.0 : 5.0;
      const deltaV = vTarget - vPrev;

      const tEdge = isHigh ? tInPeriod : (tInPeriod - period / 2);
      // Underdamped transient response
      const transient = -deltaV * Math.exp(-alpha_rlc * tEdge) * (Math.cos(omega_d * tEdge) + (alpha_rlc / omega_d) * Math.sin(omega_d * tEdge));
      const vCap = vTarget + transient;
      return { vIn: vTarget, vCap: Math.max(-0.5, Math.min(6.5, vCap)) };
    };

    const renderVolt = () => {
      // Background Grid (Phosphor Scope)
      sCtx.fillStyle = '#090d16';
      sCtx.fillRect(0, 0, stageWidth, stageHeight);

      // Grid divisions
      sCtx.strokeStyle = 'rgba(5, 150, 105, 0.15)';
      sCtx.lineWidth = 1;
      const divX = stageWidth / 10;
      const divY = stageHeight / 8;

      for (let x = 0; x <= stageWidth; x += divX) {
        sCtx.beginPath();
        sCtx.moveTo(x, 0);
        sCtx.lineTo(x, stageHeight);
        sCtx.stroke();
      }
      for (let y = 0; y <= stageHeight; y += divY) {
        sCtx.beginPath();
        sCtx.moveTo(0, y);
        sCtx.lineTo(stageWidth, y);
        sCtx.stroke();
      }

      // Center crosshairs
      sCtx.strokeStyle = 'rgba(5, 150, 105, 0.35)';
      sCtx.beginPath();
      sCtx.moveTo(0, stageHeight / 2);
      sCtx.lineTo(stageWidth, stageHeight / 2);
      sCtx.moveTo(stageWidth / 2, 0);
      sCtx.lineTo(stageWidth / 2, stageHeight);
      sCtx.stroke();

      // Step simulation
      if (!isPaused) {
        const dt = 1 / (60 * 30);
        for (let s = 0; s < 5; s++) {
          voltTime += dt;
          const sample = computeVoltSample(voltTime);
          voltWaveHistory.push(sample);
          if (voltWaveHistory.length > maxWavePoints) {
            voltWaveHistory.shift();
          }
        }
      }

      if (voltWaveHistory.length < 2) return;

      const latest = voltWaveHistory[voltWaveHistory.length - 1];
      if (liveVcEl) liveVcEl.textContent = `${latest.vCap.toFixed(2)} V`;
      if (liveEnergyEl) liveEnergyEl.textContent = '<0.01%';
      if (hudValEl) hudValEl.textContent = `${latest.vCap.toFixed(2)} V (${voltOscFreq} Hz)`;

      // Draw Input Square Wave (Cyan Trace)
      sCtx.strokeStyle = 'rgba(2, 132, 199, 0.6)';
      sCtx.lineWidth = 1.5;
      sCtx.beginPath();
      for (let i = 0; i < voltWaveHistory.length; i++) {
        const x = (i / maxWavePoints) * stageWidth;
        const y = stageHeight - (voltWaveHistory[i].vIn / 6.0) * (stageHeight * 0.75) - stageHeight * 0.12;
        if (i === 0) sCtx.moveTo(x, y);
        else sCtx.lineTo(x, y);
      }
      sCtx.stroke();

      // Draw RLC Capacitor Voltage (Glowing Emerald Trace)
      sCtx.shadowColor = '#10b981';
      sCtx.shadowBlur = 8;
      sCtx.strokeStyle = '#10b981';
      sCtx.lineWidth = 2.5;
      sCtx.beginPath();
      for (let i = 0; i < voltWaveHistory.length; i++) {
        const x = (i / maxWavePoints) * stageWidth;
        const y = stageHeight - (voltWaveHistory[i].vCap / 6.0) * (stageHeight * 0.75) - stageHeight * 0.12;
        if (i === 0) sCtx.moveTo(x, y);
        else sCtx.lineTo(x, y);
      }
      sCtx.stroke();
      sCtx.shadowBlur = 0;

      // Probe Point at current end
      const lastX = ((voltWaveHistory.length - 1) / maxWavePoints) * stageWidth;
      const lastY = stageHeight - (latest.vCap / 6.0) * (stageHeight * 0.75) - stageHeight * 0.12;
      sCtx.fillStyle = '#34d399';
      sCtx.beginPath();
      sCtx.arc(lastX, lastY, 5, 0, Math.PI * 2);
      sCtx.fill();

      // Channel Legend Box
      sCtx.font = '11px JetBrains Mono, monospace';
      sCtx.fillStyle = '#38bdf8';
      sCtx.fillText('CH1 (Vin Square): 5.0 Vpp', 20, stageHeight - 35);
      sCtx.fillStyle = '#34d399';
      sCtx.fillText(`CH2 (Vc Ringing): ${latest.vCap.toFixed(2)} V @ ${voltOscFreq} Hz`, 20, stageHeight - 18);
    };

    // ------------------------------------------------------------------------
    // Engine 2: ETCH - Laser Kerf & Vector Toolpaths on Wood Craft
    // ------------------------------------------------------------------------
    const materials = [
      { name: 'Baltic Birch (3mm)', bg: '#e8d5b5', lineCut: '#451a03', lineScore: '#0369a1', kerf: '0.15mm', speed: '1200 mm/min', power: '85%' },
      { name: 'Cast Acrylic (5mm)', bg: '#cbd5e1', lineCut: '#0f172a', lineScore: '#0284c7', kerf: '0.12mm', speed: '900 mm/min', power: '95%' },
      { name: 'Walnut Hardwood', bg: '#78350f', lineCut: '#1c0a00', lineScore: '#38bdf8', kerf: '0.18mm', speed: '800 mm/min', power: '100%' }
    ];
    let matIndex = 0;
    let etchPatternIndex = 0;
    let etchProgress = 0;
    let etchSparks = [];

    const getEtchPathPoint = (t, pattern) => {
      const cx = stageWidth / 2;
      const cy = stageHeight / 2;
      const rBase = Math.min(stageWidth, stageHeight) * 0.35;

      if (pattern === 0) {
        // Geometric Flower / Mandala
        const k = 6;
        const r = rBase * Math.cos(k * t);
        return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
      } else if (pattern === 1) {
        // Interlocking Box Joints / Enclosure Panel
        const side = t / (Math.PI * 2);
        const w = rBase * 1.6;
        const h = rBase * 1.1;
        const tab = 14;
        let px = 0, py = 0;

        if (side < 0.25) {
          const u = side / 0.25;
          px = cx - w / 2 + u * w;
          py = cy - h / 2 + (Math.sin(u * Math.PI * 6) > 0 ? -tab : 0);
        } else if (side < 0.5) {
          const u = (side - 0.25) / 0.25;
          px = cx + w / 2 + (Math.sin(u * Math.PI * 6) > 0 ? tab : 0);
          py = cy - h / 2 + u * h;
        } else if (side < 0.75) {
          const u = (side - 0.5) / 0.25;
          px = cx + w / 2 - u * w;
          py = cy + h / 2 + (Math.sin(u * Math.PI * 6) > 0 ? tab : 0);
        } else {
          const u = (side - 0.75) / 0.25;
          px = cx - w / 2 + (Math.sin(u * Math.PI * 6) > 0 ? -tab : 0);
          py = cy + h / 2 - u * h;
        }
        return { x: px, y: py };
      } else {
        // Planetary Gear Teeth Profile
        const teeth = 18;
        const r = rBase * (0.85 + 0.15 * Math.cos(teeth * t));
        return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
      }
    };

    const renderEtch = () => {
      const mat = materials[matIndex];

      // Material Bed Surface
      sCtx.fillStyle = mat.bg;
      sCtx.fillRect(0, 0, stageWidth, stageHeight);

      // Wood Grain Texture Simulation
      sCtx.strokeStyle = 'rgba(0, 0, 0, 0.04)';
      sCtx.lineWidth = 1.5;
      for (let y = 10; y < stageHeight; y += 18) {
        sCtx.beginPath();
        sCtx.moveTo(0, y + Math.sin(y * 0.2) * 4);
        sCtx.bezierCurveTo(
          stageWidth * 0.3, y + Math.cos(y * 0.1) * 8,
          stageWidth * 0.7, y - Math.sin(y * 0.15) * 6,
          stageWidth, y + Math.cos(y * 0.25) * 5
        );
        sCtx.stroke();
      }

      // Bed Grid Origin Marker (0,0)
      sCtx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
      sCtx.lineWidth = 2;
      sCtx.beginPath();
      sCtx.moveTo(25, 25);
      sCtx.lineTo(65, 25);
      sCtx.stroke();
      sCtx.strokeStyle = 'rgba(2, 132, 199, 0.5)';
      sCtx.beginPath();
      sCtx.moveTo(25, 25);
      sCtx.lineTo(25, 65);
      sCtx.stroke();
      sCtx.font = '10px JetBrains Mono, monospace';
      sCtx.fillStyle = '#475569';
      sCtx.fillText('G54 (0,0)', 30, 20);

      // Advance Toolpath
      if (!isPaused) {
        etchProgress += 0.006;
        if (etchProgress > Math.PI * 2) {
          etchProgress = 0;
        }
      }

      // Draw Completed Toolpath (Charred Kerf Cut)
      const steps = 300;
      const currentStep = Math.floor((etchProgress / (Math.PI * 2)) * steps);

      sCtx.strokeStyle = mat.lineCut;
      sCtx.lineWidth = 2.2;
      sCtx.beginPath();
      for (let i = 0; i <= currentStep; i++) {
        const t = (i / steps) * Math.PI * 2;
        const pt = getEtchPathPoint(t, etchPatternIndex);
        if (i === 0) sCtx.moveTo(pt.x, pt.y);
        else sCtx.lineTo(pt.x, pt.y);
      }
      sCtx.stroke();

      // Planned Path Outline (Dotted Cyan Guideline)
      sCtx.strokeStyle = 'rgba(2, 132, 199, 0.35)';
      sCtx.setLineDash([4, 4]);
      sCtx.lineWidth = 1;
      sCtx.beginPath();
      for (let i = currentStep; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const pt = getEtchPathPoint(t, etchPatternIndex);
        if (i === currentStep) sCtx.moveTo(pt.x, pt.y);
        else sCtx.lineTo(pt.x, pt.y);
      }
      sCtx.stroke();
      sCtx.setLineDash([]);

      // Current Laser Focal Point
      const laserPt = getEtchPathPoint(etchProgress, etchPatternIndex);

      // Spawn Sparks
      if (!isPaused && Math.random() < 0.7) {
        etchSparks.push({
          x: laserPt.x,
          y: laserPt.y,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4 - 1.5,
          life: 1.0,
          color: Math.random() > 0.4 ? '#f59e0b' : '#ef4444'
        });
      }

      // Render & Update Sparks
      for (let i = etchSparks.length - 1; i >= 0; i--) {
        const sp = etchSparks[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.life -= 0.04;
        if (sp.life <= 0) {
          etchSparks.splice(i, 1);
          continue;
        }
        sCtx.fillStyle = sp.color;
        sCtx.globalAlpha = sp.life;
        sCtx.beginPath();
        sCtx.arc(sp.x, sp.y, 1.8 * sp.life, 0, Math.PI * 2);
        sCtx.fill();
        sCtx.globalAlpha = 1.0;
      }

      // Laser Focal Beam & Hot Spot
      sCtx.shadowColor = '#f59e0b';
      sCtx.shadowBlur = 14;
      sCtx.fillStyle = '#ffffff';
      sCtx.beginPath();
      sCtx.arc(laserPt.x, laserPt.y, 3.5, 0, Math.PI * 2);
      sCtx.fill();
      sCtx.fillStyle = '#ef4444';
      sCtx.beginPath();
      sCtx.arc(laserPt.x, laserPt.y, 6.5, 0, Math.PI * 2);
      sCtx.stroke();
      sCtx.shadowBlur = 0;

      // Update Telemetry
      if (liveVcEl) liveVcEl.textContent = mat.power;
      if (liveEnergyEl) liveEnergyEl.textContent = mat.kerf;
      if (hudValEl) hudValEl.textContent = `${mat.speed} @ ${mat.power}`;

      // HUD Label
      sCtx.font = '11px JetBrains Mono, monospace';
      sCtx.fillStyle = matIndex === 2 ? '#fef3c7' : '#0f172a';
      sCtx.fillText(`G1 X${laserPt.x.toFixed(1)} Y${laserPt.y.toFixed(1)} F${mat.speed} | S1000`, 20, stageHeight - 20);
    };

    // ------------------------------------------------------------------------
    // Engine 3: MESH - Chaotic Double Pendulum Kinematics (RK4)
    // ------------------------------------------------------------------------
    let pendulum = {
      cx: stageWidth / 2,
      cy: 90,
      l1: 95,
      l2: 85,
      m1: 2.0,
      m2: 1.5,
      theta1: Math.PI * 0.65,
      theta2: Math.PI * 0.75,
      omega1: 0,
      omega2: 0,
      trail: [],
      maxTrail: 160
    };
    const GRAV = 980;

    const calcPendulumDerivs = (p, y) => {
      const [t1, t2, w1, w2] = y;
      const { l1, l2, m1, m2 } = p;
      const d = t1 - t2;
      const sd = Math.sin(d);
      const cd = Math.cos(d);
      const denom = 2 * m1 + m2 - m2 * Math.cos(2 * d);

      const a1 = (-GRAV * (2 * m1 + m2) * Math.sin(t1) - m2 * GRAV * Math.sin(t1 - 2 * t2) - 2 * sd * m2 * (w2 * w2 * l2 + w1 * w1 * l1 * cd)) / (l1 * denom);
      const a2 = (2 * sd * (w1 * w1 * l1 * (m1 + m2) + GRAV * (m1 + m2) * Math.cos(t1) + w2 * w2 * l2 * m2 * cd)) / (l2 * denom);
      return [w1, w2, a1, a2];
    };

    const stepPendulum = (dt) => {
      const y = [pendulum.theta1, pendulum.theta2, pendulum.omega1, pendulum.omega2];
      const add = (a, b, s) => a.map((v, i) => v + b[i] * s);

      const k1 = calcPendulumDerivs(pendulum, y);
      const k2 = calcPendulumDerivs(pendulum, add(y, k1, dt / 2));
      const k3 = calcPendulumDerivs(pendulum, add(y, k2, dt / 2));
      const k4 = calcPendulumDerivs(pendulum, add(y, k3, dt));

      for (let i = 0; i < 4; i++) {
        y[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
      }
      // Damping
      y[2] *= 0.9998;
      y[3] *= 0.9998;

      pendulum.theta1 = y[0];
      pendulum.theta2 = y[1];
      pendulum.omega1 = y[2];
      pendulum.omega2 = y[3];
    };

    const renderMesh = () => {
      pendulum.cx = stageWidth / 2;
      pendulum.cy = 80;

      // Dark Precision Blueprint Grid Background
      sCtx.fillStyle = '#09101d';
      sCtx.fillRect(0, 0, stageWidth, stageHeight);

      // Blueprint Coordinate Grid
      sCtx.strokeStyle = 'rgba(2, 132, 199, 0.12)';
      sCtx.lineWidth = 1;
      for (let x = 0; x < stageWidth; x += 30) {
        sCtx.beginPath();
        sCtx.moveTo(x, 0);
        sCtx.lineTo(x, stageHeight);
        sCtx.stroke();
      }
      for (let y = 0; y < stageHeight; y += 30) {
        sCtx.beginPath();
        sCtx.moveTo(0, y);
        sCtx.lineTo(stageWidth, y);
        sCtx.stroke();
      }

      // Physics Integration
      if (!isPaused) {
        for (let i = 0; i < 4; i++) {
          stepPendulum(0.0035);
        }
      }

      // Compute joint coordinates
      const x1 = pendulum.cx + pendulum.l1 * Math.sin(pendulum.theta1);
      const y1 = pendulum.cy + pendulum.l1 * Math.cos(pendulum.theta1);
      const x2 = x1 + pendulum.l2 * Math.sin(pendulum.theta2);
      const y2 = y1 + pendulum.l2 * Math.cos(pendulum.theta2);

      // Append to trail
      if (!isPaused) {
        pendulum.trail.push({ x: x2, y: y2 });
        if (pendulum.trail.length > pendulum.maxTrail) {
          pendulum.trail.shift();
        }
      }

      // Draw Trajectory Trail
      if (pendulum.trail.length > 2) {
        for (let i = 1; i < pendulum.trail.length; i++) {
          const alpha = (i / pendulum.trail.length) * 0.85;
          sCtx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
          sCtx.lineWidth = 2;
          sCtx.beginPath();
          sCtx.moveTo(pendulum.trail[i - 1].x, pendulum.trail[i - 1].y);
          sCtx.lineTo(pendulum.trail[i].x, pendulum.trail[i].y);
          sCtx.stroke();
        }
      }

      // Draw Anchor Pivot
      sCtx.fillStyle = '#64748b';
      sCtx.beginPath();
      sCtx.arc(pendulum.cx, pendulum.cy, 6, 0, Math.PI * 2);
      sCtx.fill();

      // Draw Link 1
      sCtx.strokeStyle = '#94a3b8';
      sCtx.lineWidth = 4;
      sCtx.beginPath();
      sCtx.moveTo(pendulum.cx, pendulum.cy);
      sCtx.lineTo(x1, y1);
      sCtx.stroke();

      // Draw Joint 1 Bob
      sCtx.fillStyle = '#38bdf8';
      sCtx.beginPath();
      sCtx.arc(x1, y1, 10, 0, Math.PI * 2);
      sCtx.fill();
      sCtx.strokeStyle = '#ffffff';
      sCtx.lineWidth = 2;
      sCtx.stroke();

      // Draw Link 2
      sCtx.strokeStyle = '#94a3b8';
      sCtx.lineWidth = 4;
      sCtx.beginPath();
      sCtx.moveTo(x1, y1);
      sCtx.lineTo(x2, y2);
      sCtx.stroke();

      // Draw Joint 2 Bob
      sCtx.shadowColor = '#38bdf8';
      sCtx.shadowBlur = 12;
      sCtx.fillStyle = '#0284c7';
      sCtx.beginPath();
      sCtx.arc(x2, y2, 12, 0, Math.PI * 2);
      sCtx.fill();
      sCtx.strokeStyle = '#38bdf8';
      sCtx.lineWidth = 2.5;
      sCtx.stroke();
      sCtx.shadowBlur = 0;

      // Telemetry
      const angularSpeed = Math.abs(pendulum.omega1) + Math.abs(pendulum.omega2);
      if (liveEnergyEl) liveEnergyEl.textContent = '<0.005%';
      if (liveVcEl) liveVcEl.textContent = `${angularSpeed.toFixed(2)} rad/s`;
      if (hudValEl) hudValEl.textContent = `θ₁:${(pendulum.theta1 % Math.PI).toFixed(2)} rad | θ₂:${(pendulum.theta2 % Math.PI).toFixed(2)} rad`;
    };

    // ------------------------------------------------------------------------
    // Engine 4: FLUX - Wildfire Cellular Automata & Differential Loops
    // ------------------------------------------------------------------------
    const gridCols = 48;
    const gridRows = 22;
    let fluxGrid = [];
    let windDirection = 1; // 1 = East, -1 = West
    let fluxStepCounter = 0;

    const initFluxGrid = () => {
      fluxGrid = [];
      for (let r = 0; r < gridRows; r++) {
        fluxGrid[r] = [];
        for (let c = 0; c < gridCols; c++) {
          fluxGrid[r][c] = {
            state: Math.random() < 0.75 ? 1 : 0, // 1 = Green tree, 0 = Empty/Burnt
            fire: 0, // 0 to 1
            life: 1.0
          };
        }
      }
      // Spark initial fire in center
      sparkFluxFire(Math.floor(gridCols / 2), Math.floor(gridRows / 2));
    };

    const sparkFluxFire = (c, r) => {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols) {
            fluxGrid[nr][nc].fire = 1.0;
            fluxGrid[nr][nc].state = 2; // Burning
          }
        }
      }
    };

    initFluxGrid();

    const renderFlux = () => {
      sCtx.fillStyle = '#0a0d14';
      sCtx.fillRect(0, 0, stageWidth, stageHeight);

      const cellW = stageWidth / gridCols;
      const cellH = stageHeight / gridRows;

      // Update CA state
      if (!isPaused) {
        fluxStepCounter++;
        if (fluxStepCounter % 4 === 0) {
          const nextGrid = [];
          for (let r = 0; r < gridRows; r++) {
            nextGrid[r] = [];
            for (let c = 0; c < gridCols; c++) {
              const cell = fluxGrid[r][c];
              let nFire = cell.fire;
              let nState = cell.state;

              if (cell.state === 2) {
                // Burning -> Burns out to empty
                nFire -= 0.15;
                if (nFire <= 0) {
                  nState = 0; // Ash / empty
                  nFire = 0;
                }
              } else if (cell.state === 1) {
                // Tree -> May catch fire from burning neighbors
                let burnNeighbor = 0;
                for (let dr = -1; dr <= 1; dr++) {
                  for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols) {
                      if (fluxGrid[nr][nc].state === 2) {
                        // Wind bias
                        const windBoost = (dc === windDirection) ? 2.2 : 0.8;
                        burnNeighbor += fluxGrid[nr][nc].fire * windBoost;
                      }
                    }
                  }
                }
                if (burnNeighbor > 0.6 && Math.random() < 0.65) {
                  nState = 2;
                  nFire = 1.0;
                }
              } else if (cell.state === 0) {
                // Empty ash -> Regrowth chance
                if (Math.random() < 0.008) {
                  nState = 1; // Green tree
                }
              }

              nextGrid[r][c] = { state: nState, fire: nFire, life: 1.0 };
            }
          }
          fluxGrid = nextGrid;
        }
      }

      // Draw Grid Cells
      let burningCount = 0;
      let treeCount = 0;

      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          const cell = fluxGrid[r][c];
          const x = c * cellW;
          const y = r * cellH;

          if (cell.state === 1) {
            // Green Pine Forest
            treeCount++;
            sCtx.fillStyle = '#065f46';
            sCtx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
          } else if (cell.state === 2) {
            // Burning Wildfire (Yellow-Orange-Red)
            burningCount++;
            sCtx.fillStyle = cell.fire > 0.6 ? '#f59e0b' : '#ef4444';
            sCtx.fillRect(x, y, cellW, cellH);
          } else {
            // Ash / Clearing
            sCtx.fillStyle = '#1e293b';
            sCtx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
          }
        }
      }

      // Wind Vector Indicator
      sCtx.font = '11px JetBrains Mono, monospace';
      sCtx.fillStyle = '#f472b6';
      sCtx.fillText(`Wind Vector: ${windDirection > 0 ? '→ East (3.5 m/s)' : '← West (3.5 m/s)'} | Active Fronts: ${burningCount}`, 20, stageHeight - 20);

      // Telemetry
      if (liveVcEl) liveVcEl.textContent = `${burningCount} nodes`;
      if (liveEnergyEl) liveEnergyEl.textContent = `${((treeCount / (gridCols * gridRows)) * 100).toFixed(0)}% canopy`;
      if (hudValEl) hudValEl.textContent = `${burningCount} fires active`;
    };

    // ------------------------------------------------------------------------
    // Main Stage Animation Loop
    // ------------------------------------------------------------------------
    const animateStage = (now) => {
      // Calculate FPS
      frameCount++;
      if (now - lastFpsTime >= 1000) {
        curFps = Math.round((frameCount * 1000) / (now - lastFpsTime));
        frameCount = 0;
        lastFpsTime = now;
        if (liveFpsEl) liveFpsEl.textContent = isPaused ? '0' : `${curFps}`;
      }

      // Render active engine
      if (currentEngine === 'volt') {
        renderVolt();
      } else if (currentEngine === 'etch') {
        renderEtch();
      } else if (currentEngine === 'mesh') {
        renderMesh();
      } else if (currentEngine === 'flux') {
        renderFlux();
      }

      requestAnimationFrame(animateStage);
    };

    requestAnimationFrame(animateStage);

    // ------------------------------------------------------------------------
    // Stage Controls & Tab Switching Handlers
    // ------------------------------------------------------------------------
    const stageTabs = document.querySelectorAll('.stage-tab');
    stageTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        stageTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentEngine = tab.getAttribute('data-engine');

        // Toggle Control Groups
        if (ctrlVolt) ctrlVolt.style.display = currentEngine === 'volt' ? 'flex' : 'none';
        if (ctrlEtch) ctrlEtch.style.display = currentEngine === 'etch' ? 'flex' : 'none';
        if (ctrlMesh) ctrlMesh.style.display = currentEngine === 'mesh' ? 'flex' : 'none';
        if (ctrlFlux) ctrlFlux.style.display = currentEngine === 'flux' ? 'flex' : 'none';

        // Update HUD Labels
        if (currentEngine === 'volt') {
          hudLabelEl.textContent = 'Ngspice RK4 Transient';
          hudSublabelEl.textContent = 'Square Wave Excitation @ 60 Hz';
          stageFooterText.textContent = 'Tune frequency slider to observe underdamped RLC ringing and harmonic settling.';
        } else if (currentEngine === 'etch') {
          hudLabelEl.textContent = 'GRBL Vector Streamer';
          hudSublabelEl.textContent = '0.15mm Kerf Compensation Active';
          stageFooterText.textContent = 'Click to position laser head. Switch materials to inspect optical power feeds.';
        } else if (currentEngine === 'mesh') {
          hudLabelEl.textContent = 'MuJoCo RK4 Kinematics';
          hudSublabelEl.textContent = 'Lagrangian Double Pendulum Dynamics';
          stageFooterText.textContent = 'Click "Fling Pendulum" or drag bobs to explore non-linear chaotic mechanics.';
        } else if (currentEngine === 'flux') {
          hudLabelEl.textContent = 'Cellular Automata Engine';
          hudSublabelEl.textContent = 'Runge-Kutta & Wildfire Propagation';
          stageFooterText.textContent = 'Click anywhere on the grid to spark new wildfire fronts and test wind vectors.';
        }
      });
    });

    // Volt Frequency Slider
    if (voltFreqSlider && voltFreqVal) {
      voltFreqSlider.addEventListener('input', (e) => {
        voltOscFreq = parseInt(e.target.value, 10);
        voltFreqVal.textContent = `${voltOscFreq}Hz`;
      });
    }

    // Etch Material Switcher
    if (btnEtchMaterial && etchMatLabel) {
      btnEtchMaterial.addEventListener('click', () => {
        matIndex = (matIndex + 1) % materials.length;
        etchMatLabel.textContent = materials[matIndex].name;
      });
    }

    // Etch Pattern Switcher
    if (btnEtchPattern) {
      btnEtchPattern.addEventListener('click', () => {
        etchPatternIndex = (etchPatternIndex + 1) % 3;
        etchProgress = 0;
      });
    }

    // Mesh Fling Button
    if (btnMeshFling) {
      btnMeshFling.addEventListener('click', () => {
        pendulum.omega1 = (Math.random() - 0.5) * 16;
        pendulum.omega2 = (Math.random() - 0.5) * 22;
        pendulum.trail = [];
      });
    }

    // Mesh Reset Button
    if (btnMeshReset) {
      btnMeshReset.addEventListener('click', () => {
        pendulum.theta1 = Math.PI * 0.65;
        pendulum.theta2 = Math.PI * 0.75;
        pendulum.omega1 = 0;
        pendulum.omega2 = 0;
        pendulum.trail = [];
      });
    }

    // Flux Spark Button
    if (btnFluxSpark) {
      btnFluxSpark.addEventListener('click', () => {
        const c = Math.floor(Math.random() * (gridCols - 4)) + 2;
        const r = Math.floor(Math.random() * (gridRows - 4)) + 2;
        sparkFluxFire(c, r);
      });
    }

    // Flux Wind Toggle
    if (btnFluxWind && fluxWindLabel) {
      btnFluxWind.addEventListener('click', () => {
        windDirection *= -1;
        fluxWindLabel.textContent = windDirection > 0 ? 'East' : 'West';
      });
    }

    // Play / Pause Button
    if (btnPlayPause && iconPlayPause) {
      btnPlayPause.addEventListener('click', () => {
        isPaused = !isPaused;
        if (isPaused) {
          iconPlayPause.className = 'fas fa-play';
          btnPlayPause.style.background = '#059669';
        } else {
          iconPlayPause.className = 'fas fa-pause';
          btnPlayPause.style.background = '';
        }
      });
    }

    // Canvas Interactive Click & Drag
    stageCanvas.addEventListener('click', (e) => {
      const rect = stageCanvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      if (currentEngine === 'flux') {
        const c = Math.floor((clickX / stageWidth) * gridCols);
        const r = Math.floor((clickY / stageHeight) * gridRows);
        sparkFluxFire(c, r);
      } else if (currentEngine === 'mesh') {
        pendulum.omega1 += (Math.random() - 0.5) * 8;
        pendulum.omega2 += (Math.random() - 0.5) * 12;
      }
    });
  }


  // ==========================================================================
  // 5. Interactive Simulator Screenshot Toggles (Stylized vs. Raw)
  // ==========================================================================
  const mockupWrappers = document.querySelectorAll('.sim-mockup-wrapper');
  
  mockupWrappers.forEach(wrapper => {
    const img = wrapper.querySelector('.sim-mockup');
    const badge = wrapper.querySelector('.mockup-toggle-badge');
    if (!img || !badge) return;
    const options = badge.querySelectorAll('.badge-option');
    
    const toggleScreenshot = (targetMode) => {
      const currentMode = img.getAttribute('data-state');
      if (currentMode === targetMode) return;
      
      img.classList.add('fade-out');
      
      setTimeout(() => {
        if (targetMode === 'raw') {
          img.src = img.getAttribute('data-raw');
          img.setAttribute('data-state', 'raw');
        } else {
          img.src = img.getAttribute('data-stylized');
          img.setAttribute('data-state', 'stylized');
        }
        
        options.forEach(opt => {
          if (opt.getAttribute('data-mode') === targetMode) {
            opt.classList.add('active');
          } else {
            opt.classList.remove('active');
          }
        });
        
        img.classList.remove('fade-out');
      }, 250);
    };
    
    options.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = opt.getAttribute('data-mode');
        toggleScreenshot(mode);
      });
    });
    
    wrapper.addEventListener('click', () => {
      const currentMode = img.getAttribute('data-state');
      const nextMode = currentMode === 'stylized' ? 'raw' : 'stylized';
      toggleScreenshot(nextMode);
    });
  });


  // ==========================================================================
  // 6. Newsletter Form
  // ==========================================================================
  const newsletterForm = document.getElementById('newsletter-form');
  const newsletterEmail = document.getElementById('newsletter-email');
  const newsletterSubmit = document.getElementById('newsletter-submit');
  
  if (newsletterForm && newsletterEmail && newsletterSubmit) {
    newsletterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = newsletterEmail.value;
      
      newsletterEmail.disabled = true;
      newsletterSubmit.disabled = true;
      newsletterSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      
      try {
        await fetch('https://api.physbox.io/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
      } catch (err) {
        console.warn('Silent Subscription Trap:', err.message);
      } finally {
        setTimeout(() => {
          newsletterSubmit.innerHTML = '<i class="fas fa-check"></i>';
          newsletterSubmit.style.background = 'var(--circuit-color)';
          newsletterEmail.value = '';
          newsletterEmail.placeholder = 'Subscribed successfully!';
          
          setTimeout(() => {
            newsletterEmail.disabled = false;
            newsletterSubmit.disabled = false;
            newsletterSubmit.innerHTML = '<i class="fas fa-arrow-right"></i>';
            newsletterSubmit.style.background = '';
            newsletterEmail.placeholder = 'Enter your email';
          }, 3500);
        }, 800);
      }
    });
  }


  // ==========================================================================
  // 7. Repository Clone Modal Handlers
  // ==========================================================================
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
    if (repoModal) {
      repoModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  };

  const closeRepoModal = () => {
    if (repoModal) {
      repoModal.classList.remove('active');
      document.body.style.overflow = '';
    }
  };

  openModalBtns.forEach(btn => {
    if (btn) btn.addEventListener('click', openRepoModal);
  });

  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeRepoModal);
  }

  if (repoModal) {
    repoModal.addEventListener('click', (e) => {
      if (e.target === repoModal) {
        closeRepoModal();
      }
    });
  }


  // ==========================================================================
  // 8. Clipboard Copy Handlers
  // ==========================================================================
  const copyBtns = document.querySelectorAll('.btn-copy');
  copyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input) {
        input.select();
        navigator.clipboard.writeText(input.value).then(() => {
          const icon = btn.querySelector('i');
          if (icon) icon.className = 'fas fa-check';
          btn.style.color = 'var(--circuit-color)';
          
          setTimeout(() => {
            if (icon) icon.className = 'far fa-clipboard';
            btn.style.color = '';
          }, 2000);
        }).catch(err => {
          console.error('Failed to copy: ', err);
        });
      }
    });
  });

  const copyBlockBtns = document.querySelectorAll('.btn-copy-block');
  copyBlockBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.getAttribute('data-copy-target'));
      if (!target) return;

      navigator.clipboard.writeText(target.textContent.trim()).then(() => {
        const icon = btn.querySelector('i');
        if (icon) icon.className = 'fas fa-check';
        btn.style.color = 'var(--circuit-color)';
        btn.style.borderColor = 'var(--circuit-color)';

        setTimeout(() => {
          if (icon) icon.className = 'far fa-clipboard';
          btn.style.color = '';
          btn.style.borderColor = '';
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy: ', err);
      });
    });
  });


  // ==========================================================================
  // 9. Category Filter Pills (tutorials.html)
  // ==========================================================================
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
        filterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        const filterId = pill.id.replace('filter-', '');

        Object.values(articles).forEach(art => {
          if (art) art.style.display = 'none';
        });

        const targetArticle = articles[filterId] || articles.all;
        if (targetArticle) {
          targetArticle.style.display = 'block';
          targetArticle.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });
  }

});
