(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const W = 400;
  const H = 600;
  const CAR_W = 50;
  const CAR_H = 90;
  const RING_R = 20;
  const STEP = 1000 / 60;

  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  let state = "ready"; // ready | playing | crashed
  let x = 180;
  let y = 450;
  let pointerX = null;
  let pointerY = null;
  let rings = [];
  let dodged = 0;
  let flashTimer = 0;

  let audioCtx = null;
  let cryBuffer = null;
  let victoryBuffer = null;

  function spawnRings() {
    rings = [];
    for (let i = 0; i < 4; i++) {
      rings.push({ x: randInt(0, 360), y: 150 * i });
    }
  }

  function resetGame() {
    x = 180;
    y = 450;
    dodged = 0;
    flashTimer = 0;
    spawnRings();
  }

  function ensureAudio() {
    if (!audioCtx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      audioCtx = new AudioCtor();
      cryBuffer = makeCrySound(audioCtx);
      victoryBuffer = makeVictorySound(audioCtx);
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function makeCrySound(ac) {
    const rate = ac.sampleRate;
    const dur = 1.8;
    const n = Math.floor(rate * dur);
    const buffer = ac.createBuffer(1, n, rate);
    const data = buffer.getChannelData(0);
    let phase = 0;

    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const freq =
        480 +
        200 * (Math.sin(2 * Math.PI * 1.4 * t) * 0.5 + 0.5) +
        35 * Math.sin(2 * Math.PI * 12 * t);
      phase += (2 * Math.PI * freq) / rate;

      let wave =
        0.6 * Math.sin(phase) +
        0.25 * Math.sin(2 * phase) +
        0.1 * Math.sin(3 * phase);

      const burst = Math.sin(2 * Math.PI * 1.4 * t) * 0.5 + 0.5;
      const envelope = Math.exp(-t * 0.8) * burst;
      data[i] = Math.max(-1, Math.min(1, wave * envelope * 0.8));
    }

    return buffer;
  }

  function makeVictorySound(ac) {
    const rate = ac.sampleRate;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const noteDur = 0.12;
    const nNote = Math.floor(rate * noteDur);
    const buffer = ac.createBuffer(1, nNote * notes.length, rate);
    const data = buffer.getChannelData(0);
    let offset = 0;

    for (const freq of notes) {
      for (let i = 0; i < nNote; i++) {
        const t = i / rate;
        const envelope = Math.min(1, t * 40) * Math.exp(-t * 4);
        const wave =
          0.6 * Math.sin(2 * Math.PI * freq * t) +
          0.3 * Math.sin(2 * Math.PI * freq * 2 * t);
        data[offset + i] = Math.max(-1, Math.min(1, wave * envelope * 0.8));
      }
      offset += nNote;
    }

    return buffer;
  }

  function playBuffer(buffer) {
    if (!audioCtx || !buffer) return;
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
  }

  const playCry = () => playBuffer(cryBuffer);
  const playVictory = () => playBuffer(victoryBuffer);

  function startGame() {
    ensureAudio();
    state = "playing";
    resetGame();
  }

  function retryGame() {
    state = "playing";
    resetGame();
  }

  function toGameCoords(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function updatePlaying() {
    const speed = Math.min(18, 6 + dodged * 0.5);

    if (pointerX !== null) {
      x += (pointerX - CAR_W / 2 - x) * 0.3;
      y += (pointerY - CAR_H / 2 - y) * 0.3;
      x = Math.max(0, Math.min(W - CAR_W, x));
      y = Math.max(0, Math.min(H - CAR_H, y));
    }

    const carCenterX = x + CAR_W / 2;
    const carCenterY = y + CAR_H / 2;

    for (const ring of rings) {
      const oldY = ring.y;
      ring.y = (ring.y + speed) % H;

      if (ring.y < oldY) {
        let newX = randInt(0, 360);
        if (Math.abs(ring.y - carCenterY) < 70) {
          let tries = 0;
          while (Math.abs(newX - carCenterX) < 60 && tries < 25) {
            newX = randInt(0, 360);
            tries++;
          }
        }
        ring.x = newX;

        dodged++;
        if (dodged % 5 === 0) playVictory();
      }

      const closestX = Math.max(x, Math.min(ring.x, x + CAR_W));
      const closestY = Math.max(y, Math.min(ring.y, y + CAR_H));
      const dx = ring.x - closestX;
      const dy = ring.y - closestY;

      if (dx * dx + dy * dy <= RING_R * RING_R) {
        state = "crashed";
        flashTimer = 20;
        playCry();
        break;
      }
    }
  }

  function updateReady() {
    for (const ring of rings) {
      const oldY = ring.y;
      ring.y = (ring.y + 3) % H;
      if (ring.y < oldY) ring.x = randInt(0, 360);
    }
  }

  function update() {
    if (state === "playing") {
      updatePlaying();
    } else if (state === "ready") {
      updateReady();
    } else {
      flashTimer = Math.max(0, flashTimer - 1);
    }
  }

  function roundRect(sx, sy, w, h, r, fill, stroke, lineWidth) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(sx + radius, sy);
    ctx.arcTo(sx + w, sy, sx + w, sy + h, radius);
    ctx.arcTo(sx + w, sy + h, sx, sy + h, radius);
    ctx.arcTo(sx, sy + h, sx, sy, radius);
    ctx.arcTo(sx, sy, sx + w, sy, radius);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  function drawCar(carX, carY) {
    const wheels = [
      [carX - 5, carY + 12],
      [carX + CAR_W - 5, carY + 12],
      [carX - 5, carY + CAR_H - 30],
      [carX + CAR_W - 5, carY + CAR_H - 30],
    ];

    for (const [wx, wy] of wheels) {
      roundRect(wx, wy, 10, 18, 3, "#191919");
    }

    roundRect(carX, carY, CAR_W, CAR_H, 14, "#dc1e1e");
    roundRect(carX, carY, CAR_W, CAR_H, 14, null, "#960f0f", 2);

    roundRect(carX + 8, carY + 14, CAR_W - 16, 15, 4, "#96c8eb");
    roundRect(carX + 7, carY + 30, CAR_W - 14, 28, 4, "#be1919");
    roundRect(carX + 8, carY + 59, CAR_W - 16, 13, 4, "#96c8eb");

    roundRect(carX + 5, carY + 1, 11, 5, 2, "#fff096");
    roundRect(carX + CAR_W - 16, carY + 1, 11, 5, 2, "#fff096");

    roundRect(carX + 5, carY + CAR_H - 6, 11, 5, 2, "#ff4646");
    roundRect(carX + CAR_W - 16, carY + CAR_H - 6, 11, 5, 2, "#ff4646");
  }

  function drawRings() {
    ctx.strokeStyle = "#00ffff";
    ctx.lineWidth = 3;
    for (const ring of rings) {
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, RING_R, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawCenteredText(text, textY, color, font) {
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, W / 2, textY);
  }

  function render() {
    if (state === "crashed") {
      ctx.fillStyle = flashTimer > 0 && flashTimer % 2 === 0 ? "#ffffff" : "#0a0a28";
      ctx.fillRect(0, 0, W, H);

      drawCenteredText(
        "Better luck next time",
        280,
        "#ff5050",
        "bold 30px system-ui, sans-serif"
      );
      drawCenteredText(
        "Click / tap or press Enter to retry",
        340,
        "#ffffff",
        "18px system-ui, sans-serif"
      );
      return;
    }

    ctx.fillStyle = "#0a0a28";
    ctx.fillRect(0, 0, W, H);

    drawCar(x, y);
    drawRings();

    ctx.fillStyle = "#ffffff";
    ctx.font = "24px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`Passed: ${dodged}`, 10, 32);

    if (state === "ready") {
      ctx.fillStyle = "rgba(5, 5, 20, 0.62)";
      ctx.fillRect(0, 0, W, H);

      drawCenteredText("Ring Dodge", 230, "#00ffff", "bold 46px system-ui, sans-serif");
      drawCenteredText(
        "Move the mouse or drag your finger",
        300,
        "#ffffff",
        "19px system-ui, sans-serif"
      );
      drawCenteredText(
        "to drive the car and dodge the rings.",
        326,
        "#ffffff",
        "19px system-ui, sans-serif"
      );
      drawCenteredText(
        "Click / tap to start",
        400,
        "#ffe066",
        "bold 24px system-ui, sans-serif"
      );
    }
  }

  let lastTime = performance.now();
  let accumulator = 0;

  function loop(now) {
    accumulator += now - lastTime;
    lastTime = now;
    if (accumulator > 200) accumulator = 200;

    while (accumulator >= STEP) {
      update();
      accumulator -= STEP;
    }

    render();
    requestAnimationFrame(loop);
  }

  canvas.addEventListener("pointerdown", (event) => {
    ensureAudio();
    const point = toGameCoords(event);
    pointerX = point.x;
    pointerY = point.y;

    if (state === "ready") {
      startGame();
    } else if (state === "crashed") {
      retryGame();
    }
    event.preventDefault();
  });

  canvas.addEventListener("pointermove", (event) => {
    const point = toGameCoords(event);
    pointerX = point.x;
    pointerY = point.y;
    if (event.pointerType !== "mouse") event.preventDefault();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      ensureAudio();
      if (state === "ready") {
        startGame();
      } else if (state === "crashed") {
        retryGame();
      }
      event.preventDefault();
    }
  });

  resetGame();
  requestAnimationFrame(loop);
})();
