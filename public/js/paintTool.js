// ────────────────────────────────────
// PaintTool — 오프스크린 캔버스 드로잉
// 도구: 펜, 지우개, 스포이드, 채우기
// ────────────────────────────────────
class PaintTool {
  constructor(size) {
    this.size = size;
    this.canvas = document.getElementById('paint-canvas');
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
    }
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    // 초기 기본 캐릭터: 하얀 원 + 테두리
    this.ctx.clearRect(0, 0, size, size);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = '#555';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    this.currentTool = 'pen';  // pen | eraser | picker | fill
    this.currentColor = '#000000';
    this.currentSize = 4;

    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;

    // Undo / Redo
    this.history = [];
    this.historyStep = -1;
    this.saveHistory();

    this.panelOpen = false;

    this.setupUI();
  }

  setupUI() {
    this.btnPen     = document.getElementById('tool-pen');
    this.btnEraser  = document.getElementById('tool-eraser');
    this.btnPicker  = document.getElementById('tool-picker');
    this.btnFill    = document.getElementById('tool-fill');
    this.btnUndo    = document.getElementById('tool-undo');
    this.btnRedo    = document.getElementById('tool-redo');
    this.inputSize  = document.getElementById('tool-size');
    this.inputColor = document.getElementById('tool-color');

    if (this.btnPen)    this.btnPen.addEventListener('click',    () => this.setTool('pen'));
    if (this.btnEraser) this.btnEraser.addEventListener('click', () => this.setTool('eraser'));
    if (this.btnPicker) this.btnPicker.addEventListener('click', () => this.setTool('picker'));
    if (this.btnFill)   this.btnFill.addEventListener('click',   () => this.setTool('fill'));
    if (this.btnUndo)   this.btnUndo.addEventListener('click',   () => this.undo());
    if (this.btnRedo)   this.btnRedo.addEventListener('click',   () => this.redo());

    if (this.inputSize) {
      this.inputSize.addEventListener('input', (e) => {
        this.currentSize = Number(e.target.value);
      });
    }
    if (this.inputColor) {
      this.inputColor.addEventListener('input', (e) => {
        this.currentColor = e.target.value;
        if (this.currentTool === 'eraser') this.setTool('pen');
      });
    }

    // 패널 토글 버튼
    const toggleBtn = document.getElementById('paint-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.togglePanel());
    }

    // 캔버스 마우스/터치 이벤트
    this.canvas.addEventListener('mousedown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onPointerMove(e));
    window.addEventListener('mouseup', () => this.onPointerUp());
    
    this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); this.onPointerDown(e.touches[0]); }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => { e.preventDefault(); this.onPointerMove(e.touches[0]); }, { passive: false });
    window.addEventListener('touchend', () => this.onPointerUp());
  }

  getPointerPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  onPointerDown(e) {
    const pos = this.getPointerPos(e);
    this.beginStroke(pos.x, pos.y);
  }

  onPointerMove(e) {
    if (!this.isDrawing) return;
    const pos = this.getPointerPos(e);
    this.continueStroke(pos.x, pos.y);
  }

  onPointerUp() {
    this.endStroke();
  }

  togglePanel() {
    this.panelOpen = !this.panelOpen;
    const panel = document.getElementById('paint-panel');
    const btn   = document.getElementById('paint-toggle');
    if (this.panelOpen) {
      panel.classList.add('open');
      if (btn) btn.textContent = '🎨 닫기';
    } else {
      panel.classList.remove('open');
      if (btn) btn.textContent = '🎨 그리기';
    }
  }

  openPanel() {
    if (!this.panelOpen) this.togglePanel();
  }

  closePanel() {
    if (this.panelOpen) this.togglePanel();
  }

  setTool(tool) {
    this.currentTool = tool;
    const btns = { pen: this.btnPen, eraser: this.btnEraser, picker: this.btnPicker, fill: this.btnFill };
    for (const [name, btn] of Object.entries(btns)) {
      if (btn) btn.classList.toggle('active', name === tool);
    }
  }

  // ── History ──

  saveHistory() {
    this.historyStep++;
    if (this.historyStep < this.history.length) {
      this.history.length = this.historyStep;
    }
    this.history.push(this.canvas.toDataURL());
    if (this.history.length > 30) {
      this.history.shift();
      this.historyStep--;
    }
  }

  undo() {
    if (this.historyStep > 0) {
      this.historyStep--;
      this._restore();
    }
  }

  redo() {
    if (this.historyStep < this.history.length - 1) {
      this.historyStep++;
      this._restore();
    }
  }

  _restore() {
    const img = new Image();
    img.onload = () => {
      this.ctx.clearRect(0, 0, this.size, this.size);
      this.ctx.drawImage(img, 0, 0);
    };
    img.src = this.history[this.historyStep];
  }

  // ── Drawing ──

  beginStroke(lx, ly) {
    if (this.currentTool === 'picker') {
      this._pickColor(lx, ly);
      this.setTool('pen');
      return;
    }
    if (this.currentTool === 'fill') {
      this._floodFill(Math.floor(lx), Math.floor(ly));
      return;
    }
    this.isDrawing = true;
    this.lastX = lx;
    this.lastY = ly;
    this._dot(lx, ly);
  }

  continueStroke(lx, ly) {
    if (!this.isDrawing) return;

    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.lineWidth = this.currentSize;

    if (this.currentTool === 'eraser') {
      this.ctx.globalCompositeOperation = 'destination-out';
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.strokeStyle = this.currentColor;
    }

    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(lx, ly);
    this.ctx.stroke();
    this.ctx.globalCompositeOperation = 'source-over';

    this.lastX = lx;
    this.lastY = ly;
  }

  endStroke() {
    if (this.isDrawing) {
      this.isDrawing = false;
      this.ctx.globalCompositeOperation = 'source-over';
      this.saveHistory();
    }
  }

  _dot(x, y) {
    this.ctx.beginPath();
    if (this.currentTool === 'eraser') {
      this.ctx.globalCompositeOperation = 'destination-out';
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.fillStyle = this.currentColor;
    }
    this.ctx.arc(x, y, this.currentSize / 2, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.globalCompositeOperation = 'source-over';
  }

  _pickColor(x, y) {
    const px = this.ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    if (px[3] > 0) {
      const hex = '#' + ((1 << 24) | (px[0] << 16) | (px[1] << 8) | px[2]).toString(16).slice(1);
      this.currentColor = hex;
      if (this.inputColor) this.inputColor.value = hex;
    }
  }

  // ── Flood Fill (BFS) ──
  _floodFill(startX, startY) {
    if (startX < 0 || startX >= this.size || startY < 0 || startY >= this.size) return;

    const imageData = this.ctx.getImageData(0, 0, this.size, this.size);
    const data = imageData.data;
    const w = this.size;
    const h = this.size;

    // 타겟 색상 (시작점의 색)
    const idx = (startY * w + startX) * 4;
    const targetR = data[idx];
    const targetG = data[idx + 1];
    const targetB = data[idx + 2];
    const targetA = data[idx + 3];

    // 채울 색상
    const fillColor = this._hexToRgb(this.currentColor);
    if (!fillColor) return;

    // 이미 같은 색이면 무시
    if (targetR === fillColor.r && targetG === fillColor.g && targetB === fillColor.b && targetA === 255) return;

    const tolerance = 30;
    const visited = new Uint8Array(w * h);
    const queue = [startX + startY * w];
    visited[startX + startY * w] = 1;

    const matchesTarget = (i) => {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const a = data[i * 4 + 3];
      return Math.abs(r - targetR) <= tolerance &&
             Math.abs(g - targetG) <= tolerance &&
             Math.abs(b - targetB) <= tolerance &&
             Math.abs(a - targetA) <= tolerance;
    };

    while (queue.length > 0) {
      const pos = queue.pop();
      const px = pos % w;
      const py = Math.floor(pos / w);

      data[pos * 4]     = fillColor.r;
      data[pos * 4 + 1] = fillColor.g;
      data[pos * 4 + 2] = fillColor.b;
      data[pos * 4 + 3] = 255;

      // 4방향
      const neighbors = [
        px > 0     ? pos - 1 : -1,
        px < w - 1 ? pos + 1 : -1,
        py > 0     ? pos - w : -1,
        py < h - 1 ? pos + w : -1,
      ];

      for (const n of neighbors) {
        if (n >= 0 && !visited[n] && matchesTarget(n)) {
          visited[n] = 1;
          queue.push(n);
        }
      }
    }

    this.ctx.putImageData(imageData, 0, 0);
    this.saveHistory();
  }

  _hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    } : null;
  }

  getTextureData() {
    return this.canvas.toDataURL();
  }
}
