// ────────────────────────────────────
// Camera — 2.5D 투영, 추적, 줌
// ────────────────────────────────────
class Camera {
  constructor() {
    // 월드 좌표 (카메라가 바라보는 지점)
    this.x = 0;
    this.y = 0;

    // 목표 좌표 (Lerp 타겟)
    this.targetX = 0;
    this.targetY = 0;

    // 줌
    this.zoom = 1.2;
    this.targetZoom = 1.2;
    this.minZoom = 0.4;
    this.maxZoom = 2.5;

    // 2.5D Y축 압축 비율 (0.55 ≈ 약 55도 비스듬히 위에서 내려다보는 느낌)
    this.ySquash = 0.55;

    // 부드러운 추적 속도
    this.smoothing = 6.0;
  }

  /** 매 프레임 호출 */
  update(dt) {
    const t = Math.min(1, this.smoothing * dt);
    this.x += (this.targetX - this.x) * t;
    this.y += (this.targetY - this.y) * t;
    this.zoom += (this.targetZoom - this.zoom) * t;
  }

  /** 카메라가 따라갈 대상 설정 (플레이어 월드 좌표) */
  follow(wx, wy) {
    this.targetX = wx;
    this.targetY = wy;
  }

  /** 마우스 휠 → 줌 */
  handleWheel(deltaY) {
    const step = 0.12;
    this.targetZoom += deltaY < 0 ? step : -step;
    this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom));
  }

  // ── 좌표 변환 ──────────────────────

  /**
   * 월드 좌표(wx, wy, wz) → 화면 픽셀 좌표
   * wz는 높이(점프, 벽붙기 등). 양수 = 위로.
   */
  worldToScreen(wx, wy, wz, canvasW, canvasH) {
    const halfW = canvasW * 0.5;
    const halfH = canvasH * 0.5;

    const sx = (wx - this.x) * this.zoom + halfW;
    const sy = ((wy - this.y) * this.ySquash - (wz || 0)) * this.zoom + halfH;

    return { x: sx, y: sy };
  }

  /**
   * 화면 좌표(sx, sy) → 월드 좌표 (z = 0 바닥면 기준)
   */
  screenToWorld(sx, sy, canvasW, canvasH) {
    const halfW = canvasW * 0.5;
    const halfH = canvasH * 0.5;

    const wx = (sx - halfW) / this.zoom + this.x;
    const wy = (sy - halfH) / this.zoom / this.ySquash + this.y;

    return { x: wx, y: wy };
  }

  /** 줌을 반영한 스케일 (스프라이트 크기에 활용) */
  get scale() {
    return this.zoom;
  }
}

const camera = new Camera();
