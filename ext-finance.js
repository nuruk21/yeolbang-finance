/* 열방교회 확장 모듈 2/3 — 재정 기능 */
(function () {
  "use strict";
  const { h } = YB;
  const METHODS = ["현금", "계좌이체", "카드", "기타"];
  const donor = (x) => (x.anonymous || !x.memberId ? "무기명" : memberName(x.memberId));
  const fundOpts = () => [["", "전체 회계"], ...state.funds.map((f) => [f, f])];
  const incOpts = () => [["", "전체 항목"], ...state.incomeCategories.map((c) => [c, c])];
  const inR = (v) => (x) => YB.inRange(x.date, v.from, v.to);
  const periodText = (v) => `<span class="chip">${h(v.from || "처음")} ~ ${h(v.to || "현재")}</span>`;
  const chip = (t) => `<span class="chip">${h(t)}</span>`;
  const month = (x) => Number(String(x.date).slice(5, 7));

  /* ===== 재정 기록 ===== */
  let recurringMonth = YB.thisMonth();
  function applyRecurring() {
    const m = recurringMonth; if (!/^\d{4}-\d{2}$/.test(m)) return toast("반영할 달을 선택해 주세요");
    const days = YB.monthDays(m).length;
    const todo = state.recurring.filter((t) => t.active && !state.expenses.some((e) => e.recurringId === t.id && e.date.startsWith(m)));
    if (!todo.length) return toast("이 달에는 새로 반영할 반복지출이 없습니다");
    if (!confirm(`${m} 지출로 ${todo.length}건, 합계 ${fmt(YB.sum(todo))}을 등록할까요?`)) return;
    todo.forEach((t) => state.expenses.push({ id: uid("exp"), date: `${m}-${String(Math.min(Math.max(1, Number(t.day) || 1), days)).padStart(2, "0")}`, category: t.category, detail: t.name, fund: t.fund, payee: t.payee || "", amount: Number(t.amount), method: t.method || "계좌이체", memo: "반복지출", recurringId: t.id, updatedAt: Date.now() }));
    saveState(`반복지출 ${todo.length}건을 지출로 등록했습니다`);
  }
  YB.crud({
    id: "recurring", title: "반복지출", group: "재정 기록", icon: "↻", desc: "매월 반복되는 지출을 등록해 두고 한 번에 지출로 반영합니다.", collection: "recurring", prefix: "rcr",
    fields: [
      { key: "name", label: "세부 내역", required: true, placeholder: "예: 전기요금" },
      { key: "category", label: "지출 항목", type: "select", options: () => state.expenseCategories, required: true },
      { key: "fund", label: "회계 구분", type: "select", options: () => state.funds, required: true, default: "일반회계" },
      { key: "payee", label: "지급처" },
      { key: "amount", label: "금액", type: "number", required: true },
      { key: "method", label: "지급 방법", type: "select", options: METHODS, noBlank: true, default: "계좌이체" },
      { key: "day", label: "매월 지급일", type: "number", default: 1, min: 1 },
      { key: "active", label: "사용 중 (일괄 반영 대상)", type: "checkbox", default: true },
      { key: "memo", label: "메모", full: true, list: false },
    ],
    sort: (a, b) => Number(a.day || 0) - Number(b.day || 0),
    summary: (rows) => chip(`${rows.length}건`) + chip(`월 합계 ${fmt(YB.sum(rows.filter((r) => r.active)))}`),
    renderExtra(box) {
      if (!box.dataset.ready) {
        box.dataset.ready = "1";
        box.innerHTML = `<div class="yb-toolbar no-print"><label>반영할 달<input type="month" value="${recurringMonth}"></label><button class="primary small" type="button">이 달 지출로 일괄 반영</button><span class="muted yb-status"></span></div>`;
        box.querySelector("input").addEventListener("input", (e) => { recurringMonth = e.target.value; YB.refresh(); });
        box.querySelector("button").addEventListener("click", applyRecurring);
      }
      const done = state.recurring.filter((t) => state.expenses.some((e) => e.recurringId === t.id && e.date.startsWith(recurringMonth))).length;
      box.querySelector(".yb-status").textContent = `${recurringMonth} 반영 완료 ${done}건 / 사용 중 ${state.recurring.filter((t) => t.active).length}건`;
    },
  });

  const DENOMS = [50000, 10000, 5000, 1000, 500, 100, 50, 10];
  const countTotal = (r) => DENOMS.reduce((s, d) => s + d * Number(r[`n${d}`] || 0), 0) + Number(r.check || 0);
  const cashRecorded = (r) => YB.sum(state.donations.filter((x) => x.date === r.date && x.method === "현금" && (!r.part || x.part === r.part)));
  YB.crud({
    id: "cashCounts", title: "권종구분 헌금기록", group: "재정 기록", icon: "💰", desc: "헌금 계수 시 권종별 수량을 기록하고 현금 헌금 기록과 대조합니다.", collection: "cashCounts", prefix: "cc",
    fields: [
      { key: "date", label: "계수일", type: "date", required: true, default: () => todayISO() },
      { key: "part", label: "예배 구분", type: "select", options: () => state.config.parts },
      ...DENOMS.map((d) => ({ key: `n${d}`, label: `${num(d)}원 ${d >= 1000 ? "매수" : "개수"}`, type: "number", list: false })),
      { key: "check", label: "수표·기타 금액", type: "number", list: false },
      { key: "memo", label: "메모", list: false },
    ],
    columns: [
      { label: "계수일", get: (r) => r.date }, { label: "예배", get: (r) => r.part || "전체" },
      { label: "계수 합계", get: (r) => countTotal(r) }, { label: "현금 헌금 기록", get: (r) => cashRecorded(r) },
      { label: "차액", get: (r) => countTotal(r) - cashRecorded(r) }, { label: "메모", get: (r) => r.memo || "" },
    ],
    formNote: (v) => { if (!v.date) return ""; const t = countTotal(v), rec = cashRecorded(v), diff = t - rec; return `<div class="yb-note-box">계수 합계 <b>${fmt(t)}</b> · 기록된 현금 헌금 ${fmt(rec)} · 차액 <b class="${diff ? "delta-down" : "delta-up"}">${fmt(diff)}</b></div>`; },
    note: "같은 날짜(및 예배 구분)의 납부 방법이 ‘현금’인 헌금 기록 합계와 비교합니다.",
  });

  YB.crud({
    id: "transfers", title: "회계 간 이체", group: "재정 기록", icon: "⇄", desc: "회계(계좌) 사이의 이체 내용을 검색하고 기록하는 페이지입니다.", collection: "transfers", prefix: "trf",
    fields: [
      { key: "date", label: "이체일", type: "date", required: true, default: () => todayISO() },
      { key: "amount", label: "금액", type: "number", required: true },
      { key: "fromFund", label: "출금 회계", type: "select", options: () => state.funds, required: true },
      { key: "toFund", label: "입금 회계", type: "select", options: () => state.funds, required: true },
      { key: "memo", label: "메모", full: true },
    ],
    validate: (r) => (r.fromFund === r.toFund ? "출금 회계와 입금 회계가 같습니다" : !(r.amount > 0) ? "금액을 입력해 주세요" : ""),
    summary: (rows) => chip(`${rows.length}건`) + chip(`합계 ${fmt(YB.sum(rows))}`),
    note: "이체는 총수입·총지출에는 포함되지 않고, 대시보드와 회계 보고의 회계별 잔액에만 반영됩니다.",
  });

  function printWithdrawal(r) {
    const row = (a, b) => `<tr><th>${h(a)}</th><td>${h(b)}</td></tr>`;
    YB.printHtml(`<div class="receipt-document yb-doc"><div class="receipt-top"><span>${h(state.church.name)}</span><h2>출 금 의 뢰 서</h2><span></span></div><table class="receipt-table yb-approval"><tr><th>담당</th><th>재정부장</th><th>담임목사</th></tr><tr><td></td><td></td><td></td></tr></table><table class="receipt-table">${row("의뢰일", r.date)}${row("청구 부서", r.dept || "")}${row("청구자", r.requester || "")}${row("지출 항목", r.category || "")}${row("세부 내역", r.detail || "")}${row("금액", fmt(r.amount))}${row("회계 구분", r.fund || "")}${row("지급처", r.payee || "")}${row("입금 계좌", r.account || "")}${row("비고", r.memo || "")}</table><p class="receipt-declaration">위와 같이 출금을 의뢰합니다.</p><p class="receipt-date">${h(r.date)}</p></div>`);
  }
  YB.crud({
    id: "withdrawals", title: "출금의뢰서", group: "재정 기록", icon: "📝", desc: "출금의뢰서를 등록·검색하고, 인쇄하거나 지출로 등록합니다.", collection: "withdrawals", prefix: "wdr",
    fields: [
      { key: "date", label: "의뢰일", type: "date", required: true, default: () => todayISO() },
      { key: "status", label: "상태", type: "select", options: ["요청", "승인", "지급완료", "반려"], noBlank: true, default: "요청" },
      { key: "dept", label: "청구 부서" }, { key: "requester", label: "청구자" },
      { key: "category", label: "지출 항목", type: "select", options: () => state.expenseCategories, required: true },
      { key: "fund", label: "회계 구분", type: "select", options: () => state.funds, required: true, default: "일반회계" },
      { key: "detail", label: "세부 내역", required: true, full: true },
      { key: "amount", label: "금액", type: "number", required: true },
      { key: "payee", label: "지급처" },
      { key: "account", label: "입금 계좌", full: true, list: false, placeholder: "은행 · 계좌번호 · 예금주" },
      { key: "memo", label: "비고", full: true, list: false },
    ],
    summary: (rows) => chip(`${rows.length}건`) + chip(`미지급 ${fmt(YB.sum(rows.filter((r) => ["요청", "승인"].includes(r.status))))}`),
    actions: [
      { key: "print", label: "인쇄", run: printWithdrawal },
      { key: "pay", label: "지출 등록", run: (r) => {
        if (r.expenseId && state.expenses.some((e) => e.id === r.expenseId)) return toast("이미 지출로 등록된 의뢰서입니다");
        if (!confirm(`${r.detail} ${fmt(r.amount)}을(를) 오늘 날짜 지출로 등록할까요?`)) return;
        const id = uid("exp"); state.expenses.push({ id, date: todayISO(), category: r.category, detail: r.detail, fund: r.fund, payee: r.payee || "", amount: Number(r.amount), method: "계좌이체", memo: `출금의뢰 ${r.date}${r.dept ? ` · ${r.dept}` : ""}`, updatedAt: Date.now() });
        Object.assign(r, { status: "지급완료", expenseId: id, updatedAt: Date.now() }); saveState("지출로 등록하고 지급완료 처리했습니다");
      } },
    ],
  });

  YB.crud({
    id: "special", title: "특별재정 관리", group: "재정 기록", icon: "★", desc: "교회학교 재정 등 본 회계와 분리된 특별재정을 관리합니다.", collection: "special", prefix: "spc",
    fields: [
      { key: "account", label: "재정 이름", required: true, placeholder: "예: 유년부 재정" },
      { key: "date", label: "날짜", type: "date", required: true, default: () => todayISO() },
      { key: "type", label: "구분", type: "select", options: ["수입", "지출"], noBlank: true, default: "수입" },
      { key: "amount", label: "금액", type: "number", required: true },
      { key: "detail", label: "내역", required: true, full: true },
      { key: "memo", label: "메모", full: true, list: false },
    ],
    summary: (rows) => { const names = [...new Set(rows.map((r) => r.account))]; return names.map((n) => { const rs = rows.filter((r) => r.account === n); return chip(`${n} 잔액 ${fmt(YB.sum(rs.filter((r) => r.type === "수입")) - YB.sum(rs.filter((r) => r.type === "지출")))}`); }).join("") || chip("0건"); },
    note: "특별재정은 교회 본 회계(대시보드·회계 보고)에 합산되지 않습니다. 검색창에 재정 이름을 입력하면 해당 재정만 볼 수 있습니다.",
  });

  YB.crud({
    id: "pledges", title: "작정 헌금 관리", group: "재정 기록", icon: "✊", desc: "작정 헌금을 한 교인과 금액, 납입 현황을 관리합니다.", collection: "pledges", prefix: "plg",
    fields: [
      { key: "memberId", label: "작정자", type: "member", required: true },
      { key: "title", label: "작정 이름", required: true, placeholder: "예: 2026 건축 작정" },
      { key: "category", label: "연결 헌금 항목", type: "select", options: () => state.incomeCategories, required: true },
      { key: "amount", label: "작정 금액", type: "number", required: true },
      { key: "from", label: "시작일", type: "date", required: true, default: () => `${selectedYear}-01-01` },
      { key: "to", label: "종료일", type: "date", required: true, default: () => `${selectedYear}-12-31` },
      { key: "memo", label: "메모", full: true, list: false },
    ],
    columns: (() => {
      const paid = (r) => YB.sum(state.donations.filter((x) => x.memberId === r.memberId && !x.anonymous && x.category === r.category && YB.inRange(x.date, r.from, r.to)));
      return [
        { label: "작정자", get: (r) => YB.name(r.memberId) }, { label: "작정 이름", get: (r) => r.title }, { label: "항목", get: (r) => r.category },
        { label: "기간", get: (r) => `${r.from} ~ ${r.to}` }, { label: "작정 금액", get: (r) => Number(r.amount) }, { label: "납입액", get: paid },
        { label: "잔여", get: (r) => Math.max(0, Number(r.amount) - paid(r)) }, { label: "진행률", get: (r) => `${r.amount ? Math.round((paid(r) / r.amount) * 100) : 0}%` },
      ];
    })(),
    note: "납입액은 해당 교인이 기간 안에 연결 헌금 항목으로 드린 헌금 기록을 자동 합산합니다.",
  });

  /* ===== 영수증 ===== */
  function printInKind(r) {
    const m = YB.member(r.memberId) || {}, c = state.church, number = `${r.date.slice(0, 4)}-M${String(state.inKind.indexOf(r) + 1).padStart(4, "0")}`;
    YB.logReceipt({ number, memberId: r.memberId, year: Number(r.date.slice(0, 4)), amount: Number(r.amount || 0), kind: "헌물" });
    YB.printHtml(`<div class="receipt-document yb-doc"><div class="receipt-top"><span>일련번호 <b>${h(number)}</b></span><h2>기 부 금 영 수 증</h2><span>(현물)</span></div><table class="receipt-table"><tr><th rowspan="2">기부자</th><th>성명</th><td>${h(m.name || "")}</td><th>주민등록번호<br>(사업자등록번호)</th><td>${h(m.taxId || "미입력")}</td></tr><tr><th>주소</th><td colspan="3">${h(m.address || "미입력")}</td></tr></table><h3>기부금 내역 (현물)</h3><table class="receipt-table"><thead><tr><th>기부일자</th><th>기부금 구분</th><th>품명</th><th>수량</th><th>평가액</th></tr></thead><tbody><tr><td>${h(r.date)}</td><td>${h(c.donationType)}</td><td>${h(r.item)}</td><td>${h(r.quantity || "")}</td><td class="right">${fmt(r.amount)}</td></tr></tbody></table><p class="receipt-declaration">위와 같이 기부금(현물)을 기부하였음을 증명합니다.</p><p class="receipt-date">${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일</p><div class="issuer"><p><b>기부금 단체명</b> ${h(c.name)}</p><p><b>고유번호 / 사업자등록번호</b> ${h(c.taxId || "미입력")}</p><p><b>소재지</b> ${h(c.address)}</p><p class="representative-line"><b>대표자</b> ${h(c.representative || "미입력")}<img class="official-seal" src="assets/yeolbang-church-seal.png" alt="직인"></p></div><div class="receipt-note">※ 현물 기부금의 평가액과 발급 요건은 제출 전 담당 세무 전문가에게 확인해 주세요.</div></div>`);
  }
  YB.crud({
    id: "inKind", title: "기부금영수증 발급(헌물)", group: "영수증", icon: "🎁", desc: "헌물(현물 기부) 내역을 기록하고 헌물 기부금영수증을 출력합니다.", collection: "inKind", prefix: "ink",
    fields: [
      { key: "date", label: "기부일", type: "date", required: true, default: () => todayISO() },
      { key: "memberId", label: "기부자", type: "member", required: true },
      { key: "item", label: "품명", required: true, full: true },
      { key: "quantity", label: "수량", placeholder: "예: 2대" },
      { key: "amount", label: "평가액", type: "number", required: true },
      { key: "memo", label: "메모", full: true, list: false },
    ],
    actions: [{ key: "receipt", label: "영수증", run: printInKind }],
    summary: (rows) => chip(`${rows.length}건`) + chip(`평가액 합계 ${fmt(YB.sum(rows))}`),
    note: "헌물은 헌금 수입에 합산되지 않습니다. ‘영수증’을 누르면 인쇄 화면이 열리고 발급대장에 기록됩니다.",
  });
  YB.crud({
    id: "receiptLog", title: "기부금영수증 발급대장", group: "영수증", icon: "📒", desc: "기부금영수증을 출력한 내역을 관리하는 페이지입니다.", collection: "receiptLog", prefix: "rcp",
    fields: [
      { key: "date", label: "발급일", type: "date", required: true, default: () => todayISO() },
      { key: "number", label: "일련번호", required: true },
      { key: "memberId", label: "기부자", type: "member", required: true },
      { key: "year", label: "귀속연도", type: "number", default: () => selectedYear },
      { key: "kind", label: "구분", type: "select", options: ["헌금", "헌물"], noBlank: true, default: "헌금" },
      { key: "amount", label: "금액", type: "number" },
      { key: "memo", label: "메모", full: true },
    ],
    summary: (rows) => chip(`${rows.length}건`) + chip(`합계 ${fmt(YB.sum(rows))}`),
    note: "기부금영수증 화면에서 ‘인쇄 / PDF 저장’을 누르면 자동으로 기록됩니다. 수기 발급분은 왼쪽에서 직접 등록할 수 있습니다.",
  });

  /* ===== 재정 검색 ===== */
  YB.report({
    id: "periodSearch", title: "기간 단위 검색", group: "재정 검색", icon: "🔎", desc: "특정 기간 동안의 수입과 지출의 내용을 검색하는 페이지입니다.",
    controls: [{ type: "range", default: "month" }, { key: "type", label: "구분", type: "select", options: [["", "전체"], "수입", "지출"] }, { key: "fund", label: "회계", type: "select", options: fundOpts }, { key: "q", label: "검색어", placeholder: "이름·항목·내역" }],
    compute(v) {
      const q = v.q.trim().toLowerCase(), okFund = (x) => !v.fund || x.fund === v.fund;
      const items = [
        ...(v.type === "지출" ? [] : state.donations.filter(inR(v)).filter(okFund).map((x) => ({ d: x.date, t: "수입", c: x.category, s: donor(x), f: x.fund, m: x.method, memo: x.memo || "", inc: Number(x.amount), exp: 0 }))),
        ...(v.type === "수입" ? [] : state.expenses.filter(inR(v)).filter(okFund).map((x) => ({ d: x.date, t: "지출", c: x.category, s: [x.detail, x.payee].filter(Boolean).join(" · "), f: x.fund, m: x.method, memo: x.memo || "", inc: 0, exp: Number(x.amount) }))),
      ].filter((x) => !q || `${x.c} ${x.s} ${x.memo}`.toLowerCase().includes(q)).sort((a, b) => a.d.localeCompare(b.d));
      const inc = YB.sum(items, "inc"), exp = YB.sum(items, "exp");
      return { headers: ["날짜", "구분", "항목", "헌금자 / 내역", "회계", "방법", "메모", "수입", "지출"], rows: items.map((x) => [x.d, x.t, x.c, x.s, x.f, x.m, x.memo, x.inc || "", x.exp || ""].map((c, i) => (i >= 7 && c === "" ? { html: "", text: "", right: true } : c))), foot: ["합계", "", "", "", "", "", `${items.length}건`, inc, exp], summary: periodText(v) + chip(`수입 ${fmt(inc)}`) + chip(`지출 ${fmt(exp)}`) + chip(`차액 ${fmt(inc - exp)}`) };
    },
  });

  YB.report({
    id: "journal", title: "과목 분개 검색", group: "재정 검색", icon: "📑", desc: "거래를 과목(항목)별로 묶어 발생한 순서대로 보여 주는 분개장입니다.",
    controls: [{ type: "range", default: "month" }, { key: "cat", label: "과목", type: "select", options: () => [["", "전체 과목"], ...state.incomeCategories.map((c) => [`i:${c}`, `[수입] ${c}`]), ...state.expenseCategories.map((c) => [`e:${c}`, `[지출] ${c}`])] }, { key: "fund", label: "회계", type: "select", options: fundOpts }],
    compute(v) {
      const ok = (x) => YB.inRange(x.date, v.from, v.to) && (!v.fund || x.fund === v.fund), rows = []; let tInc = 0, tExp = 0;
      const section = (kind, cats, items, text) => cats.forEach((c) => {
        if (v.cat && v.cat !== `${kind}:${c}`) return; const list = items.filter((x) => x.category === c && ok(x)).sort((a, b) => a.date.localeCompare(b.date)); if (!list.length) return;
        list.forEach((x) => rows.push([`${kind === "i" ? "[수입]" : "[지출]"} ${c}`, x.date, text(x), x.fund, kind === "i" ? Number(x.amount) : { html: "", text: "", right: true }, kind === "e" ? Number(x.amount) : { html: "", text: "", right: true }]));
        const s = YB.sum(list); kind === "i" ? (tInc += s) : (tExp += s);
        const sub = [`${c} 소계`, "", `${list.length}건`, "", kind === "i" ? s : { html: "", text: "", right: true }, kind === "e" ? s : { html: "", text: "", right: true }]; sub.cls = "yb-sub"; rows.push(sub);
      });
      section("i", state.incomeCategories, state.donations, (x) => [donor(x), x.memo].filter(Boolean).join(" · "));
      section("e", state.expenseCategories, state.expenses, (x) => [x.detail, x.payee, x.memo].filter(Boolean).join(" · "));
      return { headers: ["과목", "날짜", "적요", "회계", { label: "수입(대변)", right: true }, { label: "지출(차변)", right: true }], rows, foot: ["총계", "", "", "", tInc, tExp], summary: periodText(v) };
    },
  });

  function cashbook(v, fund) {
    const okF = (x) => !fund || x.fund === fund;
    const entries = [
      ...state.donations.filter(okF).map((x) => ({ d: x.date, o: 0, t: "수입", c: x.category, s: [donor(x), x.memo].filter(Boolean).join(" · "), inc: Number(x.amount), exp: 0 })),
      ...state.expenses.filter(okF).map((x) => ({ d: x.date, o: 2, t: "지출", c: x.category, s: [x.detail, x.payee].filter(Boolean).join(" · "), inc: 0, exp: Number(x.amount) })),
      ...(fund ? state.transfers.filter((x) => x.toFund === fund).map((x) => ({ d: x.date, o: 1, t: "이체입금", c: `${x.fromFund}에서`, s: x.memo || "", inc: Number(x.amount), exp: 0 })) : []),
      ...(fund ? state.transfers.filter((x) => x.fromFund === fund).map((x) => ({ d: x.date, o: 3, t: "이체출금", c: `${x.toFund}(으)로`, s: x.memo || "", inc: 0, exp: Number(x.amount) })) : []),
    ].sort((a, b) => a.d.localeCompare(b.d) || a.o - b.o);
    const before = v.from ? entries.filter((x) => x.d < v.from) : [], list = entries.filter((x) => YB.inRange(x.d, v.from, v.to));
    let bal = YB.sum(before, "inc") - YB.sum(before, "exp"); const opening = bal, blank = { html: "", text: "", right: true };
    const rows = [[v.from || "", "이월", "전기이월", "", blank, blank, opening]]; rows[0].cls = "yb-sub";
    list.forEach((x) => { bal += x.inc - x.exp; rows.push([x.d, x.t, x.c, x.s, x.inc || blank, x.exp || blank, bal]); });
    const inc = YB.sum(list, "inc"), exp = YB.sum(list, "exp");
    return { headers: ["날짜", "구분", "항목", "적요", { label: "수입", right: true }, { label: "지출", right: true }, { label: "잔액", right: true }], rows, foot: ["합계", "", "", `${list.length}건`, inc, exp, bal], summary: periodText(v) + chip(`전기이월 ${fmt(opening)}`) + chip(`기말 잔액 ${fmt(bal)}`) };
  }
  YB.report({
    id: "cashbook", title: "헌금 출납 검색", group: "재정 검색", icon: "📗", desc: "헌금의 수입과 지출을 기록하는 현금출납장 페이지입니다.",
    controls: [{ type: "range", default: "month" }, { key: "fund", label: "회계", type: "select", options: fundOpts }], compute: (v) => cashbook(v, v.fund),
  });
  YB.report({
    id: "purposeCashbook", title: "목적헌금 출납 검색", group: "재정 검색", icon: "📘", desc: "목적헌금(특별회계·선교헌금 등)의 수입과 지출을 기록하는 출납장입니다.",
    controls: [{ type: "range", default: "year" }, { key: "fund", label: "목적 회계", type: "select", options: () => state.funds.slice(1), default: () => state.funds[1] || "" }],
    compute: (v) => (v.fund ? cashbook(v, v.fund) : { html: '<div class="empty-state"><h3>목적 회계가 없습니다</h3><p>항목 관리에서 회계 구분을 추가해 주세요.</p></div>' }),
    note: "일반회계(첫 번째 회계)를 제외한 회계별 출납장입니다. 회계 간 이체도 함께 표시됩니다.",
  });

  const donorRows = (v) => {
    const list = state.donations.filter(inR(v)).filter((x) => (!v.category || x.category === v.category) && (!v.fund || x.fund === v.fund)), map = new Map();
    list.forEach((x) => { const key = x.anonymous || !x.memberId ? "" : x.memberId; const e = map.get(key) || { key, count: 0, amount: 0 }; e.count += 1; e.amount += Number(x.amount); map.set(key, e); });
    return { all: [...map.values()].map((e) => ({ ...e, m: YB.member(e.key), name: e.key ? memberName(e.key) : "무기명" })), total: YB.sum(list), count: list.length };
  };
  const donorControls = [{ type: "range", default: "year" }, { key: "category", label: "헌금 항목", type: "select", options: incOpts }, { key: "fund", label: "회계", type: "select", options: fundOpts }];
  YB.report({
    id: "donorList", title: "헌금자 명단", group: "재정 검색", icon: "📋", desc: "특정 기간 동안 헌금한 교인 목록을 조회하는 페이지입니다.", controls: donorControls,
    compute(v) { const { all, total: t, count } = donorRows(v); const rows = all.sort((a, b) => (!a.key) - (!b.key) || a.name.localeCompare(b.name, "ko")).map((e) => [e.name, e.m?.group || "", e.m?.position || "", e.count, e.amount]); return { headers: ["헌금자", "소속", "직분", "건수", "합계"], rows, foot: ["합계", "", `${all.filter((e) => e.key).length}명`, count, t], summary: periodText(v) }; },
  });
  YB.report({
    id: "donorRank", title: "헌금자 순위", group: "재정 검색", icon: "🏅", desc: "특정 기간 동안 헌금한 교인의 헌금 합계 순위를 조회합니다.", controls: donorControls,
    compute(v) { const { all, total: t, count } = donorRows(v); const rows = all.filter((e) => e.key).sort((a, b) => b.amount - a.amount).map((e, i) => [i + 1, e.name, e.m?.group || "", e.count, e.amount, `${t ? ((e.amount / t) * 100).toFixed(1) : 0}%`]); return { headers: ["순위", "헌금자", "소속", "건수", "합계", { label: "비율", right: true }], rows, foot: ["", "기명 합계", "", "", YB.sum(all.filter((e) => e.key)), ""], summary: periodText(v) + chip(`전체 ${count}건 · ${fmt(t)} (무기명 포함)`) }; },
    note: "무기명 헌금은 순위에서 제외됩니다. 민감한 자료이므로 열람·출력에 유의해 주세요.",
  });
  YB.report({
    id: "personal", title: "헌금(개인단위) 검색", group: "재정 검색", icon: "👤", desc: "특정 교인의 헌금 내역을 월별 집계 또는 상세 내역으로 조회합니다.",
    controls: [{ key: "member", label: "교인", type: "member" }, { key: "year", label: "연도", type: "number", default: () => selectedYear }, { key: "view", label: "보기", type: "select", options: [["matrix", "월별 집계"], ["detail", "상세 내역"]], default: "matrix" }],
    compute(v) {
      const m = YB.findMember(v.member); if (!m) return { html: '<div class="empty-state"><div>👤</div><h3>교인을 선택해 주세요</h3><p>이름을 입력하고 목록에서 선택합니다.</p></div>' };
      const list = byYear(state.donations.filter((x) => x.memberId === m.id && !x.anonymous), v.year).sort((a, b) => a.date.localeCompare(b.date)), summary = chip(`${m.name}${m.group ? ` · ${m.group}` : ""}`) + chip(`${v.year}년 ${list.length}건 · ${fmt(YB.sum(list))}`);
      if (v.view === "detail") return { headers: ["날짜", "항목", "회계", "방법", "메모", "금액"], rows: list.map((x) => [x.date, x.category, x.fund, x.method, x.memo || "", Number(x.amount)]), foot: ["합계", "", "", "", "", YB.sum(list)], summary };
      const cats = state.incomeCategories.filter((c) => list.some((x) => x.category === c));
      const rows = Array.from({ length: 12 }, (_, i) => { const ms = list.filter((x) => month(x) === i + 1); return [`${i + 1}월`, ...cats.map((c) => YB.sum(ms.filter((x) => x.category === c))), YB.sum(ms)]; });
      return { headers: ["월", ...cats, "합계"].map((l) => ({ label: l, right: l !== "월" })), rows, foot: ["합계", ...cats.map((c) => YB.sum(list.filter((x) => x.category === c))), YB.sum(list)], summary };
    },
  });

  /* ===== 재정 집계 ===== */
  YB.report({
    id: "weeklyPart", title: "주일부별집계표", group: "재정 집계", icon: "🕘", desc: "주일 예배의 부(part)에 따라 집계한 표를 조회하는 페이지입니다.",
    controls: [{ key: "date", label: "날짜", type: "date", default: () => YB.lastSunday() }],
    compute(v) {
      const list = state.donations.filter((x) => x.date === v.date), parts = [...state.config.parts, ...new Set(list.map((x) => x.part || "").filter((p) => p && !state.config.parts.includes(p))), ""];
      const cats = state.incomeCategories.filter((c) => list.some((x) => x.category === c)), cell = (c, p) => YB.sum(list.filter((x) => (!c || x.category === c) && (x.part || "") === p));
      return { headers: ["헌금 항목", ...parts.map((p) => p || "미지정"), "합계"].map((l, i) => ({ label: l, right: i > 0 })), rows: cats.map((c) => [c, ...parts.map((p) => cell(c, p)), YB.sum(list.filter((x) => x.category === c))]), foot: ["합계", ...parts.map((p) => cell("", p)), YB.sum(list)], summary: chip(`${v.date} · ${list.length}건`), empty: "이 날짜의 헌금 기록이 없습니다." };
    },
    note: "헌금 입력 시 선택한 ‘예배 구분’을 기준으로 집계합니다. 예배 구분은 항목 관리에서 바꿀 수 있습니다.",
  });
  YB.report({
    id: "monthlyWeek", title: "월간주별집계표", group: "재정 집계", icon: "🗓", desc: "주 단위로 수입·지출 집계 내용을 조회하는 페이지입니다.",
    controls: [{ key: "month", label: "월", type: "month", default: () => YB.thisMonth() }, { key: "type", label: "구분", type: "select", options: ["수입", "지출"], default: "수입" }],
    compute(v) {
      if (!/^\d{4}-\d{2}$/.test(v.month)) return { html: "" };
      const days = YB.monthDays(v.month), first = YB.parse(days[0]).getDay(), weekOf = (d) => Math.floor((Number(d.slice(8)) - 1 + first) / 7), weeks = [...new Set(days.map(weekOf))];
      const label = (w) => { const ds = days.filter((d) => weekOf(d) === w); return `${w + 1}주 (${Number(ds[0].slice(8))}~${Number(ds[ds.length - 1].slice(8))}일)`; };
      const list = (v.type === "수입" ? state.donations : state.expenses).filter((x) => String(x.date).startsWith(v.month)), cats = (v.type === "수입" ? state.incomeCategories : state.expenseCategories).filter((c) => list.some((x) => x.category === c));
      const cell = (c, w) => YB.sum(list.filter((x) => (!c || x.category === c) && weekOf(x.date) === w));
      return { headers: [`${v.type} 항목`, ...weeks.map(label), "합계"].map((l, i) => ({ label: l, right: i > 0 })), rows: cats.map((c) => [c, ...weeks.map((w) => cell(c, w)), YB.sum(list.filter((x) => x.category === c))]), foot: ["합계", ...weeks.map((w) => cell("", w)), YB.sum(list)], summary: chip(`${v.month} ${v.type} ${fmt(YB.sum(list))}`) };
    },
  });
  YB.report({
    id: "yearlyMonth", title: "년간월별집계표", group: "재정 집계", icon: "📅", desc: "월 단위로 헌금·지출·회계별 집계 내용을 조회하는 페이지입니다.",
    controls: [{ key: "year", label: "연도", type: "number", default: () => selectedYear }, { key: "type", label: "구분", type: "select", options: [["inc", "수입 항목별"], ["exp", "지출 항목별"], ["fund", "회계별 수지"]], default: "inc" }],
    compute(v) {
      const ds = byYear(state.donations, v.year), es = byYear(state.expenses, v.year), months = Array.from({ length: 12 }, (_, i) => i + 1), headers = ["구분", ...months.map((m) => `${m}월`), "합계"].map((l, i) => ({ label: l, right: i > 0 }));
      if (v.type === "fund") {
        const ts = byYear(state.transfers, v.year), net = (f, m) => YB.sum(ds.filter((x) => x.fund === f && (!m || month(x) === m))) - YB.sum(es.filter((x) => x.fund === f && (!m || month(x) === m))) + YB.sum(ts.filter((x) => x.toFund === f && (!m || month(x) === m))) - YB.sum(ts.filter((x) => x.fromFund === f && (!m || month(x) === m)));
        const all = (m) => YB.sum(ds.filter((x) => !m || month(x) === m)) - YB.sum(es.filter((x) => !m || month(x) === m));
        return { headers, rows: state.funds.map((f) => [f, ...months.map((m) => net(f, m)), net(f, 0)]), foot: ["수지 합계", ...months.map(all), all(0)], summary: chip(`${v.year}년 수입 − 지출 (이체 반영)`) };
      }
      const list = v.type === "inc" ? ds : es, cats = (v.type === "inc" ? state.incomeCategories : state.expenseCategories).filter((c) => list.some((x) => x.category === c));
      return { headers, rows: cats.map((c) => [c, ...months.map((m) => YB.sum(list.filter((x) => x.category === c && month(x) === m))), YB.sum(list.filter((x) => x.category === c))]), foot: ["합계", ...months.map((m) => YB.sum(list.filter((x) => month(x) === m))), YB.sum(list)], summary: chip(`${v.year}년 ${v.type === "inc" ? "수입" : "지출"} ${fmt(YB.sum(list))}`) };
    },
  });
  YB.report({
    id: "adminStats", title: "관리자 통계", group: "재정 집계", icon: "📊", desc: "재정 전반의 관리자 통계를 조회하는 페이지입니다.", noExport: true,
    controls: [{ key: "year", label: "연도", type: "number", default: () => selectedYear }],
    compute(v) {
      const y = Number(v.year), ds = byYear(state.donations, y), es = byYear(state.expenses, y), named = ds.filter((x) => x.memberId && !x.anonymous), donors = new Set(named.map((x) => x.memberId)).size, inc = YB.sum(ds), exp = YB.sum(es);
      const top = (list, cats) => cats.map((c) => ({ label: c, value: YB.sum(list.filter((x) => x.category === c)) })).filter((x) => x.value).sort((a, b) => b.value - a.value).slice(0, 8);
      const years = [y - 4, y - 3, y - 2, y - 1, y].map((yy) => { const d = byYear(state.donations, yy), e = byYear(state.expenses, yy); return [`${yy}년`, YB.sum(d), YB.sum(e), YB.sum(d) - YB.sum(e), new Set(d.filter((x) => x.memberId && !x.anonymous).map((x) => x.memberId)).size]; });
      const sec = (t, body) => `<div class="yb-stat"><h4>${t}</h4>${body}</div>`;
      return { html: YB.cards([{ label: "총수입", value: fmt(inc) }, { label: "총지출", value: fmt(exp) }, { label: "수지", value: fmt(inc - exp) }, { label: "헌금 참여자", value: `${donors}명`, sub: `헌금 ${ds.length}건` }, { label: "1인 평균 헌금", value: fmt(donors ? Math.round(YB.sum(named) / donors) : 0), sub: "기명 헌금 기준" }, { label: "무기명 헌금", value: fmt(inc - YB.sum(named)) }]) +
        `<div class="yb-stat-grid">${sec("월별 헌금 참여자 수", YB.bars(Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1}월`, value: new Set(named.filter((x) => month(x) === i + 1).map((x) => x.memberId)).size, unit: "명" }))))}${sec("납부 방법별 헌금", YB.tableHtml(["방법", "건수", "금액"], METHODS.map((m) => { const l = ds.filter((x) => x.method === m); return [m, l.length, YB.sum(l)]; })))}${sec("수입 상위 항목", YB.bars(top(ds, state.incomeCategories)) || "")}${sec("지출 상위 항목", YB.bars(top(es, state.expenseCategories)) || "")}</div>` + sec("최근 5년 비교", YB.tableHtml(["연도", "수입", "지출", "수지", "헌금 참여자"], years)) };
    },
  });

  /* ===== 관리: 엑셀 입력 · 일괄 처리 · 항목 관리 ===== */
  async function readSheet(file, required) {
    if (!window.XLSX) throw new Error("엑셀 읽기 모듈을 불러오지 못했습니다");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true }), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: true });
    const hi = rows.findIndex((r, i) => i < 15 && required.every((k) => r.map((c) => String(c).trim()).includes(k))); if (hi < 0) throw new Error(`제목 행을 찾지 못했습니다. 필수 열: ${required.join(", ")}`);
    const headers = rows[hi].map((c) => String(c).trim());
    return rows.slice(hi + 1).map((r, i) => ({ _row: hi + 2 + i, ...Object.fromEntries(headers.map((k, j) => [k, r[j]])) })).filter((r) => headers.some((k) => String(r[k] ?? "").trim() !== ""));
  }
  const str = (v) => String(v ?? "").trim();
  const EXP_HEAD = ["지출일", "지출항목", "세부내역", "회계구분", "지급처", "금액", "지급방법", "메모"], MEM_HEAD = ["이름", "휴대폰", "주소", "소속", "상태", "성별", "생년월일", "직분", "세대", "교인번호", "등록일", "이메일", "메모"], DON_HEAD = ["헌금일", "헌금자", "무기명여부", "헌금항목", "회계구분", "금액", "납부방법", "메모"];
  function template(name, sheet, head, sample) { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, sample]), sheet); XLSX.writeFile(wb, name); }
  async function importExpenses(file) {
    const rows = await readSheet(file, ["지출일", "지출항목", "세부내역", "회계구분", "금액"]), errors = [], records = [], sig = (r) => [r.date, r.category, r.detail, r.fund, r.amount, r.payee].join("|"), existing = new Set(state.expenses.map(sig)); let skipped = 0;
    rows.forEach((r) => {
      const rec = { id: uid("exp"), date: excelDateToIso(r["지출일"]), category: str(r["지출항목"]), detail: str(r["세부내역"]), fund: str(r["회계구분"]), payee: str(r["지급처"]), amount: Number(str(r["금액"]).replace(/[,\s원]/g, "")), method: str(r["지급방법"]) || "계좌이체", memo: str(r["메모"]), updatedAt: Date.now() };
      if (!rec.date) errors.push(`${r._row}행: 지출일을 yyyy-mm-dd 형식으로 입력해 주세요`); if (!state.expenseCategories.includes(rec.category)) errors.push(`${r._row}행: 등록되지 않은 지출항목 '${rec.category}'`); if (!state.funds.includes(rec.fund)) errors.push(`${r._row}행: 등록되지 않은 회계구분 '${rec.fund}'`); if (!(rec.amount > 0)) errors.push(`${r._row}행: 금액은 1원 이상의 숫자여야 합니다`); if (!rec.detail) errors.push(`${r._row}행: 세부내역이 비어 있습니다`);
      if (existing.has(sig(rec))) skipped += 1; else { existing.add(sig(rec)); records.push(rec); }
    });
    if (errors.length) return { error: `등록하지 않았습니다. 오류 ${errors.length}개\n${errors.slice(0, 10).join("\n")}` };
    if (!records.length) return { error: skipped ? `새로 등록할 기록이 없습니다. 중복 ${skipped}건 제외` : "입력된 지출 기록이 없습니다." };
    if (!confirm(`지출 ${records.length}건, 합계 ${fmt(YB.sum(records))}을 등록할까요?${skipped ? `\n중복 ${skipped}건은 제외됩니다.` : ""}`)) return { error: "취소했습니다." };
    state.expenses.push(...records); saveState(`지출 ${records.length}건을 일괄 등록했습니다`); return { ok: `등록 완료: ${records.length}건 · ${fmt(YB.sum(records))}${skipped ? ` · 중복 제외 ${skipped}건` : ""}` };
  }
  async function importMembers(file) {
    const rows = await readSheet(file, ["이름"]), map = { 휴대폰: "phone", 주소: "address", 소속: "group", 상태: "status", 성별: "gender", 생년월일: "birth", 직분: "position", 세대: "family", 교인번호: "memberNo", 등록일: "registeredAt", 이메일: "email", 메모: "memo" }; let added = 0, updated = 0; const plan = [];
    rows.forEach((r) => {
      const name = str(r["이름"]); if (!name) return; const data = {};
      Object.entries(map).forEach(([k, key]) => { let v = r[k]; if (v == null || str(v) === "") return; if (["birth", "registeredAt"].includes(key)) v = excelDateToIso(v); else if (key === "phone") v = formatMobile(str(v)); else v = str(v); if (v) data[key] = v; });
      const same = state.members.filter((m) => m.name === name), target = same.find((m) => (data.group ? m.group === data.group : true) && same.length === 1) || same.find((m) => data.group && m.group === data.group);
      plan.push({ name, data, target }); target ? (updated += 1) : (added += 1);
    });
    if (!plan.length) return { error: "입력된 교인이 없습니다." };
    if (!confirm(`교인 ${plan.length}명을 처리합니다.\n신규 등록 ${added}명 · 기존 정보 갱신 ${updated}명\n계속할까요?`)) return { error: "취소했습니다." };
    plan.forEach(({ name, data, target }) => { if (target) Object.assign(target, data, { updatedAt: Date.now() }); else state.members.push({ id: uid("mem"), name, phone: "", address: "", taxId: "", group: "", status: "재적", ...data, updatedAt: Date.now() }); });
    saveState("교인 명부를 일괄 등록했습니다"); return { ok: `완료: 신규 ${added}명 · 갱신 ${updated}명` };
  }
  YB.page({
    id: "excelImport", title: "엑셀 데이터 입력", group: "관리", icon: "📥", desc: "엑셀 파일을 통해 헌금·지출·교인 데이터를 일괄적으로 입력합니다.",
    render(el) {
      const card = (key, title, text, head) => `<article class="panel"><div class="panel-head"><div><p class="eyebrow">EXCEL</p><h3>${title}</h3></div></div><p class="muted">${text}</p><p class="muted">열 제목: ${head.join(" · ")}</p><div class="yb-toolbar"><button class="ghost small" data-tpl="${key}">양식 내려받기</button><label class="file-button small">엑셀 파일 선택<input type="file" data-file="${key}" accept=".xlsx,.xls"></label></div><div class="import-status hidden" data-status="${key}"></div></article>`;
      el.innerHTML = `<div class="yb-stack">${card("don", "헌금 일괄 등록", "헌금자 이름은 교인 명부와 일치해야 하며, 동명이인은 ‘이름 · 소속’ 형식으로 적습니다. 무기명여부에 ‘예’를 적으면 무기명으로 등록합니다.", DON_HEAD)}${card("exp", "지출 일괄 등록", "지출항목과 회계구분은 항목 관리에 등록된 이름과 같아야 합니다. 같은 내용의 기록은 중복으로 보고 제외합니다.", EXP_HEAD)}${card("mem", "교인 일괄 등록", "‘이름’만 필수입니다. 같은 이름(및 소속)의 교인이 있으면 입력된 칸만 갱신하고, 없으면 새로 등록합니다.", MEM_HEAD)}</div>`;
      el.addEventListener("click", (e) => {
        const k = e.target.closest("[data-tpl]")?.dataset.tpl; if (!k) return; if (!window.XLSX) return toast("엑셀 모듈을 불러오지 못했습니다");
        if (k === "don") template("열방교회_헌금_일괄등록_양식.xlsx", "헌금입력", DON_HEAD, [todayISO(), "홍길동", "", state.incomeCategories[0], state.funds[0], 100000, "현금", "예시 행 — 지우고 사용하세요"]);
        if (k === "exp") template("열방교회_지출_일괄등록_양식.xlsx", "지출입력", EXP_HEAD, [todayISO(), state.expenseCategories[0], "예시 내역 — 지우고 사용하세요", state.funds[0], "지급처", 50000, "계좌이체", ""]);
        if (k === "mem") template("열방교회_교인_일괄등록_양식.xlsx", "교인입력", MEM_HEAD, ["홍길동", "010-0000-0000", "", "", "재적", "남", "1980-01-01", "집사", "", "", todayISO(), "", "예시 행 — 지우고 사용하세요"]);
      });
      el.addEventListener("change", async (e) => {
        const inp = e.target.closest("[data-file]"); if (!inp?.files[0]) return; const k = inp.dataset.file, status = el.querySelector(`[data-status="${k}"]`), file = inp.files[0]; inp.value = "";
        status.className = "import-status"; status.textContent = "엑셀 파일을 확인하고 있습니다…";
        try {
          if (k === "don") { await importDonationWorkbook(file); const src = $("donationImportStatus"); status.className = src.className; status.textContent = src.textContent; return; }
          const result = k === "exp" ? await importExpenses(file) : await importMembers(file); status.className = `import-status${result.error ? " error" : ""}`; status.textContent = result.error || result.ok;
        } catch (error) { status.className = "import-status error"; status.textContent = `엑셀 파일을 읽지 못했습니다. ${error.message}`; }
      });
    },
  });

  const bulk = { target: "donations", from: "", to: "", category: "", fund: "" };
  YB.page({
    id: "bulk", title: "일괄 데이터 처리", group: "관리", icon: "🌐", desc: "기간·항목 조건에 맞는 헌금·지출 기록의 항목과 회계를 한꺼번에 바꾸거나 삭제합니다.",
    render(el) {
      if (!bulk.from) [bulk.from, bulk.to] = YB.preset("year");
      const cats = bulk.target === "donations" ? state.incomeCategories : state.expenseCategories, sel = (key, opts, first) => `<select data-b="${key}">${first ? `<option value="">${first}</option>` : ""}${opts.map((o) => `<option ${bulk[key] === o ? "selected" : ""}>${h(o)}</option>`).join("")}</select>`;
      el.innerHTML = `<div class="yb-toolbar"><label>대상<select data-b="target"><option value="donations" ${bulk.target === "donations" ? "selected" : ""}>헌금 기록</option><option value="expenses" ${bulk.target === "expenses" ? "selected" : ""}>지출 기록</option></select></label><label>시작일<input type="date" data-b="from" value="${bulk.from}"></label><label>종료일<input type="date" data-b="to" value="${bulk.to}"></label><label>현재 항목${sel("category", cats, "전체 항목")}</label><label>현재 회계${sel("fund", state.funds, "전체 회계")}</label></div><article class="panel"><div class="panel-head"><div><p class="eyebrow">BULK</p><h3>조건에 맞는 기록</h3></div><div class="yb-summary"></div></div><div class="yb-toolbar"><label>새 항목<select data-new="category">${cats.map((o) => `<option>${h(o)}</option>`).join("")}</select></label><button class="ghost small" data-do="category">항목 일괄 변경</button><label>새 회계<select data-new="fund">${state.funds.map((o) => `<option>${h(o)}</option>`).join("")}</select></label><button class="ghost small" data-do="fund">회계 일괄 변경</button><span class="yb-spacer"></span><button class="danger" data-do="delete">조건에 맞는 기록 삭제</button></div><p class="muted yb-note">일괄 변경·삭제는 되돌릴 수 없습니다. 실행 전에 설정 · 백업에서 백업 파일을 저장해 두세요.</p><div class="yb-result"></div></article>`;
      el.querySelectorAll("[data-b]").forEach((inp) => inp.addEventListener("input", () => { bulk[inp.dataset.b] = inp.value; if (inp.dataset.b === "target") { bulk.category = ""; this.render(el); } this.refresh(); }));
      el.querySelectorAll("[data-do]").forEach((b) => b.addEventListener("click", () => {
        const rows = this.rows(), act = b.dataset.do; if (!rows.length) return toast("조건에 맞는 기록이 없습니다");
        if (act === "delete") { if (!confirm(`${rows.length}건, 합계 ${fmt(YB.sum(rows))}의 기록을 삭제합니다.\n이 작업은 되돌릴 수 없습니다. 계속할까요?`)) return; const ids = new Set(rows.map((r) => r.id)); rows.forEach((r) => window.YolbangSync?.queueDelete(bulk.target, r.id)); state[bulk.target] = state[bulk.target].filter((r) => !ids.has(r.id)); return saveState(`${rows.length}건을 삭제했습니다`); }
        const value = el.querySelector(`[data-new="${act}"]`).value; if (!confirm(`${rows.length}건의 ${act === "category" ? "항목" : "회계"}을(를) '${value}'(으)로 바꿀까요?`)) return;
        rows.forEach((r) => { r[act] = value; r.updatedAt = Date.now(); }); saveState(`${rows.length}건을 변경했습니다`);
      }));
    },
    rows() { return state[bulk.target].filter((x) => YB.inRange(x.date, bulk.from, bulk.to) && (!bulk.category || x.category === bulk.category) && (!bulk.fund || x.fund === bulk.fund)).sort((a, b) => a.date.localeCompare(b.date)); },
    refresh() {
      const el = $("bulkView"), rows = this.rows(); if (!el?.querySelector(".yb-result")) return;
      el.querySelector(".yb-summary").innerHTML = chip(`${rows.length}건`) + chip(`합계 ${fmt(YB.sum(rows))}`);
      el.querySelector(".yb-result").innerHTML = YB.tableHtml(["날짜", "항목", "내역", "회계", "금액"], rows.slice(0, 200).map((x) => [x.date, x.category, bulk.target === "donations" ? donor(x) : x.detail, x.fund, Number(x.amount)]), null, "조건에 맞는 기록이 없습니다.") + (rows.length > 200 ? `<p class="muted">처음 200건만 표시합니다. 작업은 전체 ${rows.length}건에 적용됩니다.</p>` : "");
    },
  });

  const LISTS = [
    { key: "incomeCategories", label: "헌금 항목", uses: [["donations", "category"], ["pledges", "category"]] },
    { key: "expenseCategories", label: "지출 항목", uses: [["expenses", "category"], ["recurring", "category"], ["withdrawals", "category"]] },
    { key: "funds", label: "회계 구분", uses: [["donations", "fund"], ["expenses", "fund"], ["transfers", "fromFund"], ["transfers", "toFund"], ["recurring", "fund"], ["withdrawals", "fund"]], hint: "첫 번째 회계가 기본(일반) 회계입니다." },
    { key: "parts", cfg: true, label: "헌금 예배 구분(부)", uses: [["donations", "part"], ["cashCounts", "part"]] },
    { key: "worships", cfg: true, label: "출결 예배 종류", uses: [["attendance", "worship"], ["headcounts", "worship"]] },
    { key: "positions", cfg: true, label: "직분", uses: [["members", "position"]] },
    { key: "visitTypes", cfg: true, label: "심방 종류", uses: [["visits", "type"]] },
  ];
  const listOf = (l) => (l.cfg ? state.config[l.key] : state[l.key]);
  const usage = (l, name) => l.uses.reduce((s, [c, f]) => s + (state[c] || []).filter((r) => r[f] === name).length, 0);
  YB.page({
    id: "categories", title: "항목 관리", group: "관리", icon: "🏷", desc: "헌금·지출 항목, 회계 구분, 예배 구분, 직분, 심방 종류를 추가·변경합니다.",
    render(el) {
      el.innerHTML = '<p class="muted yb-note">이름을 바꾸면 이미 입력된 기록에도 함께 반영됩니다. 사용 중인 항목은 삭제할 수 없습니다.</p><div class="yb-cat-grid"></div>';
      el.addEventListener("click", (e) => {
        const b = e.target.closest("[data-cat]"); if (!b) return; const l = LISTS.find((x) => x.key === b.dataset.cat), list = listOf(l), name = b.dataset.name;
        if (b.dataset.op === "add") { const inp = b.previousElementSibling, v = inp.value.trim(); if (!v) return; if (list.includes(v)) return toast("이미 있는 이름입니다"); list.push(v); inp.value = ""; return YB.saveConfig(`${l.label}에 '${v}'을(를) 추가했습니다`); }
        if (b.dataset.op === "del") { const n = usage(l, name); if (n) return toast(`기록 ${n}건에서 사용 중이라 삭제할 수 없습니다. 이름 변경을 이용해 주세요`); if (list.length <= 1) return toast("마지막 항목은 삭제할 수 없습니다"); if (!confirm(`'${name}'을(를) 삭제할까요?`)) return; list.splice(list.indexOf(name), 1); return YB.saveConfig("삭제했습니다"); }
        if (b.dataset.op === "ren") { const v = (prompt(`'${name}'의 새 이름`, name) || "").trim(); if (!v || v === name) return; if (list.includes(v)) return toast("이미 있는 이름입니다"); list[list.indexOf(name)] = v; let n = 0; l.uses.forEach(([c, f]) => (state[c] || []).forEach((r) => { if (r[f] === name) { r[f] = v; r.updatedAt = Date.now(); n += 1; } })); return YB.saveConfig(`이름을 바꾸고 기록 ${n}건에 반영했습니다`); }
        if (b.dataset.op === "up") { const i = list.indexOf(name); if (i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; YB.saveConfig("순서를 바꿨습니다"); } }
      });
    },
    refresh() {
      const box = $("categoriesView")?.querySelector(".yb-cat-grid"); const focused = document.activeElement; if (!box || (box.contains(focused) && focused.tagName === "INPUT" && focused.value)) return;
      box.innerHTML = LISTS.map((l) => `<article class="panel"><div class="panel-head"><div><p class="eyebrow">${l.cfg ? "CHURCH" : "ACCOUNT"}</p><h3>${l.label}</h3></div></div>${l.hint ? `<p class="muted">${l.hint}</p>` : ""}<ul class="yb-cat-list">${listOf(l).map((n) => `<li><span>${h(n)} <em>${usage(l, n) || ""}</em></span><span><button class="icon-button" data-cat="${l.key}" data-op="up" data-name="${h(n)}" title="위로">▲</button><button class="icon-button" data-cat="${l.key}" data-op="ren" data-name="${h(n)}">이름 변경</button><button class="icon-button" data-cat="${l.key}" data-op="del" data-name="${h(n)}">삭제</button></span></li>`).join("")}</ul><div class="yb-toolbar"><input placeholder="새 ${l.label}"><button class="primary small" data-cat="${l.key}" data-op="add">추가</button></div></article>`).join("");
    },
  });
})();
