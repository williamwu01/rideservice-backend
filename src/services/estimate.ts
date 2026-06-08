import { geocode, getRoute } from "./tomtom";
import { prisma } from "../lib/prisma";

const DEFAULTS = {
  baseFare: 2.75,
  perKm: 1.50,
  perMin: 0.36,
  bookingFee: 2.00,
  minimumFare: 8.00,
  airportFee: 5.00,
  lateNightFee: 3.00,
};

async function getRates() {
  const config = await prisma.pricingConfig.findFirst({ where: { isActive: true } });
  return config ?? DEFAULTS;
}

function isAirport(address: string): boolean {
  const lower = address.toLowerCase();
  return lower.includes("yvr") || lower.includes("vancouver international") || lower.includes("airport");
}

// Fri/Sat 10pm–3am Vancouver time
function isLateNight(): boolean {
  const now = new Date();
  const day = now.getDay();   // 0=Sun, 5=Fri, 6=Sat
  const hour = now.getHours();
  const isFriSatNight = (day === 5 || day === 6) && hour >= 22;
  const isSatSunEarlyMorning = (day === 6 || day === 0) && hour < 3;
  return isFriSatNight || isSatSunEarlyMorning;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function calculateEstimate(pickup: string, destination: string) {
  const [rates, [originCoords, destCoords]] = await Promise.all([
    getRates(),
    Promise.all([geocode(pickup), geocode(destination)]),
  ]);

  const { distanceKm, durationMin } = await getRoute(originCoords, destCoords);

  const airportFee = isAirport(pickup) || isAirport(destination) ? rates.airportFee : 0;
  const lateNightFee = isLateNight() ? rates.lateNightFee : 0;

  const distanceCost = distanceKm * rates.perKm;
  const timeCost = durationMin * rates.perMin;

  const subtotal =
    rates.baseFare +
    rates.bookingFee +
    distanceCost +
    timeCost +
    airportFee +
    lateNightFee;

  const fare = round2(Math.max(subtotal, rates.minimumFare));

  return {
    distanceKm: round2(distanceKm),
    durationMin,
    fare,
    breakdown: {
      baseFare: rates.baseFare,
      bookingFee: rates.bookingFee,
      distanceCost: round2(distanceCost),
      timeCost: round2(timeCost),
      airportFee,
      lateNightFee,
    },
    driverPayout: round2(fare * 0.90),
    platformCut: round2(fare * 0.10),
  };
}
