'use client';

import { useState } from 'react';
import { authMessage } from '@webtwizz/cloud';
import { authClient } from '@/lib/auth/client';

export function SignInForm() {
  const [message, setMessage] = useState('');

  async function submit(form: FormData) {
    const { error } = await authClient.signIn.email({ email: String(form.get('email')), password: String(form.get('password')) });
    setMessage(error ? authMessage(error) : '');
  }

  return (
    <form action={submit}>
      <input name="email" type="email" />
      <input name="password" type="password" />
      <button>Sign in</button>
      {message && <p>{message}</p>}
    </form>
  );
}
