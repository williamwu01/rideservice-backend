import express from "express";
import { config } from "../config/env";

const router = express.Router();

// GET /api/places/search?q=YVR&limit=5
// Proxies TomTom fuzzy search — keeps the API key server-side
router.get("/search", async (req, res, next) => {
  try {
    const q = (req.query.q as string)?.trim();
    const limit = Math.min(parseInt((req.query.limit as string) || "5", 10), 10);

    if (!q || q.length < 2) {
      res.json({ success: true, results: [] });
      return;
    }

    const url =
      `${config.tomtom.baseUrl}/search/2/search/${encodeURIComponent(q)}.json` +
      `?key=${config.tomtom.apiKey}&countrySet=CA&limit=${limit}&typeahead=true&language=en-GB`;

    const response = await fetch(url);
    if (!response.ok) {
      res.json({ success: true, results: [] });
      return;
    }

    const data = await response.json() as any;

    const results = (data.results ?? []).map((r: any) => {
      const poi = r.poi?.name;
      const addr = r.address?.freeformAddress ?? "";
      return {
        name: poi ?? addr,
        address: poi ? `${poi}, ${addr}` : addr,
        lat: r.position?.lat,
        lon: r.position?.lon,
      };
    });

    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
});

export default router;