import { prisma } from "../lib/prisma";

type CreateDriverInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  carModel: string;
  carNameplate: string;
  photo?: string;
  whatsappEnabled?: boolean;
  isOnline?: boolean;
  maxPassengers?: number;
  maxLuggage?: number;
  latitude?: number;
  longitude?: number;
};

type UpdateDriverInput = Partial<Omit<CreateDriverInput, "email">>;

export async function createDriver(data: CreateDriverInput) {
  return prisma.driver.create({ data });
}

export async function getAllDrivers() {
  return prisma.driver.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getDriver(id: string) {
  return prisma.driver.findUnique({ where: { id } });
}

export async function updateDriver(id: string, data: UpdateDriverInput) {
  const driver = await prisma.driver.findUnique({ where: { id } });
  if (!driver) throw new Error(`Driver ${id} not found`);
  return prisma.driver.update({ where: { id }, data });
}

export async function deleteDriver(id: string) {
  const driver = await prisma.driver.findUnique({ where: { id } });
  if (!driver) throw new Error(`Driver ${id} not found`);
  return prisma.driver.delete({ where: { id } });
}
