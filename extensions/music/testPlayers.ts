import { execFile } from 'node:child_process';

// TODO: Проверить на компе Яны
function runPowerShell(script: string, env = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, ...env } },
      (err, stdout, stderr) =>
        err ? reject(Object.assign(err, { stderr })) : resolve(stdout.trim()),
    );
  });
}

// Общий пролог: обёртка над IAsyncOperation (WinRT-асинхронность) + менеджер сессий
const PREAMBLE = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*' })[0]
function Await($t, $rt) {
  $task = $asTaskGeneric.MakeGenericMethod($rt).Invoke($null, @($t))
  $task.Wait(-1) | Out-Null
  $task.Result
}
$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
`;

async function listPlayers() {
  const out = await runPowerShell(
    PREAMBLE +
      `
$out = $manager.GetSessions() | ForEach-Object { [PSCustomObject]@{
  id     = $_.SourceAppUserModelId
  title  = $_.MediaProperties.Title
  artist = $_.MediaProperties.Artist
  status = [string]$_.PlaybackInfo.PlaybackStatus
} }
if ($out) { $out | ConvertTo-Json -Compress } else { '[]' }
`,
  );
  const parsed = JSON.parse(out);
  return Array.isArray(parsed) ? parsed : [parsed]; // ConvertTo-Json отдаёт одиночный объект без массива
}

async function pausePlayer(id: number | string) {
  return runPowerShell(
    PREAMBLE +
      `
$target = $manager.GetSessions() |
  Where-Object { $_.SourceAppUserModelId -eq $env:SMTC_TARGET } | Select-Object -First 1
if (-not $target) { 'NOT_FOUND'; exit }
Await ($target.TryPauseAsync()) ([bool]) | Out-Null
'OK'
`,
    { SMTC_TARGET: id },
  );
}

(async () => {
  const players = await listPlayers();
  console.table(players);

  const arg = process.argv[2]; // индекс из таблицы, id или название трека
  if (arg) {
    const target = players.find((p) => p.id === arg || p.title === arg) ?? players[Number(arg) - 1];
    if (!target) {
      console.error('Плеер не найден');
      process.exit(1);
    }
    console.log(await pausePlayer(target.id));
  }
})().catch((err) => {
  console.error(err.stderr || err);
  process.exit(1);
});
