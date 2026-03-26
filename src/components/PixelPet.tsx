import sheepImage from "../../image/绵羊.png";
import nightCatImage from "../../image/夜猫子.png";
import beagleImage from "../../image/比格犬.png";
import rabbitImage from "../../image/休憩兔.png";
import type { Pet } from "../types";

interface PixelPetProps {
  pet: Pet;
  size?: "sm" | "md" | "lg";
  tone?: "default" | "home" | "focus";
}

interface PetRenderConfig {
  imageSrc: string;
  scale: number;
  translateY?: number;
}

const sizeMap = {
  sm: "h-20 w-20",
  md: "h-28 w-28",
  lg: "h-36 w-36",
} as const;

const toneMap = {
  default: "bg-black/5",
  home: "bg-cloud/80",
  focus: "bg-sky/45",
} as const;

const petRenderMap: Record<Pet["id"], PetRenderConfig> = {
  sheep: {
    imageSrc: sheepImage,
    scale: 1,
  },
  beagle: {
    imageSrc: beagleImage,
    scale: 1,
  },
  "night-cat": {
    imageSrc: nightCatImage,
    scale: 1.18,
    translateY: 2,
  },
  "rest-rabbit": {
    imageSrc: rabbitImage,
    scale: 1,
  },
};

export function PixelPet({ pet, size = "md", tone = "default" }: PixelPetProps) {
  const { imageSrc, scale, translateY = 0 } = petRenderMap[pet.id];

  return (
    <div className={`grid place-items-center rounded-[28px] p-4 ${sizeMap[size]} ${toneMap[tone]}`}>
      <div className="grid h-full w-full place-items-center overflow-visible">
        <img
          src={imageSrc}
          alt={pet.name}
          className="h-full w-full object-contain"
          style={{
            imageRendering: "pixelated",
            transform: `translateY(${translateY}px) scale(${scale})`,
            transformOrigin: "center center",
          }}
        />
      </div>
    </div>
  );
}
