// 인증 상태 관리
let currentUser = null;
let currentToken = null;

// UI 요소
const authScreen = document.getElementById('auth-screen');
const menuScreen = document.getElementById('menu-screen');
const nicknameInput = document.getElementById('nickname-input');
const passwordInput = document.getElementById('password-input');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const logoutBtn = document.getElementById('logout-btn');
const authMessage = document.getElementById('auth-message');

// 로비 UI 요소
const profileNickname = document.getElementById('profile-nickname');
const profileTitle = document.getElementById('profile-title');
const statMatches = document.getElementById('stat-matches');
const statWins = document.getElementById('stat-wins');

// 초기화: 로컬스토리지에서 토큰 확인
function initAuth() {
  const token = localStorage.getItem('genome_token');
  const userJson = localStorage.getItem('genome_user');
  
  if (token && userJson) {
    currentToken = token;
    currentUser = JSON.parse(userJson);
    showMenuScreen();
  } else {
    showAuthScreen();
  }
}

function showAuthScreen() {
  authScreen.classList.add('active');
  menuScreen.classList.remove('active');
  document.getElementById('game-screen').classList.remove('active');
}

function showMenuScreen() {
  authScreen.classList.remove('active');
  menuScreen.classList.add('active');
  document.getElementById('game-screen').classList.remove('active');
  
  // UI 업데이트
  profileNickname.textContent = currentUser.nickname;
  profileTitle.textContent = currentUser.equipped_title;
  statMatches.textContent = currentUser.matches_played;
  statWins.textContent = currentUser.wins;
}

function showMessage(msg, isError = true) {
  authMessage.textContent = msg;
  authMessage.style.color = isError ? '#e53e3e' : '#38a169';
}

// 회원가입
registerBtn.addEventListener('click', async () => {
  const nickname = nicknameInput.value.trim();
  const password = passwordInput.value;
  
  if (!nickname || !password) {
    showMessage('닉네임과 비밀번호를 입력해주세요.');
    return;
  }
  
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, password })
    });
    
    const data = await res.json();
    if (res.ok) {
      showMessage('가입 성공! 로그인해주세요.', false);
    } else {
      showMessage(data.error);
    }
  } catch (err) {
    showMessage('서버 통신 오류가 발생했습니다.');
  }
});

// 로그인
loginBtn.addEventListener('click', async () => {
  const nickname = nicknameInput.value.trim();
  const password = passwordInput.value;
  
  if (!nickname || !password) {
    showMessage('닉네임과 비밀번호를 입력해주세요.');
    return;
  }
  
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, password })
    });
    
    const data = await res.json();
    if (res.ok) {
      currentToken = data.token;
      currentUser = data.user;
      localStorage.setItem('genome_token', currentToken);
      localStorage.setItem('genome_user', JSON.stringify(currentUser));
      showMenuScreen();
      showMessage(''); // 초기화
    } else {
      showMessage(data.error);
    }
  } catch (err) {
    showMessage('서버 통신 오류가 발생했습니다.');
  }
});

// 로그아웃
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('genome_token');
  localStorage.removeItem('genome_user');
  currentToken = null;
  currentUser = null;
  showAuthScreen();
  if (typeof disconnectSocket === 'function') {
    disconnectSocket();
  }
});

// 초기화 실행
initAuth();
