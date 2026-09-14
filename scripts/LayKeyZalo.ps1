# SPDX-License-Identifier: AGPL-3.0-or-later
# LayKeyZalo.ps1 — Script tu dong trich xuat khoa giai ma UIN tu Zalo PC tren Windows

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$ErrorActionPreference = "Stop"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "   DANG KHOI DONG LAI ZALO PC VOI CONG DEBUG PORT 9222..." -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# 1. Dong Zalo neu dang chay
Get-Process -Name "Zalo" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# 2. Tim file Zalo.exe tren Windows
$paths = @(
    "$env:LocalAppData\Programs\Zalo\Zalo.exe",
    "$env:ProgramFiles\Zalo\Zalo.exe",
    "${env:ProgramFiles(x86)}\Zalo\Zalo.exe"
)

$zaloPath = $paths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $zaloPath) {
    Write-Host "[LOI] Khong tim thay file Zalo.exe tren may tinh!" -ForegroundColor Red
    Write-Host "Vui long kiem tra xem Zalo PC da duoc cai dat chua." -ForegroundColor Yellow
    return
}

Write-Host "Tim thay Zalo tai: $zaloPath" -ForegroundColor Gray

# 3. Mo Zalo voi cong debug 9222
Start-Process -FilePath $zaloPath -ArgumentList "--remote-debugging-port=9222"
Write-Host "Dang cho Zalo khoi dong..." -ForegroundColor Gray

# 4. Retry ket noi debug port (cho toi da 30 giay)
$maxRetries = 6
$retryDelay = 5
$res = $null

for ($i = 1; $i -le $maxRetries; $i++) {
    Start-Sleep -Seconds $retryDelay
    Write-Host "  Lan thu $i/$maxRetries - Ket noi cong 9222..." -ForegroundColor Gray
    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json" -TimeoutSec 5
        if ($res) {
            Write-Host "  => Ket noi thanh cong!" -ForegroundColor Green
            break
        }
    } catch {
        if ($i -eq $maxRetries) {
            Write-Host ""
            Write-Host "===================================================" -ForegroundColor Red
            Write-Host " [LOI] Khong the ket noi cong debug 9222!" -ForegroundColor Red
            Write-Host " Zalo PC khong mo cong debug. Thu lai sau." -ForegroundColor Yellow
            Write-Host "===================================================" -ForegroundColor Red
            return
        }
        Write-Host "  => Chua san sang, cho them ${retryDelay}s..." -ForegroundColor DarkGray
    }
}

# 5. Ket noi lay UIN qua WebSocket Chrome DevTools Protocol
try {
    $target = $res | Where-Object { $_.title -eq "Zalo" } | Select-Object -First 1
    if (-not $target) { $target = $res[0] }
    if (-not $target -or -not $target.webSocketDebuggerUrl) {
        throw "Khong tim thay cua so Zalo tren cong 9222."
    }

    Write-Host "Dang doc khoa UIN tu Zalo..." -ForegroundColor Gray

    $wsUri = [System.Uri]$target.webSocketDebuggerUrl
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $cts = New-Object System.Threading.CancellationTokenSource
    $cts.CancelAfter(60000)

    [void]$ws.ConnectAsync($wsUri, $cts.Token).GetAwaiter().GetResult()

    # JavaScript evaluate tren React Fiber cua Zalo PC
    $jsCode = @"
(() => {
    try {
        const el = document.querySelector("#app-page") || document.querySelector("#app");
        if (!el) return { error: "no_app_element" };
        const k = Object.keys(el).find(k => k.startsWith("__reactInternalInstance") || k.startsWith("__reactFiber"));
        if (!k) return { error: "no_react_fiber", keys: Object.keys(el).slice(0,5).join(",") };
        let node = el[k];
        let rootStore = null;
        let depth = 0;
        while (node && depth < 200) {
            const s = node.memoizedProps && node.memoizedProps.store
                   || node.stateNode && node.stateNode.store
                   || node.context && node.context.store;
            if (s && typeof s.getState === "function") {
                const state = s.getState();
                if (state && state.conversations) {
                    rootStore = s;
                    break;
                }
            }
            node = node.return;
            depth++;
        }
        if (!rootStore) return { error: "no_store", depth: depth };
        const state = rootStore.getState();
        const user = state.user || state.auth || state.account;
        if (!user) return { error: "no_user_state", stateKeys: Object.keys(state).slice(0,10).join(",") };
        return {
            uid: user.userId || user.uid || user.id,
            uin: user.UIN || user.uin || user.imei,
            displayName: user.displayName || user.name || "unknown"
        };
    } catch(e) {
        return { error: e.message };
    }
})()
"@

    # Retry JS evaluation toi da 5 lan (Zalo can thoi gian load UI)
    $user = $null
    $lastDebug = ""
    for ($attempt = 1; $attempt -le 5; $attempt++) {
        $rpc = @{
            id = $attempt
            method = "Runtime.evaluate"
            params = @{
                expression = $jsCode
                returnByValue = $true
            }
        } | ConvertTo-Json -Compress

        $sendBytes = [System.Text.Encoding]::UTF8.GetBytes($rpc)
        $sendSegment = New-Object "System.ArraySegment[byte]" (,$sendBytes)
        [void]$ws.SendAsync($sendSegment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).GetAwaiter().GetResult()

        $recvBuffer = New-Object byte[] 65536
        $recvSegment = New-Object "System.ArraySegment[byte]" (,$recvBuffer)
        $recvResult = $ws.ReceiveAsync($recvSegment, $cts.Token).GetAwaiter().GetResult()

        $responseJson = [System.Text.Encoding]::UTF8.GetString($recvBuffer, 0, $recvResult.Count)
        $parsed = $responseJson | ConvertFrom-Json
        $value = $parsed.result.result.value

        if ($value -and $value.uin) {
            $user = $value
            break
        }

        # Debug: hien thi ket qua JS
        if ($value -and $value.error) {
            $lastDebug = $value.error
            if ($value.stateKeys) { $lastDebug += " (keys: $($value.stateKeys))" }
        } else {
            $lastDebug = $responseJson.Substring(0, [Math]::Min(200, $responseJson.Length))
        }
        Write-Host "  Lan $attempt/5 - Zalo chua san sang ($lastDebug). Cho 3s..." -ForegroundColor DarkGray
        Start-Sleep -Seconds 3
    }

    try { [void]$ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [System.Threading.CancellationToken]::None).GetAwaiter().GetResult() } catch {}

    if ($user -and $user.uin) {
        # Copy UIN vao clipboard cua Windows
        if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
            Set-Clipboard -Value $user.uin
        } else {
            $user.uin | clip
        }

        Write-Host ""
        Write-Host "===================================================" -ForegroundColor Green
        Write-Host "       LAY KHOA GIAI MA ZALO PC THANH CONG!" -ForegroundColor Green
        Write-Host "===================================================" -ForegroundColor Green
        Write-Host " Tai khoan : $($user.displayName) (UID: $($user.uid))" -ForegroundColor White
        Write-Host " Khoa UIN  : $($user.uin)" -ForegroundColor Yellow
        Write-Host "===================================================" -ForegroundColor Green
        Write-Host " >>> DA TU DONG COPY MA KHOA (UIN) VAO CLIPBOARD! <<<" -ForegroundColor Cyan
        Write-Host " Ban chi can bam Ctrl + V de dan va gui cho Ky thuat." -ForegroundColor Cyan
        Write-Host "===================================================" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "===================================================" -ForegroundColor Red
        Write-Host " [LOI] Khong doc duoc UIN sau 5 lan thu!" -ForegroundColor Red
        Write-Host " Debug: $lastDebug" -ForegroundColor Yellow
        Write-Host " Hay chac chan Zalo PC da DANG NHAP thanh cong." -ForegroundColor Yellow
        Write-Host "===================================================" -ForegroundColor Red
    }
} catch {
    $innerMsg = $_.Exception.InnerException
    $detail = if ($innerMsg) { $innerMsg.Message } else { $_.Exception.Message }
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Red
    Write-Host " [LOI] Khong the doc khoa tu Zalo PC!" -ForegroundColor Red
    Write-Host " Chi tiet: $detail" -ForegroundColor Yellow
    Write-Host " Hay dam bao Zalo PC dang mo va da dang nhap." -ForegroundColor Yellow
    Write-Host "===================================================" -ForegroundColor Red
}

