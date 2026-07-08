// ────────────────────────────────────
// PaintTool — 오프스크린 캔버스 드로잉
// Camera 좌표 변환을 거쳐서 사용
// ────────────────────────────────────
class PaintTool {
  constructor(size) {
    this.size = size;
    this.canvas = document.createElement('canvas');
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

    this.currentTool = 'pen';  // pen | eraser | picker
    this.currentColor = '#000000';
    this.currentSize = 4;

    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;

    // Undo / Redo
    this.history = [];
    this.historyStep = -1;
    this.saveHistory();

    this.panelOpen = false;  // 패널 토글 상태

    this.setupUI();
  }

  setupUI() {
    this.btnPen     = document.getElementById('tool-pen');
    this.btnEraser  = document.getElementById('tool-eraser');
    this.btnPicker  = document.getElementById('tool-picker');
    this.btnUndo    = document.getElementById('tool-undo');
    this.btnRedo    = document.getElementById('tool-redo');
    this.inputSize  = document.getElementById('tool-size');
    this.inputColor = document.getElementById('tool-color');

    this.btnPen.addEventListener('click',    () => this.setTool('pen'));
    this.btnEraser.addEventListener('click', () => this.setTool('eraser'));
    this.btnPicker.addEventListener('click', () => this.setTool('picker'));
    this.btnUndo.addEventListener('click',   () => this.undo());
    this.btnRedo.addEventListener('click',   () => this.redo());

    this.inputSize.addEventListener('input', (e) => {
      this.currentSize = Number(e.target.value);
    });
    this.inputColor.addEventListener('input', (e) => {
      this.currentColor = e.target.value;
      if (this.currentTool === 'eraser') this.setTool('pen');
    });

    // 패널 토글 버튼
    const toggleBtn = document.getElementById('paint-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.togglePanel());
    }
  }

  togglePanel() {
    this.panelOpen = !this.panelOpen;
    const panel = document.getElementById('paint-panel');
    const btn   = document.getElementById('paint-toggle');
    if (this.panelOpen) {
      panel.classList.add('open');
      btn.textContent = '🎨 닫기';
    } else {
      panel.classList.remove('open');
      btn.textContent = '🎨 그리기';
    }
  }

  setTool(tool) {
    this.currentTool = tool;
    this.btnPen.classList.toggle('active',    tool === 'pen');
    this.btnEraser.classList.toggle('active', tool === 'eraser');
    this.btnPicker.classList.toggle('active', tool === 'picker');
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

  // ── Drawing ── 좌표는 이미 텍스처 로컬 좌표(0~size)로 변환된 값

  beginStroke(lx, ly) {
    if (this.currentTool === 'picker') {
      this._pickColor(lx, ly);
      this.setTool('pen');
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
      this.inputColor.value = hex;
    }
  }

  getTextureData() {
    return this.canvas.toDataURL();
  }
}
