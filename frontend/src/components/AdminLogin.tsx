import { useState } from 'react';

import { Button } from './Button';
import { Input } from './Input';

interface Props {
  onSubmit: (email: string, password: string) => Promise<void> | void;
  loading?: boolean;
  error?: string;
}

export function AdminLogin({ onSubmit, loading, error }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(email, password);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-3xl bg-white/90 p-6 shadow-xl"
    >
      <h2 className="text-xl font-semibold text-slate-900">대시보드 접근</h2>
      <p className="text-sm text-slate-500">
        Firebase Auth에 등록된 계정으로 로그인하면 방문자 분석 대시보드를 확인할 수 있습니다.
      </p>
      <Input
        label="이메일"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        placeholder="you@example.com"
      />
      <Input
        label="비밀번호"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        placeholder="********"
      />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <Button type="submit" loading={loading}>
        로그인
      </Button>
    </form>
  );
}

