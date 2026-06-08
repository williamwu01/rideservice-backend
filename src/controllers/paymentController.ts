import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { createOrder, captureOrder } from "../services/paypal";
import { redeemPromoCode, validatePromoCode } from "../services/promo";
import { config } from "../config/env";
import { sendTextMessage } from "../services/whatsapp";
import { formatScheduledTime } from "../services/timeparse";

// Step 1 — frontend calls this to create a PayPal order
// Returns orderId + approveUrl for the PayPal JS SDK
export const createPaymentOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookingId, promoCode, returnUrl, cancelUrl } = req.body;

    if (!bookingId) {
      res.status(400).json({ success: false, error: "Missing bookingId" });
      return;
    }

    const booking = await prisma.rideRequest.findUnique({ where: { id: bookingId } });
    if (!booking) {
      res.status(404).json({ success: false, error: "Booking not found" });
      return;
    }
    if (booking.paymentStatus === "PAID") {
      res.status(400).json({ success: false, error: "Booking is already paid" });
      return;
    }
    if (!booking.estimatedFare) {
      res.status(400).json({ success: false, error: "Booking has no fare estimate" });
      return;
    }

    let discount = 0;
    let appliedPromo: string | null = null;

    if (promoCode) {
      const result = await validatePromoCode(promoCode);
      if (!result.valid) {
        res.status(400).json({ success: false, error: result.error });
        return;
      }
      discount = result.discount;
      appliedPromo = promoCode.toUpperCase();
    }

    const finalFare = Math.max(
      parseFloat((booking.estimatedFare - discount).toFixed(2)),
      0.50 // PayPal minimum
    );

    if (config.simulatorMode) {
      const simOrderId = `SIM_${Date.now()}`;
      const simApproveUrl = returnUrl
        ? `${returnUrl}?token=${simOrderId}`
        : `http://localhost:3000/book/success?token=${simOrderId}`;

      await prisma.rideRequest.update({
        where: { id: bookingId },
        data: {
          paypalOrderId: simOrderId,
          paymentStatus: "PENDING",
          promoCode: appliedPromo,
          promoDiscount: discount,
          finalFare,
        },
      });

      res.json({
        success: true,
        orderId: simOrderId,
        approveUrl: simApproveUrl,
        breakdown: {
          estimatedFare: booking.estimatedFare,
          promoDiscount: discount,
          finalFare,
        },
      });
      return;
    }

    const order = await createOrder(finalFare, bookingId, returnUrl, cancelUrl);

    // Lock in the fare and promo on the booking
    await prisma.rideRequest.update({
      where: { id: bookingId },
      data: {
        paypalOrderId: order.orderId,
        paymentStatus: "PENDING",
        promoCode: appliedPromo,
        promoDiscount: discount,
        finalFare,
      },
    });

    res.json({
      success: true,
      orderId: order.orderId,
      approveUrl: order.approveUrl,
      breakdown: {
        estimatedFare: booking.estimatedFare,
        promoDiscount: discount,
        finalFare,
      },
    });
  } catch (err) {
    next(err);
  }
};

// Notify the assigned driver with full job details after payment is confirmed
async function notifyDriverOnPayment(bookingId: string) {
  const booking = await prisma.rideRequest.findUnique({
    where: { id: bookingId },
    include: { driver: true },
  });
  if (!booking?.driver) return;

  const customerDigits = booking.phone.replace(/@.*/, "").replace(/\D/g, "");
  const customerLink = `https://wa.me/${customerDigits}`;
  const timeLabel = booking.scheduledPickupAt
    ? formatScheduledTime(booking.scheduledPickupAt)
    : (booking.pickupTime ?? "ASAP");

  await sendTextMessage(
    booking.driver.phone,
    `✅ Payment received — you're confirmed for this ride!\n\n` +
    `Customer: ${booking.firstName} ${booking.lastName}\n` +
    `Pickup: ${booking.pickup}\n` +
    `Destination: ${booking.destination}\n` +
    `Pickup Time: ${timeLabel}\n` +
    `Passengers: ${booking.passengers}\n` +
    `Luggage: ${booking.luggage}\n` +
    `Contact: ${customerLink}\n\n` +
    `Reply START ${bookingId} when you've picked up the customer.`
  );
}

// GET /api/payment/success — PayPal redirects here after customer approves payment
// Captures the order (actually charges the customer) and shows a confirmation page
export const paymentSuccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = req.query.token as string;

    if (!orderId) {
      res.status(400).send("Missing payment token.");
      return;
    }

    const booking = await prisma.rideRequest.findFirst({ where: { paypalOrderId: orderId } });
    if (!booking) {
      res.status(404).send("Booking not found.");
      return;
    }

    if (booking.paymentStatus === "PAID") {
      res.send(successHtml(booking.firstName));
      return;
    }

    const capture = await captureOrder(orderId);

    if (capture.status !== "COMPLETED") {
      res.status(400).send("Payment was not completed. Please try again.");
      return;
    }

    await prisma.rideRequest.update({
      where: { id: booking.id },
      data: { paymentStatus: "PAID", status: "MATCHED" },
    });

    if (booking.promoCode) {
      await redeemPromoCode(booking.promoCode);
    }

    notifyDriverOnPayment(booking.id).catch((err) =>
      console.error("[paymentSuccess] driver notification failed:", err)
    );

    res.send(successHtml(booking.firstName));
  } catch (err) {
    next(err);
  }
};

function successHtml(name: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment Confirmed</title><style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0fdf4}div{text-align:center;padding:2rem}h1{color:#16a34a;font-size:2rem;margin-bottom:.5rem}p{color:#555}</style></head><body><div><h1>✅ Payment Confirmed!</h1><p>Thank you, ${name}. Your ride is booked.</p><p>Your driver will be in touch shortly.</p></div></body></html>`;
}

// Step 2 — called after customer approves payment in PayPal UI
export const capturePayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = req.params.orderId as string;

    const booking = await prisma.rideRequest.findFirst({
      where: { paypalOrderId: orderId },
    });

    if (!booking) {
      res.status(404).json({ success: false, error: "Booking not found for this order" });
      return;
    }

    // Idempotency: already captured — return success immediately
    if (booking.paymentStatus === "PAID") {
      res.json({
        success: true,
        message: "Payment already captured",
        bookingId: booking.id,
        amountCharged: booking.finalFare ?? booking.estimatedFare ?? 0,
      });
      return;
    }

    if (config.simulatorMode || orderId.startsWith("SIM_")) {
      await prisma.rideRequest.update({
        where: { id: booking.id },
        data: { paymentStatus: "PAID", status: "MATCHED" },
      });
      if (booking.promoCode) {
        await redeemPromoCode(booking.promoCode);
      }
      await notifyDriverOnPayment(booking.id);
      res.json({
        success: true,
        message: "Simulated payment captured",
        bookingId: booking.id,
        amountCharged: booking.finalFare ?? booking.estimatedFare ?? 0,
      });
      return;
    }

    const capture = await captureOrder(orderId);

    if (capture.status !== "COMPLETED") {
      await prisma.rideRequest.update({
        where: { id: booking.id },
        data: { paymentStatus: "FAILED" },
      });
      res.status(400).json({ success: false, error: "Payment was not completed" });
      return;
    }

    await prisma.rideRequest.update({
      where: { id: booking.id },
      data: {
        paymentStatus: "PAID",
        status: "MATCHED",
      },
    });

    if (booking.promoCode) {
      await redeemPromoCode(booking.promoCode);
    }

    notifyDriverOnPayment(booking.id).catch((err) =>
      console.error("[capturePayment] driver notification failed:", err)
    );

    res.json({
      success: true,
      message: "Payment captured successfully",
      bookingId: booking.id,
      amountCharged: capture.amount,
    });
  } catch (err) {
    next(err);
  }
};

// Validate a promo code without creating a PayPal order — used by the frontend to show a discount preview
export const validatePromo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookingId, promoCode } = req.body;

    if (!bookingId || !promoCode) {
      res.status(400).json({ success: false, error: "Missing bookingId or promoCode" });
      return;
    }

    const booking = await prisma.rideRequest.findUnique({ where: { id: bookingId } });
    if (!booking) {
      res.status(404).json({ success: false, error: "Booking not found" });
      return;
    }
    if (!booking.estimatedFare) {
      res.status(400).json({ success: false, error: "Booking has no fare estimate" });
      return;
    }

    const result = await validatePromoCode(promoCode.toUpperCase());
    if (!result.valid) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    const finalFare = Math.max(
      parseFloat((booking.estimatedFare - result.discount).toFixed(2)),
      0.50
    );

    res.json({ success: true, discount: result.discount, finalFare });
  } catch (err) {
    next(err);
  }
};