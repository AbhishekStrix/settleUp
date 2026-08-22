import React, { useState } from 'react';
import axiosInstance from '../../api/axiosInstance';
import { X, Loader2, CreditCard, Zap, ShieldCheck } from 'lucide-react';
import { useCurrency } from '../../hooks/useCurrency';
import { useAuth } from '../../context/AuthContext';

const SettleModal = ({ isOpen, onClose, suggestion, groupId, onSuccess }) => {
  const { formatCurrency } = useCurrency();
  const { user } = useAuth();
  const [method, setMethod] = useState('razorpay');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !suggestion) return null;

  // Razorpay payment flow
  const handleRazorpayPayment = async () => {
    if (!window.Razorpay) {
      setError('Razorpay SDK failed to load. Please check your internet connection and reload the page.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      // 1. Create order on server
      const { data } = await axiosInstance.post(`/groups/${groupId}/payment/create-order`, {
        amount: suggestion.amount,
        toUser: suggestion.toUser._id,
      });

      const { order, keyId } = data;
      const razorpayKey = keyId || import.meta.env.VITE_RAZORPAY_KEY_ID;

      // 2. Configure Razorpay checkout options
      const options = {
        key: razorpayKey,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'SettleUp',
        description: `Settlement to ${suggestion.toUser.name}`,
        order_id: order.id,
        handler: async (response) => {
          try {
            setLoading(true);
            // 3. Verify payment signature on backend & record settlement
            const verifyRes = await axiosInstance.post(`/groups/${groupId}/payment/verify-payment`, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              toUser: suggestion.toUser._id,
              amount: suggestion.amount,
            });

            onSuccess(verifyRes.data.settlement);
            onClose();
          } catch (verifyErr) {
            console.error('Payment verification failed:', verifyErr);
            setError(verifyErr.response?.data?.message || 'Payment verification failed. Please contact support.');
          } finally {
            setLoading(false);
          }
        },
        prefill: {
          name: user?.name || suggestion.fromUser.name,
          email: user?.email || suggestion.fromUser.email,
        },
        theme: {
          color: '#10b981', // emerald theme
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
          },
        },
      };

      const razorpayInstance = new window.Razorpay(options);
      razorpayInstance.on('payment.failed', (response) => {
        console.error('Razorpay payment failed:', response.error);
        setError(response.error.description || 'Payment transaction failed');
        setLoading(false);
      });

      razorpayInstance.open();
    } catch (err) {
      console.error('Razorpay order creation failed:', err);
      setError(err.response?.data?.message || 'Failed to initiate Razorpay checkout');
      setLoading(false);
    }
  };

  // Manual settlement flow (Cash, UPI, Bank, etc.)
  const handleManualSettlement = async () => {
    setError('');
    setLoading(true);

    try {
      const response = await axiosInstance.post(`/groups/${groupId}/settle`, {
        toUser: suggestion.toUser._id,
        amount: suggestion.amount,
        method,
      });
      onSuccess(response.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record settlement');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (method === 'razorpay') {
      handleRazorpayPayment();
    } else {
      handleManualSettlement();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-900 p-6 shadow-2xl dark:shadow-none animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
            Settle Balance
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-500 dark:text-rose-400 border border-rose-500/20">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-3 rounded-lg bg-slate-50 dark:bg-slate-950 p-4 border border-slate-200 dark:border-slate-900/60 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Pay From</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{suggestion.fromUser.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Pay To</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{suggestion.toUser.name}</span>
            </div>
            <div className="flex justify-between items-center border-t border-slate-200 dark:border-slate-900 pt-2.5">
              <span className="text-slate-500 font-medium">Settle Amount</span>
              <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(suggestion.amount)}
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="methodSelect" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Payment Method
            </label>
            <select
              id="methodSelect"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="mt-1.5 block w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-sm text-slate-800 dark:text-white focus:border-emerald-500 focus:outline-none"
            >
              <option value="razorpay">⚡ Razorpay (Instant Online Pay)</option>
              <option value="cash">Cash (Manual)</option>
              <option value="upi">UPI (Manual)</option>
              <option value="bank">Bank Transfer (Manual)</option>
              <option value="other">Other (Manual)</option>
            </select>
          </div>

          {method === 'razorpay' && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>Test mode enabled: Cards, UPI, Netbanking simulation via Razorpay.</span>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className={`flex-grow flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 ${
                method === 'razorpay'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {method === 'razorpay' ? 'Processing...' : 'Recording...'}
                </>
              ) : method === 'razorpay' ? (
                <>
                  <Zap className="h-4 w-4 fill-current" />
                  Pay with Razorpay
                </>
              ) : (
                'Confirm Settlement'
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-grow rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettleModal;
