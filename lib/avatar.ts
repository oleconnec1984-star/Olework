export type LegacyAvatar = {
  face: string;
  skin: string;
  eyes: string;
  hair: string;
  glasses: string;
  mouth: string;
  hat: string;
  background: string;
};
export type AvatarV2 = LegacyAvatar & {
  version: 2;
  hairColor: string;
  top: string;
  topColor: string;
  bottom: string;
  bottomColor: string;
  shoes: string;
  shoeColor: string;
  headphones: string;
  earrings: string;
  frame: string;
  eyeColor: string;
  brow: string;
  browColor: string;
  facialHair: string;
  facialHairColor: string;
};
export type AvatarV3 = {
  version: 3;
  presetId: string;
};
export type AvatarConfig = LegacyAvatar | AvatarV2 | AvatarV3;
export const presetAvatars = [
  "จอมเวทสายฟ้า", "อัศวินจิ๋ว", "กัปตันโจรสลัด", "นักธนูพงไพร", "นินจาเงา",
  "นักประดิษฐ์", "นักเดินทางทะเลทราย", "พ่อครัวหลวง", "นักบินอวกาศ", "นักดนตรีพเนจร",
  "แม่มดน้ำแข็ง", "นักรบไวกิ้ง", "หมอหน้ากาก", "ซามูไรแดง", "นักบินสตีมพังก์",
  "นักปรุงยา", "จอมยุทธ์", "นักล่าแวมไพร์", "เจ้าหญิงคริสตัล", "นักมวยหน้ากาก",
  "แมวจอมโจร", "คอร์กี้พาลาดิน", "จิ้งจอกจอมเวท", "หมีช่างตีเหล็ก", "กระต่ายสายลับ",
  "เจ้าชายกบ", "เพนกวินกะลาสี", "นกฮูกบรรณารักษ์", "จระเข้พ่อค้า", "คาปิบาร่านักบวช",
  "แรคคูนนักล่าสมบัติ", "แพนด้าจอมยุทธ์", "เรดแพนด้าดรูอิด", "ฉลามโจรสลัด", "หนูวิศวกร",
  "หมูป่านักรบ", "แอกโซลอเติลฮีลเลอร์", "ช้างองครักษ์", "ไก่มือปืน", "เต่านักสำรวจ",
  "มังกรน้อย", "สไลม์ยิ้ม", "ไซคลอปส์", "เห็ดเดินได้", "กระบองเพชรจิ๋ว",
  "ผีน้อย", "เอเลี่ยนสามตา", "เยติขนฟู", "โครงกระดูกนักดาบ", "หีบสมบัติมีชีวิต",
].map((name, index) => ({ id: `avatar-${String(index + 1).padStart(2, "0")}`, name }));
export const defaultPresetAvatar: AvatarV3 = { version: 3, presetId: "avatar-01" };
const presetIds = new Set(presetAvatars.map((avatar) => avatar.id));
export function isPresetAvatar(value: unknown): value is AvatarV3 {
  return !!value && typeof value === "object" && (value as AvatarV3).version === 3 &&
    typeof (value as AvatarV3).presetId === "string" && presetIds.has((value as AvatarV3).presetId);
}
export function validateAvatarV3(value: unknown): asserts value is AvatarV3 {
  if (!isPresetAvatar(value) || Object.keys(value as object).some((key) => !["version", "presetId"].includes(key)))
    throw new Error("กรุณาเลือกตัวละครสำเร็จรูปที่มีอยู่ในระบบ");
}
export function normalizePresetAvatar(input?: AvatarConfig | null): AvatarV3 {
  if (isPresetAvatar(input)) return { version: 3, presetId: input.presetId };
  if (!input) return { ...defaultPresetAvatar };
  const source = JSON.stringify(input);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return { version: 3, presetId: presetAvatars[Math.abs(hash) % presetAvatars.length].id };
}
export type AvatarKey = Exclude<keyof AvatarV2, "version">;
export type AvatarOption = { id: string; name: string };
const options = (values: string[][]): AvatarOption[] =>
  values.map(([id, name]) => ({ id, name }));
export const avatarOptions = {
  face: options([
    ["round", "แก้มกลม"],
    ["square", "เหลี่ยมนุ่ม"],
    ["oval", "หน้ายาว"],
    ["heart", "คางเรียว"],
  ]),
  skin: options([
    ["#F8DCC4", "ขาวอมชมพู"],
    ["#EFC5A0", "ขาวอุ่น"],
    ["#DEAB7C", "น้ำผึ้งอ่อน"],
    ["#C89063", "น้ำผึ้ง"],
    ["#B57950", "แทนทอง"],
    ["#955D3F", "น้ำตาล"],
    ["#74432F", "น้ำตาลเข้ม"],
    ["#512F26", "เข้มลึก"],
  ]),
  eyes: options([["normal", "ดวงตาพิกเซล"]]),
  eyeColor: options([
    ["#282421", "ดำธรรมชาติ"],
    ["#60412E", "น้ำตาลเข้ม"],
    ["#3F6B8A", "ฟ้า"],
    ["#47704B", "เขียว"],
    ["#76598C", "ม่วง"],
    ["#9A5A36", "น้ำตาลอ่อน"],
  ]),
  brow: options([
    ["natural", "ธรรมชาติ"],
    ["straight", "ทรงตรง"],
    ["arched", "โค้ง"],
    ["thick", "หนา"],
  ]),
  browColor: options([
    ["#342C32", "ดำธรรมชาติ"],
    ["#60412E", "น้ำตาลเข้ม"],
    ["#A36640", "คาราเมล"],
    ["#EBC45E", "บลอนด์"],
    ["#CF663A", "ส้มอิฐ"],
    ["#D7D7CD", "เงิน"],
  ]),
  mouth: options([
    ["smile", "ยิ้มเล็ก"],
    ["happy", "ยิ้มเปิด"],
    ["neutral", "ปากตรง"],
    ["surprised", "ปากกลม"],
  ]),
  facialHair: options([
    ["none", "ไม่ไว้หนวด"],
    ["thin", "หนวดบาง"],
    ["classic", "หนวดคลาสสิก"],
    ["handlebar", "หนวดโง้ง"],
    ["thick", "หนวดหนา"],
    ["goatee", "เคราแพะ"],
    ["shortBeard", "เคราสั้น"],
    ["fullBeard", "เคราเต็ม"],
    ["combo", "หนวดและเคราแพะ"],
  ]),
  facialHairColor: options([
    ["#342C32", "ดำธรรมชาติ"],
    ["#60412E", "น้ำตาลเข้ม"],
    ["#A36640", "คาราเมล"],
    ["#EBC45E", "บลอนด์"],
    ["#CF663A", "ส้มอิฐ"],
    ["#D7D7CD", "เงิน"],
  ]),
  hair: options([
    ["crop", "สั้นคลาสสิก"],
    ["middle", "แสกกลาง"],
    ["side", "แสกข้าง"],
    ["fade", "รองทรง"],
    ["spike", "ผมตั้ง"],
    ["bob", "บ๊อบ"],
    ["long", "ยาวตรง"],
    ["curly", "หยิก"],
    ["ponytail", "หางม้า"],
    ["bun", "มวย"],
    ["twintails", "แกละคู่"],
    ["wavy", "ลอนประบ่า"],
  ]),
  hairColor: options([
    ["#342C32", "ดำธรรมชาติ"],
    ["#60412E", "น้ำตาลเข้ม"],
    ["#A36640", "คาราเมล"],
    ["#EBC45E", "บลอนด์"],
    ["#CF663A", "ส้มอิฐ"],
    ["#8D344B", "แดงไวน์"],
    ["#8C79B8", "ม่วงลาเวนเดอร์"],
    ["#D7D7CD", "เงิน"],
  ]),
  top: options([
    ["tee", "เสื้อยืด"],
    ["polo", "โปโล"],
    ["shop", "เสื้อช็อป"],
    ["shirt", "เชิ้ต"],
    ["hoodie", "ฮู้ดดี้"],
    ["ole", "ยูนิฟอร์ม OLE"],
    ["cardigan", "คาร์ดิแกน"],
    ["sport", "เสื้อกีฬา"],
  ]),
  topColor: options([
    ["#FFD43B", "เหลือง OLE"],
    ["#70B8DA", "ฟ้าสดใส"],
    ["#8FC47B", "เขียว"],
    ["#CB86B0", "ชมพู"],
    ["#9E8ED4", "ม่วง"],
    ["#EC9870", "ส้ม"],
    ["#E4E8EE", "ขาว"],
    ["#454F66", "กรมท่า"],
  ]),
  bottom: options([
    ["trousers", "ขายาว"],
    ["shorts", "ขาสั้น"],
    ["skirt", "กระโปรง"],
    ["cargo", "คาร์โก้"],
    ["overalls", "เอี๊ยม"],
  ]),
  bottomColor: options([
    ["#40517A", "ยีนส์"],
    ["#444355", "ดำ"],
    ["#8D795B", "กากี"],
    ["#A37998", "ม่วงหม่น"],
    ["#E7DDD1", "ครีม"],
  ]),
  shoes: options([
    ["sneakers", "สนีกเกอร์"],
    ["boots", "บู๊ต"],
    ["formal", "รองเท้าหนัง"],
    ["sandals", "แซนดัล"],
  ]),
  shoeColor: options([
    ["#DFE5EC", "ขาว"],
    ["#494657", "ดำ"],
    ["#A96942", "น้ำตาล"],
    ["#CF637B", "ชมพู"],
  ]),
  glasses: options([
    ["none", "ไม่ใส่แว่น"],
    ["round", "แว่นกลม"],
    ["square", "แว่นเหลี่ยม"],
    ["sun", "แว่นกันแดด"],
  ]),
  hat: options([
    ["none", "ไม่ใส่หมวก"],
    ["cap", "หมวกแก๊ป"],
    ["beanie", "บีนนี่"],
    ["crown", "มงกุฎ"],
  ]),
  headphones: options([
    ["none", "ไม่ใส่หูฟัง"],
    ["overear", "หูฟังครอบหู"],
  ]),
  earrings: options([
    ["none", "ไม่ใส่ต่างหู"],
    ["stud", "ต่างหูเม็ด"],
    ["hoop", "ต่างหูห่วง"],
  ]),
  background: options([
    ["#E8F4FF", "ฟ้าอ่อน"],
    ["#FFF0AD", "เหลืองอ่อน"],
    ["#FADCE8", "ชมพูอ่อน"],
    ["#DDF2DA", "เขียวอ่อน"],
    ["#EAE2FF", "ม่วงอ่อน"],
    ["#FFFFFF", "ขาว"],
    ["#26334E", "กรมท่า"],
    ["transparent", "โปร่งใส"],
  ]),
  frame: options([
    ["none", "ไม่มีกรอบ"],
    ["ink", "ขอบหมึก"],
    ["gold", "ขอบทอง"],
    ["violet", "ขอบม่วง"],
  ]),
} satisfies Record<AvatarKey, AvatarOption[]>;
export const defaultAvatarV2: AvatarV2 = {
  version: 2,
  face: "round",
  skin: "#DEAB7C",
  eyes: "normal",
  eyeColor: "#282421",
  brow: "natural",
  browColor: "#342C32",
  mouth: "smile",
  facialHair: "none",
  facialHairColor: "#342C32",
  hair: "crop",
  hairColor: "#60412E",
  top: "ole",
  topColor: "#FFD43B",
  bottom: "trousers",
  bottomColor: "#40517A",
  shoes: "sneakers",
  shoeColor: "#DFE5EC",
  glasses: "none",
  hat: "none",
  headphones: "none",
  earrings: "none",
  background: "#E8F4FF",
  frame: "ink",
};
const colors = new Set<AvatarKey>([
  "skin",
  "eyeColor",
  "browColor",
  "facialHairColor",
  "hairColor",
  "topColor",
  "bottomColor",
  "shoeColor",
  "background",
]);
const hex = (value: unknown): value is string =>
  typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
export function normalizeAvatar(input?: AvatarConfig | null): AvatarV2 {
  const result = { ...defaultAvatarV2 };
  if (!input) return result;
  const source = { ...input } as Record<string, unknown>;
  if (source.version !== 2) {
    source.hair = source.hair === "short" ? "crop" : source.hair;
    source.eyes =
      (
        {
          "● ●": "normal",
          "✦ ✦": "bright",
          "⌒ ⌒": "smiling",
          "━ ━": "focused",
        } as Record<string, string>
      )[String(source.eyes)] || source.eyes;
    source.mouth =
      ({ cool: "neutral", tiny: "surprised" } as Record<string, string>)[
        String(source.mouth)
      ] || source.mouth;
  }
  for (const key of Object.keys(avatarOptions) as AvatarKey[]) {
    const value = source[key];
    if (
      typeof value === "string" &&
      (avatarOptions[key].some((o) => o.id === value) ||
        (colors.has(key) && hex(value)))
    )
      result[key] = value;
  }
  return result;
}
export function validateAvatarV2(value: unknown): asserts value is AvatarV2 {
  if (!value || typeof value !== "object" || (value as AvatarV2).version !== 2)
    throw new Error("รูปแบบ Avatar ไม่ถูกต้อง");
  const config = value as AvatarV2;
  for (const key of Object.keys(avatarOptions) as AvatarKey[]) {
    const v = config[key];
    if (
      typeof v !== "string" ||
      (!avatarOptions[key].some((o) => o.id === v) &&
        !(colors.has(key) && hex(v)))
    )
      throw new Error("ตัวเลือก Avatar ไม่ถูกต้อง: " + key);
  }
  if (Object.keys(config).some((k) => k !== "version" && !(k in avatarOptions)))
    throw new Error("Avatar มีข้อมูลที่ไม่รองรับ");
}
export function validStoredAvatar(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if ((value as AvatarV3).version === 3) return isPresetAvatar(value);
  if ("version" in value) {
    try {
      validateAvatarV2(normalizeAvatar(value as AvatarConfig));
      return true;
    } catch {
      return false;
    }
  }
  const a = value as LegacyAvatar;
  return (
    [
      "face",
      "skin",
      "eyes",
      "hair",
      "glasses",
      "mouth",
      "hat",
      "background",
    ].every(
      (k) =>
        typeof a[k as keyof LegacyAvatar] === "string" &&
        a[k as keyof LegacyAvatar].length <= 30,
    ) &&
    hex(a.skin) &&
    hex(a.background)
  );
}
export function randomAvatar(): AvatarV2 {
  const a = { ...defaultAvatarV2 };
  for (const key of Object.keys(avatarOptions) as AvatarKey[]) {
    if (key === "hat" || key === "headphones") continue;
    const choices = avatarOptions[key];
    a[key] = choices[Math.floor(Math.random() * choices.length)].id;
  }
  a.eyes = "normal";
  a.hat = "none";
  a.headphones = "none";
  return a;
}
export const exampleAvatars: AvatarV2[] = [
  { ...defaultAvatarV2 },
  {
    ...defaultAvatarV2,
    face: "square",
    skin: "#74432F",
    hair: "curly",
    hairColor: "#342C32",
    brow: "thick",
    eyeColor: "#3F6B8A",
    glasses: "round",
    facialHair: "fullBeard",
  },
  {
    ...defaultAvatarV2,
    face: "oval",
    skin: "#EFC5A0",
    hair: "ponytail",
    hairColor: "#CF663A",
    top: "shirt",
    topColor: "#E4E8EE",
    bottom: "skirt",
    bottomColor: "#A37998",
    mouth: "happy",
  },
  {
    ...defaultAvatarV2,
    face: "heart",
    skin: "#955D3F",
    hair: "bun",
    hairColor: "#EBC45E",
    brow: "arched",
    eyeColor: "#47704B",
    facialHair: "thin",
  },
  {
    ...defaultAvatarV2,
    face: "round",
    skin: "#F8DCC4",
    hair: "bob",
    hairColor: "#8C79B8",
    top: "cardigan",
    topColor: "#CB86B0",
    bottom: "overalls",
    glasses: "square",
    mouth: "neutral",
    brow: "arched",
  },
  {
    ...defaultAvatarV2,
    face: "square",
    skin: "#B57950",
    hair: "spike",
    hairColor: "#D7D7CD",
    brow: "straight",
    eyeColor: "#76598C",
    facialHair: "combo",
  },
];
