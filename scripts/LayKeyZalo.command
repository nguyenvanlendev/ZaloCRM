#!/bin/bash
echo "======================================================="
echo "  ĐANG KHỞI ĐỘNG LẠI ZALO VỚI CỔNG DEBUG PORT 9222..."
echo "======================================================="

killall Zalo 2>/dev/null
sleep 1

/Applications/Zalo.app/Contents/MacOS/Zalo --remote-debugging-port=9222 >/dev/null 2>&1 &
echo "Đang chờ Zalo khởi động (khoảng 4 giây)..."
sleep 4

python3 -c "
import urllib.request, json

try:
    with urllib.request.urlopen('http://127.0.0.1:9222/json') as response:
        targets = json.loads(response.read().decode())
    target = next((t for t in targets if t.get('title') == 'Zalo'), targets[0] if targets else None)
    if not target:
        print('Không tìm thấy cửa sổ Zalo!')
        exit(1)
    ws_url = target.get('webSocketDebuggerUrl')
    print('WS URL:', ws_url)
except Exception as e:
    print('Lỗi kết nối Zalo:', e)
"

# Use osascript or node to evaluate
osascript -e '
tell application "Terminal"
    display dialog "Zalo đã mở với cổng 9222. Bạn có thể mở Chrome vào http://127.0.0.1:9222 để xem khóa!" buttons {"OK"} default button 1
end tell
'
