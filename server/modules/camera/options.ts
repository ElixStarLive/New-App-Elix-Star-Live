import { Router } from "express";
import {
  CAMERA_FILTER_OPTIONS,
  CAMERA_SPEED_OPTIONS,
  CAMERA_STICKER_OPTIONS,
} from "../../../shared/cameraOptions.js";

export const cameraOptionsRouter = Router();

cameraOptionsRouter.get("/camera-filters", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({ data: CAMERA_FILTER_OPTIONS });
});

cameraOptionsRouter.get("/speed-options", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({ data: CAMERA_SPEED_OPTIONS });
});

cameraOptionsRouter.get("/sticker-options", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({ data: CAMERA_STICKER_OPTIONS });
});
