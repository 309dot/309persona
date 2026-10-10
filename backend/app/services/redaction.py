"""Contact details kept out of anything the model reads."""

from __future__ import annotations

import re

# Korean mobile numbers; the whole line goes, since it is usually a contact line.
PHONE_LINE_RE = re.compile(r"^.*\b01[016789][-. ]?\d{3,4}[-. ]?\d{4}\b.*$", re.MULTILINE)
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
# The address visitors are told to write to may stay.
PUBLIC_EMAIL_DOMAIN = "309designlab.com"


def redact_contacts(text: str) -> str:
    text = PHONE_LINE_RE.sub("", text)
    return EMAIL_RE.sub(
        lambda match: match.group(0) if match.group(0).lower().endswith(PUBLIC_EMAIL_DOMAIN) else "[이메일 생략]",
        text,
    )
