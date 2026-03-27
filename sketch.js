/*
  Week 9 — Example 3: Adding Sound & Music

  Course: GBDA302 | Instructors: Dr. Karen Cochrane & David Han
  Date: Mar. 19, 2026

  Controls:
    A or D (Left / Right Arrow)   Horizontal movement
    W (Up Arrow)                  Jump
    Space Bar                     Attack
    ' (apostrophe)                Toggle Debug Screen
    M (while debug open)          Cycle Difficulty  (Easy → Medium → Hard → Easy)

  Difficulty modes:
    Easy   — normal movement speed, full ground, full visibility
    Medium — slower movement speed, gaps in the ground
    Hard   — slowest movement speed, gaps in the ground,
              fog-of-war with a small visibility radius around the player

  Tile key:
    g = groundTile.png       (surface ground)
    d = groundTileDeep.png   (deep ground, below surface)
      = empty (no sprite)
*/

let player;
let playerImg, bgImg;
let jumpSfx, musicSfx;
let musicStarted = false;
let debugMode = false;

let playerAnis = {
  idle: { row: 0, frames: 4, frameDelay: 10 },
  run: { row: 1, frames: 4, frameDelay: 3 },
  jump: { row: 2, frames: 3, frameDelay: Infinity, frame: 0 },
  attack: { row: 3, frames: 6, frameDelay: 2 },
};

let ground, groundDeep;
let groundImg, groundDeepImg;

let attacking = false;
let attackFrameCounter = 0;

// --- DIFFICULTY ---
// 0 = Easy  |  1 = Medium  |  2 = Hard
let difficulty = 0;
const DIFF_NAMES = ["Easy", "Medium", "Hard"];

// Movement speeds per difficulty
const MOVE_SPEEDS = [1.5, 0.8, 0.4];

// Fog-of-war graphics buffer (used in Hard mode)
let fogBuffer;
// Visibility radius in game-pixels for Hard mode
const VIS_RADIUS = 55;

// --- TILE MAPS ---
// Easy / default — solid ground rows
const levelEasy = [
  "              ",
  "              ",
  "              ",
  "              ",
  "              ",
  "       ggg    ",
  "gggggggggggggg",
  "dddddddddddddd",
];

// Medium & Hard — gaps punched into the surface and deep rows
const levelHard = [
  "              ",
  "              ",
  "              ",
  "              ",
  "              ",
  "       ggg    ",
  "ggg  ggg  gggg", // gaps at columns 3-4 and 9-10
  "ddd  ddd  dddd",
];

// --- LEVEL CONSTANTS ---
const VIEWW = 320,
  VIEWH = 180;
const TILE_W = 24,
  TILE_H = 24;
const FRAME_W = 32,
  FRAME_H = 32;
const MAP_START_Y = VIEWH - TILE_H * 4;
const GRAVITY = 10;

// --- SENSOR (declared here so rebuildLevel can reference it) ---
let sensor;

// ─────────────────────────────────────────────
function preload() {
  playerImg = loadImage("assets/foxSpriteSheet.png");
  bgImg = loadImage("assets/combinedBackground.png");
  groundImg = loadImage("assets/groundTile.png");
  groundDeepImg = loadImage("assets/groundTileDeep.png");

  if (typeof loadSound === "function") {
    jumpSfx = loadSound("assets/sfx/jump.wav");
    musicSfx = loadSound("assets/sfx/music.wav");
  }
}

// ─────────────────────────────────────────────
function setup() {
  new Canvas(VIEWW, VIEWH, "pixelated");
  allSprites.pixelPerfect = true;
  world.gravity.y = GRAVITY;

  if (musicSfx) musicSfx.setLoop(true);
  startMusicIfNeeded();

  // --- TILE GROUPS ---
  ground = new Group();
  ground.physics = "static";
  ground.img = groundImg;
  ground.tile = "g";

  groundDeep = new Group();
  groundDeep.physics = "static";
  groundDeep.img = groundDeepImg;
  groundDeep.tile = "d";

  new Tiles(levelEasy, 0, 0, TILE_W, TILE_H);

  // --- PLAYER ---
  player = new Sprite(FRAME_W, MAP_START_Y, FRAME_W, FRAME_H);
  player.spriteSheet = playerImg;
  player.rotationLock = true;
  player.anis.w = FRAME_W;
  player.anis.h = FRAME_H;
  player.anis.offset.y = -4;
  player.addAnis(playerAnis);
  player.ani = "idle";
  player.w = 18;
  player.h = 20;
  player.friction = 0;
  player.bounciness = 0;

  // --- GROUND SENSOR ---
  sensor = new Sprite();
  sensor.x = player.x;
  sensor.y = player.y + player.h / 2;
  sensor.w = player.w;
  sensor.h = 2;
  sensor.mass = 0.01;
  sensor.removeColliders();
  sensor.visible = false;
  let sensorJoint = new GlueJoint(player, sensor);
  sensorJoint.visible = false;

  // --- FOG BUFFER ---
  // Created at native resolution; we'll redraw it each frame in Hard mode.
  fogBuffer = createGraphics(VIEWW, VIEWH);
}

// ─────────────────────────────────────────────
// Rebuild ground tiles when difficulty changes.
// Removes every sprite in both tile groups and lays a fresh Tiles object.
function rebuildLevel() {
  // Remove all existing ground sprites
  for (let i = ground.length - 1; i >= 0; i--) ground[i].remove();
  for (let i = groundDeep.length - 1; i >= 0; i--) groundDeep[i].remove();

  const map = difficulty === 0 ? levelEasy : levelHard;
  new Tiles(map, 0, 0, TILE_W, TILE_H);

  // Reset player to a safe position above the left side of the map
  player.pos.x = FRAME_W;
  player.pos.y = MAP_START_Y;
  player.vel.x = 0;
  player.vel.y = 0;
}

// ─────────────────────────────────────────────
// Draw the fog-of-war overlay for Hard mode.
// We use a p5.Graphics buffer: fill it black, then "erase" a circle
// around the player using a radial gradient drawn with blendMode(LIGHTEST).
function drawFog() {
  // Convert player world position to screen coordinates.
  // Since the camera is centred on the canvas (no scrolling in this demo)
  // the world coords == screen coords directly.
  let px = player.pos.x;
  let py = player.pos.y;

  fogBuffer.clear();
  fogBuffer.background(0, 0, 0, 220); // dark fog, slight transparency

  // Punch a radial "light" hole: draw concentric circles from transparent
  // in the centre fading to the fog colour at the edge, using LIGHTEST blend.
  fogBuffer.push();
  fogBuffer.blendMode(LIGHTEST); // lighten = effectively erases the black
  for (let r = VIS_RADIUS; r > 0; r -= 1) {
    let t = r / VIS_RADIUS; // 1 at edge, 0 at centre
    let alpha = lerp(255, 0, t); // opaque at centre, transparent at edge
    fogBuffer.noStroke();
    fogBuffer.fill(255, 255, 255, alpha);
    fogBuffer.ellipse(px, py, r * 2, r * 2);
  }
  fogBuffer.pop();

  // Draw the buffer on top of the world (camera already off from caller)
  image(fogBuffer, 0, 0);
}

// ─────────────────────────────────────────────
function startMusicIfNeeded() {
  if (musicStarted || !musicSfx) return;
  const startLoop = () => {
    if (!musicSfx.isPlaying()) musicSfx.play();
    musicStarted = musicSfx.isPlaying();
  };
  const maybePromise = userStartAudio();
  if (maybePromise && typeof maybePromise.then === "function") {
    maybePromise.then(startLoop).catch(() => {});
  } else {
    startLoop();
  }
}

function keyPressed() {
  startMusicIfNeeded();
}
function mousePressed() {
  startMusicIfNeeded();
}
function touchStarted() {
  startMusicIfNeeded();
  return false;
}

// ─────────────────────────────────────────────
function draw() {
  // --- BACKGROUND ---
  camera.off();
  imageMode(CORNER);
  image(bgImg, 0, 0, bgImg.width, bgImg.height);
  camera.on();

  // --- PLAYER CONTROLS ---
  let grounded = sensor.overlapping(ground);

  // -- DEBUG TOGGLE --
  if (kb.presses("'")) debugMode = !debugMode;

  // -- DIFFICULTY CYCLE (only while debug is open) --
  if (debugMode && kb.presses("m")) {
    let prev = difficulty;
    difficulty = (difficulty + 1) % 3;
    // Rebuild the level if the ground layout needs to change
    if (prev === 0 || difficulty === 0) rebuildLevel();
  }

  // -- ATTACK INPUT --
  if (grounded && !attacking && kb.presses("space")) {
    attacking = true;
    attackFrameCounter = 0;
    player.vel.x = 0;
    player.ani.frame = 0;
    player.ani = "attack";
    player.ani.play();
  }

  // -- JUMP --
  if (grounded && kb.presses("up")) {
    player.vel.y = -4;
    if (jumpSfx) jumpSfx.play();
  }

  // --- STATE MACHINE ---
  if (attacking) {
    attackFrameCounter++;
    if (attackFrameCounter > 12) {
      attacking = false;
      attackFrameCounter = 0;
    }
  } else if (!grounded) {
    player.ani = "jump";
    player.ani.frame = player.vel.y < 0 ? 0 : 1;
  } else {
    player.ani = kb.pressing("left") || kb.pressing("right") ? "run" : "idle";
  }

  // --- MOVEMENT (speed varies by difficulty) ---
  let spd = MOVE_SPEEDS[difficulty];
  if (!attacking) {
    player.vel.x = 0;
    if (kb.pressing("left")) {
      player.vel.x = -spd;
      player.mirror.x = true;
    } else if (kb.pressing("right")) {
      player.vel.x = spd;
      player.mirror.x = false;
    }
  }

  // --- KEEP IN VIEW ---
  player.pos.x = constrain(player.pos.x, FRAME_W / 2, VIEWW - FRAME_W / 2);

  // --- HARD MODE FOG OF WAR ---
  if (difficulty === 2) {
    camera.off();
    drawFog();
    camera.on();
  }

  // --- DEBUG SCREEN ---
  if (debugMode) {
    camera.off();
    fill(0, 0, 0, 160);
    noStroke();
    rect(0, 0, VIEWW, VIEWH);

    fill(255);
    textSize(8);

    // Stats
    text(`Player X:   ${player.x.toFixed(2)}`, 10, 16);
    text(`Player Y:   ${player.y.toFixed(2)}`, 10, 27);
    text(`Velocity X: ${player.vel.x.toFixed(2)}`, 10, 38);
    text(`Velocity Y: ${player.vel.y.toFixed(2)}`, 10, 49);
    text(`Grounded:   ${grounded}`, 10, 60);
    text(`Attacking:  ${attacking}`, 10, 71);
    text(`Animation:  ${player.ani.name}`, 10, 82);

    // Difficulty display
    let diffColours = ["#44ff88", "#ffdd44", "#ff5555"];
    let diffCol = diffColours[difficulty];
    textSize(8);
    fill(180);
    text("DIFFICULTY:", 10, 100);

    // Highlight the active difficulty, dim the others
    let labels = ["[Easy]", "[Medium]", "[Hard]"];
    let xPos = [10, 55, 115];
    for (let i = 0; i < 3; i++) {
      if (i === difficulty) {
        fill(diffCol);
        textSize(9);
      } else {
        fill(100);
        textSize(8);
      }
      text(labels[i], xPos[i], 112);

      if (player.pos.y > VIEWH + 50) {
        player.pos.x = FRAME_W;
        player.pos.y = MAP_START_Y;
        player.vel.x = 0;
        player.vel.y = 0;
        attacking = false;
        attackFrameCounter = 0;
        player.ani = "idle";
      }
    }

    // Instruction hint
    fill(160);
    textSize(7);
    text("Press M to cycle difficulty", 10, 125);

    // Per-mode description
    let descs = [
      "Normal speed  |  Solid ground  |  Full vision",
      "Slow speed  |  Gaps in ground  |  Full vision",
      "Slowest speed  |  Gaps in ground  |  Limited vision",
    ];
    fill(200);
    textSize(7);
    text(descs[difficulty], 10, 136);

    camera.on();
  }
}
