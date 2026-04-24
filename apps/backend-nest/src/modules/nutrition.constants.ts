export const MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const PORTION_SIZES = ["small", "medium", "large"] as const;
export type PortionSize = (typeof PORTION_SIZES)[number];

/** Daily distinct meal slots that include a photo (BodyBank quota). */
export const DAILY_PHOTO_MEAL_SLOT_LIMIT = 4;

/** ~10 MiB base64 claim in BodyBank; cap raw base64 string length. */
export const MAX_IMAGE_BASE64_CHARS = 14_000_000;

/** Decoded image cap with margin under Anthropic 5 MiB vision limit. */
export const MAX_IMAGE_DECODED_BYTES = Math.floor(4.5 * 1024 * 1024);

export const NUTRITION_DAY_COMPLETE_COINS = 10;

export const DEFAULT_CALORIE_GOAL = 2000;
export const DEFAULT_PROTEIN_GOAL = 150;

export const STREAK_MAX_DAYS = 400;

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
