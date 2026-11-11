// 채팅과 관련된 이벤트를 핸들한다 
import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@ai-mafia/shared';

// 프론트엔드에서 채팅이 들어오면 나머지 플레이어들한테 메시지를 전달한다.
export function registerChatHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>
) {
  socket.on('chat:send', (data) => {
    console.log(data.message);
    io.to(data.roomCode).emit('chat:receive', {
      sender: data.sender,
      message: data.message,
      timestamp: new Date().toISOString()
    });
  });
}