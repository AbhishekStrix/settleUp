import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import Loading from '../components/Loading';
import { ShieldAlert, Users, Check, X } from 'lucide-react';

const JoinGroup = () => {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [groupInfo, setGroupInfo] = useState(null);

  useEffect(() => {
    const fetchGroupInfo = async () => {
      try {
        const response = await axiosInstance.get(`/groups/invite/${inviteCode}`);
        setGroupInfo(response.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Invalid or expired invite code.');
      } finally {
        setLoading(false);
      }
    };

    fetchGroupInfo();
  }, [inviteCode]);

  const handleJoin = async () => {
    setJoining(true);
    setError('');
    try {
      const response = await axiosInstance.post(`/groups/join/${inviteCode}`);
      navigate(`/groups/${response.data._id}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to join group.');
      setJoining(false);
    }
  };

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-transparent px-4">
        <div className="mx-auto max-w-md w-full p-6 text-center space-y-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm dark:shadow-none">
          <ShieldAlert className="h-12 w-12 text-rose-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Join Group Failed</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">{error}</p>
          <Link
            to="/dashboard"
            className="inline-block w-full bg-emerald-500 text-slate-950 py-2.5 rounded-lg font-bold text-sm hover:bg-emerald-400 transition-colors text-slate-950"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-transparent px-4">
      <div className="mx-auto max-w-md w-full p-8 text-center space-y-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl shadow-emerald-500/5 dark:shadow-none">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
          <Users className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">You've been invited!</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Would you like to join the group <span className="font-semibold text-slate-800 dark:text-slate-200">{groupInfo?.name}</span>?
          </p>
        </div>

        {groupInfo?.description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 italic">
            "{groupInfo.description}"
          </p>
        )}

        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleJoin}
            disabled={joining}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 text-slate-950 py-3 rounded-xl font-bold text-sm hover:bg-emerald-400 transition-all active:scale-95 disabled:opacity-70 disabled:pointer-events-none"
          >
            {joining ? (
              <span className="h-4 w-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin"></span>
            ) : (
              <Check className="h-5 w-5" />
            )}
            {joining ? 'Joining...' : 'Accept Invite'}
          </button>
          <Link
            to="/dashboard"
            className="flex-1 flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-3 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
            Decline
          </Link>
        </div>
      </div>
    </div>
  );
};

export default JoinGroup;
