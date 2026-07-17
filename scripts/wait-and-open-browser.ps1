<#
Polls the dev server until it responds, opens it in the default browser, then
minimizes the console window (matched by a title substring). Runs detached from
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

$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
    try {
        # Invoke-WebRequest throws on a non-2xx/3xx response, so reaching this
        # line at all (regardless of status code) means the dev server is up.
        Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1 | Out-Null
        $ready = $true
        break
    } catch {
        # Server not up yet (or still starting) — keep polling.
    }
    Start-Sleep -Seconds 1
}

if (-not $ready) {
    exit 0
}

Start-Process $url

# Matched by substring, not exact equality: Windows prepends "Administrator: "
# to the console title when launch-app.bat is run elevated (the very scenario
# this script exists to handle reliably), and Windows Terminal can reformat
# the title further. An exact FindWindow match would silently never fire in
# either case, so this enumerates top-level windows and checks each title for
# the substring instead.
$sig = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class LauncherNativeWin {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
'@

try {
    Add-Type -TypeDefinition $sig -ErrorAction Stop

    $SW_MINIMIZE = 6
    $matched = [IntPtr]::Zero
    $callback = {
        param([IntPtr]$hWnd, [IntPtr]$lParam)
        if ([LauncherNativeWin]::IsWindowVisible($hWnd)) {
            $sb = New-Object System.Text.StringBuilder 256
            [LauncherNativeWin]::GetWindowText($hWnd, $sb, $sb.Capacity) | Out-Null
            if ($sb.ToString().Contains($WindowTitle)) {
                $script:matched = $hWnd
                return $false
            }
        }
        return $true
    }
    [LauncherNativeWin]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null

    if ($matched -ne [IntPtr]::Zero) {
        [LauncherNativeWin]::ShowWindowAsync($matched, $SW_MINIMIZE) | Out-Null
    }
} catch {
    # Minimizing is a cosmetic nicety — if the P/Invoke setup fails for any
    # reason, leave the console visible rather than crash this detached script.
}
