// Signal, as a plugin of the ZeChat client (src/client/lib/plugin.js) — what
// the panel docked in zesignal adds to it, the way zechat-chrome adds the
// browser:
//
// - the open conversation as a card over the composer (who, how many
//   messages go along), kept current as you switch chats;
// - that conversation as context, put in front of the message when Send is
//   pressed (the "Chat" chip, on by default);
// - Signal as something the agent reads — list, read, search conversations,
//   open one — through tools the panel lends ZeChat;
// - drafts: the agent proposes a reply (draft_reply), the card shows it with
//   Insert (into Signal's composer), Copy and Dismiss. Nothing is ever sent
//   from here; you press Send in Signal.

const VIEW_LABEL = "last 20 messages";

export function createSignalPlugin({ zesignal = globalThis.zesignal } = {}) {
  let api = null;
  let els = null;
  let view = null; // { id, title, type } of the open conversation, or null
  let includeChat = true;
  const drafts = []; // { text, at }
  let defs = [];

  const escape = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function initials(title) {
    const words = String(title || "?").trim().split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "?").slice(0, 2)).toUpperCase();
  }

  function mount(slot) {
    const icon = api.icon;
    slot.innerHTML = `
      <div class="sigcard" data-card>
        <span class="sigcard__avatar" data-avatar>?</span>
        <span class="sigcard__text"><span class="sigcard__title" data-title>No conversation open</span><span class="sigcard__sub" data-sub>Open a chat in Signal to talk about it</span></span>
      </div>
      <div class="sigchips" role="group" aria-label="Signal context to include">
        <button type="button" class="sigchip" data-chat aria-pressed="true" title="Put the open conversation (${VIEW_LABEL}) in front of your message">${icon("message", 12)}<span>Chat</span></button>
      </div>
      <div class="sigdrafts" data-drafts></div>`;
    const q = (sel) => slot.querySelector(sel);
    els = { card: q("[data-card]"), avatar: q("[data-avatar]"), title: q("[data-title]"), sub: q("[data-sub]"), chat: q("[data-chat]"), drafts: q("[data-drafts]") };
    els.chat.onclick = () => {
      includeChat = !includeChat;
      drawCard();
    };
    els.drafts.onclick = (event) => onDraftClick(event);
    drawCard();
    drawDrafts();
  }

  function drawCard() {
    if (!els) return;
    els.card.classList.toggle("is-empty", !view);
    els.avatar.textContent = view ? initials(view.title) : "?";
    els.title.textContent = view ? view.title : "No conversation open";
    els.sub.textContent = view
      ? `${view.type === "group" ? "Group" : "Chat"} · ${includeChat ? `${VIEW_LABEL} go with your message` : "not included"}`
      : "Open a chat in Signal to talk about it";
    els.chat.classList.toggle("on", includeChat && Boolean(view));
    els.chat.disabled = !view;
    els.chat.setAttribute("aria-pressed", String(includeChat));
  }

  function drawDrafts() {
    if (!els) return;
    const icon = api.icon;
    els.drafts.innerHTML = drafts
      .map(
        (d, i) => `
        <div class="sigdraft" data-i="${i}">
          <div class="sigdraft__head">${icon("pen", 12)}<span>Draft reply${d.title ? ` · ${escape(d.title)}` : ""}</span></div>
          <div class="sigdraft__text">${escape(d.text)}</div>
          <div class="sigdraft__row">
            <button type="button" class="btn" data-act="dismiss">Dismiss</button>
            <button type="button" class="btn" data-act="copy">${icon("copy", 13)} Copy</button>
            <button type="button" class="btn primary" data-act="insert">Insert</button>
          </div>
        </div>`
      )
      .join("");
  }

  async function onDraftClick(event) {
    const button = event.target.closest("[data-act]");
    const box = event.target.closest("[data-i]");
    if (!button || !box) return;
    const i = Number(box.dataset.i);
    const draft = drafts[i];
    if (!draft) return;
    if (button.dataset.act === "copy") {
      await navigator.clipboard.writeText(draft.text);
      api.setNote?.("Draft copied.");
      return;
    }
    if (button.dataset.act === "insert") {
      const ok = await zesignal.insert(draft.text);
      if (!ok) {
        api.setNote?.("Open the conversation in Signal first, then Insert.", true);
        return;
      }
      api.setNote?.("Draft inserted in Signal's composer — review it and press Send there.");
    }
    drafts.splice(i, 1);
    drawDrafts();
  }

  async function compose({ ask, status }) {
    if (!includeChat || !view) return null;
    status?.("Reading the conversation");
    const observed = await zesignal.signal("observe", {});
    const message = `<view app="ZeSignal">\n${observed}\n</view>\n\n${ask}`;
    return { message, parts: [{ icon: "message", label: "Chat", ok: true, detail: `${view.title} · ${VIEW_LABEL}` }] };
  }

  async function onClientTool(name, args) {
    try {
      if (name === "draft_reply") {
        const text = String(args?.text ?? "").trim();
        if (!text) return { ok: false, error: "'text' is empty" };
        drafts.unshift({ text, title: view?.title || "" });
        drawDrafts();
        return {
          ok: true,
          result: "The draft is shown above the panel's composer, not yet in Signal: the person may insert it in Signal's composer and send it. Do not repeat the draft in your answer.",
        };
      }
      return { ok: true, result: await zesignal.signal(name, args || {}) };
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error).replace(/^Error invoking remote method '[^']+': (Error: )?/, "") };
    }
  }

  return {
    boot(a) {
      api = a;
      zesignal.tools().then((list) => {
        defs = list;
      });
      zesignal.view().then((v) => {
        view = v;
        drawCard();
      });
      zesignal.on("zpanel:view", (v) => {
        view = v;
        drawCard();
      });
    },
    composer(slot, a) {
      api = api || a;
      mount(slot);
    },
    compose,
    session: () => ({ clientTools: defs, onClientTool }),
    // A narrow panel beside the messenger (ZeChat REQ-HUB-027): short answers.
    deviceKind: () => "panel",
    hints: () => [
      { icon: "list", label: "Summarise this chat", detail: "The gist and what is still open", prompt: "Summarise this conversation: the gist, and anything still waiting on me." },
      { icon: "pen", label: "Draft a reply", detail: "You review it, you send it", prompt: "Draft a reply to the last message, in the tone of this conversation." },
      { icon: "search", label: "Find in my chats", detail: "Search every conversation", prompt: "Search my Signal conversations for " },
      { icon: "checklist", label: "What do I owe?", detail: "Questions and promises left open", prompt: "List the questions I have not answered and the things I promised in this conversation." },
    ],
  };
}
