const ISLANDS = [
  { x: 264, y: 136, width: 240, height: 240, radius: 44 },
  { x: 970, y: 138, width: 172, height: 172, radius: 40 },
  { x: 1418, y: 202, width: 172, height: 172, radius: 40 },
  { x: 522, y: 650, width: 172, height: 172, radius: 40 },
  { x: 1224, y: 584, width: 240, height: 240, radius: 44 },
];
const WIDTH = 1792;
const HEIGHT = 1024;

function wrap(angle) {
  let value = angle % (Math.PI * 2);
  if (value > Math.PI) value -= Math.PI * 2;
  if (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function blocked(x, y) {
  if (x < 60 || y < 60 || x > WIDTH - 60 || y > HEIGHT - 60) return true;
  return ISLANDS.some((c) => {
    const nx = Math.min(c.x + c.width - c.radius, Math.max(c.x + c.radius, x));
    const ny = Math.min(c.y + c.height - c.radius, Math.max(c.y + c.radius, y));
    return Math.hypot(x - nx, y - ny) < c.radius + 40;
  });
}

export function decide(state) {
  const player = state.player;
  const commands = { forward: true, turnLeft: false, turnRight: false, fireFront: false, fireLeft: false, fireRight: false };
  let desired = player.angle;
  const enemies = state.enemies
    .map((enemy) => ({ ...enemy, distance: Math.hypot(enemy.x - player.x, enemy.y - player.y), bearing: Math.atan2(enemy.y - player.y, enemy.x - player.x) }))
    .sort((a, b) => a.distance - b.distance);
  const threat = enemies.find((enemy) => enemy.kind === 'chaser' && enemy.distance < 300);
  const target = enemies[0];
  for (const enemy of enemies) {
    const relative = wrap(enemy.bearing - player.angle);
    if (enemy.distance < 520 && Math.abs(relative) < 0.12) commands.fireFront = true;
    if (enemy.distance < 380 && Math.abs(Math.abs(relative) - Math.PI / 2) < 0.35) {
      if (relative < 0) commands.fireLeft = true;
      else commands.fireRight = true;
    }
  }
  if (threat) {
    const relative = wrap(threat.bearing - player.angle);
    desired = threat.bearing + (relative < 0 ? Math.PI / 2 : -Math.PI / 2);
  } else if (target) {
    desired = target.distance > 260 ? target.bearing : target.bearing + Math.PI / 2;
  } else {
    desired = Math.atan2(HEIGHT / 2 - player.y, WIDTH / 2 - player.x);
  }
  for (const offset of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4]) {
    const angle = desired + offset;
    if (!blocked(player.x + Math.cos(angle) * 130, player.y + Math.sin(angle) * 130)) {
      desired = angle;
      break;
    }
  }
  const delta = wrap(desired - player.angle);
  if (delta > 0.06) commands.turnRight = true;
  else if (delta < -0.06) commands.turnLeft = true;
  return commands;
}
