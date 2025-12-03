import { useState } from 'react';

import { createVisitor } from '../services/api';
import type { SessionInfo } from '../types/api';

interface VisitorModalProps {
  isOpen: boolean;
  defaultRef?: string;
  canClose?: boolean;
  onClose?: () => void;
  onSuccess: (session: SessionInfo) => void;
}

export function VisitorModal({ isOpen, defaultRef = 'direct', canClose = false, onClose, onSuccess }: VisitorModalProps) {
  const [form, setForm] = useState({
    visitorName: '',
    visitorAffiliation: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.visitorName.trim()) {
      setError('이름 또는 이니셜을 입력해 주세요.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const sessionInfo = await createVisitor({
        visitorName: form.visitorName.trim(),
        visitorAffiliation: form.visitorAffiliation.trim(),
        visitRef: defaultRef,
      });
      onSuccess(sessionInfo);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_10px_16px_-3px_rgba(20,21,26,0.08),0_3px_6px_-2px_rgba(20,21,26,0.05)]">
        <div className="mb-6 space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">커피챗을 시작하기 전에</h2>
          <p className="text-sm text-slate-600">간단한 연락처 정보를 남겨 주시면, 309가 더 잘 준비할 수 있어요.</p>
          <p className="text-xs text-slate-400">저장되는 정보는 세션 분석과 면접 준비에만 활용됩니다.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="sr-only" htmlFor="modal-name">
              이름 또는 이니셜
            </label>
            <input
              id="modal-name"
              type="text"
              value={form.visitorName}
              onChange={(event) => handleChange('visitorName', event.target.value)}
              placeholder="이름 또는 이니셜"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-inner shadow-black/5 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="sr-only" htmlFor="modal-affiliation">
              소속 또는 회사명
            </label>
            <input
              id="modal-affiliation"
              type="text"
              value={form.visitorAffiliation}
              onChange={(event) => handleChange('visitorAffiliation', event.target.value)}
              placeholder="소속 / 회사명"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-inner shadow-black/5 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
            />
          </div>
          {error ? <p className="text-xs text-rose-500">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-slate-900 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:bg-slate-400"
          >
            {loading ? '등록 중...' : 'confirm'}
          </button>
        </form>
        {canClose && onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full bg-slate-100 p-1 text-slate-600 transition hover:bg-slate-200"
            aria-label="모달 닫기"
          >
            ×
          </button>
        ) : (
          <div className="absolute right-4 top-4 rounded-full bg-slate-100/60 p-1 text-slate-300">×</div>
        )}
      </div>
    </div>
  );
}

