import express from 'express';
import { isAuthenticated } from '../middleware/authMiddleware.js';
import { isGroupMember } from '../middleware/roleMiddleware.js';
import {
  getBalances,
  getSuggestedSettlements,
  settleUp,
  listSettlements,
  deleteSettlement,
} from '../controllers/balanceController.js';
import { validateSettlement } from '../middleware/validationMiddleware.js';

const router = express.Router();

router.get('/groups/:id/balances', isAuthenticated, isGroupMember, getBalances);
router.get('/groups/:id/settlements/suggested', isAuthenticated, isGroupMember, getSuggestedSettlements);
router.post('/groups/:id/settle', isAuthenticated, isGroupMember, validateSettlement, settleUp);
router.get('/groups/:id/settlements', isAuthenticated, isGroupMember, listSettlements);
router.delete('/groups/:id/settlements/:settlementId', isAuthenticated, isGroupMember, deleteSettlement);

export default router;
