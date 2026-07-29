const root = document.querySelector("[data-page]");
const page = root?.dataset.page;
const tournamentId = root?.dataset.id;
const key = new URLSearchParams(location.hash.slice(1)).get("key") ?? "";
const sessionStorageKey = "round-fuda-session";
let state = null;

const getSession = () => {
  let value = localStorage.getItem(sessionStorageKey);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(sessionStorageKey, value);
  }
  return value;
};

const labels = {
  active: "進行中",
  cancelled: "中止",
  completed: "終了",
  hidden: "非表示",
  registration: "受付中",
};

const errorLabels = {
  already_registered_or_name_taken: "この端末は登録済みか、そのハンドルは使われています。",
  check_in_closed: "受付は終了しています。",
  contact_not_allowed_in_displayName: "ハンドルに連絡先やURLは入力できません。",
  finish_current_match_first: "現在の対戦結果を確定してから棄権してください。",
  invalid_capability: "札の鍵を確認できません。この端末に保存したURLから開いてください。",
  not_enough_checked_in: "開始には4人以上の受付が必要です。",
  round_incomplete: "未確定または申告不一致の卓があります。",
  tournament_full: "定員に達しました。",
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const button = (text, className, action) => {
  const node = el("button", className, text);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
};

const showAlert = (message) => {
  const alert = document.querySelector("[data-alert]");
  if (!(alert instanceof HTMLElement)) return;
  alert.textContent = message;
  alert.hidden = !message;
};

const request = async (path, options = {}) => {
  const headers = {
    ...(options.body ? { "content-type": "application/json" } : {}),
    "x-round-session": getSession(),
    ...(key ? { "x-round-key": key } : {}),
    ...options.headers,
  };
  const response = await fetch(path, { ...options, headers });
  const type = response.headers.get("content-type") ?? "";
  const body = type.includes("json") ? await response.json() : await response.text();
  if (!response.ok) {
    const code = typeof body === "object" && body ? body.error : "unknown";
    throw new Error(code);
  }
  return body;
};

const endpoint = () =>
  page === "manage"
    ? `/api/tournaments/${tournamentId}/manage`
    : page === "pass"
      ? `/api/tournaments/${tournamentId}/pass`
      : `/api/tournaments/${tournamentId}`;

const formatTime = (seconds) =>
  new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(seconds * 1000));

const resultText = (result, first, second) => {
  if (result === "draw") return "引き分け";
  if (result === "p1") return `${first} 勝ち`;
  if (result === "p2") return `${second} 勝ち`;
  return "結果待ち";
};

const createSlip = (match) => {
  const wrapper = el("div");
  const slip = el("article", "table-slip");
  slip.append(el("span", "table-number", String(match.tableNumber)));
  slip.append(el("div", "player-card", match.player1));
  slip.append(el("span", "versus", match.player2 ? "対" : ""));
  slip.append(el("div", "player-card", match.player2 ?? "不戦勝"));
  const statusClass = `match-status ${match.status}`;
  const status =
    match.status === "disputed"
      ? "申告不一致"
      : match.status === "confirmed"
        ? resultText(match.result, match.player1, match.player2 ?? "")
        : "結果待ち";
  slip.append(el("span", statusClass, status));
  wrapper.append(slip);

  if (
    page === "pass" &&
    state.participant?.match?.id === match.id &&
    match.status !== "confirmed"
  ) {
    const row = el("div", "report-row");
    row.append(el("span", "", "あなたの結果"));
    row.append(button("勝ち", "result-button win", () => reportResult(match.id, "win")));
    row.append(button("引き分け", "result-button draw", () => reportResult(match.id, "draw")));
    row.append(button("負け", "result-button", () => reportResult(match.id, "loss")));
    wrapper.append(row);
  }

  if (page === "manage" && match.status !== "confirmed" && match.player2) {
    const row = el("div", "resolve-row");
    row.append(el("span", "", match.status === "disputed" ? "主催裁定" : "結果を確定"));
    row.append(button(`${match.player1} 勝ち`, "secondary", () => resolve(match.id, "p1")));
    row.append(button("引き分け", "secondary", () => resolve(match.id, "draw")));
    row.append(button(`${match.player2} 勝ち`, "secondary", () => resolve(match.id, "p2")));
    wrapper.append(row);
  }
  return wrapper;
};

const renderPairings = () => {
  const panel = document.querySelector('[data-panel="pairings"]');
  if (!(panel instanceof HTMLElement)) return;
  panel.replaceChildren();
  const heading = el("div", "round-heading");
  heading.append(
    el(
      "h2",
      "",
      state.tournament.currentRound ? `第${state.tournament.currentRound}ラウンド` : "組合せ前",
    ),
  );
  heading.append(
    el(
      "span",
      "",
      state.tournament.currentRound
        ? `${state.tournament.currentRound} / ${state.tournament.plannedRounds} ラウンド`
        : `${state.players.filter((player) => player.checkedIn).length} 人受付`,
    ),
  );
  panel.append(heading);
  if (state.currentMatches.length === 0) {
    const empty = el("div", "empty-board");
    empty.append(
      el(
        "b",
        "",
        state.tournament.status === "registration" ? "受付を待っています" : "卓はありません",
      ),
    );
    empty.append(
      el(
        "span",
        "",
        state.tournament.status === "registration"
          ? "主催者が開始すると、ここに卓番号が並びます。"
          : "この開催の組合せはありません。",
      ),
    );
    panel.append(empty);
    return;
  }
  const list = el("div", "board-table-list");
  state.currentMatches.forEach((match) => list.append(createSlip(match)));
  panel.append(list);
};

const renderStandings = () => {
  const panel = document.querySelector('[data-panel="standings"]');
  if (!(panel instanceof HTMLElement)) return;
  panel.replaceChildren();
  const table = el("table", "standings");
  const head = el("thead");
  const headRow = el("tr");
  ["順位", "ハンドル", "勝", "分", "負", "勝点", "OMW%"].forEach((label) =>
    headRow.append(el("th", "", label)),
  );
  head.append(headRow);
  const body = el("tbody");
  state.standings.forEach((standing) => {
    const row = el("tr");
    [
      standing.rank,
      standing.name,
      standing.wins,
      standing.draws,
      standing.losses,
      standing.matchPoints,
      `${standing.omw}%`,
    ].forEach((value, index) => row.append(el("td", index === 0 ? "rank" : "", String(value))));
    body.append(row);
  });
  table.append(head, body);
  panel.append(table);
};

const renderPlayers = () => {
  const panel = document.querySelector('[data-panel="players"]');
  if (!(panel instanceof HTMLElement)) return;
  panel.replaceChildren();
  const grid = el("div", "player-grid");
  state.players.forEach((player) => {
    const classes = `player-chip${player.checkedIn ? " checked" : ""}${player.dropped ? " dropped" : ""}`;
    const chip = el("div", classes);
    chip.append(el("i"));
    chip.append(el("span", "", player.displayName));
    grid.append(chip);
  });
  panel.append(grid);
};

const registrationPanel = () => {
  const card = el("section", "mode-card");
  const copy = el("div");
  copy.append(el("strong", "", `${state.players.length} / ${state.tournament.maxPlayers} 人`));
  copy.append(el("p", "", "公開用ハンドルだけで参加札を受け取ります。"));
  card.append(copy);

  const storedPass = localStorage.getItem(`round-fuda-pass-${tournamentId}`);
  if (storedPass) {
    const link = el("a", "primary button-link", "自分の参加札をひらく");
    link.href = storedPass;
    card.append(link);
  } else if (state.tournament.status === "registration") {
    const form = el("form", "registration-form");
    const label = el("label", "", "公開用ハンドル");
    const input = el("input");
    input.name = "displayName";
    input.maxLength = 32;
    input.required = true;
    label.append(input);
    const submit = el("button", "primary", "参加札を受け取る");
    submit.type = "submit";
    const errorBox = el("p", "form-error");
    form.append(label, submit, errorBox);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      errorBox.textContent = "";
      try {
        const result = await request(`/api/tournaments/${tournamentId}/register`, {
          body: JSON.stringify({ displayName: input.value, website: "" }),
          method: "POST",
        });
        localStorage.setItem(`round-fuda-pass-${tournamentId}`, result.passUrl);
        location.assign(result.passUrl);
      } catch (error) {
        const code = error instanceof Error ? error.message : "unknown";
        errorBox.textContent = errorLabels[code] ?? "登録できませんでした。";
      } finally {
        submit.disabled = false;
      }
    });
    card.append(form);
  }
  return card;
};

const managerPanel = () => {
  const card = el("section", "mode-card");
  const copy = el("div");
  copy.append(
    el(
      "strong",
      "",
      `主催盤面 · ${state.players.filter((player) => player.checkedIn).length} 人受付`,
    ),
  );
  copy.append(
    el(
      "p",
      "",
      state.tournament.currentRound
        ? `第${state.tournament.currentRound}ラウンドを進行中`
        : "参加者の受付後に開始します。",
    ),
  );
  card.append(copy);
  const actions = el("div", "mode-actions");
  if (state.tournament.status === "registration") {
    actions.append(button("第1ラウンド開始", "primary", startTournament));
  } else if (
    state.tournament.status === "active" &&
    state.tournament.currentRound < state.tournament.plannedRounds
  ) {
    actions.append(button("次ラウンドを組む", "primary", nextRound));
  }
  actions.append(button("印刷", "secondary", () => window.print()));
  actions.append(button("JSON控え", "secondary", () => downloadSnapshot("json")));
  actions.append(button("CSV順位", "secondary", () => downloadSnapshot("csv")));
  card.append(actions);
  return card;
};

const passPanel = () => {
  const card = el("section", "mode-card");
  const copy = el("div");
  copy.append(el("strong", "", `${state.participant.displayName} の参加札`));
  copy.append(
    el(
      "p",
      "",
      state.participant.dropped
        ? "棄権済みです。"
        : state.participant.checkedIn
          ? "受付済み。卓番号を確認してください。"
          : "会場に着いたら受付を押してください。",
    ),
  );
  card.append(copy);
  const actions = el("div", "mode-actions");
  if (!state.participant.checkedIn && state.tournament.status === "registration") {
    actions.append(button("当日受付", "primary", checkIn));
  }
  if (!state.participant.dropped && ["registration", "active"].includes(state.tournament.status)) {
    actions.append(button("棄権する", "danger", drop));
  }
  card.append(actions);
  return card;
};

const render = () => {
  document.querySelector(".board-loading")?.remove();
  const app = document.querySelector("[data-board-app]");
  if (!(app instanceof HTMLElement)) return;
  app.hidden = false;
  const assign = (selector, value) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  };
  assign("[data-game]", state.tournament.gameLabel);
  assign("[data-title]", state.tournament.title);
  assign("[data-start]", formatTime(state.tournament.startsAt));
  assign("[data-venue]", state.tournament.venue);
  assign("[data-status]", labels[state.tournament.status] ?? state.tournament.status);
  const panel = document.querySelector("[data-mode-panel]");
  if (panel) {
    panel.replaceChildren(
      page === "manage" ? managerPanel() : page === "pass" ? passPanel() : registrationPanel(),
    );
  }
  renderPairings();
  renderStandings();
  renderPlayers();
};

const load = async (quiet = false) => {
  try {
    state = await request(endpoint());
    render();
    if (!quiet) showAlert("");
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    showAlert(errorLabels[code] ?? "盤面を読み込めませんでした。URLと通信状態を確認してください。");
  }
};

const perform = async (path, body) => {
  showAlert("");
  try {
    await request(path, {
      body: body ? JSON.stringify(body) : undefined,
      method: "POST",
    });
    await load();
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    showAlert(errorLabels[code] ?? "操作を完了できませんでした。盤面を更新して確認してください。");
  }
};

const startTournament = () => perform(`/api/tournaments/${tournamentId}/start`);
const nextRound = () => perform(`/api/tournaments/${tournamentId}/next-round`);
const checkIn = () => perform(`/api/tournaments/${tournamentId}/check-in`);
const reportResult = (matchId, result) =>
  perform(`/api/tournaments/${tournamentId}/matches/${matchId}/report`, { result });
const resolve = (matchId, result) =>
  perform(`/api/tournaments/${tournamentId}/matches/${matchId}/resolve`, { result });
const drop = () => {
  if (confirm("この開催を棄権しますか？")) perform(`/api/tournaments/${tournamentId}/drop`);
};

const downloadSnapshot = async (format) => {
  try {
    const response = await fetch(`/api/tournaments/${tournamentId}/snapshot.${format}`, {
      headers: {
        "x-round-key": key,
        "x-round-session": getSession(),
      },
    });
    if (!response.ok) throw new Error("download_failed");
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `round-fuda-${tournamentId.slice(0, 8)}.${format}`;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch {
    showAlert("控えを保存できませんでした。");
  }
};

document.querySelectorAll("[data-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    const name = tab.dataset.tab;
    document
      .querySelectorAll("[data-tab]")
      .forEach((candidate) => candidate.classList.toggle("active", candidate === tab));
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== name;
    });
  });
});

if ((page === "manage" || page === "pass") && !key) {
  showAlert("この札には鍵がありません。最初に保存したURLから開いてください。");
} else {
  load();
  setInterval(() => load(true), 15000);
}
