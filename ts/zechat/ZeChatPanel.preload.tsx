// Copyright 2026 zesignal contributors
// SPDX-License-Identifier: AGPL-3.0-only

// The ZeChat side panel: ask ZeChat's agent about the open conversation.
// The turn runs in ZeChat (app/zechat_link.main.ts relays it); this panel
// only shows it, answers approvals, and offers drafts — inserting one in the
// composer is the person's click, sending it is theirs too.
// Toggle: Ctrl+Alt+Z, or the "ZeChat" tab on the right edge.

// Its styles are injected with it (STYLE below), not in manifest.css, so the
// fork stays out of Signal's stylesheets.
// oxlint-disable signal-desktop/enforce-class-name-has-styles

import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { createRoot } from 'react-dom/client';
import { ipcRenderer } from 'electron';

import { getSelectedConversationId } from '../state/selectors/nav.std.ts';

type Entry =
  | { kind: 'user'; text: string }
  | { kind: 'agent'; text: string; done: boolean }
  | { kind: 'error'; text: string }
  | { kind: 'draft'; text: string; conversationId?: string }
  | {
      kind: 'ask';
      askId: string;
      toolName: string;
      args: unknown;
      answered?: boolean;
    };

type LinkEvent = { event: string; payload: Record<string, unknown> };

const WIDTH = 380;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const STYLE = `
#zechat-panel { --zc-bg:#fff; --zc-fg:#1b1b1d; --zc-muted:#6b6b72; --zc-line:#e3e3e6;
  --zc-card:#f4f4f6; --zc-accent:#3a76f0; --zc-accent-fg:#fff; --zc-danger:#c62828; }
body.dark-theme #zechat-panel { --zc-bg:#1b1c1f; --zc-fg:#e9e9eb; --zc-muted:#9c9ca3;
  --zc-line:#2f3035; --zc-card:#26272b; --zc-danger:#ef8080; }
#zechat-panel { position:fixed; top:0; right:0; bottom:0; width:${WIDTH}px; z-index:1000;
  display:flex; flex-direction:column; background:var(--zc-bg); color:var(--zc-fg);
  border-left:1px solid var(--zc-line); box-shadow:-8px 0 24px rgba(0,0,0,.15);
  font:14px/1.45 system-ui, sans-serif; }
#zechat-panel header { display:flex; align-items:center; gap:8px; padding:10px 12px;
  border-bottom:1px solid var(--zc-line); }
#zechat-panel header b { flex:1; }
#zechat-panel button { font:inherit; border-radius:6px; border:1px solid var(--zc-line);
  background:var(--zc-card); color:var(--zc-fg); padding:4px 10px; cursor:pointer; }
#zechat-panel button.zc-primary { background:var(--zc-accent); color:var(--zc-accent-fg);
  border-color:var(--zc-accent); }
#zechat-panel button:disabled { opacity:.5; cursor:default; }
#zechat-panel .zc-log { flex:1; overflow-y:auto; padding:12px; display:flex;
  flex-direction:column; gap:10px; }
#zechat-panel .zc-user { align-self:flex-end; max-width:85%; background:var(--zc-accent);
  color:var(--zc-accent-fg); padding:6px 10px; border-radius:12px; white-space:pre-wrap; }
#zechat-panel .zc-agent { white-space:pre-wrap; overflow-wrap:anywhere; }
#zechat-panel .zc-error { color:var(--zc-danger); }
#zechat-panel .zc-card { background:var(--zc-card); border:1px solid var(--zc-line);
  border-radius:8px; padding:8px 10px; display:flex; flex-direction:column; gap:6px; }
#zechat-panel .zc-card .zc-row { display:flex; gap:6px; }
#zechat-panel .zc-label { font-size:12px; color:var(--zc-muted); }
#zechat-panel pre { margin:0; white-space:pre-wrap; font-size:12px; max-height:120px; overflow:auto; }
#zechat-panel form { display:flex; gap:8px; padding:10px 12px; border-top:1px solid var(--zc-line); }
#zechat-panel textarea { flex:1; resize:none; font:inherit; color:inherit; background:var(--zc-card);
  border:1px solid var(--zc-line); border-radius:8px; padding:6px 8px; }
#zechat-tab { position:fixed; right:0; top:50%; transform:translateY(-50%); z-index:999;
  writing-mode:vertical-rl; padding:10px 4px; border-radius:6px 0 0 6px; border:0;
  background:#3a76f0; color:#fff; font:12px system-ui, sans-serif; cursor:pointer; opacity:.85; }
`;

function insertInComposer(text: string): boolean {
  const editor = document.querySelector<HTMLElement>(
    '.module-composition-input__quill .ql-editor'
  );
  if (!editor) {
    return false;
  }
  editor.focus();
  // Goes through Quill's own input handling, like typing.
  return document.execCommand('insertText', false, text);
}

function Panel({ onClose }: { onClose: () => void }): JSX.Element {
  const [entries, setEntries] = useState<Array<Entry>>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState('');
  const log = useRef<HTMLDivElement>(null);

  const push = useCallback((entry: Entry) => {
    setEntries(list => [...list, entry]);
  }, []);

  // Appends streamed text to the answer in progress.
  const appendToken = useCallback((token: string) => {
    setEntries(list => {
      const last = list[list.length - 1];
      if (last?.kind === 'agent' && !last.done) {
        return [...list.slice(0, -1), { ...last, text: last.text + token }];
      }
      return [...list, { kind: 'agent', text: token, done: false }];
    });
  }, []);

  useEffect(() => {
    const onEvent = (_: unknown, { event, payload }: LinkEvent) => {
      if (event === 'agent://token') {
        appendToken(str(payload.token));
      } else if (event === 'agent://turn') {
        if (payload.state === 'queued') {
          setActivity('Queued in ZeChat behind other work…');
        }
      } else if (event === 'agent://tool') {
        setActivity(str(payload.label));
      } else if (event === 'agent://ask') {
        push({
          kind: 'ask',
          askId: String(payload.askId),
          toolName: String(payload.toolName),
          args: payload.args,
        });
      } else if (event === 'zesignal://draft') {
        push({
          kind: 'draft',
          text: String(payload.text),
          conversationId: payload.conversationId as string | undefined,
        });
      } else if (event === 'zesignal://open') {
        window.reduxActions.conversations.showConversation({
          conversationId: String(payload.conversationId),
        });
      } else if (event === 'zesignal://disconnected') {
        setBusy(false);
        setActivity('');
      }
    };
    ipcRenderer.on('zechat:event', onEvent);
    return () => {
      ipcRenderer.off('zechat:event', onEvent);
    };
  }, [appendToken, push]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [entries, activity]);

  const ask = useCallback(async () => {
    const request = input.trim();
    if (!request || busy) {
      return;
    }
    setInput('');
    setBusy(true);
    push({ kind: 'user', text: request });
    try {
      const answer: string = await ipcRenderer.invoke('zechat:ask', request);
      // The final answer is authoritative over the streamed tokens.
      setEntries(list => {
        const last = list[list.length - 1];
        const done: Entry = {
          kind: 'agent',
          text: answer || (last?.kind === 'agent' ? last.text : ''),
          done: true,
        };
        if (last?.kind === 'agent' && !last.done) {
          return [...list.slice(0, -1), done];
        }
        return done.text ? [...list, done] : list;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      push({
        kind: 'error',
        text: /ENOENT|ECONNREFUSED/.test(message)
          ? 'ZeChat is not running. Start ZeChat (or `zechat serve`) and try again.'
          : message.replace(
              /^Error invoking remote method '[^']+': (Error: )?/,
              ''
            ),
      });
    }
    setBusy(false);
    setActivity('');
  }, [busy, input, push]);

  const answerAsk = useCallback(async (askId: string, allow: boolean) => {
    setEntries(list =>
      list.map(e =>
        e.kind === 'ask' && e.askId === askId ? { ...e, answered: true } : e
      )
    );
    await ipcRenderer.invoke('zechat:approve', askId, allow);
  }, []);

  const newChat = useCallback(async () => {
    await ipcRenderer.invoke('zechat:new');
    setEntries([]);
  }, []);

  return (
    <div id="zechat-panel" role="complementary" aria-label="ZeChat">
      <header>
        <b>ZeChat</b>
        <button type="button" onClick={newChat} disabled={busy}>
          New
        </button>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      <div className="zc-log" ref={log}>
        {entries.length === 0 && (
          <div className="zc-label">
            Ask about the open conversation: summarise it, find something, draft
            a reply. ZeChat never sends messages; you do.
          </div>
        )}
        {entries.map((e, i) => {
          const key = `${e.kind}-${i}`;
          switch (e.kind) {
            case 'user':
              return (
                <div key={key} className="zc-user">
                  {e.text}
                </div>
              );
            case 'agent':
              return (
                <div key={key} className="zc-agent">
                  {e.text}
                </div>
              );
            case 'error':
              return (
                <div key={key} className="zc-error">
                  {e.text}
                </div>
              );
            case 'draft':
              return (
                <div key={key} className="zc-card">
                  <span className="zc-label">Draft reply</span>
                  <div className="zc-agent">{e.text}</div>
                  <div className="zc-row">
                    <button
                      type="button"
                      className="zc-primary"
                      onClick={() => {
                        if (!insertInComposer(e.text)) {
                          push({
                            kind: 'error',
                            text: 'Open the conversation first, then insert.',
                          });
                        }
                      }}
                    >
                      Insert
                    </button>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(e.text)}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              );
            case 'ask':
              return (
                <div key={key} className="zc-card">
                  <span className="zc-label">
                    ZeChat asks to run {e.toolName}
                  </span>
                  <pre>{JSON.stringify(e.args, null, 2)}</pre>
                  <div className="zc-row">
                    <button
                      type="button"
                      className="zc-primary"
                      disabled={e.answered}
                      onClick={() => answerAsk(e.askId, true)}
                    >
                      Allow
                    </button>
                    <button
                      type="button"
                      disabled={e.answered}
                      onClick={() => answerAsk(e.askId, false)}
                    >
                      Deny
                    </button>
                  </div>
                </div>
              );
            default:
              return null;
          }
        })}
        {busy && <div className="zc-label">{activity || 'Thinking…'}</div>}
      </div>
      <form
        onSubmit={event => {
          event.preventDefault();
          void ask();
        }}
      >
        <textarea
          rows={2}
          value={input}
          placeholder="Ask ZeChat…"
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void ask();
            }
          }}
        />
        {busy ? (
          <button
            type="button"
            onClick={() => ipcRenderer.invoke('zechat:stop')}
          >
            Stop
          </button>
        ) : (
          <button type="submit" className="zc-primary" disabled={!input.trim()}>
            Ask
          </button>
        )}
      </form>
    </div>
  );
}

function Root(): JSX.Element {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        setOpen(value => !value);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Keeps the main process told which conversation is open, for `observe`.
  useEffect(() => {
    let last: string | undefined;
    const report = () => {
      const id = getSelectedConversationId(window.reduxStore.getState());
      if (id !== last) {
        last = id;
        void ipcRenderer.invoke('zechat:view', id ?? null);
      }
    };
    report();
    return window.reduxStore.subscribe(report);
  }, []);

  return (
    <>
      <style>{STYLE}</style>
      {open ? (
        <Panel onClose={() => setOpen(false)} />
      ) : (
        <button id="zechat-tab" type="button" onClick={() => setOpen(true)}>
          ZeChat
        </button>
      )}
    </>
  );
}

export function mountZeChatPanel(): void {
  const container = document.createElement('div');
  container.id = 'zechat-panel-root';
  document.body.appendChild(container);
  createRoot(container).render(<Root />);
}
