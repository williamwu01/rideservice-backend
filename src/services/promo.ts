import { prisma } from "../lib/prisma";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "RIDE-";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createPromoCode(discount: number, createdBy: string, options?: {
  code?: string;
  maxUses?: number;
  expiresAt?: Date;
}) {
  const code = options?.code?.toUpperCase() || generateCode();

  const existing = await prisma.promoCode.findUnique({ where: { code } });
  if (existing) throw new Error(`Code ${code} already exists`);

  return prisma.promoCode.create({
    data: {
      code,
      discount,
      createdBy,
      maxUses: options?.maxUses ?? null,
      expiresAt: options?.expiresAt ?? null,
    },
  });
}

export async function validatePromoCode(code: string): Promise<{
  valid: boolean;
  discount: number;
  error?: string;
}> {
  const promo = await prisma.promoCode.findUnique({
    where: { code: code.toUpperCase() },
  });

  if (!promo) return { valid: false, discount: 0, error: "Invalid promo code" };
  if (!promo.isActive) return { valid: false, discount: 0, error: "This code is no longer active" };
  if (promo.expiresAt && promo.expiresAt < new Date()) return { valid: false, discount: 0, error: "This code has expired" };
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) return { valid: false, discount: 0, error: "This code has reached its usage limit" };

  return { valid: true, discount: promo.discount };
}

export async function redeemPromoCode(code: string) {
  await prisma.promoCode.update({
    where: { code: code.toUpperCase() },
    data: { usedCount: { increment: 1 } },
  });
}

export async function disablePromoCode(code: string) {
  const promo = await prisma.promoCode.findUnique({ where: { code: code.toUpperCase() } });
  if (!promo) throw new Error(`Code ${code} not found`);
  return prisma.promoCode.update({
    where: { code: code.toUpperCase() },
    data: { isActive: false },
  });
}

export async function listPromoCodes() {
  return prisma.promoCode.findMany({ orderBy: { createdAt: "desc" } });
}