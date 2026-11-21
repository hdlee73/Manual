"""sync_laws.py 단위 테스트 — 네트워크 없이 파서와 Diff 로직을 검증한다.

실행: python -m unittest discover -s scripts/tests
"""
import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sync_laws as S  # noqa: E402

LAW_XML = """<?xml version="1.0" encoding="UTF-8"?>
<법령><기본정보><법령ID>010513</법령ID><시행일자>20261113</시행일자></기본정보>
<조문>
 <조문단위 조문키="0045000"><조문번호>2</조문번호><조문여부>전문</조문여부><조문내용>제2장 금융투자업</조문내용></조문단위>
 <조문단위 조문키="0045001"><조문번호>45</조문번호><조문여부>조문</조문여부><조문제목>정보교류의 차단</조문제목>
  <조문내용>제45조(정보교류의 차단)</조문내용>
  <항><항번호>①</항번호><항내용>① 금융투자업자는 정보의 교류를 적절히 차단하여야 한다.</항내용></항>
  <항><항번호>③</항번호><항내용>③ 내부통제기준은 다음 각 호의 사항을 포함하여야 한다.</항내용>
   <호><호번호>1.</호번호><호내용>1. 기준 및 절차</호내용></호>
   <호><호번호>2.</호번호><호내용>2. 예외적 교류 요건</호내용><목><목내용>가. 세부</목내용></목></호>
  </항>
 </조문단위>
 <조문단위 조문키="0030002"><조문번호>30</조문번호><조문가지번호>3</조문가지번호><조문여부>조문</조문여부><조문제목>책무구조도</조문제목>
  <조문내용>제30조의3(책무구조도) 대표이사등은 책무구조도를 마련하여야 한다.</조문내용>
 </조문단위>
</조문></법령>"""

ADM_XML = """<?xml version="1.0" encoding="UTF-8"?>
<AdmRulService><행정규칙기본정보><행정규칙명>금융투자업규정</행정규칙명></행정규칙기본정보>
<조문내용>제4편 영업행위 규칙</조문내용>
<조문내용>제4-6조(금융투자업자의 정보교류의 차단) ① 영 제50조제1항단서에서 ...
② 총괄ㆍ집행책임자는 ...</조문내용>
<조문내용>제4-17조의3(최선집행의무) ① 서면등으로 제공할 것</조문내용>
<조문내용>제2-35조</조문내용>
</AdmRulService>"""


class ParseTest(unittest.TestCase):
    def test_law_articles(self):
        arts = S.parse_law_articles(ET.fromstring(LAW_XML))
        self.assertIn("제45조", arts)
        self.assertNotIn("제2조", arts)  # 장 제목은 제외
        a = arts["제45조"]
        self.assertEqual(a["title"], "정보교류의 차단")
        self.assertTrue(a["text"].startswith("① 금융투자업자는"))
        self.assertIn("2. 예외적 교류 요건\n가. 세부", a["text"])
        self.assertIn("제30조의3", arts)
        self.assertEqual(arts["제30조의3"]["text"], "대표이사등은 책무구조도를 마련하여야 한다.")

    def test_admrul_articles(self):
        arts = S.parse_admrul_articles(ET.fromstring(ADM_XML))
        self.assertEqual(set(arts), {"제4-6조", "제4-17조의3", "제2-35조"})
        self.assertEqual(arts["제4-6조"]["title"], "금융투자업자의 정보교류의 차단")
        self.assertTrue(arts["제4-6조"]["text"].startswith("① 영 제50조"))
        self.assertEqual(arts["제4-17조의3"]["title"], "최선집행의무")

    def test_jo_label(self):
        self.assertEqual(S.jo_label("045", ""), "제45조")
        self.assertEqual(S.jo_label("30", "03"), "제30조의3")
        self.assertEqual(S.jo_label("30", "0"), "제30조")


class MergeTest(unittest.TestCase):
    def setUp(self):
        self.prev = {
            "CMA-L:제45조": {"source": "CMA-L", "jo": "제45조", "title": "정보교류의 차단", "text": "옛 본문",
                             "hash": S.text_hash("옛 본문"), "excerpt": False, "changed_at": None, "prev_text": None},
            "CMA-L:제74조": {"source": "CMA-L", "jo": "제74조", "title": "투자자예탁금의 별도예치", "text": "발췌",
                             "hash": S.text_hash("발췌"), "excerpt": True, "changed_at": None, "prev_text": None},
            "CMA-L:제420조": {"source": "CMA-L", "jo": "제420조", "title": "처분", "text": None, "hash": None,
                              "excerpt": False, "changed_at": None, "prev_text": None},
        }
        self.wanted = set(self.prev)

    def test_amended_sets_changed_at_and_prev(self):
        fetched = {"제45조": {"title": "정보교류의 차단", "text": "새 본문"},
                   "제74조": {"title": "투자자예탁금의 별도예치", "text": "전문"},
                   "제420조": {"title": "금융투자업자에 대한 처분 등", "text": "본문"}}
        arts, ch = S.merge(self.prev, "CMA-L", fetched, self.wanted, "2026-12-01")
        self.assertEqual(arts["CMA-L:제45조"]["changed_at"], "2026-12-01")
        self.assertEqual(arts["CMA-L:제45조"]["prev_text"], "옛 본문")
        # 발췌본 → 전문 교체는 개정으로 보지 않음
        self.assertIsNone(arts["CMA-L:제74조"]["changed_at"])
        self.assertFalse(arts["CMA-L:제74조"]["excerpt"])
        # 원문 미수집 → 최초 수집은 added
        self.assertIsNone(arts["CMA-L:제420조"]["changed_at"])
        types = {c["key"]: c["type"] for c in ch}
        self.assertEqual(types, {"CMA-L:제45조": "amended", "CMA-L:제420조": "added"})

    def test_unchanged_no_change(self):
        fetched = {"제45조": {"title": "정보교류의 차단", "text": "옛 본문"},
                   "제74조": {"title": "x", "text": "발췌"}, "제420조": {"title": "x", "text": None}}
        prev = dict(self.prev)
        prev["CMA-L:제74조"] = dict(prev["CMA-L:제74조"], excerpt=False)
        _, ch = S.merge(prev, "CMA-L", fetched, self.wanted, "2026-12-01")
        self.assertEqual([c for c in ch if c["type"] == "amended"], [])

    def test_removed(self):
        arts, ch = S.merge(self.prev, "CMA-L", {"제74조": {"title": "t", "text": "전문"}, "제420조": {"title": "t", "text": "b"}},
                           self.wanted, "2026-12-01")
        self.assertTrue(arts["CMA-L:제45조"]["missing"])
        self.assertIn({"detected_at": "2026-12-01", "key": "CMA-L:제45조", "title": "정보교류의 차단", "type": "removed"}, ch)

    def test_other_codes_untouched(self):
        prev = dict(self.prev)
        prev["GOV-L:제24조"] = {"source": "GOV-L", "jo": "제24조", "title": "내부통제기준", "text": "x", "hash": S.text_hash("x")}
        arts, _ = S.merge(prev, "CMA-L", {}, set(prev), "2026-12-01")
        self.assertEqual(arts["GOV-L:제24조"], prev["GOV-L:제24조"])


class DataIntegrityTest(unittest.TestCase):
    """저장소의 매뉴얼 데이터가 모두 laws_data.json 의 조문 키를 가리키는지 확인"""

    def test_all_refs_resolve(self):
        manual = S.load_json(S.DATA / "manual_checklist.json", {})
        laws = S.load_json(S.DATA / "laws_data.json", {})
        missing = sorted(k for k in S.referenced_keys(manual) if k not in laws["articles"])
        self.assertEqual(missing, [], f"laws_data.json 에 없는 조문 키: {missing}")
        ids = [it["id"] for it in manual["items"]]
        self.assertEqual(len(ids), len(set(ids)), "항목 ID 중복")
        procs = {p["id"] for p in manual["processes"]}
        lines = {b["id"] for b in manual["business_lines"]}
        for it in manual["items"]:
            self.assertIn(it["process"], procs, it["id"])
            self.assertTrue(set(it["lines"]) <= lines, it["id"])
            self.assertTrue(it["compliance"]["checklist"], it["id"])
            self.assertTrue(it["examiner"]["focus"], it["id"])

    def test_source_codes_known(self):
        cfg = S.load_json(S.DATA / "law_sources.json", {})
        codes = {s["code"] for s in cfg["sources"]}
        laws = S.load_json(S.DATA / "laws_data.json", {})
        for k in laws["articles"]:
            self.assertIn(k.split(":")[0], codes, k)


if __name__ == "__main__":
    unittest.main()
