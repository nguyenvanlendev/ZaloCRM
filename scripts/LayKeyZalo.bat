@echo off
chcp 65001 >nul
title Lay Khoa Giai Ma Zalo PC

if exist "%~dp0LayKeyZalo.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0LayKeyZalo.ps1"
    pause
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = Get-Content -LiteralPath '%~f0' -Encoding UTF8 | Select-Object -Skip 14 | Out-String; Invoke-Expression $s"
pause
exit /b

# ==============================================================================
# PHẦN POWERSHELL NHÚNG (Tự chạy khi người dùng chỉ lưu duy nhất 1 file .bat này)
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "   ĐANG KHỞI ĐỘNG LẠI ZALO PC VỚI CỔNG DEBUG PORT 9222..." -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# 1. Đóng Zalo nếu đang chạy
Get-Process -Name "Zalo" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# 2. Tìm file Zalo.exe trên Windows
$paths = @(
    "$env:LocalAppData\Programs\Zalo\Zalo.exe",
    "$env:ProgramFiles\Zalo\Zalo.exe",
    "${env:ProgramFiles(x86)}\Zalo\Zalo.exe"
)

$zaloPath = $paths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $zaloPath) {
    Write-Host "[LỖI] Không tìm thấy file Zalo.exe trên máy tính!" -ForegroundColor Red
    Write-Host "Vui lòng kiểm tra xem Zalo PC đã được cài đặt chưa." -ForegroundColor Yellow
    return
}

# 3. Mở Zalo với cổng debug 9222
Start-Process -FilePath $zaloPath -ArgumentList "--remote-debugging-port=9222"
Write-Host "Đang chờ Zalo khởi động (khoảng 5 giây)..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# 4. Kết nối lấy UIN qua WebSocket Chrome DevTools Protocol
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json" -TimeoutSec 5
    $target = $res | Where-Object { $_.title -eq "Zalo" } | Select-Object -First 1
    if (-not $target) { $target = $res[0] }
    if (-not $target -or -not $target.webSocketDebuggerUrl) {
        throw "Không tìm thấy cửa sổ Zalo trên cổng 9222. Hãy chắc chắn Zalo đã mở và hiển thị!"
    }

    $wsUri = [System.Uri]$target.webSocketDebuggerUrl
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $cts = New-Object System.Threading.CancellationTokenSource
    $cts.CancelAfter(10000)

    $ws.ConnectAsync($wsUri, $cts.Token).Wait()

    # JavaScript evaluate trên React Fiber của Zalo PC
    $jsCode = @"
(() => {
    const el = document.querySelector("#app-page") || document.querySelector("#app");
    if (!el) return null;
    const k = Object.keys(el).find(k => k.startsWith("__reactInternalInstance") || k.startsWith("__reactFiber"));
    let node = el[k];
    let rootStore = null;
    while (node) {
        const s = node.memoizedProps?.store || node.stateNode?.store || node.context?.store;
        if (s && s.getState && s.getState().conversations) {
            rootStore = s;
            break;
        }
        node = node.return;
    }
    const user = rootStore?.getState()?.user;
    return user ? { uid: user.userId, uin: user.UIN, displayName: user.displayName } : null;
})()
"@

    $rpc = @{
        id = 1
        method = "Runtime.evaluate"
        params = @{
            expression = $jsCode
            returnByValue = $true
        }
    } | ConvertTo-Json -Compress

    $sendBytes = [System.Text.Encoding]::UTF8.GetBytes($rpc)
    $sendSegment = New-Object "System.ArraySegment[byte]" (,$sendBytes)
    $ws.SendAsync($sendSegment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()

    $recvBuffer = New-Object byte[] 65536
    $recvSegment = New-Object "System.ArraySegment[byte]" (,$recvBuffer)
    $recvTask = $ws.ReceiveAsync($recvSegment, $cts.Token)
    $recvTask.Wait()

    $responseJson = [System.Text.Encoding]::UTF8.GetString($recvBuffer, 0, $recvTask.Result.Count)
    $parsed = $responseJson | ConvertFrom-Json
    $user = $parsed.result.result.value

    $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [System.Threading.CancellationToken]::None).Wait()

    if ($user -and $user.uin) {
        # Copy UIN vào clipboard của Windows (hỗ trợ cả Windows 7/8/10/11)
        if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
            Set-Clipboard -Value $user.uin
        } else {
            $user.uin | clip
        }

        Write-Host ""
        Write-Host "===================================================" -ForegroundColor Green
        Write-Host "       LẤY KHÓA GIẢI MÃ ZALO PC THÀNH CÔNG!" -ForegroundColor Green
        Write-Host "===================================================" -ForegroundColor Green
        Write-Host " Tài khoản : $($user.displayName) (UID: $($user.uid))" -ForegroundColor White
        Write-Host " Khóa UIN  : $($user.uin)" -ForegroundColor Yellow
        Write-Host "===================================================" -ForegroundColor Green
        Write-Host " >>> ĐÃ TỰ ĐỘNG COPY MÃ KHÓA (UIN) VÀO CLIPBOARD! <<<" -ForegroundColor Cyan
        Write-Host " Bạn chỉ cần bấm Ctrl + V để dán và gửi cho Kỹ thuật." -ForegroundColor Cyan
        Write-Host "===================================================" -ForegroundColor Green
    } else {
        throw "Chưa đọc được mã UIN. Hãy chắc chắn Zalo PC đã đăng nhập tài khoản thành công!"
    }
} catch {
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Red
    Write-Host " [LỖI] Không thể đọc khóa từ Zalo PC!" -ForegroundColor Red
    Write-Host " Chi tiết: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host " Hãy đảm bảo Zalo PC đang mở và đã đăng nhập trước khi chạy." -ForegroundColor Yellow
    Write-Host "===================================================" -ForegroundColor Red
}
