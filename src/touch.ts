// On-screen controls for phones and tablets: a d-pad and buttons below the screen, for player 1.
import type { Action } from './game';

export interface TouchButton {
  id: string;
  label: string;
  a: Action;
  typed?: string;
}

const ROWS: TouchButton[][] = [
  [
    { id: 'music', label: '♪', a: 'mute' },
    { id: 'up', label: '▲', a: 'up' },
    { id: 'start', label: 'START', a: 'start', typed: 'Enter' },
    { id: 'act', label: 'ACT', a: 'act' },
  ],
  [
    { id: 'left', label: '◀', a: 'left' },
    { id: 'down', label: '▼', a: 'down' },
    { id: 'right', label: '▶', a: 'right' },
    { id: 'bomb', label: 'BOMB', a: 'bomb' },
  ],
];

export interface TouchPanel {
  el: HTMLElement;
  update(musicOn: boolean): void;
}

/** Builds the touch panel on touch devices; returns it, or null elsewhere. */
export function setupTouch(onButton: (b: TouchButton, down: boolean) => void): TouchPanel | null {
  if (!matchMedia('(pointer: coarse)').matches) return null;
  const panel = document.createElement('div');
  panel.id = 'touch';
  let musicEl: HTMLButtonElement | null = null;

  for (const row of ROWS) {
    const r = document.createElement('div');
    r.className = 'row';
    for (const b of row) {
      const el = document.createElement('button');
      el.textContent = b.label;
      const release = () => {
        el.classList.remove('on');
        onButton(b, false);
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add('on');
        onButton(b, true);
      });
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      if (b.id === 'music') musicEl = el;
      r.appendChild(el);
    }
    panel.appendChild(r);
  }
  document.body.appendChild(panel);
  document.body.classList.add('has-touch');

  let last: boolean | null = null;
  return {
    el: panel,
    update(musicOn) {
      if (musicOn === last || !musicEl) return;
      last = musicOn;
      musicEl.textContent = musicOn ? '♪' : '♪ OFF';
      musicEl.classList.toggle('off', !musicOn);
    },
  };
}
