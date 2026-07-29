const sessionKey = "round-fuda-session";

const getSession = () => {
  let value = localStorage.getItem(sessionKey);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(sessionKey, value);
  }
  return value;
};

const errors = {
  contact_not_allowed_in_gameLabel: "ゲーム名に連絡先やURLは入力できません。",
  contact_not_allowed_in_publicNote: "公開メモに連絡先やURLは入力できません。",
  contact_not_allowed_in_title: "開催名に連絡先やURLは入力できません。",
  contact_not_allowed_in_venue: "会場名に連絡先やURLは入力できません。",
  create_rate_limited: "1日に作成できる開催は3件までです。",
  invalid_request: "入力内容を確認してください。",
};

const sendEvent = (name) =>
  fetch("/api/events", {
    body: JSON.stringify({ name }),
    headers: {
      "content-type": "application/json",
      "x-round-session": getSession(),
    },
    method: "POST",
  }).catch(() => undefined);

const dialog = document.querySelector("#create-dialog");
const openButton = document.querySelector("[data-open-create]");
const closeButton = document.querySelector("[data-close-dialog]");
const form = document.querySelector("[data-create-form]");

openButton?.addEventListener("click", () => dialog?.showModal());
closeButton?.addEventListener("click", () => dialog?.close());

const startsAtInput = form?.elements.namedItem("startsAt");
if (startsAtInput instanceof HTMLInputElement) {
  const defaultDate = new Date(Date.now() + 7 * 86400 * 1000);
  defaultDate.setMinutes(0, 0, 0);
  startsAtInput.value = new Date(defaultDate.getTime() - defaultDate.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  const errorBox = form.querySelector("[data-form-error]");
  if (!(submit instanceof HTMLButtonElement) || !(errorBox instanceof HTMLElement)) return;
  submit.disabled = true;
  errorBox.textContent = "";
  const data = new FormData(form);
  const rawStartsAt = data.get("startsAt");
  if (typeof rawStartsAt !== "string") {
    errorBox.textContent = "開始日時を確認してください。";
    submit.disabled = false;
    return;
  }
  const startsAt = Math.floor(new Date(rawStartsAt).getTime() / 1000);
  try {
    const response = await fetch("/api/tournaments", {
      body: JSON.stringify({
        gameLabel: data.get("gameLabel"),
        maxPlayers: Number(data.get("maxPlayers")),
        plannedRounds: Number(data.get("plannedRounds")),
        publicNote: data.get("publicNote"),
        startsAt,
        title: data.get("title"),
        venue: data.get("venue"),
        website: data.get("website"),
      }),
      headers: {
        "content-type": "application/json",
        "x-round-session": getSession(),
      },
      method: "POST",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "unknown");
    localStorage.setItem(`round-fuda-manage-${result.id}`, result.manageUrl);
    location.assign(result.manageUrl);
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    errorBox.textContent =
      errors[code] ?? "作成できませんでした。入力と通信状態を確認してください。";
  } finally {
    submit.disabled = false;
  }
});

void sendEvent("visited");
