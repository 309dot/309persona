export interface InferredProfile {
  name: string | null;
  affiliation: string | null;
  role?: string;
  purpose?: string;
}

const COPULA = '(?:입니다|이에요|예요|이고요|이고)(?=$|[\\s,.!?~])';
// Only an explicit self-introduction at the start of the message counts as a name,
// e.g. "안녕하세요, 저는 김철수입니다" or "제 이름은 김철수예요".
const NAME_PATTERN = new RegExp(
  `^(?:(?:안녕하세요|안녕|반갑습니다|hello|hi)[\\s,!.~]*)?(?:저는|전|제\\s?이름은)\\s*([가-힣A-Za-z][가-힣A-Za-z ]{0,9}?)\\s*${COPULA}`,
  'i',
);
const AFFILIATION_PATTERN = new RegExp(`(?:소속은|회사는|팀은)\\s*([^,.\\n!?]{2,30}?)\\s*${COPULA}`);
const ROLE_HINTS = ['pm', '프로덕트 매니저', 'product manager', '디자이너', 'designer', '개발자', 'engineer', '리크루터', 'hr', '채용 담당'];
const PURPOSE_HINTS = ['채용', '면접', '협업', '프로젝트', '파트너십', '외주', '검토'];

/** Guess who is asking from the question text. Ordinary questions must not yield a name. */
export function inferVisitorProfile(text: string): InferredProfile {
  const normalized = text.trim();
  const lowered = normalized.toLowerCase();
  const name = normalized.match(NAME_PATTERN)?.[1]?.trim() ?? null;
  const affiliation = normalized.match(AFFILIATION_PATTERN)?.[1]?.trim() ?? null;
  return {
    name: name && name.length >= 2 ? name : null,
    affiliation,
    role: ROLE_HINTS.find((hint) => lowered.includes(hint)),
    purpose: PURPOSE_HINTS.find((hint) => lowered.includes(hint)),
  };
}
