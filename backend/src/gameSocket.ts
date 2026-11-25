// 게임 시작 및 단계 전환 관련된 이벤트를 핸들링한다
import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@ai-mafia/shared';
import { DISCUSSION_TIME, VOTING_TIME } from '@ai-mafia/shared';
import { activeRooms } from './room.routes';
import { startVotingTimer } from './voteSocket';

// 게임 진행 관련 이벤트 등록
export function registerGameHandlers(
    io: Server<ClientToServerEvents, ServerToClientEvents>,
    socket: Socket<ClientToServerEvents, ServerToClientEvents>
){
    // 호스트가 시작 버튼 누름
    socket.on('game:start', (data) => {
        const room = activeRooms.get(data.roomCode);

        if (!room) {
            console.log('Room does not exist.');
            return;
        }

        const player = room.players.find(
            (p: {id: number}) => p.id === data.playerId
        );

        if (!player || !player.isHost) {
            console.log(`Only host can start the game.`);
            return;
        }

        if (room.gameState.phase !== 'lobby') {
            console.log(`Game already started.`);
            return;
        }
        // 토론 단계 시작
        room.gameState.phase = 'day';
        room.gameState.phaseEndsAt = Date.now() + DISCUSSION_TIME * 1000;

        // 플레이어들에게 단계 변경 메세지
        io.to(data.roomCode).emit('game:phaseChanged', {
            phase: 'day',
            phaseEndsAt: room.gameState.phaseEndsAt
        });

        console.log(`Game started in room ${data.roomCode}`);

        // 토론 제한 시간 지나면 투표 단계로 변경
        setTimeout(() => {
            if (room.gameState.phase !== 'day') {
                return;
            }
            
            room.gameState.phase = 'vote';
            room.gameState.phaseEndsAt = Date.now() + VOTING_TIME * 1000;
            
            io.to(data.roomCode).emit('game:phaseChanged', {
                phase: 'vote',
                phaseEndsAt: room.gameState.phaseEndsAt
            });
            startVotingTimer(io, data.roomCode, VOTING_TIME);
            console.log(`Voting started in room ${data.roomCode}`);
        }, DISCUSSION_TIME * 1000);
    });
}