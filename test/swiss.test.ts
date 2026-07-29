import { calculateStandings, createPairings, type SwissMatch } from "../src/domain/swiss";

const players = ["A", "B", "C", "D", "E"].map((id) => ({
  byeCount: 0,
  displayName: id,
  id,
}));

describe("Swiss pairing", () => {
  it("全参加者を1回ずつ割り当て、奇数時は不戦勝を1人にする", () => {
    const pairings = createPairings(players, []);
    const assigned = pairings.flatMap((pairing) =>
      pairing.player2Id ? [pairing.player1Id, pairing.player2Id] : [pairing.player1Id],
    );
    expect(new Set(assigned).size).toBe(5);
    expect(pairings.filter((pairing) => pairing.player2Id === null)).toHaveLength(1);
  });

  it("可能な限り再戦を避ける", () => {
    const previous: SwissMatch[] = [
      { confirmedResult: "p1", player1Id: "A", player2Id: "B" },
      { confirmedResult: "p2", player1Id: "C", player2Id: "D" },
    ];
    const pairings = createPairings(players.slice(0, 4), previous);
    expect(
      pairings.some(
        (pairing) =>
          [pairing.player1Id, pairing.player2Id]
            .sort((left, right) => String(left).localeCompare(String(right)))
            .join("") === "AB" ||
          [pairing.player1Id, pairing.player2Id]
            .sort((left, right) => String(left).localeCompare(String(right)))
            .join("") === "CD",
      ),
    ).toBe(false);
  });

  it("不戦勝済みの参加者を次の不戦勝候補から外す", () => {
    const withBye = players.map((player) => ({
      ...player,
      byeCount: player.id === "E" ? 1 : 0,
    }));
    const bye = createPairings(withBye, []).find((pairing) => pairing.player2Id === null);
    expect(bye?.player1Id).not.toBe("E");
  });

  it("勝点、勝敗、OMW%で順位を計算する", () => {
    const standings = calculateStandings(players.slice(0, 4), [
      { confirmedResult: "p1", player1Id: "A", player2Id: "B" },
      { confirmedResult: "draw", player1Id: "C", player2Id: "D" },
      { confirmedResult: "p1", player1Id: "A", player2Id: "C" },
      { confirmedResult: "p2", player1Id: "B", player2Id: "D" },
    ]);
    expect(standings[0]).toMatchObject({ displayName: "A", matchPoints: 6, wins: 2 });
    expect(standings.every((standing) => standing.omw >= 0.33)).toBe(true);
  });
});
