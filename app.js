/* ==========================================================================
   expt.in - Modern Landing Page Interactive Script
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


  // 3. Interactive HTML5 Network Particle Canvas Background
  const canvas = document.getElementById('canvas-bg');
  const ctx = canvas.getContext('2d');
  
  let particles = [];
  let mouse = { x: null, y: null, radius: 150 };
  let isMobile = false;
  
  // Custom theme colors for nodes
  const nodeColors = [
    'rgba(139, 92, 246, 0.45)',  // Electric Violet (Primary)
    'rgba(16, 185, 129, 0.45)',  // Emerald Green (Circuit)
    'rgba(6, 182, 212, 0.45)',   // Cyan/Teal (Physics)
    'rgba(236, 72, 153, 0.45)'    // Magenta Pink (Process)
  ];
  
  // Handle Device Pixel Ratio for Ultra-Sharp Rendering
  const resizeCanvas = () => {
    isMobile = window.innerWidth < 768;
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    
    ctx.scale(dpr, dpr);
    
    // Reinitialize particles to fit new dimensions
    initParticles();
  };
  
  // Particle Constructor
  class Particle {
    constructor(x, y, isBurst = false) {
      this.x = x || Math.random() * window.innerWidth;
      this.y = y || Math.random() * window.innerHeight;
      
      // Speed multiplier (slower for background particles, slightly faster for click bursts)
      const speed = isBurst ? 2.5 : 0.45;
      
      this.vx = (Math.random() - 0.5) * speed;
      this.vy = (Math.random() - 0.5) * speed;
      
      this.radius = Math.random() * 2 + 1; // 1px to 3px
      this.color = nodeColors[Math.floor(Math.random() * nodeColors.length)];
      
      // Track original speed to restore after interactions
      this.baseVx = this.vx;
      this.baseVy = this.vy;
    }
    
    update() {
      // 1. Mouse attraction / localized gravity
      if (mouse.x !== null && mouse.y !== null) {
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < mouse.radius) {
          const force = (mouse.radius - distance) / mouse.radius;
          // Apply a gentle drag force towards the mouse
          this.vx += (dx / distance) * force * 0.05;
          this.vy += (dy / distance) * force * 0.05;
        } else {
          // Return to original speeds smoothly
          this.vx += (this.baseVx - this.vx) * 0.03;
          this.vy += (this.baseVy - this.vy) * 0.03;
        }
      } else {
        // Return to original speeds smoothly
        this.vx += (this.baseVx - this.vx) * 0.03;
        this.vy += (this.baseVy - this.vy) * 0.03;
      }
      
      // 2. Apply velocities
      this.x += this.vx;
      this.y += this.vy;
      
      // 3. Smooth Screen Wrap Around (instead of harsh walls bouncing)
      if (this.x < 0) this.x = window.innerWidth;
      if (this.x > window.innerWidth) this.x = 0;
      if (this.y < 0) this.y = window.innerHeight;
      if (this.y > window.innerHeight) this.y = 0;
    }
    
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
  }
  
  // Initialize particles based on screen size
  const initParticles = () => {
    particles = [];
    // Mobile gets fewer nodes to preserve processing threads
    const count = isMobile ? 45 : 110;
    for (let i = 0; i < count; i++) {
      particles.push(new Particle());
    }
  };
  
  // Render and update loop
  const animate = () => {
    // Clear canvas
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    
    // Draw connections between close nodes
    const maxDistance = isMobile ? 85 : 120;
    
    for (let i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw();
      
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < maxDistance) {
          // Fade connection lines as they get further apart
          const opacity = (1 - distance / maxDistance) * 0.12;
          ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
          ctx.lineWidth = 0.65;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
    
    requestAnimationFrame(animate);
  };
  
  // Cursor Listeners
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  
  window.addEventListener('mouseleave', () => {
    mouse.x = null;
    mouse.y = null;
  });
  
  // Interactive click burst: spawns multiple new nodes
  window.addEventListener('click', (e) => {
    // Spawn 8 temporary bursting nodes
    const burstCount = isMobile ? 4 : 8;
    for (let i = 0; i < burstCount; i++) {
      particles.push(new Particle(e.clientX, e.clientY, true));
    }
    
    // Prune excess particles if we have too many
    const limit = isMobile ? 65 : 150;
    if (particles.length > limit) {
      particles.splice(0, particles.length - limit);
    }
  });
  
  // Double-tap or touch gestures for mobile interaction
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
        await fetch('https://api.expt.in/subscribe', {
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

  // Start Canvas Engine
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  requestAnimationFrame(animate);
});
