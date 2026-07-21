async function test() {
  try {
    // Test login with correct credentials
    const login = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'guhanavish', password: '20385' }),
      credentials: 'include'
    });
    console.log('Correct login:', login.status, await login.json());
    
    // Test login with wrong credentials
    const wrong = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'guhanavish', password: 'wrong' }),
      credentials: 'include'
    });
    console.log('Wrong login:', wrong.status, await wrong.json());
  } catch (e) {
    console.log('Error:', e.message);
  }
}
test();