import { useEffect } from 'react';
import { useSocket } from '../context/SocketContext';

export const useGroupSocket = (
  groupId,
  onExpenseAdded,
  onExpenseUpdated,
  onExpenseDeleted,
  onSettlementMade,
  onSettlementDeleted
) => {
  const socket = useSocket();

  useEffect(() => {
    if (!socket || !groupId) return;

    socket.emit('join-group', { groupId });

    if (onExpenseAdded) socket.on('expense:added', onExpenseAdded);
    if (onExpenseUpdated) socket.on('expense:updated', onExpenseUpdated);
    if (onExpenseDeleted) socket.on('expense:deleted', onExpenseDeleted);
    if (onSettlementMade) socket.on('settlement:made', onSettlementMade);
    if (onSettlementDeleted) socket.on('settlement:deleted', onSettlementDeleted);

    return () => {
      socket.emit('leave-group', { groupId });
      if (onExpenseAdded) socket.off('expense:added', onExpenseAdded);
      if (onExpenseUpdated) socket.off('expense:updated', onExpenseUpdated);
      if (onExpenseDeleted) socket.off('expense:deleted', onExpenseDeleted);
      if (onSettlementMade) socket.off('settlement:made', onSettlementMade);
      if (onSettlementDeleted) socket.off('settlement:deleted', onSettlementDeleted);
    };
  }, [socket, groupId, onExpenseAdded, onExpenseUpdated, onExpenseDeleted, onSettlementMade, onSettlementDeleted]);
};

export default useGroupSocket;
