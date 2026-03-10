from __future__ import annotations

import re


def sanitize_evidence_text(text: str) -> str:
    t = (text or "").replace("\n", " ").strip()
    t = re.sub(r"\*\*([^*]+)\*\*", r"\1", t)
    t = re.sub(r"#+\s*\d+\.?\s*", "", t)
    t = re.sub(r"#+\s*", "", t)
    t = re.sub(r"[•·]+", " ", t)
    t = re.sub(r"[“”\"']", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def compact_evidence(text: str, max_chars: int = 88) -> str:
    cleaned = sanitize_evidence_text(text)
    compact = re.split(r"\s{2,}|\s[-–—]\s|총괄|도입 및 운영|브랜드 가이드", cleaned)[0].strip()
    first_sentence = re.split(r"(?<=[.!?。])\s+", compact)[0]
    result = (first_sentence or compact).strip()
    return result[:max_chars].rstrip(" ,.;:-")
