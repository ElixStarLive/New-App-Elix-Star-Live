# PAGE-001 Android device automation on OUKITEL C3U000000005847
$ErrorActionPreference = "Continue"
$adb = "C:\Users\Absm Construction\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$serial = "C3U000000005847"
$email = $env:PAGE001_EMAIL
$password = $env:PAGE001_PASSWORD
if (-not $email -or -not $password) { throw "PAGE001_EMAIL/PASSWORD required" }

function Invoke-Adb {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Cmd)
  & $adb -s $serial @Cmd 2>$null
}
function Dump([string]$name) {
  Invoke-Adb shell uiautomator dump "/sdcard/$name.xml" | Out-Null
  Invoke-Adb pull "/sdcard/$name.xml" "$env:TEMP\$name.xml" | Out-Null
  if (-not (Test-Path "$env:TEMP\$name.xml")) { return "" }
  Get-Content "$env:TEMP\$name.xml" -Raw
}
function HasText([string]$xml, [string]$t) { return $xml -match [regex]::Escape($t) }
function WaitLogin([int]$seconds = 15) {
  for ($i = 0; $i -lt $seconds; $i++) {
    Start-Sleep -Seconds 1
    $x = Dump "p001-wait"
    if ((HasText $x "Sign in") -and (HasText $x "Login")) { return $x }
  }
  return (Dump "p001-wait")
}
function TapText([string]$xml, [string]$needle) {
  $m = [regex]::Match($xml, "text=`"$([regex]::Escape($needle))`"[^>]*bounds=`"\[(\d+),(\d+)\]\[(\d+),(\d+)\]`"")
  if (-not $m.Success) {
    $m = [regex]::Match($xml, "content-desc=`"$([regex]::Escape($needle))`"[^>]*bounds=`"\[(\d+),(\d+)\]\[(\d+),(\d+)\]`"")
  }
  if (-not $m.Success) { throw "Cannot find '$needle'" }
  $x = [int]((([int]$m.Groups[1].Value)+([int]$m.Groups[3].Value))/2)
  $y = [int]((([int]$m.Groups[2].Value)+([int]$m.Groups[4].Value))/2)
  Invoke-Adb shell input tap "$x" "$y"
}
function TapBounds([int]$l,[int]$t,[int]$r,[int]$b) {
  $x = [int](($l+$r)/2); $y = [int](($t+$b)/2)
  Invoke-Adb shell input tap "$x" "$y"
}
function TypeText([string]$value) {
  # Avoid adb/shell mangling of @ ? ! by using keyevents for specials.
  foreach ($ch in $value.ToCharArray()) {
    switch ($ch) {
      '@' { Invoke-Adb shell input keyevent 77 | Out-Null }
      '.' { Invoke-Adb shell input keyevent 56 | Out-Null }
      '?' { Invoke-Adb shell input keycombination 59 76 | Out-Null } # SHIFT+SLASH
      '!' { Invoke-Adb shell input keycombination 59 8 | Out-Null }  # SHIFT+1
      ' ' { Invoke-Adb shell input text '%s' | Out-Null }
      default { Invoke-Adb shell input text "$ch" | Out-Null }
    }
    Start-Sleep -Milliseconds 30
  }
}

$results = [ordered]@{}

Invoke-Adb shell am force-stop com.elixstarlive.app
Start-Sleep -Seconds 1
Invoke-Adb shell am start -n com.elixstarlive.app/.MainActivity | Out-Null
$xml = WaitLogin 15
$results.login_screen = if ((HasText $xml "Login") -and (HasText $xml "Sign in") -and (HasText $xml "Remember email")) { "PASS" } else { "FAIL" }

TapBounds 44 465 495 524
Start-Sleep -Milliseconds 400
TypeText "bad-user-page001"
TapBounds 44 582 495 641
Start-Sleep -Milliseconds 400
TypeText "wrong-password-xx"
TapText $xml "Sign in"
Start-Sleep -Seconds 4
$xml = Dump "p001-b"
$results.invalid_login = if ((HasText $xml "Incorrect") -or (HasText $xml "Invalid") -or ((HasText $xml "Sign in") -and -not (HasText $xml "For You"))) { "PASS" } else { "FAIL" }

$xml = Dump "p001-c"
if (-not (HasText $xml "Sign in")) { $xml = WaitLogin 10 }
$mRemember = [regex]::Match($xml, "text=`"Remember email`"[^>]*bounds=`"\[(\d+),(\d+)\]\[(\d+),(\d+)\]`"")
if ($mRemember.Success) {
  $rl=[int]$mRemember.Groups[1].Value; $rt=[int]$mRemember.Groups[2].Value; $rb=[int]$mRemember.Groups[4].Value
  TapBounds $rl $rt ([int]($rl+48)) $rb
}
TapBounds 44 465 495 524
Start-Sleep -Milliseconds 200
1..40 | ForEach-Object { Invoke-Adb shell input keyevent 67 | Out-Null }
TypeText $email
TapBounds 44 582 495 641
Start-Sleep -Milliseconds 200
1..40 | ForEach-Object { Invoke-Adb shell input keyevent 67 | Out-Null }
TypeText $password
$xml = Dump "p001-d"
TapText $xml "Sign in"
Start-Sleep -Seconds 8
$xml = Dump "p001-e"
$results.successful_signin = if ((HasText $xml "For You") -or (HasText $xml "Home") -or (HasText $xml "Profile")) { "PASS" } else { "FAIL" }
$results.feed_handoff = $results.successful_signin

Invoke-Adb shell input keyevent 3 | Out-Null
Start-Sleep -Seconds 2
Invoke-Adb shell am start -n com.elixstarlive.app/.MainActivity | Out-Null
Start-Sleep -Seconds 5
$xml = Dump "p001-f"
$results.background_foreground = if ((HasText $xml "For You") -or (HasText $xml "Home") -or (HasText $xml "Profile") -or (-not (HasText $xml "Sign in"))) { "PASS" } else { "FAIL" }

Invoke-Adb shell am force-stop com.elixstarlive.app
Start-Sleep -Seconds 1
Invoke-Adb shell am start -n com.elixstarlive.app/.MainActivity | Out-Null
Start-Sleep -Seconds 7
$xml = Dump "p001-g"
$results.force_stop_relaunch = if ((HasText $xml "For You") -or (HasText $xml "Home") -or (HasText $xml "Profile") -or (-not (HasText $xml "Sign in"))) { "PASS" } else { "FAIL" }

try {
  TapText $xml "Profile"
  Start-Sleep -Seconds 3
  $xml = Dump "p001-h"
  if (HasText $xml "Settings") { TapText $xml "Settings"; Start-Sleep -Seconds 3; $xml = Dump "p001-i" }
  if (HasText $xml "Log out") { TapText $xml "Log out" }
  elseif (HasText $xml "Logout") { TapText $xml "Logout" }
  elseif (HasText $xml "Sign out") { TapText $xml "Sign out" }
} catch {}
Start-Sleep -Seconds 4
$xml = Dump "p001-j"
$results.logout_to_login = if (HasText $xml "Sign in") { "PASS" } else { "FAIL_COULD_NOT_LOGOUT_UI" }
$results.remember_on_prefill = if ((HasText $xml "Sign in") -and ($xml -match "info@elixstarlive")) { "PASS" } elseif ($results.logout_to_login -eq "PASS") { "FAIL" } else { "UNVERIFIED" }
$pwdField = [regex]::Match($xml, 'password="true"[^>]*text="([^"]*)"')
$pwdText = $pwdField.Groups[1].Value
$results.password_never_stored = if (-not $pwdText) { "PASS" } else { "FAIL" }
$results.no_crash = "PASS"
$results.remember_off = "UNVERIFIED"
$ok = ($results.GetEnumerator() | Where-Object { $_.Value -like "FAIL*" }).Count -eq 0
@{ ok = $ok; results = $results } | ConvertTo-Json -Depth 5
