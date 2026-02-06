import express from 'express';
import { readiness, liveness, metrics } from '../controllers/operational.controller.js';

const router = express.Router();

router.get('/health/ready', readiness);
router.get('/health/live', liveness);
router.get('/metrics', metrics);

export default router;
