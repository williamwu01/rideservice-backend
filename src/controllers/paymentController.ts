import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { createOrder, captureOrder } from "../services/paypal";
import { redeemPromoCode, validatePromoCode } from "../services/promo";

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

// Step 2 — called after customer approves payment in PayPal UI
export const capturePayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params;

    const booking = await prisma.rideRequest.findFirst({
      where: { paypalOrderId: orderId },
    });

    if (!booking) {
      res.status(404).json({ success: false, error: "Booking not found for this order" });
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

    // Mark paid and redeem promo if used
    await prisma.rideRequest.update({
      where: { id: booking.id },
      data: { paymentStatus: "PAID" },
    });

    if (booking.promoCode) {
      await redeemPromoCode(booking.promoCode);
    }

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