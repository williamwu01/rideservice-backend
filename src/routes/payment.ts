import express from "express";
import { createPaymentOrder, capturePayment, paymentSuccess, validatePromo } from "../controllers/paymentController";

const router = express.Router();

router.post("/payment/create-order", createPaymentOrder);
router.post("/payment/capture/:orderId", capturePayment);
router.get("/payment/success", paymentSuccess);
router.post("/payment/validate-promo", validatePromo);

export default router;