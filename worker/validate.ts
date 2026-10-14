import { z } from "zod";

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 06:30.")
  .nullable();

const name = (label: string, max = 60) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`);

export const nicknameSchema = z
  .string()
  .trim()
  .max(30, "Keep your name to 30 characters or fewer.")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const createCardSchema = z.object({ nickname: nicknameSchema });
export const updateCardSchema = z.object({ nickname: nicknameSchema });
export const restoreCardSchema = z.object({
  code: z.string().trim().min(1, "Enter your backup code.").max(40),
});

const baristaPin = z
  .string()
  .regex(/^\d{4}$/, "The PIN is 4 numbers.")
  .optional();

export const orderSchema = z.object({
  pin: baristaPin,
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        qty: z.number().int().min(1).max(20, "That's a lot of coffee. Keep each item to 20 or fewer."),
      }),
    )
    .min(1, "Pick at least one item.")
    .max(15, "Keep an order to 15 different items or fewer."),
});

export const redeemSchema = z.object({ itemId: z.string().min(1).max(40), pin: baristaPin });

const EASY_PINS = new Set(["0123", "1234", "2345", "3456", "4567", "5678", "6789", "9876", "8765", "7654", "6543", "5432", "4321", "3210"]);

export const setPinSchema = z.object({
  pin: z
    .string()
    .regex(/^\d{4}$/, "Use exactly 4 numbers.")
    .refine((v) => !/^(\d)\1{3}$/.test(v) && !EASY_PINS.has(v), "Pick a PIN that's harder to guess than 1234 or 0000."),
});

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "The shop link needs at least 3 characters.")
  .max(40, "Keep the shop link to 40 characters or fewer.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use only letters, numbers and single dashes in the shop link.");

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(120);
const password = z
  .string()
  .min(8, "Use at least 8 characters for the password.")
  .max(200, "That password is too long.");

export const registerSchema = z.object({
  shopName: name("Shop name"),
  slug: slugSchema,
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password.").max(200),
  newPassword: password,
});

export const shopSettingsSchema = z
  .object({
    name: name("Shop name"),
    rewardText: name("Reward", 40),
    stampsRequired: z.number().int().min(2, "Use at least 2 stamps.").max(30, "Use 30 stamps or fewer."),
    stampMode: z.enum(["per_cup", "per_order"]),
    cooldownMinutes: z.number().int().min(0).max(240, "Keep the wait to 240 minutes or fewer."),
    maxStampsPerDay: z.number().int().min(0).max(100, "Keep the daily limit to 100 or fewer."),
    openTime: time,
    closeTime: time,
    requirePin: z.boolean(),
  })
  .partial()
  .refine(
    (v) =>
      v.openTime === undefined && v.closeTime === undefined
        ? true
        : (v.openTime === null) === (v.closeTime === null),
    { message: "Set both opening and closing time, or leave both empty." },
  );

const pesos = z
  .number()
  .min(0, "Price can't be negative.")
  .max(100000, "That price is too high.")
  .transform((v) => Math.round(v * 100));

export const menuItemSchema = z.object({
  name: name("Item name"),
  price: pesos,
  earnsStamp: z.boolean().default(true),
  isAvailable: z.boolean().default(true),
});

export const menuItemPatchSchema = z
  .object({
    name: name("Item name"),
    price: pesos,
    earnsStamp: z.boolean(),
    isAvailable: z.boolean(),
  })
  .partial();

export const reorderSchema = z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(200) });

export const adjustSchema = z.object({
  delta: z
    .number()
    .int()
    .min(-30)
    .max(30)
    .refine((v) => v !== 0, "Add or remove at least one stamp."),
  note: z.string().trim().max(120).optional(),
});

export const blockSchema = z.object({ blocked: z.boolean() });
