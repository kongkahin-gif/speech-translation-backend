/* Avatars: one cute body, many animals (ears, markings, mouth) and layered outfits (top + hat).
   avatarSVG({animal, outfit}, bust) returns an SVG string. Colours are fixed per animal; outlines follow the theme. */
const mir = s => s + `<g transform="translate(120 0) scale(-1 1)">${s}</g>`;
const O = 'class="ol"', O2 = 'class="ol thin"';
const ear = {
  round:(c, i = '#fff') => mir(`<circle cx="32" cy="29" r="12" fill="${c}" ${O}/><circle cx="32" cy="29" r="6" fill="${i}" opacity=".7"/>`),
  point:(c, i = '#fff') => mir(`<path d="M25 42 L27 8 L51 25 Z" fill="${c}" ${O}/><path d="M30 34 L31 17 L43 26 Z" fill="${i}" opacity=".7"/>`),
  long:(c, i = '#fff') => mir(`<ellipse cx="43" cy="12" rx="8" ry="21" transform="rotate(-10 43 12)" fill="${c}" ${O}/><ellipse cx="43" cy="14" rx="3.5" ry="13" transform="rotate(-10 43 14)" fill="${i}" opacity=".6"/>`),
  big:c => mir(`<ellipse cx="22" cy="54" rx="17" ry="23" fill="${c}" ${O}/><ellipse cx="24" cy="55" rx="9" ry="15" fill="#F6B8C8" opacity=".6"/>`),
  side:c => mir(`<ellipse cx="25" cy="46" rx="10" ry="6" transform="rotate(-20 25 46)" fill="${c}" ${O}/>`),
  horn:(w = 0) => mir(`<path d="M36 33 Q${14 - w} 31 ${17 - w} 9 Q${25 - w / 2} 23 42 25 Z" fill="#F4E8CF" ${O}/>`),
  spiral:() => mir(`<path d="M41 30 Q31 12 39 -12 Q46 8 51 26 Z" fill="#C9B28B" ${O}/><path d="M36 14 L45 12 M36 3 L43 1" ${O2} fill="none"/>`),
  lyre:() => mir(`<path d="M47 28 Q33 10 43 -8 Q39 8 47 16" fill="none" stroke="#4A3B32" stroke-width="5" stroke-linecap="round"/>`),
};
const muzzle = (c = '#fff', nose = '#3A2E39') => `<ellipse cx="60" cy="68" rx="15" ry="11" fill="${c}"/><ellipse cx="60" cy="62" rx="4.5" ry="3" fill="${nose}"/>`;
const smile = '<path d="M54 67 Q60 73 66 67" class="mouth"/>';
const beak = (c = '#F6B93B', hook) => `<path d="M51 61 Q60 57 69 61 L${hook ? '62 73 Q60 76 58 71' : '60 73'} Z" fill="${c}" ${O2} class="mouth"/>`;
const stripes = c => `<g fill="none" stroke="${c}" stroke-width="3.5" stroke-linecap="round"><path d="M60 24 v9 M50 26 l2 8 M70 26 l-2 8"/>${mir('<path d="M27 54 h8 M28 63 h7"/>')}</g>`;

const ANIMALS = {
  dove:{f:'#FFFFFF', ears:'', face:`<path d="M60 22 q-5 -12 3 -14 q-1 8 5 12" fill="#fff" ${O2}/>${beak('#F6A04D')}<path d="M66 66 q10 -4 16 2" fill="none" stroke="#5B9A5B" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="78" cy="63" rx="5" ry="2.5" fill="#86CFA0" ${O2} transform="rotate(-25 78 63)"/>`},
  dolphin:{f:'#F7B6C8', ears:`<path d="M52 26 Q58 2 74 8 Q66 14 68 26 Z" fill="#F7B6C8" ${O}/>`, face:`<ellipse cx="60" cy="70" rx="17" ry="9" fill="#FCE1E8" ${O2}/><path d="M50 70 Q60 76 70 70" class="mouth"/>`},
  panda:{f:'#FFFFFF', limb:'#2B2B3A', ears:ear.round('#2B2B3A', '#2B2B3A'), face:mir('<ellipse cx="47" cy="55" rx="10" ry="12" transform="rotate(18 47 55)" fill="#2B2B3A"/>') + '<ellipse cx="60" cy="64" rx="4" ry="2.8" fill="#2B2B3A"/>' + smile, glint:1},
  blackbear:{f:'#3A3645', belly:'#3A3645', ears:ear.round('#3A3645', '#6B6478'), face:muzzle('#D9C3A5') + smile, chest:'<path d="M44 92 Q60 108 76 92" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>', glint:1},
  bear:{f:'#A9764F', ears:ear.round('#A9764F', '#E9D2B8'), face:muzzle('#E9D2B8') + smile},
  shiba:{f:'#E8A55A', ears:ear.point('#E8A55A'), face:`<path d="M30 62 Q34 84 60 88 Q86 84 90 62 Q76 72 60 58 Q44 72 30 62 Z" fill="#fff"/><ellipse cx="60" cy="63" rx="4.5" ry="3" fill="#3A2E39"/>` + smile + mir('<ellipse cx="47" cy="45" rx="3" ry="2" fill="#fff"/>')},
  wolf:{f:'#9AA3B2', ears:ear.point('#9AA3B2', '#E3E6EC'), face:`<path d="M32 60 Q36 84 60 88 Q84 84 88 60 Q74 70 60 54 Q46 70 32 60 Z" fill="#F1F3F6"/><ellipse cx="60" cy="63" rx="4.5" ry="3" fill="#3A2E39"/>` + smile},
  tiger:{f:'#F6A04D', ears:ear.round('#F6A04D'), face:stripes('#3A2E39') + muzzle() + smile},
  jaguar:{f:'#F4C24F', ears:ear.round('#F4C24F'), face:'<g fill="none" stroke="#5A3E1B" stroke-width="2.5"><circle cx="38" cy="38" r="3"/><circle cx="60" cy="30" r="3"/><circle cx="82" cy="38" r="3"/><circle cx="31" cy="52" r="2.5"/><circle cx="89" cy="52" r="2.5"/><circle cx="48" cy="34" r="2"/><circle cx="72" cy="34" r="2"/></g>' + muzzle() + smile},
  lion:{f:'#F2C063', ears:`<circle cx="60" cy="56" r="43" fill="#B5651D" ${O} stroke-dasharray="14 5"/>` + ear.round('#F2C063', '#B5651D'), face:muzzle('#FBE9C8') + smile},
  bull:{f:'#7A5646', ears:ear.horn() + ear.side('#7A5646'), face:`<ellipse cx="60" cy="70" rx="18" ry="12" fill="#E8C9B0" ${O2}/><circle cx="54" cy="68" r="2" fill="#3A2E39"/><circle cx="66" cy="68" r="2" fill="#3A2E39"/><path d="M55 75 Q60 79 65 75" class="mouth"/>`, low:1},
  buffalo:{f:'#6F7684', ears:ear.horn(8) + ear.side('#6F7684'), face:`<ellipse cx="60" cy="70" rx="18" ry="12" fill="#B9BEC8" ${O2}/><circle cx="54" cy="68" r="2" fill="#3A2E39"/><circle cx="66" cy="68" r="2" fill="#3A2E39"/><path d="M55 75 Q60 79 65 75" class="mouth"/>`, low:1},
  markhor:{f:'#D8C3A5', ears:ear.spiral() + ear.side('#D8C3A5'), face:muzzle('#F4EADB') + smile + `<path d="M55 86 Q60 100 65 86 Z" fill="#F4EADB" ${O2}/>`},
  springbok:{f:'#D99A5B', ears:ear.lyre() + ear.side('#D99A5B'), face:'<path d="M50 24 Q60 40 52 62 Q60 84 68 62 Q60 40 70 24 Q60 20 50 24 Z" fill="#fff"/>' + mir('<path d="M36 60 Q44 66 50 76" fill="none" stroke="#7A4A2A" stroke-width="3" stroke-linecap="round"/>') + '<ellipse cx="60" cy="64" rx="4" ry="2.8" fill="#3A2E39"/>' + smile},
  kangaroo:{f:'#D9A066', ears:ear.long('#D9A066', '#F6D7B0'), face:muzzle('#F6E3C8') + smile},
  beaver:{f:'#8B5E3C', ears:mir(`<circle cx="33" cy="31" r="8" fill="#8B5E3C" ${O}/>`), face:muzzle('#D9B48C') + smile + `<rect x="56" y="71" width="8" height="8" rx="1.5" fill="#fff" ${O2}/><path d="M60 71 v8" ${O2}/>`},
  elephant:{f:'#A9B4C2', ears:ear.big('#A9B4C2'), face:`<path class="trunk ol" d="M53 62 Q51 90 60 92 Q69 90 67 62 Z" fill="#A9B4C2"/><path d="M55 72 h10 M55.5 80 h9" ${O2} fill="none" opacity=".5"/>`, nomouth:1},
  komodo:{f:'#8DB56B', belly:'#E6F0C8', ears:'<g fill="#6E9A50"><circle cx="46" cy="24" r="4"/><circle cx="60" cy="21" r="4.5"/><circle cx="74" cy="24" r="4"/></g>', face:mir('<circle cx="56" cy="63" r="1.4" fill="#3A2E39"/>') + '<path d="M50 68 Q60 75 70 68" class="mouth"/><path d="M60 72 v7 l-3 4 M60 79 l3 4" fill="none" stroke="#E86A8C" stroke-width="2.2" stroke-linecap="round"/>'},
  rooster:{f:'#FFF7E8', ears:`<path d="M46 26 Q44 8 54 14 Q56 2 64 12 Q72 4 74 26 Z" fill="#E0453A" ${O}/>`, face:beak() + `<path d="M56 73 Q60 86 64 73 Z" fill="#E0453A" ${O2}/>`},
  eagle:{f:'#8A5A36', ears:'<path d="M48 25 l4 -9 4 7 4 -9 4 9 4 -7 4 9 Z" fill="#8A5A36" class="ol"/>', face:mir('<path d="M40 46 l14 3" fill="none" stroke="#3A2E39" stroke-width="3" stroke-linecap="round"/>') + beak('#F6B93B', 1)},
  baldeagle:{f:'#6B4A32', head:'#FFFFFF', ears:'<path d="M48 25 l4 -9 4 7 4 -9 4 9 4 -7 4 9 Z" fill="#fff" class="ol"/>', face:mir('<path d="M40 46 l14 3" fill="none" stroke="#3A2E39" stroke-width="3" stroke-linecap="round"/>') + beak('#F6B93B', 1)},
  falcon:{f:'#7C8798', belly:'#F4EADB', ears:'', face:mir('<path d="M47 62 q-3 9 2 16" fill="none" stroke="#3A2E39" stroke-width="4" stroke-linecap="round"/>') + '<path d="M36 70 Q60 96 84 70 Q60 80 36 70 Z" fill="#F4EADB"/>' + beak('#F6B93B', 1)},
  kiwi:{f:'#9C6B4A', ears:'', face:`<path d="M56 60 Q60 58 64 60 L61 88 Q60 90 59 88 Z" fill="#F1D9A7" ${O2} class="mouth"/>`},
};

const TOPS = {
  robe:(a, b, extra) => `<rect x="26" y="74" width="68" height="52" fill="${a}"/><path d="M45 84 L60 104 L75 84" fill="none" stroke="${b}" stroke-width="5" stroke-linejoin="round"/>` +
    (extra === 'belt' ? `<rect x="26" y="106" width="68" height="8" fill="${b}"/>` : extra === 'bow' ? `<path d="M60 102 l-9 -5 v10 Z M60 102 l9 -5 v10 Z" fill="${b}" ${O2}/><path d="M58 104 v16 M62 104 v14" stroke="${b}" stroke-width="3.5" stroke-linecap="round"/>` : ''),
  tang:(a, b) => `<rect x="26" y="74" width="68" height="52" fill="${a}"/><path d="M47 88 Q60 97 73 88" fill="none" stroke="${b}" stroke-width="4.5"/><g stroke="${b}" stroke-width="3" stroke-linecap="round"><path d="M55 101 h10 M55 108 h10 M55 115 h10"/></g>`,
  sash:(a, b, c) => `<rect x="26" y="74" width="68" height="52" fill="${a}"/><path d="M30 86 L42 80 L92 114 L84 124 Z" fill="${b}"/><path d="M36 84 L88 119" stroke="${c}" stroke-width="2.5"/>`,
  plaidsash:(a, b) => `<path d="M30 86 L42 80 L92 114 L84 124 Z" fill="${a}"/><g stroke="${b}" stroke-width="2.5"><path d="M34 86 L88 121 M40 82 L92 116 M44 94 l8 -10 M58 103 l8 -10 M72 112 l8 -10"/></g>`,
  plaid:(a, b) => `<rect x="26" y="74" width="68" height="52" fill="${a}"/><g stroke="${b}" stroke-width="2.5" opacity=".85"><path d="M38 74 v52 M49 74 v52 M60 74 v52 M71 74 v52 M82 74 v52 M26 93 h68 M26 103 h68 M26 113 h68"/></g>`,
  stripes:(a, b) => `<rect x="26" y="74" width="68" height="52" fill="${a}"/><g stroke="${b}" stroke-width="3"><path d="M26 93 h68 M26 100 h68 M26 107 h68 M26 114 h68 M26 121 h68"/></g>`,
  dots:(a, b) => `<rect x="26" y="74" width="68" height="52" fill="${a}"/><g fill="${b}">${[[40, 96], [52, 104], [64, 96], [76, 104], [46, 114], [60, 112], [74, 116], [34, 106], [86, 96]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6"/>`).join('')}</g><path d="M60 90 v36" stroke="${b}" stroke-width="2"/>`,
  placket:(a, b) => `<rect x="26" y="74" width="68" height="52" fill="${a}"/><rect x="55" y="84" width="10" height="28" fill="${b}"/><g fill="${a}"><circle cx="60" cy="96" r="1.6"/><circle cx="60" cy="103" r="1.6"/><circle cx="60" cy="110" r="1.6"/></g>`,
  vest:(a, b) => mir(`<path d="M26 80 H52 L56 124 H26 Z" fill="${a}"/><path d="M52 84 L56 122" stroke="${b}" stroke-width="3"/>`),
  braces:(a, b) => `<rect x="26" y="74" width="68" height="52" fill="${b}"/>` + mir(`<rect x="43" y="80" width="6" height="44" fill="${a}"/>`) + `<rect x="43" y="98" width="34" height="6" fill="${a}"/>`,
  belt:a => `<rect x="26" y="106" width="68" height="9" fill="${a}"/><rect x="66" y="112" width="7" height="14" fill="${a}"/>`,
  scarf:(a, pat) => `<path d="M34 86 Q60 104 86 86 L88 95 Q60 114 32 95 Z" fill="${a}" ${O2}/><path d="M66 100 l10 -3 l4 20 l-9 3 Z" fill="${a}" ${O2}/>` + (pat ? '<g fill="#F6C453"><circle cx="46" cy="96" r="2"/><circle cx="60" cy="101" r="2"/><circle cx="74" cy="96" r="2"/></g>' : ''),
  beads:(a, b, c) => [[a, 0], [b, 5], [c, 10]].map(([col, d]) => `<path d="M${36 + d} ${88 + d / 2} Q60 ${106 + d * 1.3} ${84 - d} ${88 + d / 2}" fill="none" stroke="${col}" stroke-width="4" stroke-dasharray="1 5.5" stroke-linecap="round"/>`).join(''),
  pendant:a => `<path d="M42 88 Q60 104 78 88" fill="none" stroke="#3A2E39" stroke-width="1.8"/><path d="M60 98 q-6 8 0 14 q6 -6 0 -14 Z" fill="${a}" ${O2}/>`,
  sarape:() => ['#C8353B', '#F6C453', '#2E9E5B', '#3A7BD5', '#C8353B', '#F6C453'].map((c, i) => `<rect x="${38 + i * 7.4}" y="74" width="7.6" height="52" fill="${c}"/>`).join(''),
  rainbow:() => ['#E86A6A', '#F6A04D', '#F6C453', '#86CFA0', '#7FC3E6', '#A99CF0'].map((c, i) => `<path d="M${30 + i * 2} ${88 + i * 5} Q60 ${102 + i * 5} ${90 - i * 2} ${88 + i * 5}" fill="none" stroke="${c}" stroke-width="5.5"/>`).join(''),
};
const HATS = {
  wreath:() => mir('<g fill="#86CFA0" class="ol thin"><ellipse cx="34" cy="34" rx="7" ry="3.5" transform="rotate(-50 34 34)"/><ellipse cx="43" cy="26" rx="7" ry="3.5" transform="rotate(-25 43 26)"/><ellipse cx="54" cy="22" rx="7" ry="3.5" transform="rotate(-8 54 22)"/></g>'),
  flower:() => `<g transform="translate(84 30)"><g fill="#FF8DB4" ${O2}><circle cx="0" cy="-6" r="4.5"/><circle cx="6" cy="-2" r="4.5"/><circle cx="4" cy="5" r="4.5"/><circle cx="-4" cy="5" r="4.5"/><circle cx="-6" cy="-2" r="4.5"/></g><circle r="3.2" fill="#F6C453"/></g>`,
  bindi:() => '<circle cx="60" cy="40" r="2.8" fill="#C2185B"/>',
  kufi:() => `<path d="M38 28 Q38 10 60 10 Q82 10 82 28 Z" fill="#F4EFE4" ${O}/><path d="M39 23 h42" stroke="#C8353B" stroke-width="3" stroke-dasharray="4 3"/>`,
  peci:() => `<path d="M38 30 L41 8 Q60 3 79 8 L82 30 Q60 24 38 30 Z" fill="#2B2B3A" ${O}/>`,
  chada:() => `<path d="M40 28 Q60 18 80 28 L74 16 L66 18 L60 -10 L54 18 L46 16 Z" fill="#E6B94B" ${O}/><circle cx="60" cy="20" r="2.5" fill="#C8353B"/>`,
  conical:() => `<path d="M8 34 L60 -8 L112 34 Q60 22 8 34 Z" fill="#E9D5A1" ${O}/><path d="M34 14 Q60 8 86 14 M22 24 Q60 14 98 24" fill="none" stroke="#B89B5E" stroke-width="1.8"/>`,
  salakot:() => `<path d="M10 34 Q60 -22 110 34 Q60 22 10 34 Z" fill="#C9A66B" ${O}/><circle cx="60" cy="4" r="4" fill="#8A5A36" ${O2}/>`,
  keffiyeh:() => `<path d="M24 52 Q20 12 60 12 Q100 12 96 52 L103 88 Q91 80 90 58 Q86 28 60 27 Q34 28 30 58 Q29 80 17 88 Z" fill="#fff" ${O}/><path d="M29 30 Q60 15 91 30" fill="none" stroke="#2B2B3A" stroke-width="5" stroke-linecap="round"/>`,
  fez:() => `<path d="M43 28 L48 2 H72 L77 28 Q60 22 43 28 Z" fill="#C8353B" ${O}/><path d="M60 2 Q74 4 78 18" fill="none" stroke="#2B2B3A" stroke-width="2.2"/><circle cx="78" cy="20" r="2.8" fill="#2B2B3A"/>`,
  tam:() => `<ellipse cx="58" cy="19" rx="30" ry="12" fill="#1F3C6E" ${O} transform="rotate(-8 58 19)"/><path d="M34 22 h48 M58 8 v22" stroke="#B8292F" stroke-width="2.5" transform="rotate(-8 58 19)"/><circle cx="56" cy="6" r="5" fill="#B8292F" ${O2}/>`,
  beret:() => `<ellipse cx="56" cy="20" rx="30" ry="11" fill="#1F3C6E" ${O} transform="rotate(-10 56 20)"/><path d="M54 8 l2 -7" ${O} fill="none" stroke-linecap="round"/>`,
  cordobes:() => `<ellipse cx="60" cy="26" rx="42" ry="7" fill="#2B2B3A" ${O}/><path d="M40 25 V10 H80 V25 Z" fill="#2B2B3A" ${O}/><rect x="40" y="18" width="40" height="5" fill="#C8353B"/>`,
  alpine:() => `<path d="M30 30 Q60 22 90 30 Q94 34 86 34 Q60 26 34 34 Q26 34 30 30 Z" fill="#4C6B3C" ${O}/><path d="M40 27 Q44 4 60 4 Q76 4 80 27 Q60 21 40 27 Z" fill="#5B7B4A" ${O}/><path d="M76 18 q8 -16 3 -24 q-7 8 -7 20 Z" fill="#F4EFE4" ${O2}/>`,
  ushanka:() => `<path d="M30 34 Q30 4 60 4 Q90 4 90 34 Q60 26 30 34 Z" fill="#8B6B4F" ${O}/><path d="M36 30 Q60 20 84 30 L84 18 Q60 10 36 18 Z" fill="#E9D8C2" ${O2}/>` + mir(`<path d="M22 34 Q20 56 30 66 Q36 54 34 34 Z" fill="#E9D8C2" ${O}/>`),
  cowboy:() => `<path d="M6 30 Q26 40 40 28 Q60 20 80 28 Q94 40 114 30 Q96 22 86 24 Q60 16 34 24 Q24 22 6 30 Z" fill="#B98A5A" ${O}/><path d="M38 26 Q38 0 52 4 Q60 10 68 4 Q82 0 82 26 Q60 19 38 26 Z" fill="#C9A06E" ${O}/><path d="M39 22 Q60 15 81 22" fill="none" stroke="#5A3E1B" stroke-width="3"/>`,
  akubra:() => `<ellipse cx="60" cy="28" rx="48" ry="8" fill="#B79B74" ${O}/><path d="M38 27 Q38 6 60 6 Q82 6 82 27 Q60 20 38 27 Z" fill="#C9AE86" ${O}/><path d="M39 22 Q60 15 81 22" fill="none" stroke="#5A3E1B" stroke-width="3"/>`,
  toque:() => `<path d="M32 32 Q30 2 60 2 Q90 2 88 32 Q60 24 32 32 Z" fill="#C8353B" ${O}/><path d="M32 33 Q60 24 88 33 L88 25 Q60 16 32 25 Z" fill="#fff" ${O2}/><circle cx="60" cy="0" r="6" fill="#fff" ${O2}/>`,
  sombrero:() => `<ellipse cx="60" cy="28" rx="56" ry="10" fill="#E9C46A" ${O}/><path d="M42 27 Q46 -8 60 -8 Q74 -8 78 27 Q60 20 42 27 Z" fill="#E9C46A" ${O}/><path d="M44 20 Q60 14 76 20" fill="none" stroke="#C8353B" stroke-width="4"/><path d="M12 28 Q60 40 108 28" fill="none" stroke="#2E9E5B" stroke-width="2.5" stroke-dasharray="5 4"/>`,
  turban:() => `<path d="M30 32 Q26 4 60 4 Q94 4 90 32 Q60 22 30 32 Z" fill="#fff" ${O}/><path d="M36 22 Q60 6 86 20 M34 28 Q56 14 78 10" fill="none" stroke="#C9CBD6" stroke-width="2"/>`,
  headband:() => `<path d="M28 40 Q60 22 92 40" fill="none" stroke="#C8353B" stroke-width="6"/><path d="M28 40 Q60 22 92 40" fill="none" stroke="#F6C453" stroke-width="6" stroke-dasharray="3 7"/>`,
  headphones:() => `<path d="M24 56 Q22 12 60 12 Q98 12 96 56" fill="none" stroke="#3A3645" stroke-width="6" stroke-linecap="round"/>` + mir(`<rect x="15" y="46" width="13" height="22" rx="6" fill="#A99CF0" ${O}/>`),
  straw:() => `<ellipse cx="60" cy="28" rx="46" ry="8" fill="#E9D5A1" ${O}/><path d="M40 27 Q40 6 60 6 Q80 6 80 27 Q60 20 40 27 Z" fill="#F1E2B6" ${O}/><path d="M41 21 Q60 14 79 21" fill="none" stroke="#86CFA0" stroke-width="4"/>`,
  crown:() => [[32, 34, '#FF8DB4'], [42, 26, '#F6C453'], [54, 21, '#A3D9F4'], [66, 21, '#FF8DB4'], [78, 26, '#CFC7F5'], [88, 34, '#F6C453']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="5.5" fill="${c}" ${O2}/><circle cx="${x}" cy="${y}" r="1.8" fill="#fff"/>`).join(''),
};

let avSeq = 0;
function avatarSVG(spec = {}, bust){
  const a = ANIMALS[spec.animal] || ANIMALS.bear, o = (typeof OUTFITS !== 'undefined' && OUTFITS[spec.outfit]) || {}, id = 'avc' + (++avSeq);
  const limb = a.limb || a.f, top = o.top ? TOPS[o.top[0]](...o.top.slice(1)) : '', hat = o.hat ? HATS[o.hat]() : '';
  const eyes = spec.empty ? '' : `<circle cx="48" cy="55" r="5.5" class="eye"/><circle cx="72" cy="55" r="5.5" class="eye"/><circle cx="49.8" cy="53" r="${a.glint ? 2.4 : 1.8}" class="glint"/><circle cx="73.8" cy="53" r="${a.glint ? 2.4 : 1.8}" class="glint"/>`;
  return `<svg viewBox="${bust ? '4 -18 112 116' : '-2 -24 124 160'}" aria-hidden="true"${spec.empty ? ' class="empty-seat"' : ''}>
<defs><clipPath id="${id}"><ellipse cx="60" cy="99" rx="30" ry="24"/></clipPath></defs>
<ellipse cx="60" cy="126" rx="34" ry="5" class="shadow"/>
<ellipse cx="46" cy="121" rx="10" ry="6" fill="${limb}" ${O}/><ellipse cx="74" cy="121" rx="10" ry="6" fill="${limb}" ${O}/>
<ellipse cx="60" cy="99" rx="30" ry="24" fill="${a.f}" ${O}/><ellipse cx="60" cy="103" rx="17" ry="14" fill="${a.belly || '#fff'}" opacity=".75"/>${a.chest || ''}
<g clip-path="url(#${id})">${top}</g><ellipse cx="60" cy="99" rx="30" ry="24" fill="none" ${O}/>
<ellipse cx="34" cy="97" rx="8" ry="12" fill="${limb}" ${O}/><g class="arm"><ellipse cx="86" cy="97" rx="8" ry="12" fill="${limb}" ${O}/></g>
<g class="head">${a.ears}<circle cx="60" cy="56" r="34" fill="${a.head || a.f}" ${O}/>${a.face}
${eyes}<ellipse cx="38" cy="${a.low ? 60 : 66}" rx="6" ry="3.5" class="blush"/><ellipse cx="82" cy="${a.low ? 60 : 66}" rx="6" ry="3.5" class="blush"/>${hat}</g></svg>`;
}
