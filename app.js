(() => {
  const mascot = document.querySelector('#toucanMascot');
  const cursorAura = document.querySelector('#cursorAura');

  if (!mascot) {
    const el = document.createElement('div');
    el.id = 'toucanMascot';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <svg viewBox="0 0 180 180" role="img" aria-label="Toucan mascot">
        <defs>
          <linearGradient id="toucanBody" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stop-color="#8be9ff"/>
            <stop offset="35%" stop-color="#a4fff5"/>
            <stop offset="100%" stop-color="#e7f6ff"/>
          </linearGradient>
          <linearGradient id="toucanBeak" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stop-color="#ffb703"/>
            <stop offset="55%" stop-color="#ff8c42"/>
            <stop offset="100%" stop-color="#f65a2d"/>
          </linearGradient>
        </defs>

        <ellipse cx="95" cy="95" rx="54" ry="42" fill="url(#toucanBody)" />
        <ellipse class="wing" cx="70" cy="95" rx="24" ry="17" fill="#7dd3fc" opacity="0.92" />
        <circle cx="112" cy="82" r="10" fill="#fff" />
        <circle cx="115" cy="80" r="4.5" fill="#1d1b2f" />
        <path d="M124 80 L164 66 L154 94 Z" fill="url(#toucanBeak)" class="beak" />
        <path d="M122 83 L162 105 L147 110 Z" fill="#ff9f1c" opacity="0.8" />
        <path d="M58 138 Q95 155 132 138" fill="none" stroke="#4f46e5" stroke-width="5" stroke-linecap="round" />
        <path d="M72 52 Q86 38 100 50" stroke="#2b2e4a" stroke-width="4" stroke-linecap="round" fill="none" />
        <circle cx="92" cy="45" r="3" fill="#1d1b2f" />
        <path d="M60 110 Q80 120 90 110" stroke="#6ee7b7" stroke-width="4" stroke-linecap="round" fill="none" />
      </svg>
    `;
    document.body.appendChild(el);
  }

  const bird = document.querySelector('#toucanMascot');
  const state = {
    x: window.innerWidth * 0.75,
    y: window.innerHeight * 0.2,
    vx: 1.8,
    vy: 0.9,
    targetX: window.innerWidth * 0.75,
    targetY: window.innerHeight * 0.2
  };

  const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

  document.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    cursorAura.style.left = `${e.clientX}px`;
    cursorAura.style.top = `${e.clientY}px`;
    cursorAura.style.opacity = '1';
    document.body.classList.add('pointer-kick');
  });

  document.addEventListener('pointerleave', () => {
    document.body.classList.remove('pointer-kick');
    cursorAura.style.opacity = '0';
  });

  function randomTarget() {
    state.targetX = Math.random() * (window.innerWidth - 220) + 20;
    state.targetY = Math.random() * (window.innerHeight - 220) + 20;
  }

  function jumpAndRepel() {
    const birdCenterX = state.x + 85;
    const birdCenterY = state.y + 85;
    const dx = pointer.x - birdCenterX;
    const dy = pointer.y - birdCenterY;
    const dist = Math.hypot(dx, dy);

    if (dist < 180) {
      const repel = (180 - dist) / 180;
      state.vx += (dx / (dist || 1)) * repel * 22;
      state.vy += (dy / (dist || 1)) * repel * 18;
      state.targetX = clamp(state.x + (dx / (dist || 1)) * -90, 30, window.innerWidth - 190);
      state.targetY = clamp(state.y + (dy / (dist || 1)) * -70, 30, window.innerHeight - 190);
      cursorAura.style.transform = `translate(${(dx / (dist || 1)) * 18}px, ${(dy / (dist || 1)) * 18}px) scale(1.35)`;
    } else {
      cursorAura.style.transform = 'translate(0, 0) scale(1)';
    }

    if (Math.random() < 0.012) {
      randomTarget();
    }
  }

  function animate() {
    jumpAndRepel();

    const accelX = (state.targetX - state.x) * 0.025;
    const accelY = (state.targetY - state.y) * 0.025;

    state.vx += accelX;
    state.vy += accelY;

    state.vx *= 0.92;
    state.vy *= 0.92;

    state.x += state.vx;
    state.y += state.vy;

    state.x = clamp(state.x, 10, window.innerWidth - 190);
    state.y = clamp(state.y, 10, window.innerHeight - 190);

    const angle = Math.atan2(state.vy, state.vx) * 57.2958;
    const scale = 1 + Math.sin(Date.now() / 180) * 0.04;

    bird.style.transform = `translate(${state.x}px, ${state.y}px) rotate(${angle * 0.2}deg) scale(${scale})`;

    requestAnimationFrame(animate);
  }

  randomTarget();
  requestAnimationFrame(animate);
})();
