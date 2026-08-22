import Razorpay from 'razorpay';
import crypto from 'crypto';
import Settlement from '../models/Settlement.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { env } from '../config/env.js';
import { emitSettlementMade } from '../sockets/socketEvents.js';
import { sendEmail } from '../utils/sendEmail.js';

const getRazorpayInstance = () => {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay API keys are not configured');
  }
  return new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
};

const notifyGroup = async (group, type, message, excludeUserId) => {
  try {
    const notifications = group.members
      .filter((m) => m.userId.toString() !== excludeUserId.toString())
      .map((m) => ({
        userId: m.userId,
        type,
        message,
        groupId: group._id,
      }));
    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (err) {
    console.error('[Notification Error]:', err);
  }
};

/**
 * @route POST /api/payment/create-order
 * @desc Create a Razorpay order
 */
export const createOrder = async (req, res, next) => {
  try {
    const { amount, currency = 'INR' } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    const razorpay = getRazorpayInstance();
    const options = {
      amount: Math.round(Number(amount) * 100), // Razorpay amount in paise
      currency,
      receipt: `receipt_${Date.now()}_${req.user._id.toString().slice(-4)}`,
      notes: {
        groupId: req.group?._id?.toString() || req.body.groupId || '',
        fromUserId: req.user._id.toString(),
        toUserId: req.body.toUser || '',
      },
    };

    const order = await razorpay.orders.create(options);
    res.status(200).json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
      },
      keyId: env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('[Razorpay Order Error]:', error);
    next(error);
  }
};

/**
 * @route POST /api/payment/verify-payment
 * @desc Verify payment signature and record settlement
 */
export const verifyPayment = async (req, res, next) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      toUser,
      amount,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: 'Missing payment signature verification parameters' });
    }

    if (!toUser || !amount) {
      return res.status(400).json({ message: 'toUser and amount are required' });
    }

    // Verify HMAC SHA256 signature
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: 'Invalid payment signature. Verification failed.' });
    }

    const recipient = await User.findById(toUser);
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient user not found' });
    }

    // Create the settlement record
    const settlement = await Settlement.create({
      groupId: req.group._id,
      fromUser: req.user._id,
      toUser,
      amount: Number(amount),
      method: 'razorpay',
      paymentDetails: {
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
      },
    });

    const populatedSettlement = await settlement.populate([
      { path: 'fromUser', select: 'name email avatar' },
      { path: 'toUser', select: 'name email avatar' },
    ]);

    // Send group notifications
    await notifyGroup(
      req.group,
      'settlement_made',
      `${req.user.name} paid ${recipient.name} ₹${amount} via Razorpay`,
      req.user._id
    );

    await Notification.create({
      userId: toUser,
      type: 'settlement_made',
      message: `${req.user.name} settled a debt of ₹${amount} with you via Razorpay in ${req.group.name}`,
      groupId: req.group._id,
    });

    // Real-time socket event
    emitSettlementMade(req.group._id, populatedSettlement);

    // Email notification
    const emailHtml = `
      <h1>Online Debt Settled via Razorpay</h1>
      <p>Hello ${recipient.name},</p>
      <p>${req.user.name} has settled their balance with you in group <strong>${req.group.name}</strong> using Razorpay online payment.</p>
      <ul>
        <li><strong>Paid By:</strong> ${req.user.name} (${req.user.email})</li>
        <li><strong>Amount:</strong> ₹${amount}</li>
        <li><strong>Payment Method:</strong> Razorpay (Online)</li>
        <li><strong>Payment ID:</strong> ${razorpay_payment_id}</li>
      </ul>
      <p>Your ledger in SettleUp has been automatically updated.</p>
    `;

    sendEmail({
      to: recipient.email,
      subject: `SettleUp - Online Payment Received from ${req.user.name}`,
      html: emailHtml,
    }).catch((err) => {
      console.error('[Email Error]:', err);
    });

    res.status(201).json({
      success: true,
      message: 'Payment verified and settlement recorded successfully',
      settlement: populatedSettlement,
    });
  } catch (error) {
    console.error('[Razorpay Verify Error]:', error);
    next(error);
  }
};
