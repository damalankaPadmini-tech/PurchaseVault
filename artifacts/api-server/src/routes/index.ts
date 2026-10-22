import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth.js";
import purchasesRouter from "./purchases.js";
import documentsRouter from "./documents.js";
import servicesRouter from "./services.js";
import notificationsRouter from "./notifications.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(purchasesRouter);
router.use(documentsRouter);
router.use(servicesRouter);
router.use(notificationsRouter);

export default router;
