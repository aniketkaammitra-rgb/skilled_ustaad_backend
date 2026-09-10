import express from "express";
import { queryChatbot } from "../controllers/chatbot.controller.js";

const router = express.Router();

router.post("/query", queryChatbot);

export default router;
