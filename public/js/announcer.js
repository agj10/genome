// ────────────────────────────────────
// Announcer — 화면 중앙 이벤트 텍스트
// Canvas 위에 직접 렌더링
// ────────────────────────────────────
class Announcer {
  constructor() {
    this.queue = [];       // { text, startTime, duration, scale }
    this.countdown = null; // { from, current, startTime, onDone }
  }

  /** 화면 중앙에 텍스트를 duration(ms) 동안 표시 */
  announce(text, duration = 2000) {
    this.queue.push({
      text,
      startTime: performance.now(),
      duration,
    });
  }

  /** 3, 2, 1 카운트다운 후 onDone 호출 */
  startCountdown(from, onDone) {
    this.countdown = {
      from,
      current: from,
      startTime: performance.now(),
      onDone,
    };
  }

  /** 매 프레임 draw() 끝에 호출 */
  render(ctx, W, H) {
    const now = performance.now();

    // ── 일반 announce 텍스트 ──
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const item = this.queue[i];
      const elapsed = now - item.startTime;
      if (elapsed > item.duration) {
        this.queue.splice(i, 1);
        continue;
      }

      const progress = elapsed / item.duration;
      // 페이드인 → 유지 → 페이드아웃
      let alpha = 1;
      if (progress < 0.15) {
        alpha = progress / 0.15;
      } else if (progress > 0.7) {
        alpha = 1 - (progress - 0.7) / 0.3;
      }

      // 스케일 애니메이션 (살짝 커졌다 줄어듦)
      let scale = 1;
      if (progress < 0.1) {
        scale = 0.6 + (progress / 0.1) * 0.4;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(W / 2, H / 2 - 30);
      ctx.scale(scale, scale);

      // 텍스트 그림자
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.font = 'bold 48px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.text, 2, 2);

      // 텍스트
      ctx.fillStyle = '#ffffff';
      ctx.fillText(item.text, 0, 0);

      ctx.restore();
    }

    // ── 카운트다운 ──
    if (this.countdown) {
      const cd = this.countdown;
      const elapsed = now - cd.startTime;
      const secElapsed = elapsed / 1000;
      const newCurrent = cd.from - Math.floor(secElapsed);

      if (newCurrent !== cd.current && newCurrent >= 0) {
        cd.current = newCurrent;
      }

      if (newCurrent < 0) {
        // 카운트다운 종료
        if (cd.onDone) cd.onDone();
        this.countdown = null;
      } else {
        // 1초 내 진행률 (0~1)
        const frac = secElapsed - Math.floor(secElapsed);

        // 스케일: 크게 → 작게
        const scale = 1.8 - frac * 0.8;
        // 투명도: 불투명 → 투명
        const alpha = 1 - frac * 0.6;

        const displayNum = cd.current > 0 ? String(cd.current) : 'GO!';

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(W / 2, H / 2 + 20);
        ctx.scale(scale, scale);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.font = 'bold 80px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayNum, 2, 2);

        ctx.fillStyle = cd.current > 0 ? '#ffdd57' : '#48bb78';
        ctx.fillText(displayNum, 0, 0);

        ctx.restore();
      }
    }
  }
}

const announcer = new Announcer();
