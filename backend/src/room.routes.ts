// 방 생성 및 참가에 관련된 이벤트를 핸들링한다
import { Router } from 'express';

const router = Router();
export const activeRooms = new Map();

// 닉네임 및 주제를 담고있는 텍스트 파일을 불러온다
const fs = require('fs');
const path = require('path');
function loadList(filename : string) {
  const filePath = path.join(__dirname, filename);
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line: string) => line.trim())
    .filter(Boolean); // removes empty lines
}
const themes = loadList('themes.txt');


router.post('/theme', (req, res) => {
    const roomCode = req.body.roomCode;

    // 1. 리퀘스트에 방 코드가 없으면 실패
    if (!roomCode) {
        return res.status(400).json({
            success: false,
            error: "Room code required."
        });
    }

    const room = activeRooms.get(roomCode);

    // 1.1 방 코드가 현재 활성화된 방 리스트에 없으면 실패 
    if (!room) {
        return res.status(404).json({
            success: false,
            error: "Invalid room code or room does not exist."
        });
    }

    // 2. 랜덤하게 주제 선정 및 저장
    const theme = themes[Math.floor(Math.random() * themes.length)];
    room["theme"] = theme;

    // 3. 성공 반환
    return res.json({
        success: true,
        theme: theme,
        roomCode: roomCode
    });
});
export default router;