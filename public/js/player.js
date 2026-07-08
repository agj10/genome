class LocalPlayer {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.speed = 200; // 픽셀/초
    this.size = 20;
    this.color = '#667eea';
  }

  update(dt, input) {
    let dx = 0;
    let dy = 0;

    if (input.keys['w'] || input.keys['W']) dy -= 1;
    if (input.keys['s'] || input.keys['S']) dy += 1;
    if (input.keys['a'] || input.keys['A']) dx -= 1;
    if (input.keys['d'] || input.keys['D']) dx += 1;

    // 대각선 이동 정규화
    if (dx !== 0 && dy !== 0) {
      const length = Math.sqrt(dx * dx + dy * dy);
      dx /= length;
      dy /= length;
    }

    if (dx !== 0 || dy !== 0) {
      this.x += dx * this.speed * dt;
      this.y += dy * this.speed * dt;
      
      // 서버로 위치 전송
      emitMove(this.x, this.y);
    }
  }

  draw(ctx) {
    // 렌더링은 네트워크 플레이어 객체에서 주로 처리되지만, 로컬 예측/부드러운 이동을 위해 로컬도 그릴 수 있음.
    // 현재는 main.js에서 통합해서 그립니다.
  }
}
