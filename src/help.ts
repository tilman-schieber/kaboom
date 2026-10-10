// In-game help pages. Text uses only characters the pixel font has.

export interface HelpPage {
  title: string;
  /** Paragraphs, word-wrapped when drawn; '' adds a blank line. */
  text: string[];
}

export const HELP_PAGES: HelpPage[] = [
  {
    title: 'KABOOM',
    text: [
      'LAY BOMBS, BREAK THE BLOCKS, CATCH YOUR RIVALS IN THE BLAST. THE LAST BOMBER STANDING WINS THE ROUND.',
      '',
      'A BOMB GOES OFF AFTER A MOMENT IN A CROSS OF FLAME. FLAMES SET OFF OTHER BOMBS AND BURN YOU TOO - GET OUT OF THE WAY.',
      '',
      'WHEN THE CLOCK RUNS OUT: HURRY UP! THE WALLS CLOSE IN.',
    ],
  },
  {
    title: 'ARCADE AND BATTLE',
    text: [
      'ARCADE: YOU AGAINST THREE CPU BOMBERS. WIN TWO ROUNDS TO TAKE THE MATCH, THEN ON TO THE NEXT ARENA, WHERE THEY ARE SHARPER. LOSE A MATCH AND IT IS OVER.',
      '',
      'POINTS FOR BLOCKS, POWER-UPS, RIVALS AND ROUNDS. EACH LEVEL HAS ITS OWN HIGH SCORES.',
      '',
      'BATTLE: UP TO FOUR PLAYERS AND CPUS, ANY ARENA, AS MANY WINS AS YOU LIKE.',
    ],
  },
  {
    title: 'POWER-UPS',
    text: [
      'BLOCKS HIDE POWER-UPS. FLAMES BURN THEM.',
      '',
      'BOMB    ONE MORE BOMB AT A TIME',
      'FIRE    LONGER FLAMES',
      'SKATE   FASTER',
      'BOOT    WALK INTO A BOMB: KICK IT',
      'GLOVE   ACT THROWS A BOMB',
      'REMOTE  ACT SETS YOUR BOMBS OFF',
      'PIERCE  FLAMES GO THROUGH BLOCKS',
      'GOLD    FULL FIRE',
      '',
      'FALL AND YOUR POWER-UPS SCATTER.',
    ],
  },
  {
    title: 'THE SKULL',
    text: [
      'A CURSE FOR TEN SECONDS: SLOW, FAST, REVERSED, BOMBS DROPPING ON THEIR OWN, NO BOMBS AT ALL, OR SHORT FUSES.',
      '',
      'TOUCH ANOTHER BOMBER AND THEY CATCH IT TOO.',
      '',
      'TEMPLE: WARP HOLES TAKE YOU ACROSS. FACTORY: BELTS CARRY YOU AND YOUR BOMBS.',
    ],
  },
  {
    title: 'CONTROLS',
    text: [
      'ARROWS OR WASD   MOVE',
      'SPACE Z J        BOMB',
      'X SHIFT K        ACT',
      'ENTER ESC        PAUSE',
      'BACKSPACE        QUIT (PAUSED)',
      'M                MUSIC',
      '',
      'GAMEPAD: STICK OR D-PAD MOVE, A BOMB, B ACT, START PAUSE, SELECT QUIT (PAUSED).',
    ],
  },
  {
    title: 'MORE PLAYERS',
    text: [
      '1P   W A S D, SPACE BOMB, L-SHIFT ACT',
      '2P   ARROWS, . BOMB, - ACT',
      '',
      'GAMEPADS TAKE THE PLAYERS THE KEYBOARD CANNOT: WITH ONE PAD AND TWO PLAYERS THE PAD IS 2P. FOUR PLAYERS NEED AT LEAST TWO PADS.',
    ],
  },
];

export function wrapText(paragraphs: string[], width: number) {
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (!para) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(' ')) {
      if (line && line.length + 1 + word.length > width) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  }
  return lines;
}
