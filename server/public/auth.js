// Basit selector yardımcıları
const qs = (sel, root = document) => root.querySelector(sel);
const loginForm = qs('#loginForm');
const registerForm = qs('#registerForm');
const tabLogin = qs('#tabLogin');
const tabRegister = qs('#tabRegister');
const panels = qs('#panels');
const msg = qs('#msg');

// Sekme geçişi
function setPanel(which) {
  panels.dataset.active = which;
  if (which === 'login') {
    loginForm.hidden = false;
    registerForm.hidden = true;
    tabLogin.classList.add('is-active');
    tabLogin.setAttribute('aria-selected', 'true');
    tabRegister.classList.remove('is-active');
    tabRegister.setAttribute('aria-selected', 'false');
  } else {
    loginForm.hidden = true;
    registerForm.hidden = false;
    tabRegister.classList.add('is-active');
    tabRegister.setAttribute('aria-selected', 'true');
    tabLogin.classList.remove('is-active');
    tabLogin.setAttribute('aria-selected', 'false');
  }
}

tabLogin?.addEventListener('click', () => setPanel('login'));
tabRegister?.addEventListener('click', () => setPanel('register'));

// Swipe desteği
let startX = 0;
let endX = 0;
panels.addEventListener('touchstart', e => {
  startX = e.touches[0].clientX;
});

panels.addEventListener('touchmove', e => {
  endX = e.touches[0].clientX;
});

panels.addEventListener('touchend', () => {
  const diff = endX - startX;
  if (diff > 50) {
    setPanel('login');
  } else if (diff < -50) {
    setPanel('register');
  }
});

function showMessage(text) {
  msg.hidden = false;
  msg.innerText = text;
}

function clearMessage() {
  msg.hidden = true;
  msg.innerText = '';
}

function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.dataset.prev = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.prev || '';
  }
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data?.error || 'İstek başarısız'), { status: res.status, data });
  }
  return data;
}

async function verifyAndGo() {
  const ok = await fetch('/api/user/me', { credentials: 'include' }).then(r => r.ok).catch(() => false);
  if (ok) location.href = '/';
}

loginForm?.addEventListener('submit', async e => {
  e.preventDefault();
  clearMessage();
  const email = qs('#loginEmail').value.trim();
  const password = qs('#loginPassword').value;
  if (!emailRe.test(email) || password.length < 6) {
    showMessage('Geçerli bir e-posta ve şifre girin.');
    return;
  }
  const btn = qs('#loginBtn');
  setLoading(btn, true);
  try {
    const data = await api('/api/auth/login', { email, password });
    const token = data?.accessToken;
    const remember = qs('#rememberMe').checked;
    if (token) (remember ? localStorage : sessionStorage).setItem('accessToken', token);
    await verifyAndGo();
    showMessage('Giriş başarılı, yönlendiriliyorsunuz…');
  } catch (err) {
    showMessage(err.status === 401 ? 'Geçersiz bilgiler.' : err.status === 429 ? 'Çok fazla deneme, lütfen bekleyin.' : 'Sunucu hatası.');
  } finally {
    setLoading(btn, false);
  }
});

registerForm?.addEventListener('submit', async e => {
  e.preventDefault();
  clearMessage();
  const email = qs('#regEmail').value.trim();
  const username = qs('#regUsername').value.trim();
  const password = qs('#regPassword').value;
  if (!emailRe.test(email) || username.length < 3 || password.length < 6) {
    showMessage('Geçerli bilgiler girin.');
    return;
  }
  const btn = qs('#registerBtn');
  setLoading(btn, true);
  try {
    await api('/api/auth/register', { email, username, password });
    showMessage('Kayıt başarılı! Şimdi giriş yapın.');
    setPanel('login');
  } catch (err) {
    showMessage(err.status === 409 ? 'Bu e-posta/kullanıcı adı kullanımda.' : err.status === 429 ? 'Çok fazla deneme, lütfen bekleyin.' : 'Sunucu hatası.');
  } finally {
    setLoading(btn, false);
  }
});
