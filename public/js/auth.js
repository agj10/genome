// 인증 상태 관리
let currentUser = null;
let currentToken = null;

// UI 요소
const loginScreen = document.getElementById('login-screen');
const registerScreen = document.getElementById('register-screen');
const menuScreen = document.getElementById('menu-screen');

const loginNickname = document.getElementById('login-nickname');
const loginPassword = document.getElementById('login-password');
const registerNickname = document.getElementById('register-nickname');
const registerPassword = document.getElementById('register-password');

const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const logoutBtn = document.getElementById('logout-btn');

const loginMessage = document.getElementById('login-message');
const registerMessage = document.getElementById('register-message');

const goToRegister = document.getElementById('go-to-register');
const goToLogin = document.getElementById('go-to-login');

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
    if (typeof checkUrlAndJoin === 'function') checkUrlAndJoin();
  } else {
    showLoginScreen();
  }
}

function showLoginScreen() {
  loginScreen.classList.add('active');
  registerScreen.classList.remove('active');
  menuScreen.classList.remove('active');
  document.getElementById('game-screen').classList.remove('active');
  loginMessage.textContent = '';
}

function showRegisterScreen() {
  loginScreen.classList.remove('active');
  registerScreen.classList.add('active');
  menuScreen.classList.remove('active');
  document.getElementById('game-screen').classList.remove('active');
  registerMessage.textContent = '';
}

function showMenuScreen() {
  loginScreen.classList.remove('active');
  registerScreen.classList.remove('active');
  menuScreen.classList.add('active');
  document.getElementById('game-screen').classList.remove('active');
  
  // UI 업데이트
  profileNickname.textContent = currentUser.nickname;
  profileTitle.textContent = currentUser.equipped_title;
  statMatches.textContent = currentUser.matches_played;
  statWins.textContent = currentUser.wins;
}

// 화면 전환 이벤트
goToRegister.addEventListener('click', (e) => {
  e.preventDefault();
  showRegisterScreen();
});

goToLogin.addEventListener('click', (e) => {
  e.preventDefault();
  showLoginScreen();
});

// 회원가입
registerBtn.addEventListener('click', async () => {
  const nickname = registerNickname.value.trim();
  const password = registerPassword.value;
  
  if (!nickname || !password) {
    registerMessage.textContent = '닉네임과 비밀번호를 입력해주세요.';
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
      registerMessage.style.color = '#38a169';
      registerMessage.textContent = '가입 성공! 로그인 화면으로 이동합니다...';
      setTimeout(() => {
        loginNickname.value = nickname;
        loginPassword.value = '';
        showLoginScreen();
      }, 1500);
    } else {
      registerMessage.style.color = '#e53e3e';
      registerMessage.textContent = data.error;
    }
  } catch (err) {
    registerMessage.style.color = '#e53e3e';
    registerMessage.textContent = '서버 통신 오류가 발생했습니다.';
  }
});

// 로그인
loginBtn.addEventListener('click', async () => {
  const nickname = loginNickname.value.trim();
  const password = loginPassword.value;
  
  if (!nickname || !password) {
    loginMessage.textContent = '닉네임과 비밀번호를 입력해주세요.';
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
      if (typeof checkUrlAndJoin === 'function') checkUrlAndJoin();
    } else {
      loginMessage.style.color = '#e53e3e';
      loginMessage.textContent = data.error;
    }
  } catch (err) {
    loginMessage.style.color = '#e53e3e';
    loginMessage.textContent = '서버 통신 오류가 발생했습니다.';
  }
});

// 엔터 키 로그인/가입 지원
loginPassword.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});
registerPassword.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') registerBtn.click();
});

// 로그아웃
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('genome_token');
  localStorage.removeItem('genome_user');
  currentToken = null;
  currentUser = null;
  loginPassword.value = ''; // 비밀번호 초기화
  showLoginScreen();
  if (typeof disconnectSocket === 'function') {
    disconnectSocket();
  }
});

// 초기화 실행
initAuth();
