import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function MarkdownAnswer({ text }: { text: string }) {
  return (
    <div className="max-w-none text-[14px] leading-6 text-[#0F1324]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ ...props }) => <h1 className="mt-2 mb-2 text-[16px] font-bold" {...props} />,
          h2: ({ ...props }) => <h2 className="mt-2 mb-2 text-[15px] font-bold" {...props} />,
          h3: ({ ...props }) => <h3 className="mt-1 mb-1 text-[14px] font-semibold" {...props} />,
          p: ({ ...props }) => <p className="my-1 text-[14px] leading-6" {...props} />,
          ul: ({ ...props }) => <ul className="my-1 list-disc pl-5" {...props} />,
          ol: ({ ...props }) => <ol className="my-1 list-decimal pl-5" {...props} />,
          li: ({ ...props }) => <li className="my-0.5" {...props} />,
          a: ({ ...props }) => <a className="text-[#0B98FF] underline" {...props} />,
          code: ({ ...props }) => <code className="rounded bg-slate-100 px-1 py-0.5 text-[12px]" {...props} />,
          pre: ({ ...props }) => <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 text-[12px]" {...props} />,
          table: ({ ...props }) => <table className="my-2 w-full border-collapse text-[12px]" {...props} />,
          th: ({ ...props }) => <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left" {...props} />,
          td: ({ ...props }) => <td className="border border-slate-200 px-2 py-1" {...props} />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function AnimatedFormattedAnswer({ text }: { text: string }) {
  return <MarkdownAnswer text={text} />;
}

export function VisitorInfoModal({
  open,
  name,
  affiliation,
  onClose,
  onSave,
}: {
  open: boolean;
  name: string;
  affiliation: string;
  onClose: () => void;
  onSave: (name: string, affiliation: string) => void;
}) {
  const [localName, setLocalName] = useState(name);
  const [localAffiliation, setLocalAffiliation] = useState(affiliation);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F1324]/60 px-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(localName.trim(), localAffiliation.trim());
        }}
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-[0_18px_45px_rgba(15,19,36,0.25)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">309 coffee chat</p>
            <h3 className="text-2xl font-bold text-[#0F1324]">잠깐, 자기소개 좀 부탁드릴게요 ☕</h3>
            <p className="mt-1 text-sm text-slate-500">이름과 소속을 알려주시면 질문 맥락에 맞춰 더 정확하게 답변드릴 수 있어요. (선택)</p>
          </div>
        </div>
        <div className="mt-4 space-y-4">
          <label className="block text-sm font-semibold text-slate-700" htmlFor="visitor-name">이름 또는 이니셜</label>
          <input
            id="visitor-name"
            name="visitorName"
            value={localName}
            onChange={(event) => setLocalName(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
            placeholder="예) 최백호"
          />
          <label className="block text-sm font-semibold text-slate-700" htmlFor="visitor-affiliation">회사 / 팀</label>
          <input
            id="visitor-affiliation"
            name="visitorAffiliation"
            value={localAffiliation}
            onChange={(event) => setLocalAffiliation(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
            placeholder="예) 울진상사 전략팀"
          />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300">다음에 할게요</button>
          <button type="submit" className="rounded-full bg-[#0F1324] px-5 py-2 text-sm font-semibold text-white hover:bg-black">저장</button>
        </div>
      </form>
    </div>
  );
}

export function CompletionModal({
  open,
  name,
  affiliation,
  onClose,
  onSave,
}: {
  open: boolean;
  name: string;
  affiliation: string;
  onClose: () => void;
  onSave: (name: string, affiliation: string) => void;
}) {
  const [localName, setLocalName] = useState(name);
  const [localAffiliation, setLocalAffiliation] = useState(affiliation);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F1324]/60 px-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(localName.trim(), localAffiliation.trim());
          onClose();
        }}
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-[0_18px_45px_rgba(15,19,36,0.25)]"
      >
        <p className="text-sm font-semibold text-slate-500">5개 질문 완료</p>
        <h3 className="text-2xl font-bold text-[#0F1324]">마지막으로 프로필과 제안 정보를 남겨주세요</h3>
        <p className="mt-1 text-sm text-slate-500">이름/소속을 입력하고, 필요하면 바로 제안 메일을 보낼 수 있어요.</p>
        <div className="mt-4 space-y-4">
          <input value={localName} onChange={(event) => setLocalName(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="이름 또는 이니셜" />
          <input value={localAffiliation} onChange={(event) => setLocalAffiliation(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="회사 / 팀" />
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              window.location.href = 'mailto:hello@309designlab.com?subject=309%20Interview%20Agent%20Inquiry';
            }}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            나에게 제안하기
          </button>
          <button type="submit" className="rounded-full bg-[#0F1324] px-5 py-2 text-sm font-semibold text-white">저장하고 닫기</button>
        </div>
      </form>
    </div>
  );
}
