import type { Pet } from "../types";

interface PixelPetProps {
  pet: Pet;
  size?: "sm" | "md" | "lg";
}

const petPixels: Record<Pet["species"], string[]> = {
  sheep: ["....wwww....", "...wwwwww...", "..wwssssww..", "..wssffssw..", ".wwssffssww.", ".wssssssssw.", ".wss.e.ss.w.", ".wssssssssw.", "..wss..ssw..", "..w.s..s.w..", "...s....s...", "............"],
  cat: ["...bb..bb...", "...bbbbbb...", "..bbbbbbbb..", "..bbbyybbb..", "..bbbbbbbb..", ".bbbbbbbbbb.", ".bbbbbbbbbb.", ".bbb....bbb.", "..bb....bb..", "...b....bb..", ".....bbbbb..", "............"],
  dog: ["...ccccc....", "..ccccccc...", "..cccccccc..", ".ccccffcccc.", ".ccccffcccc.", ".cccccccccc.", ".ccc.e.cccc.", ".cccccccccc.", "..cc....cc..", "..c......c..", ".cc......c..", "............"],
  rabbit: ["...w..w.....", "...w..w.....", "...w..w.....", "..wwwwww....", "..wwssww....", ".wwwwwwww...", ".www.e.www..", ".wwwwwwwww..", "..ww....ww..", "..w......w..", "............", "............"],
};

const palette = {
  ".": "transparent",
  w: "#f6f2ea",
  s: "#d8d3cc",
  f: "#ffd9b2",
  e: "#111111",
  b: "#171821",
  y: "#ffd24f",
  c: "#9a6435",
};

const sizeMap = {
  sm: "h-20 w-20",
  md: "h-28 w-28",
  lg: "h-36 w-36",
} as const;

export function PixelPet({ pet, size = "md" }: PixelPetProps) {
  const pixels = petPixels[pet.species];

  return (
    <div className={`grid grid-cols-12 gap-[2px] rounded-[28px] bg-black/5 p-4 ${sizeMap[size]}`}>
      {pixels.flatMap((row, rowIndex) =>
        row.split("").map((char, columnIndex) => (
          <span
            key={`${pet.id}-${rowIndex}-${columnIndex}`}
            className="block rounded-[2px]"
            style={{ backgroundColor: palette[char as keyof typeof palette], aspectRatio: "1 / 1" }}
          />
        )),
      )}
    </div>
  );
}
