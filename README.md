# 준법·검사 매뉴얼 — 자산운용 · 투자매매중개

자본시장법 · 지배구조법 · 금융소비자보호법의 **법령 원문(자동 갱신)** 과
**준법감시 체크리스트 · 검사착안사항(전문가 관리)** 을 *조문 키* 로 연결한 정적 웹 도구입니다.
법령이 개정되면 연결된 매뉴얼 항목에 `법령 개정 - 매뉴얼 현행화 필요` 배지가 자동으로 붙습니다.

- 대상 업권(MVP): **자산운용업(집합투자업)**, **투자매매·중개업**
- 점검 항목 24개 · 연계 조문 44개 (2026-11-21 국가법령정보 기준으로 조문 번호·원문 확인)
- 서버 없음: GitHub Pages / Cloudflare Pages 에 그대로 올릴 수 있는 정적 파일

## 주요 기능

| 기능 | 설명 |
| --- | --- |
| 업무 프로세스 내비게이션 | 왼쪽 드로어 메뉴: 지배구조·내부통제 → 상품개발·광고 → 영업·판매 → 운용·사후관리, 업권·법령 필터 |
| 듀얼 모드 | **준법감시인**(체크리스트·점검주기·증빙·내부통제 반영 포인트) ↔ **검사역**(검사착안사항·적발 패턴·제재 근거) |
| 3단 법령 뷰어 | 근거 조문 클릭 → 법률 / 시행령·시행규칙 / 감독규정 원문을 나란히 대조, 국가법령정보센터 링크 |
| 인터랙티브 점검 | 문항별 `적정 / 미흡 / 해당없음` + 의견, 브라우저 `localStorage` 자동 저장(모드별 분리) |
| 내보내기 | CSV(엑셀 호환, BOM 포함, 수식 주입 방지) · 인쇄용 보고서(브라우저 "PDF로 저장") |
| 개정 영향도 | 배치 동기화가 바뀐 조문에 `changed_at` 기록 → 항목의 `reviewed_at` 보다 늦으면 배지 · 개정 현황 화면 |
| 정보 페이지 | 버전, 데이터 기준일, 만든이, 사용법, GitHub Releases 최신 버전 확인, 로컬 오류 로그 내보내기 |

## 폴더 구조

```
index.html                     # 단독 실행용 페이지 (mount 한 줄)
assets/compliance-manual.css   # 모든 선택자가 .cm 아래로 한정 → 다른 사이트에 임베드해도 충돌 없음
assets/compliance-manual.js    # window.ComplianceManual 하나만 노출하는 독립 모듈
data/law_sources.json          # 동기화 대상 법령 목록 (코드 · 법령명 · API target)
data/laws_data.json            # [자동 갱신] 조문 원문 (sync_laws.py 가 덮어씀)
data/manual_checklist.json     # [전문가 관리] 업무 분류 · 점검 문항 · 착안사항 · 연계 조문 키
data/changes.json              # [자동 갱신] 조문 변경 이력
data/app_info.json             # 정보 페이지 표시값 (만든이 · 연락처 · 홈페이지 · 저장소)
scripts/sync_laws.py           # 법제처 Open API 수집 · 파싱 · Diff 배치
scripts/tests/                 # 파서 · Diff · 데이터 무결성 테스트 (네트워크 불필요)
.github/workflows/sync-laws.yml  # 주 1회 자동 동기화 (월 06:00 KST) + 수동 실행
```

## 데이터 스키마 — 조문 키로 분리 · 매핑

조문 키 형식: **`{법령군}-{단계}:{조문}`**

- 법령군: `CMA` 자본시장법 · `GOV` 지배구조법 · `FCP` 금소법
- 단계: `L` 법률 · `D` 시행령 · `R` 시행규칙 · `S` 감독규정(행정규칙)
- 예: `CMA-L:제45조`, `CMA-D:제50조`, `CMA-S:제4-6조`, `GOV-L:제30조의3`

`laws_data.json` (자동)

```json
"CMA-L:제45조": { "source": "CMA-L", "jo": "제45조", "title": "정보교류의 차단",
                 "text": "① …", "hash": "…", "changed_at": null, "prev_text": null, "excerpt": false }
```

`manual_checklist.json` (전문가 관리)

```json
{ "id": "GOV-005", "process": "gov", "area": "이해상충·정보교류차단", "lines": ["AM","BD"],
  "title": "…", "summary": "…", "refs": ["CMA-L:제45조","CMA-D:제50조","CMA-S:제4-6조"],
  "reviewed_at": "2026-11-21",
  "compliance": { "cycle": "월", "checklist": ["…"], "evidence": ["…"], "ic_points": ["…"] },
  "examiner":   { "focus": ["…"], "patterns": ["…"], "sanctions": ["CMA-L:제422조"] } }
```

매뉴얼 항목을 검수·현행화했다면 그 항목의 `reviewed_at` 을 검수일로 바꾸면 배지가 사라집니다.
`excerpt: true` 인 조문은 시드 단계의 발췌·요지본이며, 첫 동기화 때 전문으로 교체됩니다(개정으로 표시되지 않음).

## 로컬에서 실행

```bash
python -m http.server 8000
# 브라우저에서 http://localhost:8000
```

`file://` 로 직접 열면 브라우저 보안 정책 때문에 JSON 을 읽지 못합니다.

## 법령 자동 동기화 설정 (법제처 Open API)

1. [국가법령정보 공동활용](https://open.law.go.kr) 에서 Open API 를 신청하고 인증키(OC)를 받습니다.
   신청서의 서버 IP/도메인 등록 조건에 따라 GitHub Actions 러너(유동 IP)에서 호출이 거부될 수 있습니다.
   이 경우 승인 조건을 확인하거나, 고정 IP 환경(자체 러너·Cloudflare Workers 프록시)에서 실행하세요.
2. 저장소 **Settings → Secrets and variables → Actions → New repository secret**
   - Name: **`LAW_OC`**
   - Value: 발급받은 OC 값
3. **Actions → 법령 동기화 → Run workflow** 로 첫 실행을 합니다. 이후 매주 월요일 06:00(KST)에 자동 실행되며,
   바뀐 조문이 있으면 `data/laws_data.json`, `data/changes.json` 을 커밋합니다.

인증키는 환경변수로만 읽고, 로그에서는 마스킹되며, 오류 메시지에도 요청 URL 을 남기지 않습니다.
브라우저는 법제처 API 를 직접 호출하지 않으므로(CORS · 키 노출 방지) 키가 공개 페이지에 실리지 않습니다.

로컬 실행:

```bash
export LAW_OC=발급키
python scripts/sync_laws.py --dry-run   # 변경 요약만
python scripts/sync_laws.py             # 매뉴얼이 참조하는 조문만 갱신
python scripts/sync_laws.py --all       # 전체 조문 저장
python -m unittest discover -s scripts/tests -v
```

## FSS_insights 등 다른 사이트에 넣기

`assets/` 두 파일과 `data/` 폴더를 복사한 뒤, 원하는 위치에 마운트합니다.

```html
<link rel="stylesheet" href="compliance/assets/compliance-manual.css">
<div id="compliance-manual"></div>
<script src="compliance/assets/compliance-manual.js"></script>
<script>
  const cm = ComplianceManual.mount(document.getElementById('compliance-manual'), {
    dataBase: 'compliance/data/',   // 데이터 폴더 상대 경로
    useHash: false,                 // 호스트 사이트의 라우팅과 충돌하지 않도록 해시 라우팅 끄기
    storageKey: 'fss.cm.v1'         // localStorage 키 접두어 분리
  });
  // 페이지 전환 시: cm.destroy();
</script>
```

- CSS 는 `.cm` 범위 안에서만 동작하고 색상은 `.cm` 의 CSS 변수(`--cm-accent` 등)로 바꿀 수 있습니다.
- 다크 모드는 시스템 설정을 따르며, 루트 요소에 `data-theme="light|dark"` 를 주면 고정됩니다.

## 콘텐츠 주의

조문 번호와 원문은 2026-11-21 기준 국가법령정보로 확인했습니다. 점검 문항 · 착안사항 · 적발 패턴은
실무 참고용 초안이며 특정 제재 사례를 인용한 것이 아닙니다. 회사 내부통제기준과 전문가 검수를 거쳐 사용하세요.

## 만든이

이현덕 with Claude · 홈페이지 https://hdlee73.github.io/Home/
