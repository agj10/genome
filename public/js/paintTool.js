class PaintTool {
  constructor(size) {
    this.size = size;
    // 오프스크린 캔버스 생성 (캐릭터 텍스처용)
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    
    // 초기화: 투명 배경
    this.ctx.clearRect(0, 0, size, size);
    
    this.currentTool = 'pen'; // 'pen', 'eraser', 'picker'
    this.currentColor = '#000000';
    this.currentSize = 5;
    
    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;
    
    // Undo/Redo 스택
    this.history = [];
    this.historyStep = -1;
    this.saveHistory(); // 초기 상태 저장
    
    this.setupUI();
  }
  
  setupUI() {
    this.btnPen = document.getElementById('tool-pen');
    this.btnEraser = document.getElementById('tool-eraser');
    this.btnPicker = document.getElementById('tool-picker');
    this.btnUndo = document.getElementById('tool-undo');
    this.btnRedo = document.getElementById('tool-redo');
    this.inputSize = document.getElementById('tool-size');
    this.inputColor = document.getElementById('tool-color');
    
    this.btnPen.addEventListener('click', () => this.setTool('pen'));
    this.btnEraser.addEventListener('click', () => this.setTool('eraser'));
    this.btnPicker.addEventListener('click', () => this.setTool('picker'));
    
    this.inputSize.addEventListener('input', (e) => {
      this.currentSize = e.target.value;
    });
    
    this.inputColor.addEventListener('input', (e) => {
      this.currentColor = e.target.value;
      if (this.currentTool === 'eraser') this.setTool('pen');
    });
    
    this.btnUndo.addEventListener('click', () => this.undo());
    this.btnRedo.addEventListener('click', () => this.redo());
  }
  
  setTool(tool) {
    this.currentTool = tool;
    
    // UI 업데이트
    this.btnPen.classList.toggle('active', tool === 'pen');
    this.btnEraser.classList.toggle('active', tool === 'eraser');
    this.btnPicker.classList.toggle('active', tool === 'picker');
  }
  
  saveHistory() {
    this.historyStep++;
    // 새로운 작업 시 미래 스택 제거
    if (this.historyStep < this.history.length) {
      this.history.length = this.historyStep;
    }
    this.history.push(this.canvas.toDataURL());
    // 스택 크기 제한 (최대 30)
    if (this.history.length > 30) {
      this.history.shift();
      this.historyStep--;
    }
  }
  
  undo() {
    if (this.historyStep > 0) {
      this.historyStep--;
      this.restoreFromHistory();
    }
  }
  
  redo() {
    if (this.historyStep < this.history.length - 1) {
      this.historyStep++;
      this.restoreFromHistory();
    }
  }
  
  restoreFromHistory() {
    const img = new Image();
    img.onload = () => {
      this.ctx.clearRect(0, 0, this.size, this.size);
      this.ctx.drawImage(img, 0, 0);
    };
    img.src = this.history[this.historyStep];
  }
  
  // 메인 캔버스 좌표를 플레이어 텍스처 좌표로 변환하여 그리기
  handlePointerDown(x, y, playerX, playerY) {
    // 캔버스 중앙(playerX, playerY)을 기준으로 한 텍스처 내 좌표 (-size/2 ~ size/2)
    const localX = x - playerX + (this.size / 2);
    const localY = y - playerY + (this.size / 2);
    
    // 텍스처 범위를 벗어났는지 확인
    if (localX < 0 || localX > this.size || localY < 0 || localY > this.size) {
      return false; // 그리기 무시
    }
    
    if (this.currentTool === 'picker') {
      this.pickColor(localX, localY);
      this.setTool('pen');
      return true;
    }
    
    this.isDrawing = true;
    this.lastX = localX;
    this.lastY = localY;
    
    this.drawPoint(localX, localY);
    return true; // 이벤트 처리함
  }
  
  handlePointerMove(x, y, playerX, playerY) {
    if (!this.isDrawing) return false;
    
    const localX = x - playerX + (this.size / 2);
    const localY = y - playerY + (this.size / 2);
    
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
    this.ctx.lineTo(localX, localY);
    this.ctx.stroke();
    
    this.lastX = localX;
    this.lastY = localY;
    
    return true;
  }
  
  handlePointerUp() {
    if (this.isDrawing) {
      this.isDrawing = false;
      this.saveHistory();
    }
  }
  
  drawPoint(x, y) {
    this.ctx.beginPath();
    if (this.currentTool === 'eraser') {
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.arc(x, y, this.currentSize / 2, 0, Math.PI * 2);
      this.ctx.fill();
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.fillStyle = this.currentColor;
      this.ctx.arc(x, y, this.currentSize / 2, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
  
  pickColor(x, y) {
    const pixel = this.ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    if (pixel[3] > 0) {
      // rgb to hex
      const hex = "#" + (1 << 24 | pixel[0] << 16 | pixel[1] << 8 | pixel[2]).toString(16).slice(1);
      this.currentColor = hex;
      this.inputColor.value = hex;
    }
  }

  // 서버에 전송할 이미지 데이터 추출
  getTextureData() {
    return this.canvas.toDataURL();
  }
}
