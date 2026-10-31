// Copyright 2026 zesignal contributors
// SPDX-License-Identifier: AGPL-3.0-only

// Signal's side of the docked ZeChat panel (app/zechat_link.main.ts): makes
// room for it, tells it which conversation is open, and does the two things
// it may ask of this window — open a conversation, put a draft in the
// composer (never send it). Its style is injected here, not in
// manifest.css, to keep the fork out of Signal's stylesheets. Toggle: the
// ZeChat button in the conversation header, or Ctrl+Alt+Z.

// oxlint-disable signal-desktop/enforce-class-name-has-styles

import { ipcRenderer } from 'electron';

import { getSelectedConversationId } from '../state/selectors/nav.std.ts';
import { drop } from '../util/drop.std.ts';

/** Dispatched on `window` by the conversation header's ZeChat button. */
export const TOGGLE_EVENT = 'zesignal:toggle-zechat';

const STYLE = `
body.zechat-open #app-container { width: calc(100% - var(--zechat-width, 420px)); }
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

export function mountZeChatHost(): void {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const toggle = () => drop(ipcRenderer.invoke('zechat:toggle'));
  window.addEventListener(TOGGLE_EVENT, toggle);
  document.addEventListener('keydown', event => {
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      toggle();
    }
  });

  ipcRenderer.on(
    'zechat:layout',
    (_event, { open, width }: { open: boolean; width: number }) => {
      document.body.style.setProperty('--zechat-width', `${width}px`);
      document.body.classList.toggle('zechat-open', open);
      // Signal sizes some views on resize: tell them the room changed.
      window.dispatchEvent(new Event('resize'));
    }
  );
  ipcRenderer.on('zechat:open', (_event, conversationId: string) => {
    window.reduxActions.conversations.showConversation({ conversationId });
  });
  ipcRenderer.on(
    'zechat:insert',
    (_event, { id, text }: { id: number; text: string }) => {
      drop(
        ipcRenderer.invoke('zechat:insert-result', id, insertInComposer(text))
      );
    }
  );

  // Keeps the main process told which conversation is open.
  let last: string | undefined;
  const report = () => {
    const id = getSelectedConversationId(window.reduxStore.getState());
    if (id !== last) {
      last = id;
      drop(ipcRenderer.invoke('zechat:view', id ?? null));
    }
  };
  report();
  window.reduxStore.subscribe(report);
}
