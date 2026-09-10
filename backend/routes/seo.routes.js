import express from "express";
import { getDynamicSitemap } from "../controllers/seo.controller.js";

const router = express.Router();

router.get("/sitemap.xml", getDynamicSitemap);

export default router;
