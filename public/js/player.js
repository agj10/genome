// ────────────────────────────────────
// LocalPlayer — 클라이언트 예측 이동
// ────────────────────────────────────
class LocalPlayer {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.speed = 220;   // 월드 단위/초
    this.radius = 26;   // 스프라이트 반지름 (약간 크게)
  }

  update(dt, input) {
    let dx = 0;
    let dy = 0;

    if (input.keys['w'] || input.keys['W'] || input.keys['ArrowUp'])    dy -= 1;
    if (input.keys['s'] || input.keys['S'] || input.keys['ArrowDown'])  dy += 1;
    if (input.keys['a'] || input.keys['A'] || input.keys['ArrowLeft'])  dx -= 1;
    if (input.keys['d'] || input.keys['D'] || input.keys['ArrowRight']) dx += 1;

    // 대각선 정규화
    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
    }

    if (dx !== 0 || dy !== 0) {
      this.x += dx * this.speed * dt;
      this.y += dy * this.speed * dt;
    }
  }
}
