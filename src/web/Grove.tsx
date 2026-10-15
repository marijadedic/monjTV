export function GroveFrame() {
  return (
    <>
      <svg class="grove-sprite" aria-hidden="true">
        <defs>
          <g id="rose-red">
            <ellipse cx="0" cy="-8" rx="6.5" ry="9" fill="#a83240" />
            <ellipse cx="7" cy="-2" rx="6.5" ry="9" fill="#c23b4a" transform="rotate(72)" />
            <ellipse cx="4" cy="7" rx="6.5" ry="9" fill="#d64545" transform="rotate(144)" />
            <ellipse cx="-5" cy="6" rx="6.5" ry="9" fill="#b43340" transform="rotate(216)" />
            <ellipse cx="-7" cy="-3" rx="6.5" ry="9" fill="#e07a86" transform="rotate(288)" />
            <circle r="3.4" fill="#f2d56b" />
          </g>
          <g id="rose-pink">
            <ellipse cx="0" cy="-7" rx="5.5" ry="8" fill="#d45b86" />
            <ellipse cx="6" cy="-1" rx="5.5" ry="8" fill="#f0a0c4" transform="rotate(70)" />
            <ellipse cx="3" cy="6" rx="5.5" ry="8" fill="#e07aa0" transform="rotate(150)" />
            <ellipse cx="-4" cy="5" rx="5.5" ry="8" fill="#c44b78" transform="rotate(220)" />
            <ellipse cx="-6" cy="-2" rx="5.5" ry="8" fill="#f2b6cc" transform="rotate(290)" />
            <circle r="2.8" fill="#fff4c8" />
          </g>
          <g id="daisy">
            <g fill="#fff8e4">
              <ellipse cx="0" cy="-8" rx="3" ry="6" />
              <ellipse cx="6" cy="-5" rx="3" ry="6" transform="rotate(45)" />
              <ellipse cx="8" cy="2" rx="3" ry="6" transform="rotate(90)" />
              <ellipse cx="5" cy="7" rx="3" ry="6" transform="rotate(135)" />
              <ellipse cx="-1" cy="8" rx="3" ry="6" transform="rotate(180)" />
              <ellipse cx="-7" cy="4" rx="3" ry="6" transform="rotate(225)" />
              <ellipse cx="-8" cy="-3" rx="3" ry="6" transform="rotate(270)" />
              <ellipse cx="-4" cy="-8" rx="3" ry="6" transform="rotate(315)" />
            </g>
            <circle r="3.2" fill="#e2b657" />
          </g>
          <g id="bluebell">
            <path d="M0 22 C2 8 1 -2 0 -18" stroke="#3f6b32" strokeWidth="1.6" fill="none" />
            <path d="M0 -4 Q-6 2 -3 9 Q0 3 0 -4" fill="#5b6ec4" />
            <path d="M1 4 Q7 9 3 16 Q0 10 1 4" fill="#7eb6e8" />
            <path d="M0 12 Q-5 18 -1 23 Q3 17 0 12" fill="#6a7fd4" />
          </g>
          <g id="leaf">
            <ellipse rx="16" ry="6" fill="#2f6a3e" />
            <path d="M-14 0 H14" stroke="#1f4e30" strokeWidth="0.7" />
          </g>
        </defs>
      </svg>
      <svg class="grove-scene" viewBox="0 0 1200 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="1200" height="720" fill="#f6f1dc" />
        <rect x="86" y="64" width="1028" height="592" rx="36" fill="#e7f3c8" />
        <path d="M18 10 C70 30 28 90 62 140 C24 200 78 250 36 320 C80 390 22 460 58 530 C20 600 70 660 24 710" fill="none" stroke="#2f6a3e" strokeWidth="7" />
        <path d="M36 24 C90 8 70 80 110 70 C60 130 120 160 80 220" fill="none" stroke="#3f7a48" strokeWidth="3" />
        <path d="M1182 10 C1130 36 1172 100 1138 150 C1176 210 1122 270 1164 340 C1120 410 1178 480 1142 550 C1180 620 1130 680 1176 710" fill="none" stroke="#2f6a3e" strokeWidth="7" />
        <path d="M1164 30 C1110 16 1140 90 1090 78 C1150 140 1080 180 1120 230" fill="none" stroke="#3f7a48" strokeWidth="3" />
        <path d="M30 22 C160 6 240 46 360 16 C500 48 620 8 760 30 C920 6 1040 42 1170 14" fill="none" stroke="#2f6a3e" strokeWidth="6" />
        <path d="M28 698 C180 712 300 676 460 706 C640 674 780 714 960 688 C1080 712 1140 680 1172 702" fill="none" stroke="#2f6a3e" strokeWidth="6" />
        <g fill="#3f7a48">
          <use href="#leaf" transform="translate(48 70) rotate(-40)" />
          <use href="#leaf" transform="translate(34 130) rotate(25) scale(0.8)" />
          <use href="#leaf" transform="translate(58 190) rotate(-20)" />
          <use href="#leaf" transform="translate(30 250) rotate(35) scale(0.85)" />
          <use href="#leaf" transform="translate(62 330) rotate(-30)" />
          <use href="#leaf" transform="translate(28 410) rotate(18)" />
          <use href="#leaf" transform="translate(56 490) rotate(-42) scale(0.9)" />
          <use href="#leaf" transform="translate(36 560) rotate(28)" />
          <use href="#leaf" transform="translate(50 640) rotate(-15) scale(0.8)" />
          <use href="#leaf" transform="translate(1152 80) rotate(36)" />
          <use href="#leaf" transform="translate(1168 150) rotate(-22) scale(0.85)" />
          <use href="#leaf" transform="translate(1140 220) rotate(30)" />
          <use href="#leaf" transform="translate(1170 300) rotate(-28)" />
          <use href="#leaf" transform="translate(1144 380) rotate(20) scale(0.9)" />
          <use href="#leaf" transform="translate(1166 470) rotate(-36)" />
          <use href="#leaf" transform="translate(1148 550) rotate(16)" />
          <use href="#leaf" transform="translate(1164 630) rotate(-24) scale(0.85)" />
          <use href="#leaf" transform="translate(140 28) rotate(-8) scale(0.7)" />
          <use href="#leaf" transform="translate(280 18) rotate(12) scale(0.75)" />
          <use href="#leaf" transform="translate(460 34) rotate(-14) scale(0.7)" />
          <use href="#leaf" transform="translate(700 16) rotate(10) scale(0.75)" />
          <use href="#leaf" transform="translate(900 30) rotate(-8) scale(0.7)" />
          <use href="#leaf" transform="translate(1060 18) rotate(16) scale(0.75)" />
          <use href="#leaf" transform="translate(180 694) rotate(8) scale(0.7)" />
          <use href="#leaf" transform="translate(400 706) rotate(-12) scale(0.75)" />
          <use href="#leaf" transform="translate(640 690) rotate(6) scale(0.7)" />
          <use href="#leaf" transform="translate(860 704) rotate(-10) scale(0.75)" />
          <use href="#leaf" transform="translate(1040 692) rotate(12) scale(0.7)" />
        </g>
        <g>
          <use href="#rose-red" transform="translate(42 100)" />
          <use href="#rose-pink" transform="translate(56 188) scale(0.85)" />
          <use href="#rose-red" transform="translate(34 290) scale(1.05)" />
          <use href="#rose-pink" transform="translate(60 390)" />
          <use href="#rose-red" transform="translate(38 500) scale(0.9)" />
          <use href="#rose-pink" transform="translate(52 600)" />
          <use href="#rose-red" transform="translate(40 680) scale(0.8)" />
          <use href="#rose-red" transform="translate(1158 110)" />
          <use href="#rose-pink" transform="translate(1144 200) scale(0.9)" />
          <use href="#rose-red" transform="translate(1166 300)" />
          <use href="#rose-pink" transform="translate(1148 410) scale(0.85)" />
          <use href="#rose-red" transform="translate(1162 520)" />
          <use href="#rose-pink" transform="translate(1146 620) scale(0.9)" />
          <use href="#rose-red" transform="translate(180 36) scale(0.75)" />
          <use href="#rose-pink" transform="translate(340 24) scale(0.7)" />
          <use href="#rose-red" transform="translate(560 38) scale(0.72)" />
          <use href="#rose-pink" transform="translate(780 22) scale(0.7)" />
          <use href="#rose-red" transform="translate(980 34) scale(0.75)" />
          <use href="#rose-pink" transform="translate(220 688) scale(0.72)" />
          <use href="#rose-red" transform="translate(480 700) scale(0.7)" />
          <use href="#rose-pink" transform="translate(740 686) scale(0.75)" />
          <use href="#rose-red" transform="translate(980 698) scale(0.7)" />
        </g>
        <g>
          <use href="#daisy" transform="translate(100 48) scale(0.7)" />
          <use href="#daisy" transform="translate(250 40) scale(0.65)" />
          <use href="#daisy" transform="translate(430 50) scale(0.7)" />
          <use href="#daisy" transform="translate(660 36) scale(0.62)" />
          <use href="#daisy" transform="translate(880 48) scale(0.7)" />
          <use href="#daisy" transform="translate(1080 40) scale(0.65)" />
          <use href="#daisy" transform="translate(120 682) scale(0.65)" />
          <use href="#daisy" transform="translate(320 694) scale(0.7)" />
          <use href="#daisy" transform="translate(560 680) scale(0.62)" />
          <use href="#daisy" transform="translate(820 696) scale(0.7)" />
          <use href="#daisy" transform="translate(1060 684) scale(0.65)" />
          <use href="#bluebell" transform="translate(78 150) scale(0.8)" />
          <use href="#bluebell" transform="translate(70 360) scale(0.75)" />
          <use href="#bluebell" transform="translate(82 540) scale(0.8)" />
          <use href="#bluebell" transform="translate(1124 170) scale(0.8)" />
          <use href="#bluebell" transform="translate(1132 380) scale(0.75)" />
          <use href="#bluebell" transform="translate(1118 560) scale(0.8)" />
        </g>
      </svg>
    </>
  );
}
