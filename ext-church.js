/* 열방교회 확장 모듈 3/3 — 교적 · 출결 · 심방 · 보고서 · 통계 · 게시판 */
(function () {
  "use strict";
  const { h } = YB;
  const chip = (t) => `<span class="chip">${h(t)}</span>`;
  const periodText = (v) => chip(`${v.from || "처음"} ~ ${v.to || "현재"}`);
  const worshipOpts = () => state.config.worships;
  const quietSave = () => { DATA_STORE.setItem(STORAGE_KEY, JSON.stringify(state)); window.dispatchEvent(new CustomEvent("yolbang-state-saved", { detail: { state } })); renderAll(); };
  const empty = (icon, title, text = "") => `<div class="empty-state"><div>${icon}</div><h3>${h(title)}</h3><p>${h(text)}</p></div>`;
  const birthText = (m) => (m.birth ? `${m.birth}${m.lunar ? " (음)" : ""}` : "");

  /* ===== 교인 ===== */
  const search = { q: "", status: "active", net: "", position: "", gender: "", ageMin: "", ageMax: "", birthMonth: "", regFrom: "", regTo: "" };
  const picked = new Set();
  const STATUS_OPTS = [["active", "활동 교인(재적·새가족 등)"], ["", "전체"], "재적", "새가족", "이명", "제적", "별세", "기타"];
  function searchRows() {
    const q = search.q.trim().toLowerCase();
    return state.members.filter((m) => {
      if (search.status === "active" ? !YB.isActive(m) : search.status && m.status !== search.status) return false;
      if (q && !`${m.name} ${m.phone || ""} ${m.group || ""} ${m.address || ""} ${m.family || ""} ${m.memberNo || ""} ${m.memo || ""}`.toLowerCase().includes(q)) return false;
      if (search.net && YB.netOf(m) !== search.net) return false;
      if (search.position && m.position !== search.position) return false;
      if (search.gender && m.gender !== search.gender) return false;
      const age = YB.age(m.birth);
      if (search.ageMin !== "" && (age == null || age < Number(search.ageMin))) return false;
      if (search.ageMax !== "" && (age == null || age > Number(search.ageMax))) return false;
      if (search.birthMonth && Number(String(m.birth || "").slice(5, 7)) !== Number(search.birthMonth)) return false;
      if ((search.regFrom || search.regTo) && !YB.inRange(m.registeredAt, search.regFrom, search.regTo)) return false;
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }
  YB.page({
    id: "memberSearch", title: "교인 검색 · 목록", group: "교인", icon: "🔍", desc: "교인을 여러 조건으로 검색하고, 목록에서 상태 변경·그룹 추가 같은 일괄 작업을 합니다.",
    render(el) {
      const sel = (key, opts) => `<select data-s="${key}">${opts.map((o) => (Array.isArray(o) ? o : [o, o])).map(([v, l]) => `<option value="${h(v)}" ${String(search[key]) === String(v) ? "selected" : ""}>${h(l)}</option>`).join("")}</select>`;
      const inp = (key, type = "text", ph = "") => `<input type="${type}" data-s="${key}" value="${h(search[key])}" placeholder="${ph}">`;
      el.innerHTML = `<div class="yb-toolbar no-print"><label>검색어${inp("q", "text", "이름·연락처·주소·세대")}</label><label>상태${sel("status", STATUS_OPTS)}</label><label>소속${sel("net", YB.netOptions())}</label><label>직분${sel("position", [["", "전체"], ...state.config.positions])}</label><label>성별${sel("gender", [["", "전체"], "남", "여"])}</label><label>나이 이상${inp("ageMin", "number")}</label><label>나이 이하${inp("ageMax", "number")}</label><label>생일 월${sel("birthMonth", [["", "전체"], ...Array.from({ length: 12 }, (_, i) => [String(i + 1), `${i + 1}월`])])}</label><label>등록일 시작${inp("regFrom", "date")}</label><label>등록일 종료${inp("regTo", "date")}</label></div>
        <div class="yb-toolbar no-print"><label>저장된 검색조건<select class="yb-saved"></select></label><button class="ghost small" data-do="load">불러오기</button><button class="ghost small" data-do="save">현재 조건 저장</button><button class="ghost small" data-do="unsave">조건 삭제</button><button class="ghost small" data-do="clear">조건 초기화</button></div>
        <article class="panel"><div class="panel-head"><div><p class="eyebrow">DIRECTORY</p><h3>교인 목록</h3></div><div class="yb-summary"></div></div>
        <div class="yb-toolbar no-print"><button class="ghost small" data-do="all">전체 선택</button><button class="ghost small" data-do="none">선택 해제</button><label>상태<select class="yb-new-status">${["재적", "새가족", "이명", "제적", "별세", "기타"].map((s) => `<option>${s}</option>`).join("")}</select></label><button class="ghost small" data-do="status">선택 교인 상태 변경</button><label>그룹<select class="yb-to-group"></select></label><button class="ghost small" data-do="group">선택 교인 그룹에 추가</button><span class="yb-spacer"></span><button class="ghost small" data-do="xlsx">엑셀 저장</button><button class="ghost small" data-do="print">인쇄</button></div><div class="yb-result"></div></article>`;
      el.querySelectorAll("[data-s]").forEach((i) => i.addEventListener("input", () => { search[i.dataset.s] = i.value; this.refresh(); }));
      el.querySelector(".yb-result").addEventListener("click", (e) => {
        const c = e.target.closest("[data-pick]"); if (c) { c.checked ? picked.add(c.dataset.pick) : picked.delete(c.dataset.pick); return this.count(); }
        const b = e.target.closest("[data-edit]"); if (b) { go("members"); editMember(b.dataset.edit); }
      });
      el.addEventListener("click", (e) => {
        const act = e.target.closest("[data-do]")?.dataset.do; if (!act) return; const rows = searchRows(), saved = el.querySelector(".yb-saved").value;
        if (act === "all") { rows.forEach((m) => picked.add(m.id)); return this.refresh(); }
        if (act === "none") { picked.clear(); return this.refresh(); }
        if (act === "clear") { Object.assign(search, { q: "", status: "active", net: "", position: "", gender: "", ageMin: "", ageMax: "", birthMonth: "", regFrom: "", regTo: "" }); return go("memberSearch"); }
        if (act === "print") return window.print();
        if (act === "xlsx") return YB.exportTable("교인목록", ["이름", "성별", "생년월일", "나이", "직분", "소속", "세대", "연락처", "주소", "상태", "등록일", "메모"], rows.map((m) => [m.name, m.gender || "", birthText(m), YB.age(m.birth) ?? "", m.position || "", m.group || "", m.family || "", m.phone || "", m.address || "", m.status || "", m.registeredAt || "", m.memo || ""]));
        if (act === "save") { const name = (prompt("검색조건 이름", "") || "").trim(); if (!name) return; state.savedSearches.push({ id: uid("srch"), name, conditions: { ...search }, updatedAt: Date.now() }); return saveState("검색조건을 저장했습니다"); }
        if (act === "load") { const s = state.savedSearches.find((x) => x.id === saved); if (!s) return toast("저장된 검색조건을 선택해 주세요"); Object.assign(search, s.conditions); return go("memberSearch"); }
        if (act === "unsave") { if (!saved) return toast("삭제할 검색조건을 선택해 주세요"); if (!confirm("이 검색조건을 삭제할까요?")) return; window.YolbangSync?.queueDelete("savedSearches", saved); state.savedSearches = state.savedSearches.filter((x) => x.id !== saved); return saveState("검색조건을 삭제했습니다"); }
        const targets = state.members.filter((m) => picked.has(m.id)); if (!targets.length) return toast("먼저 교인을 선택해 주세요");
        if (act === "status") { const st = el.querySelector(".yb-new-status").value; if (!confirm(`선택한 ${targets.length}명의 상태를 '${st}'(으)로 바꿀까요?`)) return; targets.forEach((m) => { m.status = st; m.updatedAt = Date.now(); }); picked.clear(); return saveState(`${targets.length}명의 상태를 변경했습니다`); }
        if (act === "group") { const g = state.groups.find((x) => x.id === el.querySelector(".yb-to-group").value); if (!g) return toast("교인 그룹 메뉴에서 그룹을 먼저 만들어 주세요"); g.memberIds = [...new Set([...(g.memberIds || []), ...targets.map((m) => m.id)])]; g.updatedAt = Date.now(); picked.clear(); return saveState(`'${g.name}' 그룹에 ${targets.length}명을 추가했습니다`); }
      });
    },
    count() { const el = $("memberSearchView"); el.querySelector(".yb-summary").innerHTML = chip(`검색 ${searchRows().length}명`) + chip(`선택 ${picked.size}명`); },
    refresh() {
      const el = $("memberSearchView"); if (!el?.querySelector(".yb-result")) return; const rows = searchRows();
      const keep = (s, html) => { const old = s.value; s.innerHTML = html; if (old) s.value = old; };
      keep(el.querySelector(".yb-saved"), '<option value="">선택</option>' + state.savedSearches.map((s) => `<option value="${s.id}">${h(s.name)}</option>`).join(""));
      keep(el.querySelector(".yb-to-group"), state.groups.map((g) => `<option value="${g.id}">${h(g.name)}</option>`).join("") || '<option value="">그룹 없음</option>');
      el.querySelector(".yb-result").innerHTML = YB.tableHtml(["", "이름", "성별", "생년월일", "직분", "소속", "연락처", "상태", "등록일"], rows.map((m) => [{ html: `<input type="checkbox" data-pick="${m.id}" ${picked.has(m.id) ? "checked" : ""}>`, text: "" }, { html: `<button class="text-button yb-link" data-edit="${m.id}">${h(m.name)}</button>`, text: m.name }, m.gender || "", m.birth ? `${birthText(m)} · ${YB.age(m.birth)}세` : "", m.position || "", m.group || "", m.phone || "", m.status || "", m.registeredAt || ""]), null, "조건에 맞는 교인이 없습니다.");
      this.count();
    },
  });

  let groupId = "";
  YB.page({
    id: "groups", title: "교인 그룹", group: "교인", icon: "👥", desc: "교인을 그룹 단위로 묶어 관리하는 페이지입니다.",
    render(el) {
      el.innerHTML = `<div class="yb-toolbar no-print"><label>그룹<select class="yb-group"></select></label><button class="primary small" data-do="new">새 그룹</button><button class="ghost small" data-do="rename">이름 변경</button><button class="ghost small" data-do="delete">그룹 삭제</button><span class="yb-spacer"></span><label>교인 추가<input list="ybMembers" class="yb-add" placeholder="이름 입력 후 Enter"></label><button class="ghost small" data-do="add">추가</button></div><article class="panel"><div class="panel-head"><div><p class="eyebrow">GROUP</p><h3 class="yb-group-title">교인 그룹</h3></div><div class="filter-row no-print"><button class="ghost small" data-do="xlsx">엑셀 저장</button><button class="ghost small" data-do="print">인쇄</button></div></div><div class="yb-result"></div></article>`;
      const current = () => state.groups.find((g) => g.id === groupId);
      const add = () => { const g = current(), inp = el.querySelector(".yb-add"), m = YB.findMember(inp.value); if (!g) return toast("먼저 그룹을 만들어 주세요"); if (!m) return toast("교인을 목록에서 선택해 주세요"); if ((g.memberIds || []).includes(m.id)) return toast("이미 그룹에 있는 교인입니다"); g.memberIds = [...(g.memberIds || []), m.id]; g.updatedAt = Date.now(); inp.value = ""; saveState(`${m.name} 님을 추가했습니다`); };
      el.querySelector(".yb-group").addEventListener("change", (e) => { groupId = e.target.value; this.refresh(); });
      el.querySelector(".yb-add").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
      el.addEventListener("click", (e) => {
        const out = e.target.closest("[data-out]"); if (out) { const g = current(); g.memberIds = g.memberIds.filter((id) => id !== out.dataset.out); g.updatedAt = Date.now(); return saveState("그룹에서 제외했습니다"); }
        const act = e.target.closest("[data-do]")?.dataset.do, g = current(); if (!act) return;
        if (act === "new") { const name = (prompt("새 그룹 이름", "") || "").trim(); if (!name) return; const rec = { id: uid("grp"), name, memberIds: [], updatedAt: Date.now() }; state.groups.push(rec); groupId = rec.id; return saveState("그룹을 만들었습니다"); }
        if (act === "add") return add(); if (act === "print") return window.print();
        if (!g) return toast("먼저 그룹을 만들어 주세요");
        if (act === "rename") { const name = (prompt("그룹 이름", g.name) || "").trim(); if (!name) return; g.name = name; g.updatedAt = Date.now(); return saveState("이름을 바꿨습니다"); }
        if (act === "delete") { if (!confirm(`'${g.name}' 그룹을 삭제할까요? 교인 정보는 삭제되지 않습니다.`)) return; window.YolbangSync?.queueDelete("groups", g.id); state.groups = state.groups.filter((x) => x.id !== g.id); groupId = ""; return saveState("그룹을 삭제했습니다"); }
        if (act === "xlsx") return YB.exportTable(`그룹_${g.name}`, ["이름", "직분", "소속", "연락처"], (g.memberIds || []).map(YB.member).filter(Boolean).map((m) => [m.name, m.position || "", m.group || "", m.phone || ""]));
      });
    },
    refresh() {
      const el = $("groupsView"); if (!el?.querySelector(".yb-group")) return;
      if (!state.groups.some((g) => g.id === groupId)) groupId = state.groups[0]?.id || "";
      el.querySelector(".yb-group").innerHTML = state.groups.map((g) => `<option value="${g.id}" ${g.id === groupId ? "selected" : ""}>${h(g.name)} (${(g.memberIds || []).length}명)</option>`).join("") || '<option value="">그룹 없음</option>';
      const g = state.groups.find((x) => x.id === groupId), members = (g?.memberIds || []).map(YB.member).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, "ko"));
      el.querySelector(".yb-group-title").textContent = g ? `${g.name} · ${members.length}명` : "교인 그룹";
      el.querySelector(".yb-result").innerHTML = g ? YB.tableHtml(["이름", "직분", "소속", "연락처", "상태", ""], members.map((m) => [m.name, m.position || "", m.group || "", m.phone || "", m.status || "", { html: `<button class="icon-button no-print" data-out="${m.id}">제외</button>`, text: "" }]), null, "그룹에 교인이 없습니다. 위에서 교인을 추가해 주세요.") : empty("👥", "그룹이 없습니다", "‘새 그룹’을 눌러 첫 그룹을 만들어 주세요.");
    },
  });

  YB.report({
    id: "removed", title: "제적 목록", group: "교인", icon: "🚪", desc: "제적·이명·별세 처리된 교인 목록을 조회하고 필요하면 복원합니다.",
    controls: [{ key: "status", label: "상태", type: "select", options: [["", "전체"], ...INACTIVE_STATUSES] }],
    compute(v) { const rows = state.members.filter((m) => INACTIVE_STATUSES.includes(m.status) && (!v.status || m.status === v.status)).sort((a, b) => a.name.localeCompare(b.name, "ko")); return { headers: ["이름", "상태", "소속", "연락처", "등록일", "메모", ""], rows: rows.map((m) => [m.name, m.status, m.group || "", m.phone || "", m.registeredAt || "", m.memo || "", { html: `<button class="icon-button no-print" data-action="restore" data-id="${m.id}">재적으로 복원</button>`, text: "" }]), summary: chip(`${rows.length}명`), empty: "제적 처리된 교인이 없습니다." }; },
    onAction(action, id) { const m = YB.member(id); if (!m || !confirm(`${m.name} 님을 ‘재적’으로 복원할까요?`)) return; m.status = "재적"; m.updatedAt = Date.now(); saveState("재적으로 복원했습니다"); },
  });
  YB.report({
    id: "anniversaries", title: "교인 기념일 · 월별 생일자", group: "교인", icon: "🎂", desc: "월별 생일자와 결혼기념일을 조회하는 페이지입니다.",
    controls: [{ key: "month", label: "월", type: "select", options: Array.from({ length: 12 }, (_, i) => [String(i + 1), `${i + 1}월`]), default: () => String(new Date().getMonth() + 1) }, { key: "kind", label: "구분", type: "select", options: [["", "전체"], "생일", "결혼기념일"] }],
    compute(v) {
      const mm = String(v.month).padStart(2, "0"), year = new Date().getFullYear(), items = [];
      YB.active().forEach((m) => {
        if (v.kind !== "결혼기념일" && String(m.birth || "").slice(5, 7) === mm) items.push([Number(m.birth.slice(8)), m.name, `생일${m.lunar ? " (음력)" : ""}`, `${year - Number(m.birth.slice(0, 4))}세`, m.group || "", m.phone || ""]);
        if (v.kind !== "생일" && String(m.anniversary || "").slice(5, 7) === mm) items.push([Number(m.anniversary.slice(8)), m.name, "결혼기념일", `${year - Number(m.anniversary.slice(0, 4))}주년`, m.group || "", m.phone || ""]);
      });
      items.sort((a, b) => a[0] - b[0]);
      return { headers: [{ label: "일", right: false }, "이름", "구분", "나이 / 주년", "소속", "연락처"], rows: items.map((r) => [`${r[0]}일`, ...r.slice(1)]), summary: chip(`${v.month}월 ${items.length}건`), empty: "해당 월의 기념일이 없습니다. 교인 등록에서 생년월일·결혼기념일을 입력해 주세요." };
    },
    note: "음력 생일은 입력된 날짜 그대로 표시합니다(양력 자동 변환 없음).",
  });

  /* ===== 출결 ===== */
  const attRec = (date, w) => state.attendance.find((r) => r.date === date && r.worship === w);
  const presentSet = (date, w) => new Set(attRec(date, w)?.present || []);
  function setPresent(date, w, ids, on) {
    let r = attRec(date, w);
    if (!r) { const id = `att_${date}_${w.replace(/[^0-9A-Za-z가-힣]/g, "_")}`; r = { id: state.attendance.some((x) => x.id === id) ? uid("att") : id, date, worship: w, present: [] }; state.attendance.push(r); }
    const s = new Set(r.present); ids.forEach((id) => (on ? s.add(id) : s.delete(id))); r.present = [...s]; r.updatedAt = Date.now();
  }
  const roster = (net) => YB.active().filter((m) => !net || YB.netOf(m) === net);
  const att = { date: YB.lastSunday(), worship: "", net: "", q: "" };
  const fixWorship = (o) => { if (!state.config.worships.includes(o.worship)) o.worship = state.config.worships[0] || ""; };
  const attControls = (o, extra = "") => `<label>예배<select data-a="worship">${worshipOpts().map((w) => `<option ${o.worship === w ? "selected" : ""}>${h(w)}</option>`).join("")}</select></label><label>소속<select data-a="net">${YB.netOptions().map(([v, l]) => `<option value="${h(v)}" ${o.net === v ? "selected" : ""}>${h(l)}</option>`).join("")}</select></label>${extra}`;
  YB.page({
    id: "attendance", title: "출결 관리", group: "출결", icon: "✔", desc: "날짜와 예배를 고르고 교인을 눌러 출석을 기록합니다.",
    render(el) {
      fixWorship(att);
      el.innerHTML = `<div class="yb-toolbar no-print"><label>날짜<input type="date" data-a="date" value="${att.date}"></label>${attControls(att, `<label>이름 검색<input data-a="q" value="${h(att.q)}" placeholder="이름"></label>`)}<span class="yb-spacer"></span><button class="ghost small" data-do="all">보이는 교인 전체 출석</button><button class="ghost small" data-do="none">전체 해제</button></div><article class="panel"><div class="panel-head"><div><p class="eyebrow">ATTENDANCE</p><h3>출석 체크</h3></div><div class="yb-summary"></div></div><p class="muted yb-note no-print">이름을 누르면 바로 저장됩니다. 색이 채워진 이름이 출석입니다.</p><div class="yb-att-grid"></div></article>`;
      el.querySelectorAll("[data-a]").forEach((i) => i.addEventListener("input", () => { att[i.dataset.a] = i.value; this.refresh(); }));
      el.querySelector(".yb-att-grid").addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (!b || !att.date) return; setPresent(att.date, att.worship, [b.dataset.m], !b.classList.contains("on")); quietSave(); });
      el.querySelectorAll("[data-do]").forEach((b) => b.addEventListener("click", () => { if (!att.date) return; const list = this.list(); if (b.dataset.do === "none" && !confirm("보이는 교인의 출석을 모두 해제할까요?")) return; setPresent(att.date, att.worship, list.map((m) => m.id), b.dataset.do === "all"); quietSave(); toast(b.dataset.do === "all" ? `${list.length}명을 출석 처리했습니다` : "출석을 해제했습니다"); }));
    },
    list() { const q = att.q.trim(); return roster(att.net).filter((m) => !q || m.name.includes(q)); },
    refresh() {
      const el = $("attendanceView"); if (!el?.querySelector(".yb-att-grid")) return; const list = this.list(), on = presentSet(att.date, att.worship);
      el.querySelector(".yb-summary").innerHTML = chip(`${att.date} ${att.worship}`) + chip(`출석 ${list.filter((m) => on.has(m.id)).length} / ${list.length}명`) + chip(`전체 출석 ${on.size}명`);
      el.querySelector(".yb-att-grid").innerHTML = list.length ? list.map((m) => `<button class="yb-att-chip ${on.has(m.id) ? "on" : ""}" data-m="${m.id}" title="${h(m.group || "")}">${h(m.name)}</button>`).join("") : empty("♙", "표시할 교인이 없습니다", "교인 등록 또는 설정에서 명부를 먼저 가져와 주세요.");
    },
  });

  const wk = { month: YB.thisMonth(), worship: "", net: "" };
  YB.page({
    id: "attendanceWeekly", title: "출결 관리(주간)", group: "출결", icon: "▦", desc: "한 달의 주별 출석을 표에서 한 번에 확인하고 기록합니다.",
    render(el) {
      fixWorship(wk);
      el.innerHTML = `<div class="yb-toolbar no-print"><label>월<input type="month" data-a="month" value="${wk.month}"></label>${attControls(wk)}<span class="yb-spacer"></span><button class="ghost small" data-do="xlsx">엑셀 저장</button><button class="ghost small" data-do="print">인쇄</button></div><article class="panel"><div class="panel-head"><div><p class="eyebrow">WEEKLY</p><h3>주간 출석부</h3></div><div class="yb-summary"></div></div><p class="muted yb-note no-print">칸을 누르면 출석(●)과 결석이 바뀌며 바로 저장됩니다. 주일과 기록이 있는 날짜가 표시됩니다.</p><div class="yb-result"></div></article>`;
      el.querySelectorAll("[data-a]").forEach((i) => i.addEventListener("input", () => { wk[i.dataset.a] = i.value; this.refresh(); }));
      el.querySelector(".yb-result").addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (!b) return; setPresent(b.dataset.d, wk.worship, [b.dataset.m], !b.classList.contains("on")); quietSave(); });
      el.querySelector('[data-do="print"]').addEventListener("click", () => window.print());
      el.querySelector('[data-do="xlsx"]').addEventListener("click", () => { const t = this.table(); YB.exportTable(`주간출석부_${wk.month}_${wk.worship}`, t.headers, t.rows, t.foot); });
    },
    table() {
      if (!/^\d{4}-\d{2}$/.test(wk.month)) return { headers: ["이름"], rows: [], foot: null, dates: [] };
      const dates = [...new Set([...YB.monthDays(wk.month).filter((d) => YB.parse(d).getDay() === 0), ...state.attendance.filter((r) => r.worship === wk.worship && r.date.startsWith(wk.month)).map((r) => r.date)])].sort();
      const sets = dates.map((d) => presentSet(d, wk.worship)), list = roster(wk.net);
      const rows = list.map((m) => [m.name, YB.netOf(m), ...dates.map((d, i) => ({ html: `<button class="yb-cell ${sets[i].has(m.id) ? "on" : ""}" data-m="${m.id}" data-d="${d}">${sets[i].has(m.id) ? "●" : "·"}</button>`, text: sets[i].has(m.id) ? "O" : "" })), sets.filter((s) => s.has(m.id)).length]);
      return { headers: ["이름", "소속", ...dates.map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`), "출석"], rows, foot: ["합계", `${list.length}명`, ...sets.map((s) => list.filter((m) => s.has(m.id)).length), ""], dates };
    },
    refresh() { const el = $("attendanceWeeklyView"); if (!el?.querySelector(".yb-result")) return; const t = this.table(); el.querySelector(".yb-summary").innerHTML = chip(`${wk.month} · ${wk.worship}`); el.querySelector(".yb-result").innerHTML = YB.tableHtml(t.headers, t.rows, t.foot, "표시할 교인이 없습니다."); },
  });

  YB.report({
    id: "absentees", title: "결석자 조회", group: "출결", icon: "🪑", desc: "교인 중 일정 기간 동안 연속으로 결석한 사람을 조회하는 페이지입니다.",
    controls: [{ type: "range", default: "4weeks" }, { key: "worship", label: "예배", type: "select", options: () => [["", "전체 예배"], ...worshipOpts()] }, { key: "net", label: "소속", type: "select", options: YB.netOptions }, { key: "n", label: "연속 결석 횟수 이상", type: "number", default: 2, min: 1 }],
    compute(v) {
      const recs = state.attendance.filter((r) => YB.inRange(r.date, v.from, v.to) && (!v.worship || r.worship === v.worship)), dates = [...new Set(recs.map((r) => r.date))].sort().reverse();
      if (!dates.length) return { html: empty("🪑", "기간 안에 출결 기록이 없습니다", "출결 관리에서 먼저 출석을 기록해 주세요.") };
      const came = (id, d) => recs.some((r) => r.date === d && (r.present || []).includes(id)), need = Math.min(Math.max(1, Number(v.n) || 1), dates.length);
      const rows = roster(v.net).map((m) => { let streak = 0; for (const d of dates) { if (came(m.id, d)) break; streak += 1; } const last = state.attendance.filter((r) => (r.present || []).includes(m.id)).map((r) => r.date).sort().pop() || "기록 없음"; return { m, streak, count: dates.filter((d) => came(m.id, d)).length, last }; }).filter((x) => x.streak >= need).sort((a, b) => b.streak - a.streak || a.m.name.localeCompare(b.m.name, "ko"));
      return { headers: ["이름", "소속", "연락처", "연속 결석", "기간 내 출석", "최근 출석일"], rows: rows.map((x) => [x.m.name, x.m.group || "", x.m.phone || "", x.streak, x.count, x.last]), summary: periodText(v) + chip(`출결 기록 ${dates.length}일`) + chip(`결석자 ${rows.length}명`), empty: "조건에 해당하는 결석자가 없습니다." };
    },
    note: "기간 안에 출결이 기록된 날짜를 기준으로, 가장 최근 날짜부터 연속으로 결석한 횟수를 셉니다.",
  });
  YB.report({
    id: "attendanceStats", title: "출석 통계", group: "출결", icon: "📈", desc: "날짜·예배별 출석 인원 통계를 조회합니다.",
    controls: [{ type: "range", default: "year" }, { key: "worship", label: "예배", type: "select", options: () => [["", "전체 예배"], ...worshipOpts()] }],
    compute(v) {
      const recs = state.attendance.filter((r) => YB.inRange(r.date, v.from, v.to) && (!v.worship || r.worship === v.worship)).sort((a, b) => a.date.localeCompare(b.date) || a.worship.localeCompare(b.worship, "ko")), counts = recs.map((r) => (r.present || []).length);
      const avg = counts.length ? Math.round(counts.reduce((s, c) => s + c, 0) / counts.length) : 0;
      return { html: recs.length ? YB.bars(recs.slice(-24).map((r) => ({ label: `${r.date.slice(5)} ${r.worship}`, value: (r.present || []).length, unit: "명" }))) : "", headers: ["날짜", "예배", "출석 인원"], rows: recs.map((r) => [r.date, r.worship, (r.present || []).length]), foot: ["평균", `${recs.length}회`, avg], summary: periodText(v) + chip(`평균 ${avg}명`) + chip(`최대 ${Math.max(0, ...counts)}명`), empty: "기간 안에 출결 기록이 없습니다." };
    },
  });

  const scan = { date: todayISO(), worship: "", log: [] };
  YB.page({
    id: "barcode", title: "QR/바코드 출결", group: "출결", icon: "🔳", desc: "교인번호 바코드를 스캔하거나 이름·전화번호 뒷자리를 입력해 출석을 기록합니다.",
    render(el) {
      fixWorship(scan);
      el.innerHTML = `<div class="yb-toolbar no-print"><label>날짜<input type="date" data-a="date" value="${scan.date}"></label><label>예배<select data-a="worship">${worshipOpts().map((w) => `<option ${scan.worship === w ? "selected" : ""}>${h(w)}</option>`).join("")}</select></label></div><article class="panel"><div class="panel-head"><div><p class="eyebrow">CHECK-IN</p><h3>스캔 · 입력 출결</h3></div><div class="yb-summary"></div></div><input class="yb-scan" placeholder="바코드 스캔 또는 교인번호 · 이름 · 전화번호 뒷 4자리 입력 후 Enter" autocomplete="off"><p class="muted yb-note">USB 바코드·QR 스캐너는 키보드처럼 동작하므로 이 칸에 커서를 두고 스캔하면 됩니다. 교인번호는 교인 등록 화면에서 입력합니다. (카메라 스캔은 지원하지 않습니다)</p><div class="yb-scan-log"></div></article>`;
      const inp = el.querySelector(".yb-scan");
      el.querySelectorAll("[data-a]").forEach((i) => i.addEventListener("input", () => { scan[i.dataset.a] = i.value; this.refresh(); }));
      inp.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return; const v = inp.value.trim(); if (!v) return; const digits = v.replace(/\D/g, ""), act = YB.active();
        let hits = act.filter((m) => m.memberNo && m.memberNo === v); if (!hits.length) hits = act.filter((m) => m.id === v);
        if (!hits.length && digits.length >= 4) hits = act.filter((m) => { const p = String(m.phone || "").replace(/\D/g, ""); return p && (p === digits || (digits.length === 4 && p.endsWith(digits))); });
        if (!hits.length) { const m = YB.findMember(v); hits = m && YB.isActive(m) ? [m] : act.filter((x) => x.name === v); }
        const time = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
        if (hits.length === 1) { const m = hits[0], dup = presentSet(scan.date, scan.worship).has(m.id); setPresent(scan.date, scan.worship, [m.id], true); scan.log.unshift({ ok: true, text: `${time}  ${m.name}${m.group ? ` · ${m.group}` : ""}${dup ? " (이미 출석)" : " 출석"}` }); quietSave(); }
        else { scan.log.unshift({ ok: false, text: `${time}  '${v}' — ${hits.length ? `${hits.length}명이 일치합니다. 교인번호나 ‘이름 · 소속’으로 입력해 주세요` : "일치하는 교인이 없습니다"}` }); this.refresh(); }
        scan.log = scan.log.slice(0, 30); inp.value = ""; inp.focus();
      });
      setTimeout(() => inp.focus(), 50);
    },
    refresh() { const el = $("barcodeView"); if (!el?.querySelector(".yb-scan-log")) return; el.querySelector(".yb-summary").innerHTML = chip(`${scan.date} ${scan.worship}`) + chip(`출석 ${presentSet(scan.date, scan.worship).size}명`); el.querySelector(".yb-scan-log").innerHTML = scan.log.map((l) => `<div class="${l.ok ? "ok" : "bad"}">${h(l.text)}</div>`).join(""); },
  });

  YB.report({
    id: "donationAttendance", title: "헌금 출결", group: "출결", icon: "💒", desc: "그날 헌금을 드린 교인을 한 번에 출석으로 처리합니다.", noExport: true,
    controls: [{ key: "date", label: "날짜", type: "date", default: () => YB.lastSunday() }, { key: "worship", label: "예배", type: "select", options: worshipOpts, default: () => worshipOpts()[0] || "" }],
    compute(v) {
      const ids = [...new Set(state.donations.filter((x) => x.date === v.date && x.memberId && !x.anonymous).map((x) => x.memberId))], on = presentSet(v.date, v.worship), todo = ids.filter((id) => !on.has(id));
      return { html: ids.length ? `<div class="yb-toolbar no-print"><button class="primary small" data-action="apply">미출석 헌금자 ${todo.length}명 출석 처리</button></div>` : "", headers: ["이름", "소속", "헌금 건수", "출석 여부"], rows: ids.map(YB.member).filter(Boolean).map((m) => [m.name, m.group || "", state.donations.filter((x) => x.date === v.date && x.memberId === m.id).length, on.has(m.id) ? "출석" : "미처리"]), summary: chip(`${v.date} 기명 헌금자 ${ids.length}명`), empty: "이 날짜에 기명 헌금 기록이 없습니다." };
    },
    onAction(action, id, v) { const ids = [...new Set(state.donations.filter((x) => x.date === v.date && x.memberId && !x.anonymous).map((x) => x.memberId))]; if (!ids.length || !v.worship) return; setPresent(v.date, v.worship, ids, true); saveState(`헌금자 ${ids.length}명을 출석 처리했습니다`); },
  });
  const headTotal = (r) => ["adult", "youth", "children", "newcomers"].reduce((s, k) => s + Number(r[k] || 0), 0);
  YB.crud({
    id: "headcounts", title: "출석현황입력", group: "출결", icon: "🔢", desc: "예배 구분별 출석 인원(숫자)만 간단히 입력하는 페이지입니다.", collection: "headcounts", prefix: "hc",
    fields: [
      { key: "date", label: "날짜", type: "date", required: true, default: () => YB.lastSunday() },
      { key: "worship", label: "예배", type: "select", options: worshipOpts, required: true },
      { key: "adult", label: "장년", type: "number" }, { key: "youth", label: "청년·학생", type: "number" },
      { key: "children", label: "어린이", type: "number" }, { key: "newcomers", label: "새가족·방문", type: "number" },
      { key: "memo", label: "메모", full: true },
    ],
    columns: [{ label: "날짜", get: (r) => r.date }, { label: "예배", get: (r) => r.worship }, { label: "장년", get: (r) => Number(r.adult || 0) }, { label: "청년·학생", get: (r) => Number(r.youth || 0) }, { label: "어린이", get: (r) => Number(r.children || 0) }, { label: "새가족·방문", get: (r) => Number(r.newcomers || 0) }, { label: "합계", get: headTotal }, { label: "메모", get: (r) => r.memo || "" }],
    formNote: (v) => `<div class="yb-note-box">합계 <b>${num(headTotal(v))}명</b></div>`,
  });

  /* ===== 보고서 ===== */
  const reportPage = (id, kind, unit, icon, desc) => YB.crud({
    id, title: kind, group: "보고서", icon, desc, collection: "ministryReports", kind, prefix: "mrp",
    fields: [
      { key: "date", label: "보고일", type: "date", required: true, default: () => todayISO() },
      { key: "unit", label: unit, required: true }, { key: "writer", label: "작성자" },
      { key: "attendance", label: "출석 인원", type: "number" }, { key: "offering", label: "헌금", type: "number" },
      { key: "content", label: "보고 내용", type: "textarea", rows: 5, list: true },
      { key: "prayer", label: "기도제목 · 특이사항", type: "textarea" },
    ],
    summary: (rows) => chip(`${rows.length}건`) + chip(`출석 합계 ${num(YB.sum(rows, "attendance"))}명`) + chip(`헌금 합계 ${fmt(YB.sum(rows, "offering"))}`),
  });
  reportPage("ministryReport", "사역보고서", "사역 · 부서명", "📝", "사역보고서를 등록하고 조회·관리하는 페이지입니다.");
  reportPage("cellReport", "셀보고서", "셀 이름", "📝", "셀보고서를 작성하고 조회하는 페이지입니다.");
  reportPage("schoolReport", "교회학교 보고서", "교회학교", "📝", "교회학교 보고서를 등록하고 관리하는 페이지입니다.");
  reportPage("deptReport", "교회학교 부서별 보고서", "부서명", "📝", "교회학교 부서별 보고서를 등록하고 관리하는 페이지입니다.");
  YB.report({
    id: "weeklyReports", title: "주간사역보고 조회", group: "보고서", icon: "🗂", desc: "사역·셀·교회학교 보고서를 주간 단위로 모아 조회합니다.",
    controls: [{ key: "date", label: "기준 날짜(해당 주)", type: "date", default: () => todayISO() }, { key: "kind", label: "구분", type: "select", options: [["", "전체"], "사역보고서", "셀보고서", "교회학교 보고서", "교회학교 부서별 보고서"] }],
    compute(v) { if (!v.date) return {}; const from = YB.sundayOf(v.date), to = YB.addDays(from, 6), rows = state.ministryReports.filter((r) => YB.inRange(r.date, from, to) && (!v.kind || r.kind === v.kind)).sort((a, b) => a.kind.localeCompare(b.kind, "ko") || a.date.localeCompare(b.date)); return { headers: ["구분", "보고일", "부서 · 셀", "작성자", "출석", "헌금", "보고 내용", "기도제목 · 특이사항"], rows: rows.map((r) => [r.kind, r.date, r.unit || "", r.writer || "", Number(r.attendance || 0), Number(r.offering || 0), r.content || "", r.prayer || ""]), foot: ["합계", "", `${rows.length}건`, "", YB.sum(rows, "attendance"), YB.sum(rows, "offering"), "", ""], summary: chip(`${from} ~ ${to}`), empty: "이 주에 등록된 보고서가 없습니다." }; },
  });

  /* ===== 심방 · 돌봄 ===== */
  YB.crud({
    id: "visits", title: "심방", group: "심방·돌봄", icon: "🏠", desc: "심방을 등록하고 검색·조회·관리하는 페이지입니다.", collection: "visits", prefix: "vst",
    fields: [
      { key: "date", label: "심방일", type: "date", required: true, default: () => todayISO() },
      { key: "memberId", label: "심방 대상", type: "member", required: true },
      { key: "type", label: "심방 종류", type: "select", options: () => state.config.visitTypes, required: true },
      { key: "visitor", label: "심방자" }, { key: "scripture", label: "말씀 · 찬송", full: true, list: false },
      { key: "content", label: "심방 내용", type: "textarea", rows: 4, list: true }, { key: "prayer", label: "기도제목", type: "textarea" },
    ],
  });
  YB.report({
    id: "unvisited", title: "미심방 세대 검색", group: "심방·돌봄", icon: "📞", desc: "기간 안에 심방하지 않은 교인(세대)을 검색하는 페이지입니다.",
    controls: [{ type: "range", default: "year" }, { key: "net", label: "소속", type: "select", options: YB.netOptions }],
    compute(v) {
      const visited = new Set(state.visits.filter((x) => YB.inRange(x.date, v.from, v.to)).map((x) => x.memberId)), families = new Set([...visited].map((id) => YB.member(id)?.family).filter(Boolean));
      const rows = roster(v.net).filter((m) => !visited.has(m.id) && !(m.family && families.has(m.family)));
      return { headers: ["이름", "세대", "소속", "연락처", "최근 심방일"], rows: rows.map((m) => [m.name, m.family || "", m.group || "", m.phone || "", state.visits.filter((x) => x.memberId === m.id).map((x) => x.date).sort().pop() || "기록 없음"]), summary: periodText(v) + chip(`미심방 ${rows.length}명`), empty: "기간 안에 모든 교인을 심방했습니다." };
    },
    note: "교인 등록에 ‘세대(가족)’가 입력되어 있으면 같은 세대 중 한 명이라도 심방한 경우 심방한 세대로 봅니다.",
  });
  YB.crud({
    id: "prayers", title: "기도 제목", group: "심방·돌봄", icon: "🙏", desc: "기도 제목을 관리하는 페이지입니다.", collection: "prayers", prefix: "pry",
    fields: [
      { key: "date", label: "등록일", type: "date", required: true, default: () => todayISO() },
      { key: "memberId", label: "교인 (선택)", type: "member" },
      { key: "title", label: "기도 제목", required: true, full: true },
      { key: "content", label: "내용", type: "textarea", rows: 4 },
      { key: "answered", label: "응답됨", type: "checkbox" },
    ],
    summary: (rows) => chip(`${rows.length}건`) + chip(`응답 ${rows.filter((r) => r.answered).length}건`),
  });

  /* ===== 교육 · 봉사 ===== */
  YB.crud({
    id: "education", title: "교육", group: "교육·봉사", icon: "🎓", desc: "교육 이수 정보를 등록하고 교육을 이수한 교인을 관리합니다.", collection: "education", prefix: "edu",
    fields: [
      { key: "memberId", label: "교인", type: "member", required: true }, { key: "course", label: "교육 과정", required: true, placeholder: "예: 새가족반" },
      { key: "start", label: "시작일", type: "date", default: () => todayISO() }, { key: "end", label: "수료일", type: "date" },
      { key: "completed", label: "수료 완료", type: "checkbox" }, { key: "memo", label: "메모", full: true },
    ],
    summary: (rows) => chip(`${rows.length}건`) + chip(`수료 ${rows.filter((r) => r.completed).length}건`),
  });
  YB.crud({
    id: "service", title: "봉사자", group: "교육·봉사", icon: "🤝", desc: "봉사자를 등록하고 봉사 활동 내용을 조회합니다.", collection: "service", prefix: "svc",
    fields: [
      { key: "memberId", label: "봉사자", type: "member", required: true }, { key: "dept", label: "봉사 부서", required: true, placeholder: "예: 찬양팀" },
      { key: "role", label: "역할" }, { key: "start", label: "시작일", type: "date", default: () => todayISO() }, { key: "end", label: "종료일", type: "date" },
      { key: "memo", label: "메모", full: true },
    ],
    summary: (rows) => chip(`${rows.length}건`) + chip(`현재 봉사 ${rows.filter((r) => !r.end || r.end >= todayISO()).length}건`),
  });

  /* ===== 교적 통계 ===== */
  const countBy = (list, fn) => { const map = new Map(); list.forEach((x) => { const k = fn(x) || "미입력"; map.set(k, (map.get(k) || 0) + 1); }); return [...map.entries()].map(([label, value]) => ({ label, value, unit: "명" })); };
  const band = (a) => (a == null ? "미입력" : a < 8 ? "미취학" : a < 14 ? "어린이" : a < 20 ? "청소년" : a >= 80 ? "80대 이상" : `${Math.floor(a / 10) * 10}대`);
  const BANDS = ["미취학", "어린이", "청소년", "20대", "30대", "40대", "50대", "60대", "70대", "80대 이상", "미입력"];
  const sec = (t, body) => `<div class="yb-stat"><h4>${t}</h4>${body}</div>`;
  YB.report({
    id: "memberStats", title: "전체 통계", group: "교적 통계", icon: "📊", desc: "교인·새신자의 전체 통계를 조회하는 페이지입니다.", noExport: true, controls: [],
    compute() {
      const all = state.members, act = YB.active(), order = (items, keys) => keys.map((k) => items.find((x) => x.label === k)).filter(Boolean);
      return { html: YB.cards([{ label: "등록 교인 전체", value: `${all.length}명` }, { label: "활동 교인", value: `${act.length}명`, sub: "이명·제적·별세 제외" }, { label: "새가족", value: `${all.filter((m) => m.status === "새가족").length}명` }, { label: "세대 수", value: `${new Set(act.map((m) => m.family).filter(Boolean)).size}세대`, sub: "세대 입력 기준" }, { label: "올해 등록", value: `${all.filter((m) => String(m.registeredAt || "").startsWith(String(new Date().getFullYear()))).length}명` }]) +
        `<div class="yb-stat-grid">${sec("상태별", YB.bars(countBy(all, (m) => m.status)))}${sec("성별", YB.bars(countBy(act, (m) => m.gender)))}${sec("연령대별", YB.bars(order(countBy(act, (m) => band(YB.age(m.birth))), BANDS)))}${sec("직분별", YB.bars(order(countBy(act, (m) => m.position), [...state.config.positions, "미입력"])))}</div>` + sec("소속(네트)별", YB.bars(countBy(act, YB.netOf).sort((a, b) => b.value - a.value))) };
    },
  });
  YB.report({
    id: "worshipStats", title: "예배 통계", group: "교적 통계", icon: "⛪", desc: "예배별 월평균 출석 인원 통계를 조회하는 페이지입니다.",
    controls: [{ key: "year", label: "연도", type: "number", default: () => selectedYear }],
    compute(v) {
      const y = String(v.year), counts = (w, m) => { const mm = `${y}-${String(m).padStart(2, "0")}`, byDate = new Map(); state.headcounts.filter((r) => r.worship === w && r.date.startsWith(mm)).forEach((r) => byDate.set(r.date, headTotal(r))); state.attendance.filter((r) => r.worship === w && r.date.startsWith(mm)).forEach((r) => byDate.set(r.date, Math.max(byDate.get(r.date) || 0, (r.present || []).length))); return [...byDate.values()]; };
      const avg = (a) => (a.length ? Math.round(a.reduce((s, c) => s + c, 0) / a.length) : 0), months = Array.from({ length: 12 }, (_, i) => i + 1);
      return { headers: ["예배", ...months.map((m) => `${m}월`), "연평균"].map((l, i) => ({ label: l, right: i > 0 })), rows: worshipOpts().map((w) => [w, ...months.map((m) => avg(counts(w, m))), avg(months.flatMap((m) => counts(w, m)))]), summary: chip(`${y}년 월평균 출석 인원`) };
    },
    note: "출결 관리의 출석 인원과 출석현황입력의 숫자 중 큰 값을 그날의 출석 인원으로 봅니다.",
  });
  YB.report({
    id: "memberMonthly", title: "연간 월별 교인수 통계", group: "교적 통계", icon: "📉", desc: "월별 신규 등록과 교인수 통계를 조회하는 페이지입니다.",
    controls: [{ key: "year", label: "연도", type: "number", default: () => selectedYear }],
    compute(v) {
      const y = String(v.year), act = YB.active(), rows = Array.from({ length: 12 }, (_, i) => { const mm = `${y}-${String(i + 1).padStart(2, "0")}`, end = `${mm}-31`; return [`${i + 1}월`, state.members.filter((m) => String(m.registeredAt || "").startsWith(mm)).length, act.filter((m) => !m.registeredAt || m.registeredAt <= end).length]; });
      return { headers: ["월", "신규 등록", "월말 교인수"], rows, foot: ["합계", rows.reduce((s, r) => s + r[1], 0), ""], summary: chip(`${y}년`) };
    },
    note: "월말 교인수는 현재 활동 교인 중 등록일이 그 달 이전인 인원입니다. 등록일이 없는 교인은 처음부터 있던 것으로 계산하며, 과거의 이명·제적 시점은 반영되지 않습니다.",
  });
  YB.report({
    id: "newcomerStats", title: "새신자 통계", group: "교적 통계", icon: "🌱", desc: "기간 안에 등록한 새신자 통계를 조회하는 페이지입니다.",
    controls: [{ type: "range", default: "year" }],
    compute(v) {
      const rows = state.members.filter((m) => (m.registeredAt ? YB.inRange(m.registeredAt, v.from, v.to) : m.status === "새가족")).sort((a, b) => String(b.registeredAt || "").localeCompare(String(a.registeredAt || "")));
      const months = countBy(rows.filter((m) => m.registeredAt), (m) => m.registeredAt.slice(0, 7)).sort((a, b) => a.label.localeCompare(b.label));
      return { html: months.length ? YB.bars(months) : "", headers: ["이름", "등록일", "상태", "소속", "연락처", "나이"], rows: rows.map((m) => [m.name, m.registeredAt || "미입력", m.status || "", m.group || "", m.phone || "", YB.age(m.birth) ?? ""]), summary: periodText(v) + chip(`${rows.length}명`) + chip(`정착(재적) ${rows.filter((m) => m.status === "재적").length}명`), empty: "기간 안에 등록한 교인이 없습니다." };
    },
    note: "등록일이 기간 안에 있는 교인과, 등록일 없이 상태가 ‘새가족’인 교인을 표시합니다.",
  });
  YB.report({
    id: "adultStats", title: "장년 통계", group: "교적 통계", icon: "🧑", desc: "만 20세 이상 장년 교인의 연령대·성별 통계를 조회합니다.", controls: [],
    compute() {
      const adults = YB.active().filter((m) => { const a = YB.age(m.birth); return a == null || a >= 20; }), bands = BANDS.slice(3), cnt = (b, g) => adults.filter((m) => band(YB.age(m.birth)) === b && (g === "" ? !m.gender : g === "*" ? true : m.gender === g)).length;
      return { headers: ["연령대", "남", "여", "성별 미입력", "합계"], rows: bands.map((b) => [b === "미입력" ? "생년월일 미입력" : b, cnt(b, "남"), cnt(b, "여"), cnt(b, ""), cnt(b, "*")]), foot: ["합계", adults.filter((m) => m.gender === "남").length, adults.filter((m) => m.gender === "여").length, adults.filter((m) => !m.gender).length, adults.length], summary: chip(`장년 ${adults.length}명`) };
    },
  });
  YB.report({
    id: "visitTypeStats", title: "심방 종류 통계", group: "교적 통계", icon: "🧭", desc: "심방 종류별 통계를 조회하는 페이지입니다.",
    controls: [{ type: "range", default: "year" }],
    compute(v) { const list = state.visits.filter((x) => YB.inRange(x.date, v.from, v.to)), items = countBy(list, (x) => x.type).sort((a, b) => b.value - a.value); return { html: items.length ? YB.bars(items.map((x) => ({ ...x, unit: "건" }))) : "", headers: ["심방 종류", "건수", { label: "비율", right: true }], rows: items.map((x) => [x.label, x.value, `${((x.value / list.length) * 100).toFixed(1)}%`]), foot: ["합계", list.length, ""], summary: periodText(v), empty: "기간 안에 심방 기록이 없습니다." }; },
  });
  YB.report({
    id: "visitMonthly", title: "월별 심방 통계", group: "교적 통계", icon: "🗒", desc: "월별 심방 통계를 조회하는 페이지입니다.",
    controls: [{ key: "year", label: "연도", type: "number", default: () => selectedYear }],
    compute(v) { const list = state.visits.filter((x) => String(x.date).startsWith(String(v.year))), types = [...new Set([...state.config.visitTypes, ...list.map((x) => x.type || "미입력")])].filter((t) => list.some((x) => (x.type || "미입력") === t)), mon = (x) => Number(x.date.slice(5, 7)); return { headers: ["월", ...types, "합계"].map((l, i) => ({ label: l, right: i > 0 })), rows: Array.from({ length: 12 }, (_, i) => [`${i + 1}월`, ...types.map((t) => list.filter((x) => mon(x) === i + 1 && (x.type || "미입력") === t).length), list.filter((x) => mon(x) === i + 1).length]), foot: ["합계", ...types.map((t) => list.filter((x) => (x.type || "미입력") === t).length), list.length], summary: chip(`${v.year}년 심방 ${list.length}건`) }; },
  });

  /* ===== 게시판 · 일정 ===== */
  const board = (id, kind, icon, desc) => YB.crud({
    id, title: kind, group: "게시판·일정", icon, desc, collection: "posts", kind, prefix: "pst",
    fields: [
      { key: "date", label: "작성일", type: "date", required: true, default: () => todayISO() }, { key: "writer", label: "작성자" },
      { key: "title", label: "제목", required: true, full: true }, { key: "content", label: "내용", type: "textarea", rows: 8, list: true },
      { key: "pinned", label: "상단 고정", type: "checkbox" },
    ],
    sort: (a, b) => !!b.pinned - !!a.pinned || String(b.date).localeCompare(String(a.date)),
  });
  board("notices", "공지사항", "📣", "공지사항 내용을 관리하는 페이지입니다.");
  board("freeBoard", "자유게시판", "💬", "자유게시판 페이지입니다.");

  const calMonth = { events: YB.thisMonth(), schedule: YB.thisMonth() };
  const calendar = (id, kind, icon, desc, withMember) => YB.crud({
    id, title: kind, group: "게시판·일정", icon, desc, collection: "events", kind, prefix: "evt",
    fields: [
      { key: "date", label: "시작일", type: "date", required: true, default: () => todayISO() }, { key: "endDate", label: "종료일", type: "date" },
      { key: "title", label: "제목", required: true, full: true },
      ...(withMember ? [{ key: "category", label: "구분", type: "select", options: ["결혼", "장례", "출산", "돌", "개업", "입원", "행사", "기타"] }, { key: "memberId", label: "관련 교인 (선택)", type: "member" }] : []),
      { key: "place", label: "장소" }, { key: "time", label: "시간", placeholder: "예: 오전 11시" },
      { key: "content", label: "내용", type: "textarea" },
    ],
    validate: (r) => (r.endDate && r.endDate < r.date ? "종료일이 시작일보다 빠릅니다" : ""),
    renderExtra(box, all) {
      if (!box.dataset.ready) {
        box.dataset.ready = "1"; box.innerHTML = '<div class="yb-toolbar no-print"><button class="ghost small" data-cal="-1">◀ 이전 달</button><strong class="yb-cal-title"></strong><button class="ghost small" data-cal="1">다음 달 ▶</button><button class="ghost small" data-cal="0">이번 달</button></div><div class="yb-cal"></div>';
        box.addEventListener("click", (e) => { const b = e.target.closest("[data-cal]"); if (!b) return; const step = Number(b.dataset.cal), d = YB.parse(`${calMonth[id]}-01`); calMonth[id] = step ? YB.iso(new Date(d.getFullYear(), d.getMonth() + step, 1)).slice(0, 7) : YB.thisMonth(); YB.refresh(); });
      }
      const month = calMonth[id], days = YB.monthDays(month), items = {};
      all.forEach((r) => days.forEach((d) => { if (d >= r.date && d <= (r.endDate || r.date)) (items[d] = items[d] || []).push({ text: r.title }); }));
      if (!withMember) YB.active().forEach((m) => { if (m.birth && !m.lunar && m.birth.slice(5, 7) === month.slice(5)) { const d = `${month}-${m.birth.slice(8)}`; (items[d] = items[d] || []).push({ text: `🎂 ${m.name}`, cls: "birth" }); } });
      box.querySelector(".yb-cal-title").textContent = `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`;
      box.querySelector(".yb-cal").innerHTML = YB.calendarHtml(month, items);
    },
  });
  calendar("events", "경조/행사", "🎗", "경조사와 행사를 달력 형태로 조회하고 관리하는 페이지입니다.", true);
  calendar("schedule", "교회일정", "📆", "교회 일정을 달력 형태로 조회하고 관리합니다. 교인 생일도 함께 표시됩니다.", false);
  YB.crud({
    id: "memos", title: "My Memo/Diary", group: "게시판·일정", icon: "📓", desc: "메모와 일기를 기록하고 조회하는 페이지입니다.", collection: "memos", prefix: "mmo",
    fields: [
      { key: "date", label: "날짜", type: "date", required: true, default: () => todayISO() }, { key: "title", label: "제목", required: true },
      { key: "content", label: "내용", type: "textarea", rows: 10, list: true },
    ],
    note: "메모는 같은 교회 자료에 로그인한 담당자 모두에게 보입니다.",
  });

  YB.init();
})();
