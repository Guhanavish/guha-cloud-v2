const API = '/api';

function showError(msg) {
  const el = document.getElementById('errorMessage');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError() {
  const el = document.getElementById('errorMessage');
  el.classList.add('hidden');
}

async function request(url, options = {}) {
  const res = await fetch(`${API}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    credentials: 'include'
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.errors?.[0]?.msg || 'Request failed');
  return data;
}

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();
      const btn = loginForm.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'Signing in...';
      try {
        await request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            identifier: loginForm.identifier.value,
            password: loginForm.password.value
          })
        });
        window.location.href = '/dashboard';
      } catch (err) {
        showError(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();
      if (registerForm.password.value !== registerForm.confirmPassword.value) {
        return showError('Passwords do not match');
      }
      const btn = registerForm.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'Creating account...';
      try {
        await request('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            username: registerForm.username.value,
            email: registerForm.email.value,
            password: registerForm.password.value
          })
        });
        window.location.href = '/dashboard';
      } catch (err) {
        showError(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create Account';
      }
    });
  }
});