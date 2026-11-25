// 투표 관련 이벤트를 핸들링한다
import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@ai-mafia/shared';
import { activeRooms } from './room.routes.js';

// 방마다 투표 타이머를 저장
const voteTimers = new Map<string, ReturnType<typeof setTimeout>>();

// 투표 종료 및 결과 집계
export function finishVoting(
    io: Server<ClientToServerEvents, ServerToClientEvents>,
    roomCode: string
) {
    const room = activeRooms.get(roomCode);

    if (!room || room.gameState.phase !== 'vote') {
        return;
    }

    const timer = voteTimers.get(roomCode);
    if (timer) {
        clearTimeout(timer);
        voteTimers.delete(roomCode);
    }

    // 게임 종료 상태로 변경
    room.gameState.phase = 'ended';
    room.gameState.phaseEndsAt = null;

    // 플레이어들에게 투표 결과 전송
    io.to(roomCode).emit('vote:result', {
        votes: room.gameState.votes,
        voteCounts: room.gameState.voteCounts
    });

    console.log(`Voting finished in room ${roomCode}`);
}

// 투표 제한 시간 설정
export function startVotingTimer(
    io: Server<ClientToServerEvents, ServerToClientEvents>,
    roomCode: string,
    duration: number
) {
    const timer = setTimeout(() => {
        finishVoting(io, roomCode);
    }, duration * 1000);

    voteTimers.set(roomCode, timer);
}

// 투표 관련 이벤트
export function registerVoteHandlers(
    io: Server<ClientToServerEvents, ServerToClientEvents>,
    socket: Socket<ClientToServerEvents, ServerToClientEvents>
) {
    socket.on('vote:submit', (data) => {
        const room = activeRooms.get(data.roomCode);

        if (!room) {
            socket.emit('vote:ack', {
                success: false,
                error: 'Room does not exist'
            });
            return;
        }
        // 투표 단계인지 확인
        if (room.gameState.phase !== 'vote') {
            socket.emit('vote:ack', {
                success: false,
                error: 'Voting is not available'
            });
            return;
        }
        // 투표 시간 지났는지 확인
        if (room.gameState.phaseEndsAt === null || Date.now() >= room.gameState.phaseEndsAt) {
            finishVoting(io, data.roomCode);
            socket.emit('vote:ack', {
                success: false,
                error: 'Voting time has ended.'
            });
            return;
        }
        // 자기 자신에게 투표했는지 확인
        if (data.voterId === data.targetPlayerId) {
            socket.emit('vote:ack', {
                success: false,
                error: 'Cannot vote yourself.'
            });
            return;
        }
        // 이미 투표했는지 확인
        if (room.gameState.votes[data.voterId] !== undefined) {
            socket.emit('vote:ack', {
                success: false,
                error: 'You already voted.'
            });
            return;
        }
        // 누가 누구에게 투표했는지 저장
        room.gameState.votes[data.voterId] = data.targetPlayerId;
        // 투표 대상 득표수 증가
        room.gameState.voteCounts[data.targetPlayerId] = (room.gameState.voteCounts[data.targetPlayerId] ?? 0) + 1;
        // 투표 성공 알림
        socket.emit('vote:ack',{
            success: true
        });
        console.log(`Player ${data.voterId} voted for ${data.targetPlayerId}`);
        // 모든 플레이어가 투표했는지 확인
        const totalVotes = Object.keys(room.gameState.votes).length;
        
        if  (totalVotes === room.players.length) {
            finishVoting(io, data.roomCode);
        }
    });
}