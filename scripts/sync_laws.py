#!/usr/bin/env python3
"""법제처(국가법령정보) Open API → data/laws_data.json 동기화 배치.

- 인증키(OC)는 환경변수 LAW_OC 로만 받습니다(GitHub Actions에서는 Secrets → env).
  키는 로그·파일 어디에도 출력하지 않습니다.
- data/law_sources.json 의 법령 목록을 수집해 조(條) 단위로 정규화하고,
  매뉴얼(data/manual_checklist.json)이 참조하는 조문(또는 --all 시 전체)을 저장합니다.
- 이전 버전과 비교해 바뀐 조문에 changed_at·prev_text 를 기록하고 data/changes.json 에 이력을 남깁니다.
  웹 화면은 changed_at 이 항목의 reviewed_at 보다 늦으면 "법령 개정 - 매뉴얼 현행화 필요" 배지를 띄웁니다.

사용법:
  LAW_OC=발급키 python scripts/sync_laws.py            # 매뉴얼 참조 조문만
  LAW_OC=발급키 python scripts/sync_laws.py --all      # 전체 조문
  python scripts/sync_laws.py --dry-run                 # 파일을 쓰지 않고 변경 요약만
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
API_BASE = "https://www.law.go.kr/DRF"
KST = dt.timezone(dt.timedelta(hours=9))
USER_AGENT = "compliance-manual-sync/1.0"


class SyncError(Exception):
    """수집 실패. 메시지에 인증키가 포함되지 않도록 URL 대신 법령명만 담는다."""


# ──────────────────────────── HTTP ────────────────────────────

def http_get(endpoint: str, params: dict, oc: str, retries: int = 3, timeout: int = 30) -> bytes:
    query = urllib.parse.urlencode({"OC": oc, **params})
    url = f"{API_BASE}/{endpoint}?{query}"
    last: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read()
            if not body.strip():
                raise SyncError("빈 응답")
            return body
        except (urllib.error.URLError, TimeoutError, SyncError, ConnectionError) as e:  # noqa: PERF203
            last = e
            if attempt < retries:
                time.sleep(2 ** attempt)
    # URL(=인증키 포함)을 노출하지 않기 위해 예외 원문 대신 유형만 남긴다
    raise SyncError(f"{endpoint} 호출 실패 ({type(last).__name__})")


def parse_xml(body: bytes, what: str) -> ET.Element:
    try:
        root = ET.fromstring(body)
    except ET.ParseError as e:
        snippet = body[:200].decode("utf-8", "replace")
        if "OC" in snippet or "인증" in snippet or "<html" in snippet.lower():
            raise SyncError(f"{what}: XML이 아닌 응답(인증키·등록 IP/도메인 확인 필요)") from e
        raise SyncError(f"{what}: XML 파싱 실패") from e
    return root


def txt(el: ET.Element | None, tag: str) -> str:
    if el is None:
        return ""
    found = el.find(tag)
    return (found.text or "").strip() if found is not None and found.text else ""


def ymd(s: str) -> str | None:
    s = re.sub(r"\D", "", s or "")
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}" if len(s) == 8 else None


# ──────────────────────────── 검색 ────────────────────────────

def search_current(target: str, name: str, oc: str) -> dict:
    """정확히 같은 이름의 현행 법령/행정규칙을 찾고, 시행예정 개정도 함께 돌려준다."""
    body = http_get("lawSearch.do", {"target": target, "type": "XML", "query": name, "display": 50}, oc)
    root = parse_xml(body, name)
    norm = lambda s: re.sub(r"\s+", "", s or "")  # noqa: E731
    today = dt.datetime.now(KST).strftime("%Y-%m-%d")
    rows = []
    if target == "law":
        for el in root.iter("law"):
            rows.append({
                "name": txt(el, "법령명한글"),
                "mst": txt(el, "법령일련번호"),
                "lawId": txt(el, "법령ID"),
                "promulgated": ymd(txt(el, "공포일자")),
                "effective": ymd(txt(el, "시행일자")),
                "status": txt(el, "현행연혁코드"),
                "note": txt(el, "제개정구분명"),
            })
    else:
        for el in root.iter("admrul"):
            rows.append({
                "name": txt(el, "행정규칙명"),
                "serial": txt(el, "행정규칙일련번호"),
                "admRulId": txt(el, "행정규칙ID"),
                "promulgated": ymd(txt(el, "발령일자")),
                "effective": ymd(txt(el, "시행일자")) or ymd(txt(el, "발령일자")),
                "status": txt(el, "현행연혁구분"),
                "note": txt(el, "제개정구분명"),
            })
    rows = [r for r in rows if norm(r["name"]) == norm(name)]
    if not rows:
        raise SyncError(f"'{name}' 검색 결과 없음")
    current = [r for r in rows if "현행" in (r["status"] or "")] or [r for r in rows if (r["effective"] or "") <= today]
    if not current:
        raise SyncError(f"'{name}' 현행본을 찾지 못함")
    cur = max(current, key=lambda r: (r["effective"] or "", r["promulgated"] or ""))
    pending = sorted(
        ({"effective": r["effective"], "promulgated": r["promulgated"], "note": r["note"]}
         for r in rows if (r["effective"] or "") > today),
        key=lambda p: p["effective"] or "",
    )
    cur["pending"] = pending
    return cur


# ──────────────────────────── 본문 파싱 ────────────────────────────

def jo_label(num: str, branch: str) -> str:
    n = str(int(num)) if num.isdigit() else num
    b = branch.strip() if branch else ""
    return f"제{n}조" + (f"의{int(b)}" if b.isdigit() and int(b) > 0 else "")


HEADING_RE = re.compile(r"^\s*제\s*\d+\s*조(?:\s*의\s*\d+)?\s*(?:\([^)]*\))?\s*")


def parse_law_articles(root: ET.Element) -> dict[str, dict]:
    """lawService.do?target=law 응답 → {'제45조': {'title':..., 'text':...}}"""
    out: dict[str, dict] = {}
    for unit in root.iter("조문단위"):
        if txt(unit, "조문여부") and txt(unit, "조문여부") != "조문":
            continue  # 장·절 제목(전문)
        num = txt(unit, "조문번호")
        if not num:
            continue
        label = jo_label(num, txt(unit, "조문가지번호"))
        title = txt(unit, "조문제목")
        lines: list[str] = []
        head = txt(unit, "조문내용")
        body_head = HEADING_RE.sub("", head).strip()
        hangs = unit.findall("항")
        if body_head:
            lines.append(body_head)
        for hang in hangs:
            hc = txt(hang, "항내용")
            if hc:
                lines.append(hc)
            for ho in hang.findall("호"):
                c = txt(ho, "호내용")
                if c:
                    lines.append(c)
                for mok in ho.findall("목"):
                    m = txt(mok, "목내용")
                    if m:
                        lines.append(m)
        # 항 없이 호가 바로 달린 조문
        if not hangs:
            for ho in unit.findall("호"):
                c = txt(ho, "호내용")
                if c:
                    lines.append(c)
                for mok in ho.findall("목"):
                    m = txt(mok, "목내용")
                    if m:
                        lines.append(m)
        text = normalize_text("\n".join(lines))
        if "삭제" in title or (not title and re.fullmatch(r"삭제.*", text or "")):
            title = title or "삭제"
        out[label] = {"title": title, "text": text}
    return out


# 행정규칙 조문 머리: 줄 맨 앞의 '제4-6조(제목)' · '제4-17조의3' — 본문 속 '제3-11조제1항에 따른'은 제외
ADM_HEAD_RE = re.compile(
    r"^[ \t\u3000]*(제\s*\d+(?:\s*-\s*\d+)*\s*조(?:\s*의\s*\d+)?)(?=[ \t\u3000]*(?:\(|$|[^\S\n]))"
    r"[ \t\u3000]*(?:\(([^)\n]*)\))?",
    re.M,
)
# 편·장·절·관 제목 줄 (조문 본문에서 제거)
ADM_SECTION_RE = re.compile(r"^[ \t\u3000]*제\s*\d+\s*(?:편|장|절|관)(?:\s|$).*$", re.M)


def parse_admrul_articles(root: ET.Element) -> dict[str, dict]:
    """lawService.do?target=admrul 응답 → {'제4-6조': {...}}

    응답에 따라 <조문내용> 이 조문마다 하나씩 오기도 하고, 여러 조문이 한 덩어리로 오기도 한다.
    모든 <조문내용> 텍스트를 이어 붙인 뒤 줄 맨 앞의 조문 머리를 기준으로 나눈다.
    """
    chunks = [(el.text or "") for el in root.iter("조문내용")]
    blob = "\n".join(c.strip("\r\n") for c in chunks if c and c.strip())
    out: dict[str, dict] = {}
    heads = list(ADM_HEAD_RE.finditer(blob))
    for i, m in enumerate(heads):
        label = re.sub(r"\s+", "", m.group(1))
        if label in out:
            continue  # 부칙 등 뒤쪽 중복 번호는 무시
        end = heads[i + 1].start() if i + 1 < len(heads) else len(blob)
        body = ADM_SECTION_RE.sub("", blob[m.end():end])
        out[label] = {"title": (m.group(2) or "").strip(), "text": normalize_text(body)}
    return out


def describe_xml(root: ET.Element) -> str:
    """조문 0건일 때 응답 구조만 요약 (본문·URL·인증키 미포함)"""
    counts: dict[str, int] = {}
    for el in root.iter():
        counts[el.tag] = counts.get(el.tag, 0) + 1
    top = sorted(counts.items(), key=lambda kv: -kv[1])[:12]
    msg = next((txt(root, t) for t in ("message", "Message", "msg", "결과메시지") if txt(root, t)), "")
    return f"root={root.tag} tags={top}" + (f" msg={msg[:80]}" if msg else "")


def normalize_text(s: str) -> str:
    s = (s or "").replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"[ \t　]+", " ", s)
    s = re.sub(r" *\n *", "\n", s)
    s = re.sub(r"\n{2,}", "\n", s)
    return s.strip()


def text_hash(s: str | None) -> str | None:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:16] if s else None


def fetch_source(src: dict, oc: str) -> tuple[dict, dict[str, dict]]:
    meta = search_current(src["target"], src["name"], oc)
    if src["target"] == "law":
        body = http_get("lawService.do", {"target": "law", "type": "XML", "MST": meta["mst"]}, oc)
        arts = parse_law_articles(parse_xml(body, src["name"]))
    else:
        arts, diag = {}, ""
        # ID=행정규칙일련번호 가 기본, 응답이 비면 LID=행정규칙ID(현행본) 로 재시도
        for params in ({"ID": meta.get("serial")}, {"LID": meta.get("admRulId")}):
            if not next(iter(params.values())):
                continue
            body = http_get("lawService.do", {"target": "admrul", "type": "XML", **params}, oc)
            root = parse_xml(body, src["name"])
            arts = parse_admrul_articles(root)
            if arts:
                break
            diag = describe_xml(root)
        if not arts:
            raise SyncError(f"'{src['name']}' 조문 0건 — 응답 형식 변경 가능성 ({diag})")
    if not arts:
        raise SyncError(f"'{src['name']}' 조문 0건 — 응답 형식 변경 가능성")
    info = {k: v for k, v in meta.items() if k not in ("status", "note") and v}
    info["name"] = src["name"]
    info["pending"] = meta.get("pending", [])
    return info, arts


# ──────────────────────────── 병합·Diff ────────────────────────────

def referenced_keys(manual: dict) -> set[str]:
    keys: set[str] = set()
    for it in manual.get("items", []):
        keys.update(it.get("refs", []))
        keys.update((it.get("examiner") or {}).get("sanctions", []))
    return keys


def merge(prev: dict, code: str, fetched: dict[str, dict], wanted: set[str] | None, today: str) -> tuple[dict, list[dict]]:
    """한 법령(code)의 조문을 이전 데이터와 병합. wanted=None 이면 전체."""
    articles = dict(prev)
    changes: list[dict] = []
    prefix = code + ":"
    targets = set(k for k in prev if k.startswith(prefix))
    if wanted is None:
        targets |= {prefix + jo for jo in fetched}
    else:
        targets |= {k for k in wanted if k.startswith(prefix)}

    for key in sorted(targets):
        jo = key.split(":", 1)[1]
        old = prev.get(key)
        new = fetched.get(jo)
        if new is None:
            if old and not old.get("missing"):
                o = dict(old)
                o.update(missing=True, changed_at=today, prev_text=old.get("text"))
                articles[key] = o
                changes.append({"detected_at": today, "key": key, "title": old.get("title"), "type": "removed"})
            continue
        h = text_hash(new["text"])
        base = {
            "source": code, "jo": jo, "title": new["title"] or (old or {}).get("title", ""),
            "text": new["text"], "excerpt": False, "hash": h,
            "changed_at": (old or {}).get("changed_at"), "prev_text": (old or {}).get("prev_text"),
        }
        if old is None or not old.get("text"):
            if new["text"]:
                changes.append({"detected_at": today, "key": key, "title": base["title"], "type": "added"})
        elif old.get("excerpt"):
            pass  # 시드 발췌본 → 전문으로 교체(개정 아님)
        elif old.get("hash") != h:
            base["changed_at"] = today
            base["prev_text"] = old.get("text")
            changes.append({"detected_at": today, "key": key, "title": base["title"], "type": "amended"})
        if old and old.get("missing"):
            base["changed_at"] = today
            changes.append({"detected_at": today, "key": key, "title": base["title"], "type": "restored"})
        articles[key] = base
    return articles, changes


def load_json(p: Path, default):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def write_json(p: Path, obj) -> None:
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    tmp.replace(p)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="법제처 Open API 법령 동기화")
    ap.add_argument("--all", action="store_true", help="매뉴얼 참조 조문뿐 아니라 전체 조문 저장")
    ap.add_argument("--dry-run", action="store_true", help="파일을 쓰지 않음")
    ap.add_argument("--only", nargs="*", help="특정 법령 코드만 (예: CMA-L CMA-S)")
    args = ap.parse_args(argv)

    oc = os.environ.get("LAW_OC", "").strip()
    if not oc:
        print("::error::환경변수 LAW_OC(법제처 Open API 인증키)가 없습니다. GitHub Secrets에 LAW_OC를 등록하세요.", file=sys.stderr)
        return 2
    if os.environ.get("GITHUB_ACTIONS"):
        print(f"::add-mask::{oc}")

    cfg = load_json(DATA / "law_sources.json", {})
    manual = load_json(DATA / "manual_checklist.json", {})
    laws = load_json(DATA / "laws_data.json", {"schema_version": "1.0", "sources": {}, "articles": {}})
    hist = load_json(DATA / "changes.json", {"schema_version": "1.0", "changes": []})

    today = dt.datetime.now(KST).strftime("%Y-%m-%d")
    wanted = None if args.all else referenced_keys(manual)
    articles = dict(laws.get("articles", {}))
    sources = dict(laws.get("sources", {}))
    all_changes: list[dict] = []
    ok = failed = 0

    for src in cfg.get("sources", []):
        code = src["code"]
        if args.only and code not in args.only:
            continue
        needed = wanted is None or any(k.startswith(code + ":") for k in wanted) or any(k.startswith(code + ":") for k in articles)
        if not needed:
            continue
        try:
            info, fetched = fetch_source(src, oc)
        except SyncError as e:
            failed += 1
            print(f"::warning::{code} {src['name']}: {e}")
            continue
        ok += 1
        if sources.get(code) != info:
            sources[code] = info
        articles, ch = merge(articles, code, fetched, wanted, today)
        all_changes.extend(ch)
        print(f"{code} {src['name']}: 시행 {info.get('effective')} · 조문 {len(fetched)}건 수집 · 변경 {len(ch)}건")

    if ok == 0 and failed:
        print("::error::모든 법령 수집에 실패했습니다.", file=sys.stderr)
        return 1

    changed = all_changes or sources != laws.get("sources") or articles != laws.get("articles")
    if not changed:
        print("변경 없음")
        return 0

    amended = [c for c in all_changes if c["type"] in ("amended", "removed")]
    print(f"변경 요약: 총 {len(all_changes)}건 (개정·삭제 {len(amended)}건)")
    if args.dry_run:
        for c in all_changes:
            print(f"  [{c['type']}] {c['key']} {c.get('title') or ''}")
        return 0

    laws.update({
        "schema_version": "1.0",
        "generated_at": dt.datetime.now(KST).replace(microsecond=0).isoformat(),
        "generator": "scripts/sync_laws.py (법제처 Open API)",
        "sources": sources,
        "articles": dict(sorted(articles.items())),
    })
    write_json(DATA / "laws_data.json", laws)
    if all_changes:
        hist.setdefault("changes", []).extend(all_changes)
        hist["changes"] = hist["changes"][-2000:]
        write_json(DATA / "changes.json", hist)

    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as f:
            f.write(f"amended={len(amended)}\nchanges={len(all_changes)}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
