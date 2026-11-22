/*!
 * 준법·검사 매뉴얼 (Compliance & Examination Manual)
 * 만든이: 이현덕 with Claude
 *
 * 독립 모듈: 전역에는 window.ComplianceManual 하나만 노출합니다.
 *   ComplianceManual.mount(element, { dataBase: 'data/', useHash: true })
 * FSS_insights 등 다른 사이트에 임베드할 때는 CSS(.cm 범위 한정)와 이 파일,
 * data/ 폴더만 복사한 뒤 원하는 요소에 mount 하면 됩니다.
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var DEFAULTS = {
    dataBase: 'data/',
    useHash: true,
    storageKey: 'cm.v1',
    title: '준법·검사 매뉴얼',
    subtitle: '자산운용 · 투자매매중개'
  };
  var MARK_LABEL = { ok: '적정', ng: '미흡', na: '해당없음' };
  var LEVEL_COLS = [
    { id: 'L', name: '법률', levels: ['L'] },
    { id: 'D', name: '시행령 · 시행규칙', levels: ['D', 'R'] },
    { id: 'S', name: '감독규정 (행정규칙)', levels: ['S'] }
  ];

  /* ── 아이콘 (inline SVG, stroke 기반) ── */
  var I = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z"/>',
    box: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.8c1.9.8 3.1 2.5 3.5 5.2"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    book: '<path d="M4 4.5A2.5 2.5 0 016.5 2H20v17H6.5A2.5 2.5 0 004 21.5v-17z"/><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>',
    bell: '<path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 004 0"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
    print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
    alert: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.5"/>',
    reset: '<path d="M4 4v6h6"/><path d="M5 15a8 8 0 102-8.5L4 10"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (I[name] || '') + '</svg>';
  }

  /* ── 유틸 ── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /** 이스케이프된 문자열에 검색어 하이라이트 (검색어도 이스케이프 후 매칭) */
  function hl(text, q) {
    var safe = esc(text);
    if (!q) return safe;
    var eq = esc(q);
    if (!eq) return safe;
    return safe.replace(new RegExp(escRe(eq), 'gi'), function (m) { return '<mark>' + m + '</mark>'; });
  }
  function todayISO() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function qHash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function safeHttpUrl(u) { return /^https:\/\//i.test(String(u || '')) ? String(u) : null; }
  function store(key) {
    return {
      get: function (fallback) {
        try { var v = global.localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
        catch (e) { return fallback; }
      },
      set: function (val) {
        try { global.localStorage.setItem(key, JSON.stringify(val)); return true; }
        catch (e) { return false; }
      }
    };
  }
  function fetchJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
      return r.json();
    });
  }
  function lawGoKrUrl(source, jo) {
    var name = (source && source.name || '').replace(/\s+/g, '');
    if (!name) return null;
    var isAdm = source.serial || source.admRulId || /규정|세칙|고시/.test(name);
    var base = 'https://www.law.go.kr/' + (isAdm ? '행정규칙/' : '법령/') + encodeURIComponent(name);
    return isAdm ? base : base + '/' + encodeURIComponent(jo);
  }

  /* ── 오류 로그 (로컬 보관, 정보 페이지에서 내보내기) ── */
  function makeErrorLog(key) {
    var s = store(key + '.errors');
    function push(entry) {
      var list = s.get([]);
      if (!Array.isArray(list)) list = [];
      list.push(entry);
      if (list.length > 50) list = list.slice(-50);
      s.set(list);
    }
    return {
      record: function (msg, detail) {
        push({ at: new Date().toISOString(), msg: String(msg).slice(0, 500), detail: String(detail || '').slice(0, 2000), ua: navigator.userAgent });
      },
      list: function () { var l = s.get([]); return Array.isArray(l) ? l : []; },
      clear: function () { s.set([]); }
    };
  }

  /* ════════════════════════════════════════════════
   * mount
   * ════════════════════════════════════════════════ */
  function mount(root, options) {
    if (!root) throw new Error('ComplianceManual.mount: 대상 요소가 없습니다.');
    var opt = Object.assign({}, DEFAULTS, options || {});
    var base = opt.dataBase.replace(/\/?$/, '/');
    var errlog = makeErrorLog(opt.storageKey);
    var prefStore = store(opt.storageKey + '.prefs');
    var marksStore = store(opt.storageKey + '.marks');
    var notesStore = store(opt.storageKey + '.notes');
    var metaStore = store(opt.storageKey + '.meta');

    var prefs = Object.assign({ mode: 'compliance', line: 'ALL', families: ['CMA', 'GOV', 'FCP'], pinned: true }, prefStore.get({}));
    var state = {
      view: 'checklist', process: 'all', q: '', onlyFlag: false,
      mode: prefs.mode === 'examiner' ? 'examiner' : 'compliance',
      line: ['ALL', 'AM', 'BD'].indexOf(prefs.line) >= 0 ? prefs.line : 'ALL',
      families: Array.isArray(prefs.families) && prefs.families.length ? prefs.families.slice() : ['CMA', 'GOV', 'FCP'],
      pinned: prefs.pinned !== false
    };
    var marks = marksStore.get({}) || {};
    var notes = notesStore.get({}) || {};
    var meta = Object.assign({ date: todayISO(), org: '', inspector: '' }, metaStore.get({}));
    var D = null; // { laws, manual, cfg, info, changes, families, backrefs, itemById }
    var listeners = [];
    var viewerOpen = false;
    var searchTimer = null;

    function on(target, type, fn, o) { target.addEventListener(type, fn, o); listeners.push([target, type, fn, o]); }
    function savePrefs() {
      prefStore.set({ mode: state.mode, line: state.line, families: state.families, pinned: state.pinned });
    }

    /* 셸 */
    root.classList.add('cm');
    root.innerHTML =
      '<header class="cm-appbar">' +
        '<button class="cm-iconbtn" data-act="drawer" aria-label="메뉴 열기">' + icon('menu') + '</button>' +
        '<div class="cm-brand"><div class="cm-brand-mark">CM</div><div style="min-width:0">' +
          '<div class="cm-brand-title">' + esc(opt.title) + '</div><div class="cm-brand-sub">' + esc(opt.subtitle) + '</div></div></div>' +
        '<div class="cm-appbar-spacer"></div>' +
        '<div class="cm-seg" role="group" aria-label="모드 전환">' +
          '<button data-mode="compliance">준법감시인</button><button data-mode="examiner">검사역</button></div>' +
      '</header>' +
      '<div class="cm-scrim" data-act="drawer-close"></div>' +
      '<nav class="cm-drawer" aria-label="주 메뉴"><div class="cm-drawer-head">' +
        '<div class="cm-brand-mark">CM</div><strong style="flex:1">메뉴</strong>' +
        '<button class="cm-iconbtn" data-act="drawer-close" aria-label="메뉴 닫기">' + icon('close') + '</button></div>' +
        '<div class="cm-drawer-body"></div></nav>' +
      '<main class="cm-main"><div class="cm-container" data-role="view" aria-live="polite"><div class="cm-empty">불러오는 중…</div></div></main>' +
      '<div class="cm-viewer" role="dialog" aria-modal="true" aria-label="법령 원문 대조"><div class="cm-viewer-panel"></div></div>' +
      '<div class="cm-toast" role="status"></div>';

    var $drawerBody = root.querySelector('.cm-drawer-body');
    var $view = root.querySelector('[data-role="view"]');
    var $viewer = root.querySelector('.cm-viewer');
    var $viewerPanel = root.querySelector('.cm-viewer-panel');
    var $toast = root.querySelector('.cm-toast');
    var toastTimer = null;

    function toast(msg) {
      $toast.textContent = msg;
      $toast.classList.add('is-show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { $toast.classList.remove('is-show'); }, 2200);
    }
    function isWide() { return !!(global.matchMedia && global.matchMedia('(min-width: 1200px)').matches); }
    function applyPinned() { root.classList.toggle('is-pinned', state.pinned); }
    function openDrawer() {
      if (isWide()) { state.pinned = !state.pinned; applyPinned(); savePrefs(); return; }
      root.classList.add('is-drawer-open');
      var first = $drawerBody.querySelector('button'); if (first) first.focus();
    }
    function closeDrawer() { root.classList.remove('is-drawer-open'); }
    applyPinned(); // 첫 화면부터 고정 상태로 그려 전환 애니메이션이 보이지 않게

    /* ── 데이터 로딩 ── */
    Promise.all([
      fetchJSON(base + 'laws_data.json'),
      fetchJSON(base + 'manual_checklist.json'),
      fetchJSON(base + 'law_sources.json'),
      fetchJSON(base + 'changes.json').catch(function () { return { changes: [] }; }),
      fetchJSON(base + 'app_info.json').catch(function () { return {}; })
    ]).then(function (r) {
      D = { laws: r[0], manual: r[1], cfg: r[2], changes: (r[3] && r[3].changes) || [], info: r[4] || {} };
      D.families = {};
      (D.cfg.families || []).forEach(function (f) { D.families[f.id] = f; });
      D.backrefs = {};
      D.itemById = {};
      D.manual.items.forEach(function (it) {
        D.itemById[it.id] = it;
        refsOf(it, true).forEach(function (k) { (D.backrefs[k] = D.backrefs[k] || []).push(it.id); });
      });
      routeFromHash();
      renderAll();
    }).catch(function (e) {
      errlog.record('데이터 로딩 실패', e && e.stack || e);
      $view.innerHTML = '<div class="cm-banner">' + icon('alert') + '<div><strong>데이터를 불러오지 못했습니다.</strong><br>' + esc(e && e.message || e) +
        '<br>로컬 파일(file://)로 열었다면 간단한 웹서버(예: <code>python -m http.server</code>)로 실행해 주세요.</div></div>';
    });

    /* ── 도메인 헬퍼 ── */
    function art(key) { return D.laws.articles[key] || null; }
    function srcOf(key) { var a = art(key); var code = a ? a.source : key.split(':')[0]; return { code: code, info: D.laws.sources[code] || {} }; }
    function famOf(key) { return key.split(':')[0].split('-')[0]; }
    function levelOf(key) { return key.split(':')[0].split('-')[1]; }
    function refLabel(key) {
      var fam = D.families[famOf(key)];
      var lv = levelOf(key);
      var jo = key.split(':')[1] || '';
      var srcName = lv === 'S' ? (srcOf(key).info.name || '감독규정') : (fam ? fam.name : '') + (lv === 'D' ? ' 시행령' : lv === 'R' ? ' 시행규칙' : '');
      return srcName + ' ' + jo;
    }
    function refsOf(it, withSanctions) {
      var r = (it.refs || []).slice();
      if (withSanctions && it.examiner && it.examiner.sanctions) r = r.concat(it.examiner.sanctions);
      return r.filter(function (k, i) { return r.indexOf(k) === i; });
    }
    function itemFamilies(it) {
      var s = {};
      (it.refs || []).forEach(function (k) { s[famOf(k)] = 1; });
      return Object.keys(s);
    }
    function isAmendedFor(a, it) { return !!(a && a.changed_at && (!it || !it.reviewed_at || a.changed_at > it.reviewed_at)); }
    /** 개정 감지: 연계 조문의 changed_at 이 항목의 매뉴얼 검수일(reviewed_at)보다 늦으면 현행화 필요 */
    function amendedRefs(it) {
      return refsOf(it, true).filter(function (k) { return isAmendedFor(art(k), it); });
    }
    function questions(it) {
      return state.mode === 'examiner' ? (it.examiner && it.examiner.focus || []) : (it.compliance && it.compliance.checklist || []);
    }
    /** 문항 문구 기반 키 — 매뉴얼 문항 순서가 바뀌어도 기존 점검결과가 다른 문항에 붙지 않도록 */
    function markKey(it, i) { var q = questions(it)[i]; return state.mode + ':' + it.id + ':' + qHash(q == null ? String(i) : String(q)); }
    function noteKey(it) { return state.mode + ':' + it.id; }
    function procName(id) { var p = D.manual.processes.filter(function (x) { return x.id === id; })[0]; return p ? p.name : id; }
    function lineName(id) { var l = D.manual.business_lines.filter(function (x) { return x.id === id; })[0]; return l ? l.name : id; }

    function filteredItems() {
      var q = state.q.trim().toLowerCase();
      return D.manual.items.filter(function (it) {
        if (state.line !== 'ALL' && it.lines.indexOf(state.line) < 0) return false;
        if (state.process !== 'all') {
          if (state.process.indexOf('area:') === 0) { if (it.area !== state.process.slice(5)) return false; }
          else if (it.process !== state.process) return false;
        }
        var fams = itemFamilies(it);
        if (!fams.some(function (f) { return state.families.indexOf(f) >= 0; })) return false;
        if (state.onlyFlag && !amendedRefs(it).length) return false;
        if (q) {
          var hay = [it.id, it.title, it.summary, it.area].concat(questions(it))
            .concat(refsOf(it, true).map(function (k) { var a = art(k); return refLabel(k) + ' ' + (a ? a.title : ''); }))
            .join(' ').toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        return true;
      });
    }

    /* ── 렌더: 전체 ── */
    function renderAll() {
      if (!D) return;
      applyPinned();
      root.querySelectorAll('.cm-seg [data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === state.mode)); });
      renderDrawer();
      renderView();
    }

    function renderDrawer() {
      var baseItems = D.manual.items.filter(function (it) { return state.line === 'ALL' || it.lines.indexOf(state.line) >= 0; });
      var flagCount = D.manual.items.filter(function (it) { return amendedRefs(it).length; }).length;
      var h = '';
      h += '<div class="cm-nav-label">화면</div>';
      h += navBtn('view:checklist', icon('list'), '점검표', '', state.view === 'checklist');
      h += navBtn('view:laws', icon('book'), '법령 원문', Object.keys(D.laws.articles).length, state.view === 'laws');
      h += navBtn('view:changes', icon('bell'), '개정 현황', flagCount || '', state.view === 'changes');
      h += navBtn('view:about', icon('info'), '정보 · 사용법', '', state.view === 'about');

      h += '<div class="cm-nav-label">업권</div><div class="cm-chips">';
      [['ALL', '전체']].concat(D.manual.business_lines.map(function (l) { return [l.id, l.name]; })).forEach(function (l) {
        h += '<button class="cm-chip" data-line="' + esc(l[0]) + '" aria-pressed="' + (state.line === l[0]) + '">' + esc(l[1]) + '</button>';
      });
      h += '</div>';

      h += '<div class="cm-nav-label">업무 프로세스</div>';
      h += navBtn('proc:all', icon('list'), '전체 항목', baseItems.length, state.view === 'checklist' && state.process === 'all');
      D.manual.processes.forEach(function (p) {
        var its = baseItems.filter(function (it) { return it.process === p.id; });
        h += navBtn('proc:' + p.id, icon(p.icon), p.name, its.length, state.view === 'checklist' && state.process === p.id);
        var areas = [];
        its.forEach(function (it) { if (areas.indexOf(it.area) < 0) areas.push(it.area); });
        areas.forEach(function (a) {
          var n = its.filter(function (it) { return it.area === a; }).length;
          h += navBtn('proc:area:' + a, '', a, n, state.view === 'checklist' && state.process === 'area:' + a, 'cm-nav-sub');
        });
      });

      h += '<div class="cm-nav-label">법령 필터</div><div class="cm-chips">';
      (D.cfg.families || []).forEach(function (f) {
        h += '<button class="cm-chip fam-' + esc(f.id) + '" data-fam="' + esc(f.id) + '" aria-pressed="' + (state.families.indexOf(f.id) >= 0) + '"><span class="cm-dot"></span>' + esc(f.name) + '</button>';
      });
      h += '</div>';
      $drawerBody.innerHTML = h;
    }
    function navBtn(nav, ic, label, count, current, extra) {
      return '<button class="cm-nav-item ' + (extra || '') + '" data-nav="' + esc(nav) + '" aria-current="' + (!!current) + '">' + ic +
        '<span>' + esc(label) + '</span>' + (count !== '' && count != null ? '<span class="cm-count">' + count + '</span>' : '') + '</button>';
    }

    function renderView() {
      try {
        if (state.view === 'laws') renderLaws();
        else if (state.view === 'changes') renderChanges();
        else if (state.view === 'about') renderAbout();
        else renderChecklist();
      } catch (e) {
        errlog.record('화면 렌더링 오류', e && e.stack || e);
        $view.innerHTML = '<div class="cm-banner">' + icon('alert') + '<div>화면을 그리는 중 오류가 발생했습니다. 정보 페이지에서 오류 로그를 확인해 주세요.</div></div>';
      }
    }

    /* ── 점검표 ── */
    function renderChecklist() {
      var items = filteredItems();
      var isExam = state.mode === 'examiner';
      var title = state.process === 'all' ? '전체 점검 항목' : state.process.indexOf('area:') === 0 ? state.process.slice(5) : procName(state.process);
      var h = '';
      h += '<div class="cm-page-head"><div style="flex:1;min-width:220px">' +
        '<h1 class="cm-page-title">' + esc(title) + '</h1>' +
        '<p class="cm-page-desc">' + (isExam ? '검사역 모드 · 핵심 검사착안사항, 주요 적발 패턴, 제재 근거 중심' : '준법감시인 모드 · 사전 점검 체크리스트, 점검 주기, 증빙자료, 내부통제기준 반영 포인트 중심') +
        (state.line !== 'ALL' ? ' · ' + esc(lineName(state.line)) : '') + '</p></div></div>';

      if (D.manual.notice) h += '<div class="cm-banner info">' + icon('info') + '<div>' + esc(D.manual.notice) + '</div></div>';

      h += '<div class="cm-toolbar">' +
        '<label class="cm-search">' + icon('search') + '<input type="search" data-act="search" placeholder="항목·문항·조문 검색 (예: 정보교류, 제85조)" value="' + esc(state.q) + '" aria-label="검색"></label>' +
        '<button class="cm-btn" data-act="toggle-flag" aria-pressed="' + state.onlyFlag + '">' + icon('bell') + (state.onlyFlag ? '개정 항목만 ✓' : '개정 항목만') + '</button>' +
        '<button class="cm-btn" data-act="csv">' + icon('download') + 'CSV</button>' +
        '<button class="cm-btn cm-btn-primary" data-act="print">' + icon('print') + '보고서 인쇄·PDF</button>' +
        '</div>';

      h += '<div class="cm-meta-form">' +
        '<label>점검(검사) 기준일<input class="cm-input" type="date" data-meta="date" value="' + esc(meta.date) + '"></label>' +
        '<label>대상 회사·부서<input class="cm-input" data-meta="org" placeholder="예: OO자산운용 운용본부" value="' + esc(meta.org) + '"></label>' +
        '<label>점검자<input class="cm-input" data-meta="inspector" placeholder="성명" value="' + esc(meta.inspector) + '"></label></div>';

      h += '<div class="cm-stats" data-role="stats"></div>';
      h += '<div data-role="results">' + checklistResultsHTML(items) + '</div>';
      $view.innerHTML = h;
      updateStats();
    }
    function checklistResultsHTML(items) {
      if (!items.length) return '<div class="cm-empty">조건에 맞는 항목이 없습니다. 검색어나 필터를 바꿔 보세요.</div>';
      var h = '';
      var groups = {};
      items.forEach(function (it) { (groups[it.process] = groups[it.process] || []).push(it); });
      D.manual.processes.forEach(function (p) {
        if (!groups[p.id]) return;
        h += '<div class="cm-section-title">' + icon(p.icon) + esc(p.name) + ' <span style="color:var(--cm-text-3);font-weight:600">' + groups[p.id].length + '</span></div>';
        groups[p.id].forEach(function (it) { h += cardHTML(it); });
      });
      return h;
    }
    /** 검색 입력창은 그대로 두고 결과 영역만 갱신 (한글 IME 조합 중 입력창 교체 방지) */
    function renderResults() {
      var $r = $view.querySelector('[data-role="results"]');
      if (!$r) { renderView(); return; }
      try {
        if (state.view === 'laws') $r.innerHTML = lawsResultsHTML();
        else if (state.view === 'checklist') { $r.innerHTML = checklistResultsHTML(filteredItems()); updateStats(); }
      } catch (e) {
        errlog.record('검색 결과 렌더링 오류', e && e.stack || e);
      }
    }

    function cardHTML(it) {
      var q = state.q.trim();
      var isExam = state.mode === 'examiner';
      var am = amendedRefs(it);
      var h = '<article class="cm-card" data-item="' + esc(it.id) + '">';
      h += '<div class="cm-card-head"><div style="flex:1;min-width:0">' +
        '<div class="cm-card-id">' + esc(it.id) + ' · ' + esc(it.area) + '</div>' +
        '<h3 class="cm-card-title">' + hl(it.title, q) + '</h3>' +
        '<p class="cm-card-summary">' + hl(it.summary, q) + '</p>' +
        '<div class="cm-tags">' +
          it.lines.map(function (l) { return '<span class="cm-tag">' + esc(lineName(l)) + '</span>'; }).join('') +
          itemFamilies(it).map(function (f) { return '<span class="cm-tag fam-' + esc(f) + '">' + esc(D.families[f] ? D.families[f].name : f) + '</span>'; }).join('') +
          (!isExam && it.compliance && it.compliance.cycle ? '<span class="cm-tag cycle">점검주기 · ' + esc(it.compliance.cycle) + '</span>' : '') +
          (am.length ? '<span class="cm-tag warn">' + icon('alert') + '법령 개정 - 매뉴얼 현행화 필요</span>' : '') +
        '</div></div></div>';

      h += '<div class="cm-card-body">';
      h += '<div class="cm-sub-title">' + (isExam ? '핵심 검사착안사항' : '점검 체크리스트') + '</div>';
      questions(it).forEach(function (text, i) {
        var v = marks[markKey(it, i)] || '';
        h += '<div class="cm-q"><div class="cm-q-text"><span class="cm-q-num">' + (i + 1) + '.</span>' + hl(text, q) + '</div>' +
          '<div class="cm-marks" role="group" aria-label="점검 결과">' +
          ['ok', 'ng', 'na'].map(function (m) {
            return '<button class="cm-mark" data-mark="' + i + '" data-v="' + m + '" aria-pressed="' + (v === m) + '">' + MARK_LABEL[m] + '</button>';
          }).join('') + '</div></div>';
      });

      var ex = it.examiner || {};
      var co = it.compliance || {};
      h += '<div class="cm-grid-2">';
      if (isExam) {
        h += sub('주요 적발 패턴', ex.patterns);
        h += '<div class="cm-sub"><div class="cm-sub-title">제재 근거</div><div class="cm-tags">' +
          ((ex.sanctions || []).length ? ex.sanctions.map(refChip).join('') : '<span class="cm-tag">해당 법률의 일반 제재 조항 참조</span>') + '</div></div>';
      } else {
        h += sub('확인 필요 증빙자료', co.evidence);
        h += sub('내부통제기준 반영 포인트', co.ic_points);
      }
      h += '</div>';
      h += '<div class="cm-note-wrap"><textarea class="cm-textarea" data-note placeholder="' + (isExam ? '검사 의견·지적 내용' : '검토 의견') + '" aria-label="의견">' + esc(notes[noteKey(it)] || '') + '</textarea></div>';
      h += '</div>';

      h += '<div class="cm-card-foot"><span class="cm-foot-label">근거 조문</span>' + (it.refs || []).map(refChip).join('') +
        '<span style="flex:1"></span><button class="cm-btn cm-btn-sm" data-viewer="' + esc(it.id) + '">' + icon('book') + '3단 대조</button></div>';
      h += '</article>';
      return h;

      function refChip(k) {
        var a = art(k);
        return '<button class="cm-ref fam-' + esc(famOf(k)) + (isAmendedFor(a, it) ? ' is-amended' : '') + '" data-viewer="' + esc(it.id) + '" data-focus="' + esc(k) + '" title="' + esc(a ? a.title : '') + '">' +
          '<span class="cm-dot"></span>' + esc(refLabel(k)) + '</button>';
      }
    }
    function sub(title, list) {
      if (!list || !list.length) return '';
      return '<div class="cm-sub"><div class="cm-sub-title">' + esc(title) + '</div><ul class="cm-list">' +
        list.map(function (x) { return '<li>' + hl(x, state.q.trim()) + '</li>'; }).join('') + '</ul></div>';
    }

    function computeStats(items) {
      var c = { total: 0, ok: 0, ng: 0, na: 0 };
      items.forEach(function (it) {
        questions(it).forEach(function (_, i) {
          c.total++;
          var v = marks[markKey(it, i)];
          if (v && c[v] != null) c[v]++;
        });
      });
      c.todo = c.total - c.ok - c.ng - c.na;
      return c;
    }
    function updateStats() {
      var $s = $view.querySelector('[data-role="stats"]');
      if (!$s) return;
      var c = computeStats(filteredItems());
      var pct = function (n) { return c.total ? (n / c.total * 100).toFixed(1) + '%' : '0'; };
      $s.innerHTML =
        '<div class="cm-stat"><div class="cm-stat-label">진행률 (' + (c.total - c.todo) + '/' + c.total + ')</div><div class="cm-stat-value">' +
          (c.total ? Math.round((c.total - c.todo) / c.total * 100) : 0) + '%</div>' +
          '<div class="cm-progress"><span style="width:' + pct(c.ok) + ';background:var(--cm-ok)"></span><span style="width:' + pct(c.ng) + ';background:var(--cm-ng)"></span><span style="width:' + pct(c.na) + ';background:var(--cm-na)"></span></div></div>' +
        '<div class="cm-stat ok"><div class="cm-stat-label">적정</div><div class="cm-stat-value">' + c.ok + '</div></div>' +
        '<div class="cm-stat ng"><div class="cm-stat-label">미흡</div><div class="cm-stat-value">' + c.ng + '</div></div>' +
        '<div class="cm-stat na"><div class="cm-stat-label">해당없음</div><div class="cm-stat-value">' + c.na + '</div></div>' +
        '<div class="cm-stat todo"><div class="cm-stat-label">미점검</div><div class="cm-stat-value">' + c.todo + '</div></div>';
    }

    /* ── 3단 뷰어 ── */
    function openViewer(itemId, focusKey, onlyArticle) {
      var it = itemId ? D.itemById[itemId] || null : null;
      var keys = onlyArticle ? [onlyArticle] : it ? refsOf(it, state.mode === 'examiner') : [];
      if (focusKey && keys.indexOf(focusKey) < 0) keys.push(focusKey);
      var h = '<div class="cm-viewer-head"><div style="flex:1;min-width:0"><div class="cm-card-id">' +
        (it ? esc(it.id) + ' · 근거 조문 3단 대조' : '법령 원문') + '</div><h2>' + esc(it ? it.title : refLabel(onlyArticle || focusKey || '')) + '</h2></div>' +
        '<button class="cm-iconbtn" data-act="viewer-close" aria-label="닫기">' + icon('close') + '</button></div>';
      h += '<div class="cm-viewer-cols">';
      LEVEL_COLS.forEach(function (col) {
        var ks = keys.filter(function (k) { return col.levels.indexOf(levelOf(k)) >= 0; });
        h += '<section class="cm-col"><div class="cm-col-head">' + esc(col.name) + ' <span style="color:var(--cm-text-3)">' + ks.length + '</span></div><div class="cm-col-body">';
        if (!ks.length) h += '<div class="cm-col-empty">연계된 ' + esc(col.name) + ' 조문이 없습니다.</div>';
        ks.forEach(function (k) { h += artHTML(k, it, k === focusKey); });
        h += '</div></section>';
      });
      h += '</div>';
      $viewerPanel.innerHTML = h;
      $viewer.classList.add('is-open');
      if (!viewerOpen) {
        viewerOpen = true;
        if (opt.useHash) { try { history.pushState({ cmViewer: true }, ''); } catch (e) { /* noop */ } }
      }
      var f = $viewerPanel.querySelector('.cm-art.is-focus');
      if (f) f.scrollIntoView({ block: 'start' });
      var closeBtn = $viewerPanel.querySelector('[data-act="viewer-close"]');
      if (closeBtn) closeBtn.focus({ preventScroll: true });
    }
    function artHTML(k, it, focus) {
      var a = art(k);
      var s = srcOf(k);
      var isSanction = !!(it && it.examiner && (it.examiner.sanctions || []).indexOf(k) >= 0 && (it.refs || []).indexOf(k) < 0);
      var amended = isAmendedFor(a, it);
      var url = lawGoKrUrl(s.info, k.split(':')[1]);
      var today = todayISO();
      var pend = (s.info.pending || []).filter(function (p) { return p.effective > today; });
      var h = '<article class="cm-art' + (focus ? ' is-focus' : '') + '" data-key="' + esc(k) + '">';
      h += '<div class="cm-art-head"><span class="cm-art-law">' + esc(s.info.name || s.code) + '</span></div>';
      h += '<div class="cm-art-head"><span class="cm-art-title">' + esc(k.split(':')[1]) + (a && a.title ? ' (' + esc(a.title) + ')' : '') + '</span>' +
        (isSanction ? '<span class="cm-tag">제재 근거</span>' : '') +
        (amended ? '<span class="cm-tag warn">개정 ' + esc(a.changed_at) + '</span>' : '') + '</div>';
      if (a && a.text) {
        h += '<div class="cm-art-text">' + esc(a.text) + '</div>';
      } else {
        h += '<div class="cm-art-text" style="color:var(--cm-text-3)">원문이 아직 수집되지 않았습니다. 동기화 배치(sync_laws.py) 실행 후 표시됩니다.</div>';
      }
      if (amended && a.prev_text) {
        h += '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--cm-warn);font-weight:700">개정 전 조문 보기</summary><div class="cm-art-text" style="color:var(--cm-text-2)">' + esc(a.prev_text) + '</div></details>';
      }
      h += '<div class="cm-art-foot">' +
        (a && a.excerpt ? '<span class="cm-tag warn">발췌·요지 포함 — 전문은 원문 링크 확인</span>' : '') +
        (s.info.effective ? '<span>시행 ' + esc(s.info.effective) + '</span>' : '') +
        pend.map(function (p) { return '<span class="cm-tag warn">시행예정 개정 ' + esc(p.effective) + '</span>'; }).join('') +
        (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">국가법령정보센터 ' + icon('ext') + '</a>' : '') +
        '</div>';
      var back = (D.backrefs[k] || []).filter(function (id) { return !it || id !== it.id; });
      if (back.length) {
        h += '<div class="cm-art-foot"><span>함께 연계된 항목</span>' + back.map(function (id) {
          return '<button class="cm-ref" data-viewer="' + esc(id) + '" data-focus="' + esc(k) + '" title="' + esc(D.itemById[id] ? D.itemById[id].title : '') + '">' + esc(id) + '</button>';
        }).join('') + '</div>';
      }
      h += '</article>';
      return h;
    }
    function closeViewer(fromPop) {
      if (!viewerOpen) return;
      viewerOpen = false;
      $viewer.classList.remove('is-open');
      $viewerPanel.innerHTML = '';
      if (!fromPop && opt.useHash) { try { if (history.state && history.state.cmViewer) history.back(); } catch (e) { /* noop */ } }
    }

    /* ── 법령 원문 목록 ── */
    function renderLaws() {
      var h = '<div class="cm-page-head"><div><h1 class="cm-page-title">법령 원문</h1><p class="cm-page-desc">매뉴얼에 연계된 조문 목록입니다. 조문을 누르면 원문과 연계 항목을 볼 수 있습니다.</p></div></div>';
      h += '<div class="cm-toolbar"><label class="cm-search">' + icon('search') + '<input type="search" data-act="search" placeholder="조문 번호·제목·본문 검색" value="' + esc(state.q) + '" aria-label="검색"></label></div>';
      h += '<div data-role="results">' + lawsResultsHTML() + '</div>';
      $view.innerHTML = h;
    }
    function lawsResultsHTML() {
      var q = state.q.trim().toLowerCase();
      var h = '';
      var keys = Object.keys(D.laws.articles).filter(function (k) {
        if (state.families.indexOf(famOf(k)) < 0) return false;
        if (!q) return true;
        var a = art(k);
        return (refLabel(k) + ' ' + a.title + ' ' + (a.text || '')).toLowerCase().indexOf(q) >= 0;
      });
      (D.cfg.sources || []).forEach(function (src) {
        var ks = keys.filter(function (k) { return k.split(':')[0] === src.code; });
        if (!ks.length) return;
        var info = D.laws.sources[src.code] || {};
        h += '<div class="cm-section-title"><span class="cm-tag fam-' + esc(src.family) + '">' + esc((D.families[src.family] || {}).name || '') + '</span>' + esc(src.name) +
          (info.effective ? ' <span style="color:var(--cm-text-3);font-weight:600;font-size:13px">시행 ' + esc(info.effective) + '</span>' : '') + '</div>';
        h += '<div class="cm-table-wrap"><table class="cm-table"><thead><tr><th style="width:150px">조문</th><th>제목</th><th style="width:200px">연계 항목</th></tr></thead><tbody>';
        ks.forEach(function (k) {
          var a = art(k);
          h += '<tr><td><button class="cm-ref fam-' + esc(famOf(k)) + (a.changed_at ? ' is-amended' : '') + '" data-article="' + esc(k) + '"><span class="cm-dot"></span>' + esc(k.split(':')[1]) + '</button></td>' +
            '<td>' + hl(a.title, state.q.trim()) + (a.text ? '' : ' <span class="cm-tag">원문 미수집</span>') + '</td>' +
            '<td>' + (D.backrefs[k] || []).map(function (id) { return '<span class="cm-tag">' + esc(id) + '</span>'; }).join(' ') + '</td></tr>';
        });
        h += '</tbody></table></div>';
      });
      if (!keys.length) h += '<div class="cm-empty">검색 결과가 없습니다.</div>';
      return h;
    }

    /* ── 개정 현황 ── */
    function renderChanges() {
      var flagged = D.manual.items.filter(function (it) { return amendedRefs(it).length; });
      var today = todayISO();
      var h = '<div class="cm-page-head"><div><h1 class="cm-page-title">법령 개정 현황</h1><p class="cm-page-desc">배치 동기화 기준 ' + esc((D.laws.generated_at || '').slice(0, 10)) + ' · 개정이 감지된 조문과 현행화가 필요한 매뉴얼 항목</p></div></div>';

      h += '<div class="cm-section-title">' + icon('alert') + '현행화 필요 항목 <span style="color:var(--cm-text-3)">' + flagged.length + '</span></div>';
      if (!flagged.length) {
        h += '<div class="cm-card" style="padding:18px;color:var(--cm-text-2)">현재 매뉴얼 검수일 이후 개정이 감지된 조문이 없습니다.</div>';
      } else {
        h += '<div class="cm-table-wrap"><table class="cm-table"><thead><tr><th>항목</th><th>개정 조문</th><th style="width:120px">검수일</th></tr></thead><tbody>';
        flagged.forEach(function (it) {
          h += '<tr><td><strong>' + esc(it.id) + '</strong> ' + esc(it.title) + '</td><td>' + amendedRefs(it).map(function (k) {
            return '<button class="cm-ref is-amended fam-' + esc(famOf(k)) + '" data-viewer="' + esc(it.id) + '" data-focus="' + esc(k) + '"><span class="cm-dot"></span>' + esc(refLabel(k)) + ' · ' + esc(art(k).changed_at) + '</button>';
          }).join(' ') + '</td><td>' + esc(it.reviewed_at || '-') + '</td></tr>';
        });
        h += '</tbody></table></div>';
      }

      h += '<div class="cm-section-title">' + icon('book') + '법령별 시행일 · 시행예정 개정</div>';
      h += '<div class="cm-table-wrap"><table class="cm-table"><thead><tr><th>법령</th><th style="width:120px">현행 시행일</th><th>시행예정 개정</th></tr></thead><tbody>';
      (D.cfg.sources || []).forEach(function (src) {
        var info = D.laws.sources[src.code];
        if (!info) return;
        var pend = (info.pending || []).filter(function (p) { return p.effective > today; });
        h += '<tr><td>' + esc(src.name) + '</td><td>' + esc(info.effective || '미수집') + '</td><td>' +
          (pend.length ? pend.map(function (p) { return '<span class="cm-tag warn">' + esc(p.effective) + ' 시행</span> ' + esc(p.note || ''); }).join('<br>') : '<span style="color:var(--cm-text-3)">없음</span>') + '</td></tr>';
      });
      h += '</tbody></table></div>';

      if (D.changes.length) {
        h += '<div class="cm-section-title">' + icon('bell') + '동기화 변경 이력</div><div class="cm-table-wrap"><table class="cm-table"><thead><tr><th style="width:120px">감지일</th><th>조문</th><th style="width:100px">구분</th></tr></thead><tbody>';
        D.changes.slice().reverse().slice(0, 200).forEach(function (c) {
          h += '<tr><td>' + esc(c.detected_at) + '</td><td>' + esc(c.key) + (c.title ? ' (' + esc(c.title) + ')' : '') + '</td><td>' + esc(c.type) + '</td></tr>';
        });
        h += '</tbody></table></div>';
      }
      $view.innerHTML = h;
    }

    /* ── 정보 ── */
    function renderAbout() {
      var errs = errlog.list();
      var info = D.info || {};
      var home = safeHttpUrl(info.homepage);
      var h = '<div class="cm-page-head"><div><h1 class="cm-page-title">정보 · 사용법</h1></div></div><div class="cm-about">';
      h += '<section class="cm-card"><h3 style="margin-bottom:10px">' + esc(info.name || opt.title) + '</h3><dl class="cm-kv">' +
        '<dt>버전</dt><dd>' + VERSION + (info.repo ? ' <button class="cm-btn cm-btn-sm" data-act="check-update" style="margin-left:6px">최신 버전 확인</button> <span data-role="update"></span>' : '') + '</dd>' +
        '<dt>법령 데이터</dt><dd>' + esc((D.laws.generated_at || '').slice(0, 10)) + ' 기준 · 조문 ' + Object.keys(D.laws.articles).length + '개</dd>' +
        '<dt>매뉴얼 데이터</dt><dd>' + esc(D.manual.updated_at || '') + ' 기준 · 항목 ' + D.manual.items.length + '개</dd>' +
        (info.author ? '<dt>만든이</dt><dd>' + esc(info.author) + '</dd>' : '') +
        (info.email ? '<dt>이메일</dt><dd>' + esc(info.email) + '</dd>' : '') +
        (home ? '<dt>홈페이지</dt><dd><a href="' + esc(home) + '" target="_blank" rel="noopener noreferrer">' + esc(home) + '</a></dd>' : '') +
        (info.law_source ? '<dt>법령 출처</dt><dd>' + esc(info.law_source) + '</dd>' : '') +
        '</dl></section>';

      h += '<section class="cm-card"><h3>사용 방법</h3><ol class="cm-steps">' +
        '<li><strong>메뉴(☰)</strong>에서 업권(자산운용업 / 투자매매·중개업), 업무 프로세스, 법령 필터를 고릅니다. 넓은 화면에서는 메뉴 버튼으로 사이드바를 고정·해제합니다.</li>' +
        '<li>상단 <strong>준법감시인 / 검사역</strong> 버튼으로 모드를 바꿉니다. 준법감시인 모드는 사전 점검 체크리스트·점검주기·증빙자료를, 검사역 모드는 검사착안사항·적발 패턴·제재 근거를 보여줍니다.</li>' +
        '<li>각 문항에 <strong>적정 / 미흡 / 해당없음</strong>을 선택하고 의견을 적습니다. 결과는 이 브라우저에 자동 저장되며 모드별로 따로 관리됩니다. 같은 버튼을 다시 누르면 선택이 해제됩니다.</li>' +
        '<li>근거 조문 칩이나 <strong>3단 대조</strong> 버튼을 누르면 법률·시행령·감독규정 원문이 나란히 열립니다. ESC 또는 뒤로가기로 닫습니다.</li>' +
        '<li>점검이 끝나면 <strong>CSV</strong>(엑셀에서 열기) 또는 <strong>보고서 인쇄·PDF</strong>로 결과를 출력합니다. 인쇄 창에서 "PDF로 저장"을 선택하면 PDF가 됩니다.</li>' +
        '<li>법령이 개정되면 연계 항목에 <span class="cm-tag warn">법령 개정 - 매뉴얼 현행화 필요</span> 배지가 붙습니다. <strong>개정 현황</strong> 화면에서 모아 볼 수 있습니다.</li>' +
        '</ol><p style="margin-top:10px;color:var(--cm-text-3);font-size:13px">점검 결과는 서버로 전송되지 않고 이 브라우저(localStorage)에만 저장됩니다. 브라우저 데이터를 지우면 함께 삭제되므로 CSV로 보관해 두세요.</p></section>';

      h += '<section class="cm-card"><h3>데이터 관리</h3><div class="cm-toolbar" style="margin:10px 0 0">' +
        '<button class="cm-btn" data-act="reset-marks">' + icon('reset') + '현재 모드 점검결과 초기화</button>' +
        '<button class="cm-btn" data-act="export-errors">' + icon('download') + '오류 로그 내보내기 (' + errs.length + ')</button>' +
        (errs.length ? '<button class="cm-btn" data-act="clear-errors">오류 로그 비우기</button>' : '') +
        '</div></section>';
      h += '<section class="cm-card" style="color:var(--cm-text-2);font-size:13px"><strong>면책</strong> · 이 도구는 실무 참고용이며 법령의 공식 해석이 아닙니다. 조문 원문은 국가법령정보센터의 최신 본문을 기준으로 하고, 점검 문항은 회사의 내부통제기준과 전문가 검수를 거쳐 사용하십시오.</section>';
      h += '</div>';
      $view.innerHTML = h;
    }

    function checkUpdate() {
      var $u = $view.querySelector('[data-role="update"]');
      var repo = D.info && D.info.repo;
      if (!$u || !repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return;
      $u.textContent = '확인 중…';
      fetch('https://api.github.com/repos/' + repo + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
        .then(function (r) {
          if (r.status === 404) return null;
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (rel) {
          if (!$u.isConnected) return;
          if (!rel) { $u.textContent = '공개된 릴리스가 아직 없습니다.'; return; }
          var latest = String(rel.tag_name || '').replace(/^v/i, '');
          var link = safeHttpUrl(rel.html_url);
          if (cmpVer(latest, VERSION) > 0) {
            $u.innerHTML = '새 버전 <strong>' + esc(latest) + '</strong>' + (link ? ' — <a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">릴리스 보기</a>' : '');
          } else {
            $u.textContent = '최신 버전입니다.';
          }
        })
        .catch(function (e) {
          errlog.record('업데이트 확인 실패', e && e.message);
          if ($u.isConnected) $u.textContent = '확인 실패 (네트워크 상태를 확인해 주세요)';
        });
    }
    function cmpVer(a, b) {
      var x = String(a).split('.'), y = String(b).split('.');
      for (var i = 0; i < Math.max(x.length, y.length); i++) {
        var d = (parseInt(x[i], 10) || 0) - (parseInt(y[i], 10) || 0);
        if (d) return d > 0 ? 1 : -1;
      }
      return 0;
    }

    /* ── 내보내기 ── */
    function exportRows() {
      var rows = [];
      filteredItems().forEach(function (it) {
        questions(it).forEach(function (text, i) {
          var v = marks[markKey(it, i)];
          rows.push({
            it: it, i: i, text: text, v: v ? MARK_LABEL[v] : '미점검', raw: v || '',
            note: i === 0 ? (notes[noteKey(it)] || '') : '',
            refs: (it.refs || []).map(refLabel).join('; ')
          });
        });
      });
      return rows;
    }
    function csvCell(v) {
      var s = String(v == null ? '' : v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // CSV 수식 주입 방지
      return '"' + s.replace(/"/g, '""') + '"';
    }
    function exportCSV() {
      var head = ['점검기준일', '대상', '점검자', '모드', '업권필터', '항목ID', '업무프로세스', '세부영역', '항목명', '문항번호', '문항', '결과', '의견', '근거조문', '현행화필요'];
      var lines = [head.map(csvCell).join(',')];
      exportRows().forEach(function (r) {
        lines.push([meta.date, meta.org, meta.inspector, state.mode === 'examiner' ? '검사역' : '준법감시인',
          state.line === 'ALL' ? '전체' : lineName(state.line), r.it.id, procName(r.it.process), r.it.area, r.it.title,
          r.i + 1, r.text, r.v, r.note, r.refs, amendedRefs(r.it).length ? 'Y' : ''].map(csvCell).join(','));
      });
      var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      // 파일명은 ASCII 로 (일부 브라우저가 한글 download 이름을 무시하고 'download' 로 저장)
      download(blob, 'checklist_' + (state.mode === 'examiner' ? 'examiner' : 'compliance') + '_' + (String(meta.date || '').replace(/[^\d-]/g, '') || todayISO()) + '.csv');
      toast('CSV 파일을 내려받았습니다.');
    }
    function download(blob, name) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
    function printReport() {
      var old = document.querySelector('.cm-report');
      if (old) old.remove();
      var rows = exportRows();
      var c = computeStats(filteredItems());
      var el = document.createElement('div');
      el.className = 'cm-report';
      var h = '<h1>' + esc(opt.title) + ' 점검 보고서</h1>' +
        '<div class="rp-meta">모드: ' + (state.mode === 'examiner' ? '검사역' : '준법감시인') + ' · 업권: ' + esc(state.line === 'ALL' ? '전체' : lineName(state.line)) +
        ' · 기준일: ' + esc(meta.date) + ' · 대상: ' + esc(meta.org || '-') + ' · 점검자: ' + esc(meta.inspector || '-') + '<br>' +
        '총 ' + c.total + '문항 — 적정 ' + c.ok + ' / 미흡 ' + c.ng + ' / 해당없음 ' + c.na + ' / 미점검 ' + c.todo +
        ' · 법령 데이터 ' + esc((D.laws.generated_at || '').slice(0, 10)) + ' 기준</div>' +
        '<table><thead><tr><th style="width:30mm">항목</th><th>문항</th><th style="width:16mm">결과</th><th style="width:44mm">의견 · 근거</th></tr></thead><tbody>';
      var last = null;
      rows.forEach(function (r) {
        var first = r.it.id !== last;
        var note = notes[noteKey(r.it)] || '';
        h += '<tr><td>' + (first ? '<strong>' + esc(r.it.id) + '</strong><br>' + esc(r.it.title) : '') + '</td>' +
          '<td>' + (r.i + 1) + '. ' + esc(r.text) + '</td><td class="' + (r.raw === 'ng' ? 'rp-ng' : '') + '">' + esc(r.v) + '</td>' +
          '<td>' + (first ? esc(note) + (note ? '<br>' : '') + '<small>' + esc(r.refs) + '</small>' : '') + '</td></tr>';
        last = r.it.id;
      });
      h += '</tbody></table>';
      el.innerHTML = h;
      document.body.appendChild(el);
      var cleaned = false;
      var cleanup = function () { if (cleaned) return; cleaned = true; el.remove(); global.removeEventListener('afterprint', cleanup); };
      global.addEventListener('afterprint', cleanup);
      setTimeout(function () {
        // 보고서 요소는 화면에서는 display:none 이므로, afterprint 가 오지 않는 브라우저에서도
        // 다음 인쇄 시 교체될 때까지 남아 있어도 무해하다(비동기 인쇄 대화상자 대비 강제 제거하지 않음).
        try { global.print(); } catch (e) { errlog.record('인쇄 실패', e && e.message); cleanup(); }
      }, 50);
    }

    /* ── 라우팅 (해시) — 뒤로가기 시 이전 화면으로 ── */
    function routeFromHash() {
      if (!opt.useHash) return;
      var m = /^#\/(checklist|laws|changes|about)(?:\/(.+))?$/.exec(location.hash || '');
      if (m) {
        state.view = m[1];
        if (m[1] === 'checklist') {
          var p = 'all';
          try { p = m[2] ? decodeURIComponent(m[2]) : 'all'; } catch (e) { p = 'all'; }
          state.process = p;
        }
      } else { state.view = 'checklist'; state.process = 'all'; }
    }
    function navigate(view, process) {
      if (view !== state.view) state.q = ''; // 화면이 바뀌면 검색어 초기화
      state.view = view;
      if (process != null) state.process = process;
      if (opt.useHash) {
        var h = '#/' + view + (view === 'checklist' && state.process !== 'all' ? '/' + encodeURIComponent(state.process) : '');
        if (location.hash !== h) { location.hash = h; return; } // hashchange → render
      }
      renderAll();
      if (global.scrollTo) global.scrollTo(0, 0);
    }
    function itemFromEl(el) {
      var card = el.closest('[data-item]');
      return card ? D.itemById[card.getAttribute('data-item')] || null : null;
    }

    /* ── 이벤트 ── */
    on(root, 'click', function (e) {
      var t = e.target.closest('button, [data-act]');
      if (!t || !root.contains(t)) return;
      var act = t.getAttribute('data-act');
      if (act === 'drawer') return openDrawer();
      if (act === 'drawer-close') return closeDrawer();
      if (act === 'viewer-close') return closeViewer(false);
      if (!D) return;
      if (t.hasAttribute('data-mode')) {
        var nm = t.getAttribute('data-mode');
        if (nm === state.mode) return;
        state.mode = nm; savePrefs(); if (viewerOpen) closeViewer(false); renderAll(); return;
      }
      if (t.hasAttribute('data-nav')) {
        var nav = t.getAttribute('data-nav');
        closeDrawer();
        if (nav.indexOf('view:') === 0) return navigate(nav.slice(5), nav === 'view:checklist' ? 'all' : null);
        if (nav.indexOf('proc:') === 0) return navigate('checklist', nav.slice(5));
        return;
      }
      if (t.hasAttribute('data-line')) { state.line = t.getAttribute('data-line'); savePrefs(); renderAll(); return; }
      if (t.hasAttribute('data-fam')) {
        var f = t.getAttribute('data-fam');
        var i = state.families.indexOf(f);
        if (i >= 0) { if (state.families.length === 1) { toast('법령은 하나 이상 선택해야 합니다.'); return; } state.families.splice(i, 1); }
        else state.families.push(f);
        savePrefs(); renderAll(); return;
      }
      if (t.hasAttribute('data-mark')) {
        var it = itemFromEl(t);
        if (!it) return;
        var k = markKey(it, t.getAttribute('data-mark'));
        var v = t.getAttribute('data-v');
        if (marks[k] === v) delete marks[k]; else marks[k] = v;
        if (!marksStore.set(marks)) toast('브라우저 저장소를 사용할 수 없어 결과가 저장되지 않습니다.');
        t.parentNode.querySelectorAll('.cm-mark').forEach(function (b) { b.setAttribute('aria-pressed', String(marks[k] === b.getAttribute('data-v'))); });
        updateStats();
        return;
      }
      if (t.hasAttribute('data-viewer')) return openViewer(t.getAttribute('data-viewer'), t.getAttribute('data-focus'));
      if (t.hasAttribute('data-article')) return openViewer(null, t.getAttribute('data-article'), t.getAttribute('data-article'));
      if (act === 'toggle-flag') { state.onlyFlag = !state.onlyFlag; renderView(); return; }
      if (act === 'csv') return exportCSV();
      if (act === 'print') return printReport();
      if (act === 'check-update') return checkUpdate();
      if (act === 'reset-marks') {
        var prefix = state.mode + ':';
        Object.keys(marks).forEach(function (key) { if (key.indexOf(prefix) === 0) delete marks[key]; });
        Object.keys(notes).forEach(function (key) { if (key.indexOf(prefix) === 0) delete notes[key]; });
        marksStore.set(marks); notesStore.set(notes);
        toast((state.mode === 'examiner' ? '검사역' : '준법감시인') + ' 모드 점검결과를 초기화했습니다.');
        return;
      }
      if (act === 'export-errors') {
        download(new Blob([JSON.stringify(errlog.list(), null, 2)], { type: 'application/json' }), 'cm_error_log_' + todayISO() + '.json');
        return;
      }
      if (act === 'clear-errors') { errlog.clear(); renderView(); return; }
    });

    on($viewer, 'click', function (e) { if (e.target === $viewer) closeViewer(false); });

    on(root, 'input', function (e) {
      var t = e.target;
      if (!D) return;
      if (t.matches('[data-act="search"]')) {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          state.q = t.value;
          renderResults();
        }, 200);
        return;
      }
      if (t.matches('[data-note]')) {
        var it = itemFromEl(t);
        if (!it) return;
        if (t.value) notes[noteKey(it)] = t.value; else delete notes[noteKey(it)];
        notesStore.set(notes);
        return;
      }
      if (t.matches('[data-meta]')) {
        meta[t.getAttribute('data-meta')] = t.value;
        metaStore.set(meta);
      }
    });

    on(document, 'keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (viewerOpen) { closeViewer(false); return; }
      if (root.classList.contains('is-drawer-open')) closeDrawer();
    });
    if (opt.useHash) {
      on(global, 'hashchange', function () {
        if (!D) return;
        if (viewerOpen) closeViewer(true);
        routeFromHash(); renderAll();
        if (global.scrollTo) global.scrollTo(0, 0);
      });
      on(global, 'popstate', function () { if (viewerOpen) closeViewer(true); });
    }
    on(global, 'error', function (e) {
      if (!e || (e.filename && e.filename.indexOf('compliance-manual') < 0)) return;
      errlog.record(e.message || '스크립트 오류', (e.error && e.error.stack) || (e.filename + ':' + e.lineno));
    });
    on(global, 'unhandledrejection', function (e) { errlog.record('처리되지 않은 Promise 오류', e && e.reason && (e.reason.stack || e.reason)); });

    return {
      version: VERSION,
      destroy: function () {
        listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
        listeners = [];
        clearTimeout(searchTimer); clearTimeout(toastTimer);
        if (viewerOpen) closeViewer(true);
        root.innerHTML = '';
        root.classList.remove('cm', 'is-pinned', 'is-drawer-open');
      }
    };
  }

  global.ComplianceManual = { mount: mount, version: VERSION };
})(window);
