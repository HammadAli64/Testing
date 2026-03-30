export const SKELETON_PARTS = [
  "Skull",
  "Neck",
  "Shoulders",
  "Rib Cage",
  "Spine",
  "Left Arm",
  "Right Arm",
  "Pelvis",
  "Left Hand",
  "Right Hand",
  "Left Leg",
  "Right Leg",
  "Feet",
] as const;

export function getUnlockPartByIndex(index: number) {
  return SKELETON_PARTS[index % SKELETON_PARTS.length];
}
