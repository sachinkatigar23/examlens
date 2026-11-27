"""PDF -> clean text per page, with repeated headers/footers removed."""

import re
from collections import Counter
from dataclasses import dataclass

import pymupdf


class ScannedPdfError(Exception):
    """The PDF has (almost) no text layer: it's images of pages."""


@dataclass
class Page:
    number: int  # 1-based, as printed for citations
    text: str


MIN_CHARS_PER_PAGE = 40  # below this on average, assume a scanned PDF

# Lines that are noise on exam papers regardless of position.
NOISE_LINE = re.compile(
    r"^\s*(p\.?\s*t\.?\s*o\.?|page\s*\d+(\s*of\s*\d+)?|\d{1,3}|-\s*\d+\s*-|(reg(istration)?\.?|roll|usn)\s*(no|number)?\.?\s*:?.*)\s*$",
    re.IGNORECASE,
)


# "LeakyBucketAlgorithm" -> "Leaky Bucket Algorithm". Some PDFs drop the spaces between words; long
# CamelCase runs are the common, safe-to-fix case. (Measured on real notes: rank unchanged, scores +0.01,
# and citation snippets become readable. All-lowercase run-ons are rare and left alone.)
GLUED_CAMEL = re.compile(r"\b[A-Za-z]*[a-z]{2}[A-Z][A-Za-z]*\b")
CAMEL_BOUNDARY = re.compile(r"(?<=[a-z]{2})(?=[A-Z][a-z])")


def _unglue(line: str) -> str:
    return GLUED_CAMEL.sub(lambda m: CAMEL_BOUNDARY.sub(" ", m.group()) if len(m.group()) >= 12 else m.group(), line)


def _normalise(line: str) -> str:
    # "Page 3 of 10" and "Page 4 of 10" should count as the same repeated line.
    return re.sub(r"\d+", "#", line.strip().lower())


def _strip_repeated_lines(pages: list[list[str]]) -> list[list[str]]:
    if len(pages) < 3:
        return pages
    # Count each distinct line once per page; lines on >= 60% of pages are headers/footers.
    counts = Counter(norm for lines in pages for norm in {_normalise(l) for l in lines if l.strip()})
    limit = max(2, int(len(pages) * 0.6))
    repeated = {norm for norm, n in counts.items() if n >= limit}
    return [[l for l in lines if _normalise(l) not in repeated] for lines in pages]


# PyMuPDF's default flags minus TEXT_PRESERVE_LIGATURES: "ﬁber" (one ligature character, common in PDFs
# exported from Word) comes out as "fiber", so it matches the word "fiber" in a question.
TEXT_FLAGS = pymupdf.TEXT_PRESERVE_WHITESPACE | pymupdf.TEXT_MEDIABOX_CLIP | pymupdf.TEXT_CID_FOR_UNKNOWN_UNICODE


def extract_pages(path: str) -> list[Page]:
    with pymupdf.open(path) as doc:
        raw = [page.get_text("text", sort=True, flags=TEXT_FLAGS) for page in doc]

    if not raw or sum(len(t.strip()) for t in raw) / len(raw) < MIN_CHARS_PER_PAGE:
        raise ScannedPdfError(
            "This looks like a scanned PDF (no selectable text). OCR is on the v2 list; "
            "for now please upload a PDF with real text."
        )

    lines_per_page = [t.splitlines() for t in raw]
    lines_per_page = _strip_repeated_lines(lines_per_page)

    pages = []
    for i, lines in enumerate(lines_per_page, start=1):
        kept = [_unglue(l.rstrip()) for l in lines if l.strip() and not NOISE_LINE.match(l)]
        pages.append(Page(number=i, text="\n".join(kept)))
    return pages
