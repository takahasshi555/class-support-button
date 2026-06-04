$ErrorActionPreference = "Stop"

$port = 5173
$prefix = "http://localhost:$port/"
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)

$script:state = @{
    understood = @{}
    lost = @{}
    wow = 0
    resetVersion = 0
}

function Send-Text {
    param (
        [System.Net.Sockets.NetworkStream]$Stream,
        [string]$Text,
        [string]$ContentType = "text/plain; charset=utf-8",
        [int]$StatusCode = 200
    )

    $reason = if ($StatusCode -eq 200) { "OK" } elseif ($StatusCode -eq 404) { "Not Found" } else { "Internal Server Error" }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $headers = "HTTP/1.1 $StatusCode $reason`r`nContent-Type: $ContentType`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    $Stream.Write($bytes, 0, $bytes.Length)
}

function Get-StateJson {
    $understood = $script:state.understood.Count
    $lost = $script:state.lost.Count
    $participants = @{}

    foreach ($key in $script:state.understood.Keys) {
        $participants[$key] = $true
    }

    foreach ($key in $script:state.lost.Keys) {
        $participants[$key] = $true
    }

    @{
        counts = @{
            understood = $understood
            lost = $lost
        }
        reactions = @{
            wow = $script:state.wow
        }
        totalResponses = $understood + $lost
        participants = $participants.Count
        resetVersion = $script:state.resetVersion
    } | ConvertTo-Json -Compress
}

function Get-RequestBody {
    param ([string]$Body)

    if ([string]::IsNullOrWhiteSpace($Body)) {
        return @{}
    }

    try {
        return $Body | ConvertFrom-Json
    }
    catch {
        return @{}
    }
}

function Read-HttpRequest {
    param ([System.Net.Sockets.NetworkStream]$Stream)

    $buffer = New-Object byte[] 65536
    $builder = [System.Collections.Generic.List[byte]]::new()
    $deadline = [DateTime]::UtcNow.AddSeconds(2)

    while ([DateTime]::UtcNow -lt $deadline) {
        if ($Stream.DataAvailable) {
            $read = $Stream.Read($buffer, 0, $buffer.Length)
            if ($read -le 0) {
                break
            }

            for ($i = 0; $i -lt $read; $i++) {
                $builder.Add($buffer[$i])
            }

            $text = [System.Text.Encoding]::UTF8.GetString($builder.ToArray())
            $headerEnd = $text.IndexOf("`r`n`r`n")
            if ($headerEnd -ge 0) {
                $headersText = $text.Substring(0, $headerEnd)
                $contentLength = 0

                foreach ($line in $headersText -split "`r`n") {
                    if ($line -match '^Content-Length:\s*(\d+)') {
                        $contentLength = [int]$matches[1]
                    }
                }

                $bodyBytes = $builder.Count - ($headerEnd + 4)
                if ($bodyBytes -ge $contentLength) {
                    break
                }
            }
        }
        else {
            Start-Sleep -Milliseconds 10
        }
    }

    $raw = [System.Text.Encoding]::UTF8.GetString($builder.ToArray())
    $parts = $raw -split "`r`n`r`n", 2
    $head = $parts[0]
    $body = if ($parts.Count -gt 1) { $parts[1] } else { "" }
    $requestLine = ($head -split "`r`n")[0]
    $requestParts = $requestLine -split " "

    @{
        Method = if ($requestParts.Count -gt 0) { $requestParts[0] } else { "" }
        Path = if ($requestParts.Count -gt 1) { ($requestParts[1] -split "\?")[0] } else { "/" }
        Body = $body
    }
}

function Get-PageHtml {
@'
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>授業理解確認ボタン</title>
    <style>
      :root {
        color: #17211b;
        background: #f5f2ea;
        font-family: "Yu Gothic", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif;
      }

      * { box-sizing: border-box; }
      body { margin: 0; min-width: 320px; }
      button, a { font: inherit; }
      button { cursor: pointer; }

      .teacher-layout {
        display: grid;
        gap: 22px;
        grid-template-columns: minmax(0, 1fr) 360px;
        min-height: 100vh;
        padding: 22px;
      }

      .panel {
        background: #fffdf8;
        border: 1px solid #ded7c8;
        border-radius: 8px;
        padding: 24px;
      }

      .header {
        align-items: flex-start;
        display: flex;
        gap: 16px;
        justify-content: space-between;
        margin-bottom: 24px;
      }

      .eyebrow {
        color: #526357;
        font-size: 0.86rem;
        font-weight: 800;
        margin: 0 0 8px;
      }

      h1, h2, p { margin-top: 0; }
      h1 { font-size: clamp(2rem, 5vw, 4rem); line-height: 1.05; margin-bottom: 10px; }
      h2 { font-size: 1.35rem; margin-bottom: 12px; }

      .note { color: #526357; line-height: 1.7; }

      .reset {
        background: #f3e3dd;
        border: 0;
        border-radius: 8px;
        color: #8c341f;
        font-weight: 800;
        min-height: 46px;
        padding: 0 18px;
        white-space: nowrap;
      }

      .metrics {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        margin-bottom: 24px;
      }

      .metric {
        background: #eff4ee;
        border-radius: 8px;
        padding: 16px;
      }

      .metric span, .bar-label span {
        color: #526357;
        display: block;
        font-size: 0.88rem;
        font-weight: 700;
      }

      .metric strong {
        display: block;
        font-size: 2rem;
        margin-top: 6px;
      }

      .bars { display: grid; gap: 22px; }
      .bar-label { align-items: baseline; display: flex; justify-content: space-between; margin-bottom: 8px; }
      .bar-label strong { font-size: 1.25rem; }
      .track { background: #ebe5d7; border-radius: 8px; height: 58px; overflow: hidden; }
      .fill { height: 100%; transition: width 180ms ease; }
      .understood { background: #2d8a58; }
      .lost { background: #c8523f; }
      .wow { background: #d69c2f; }

      .reaction {
        align-items: center;
        background: #fff3cf;
        border-radius: 8px;
        display: flex;
        gap: 18px;
        justify-content: space-between;
        margin-top: 24px;
        padding: 20px;
      }

      .reaction span { color: #6f4a00; display: block; font-weight: 800; }
      .reaction strong { display: block; font-size: 2.4rem; }
      .reaction p { color: #6f4a00; line-height: 1.6; margin: 0; }

      .join-link {
        background: #eff4ee;
        border-radius: 8px;
        color: #17211b;
        display: block;
        font-weight: 800;
        overflow-wrap: anywhere;
        padding: 14px;
      }

      .student-shell {
        margin: 0 auto;
        max-width: 560px;
        min-height: 100vh;
        padding: 22px;
      }

      .choices { display: grid; gap: 12px; }
      .choice {
        border: 0;
        border-radius: 8px;
        color: #fff;
        display: grid;
        min-height: 112px;
        padding: 20px;
        text-align: left;
        width: 100%;
      }

      .choice strong { display: block; font-size: clamp(1.7rem, 8vw, 2.3rem); line-height: 1.1; }
      .choice small { display: block; font-size: 0.98rem; margin-top: 8px; }
      .choice.selected { outline: 5px solid #17211b; outline-offset: 3px; }
      .wow-button { margin-top: 18px; }

      .status {
        background: #fffdf8;
        border: 1px solid #ded7c8;
        border-radius: 8px;
        font-weight: 800;
        margin: 18px 0 0;
        padding: 16px;
        text-align: center;
      }

      @media (max-width: 860px) {
        .teacher-layout { grid-template-columns: 1fr; padding: 14px; }
        .metrics { grid-template-columns: 1fr; }
        .header { display: grid; }
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script>
      const path = location.pathname;
      const clientKey = "understanding-local-web-client-id";
      const labels = { understood: "わかった", lost: "わからない" };
      let selected = localStorage.getItem("understanding-local-web-selected") || "";
      let resetVersion = null;

      function clientId() {
        let id = localStorage.getItem(clientKey);
        if (!id) {
          id = crypto.randomUUID();
          localStorage.setItem(clientKey, id);
        }
        return id;
      }

      async function postJson(url, data) {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
      }

      function teacherHtml() {
        const joinUrl = location.origin + "/room";
        return `
          <main class="teacher-layout">
            <section class="panel">
              <div class="header">
                <div>
                  <p class="eyebrow">先生画面</p>
                  <h1>授業理解確認</h1>
                  <p class="note">学生には右のURLを開いてもらいます。同じPCで試す場合は別タブで開けます。</p>
                </div>
                <button class="reset" type="button" id="resetButton">リセット</button>
              </div>
              <div class="metrics">
                <div class="metric"><span>回答数</span><strong id="totalCount">0件</strong></div>
                <div class="metric"><span>参加者</span><strong id="participantCount">0人</strong></div>
                <div class="metric"><span>リセット</span><strong id="resetCount">0回</strong></div>
              </div>
              <div class="bars">
                <div>
                  <div class="bar-label"><span>わかった</span><strong id="understoodText">0人 / 0%</strong></div>
                  <div class="track"><div class="fill understood" id="understoodBar"></div></div>
                </div>
                <div>
                  <div class="bar-label"><span>わからない</span><strong id="lostText">0人 / 0%</strong></div>
                  <div class="track"><div class="fill lost" id="lostBar"></div></div>
                </div>
              </div>
              <div class="reaction">
                <div><span>へぇー</span><strong id="wowCount">0回</strong></div>
                <p>理解度とは別に、押した回数を数えます。</p>
              </div>
            </section>
            <aside class="panel">
              <p class="eyebrow">学生参加</p>
              <h2>参加URL</h2>
              <a class="join-link" href="${joinUrl}" target="_blank">${joinUrl}</a>
            </aside>
          </main>`;
      }

      function studentHtml() {
        return `
          <main class="student-shell">
            <section>
              <p class="eyebrow">学生画面 匿名回答</p>
              <h1>今の理解度は？</h1>
              <p class="note">わかった/わからないは押し直せます。へぇーは何回でも押せます。</p>
            </section>
            <section class="choices">
              <button class="choice understood" type="button" data-choice="understood">
                <strong>わかった</strong><small>このまま進めて大丈夫</small>
              </button>
              <button class="choice lost" type="button" data-choice="lost">
                <strong>わからない</strong><small>一度止まってほしい</small>
              </button>
              <button class="choice wow wow-button" type="button" id="wowButton">
                <strong>へぇー</strong><small>何回でも押せます</small>
              </button>
            </section>
            <p class="status" id="studentStatus">まだ回答していません</p>
          </main>`;
      }

      function renderState(state) {
        if (path === "/room") {
          if (resetVersion === null) {
            resetVersion = state.resetVersion;
          } else if (resetVersion !== state.resetVersion) {
            resetVersion = state.resetVersion;
            selected = "";
            localStorage.removeItem("understanding-local-web-selected");
          }

          document.querySelectorAll("[data-choice]").forEach((button) => {
            button.classList.toggle("selected", button.dataset.choice === selected);
          });
          document.getElementById("studentStatus").textContent = selected ? `送信しました: ${labels[selected]}` : "まだ回答していません";
          return;
        }

        const total = state.totalResponses;
        document.getElementById("totalCount").textContent = `${total}件`;
        document.getElementById("participantCount").textContent = `${state.participants}人`;
        document.getElementById("resetCount").textContent = `${state.resetVersion}回`;
        document.getElementById("wowCount").textContent = `${state.reactions.wow}回`;

        for (const key of ["understood", "lost"]) {
          const count = state.counts[key];
          const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
          document.getElementById(`${key}Text`).textContent = `${count}人 / ${percentage}%`;
          document.getElementById(`${key}Bar`).style.width = `${percentage}%`;
        }
      }

      async function refresh() {
        const response = await fetch("/api/state", { cache: "no-store" });
        renderState(await response.json());
      }

      if (path === "/room") {
        document.getElementById("app").innerHTML = studentHtml();
        document.querySelectorAll("[data-choice]").forEach((button) => {
          button.addEventListener("click", async () => {
            selected = button.dataset.choice;
            localStorage.setItem("understanding-local-web-selected", selected);
            await postJson("/api/understanding", { clientId: clientId(), value: selected });
            await refresh();
          });
        });
        document.getElementById("wowButton").addEventListener("click", async () => {
          await postJson("/api/reaction", { clientId: clientId(), value: "wow" });
          await refresh();
        });
      } else {
        document.getElementById("app").innerHTML = teacherHtml();
        document.getElementById("resetButton").addEventListener("click", async () => {
          await postJson("/api/reset", {});
          await refresh();
        });
      }

      refresh();
      setInterval(refresh, 800);
    </script>
  </body>
</html>
'@
}

$listener.Start()
Write-Host "Class understanding button is running: $prefix"
Write-Host "Press Ctrl + C in this window to stop."

while ($true) {
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()
    $request = Read-HttpRequest -Stream $stream
    $path = $request.Path

    try {
        if ($request.Method -eq "GET" -and ($path -eq "/" -or $path -eq "/room")) {
            Send-Text -Stream $stream -Text (Get-PageHtml) -ContentType "text/html; charset=utf-8"
            continue
        }

        if ($request.Method -eq "GET" -and $path -eq "/api/state") {
            Send-Text -Stream $stream -Text (Get-StateJson) -ContentType "application/json; charset=utf-8"
            continue
        }

        if ($request.Method -eq "POST" -and $path -eq "/api/understanding") {
            $body = Get-RequestBody -Body $request.Body
            $clientId = [string]$body.clientId
            $value = [string]$body.value

            if (-not [string]::IsNullOrWhiteSpace($clientId) -and ($value -eq "understood" -or $value -eq "lost")) {
                $script:state.understood.Remove($clientId)
                $script:state.lost.Remove($clientId)
                $script:state[$value][$clientId] = $true
            }

            Send-Text -Stream $stream -Text (Get-StateJson) -ContentType "application/json; charset=utf-8"
            continue
        }

        if ($request.Method -eq "POST" -and $path -eq "/api/reaction") {
            $body = Get-RequestBody -Body $request.Body

            if ([string]$body.value -eq "wow") {
                $script:state.wow += 1
            }

            Send-Text -Stream $stream -Text (Get-StateJson) -ContentType "application/json; charset=utf-8"
            continue
        }

        if ($request.Method -eq "POST" -and $path -eq "/api/reset") {
            $script:state.understood.Clear()
            $script:state.lost.Clear()
            $script:state.wow = 0
            $script:state.resetVersion += 1

            Send-Text -Stream $stream -Text (Get-StateJson) -ContentType "application/json; charset=utf-8"
            continue
        }

        Send-Text -Stream $stream -Text "Not found" -StatusCode 404
    }
    catch {
        Send-Text -Stream $stream -Text $_.Exception.Message -StatusCode 500
    }
    finally {
        $stream.Close()
        $client.Close()
    }
}
