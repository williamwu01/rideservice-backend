import express from "express";
import { createPaymentOrder, capturePayment } from "../controllers/paymentController";

const router = express.Router();

router.post("/payment/create-order", createPaymentOrder);
router.post("/payment/capture/:orderId", capturePayment);

export default router;