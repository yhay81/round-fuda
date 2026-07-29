import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Miniflare } from "miniflare";

import { app, type Bindings } from "../src/worker";

const migrationPath = fileURLToPath(new URL("../migrations/0001_tournaments.sql", import.meta.url));
const origin = "http://localhost";
const sessions = [
  "a2d0e2f2-66fd-4fd4-8e87-b0ef67ad194a",
  "b3d0e2f2-66fd-4fd4-8e87-b0ef67ad194b",
  "c4d0e2f2-66fd-4fd4-8e87-b0ef67ad194c",
  "d5d0e2f2-66fd-4fd4-8e87-b0ef67ad194d",
  "e6d0e2f2-66fd-4fd4-8e87-b0ef67ad194e",
  "f7d0e2f2-66fd-4fd4-8e87-b0ef67ad194f",
];

let miniflare: Miniflare;
let bindings: Bindings;

const headers = (session = sessions[0], key = "", qa = false) => ({
  "content-type": "application/json",
  origin,
  "x-round-key": key,
  "x-round-qa": qa ? "1" : "0",
  "x-round-session": session,
});

const validTournament = (overrides: Record<string, unknown> = {}) => ({
  gameLabel: "ポケットカード",
  maxPlayers: 16,
  plannedRounds: 2,
  publicNote: "対戦前後にあいさつをお願いします",
  startsAt: Math.floor(Date.now() / 1000) + 7200,
  title: "木曜ショップ大会",
  venue: "西町カードスペース",
  website: "",
  ...overrides,
});

const keyFromUrl = (url: string) =>
  new URLSearchParams(new URL(url, origin).hash.slice(1)).get("key") ?? "";

const createTournament = async (
  overrides: Record<string, unknown> = {},
  session = sessions[0],
  qa = false,
) => {
  const response = await app.request(
    "/api/tournaments",
    {
      body: JSON.stringify(validTournament(overrides)),
      headers: headers(session, "", qa),
      method: "POST",
    },
    bindings,
  );
  expect(response.status).toBe(201);
  const body = await response.json<{ eventUrl: string; id: string; manageUrl: string }>();
  return { ...body, organizerKey: keyFromUrl(body.manageUrl) };
};

const register = async (tournamentId: string, index: number, name = `選手${index}`, qa = false) => {
  const response = await app.request(
    `/api/tournaments/${tournamentId}/register`,
    {
      body: JSON.stringify({ displayName: name, website: "" }),
      headers: headers(sessions[index], "", qa),
      method: "POST",
    },
    bindings,
  );
  expect(response.status).toBe(201);
  const body = await response.json<{ id: string; passUrl: string }>();
  return { ...body, key: keyFromUrl(body.passUrl), session: sessions[index] };
};

const checkIn = async (tournamentId: string, player: { key: string; session: string }) => {
  const response = await app.request(
    `/api/tournaments/${tournamentId}/check-in`,
    {
      headers: headers(player.session, player.key),
      method: "POST",
    },
    bindings,
  );
  expect(response.status).toBe(200);
};

const startWithFour = async () => {
  const tournament = await createTournament();
  const players = await Promise.all([1, 2, 3, 4].map((index) => register(tournament.id, index)));
  await Promise.all(players.map((player) => checkIn(tournament.id, player)));
  const response = await app.request(
    `/api/tournaments/${tournament.id}/start`,
    {
      headers: headers(sessions[0], tournament.organizerKey),
      method: "POST",
    },
    bindings,
  );
  expect(response.status).toBe(200);
  return { players, tournament };
};

beforeEach(async () => {
  miniflare = new Miniflare({
    d1Databases: { DB: "round-fuda-test" },
    modules: true,
    script: "export default { fetch() { return new Response('test') } }",
  });
  const database = await miniflare.getD1Database("DB");
  const migration = await readFile(migrationPath, "utf8");
  for (const statement of migration
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)) {
    await database.prepare(statement).run();
  }
  bindings = {
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher,
    DB: database as unknown as D1Database,
  };
});

afterEach(async () => {
  await miniflare.dispose();
});

describe("public pages", () => {
  it.each([
    ["/", 'class="pairing-board"', "https://round-fuda.yhay81.com/"],
    ["/guide", 'class="guide-cards"', "https://round-fuda.yhay81.com/guide"],
    ["/privacy", 'class="data-grid"', "https://round-fuda.yhay81.com/privacy"],
  ])("%s は製品固有の盤面を返す", async (path, marker, canonical) => {
    const response = await app.request(path, undefined, bindings);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain(marker);
    expect(html).toContain(`href="${canonical}" rel="canonical"`);
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });
});

describe("tournament flow", () => {
  it("主催鍵を公開状態へ含めず、管理画面だけで受け付ける", async () => {
    const tournament = await createTournament();
    const publicResponse = await app.request(
      `/api/tournaments/${tournament.id}`,
      undefined,
      bindings,
    );
    const publicText = await publicResponse.text();
    expect(publicText).not.toContain(tournament.organizerKey);
    expect(publicText).not.toContain("organizer_token_hash");

    const denied = await app.request(
      `/api/tournaments/${tournament.id}/manage`,
      { headers: headers(sessions[0], "0".repeat(64)) },
      bindings,
    );
    expect(denied.status).toBe(403);
    const allowed = await app.request(
      `/api/tournaments/${tournament.id}/manage`,
      { headers: headers(sessions[0], tournament.organizerKey) },
      bindings,
    );
    expect(allowed.status).toBe(200);
  });

  it("登録、受付、4人で第1ラウンド開始まで進める", async () => {
    const { tournament } = await startWithFour();
    const stateResponse = await app.request(
      `/api/tournaments/${tournament.id}`,
      undefined,
      bindings,
    );
    const state = await stateResponse.json<{
      currentMatches: Array<{ player1: string; player2: string }>;
      tournament: { currentRound: number; status: string };
    }>();
    expect(state.tournament).toMatchObject({ currentRound: 1, status: "active" });
    expect(state.currentMatches).toHaveLength(2);
    expect(
      new Set(state.currentMatches.flatMap((match) => [match.player1, match.player2])).size,
    ).toBe(4);
  });

  it("4人未満では開始できない", async () => {
    const tournament = await createTournament();
    const player = await register(tournament.id, 1);
    await checkIn(tournament.id, player);
    const response = await app.request(
      `/api/tournaments/${tournament.id}/start`,
      { headers: headers(sessions[0], tournament.organizerKey), method: "POST" },
      bindings,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "not_enough_checked_in" });
  });

  it("両者の同じ申告で確定し、不一致は主催裁定へ送る", async () => {
    const { players, tournament } = await startWithFour();
    const publicResponse = await app.request(
      `/api/tournaments/${tournament.id}`,
      undefined,
      bindings,
    );
    const publicState = await publicResponse.json<{
      currentMatches: Array<{ id: string; player1: string; player2: string }>;
    }>();
    const match = publicState.currentMatches[0];
    const firstIndex = Number(match.player1.replace("選手", ""));
    const secondIndex = Number(match.player2.replace("選手", ""));
    const first = players[firstIndex - 1];
    const second = players[secondIndex - 1];

    const firstReport = await app.request(
      `/api/tournaments/${tournament.id}/matches/${match.id}/report`,
      {
        body: JSON.stringify({ result: "win" }),
        headers: headers(first.session, first.key),
        method: "POST",
      },
      bindings,
    );
    expect(await firstReport.json()).toMatchObject({ status: "pending" });
    const conflict = await app.request(
      `/api/tournaments/${tournament.id}/matches/${match.id}/report`,
      {
        body: JSON.stringify({ result: "win" }),
        headers: headers(second.session, second.key),
        method: "POST",
      },
      bindings,
    );
    expect(await conflict.json()).toMatchObject({ status: "disputed" });

    const resolve = await app.request(
      `/api/tournaments/${tournament.id}/matches/${match.id}/resolve`,
      {
        body: JSON.stringify({ result: "p1" }),
        headers: headers(sessions[0], tournament.organizerKey),
        method: "POST",
      },
      bindings,
    );
    expect(resolve.status).toBe(200);
    expect(await resolve.json()).toMatchObject({ status: "confirmed" });
  });

  it("両者が同じ勝敗を申告すると自動確定する", async () => {
    const { players, tournament } = await startWithFour();
    const passes = await Promise.all(
      players.map(async (player) => {
        const response = await app.request(
          `/api/tournaments/${tournament.id}/pass`,
          { headers: headers(player.session, player.key) },
          bindings,
        );
        return response.json<{
          participant: { match: { id: string; side: "p1" | "p2" } };
        }>();
      }),
    );
    const pair = passes
      .map((pass, index) => ({ ...pass.participant.match, player: players[index] }))
      .filter((item, _index, all) => item.id === all[0].id);
    const responses = [];
    for (const item of pair) {
      responses.push(
        await app.request(
          `/api/tournaments/${tournament.id}/matches/${item.id}/report`,
          {
            body: JSON.stringify({ result: item.side === "p1" ? "win" : "loss" }),
            headers: headers(item.player.session, item.player.key),
            method: "POST",
          },
          bindings,
        ),
      );
    }
    expect(responses.at(-1)?.status).toBe(200);
    const final = await responses.at(-1)?.json<{ status: string }>();
    expect(final?.status).toBe("confirmed");
  });

  it("未確定卓がある間は次ラウンドを公開しない", async () => {
    const { tournament } = await startWithFour();
    const response = await app.request(
      `/api/tournaments/${tournament.id}/next-round`,
      {
        headers: headers(sessions[0], tournament.organizerKey),
        method: "POST",
      },
      bindings,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "round_incomplete" });
  });

  it("同じ端末の重複登録と連絡先入りハンドルを拒否する", async () => {
    const tournament = await createTournament();
    await register(tournament.id, 1, "ミナト");
    const duplicate = await app.request(
      `/api/tournaments/${tournament.id}/register`,
      {
        body: JSON.stringify({ displayName: "別名", website: "" }),
        headers: headers(sessions[1]),
        method: "POST",
      },
      bindings,
    );
    expect(duplicate.status).toBe(409);
    const contact = await app.request(
      `/api/tournaments/${tournament.id}/register`,
      {
        body: JSON.stringify({ displayName: "test@example.com", website: "" }),
        headers: headers(sessions[2]),
        method: "POST",
      },
      bindings,
    );
    expect(contact.status).toBe(400);
  });

  it("3件の独立した通報で公開盤面を非表示にする", async () => {
    const tournament = await createTournament();
    for (const session of sessions.slice(1, 4)) {
      const response = await app.request(
        `/api/tournaments/${tournament.id}/report`,
        {
          body: JSON.stringify({ reason: "spam" }),
          headers: headers(session),
          method: "POST",
        },
        bindings,
      );
      expect(response.status).toBe(202);
    }
    const hidden = await app.request(`/api/tournaments/${tournament.id}`, undefined, bindings);
    expect(hidden.status).toBe(404);
  });

  it("自動QAイベントを実利用から分離する", async () => {
    await createTournament({}, sessions[0], true);
    const database = bindings.DB;
    const rows = await database
      .prepare("SELECT is_qa, COUNT(*) AS count FROM product_events GROUP BY is_qa ORDER BY is_qa")
      .all<{ count: number; is_qa: number }>();
    expect(rows.results).toEqual([{ count: 1, is_qa: 1 }]);
  });
});
