import express from 'express';
import { isAuthenticated } from '../middleware/authMiddleware.js';
import { isGroupMember } from '../middleware/roleMiddleware.js';
import { createOrder, verifyPayment } from '../controllers/paymentController.js';

const router = express.Router();

// Supported endpoints (accepts groupId via URL param or req.body)
router.post('/groups/:id/payment/create-order', isAuthenticated, isGroupMember, createOrder);
router.post('/groups/:id/payment/verify-payment', isAuthenticated, isGroupMember, verifyPayment);

router.post('/payment/create-order', isAuthenticated, isGroupMember, createOrder);
router.post('/payment/verify-payment', isAuthenticated, isGroupMember, verifyPayment);

export default router;
