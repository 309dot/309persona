import { useEffect } from 'react';

const ITEMS: [string, string][] = [
  ['저장하는 정보', '직접 입력한 이름·소속(선택), 질문과 답변, 답변 피드백, 방문 기록(무작위 방문 ID, 유입 경로, 시각)'],
  ['쓰는 곳', '질문에 답하고 답변 품질과 이용 통계를 확인하는 데 써요. 답변을 만들기 위해 질문과 직전 대화가 AI 모델 서버로 전송돼요.'],
  ['저장 위치', 'Google Firebase(Firestore)'],
  ['접속 IP', '짧은 시간에 질문이 몰리지 않도록 질문 수를 제한하는 데만 쓰고, 대화 기록에는 남기지 않아요.'],
  ['삭제 요청', 'hello@309designlab.com 으로 알려주시면 확인 후 지워요.'],
];

export function PrivacyNotice({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-title"
        className="max-w-xl rounded-3xl bg-white p-6 shadow-[0_35px_85px_rgba(15,19,36,0.35)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 id="privacy-title" className="text-2xl font-bold text-ink">
            개인정보 안내
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-200"
          >
            닫기
          </button>
        </div>
        <dl className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
          {ITEMS.map(([term, description]) => (
            <div key={term}>
              <dt className="font-semibold text-slate-800">{term}</dt>
              <dd>{description}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-slate-500">이름과 소속은 입력하지 않아도 모든 기능을 쓸 수 있어요.</p>
      </div>
    </div>
  );
}
