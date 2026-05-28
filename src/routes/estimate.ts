import express from "express";
import { getEstimate } from "../controllers/estimateController";

const router = express.Router();

router.get("/estimate", getEstimate);

export default router;
