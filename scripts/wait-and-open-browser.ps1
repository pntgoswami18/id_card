<#
Polls the dev server until it responds, opens it in the default browser, then
minimizes the console window (matched by title). Runs detached from
launch-app.bat so browser-opening no longer depends on Vite's own --open
handling, which shells out via the `open` npm package and can behave
differently depending on how the parent console was launched (e.g.
elevated/Administrator). If the server never comes up within the timeout,
exits quietly without opening or minimizing, leaving the console visible so
the user can see whatever error `npm run dev` printed.
#>
param(
    [int]$Port = 5173,
    [string]$WindowTitle = "ID Card App - Dev Server"
)

$url = "http://localhost:$Port"
$ready = $false

for ($i = 0; $i -lt 60; $i++) {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1
        if ($response.StatusCode -ge 200) {
            $ready = $true
            break
        }
    } catch {
        # Server not up yet (or still starting) — keep polling.
    }
    Start-Sleep -Seconds 1
}

if (-not $ready) {
    exit 0
}

Start-Process $url

$sig = @'
using System;
using System.Runtime.InteropServices;
public class LauncherNativeWin {
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
'@
Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue

$SW_MINIMIZE = 6
$hwnd = [LauncherNativeWin]::FindWindow($null, $WindowTitle)
if ($hwnd -ne [IntPtr]::Zero) {
    [LauncherNativeWin]::ShowWindowAsync($hwnd, $SW_MINIMIZE) | Out-Null
}
