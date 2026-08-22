import Expense from '../models/Expense.js';
import Settlement from '../models/Settlement.js';
import Notification from '../models/Notification.js';
import {
  emitExpenseAdded,
  emitExpenseUpdated,
  emitExpenseDeleted,
  emitSettlementDeleted,
} from '../sockets/socketEvents.js';

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
    console.error(err);
  }
};

export const createExpense = async (req, res, next) => {
  try {
    if (req.memberRole === 'viewer') {
      return res.status(403).json({ message: 'Access denied: viewers cannot add expenses' });
    }

    const { description, amount, category, paidBy, splitType, splits, receiptUrl } = req.body;
    if (!description || !amount || !paidBy || !splitType) {
      return res.status(400).json({ message: 'Required fields missing' });
    }

    let finalSplits = [];

    if (splitType === 'equal') {
      const members = req.group.members;
      const count = members.length;
      const equalAmount = parseFloat((amount / count).toFixed(2));
      let sum = 0;

      finalSplits = members.map((m, idx) => {
        let userAmount = equalAmount;
        if (idx === count - 1) {
          userAmount = parseFloat((amount - sum).toFixed(2));
        }
        sum += userAmount;
        return { userId: m.userId, amount: userAmount };
      });
    } else if (splitType === 'percentage') {
      const count = splits.length;
      let sum = 0;

      finalSplits = splits.map((s, idx) => {
        let userAmount = parseFloat((amount * (s.percentage / 100)).toFixed(2));
        if (idx === count - 1) {
          userAmount = parseFloat((amount - sum).toFixed(2));
        }
        sum += userAmount;
        return { userId: s.userId, amount: userAmount };
      });
    } else {
      finalSplits = splits.map((s) => ({
        userId: s.userId,
        amount: parseFloat(s.amount.toFixed(2)),
      }));
    }

    const expense = await Expense.create({
      groupId: req.group._id,
      description,
      amount,
      category,
      paidBy,
      splitType,
      splits: finalSplits,
      receiptUrl,
      createdBy: req.user._id,
    });

    const populatedExpense = await expense.populate([
      { path: 'paidBy', select: 'name email avatar' },
      { path: 'createdBy', select: 'name email avatar' },
    ]);

    await notifyGroup(
      req.group,
      'expense_added',
      `${req.user.name} added "${description}" of ${req.group.name}`,
      req.user._id
    );

    emitExpenseAdded(req.group._id, populatedExpense);

    res.status(201).json(populatedExpense);
  } catch (error) {
    next(error);
  }
};

export const listExpenses = async (req, res, next) => {
  try {
    const { category, search, from, to } = req.query;
    const query = { groupId: req.group._id };

    if (category) {
      query.category = category;
    }

    if (search) {
      query.description = { $regex: search, $options: 'i' };
    }

    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    const expenses = await Expense.find(query)
      .populate('paidBy', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .sort({ createdAt: -1 });

    res.status(200).json(expenses);
  } catch (error) {
    next(error);
  }
};

export const updateExpense = async (req, res, next) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id);

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    if (req.memberRole === 'viewer') {
      return res.status(403).json({ message: 'Access denied: viewers cannot update expenses' });
    }

    const isCreator = expense.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.memberRole === 'admin';

    if (!isCreator && !isAdmin) {
      return res.status(403).json({ message: 'Access denied: only the creator or group admins can edit this expense' });
    }

    const { description, amount, category, paidBy, splitType, splits, receiptUrl } = req.body;

    if (description !== undefined) expense.description = description;
    if (category !== undefined) expense.category = category;
    if (paidBy !== undefined) expense.paidBy = paidBy;
    if (receiptUrl !== undefined) expense.receiptUrl = receiptUrl;

    if (amount !== undefined || splitType !== undefined || splits !== undefined) {
      const finalAmount = amount !== undefined ? amount : expense.amount;
      const finalSplitType = splitType !== undefined ? splitType : expense.splitType;
      const rawSplits = splits !== undefined ? splits : expense.splits;

      expense.amount = finalAmount;
      expense.splitType = finalSplitType;

      if (finalSplitType === 'equal') {
        const members = req.group.members;
        const count = members.length;
        const equalAmount = parseFloat((finalAmount / count).toFixed(2));
        let sum = 0;

        expense.splits = members.map((m, idx) => {
          let userAmount = equalAmount;
          if (idx === count - 1) {
            userAmount = parseFloat((finalAmount - sum).toFixed(2));
          }
          sum += userAmount;
          return { userId: m.userId, amount: userAmount };
        });
      } else if (finalSplitType === 'percentage') {
        const count = rawSplits.length;
        let sum = 0;

        expense.splits = rawSplits.map((s, idx) => {
          let userAmount = parseFloat((finalAmount * (s.percentage / 100)).toFixed(2));
          if (idx === count - 1) {
            userAmount = parseFloat((finalAmount - sum).toFixed(2));
          }
          sum += userAmount;
          return { userId: s.userId, amount: userAmount };
        });
      } else {
        expense.splits = rawSplits.map((s) => ({
          userId: s.userId,
          amount: parseFloat(s.amount.toFixed(2)),
        }));
      }
    }

    const updatedExpense = await expense.save();
    const populatedExpense = await updatedExpense.populate([
      { path: 'paidBy', select: 'name email avatar' },
      { path: 'createdBy', select: 'name email avatar' },
    ]);

    await notifyGroup(
      req.group,
      'expense_added',
      `${req.user.name} updated expense "${populatedExpense.description}" of ${req.group.name}`,
      req.user._id
    );

    emitExpenseUpdated(req.group._id, populatedExpense);

    res.status(200).json(populatedExpense);
  } catch (error) {
    next(error);
  }
};

export const deleteExpense = async (req, res, next) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id);

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    if (req.memberRole === 'viewer') {
      return res.status(403).json({ message: 'Access denied: viewers cannot delete expenses' });
    }

    const isCreator = expense.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.memberRole === 'admin';

    if (!isCreator && !isAdmin) {
      return res.status(403).json({ message: 'Access denied: only the creator or group admins can delete this expense' });
    }

    await Expense.findByIdAndDelete(id);

    // Auto-cleanup: remove corresponding settlements made for this expense so no phantom reverse debt occurs
    if (expense.splits && expense.splits.length > 0) {
      for (const split of expense.splits) {
        const splitUserId = split.userId?.toString();
        const payerId = expense.paidBy?.toString();

        if (splitUserId && payerId && splitUserId !== payerId) {
          const matchingSettlement = await Settlement.findOne({
            groupId: req.group._id,
            fromUser: splitUserId,
            toUser: payerId,
            amount: split.amount,
          });

          if (matchingSettlement) {
            await Settlement.findByIdAndDelete(matchingSettlement._id);
            emitSettlementDeleted(req.group._id, matchingSettlement._id);
          }
        }
      }
    }

    // If no expenses remain in the group, clean up all settlements for this group
    const remainingExpenses = await Expense.find({ groupId: req.group._id });
    if (remainingExpenses.length === 0) {
      const existingSettlements = await Settlement.find({ groupId: req.group._id });
      if (existingSettlements.length > 0) {
        await Settlement.deleteMany({ groupId: req.group._id });
        existingSettlements.forEach((s) => {
          emitSettlementDeleted(req.group._id, s._id);
        });
      }
    }

    await notifyGroup(
      req.group,
      'expense_added',
      `${req.user.name} deleted expense "${expense.description}" of ${req.group.name}`,
      req.user._id
    );

    emitExpenseDeleted(req.group._id, id);

    res.status(200).json({ message: 'Expense and associated settlements cleaned up successfully' });
  } catch (error) {
    next(error);
  }
};

export const uploadExpenseReceipt = async (req, res, next) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id);

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    if (req.memberRole === 'viewer') {
      return res.status(403).json({ message: 'Access denied: viewers cannot upload receipts' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No receipt file provided' });
    }

    const host = req.get('host');
    const protocol = req.protocol;
    expense.receiptUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
    await expense.save();

    res.status(200).json(expense);
  } catch (error) {
    next(error);
  }
};
