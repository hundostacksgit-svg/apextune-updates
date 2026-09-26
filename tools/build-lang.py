#!/usr/bin/env python3
"""
The front page in Spanish and in Portuguese (Brazil): studio/es/ and studio/pt/, one template and two sets of words,
so the two never drift apart in what they say or promise. The claims are the English front page's: no frame-rate
figure, the example numbers called an example, the checkout, the app and the report said to be in English.

    python3 tools/build-lang.py          then   python3 tools/build-site.py   (the menu and the footer)

It writes the pages whole, with the chrome markers empty; build-site.py fills them. Change the words here, never in
the pages.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DISCORD = 'https://discord.gg/VvbYJcDQbB'

WORDS = {
    'es': {
        'lang': 'es', 'og': 'es_ES', 'dir': 'es',
        'title': 'OmniDx Tune en español — 200 procesos. Menos de 100. Un comando.',
        'desc': 'Un comando deja Windows con lo que tus juegos necesitan: apps de inicio fuera, servicios y bloatware eliminados, un plan de energía para FPS, red, Discord, Spotify y navegador ajustados, perfiles por juego y una lista de BIOS para tu placa. $19.99 una vez. Deshacer en una línea.',
        'eyebrow': 'Windows 10 y 11 · un comando · un solo pago',
        'h1a': '200 procesos.', 'h1b': 'Menos de 100.', 'h1c': 'Un comando.',
        'lede': 'Un Windows recién instalado arranca con unos doscientos procesos, y la mayoría no son para ti. OmniDx Tune lee tu PC, decide el límite seguro para <em>tu</em> equipo y recorta hasta ahí: las apps de inicio apagadas, los servicios y las apps basura fuera, un plan de energía hecho para FPS, tu red, Discord, Spotify y el navegador ajustados, un perfil para cada juego y una lista de BIOS escrita para tu placa exacta. Y te da el botón de deshacer.',
        'buy': 'Cómpralo', 'once': 'una vez', 'tryfree': 'Prueba el informe gratis', 'watch': 'Míralo funcionar',
        'cmdlabel': 'El comando, en PowerShell',
        'cmdnote': 'Tecla Windows, escribe <b>powershell</b>, Enter, y pega la línea. Pide permisos de administrador y abre la app. La app, el informe y la página de pago están en inglés por ahora; esta página te explica cada paso.',
        'copy': 'Copiar',
        'notes': ['<b>Punto de restauración primero</b>, siempre', 'Deshacer es una línea', 'Nada instalado, nada corriendo después', 'Bloqueado a tu PC'],
        'trust': ['🪟 Windows 10 y 11', '🖥 Escritorio y portátil', '🛡️ Nunca baja la seguridad', '↩️ Se deshace entero', '🔑 Una clave, un PC'],
        'r_what': 'Qué hace', 'what_h': 'Qué hace, en un solo comando',
        'what_p': 'Todo lo que cambia queda anotado, y lo que tu PC usa se queda.',
        'cards': [
            ('🧹', 'Apps de inicio y servicios', 'Todo lo que arranca con Windows es una casilla: desmarca lo que quieras conservar. Los servicios que tu PC no usa se detienen; lo que sí usas (impresora, Bluetooth, Wi-Fi, mando) se queda.'),
            ('🗑️', 'Debloat de verdad', 'Apps preinstaladas, pruebas del fabricante, OneDrive si no lo usas y piezas viejas de Windows: fuera, y se quedan fuera por política.'),
            ('⚡', 'El plan de energía OmniDx', 'Hecho para FPS: sin núcleos aparcados ni buses dormidos mientras está enchufado. En batería, un portátil vuelve a ahorrar solo.'),
            ('📶', 'Red, Discord, Spotify', 'Nagle fuera y el ahorro de energía del adaptador apagado, por el ping. Discord, Spotify y el navegador con aceleración por hardware y sin correr en segundo plano.'),
            ('🎮', 'Perfiles para tus juegos', 'Fortnite, VALORANT, CS2, Marvel Rivals y más: prioridad alta, la GPU de alto rendimiento y los ajustes escritos en el propio archivo de configuración de cada juego, con copia de seguridad.'),
            ('🧬', 'Una lista de BIOS para tu placa', 'XMP / EXPO, Re-Size BAR y lo demás, con dónde está cada ajuste en tu placa exacta. En la mayoría de los PCs, la memoria a su velocidad real es la mayor mejora gratis.'),
        ],
        'r_safe': 'Seguridad', 'safe_h': 'Seguro por diseño',
        'safe': [
            'Un punto de restauración antes de cada ejecución, y cada cambio anotado.',
            'Deshacer todo es una línea: <span class="mono">$env:OMNIDX_MODE=\'undo\'; irm omnidx.net/go.ps1 | iex</span>',
            'Nunca baja la seguridad: Defender, Windows Update, Secure Boot, TPM y la integridad de memoria se quedan. Seguro con VALORANT (Vanguard), FACEIT y el anticheat de Fortnite.',
            'El script entero es público: <a href="https://omnidx.net/tune/omnidx.ps1">omnidx.net/tune/omnidx.ps1</a>. Léelo antes de pagar.',
            'Se comprueba a sí mismo: compara su huella (SHA-256) con la copia que probó el test de Windows, y si un solo byte no coincide, no se ejecuta.',
        ],
        'r_free': 'Gratis primero', 'free_h': 'Pruébalo gratis antes de pagar',
        'free_p': 'Dos líneas gratis para cualquiera. Ninguna cambia nada.',
        'report_h': 'El informe gratis', 'report_p': 'Sin clave. No cambia nada. Te dice qué recortaría en tu PC y guarda el informe en <span class="mono">C:\\OmniDx</span>.',
        'bench_h': 'Mide tus FPS', 'bench_p': 'Graba un minuto de tu juego con PresentMon (la herramienta de Intel que usan los reviewers): FPS promedio, 1% y 0,1% lows y tirones. Hazlo antes y después del tune: te lo pone lado a lado, con una tarjeta para publicar.',
        'r_edition': 'OmniDx Edition', 'edition_h': 'OmniDx Edition, incluida con cada clave',
        'edition_p': 'Windows original de Microsoft, preparado para jugar de una vez: el look OmniDx, OmniDx Search con Windows + S, un navegador ligero, OmniDx Hub con Game Boost y tres presets, y el tune en Extreme. En una instalación limpia o en tu PC tal como está. Una línea lo quita.',
        'edition_btn': 'La guía (en inglés)', 'showcase_btn': 'Mira las pruebas grabadas',
        'r_price': 'Precio', 'price_h': 'Un pago. Tuyo.',
        'price_p': 'Sin suscripción, sin renovación, sin cuenta. Todas las versiones futuras incluidas: el mismo comando trae siempre la más nueva.',
        'price_one': 'Un PC. Todo: el tune, el plan de energía, los perfiles de juego, la lista de BIOS, OmniDx Edition, deshacer y cada actualización.',
        'price_btn': 'Comprar', 'price_alt': 'Tres claves por el precio de dos: Squad, <span data-price="squad">$39.99</span>. La clave aparece en pantalla al pagar. Todas las ventas son finales, así que prueba antes el informe gratis.',
        'r_faq': 'Preguntas', 'faq_h': 'Lo que todos preguntan',
        'faq': [
            ('¿Cuántos FPS voy a ganar?', 'Ningún número honesto sirve para todos los PCs: depende de tu GPU, tu CPU y el juego. Lo que más se nota es un tiempo de frame más estable y menos bajones, porque menos cosas compiten con el juego. Y la mayor mejora gratis en la mayoría de los PCs está en la lista de BIOS (la RAM a su velocidad real). Mídelo tú mismo con la herramienta gratis de arriba.'),
            ('¿Es seguro con anticheat?', 'Sí. Nunca toca Defender, Windows Update, Secure Boot, TPM ni la integridad de memoria, que es lo que piden Vanguard y FACEIT, y nunca toca los archivos de un juego ni su anticheat.'),
            ('¿Funciona en un portátil?', 'Sí, y sabe que es un portátil: batería, tapa, brillo, Wi-Fi y Bluetooth siguen funcionando. Enchufado va a tope; en batería vuelve a ahorrar.'),
            ('¿Cómo lo deshago?', 'Una línea en PowerShell lo devuelve todo: <span class="mono">$env:OMNIDX_MODE=\'undo\'; irm omnidx.net/go.ps1 | iex</span>. Además se crea un punto de restauración antes de cada ejecución.'),
            ('Cambié de PC. ¿Puedo mover mi clave?', 'Sí, tú mismo, una vez cada 30 días, en omnidx.net/studio/activate/ con tu número de pedido. Reinstalar Windows en el mismo PC no necesita nada.'),
            ('¿Está en español?', 'Esta página sí. La app, el informe y el pago están en inglés por ahora, y los comandos son los mismos. ¿Dudas? Pregunta en el Discord, en español si quieres.'),
        ],
        'discord': 'Únete al Discord', 'discord_p': 'Ayuda, resultados y lo que viene. Se habla español.',
        'english': 'English',
    },
    'pt': {
        'lang': 'pt-BR', 'og': 'pt_BR', 'dir': 'pt',
        'title': 'OmniDx Tune em português — 200 processos. Menos de 100. Um comando.',
        'desc': 'Um comando deixa o Windows só com o que seus jogos precisam: apps de inicialização desligados, serviços e bloatware removidos, um plano de energia para FPS, rede, Discord, Spotify e navegador ajustados, perfis por jogo e uma lista de BIOS para a sua placa. US$ 19,99 uma vez. Desfazer em uma linha.',
        'eyebrow': 'Windows 10 e 11 · um comando · pagamento único',
        'h1a': '200 processos.', 'h1b': 'Menos de 100.', 'h1c': 'Um comando.',
        'lede': 'Um Windows recém-instalado liga com uns duzentos processos, e a maioria não é para você. O OmniDx Tune lê o seu PC, decide o limite seguro para a <em>sua</em> máquina e corta até ali: apps de inicialização desligados, serviços e apps inúteis removidos, um plano de energia feito para FPS, sua rede, Discord, Spotify e navegador ajustados, um perfil para cada jogo e uma lista de BIOS escrita para a sua placa exata. E te entrega o botão de desfazer.',
        'buy': 'Comprar', 'once': 'uma vez', 'tryfree': 'Teste o relatório grátis', 'watch': 'Veja funcionando',
        'cmdlabel': 'O comando, no PowerShell',
        'cmdnote': 'Tecla Windows, digite <b>powershell</b>, Enter, e cole a linha. Ele pede permissão de administrador e abre o app. O app, o relatório e a página de pagamento estão em inglês por enquanto; esta página explica cada passo.',
        'copy': 'Copiar',
        'notes': ['<b>Ponto de restauração primeiro</b>, sempre', 'Desfazer é uma linha', 'Nada instalado, nada rodando depois', 'Travado no seu PC'],
        'trust': ['🪟 Windows 10 e 11', '🖥 Desktop e notebook', '🛡️ Nunca reduz a segurança', '↩️ Totalmente desfazível', '🔑 Uma chave, um PC'],
        'r_what': 'O que faz', 'what_h': 'O que faz, em um único comando',
        'what_p': 'Tudo o que muda fica registrado, e o que o seu PC usa fica.',
        'cards': [
            ('🧹', 'Apps de inicialização e serviços', 'Tudo que inicia com o Windows é uma caixinha: desmarque o que quiser manter. Os serviços que o seu PC não usa são parados; o que você usa (impressora, Bluetooth, Wi-Fi, controle) fica.'),
            ('🗑️', 'Debloat de verdade', 'Apps pré-instalados, testes do fabricante, OneDrive se você não usa e partes antigas do Windows: removidos, e continuam fora por política.'),
            ('⚡', 'O plano de energia OmniDx', 'Feito para FPS: sem núcleos estacionados nem barramentos dormindo na tomada. Na bateria, o notebook volta a economizar sozinho.'),
            ('📶', 'Rede, Discord, Spotify', 'Nagle desligado e a economia de energia do adaptador desligada, pelo ping. Discord, Spotify e navegador com aceleração por hardware e sem rodar em segundo plano.'),
            ('🎮', 'Perfis para os seus jogos', 'Fortnite, VALORANT, CS2, Marvel Rivals e mais: prioridade alta, GPU de alto desempenho e os ajustes gravados no próprio arquivo de configuração de cada jogo, com backup.'),
            ('🧬', 'Uma lista de BIOS para a sua placa', 'XMP / EXPO, Re-Size BAR e o resto, com onde fica cada ajuste na sua placa exata. Na maioria dos PCs, a memória na velocidade certa é o maior ganho grátis.'),
        ],
        'r_safe': 'Segurança', 'safe_h': 'Seguro por projeto',
        'safe': [
            'Um ponto de restauração antes de cada execução, e cada mudança registrada.',
            'Desfazer tudo é uma linha: <span class="mono">$env:OMNIDX_MODE=\'undo\'; irm omnidx.net/go.ps1 | iex</span>',
            'Nunca reduz a segurança: Defender, Windows Update, Secure Boot, TPM e a integridade de memória ficam. Seguro com VALORANT (Vanguard), FACEIT e o anticheat do Fortnite.',
            'O script inteiro é público: <a href="https://omnidx.net/tune/omnidx.ps1">omnidx.net/tune/omnidx.ps1</a>. Leia antes de pagar.',
            'Ele confere a si mesmo: compara a própria impressão digital (SHA-256) com a cópia que o teste no Windows aprovou, e se um único byte não bater, não roda.',
        ],
        'r_free': 'Grátis primeiro', 'free_h': 'Teste grátis antes de pagar',
        'free_p': 'Duas linhas grátis para qualquer um. Nenhuma muda nada.',
        'report_h': 'O relatório grátis', 'report_p': 'Sem chave. Não muda nada. Mostra o que ele cortaria no seu PC e salva o relatório em <span class="mono">C:\\OmniDx</span>.',
        'bench_h': 'Meça seu FPS', 'bench_p': 'Grava um minuto do seu jogo com o PresentMon (a ferramenta da Intel que os reviewers usam): FPS médio, 1% e 0,1% lows e travadas. Faça antes e depois do tune: ele coloca lado a lado, com um card para postar.',
        'r_edition': 'OmniDx Edition', 'edition_h': 'OmniDx Edition, incluída em cada chave',
        'edition_p': 'Windows original da Microsoft, preparado para jogar de uma vez: o visual OmniDx, OmniDx Search no Windows + S, um navegador leve, OmniDx Hub com Game Boost e três presets, e o tune no Extreme. Numa instalação limpa ou no seu PC do jeito que está. Uma linha remove tudo.',
        'edition_btn': 'O guia (em inglês)', 'showcase_btn': 'Veja os testes gravados',
        'r_price': 'Preço', 'price_h': 'Um pagamento. Seu.',
        'price_p': 'Sem assinatura, sem renovação, sem conta. Todas as versões futuras incluídas: o mesmo comando sempre traz a mais nova.',
        'price_one': 'Um PC. Tudo: o tune, o plano de energia, os perfis de jogo, a lista de BIOS, OmniDx Edition, desfazer e cada atualização.',
        'price_btn': 'Comprar', 'price_alt': 'Três chaves pelo preço de duas: Squad, <span data-price="squad">$39.99</span>. A chave aparece na tela ao pagar. Todas as vendas são finais, então teste antes o relatório grátis.',
        'r_faq': 'Perguntas', 'faq_h': 'O que todo mundo pergunta',
        'faq': [
            ('Quanto de FPS eu vou ganhar?', 'Nenhum número honesto serve para todo PC: depende da sua GPU, da CPU e do jogo. O que mais se nota é um frame time mais estável e menos quedas, porque menos coisas competem com o jogo. E o maior ganho grátis na maioria dos PCs está na lista de BIOS (a RAM na velocidade certa). Meça você mesmo com a ferramenta grátis acima.'),
            ('É seguro com anticheat?', 'Sim. Nunca mexe no Defender, Windows Update, Secure Boot, TPM nem na integridade de memória, que é o que o Vanguard e o FACEIT exigem, e nunca mexe nos arquivos de um jogo nem no anticheat dele.'),
            ('Funciona em notebook?', 'Sim, e ele sabe que é um notebook: bateria, tampa, brilho, Wi-Fi e Bluetooth continuam funcionando. Na tomada vai no máximo; na bateria volta a economizar.'),
            ('Como eu desfaço?', 'Uma linha no PowerShell devolve tudo: <span class="mono">$env:OMNIDX_MODE=\'undo\'; irm omnidx.net/go.ps1 | iex</span>. E um ponto de restauração é criado antes de cada execução.'),
            ('Troquei de PC. Posso mover minha chave?', 'Sim, você mesmo, uma vez a cada 30 dias, em omnidx.net/studio/activate/ com o número do pedido. Reinstalar o Windows no mesmo PC não precisa de nada.'),
            ('Está em português?', 'Esta página sim. O app, o relatório e o pagamento estão em inglês por enquanto, e os comandos são os mesmos. Dúvidas? Pergunte no Discord, em português se quiser.'),
        ],
        'discord': 'Entre no Discord', 'discord_p': 'Ajuda, resultados e o que vem por aí. Pode falar português.',
        'english': 'English',
    },
}


def page(w: dict) -> str:
    cards = '\n'.join(f'      <div class="card reveal{" d1" if i % 3 == 1 else " d2" if i % 3 == 2 else ""}"><div class="card-icon">{ic}</div><h3>{h}</h3><p>{p}</p></div>' for i, (ic, h, p) in enumerate(w['cards']))
    safe = '\n'.join(f'        <li>{x}</li>' for x in w['safe'])
    faq = '\n'.join(f'      <details><summary>{q}</summary>\n        <p>{a}</p></details>' for q, a in w['faq'])
    notes = '\n      <span>·</span>\n'.join(f'      <span>{n}</span>' for n in w['notes'])
    trust = ''.join(f'<span>{t}</span>' for t in w['trust'])
    url = f"https://omnidx.net/studio/{w['dir']}/"
    return f'''<!doctype html>
<html lang="{w['lang']}" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- Written by tools/build-lang.py: change the words there, not here. -->
<title>{w['title']}</title>
<meta name="description" content="{w['desc']}">
<meta name="theme-color" content="#000000">
<link rel="icon" href="../assets/icons/favicon-32.png" sizes="32x32" type="image/png">
<link rel="icon" href="../assets/icons/icon-192.png" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="../assets/icons/apple-touch-icon.png">
<link rel="canonical" href="{url}">
<link rel="alternate" hreflang="en" href="https://omnidx.net/studio/">
<link rel="alternate" hreflang="es" href="https://omnidx.net/studio/es/">
<link rel="alternate" hreflang="pt-BR" href="https://omnidx.net/studio/pt/">
<link rel="alternate" hreflang="x-default" href="https://omnidx.net/studio/">
<meta property="og:url" content="{url}">
<meta property="og:locale" content="{w['og']}">
<meta property="og:image" content="https://omnidx.net/studio/assets/og-card.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:site_name" content="OmniDx Tune">
<meta property="og:title" content="{w['title']}">
<meta property="og:description" content="{w['desc']}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://omnidx.net/studio/assets/og-card.jpg">
<link rel="stylesheet" href="../assets/studio.css">
<script>
(function(){{try{{var t=localStorage.getItem('omnidx.theme')||'dark';document.documentElement.setAttribute('data-theme',t);}}catch(e){{}}}})();
</script>
</head>
<body>
<div class="aurora" aria-hidden="true"><div class="grid"></div></div>
<!-- chrome:nav -->
<!-- /chrome:nav -->
<header class="hero" id="top" data-rail="OmniDx Tune">
  <div class="wrap">
    <div class="eyebrow reveal in"><span class="pulse"></span>{w['eyebrow']}</div>
    <h1 class="reveal in">{w['h1a']}<br><span class="grad">{w['h1b']}</span> {w['h1c']}</h1>
    <p class="lede reveal in d1">{w['lede']}</p>
    <div class="btn-row hero-cta reveal in d2">
      <a class="btn btn-primary btn-lg" href="../pricing/">{w['buy']} — <span><span data-price="tune">$19.99</span>, {w['once']}</span></a>
      <a class="btn btn-lg btn-ghost" href="#gratis">{w['tryfree']}</a>
      <a class="btn btn-lg btn-ghost" href="../showcase/">{w['watch']}</a>
    </div>
    <div class="reveal in d3" style="max-width:640px;margin:28px 0 0">
      <p class="small" style="margin:0 0 8px;font-weight:700">{w['cmdlabel']}</p>
      <div class="cmd"><code data-text="irm omnidx.net/go.ps1 | iex">irm omnidx.net/go.ps1 | iex</code><button class="btn btn-sm" type="button" data-copy>{w['copy']}</button></div>
      <p class="cmd-note">{w['cmdnote']}</p>
    </div>
    <div class="hero-note reveal in d3">
{notes}
    </div>
    <div class="trust reveal in d3">{trust}</div>
    <p class="small muted" style="margin-top:14px"><a href="../" hreflang="en" lang="en">{w['english']}</a> · <a href="../es/" hreflang="es" lang="es">Español</a> · <a href="../pt/" hreflang="pt-BR" lang="pt-BR">Português</a></p>
  </div>
</header>

<section id="que-hace" data-rail="{w['r_what']}">
  <div class="wrap">
    <div class="center"><div class="section-head reveal"><h2>{w['what_h']}</h2><p>{w['what_p']}</p></div></div>
    <div class="grid grid-3">
{cards}
    </div>
  </div>
</section>

<section id="seguridad" data-rail="{w['r_safe']}">
  <div class="wrap" style="max-width:820px">
    <div class="section-head reveal"><h2>{w['safe_h']}</h2></div>
    <div class="card reveal">
      <ul class="tick" style="margin:0">
{safe}
      </ul>
    </div>
  </div>
</section>

<section id="gratis" data-rail="{w['r_free']}">
  <div class="wrap">
    <div class="center"><div class="section-head reveal"><h2>{w['free_h']}</h2><p>{w['free_p']}</p></div></div>
    <div class="grid grid-2">
      <div class="card reveal"><h3>{w['report_h']}</h3>
        <div class="cmd" style="margin-top:12px"><code data-text="$env:OMNIDX_MODE='report'; irm omnidx.net/go.ps1 | iex">$env:OMNIDX_MODE='report'; irm omnidx.net/go.ps1 | iex</code><button class="btn btn-sm" type="button" data-copy>{w['copy']}</button></div>
        <p class="cmd-note">{w['report_p']}</p></div>
      <div class="card reveal d1"><h3>{w['bench_h']}</h3>
        <div class="cmd" style="margin-top:12px"><code data-text="irm omnidx.net/bench.ps1 | iex">irm omnidx.net/bench.ps1 | iex</code><button class="btn btn-sm" type="button" data-copy>{w['copy']}</button></div>
        <p class="cmd-note">{w['bench_p']}</p></div>
    </div>
  </div>
</section>

<section id="edition" data-rail="{w['r_edition']}">
  <div class="wrap center">
    <div class="section-head reveal"><h2>{w['edition_h']}</h2><p>{w['edition_p']}</p></div>
    <div class="btn-row" style="justify-content:center">
      <a class="btn btn-ghost" href="../edition/" hreflang="en">{w['edition_btn']}</a>
      <a class="btn btn-ghost" href="../showcase/">{w['showcase_btn']}</a>
    </div>
  </div>
</section>

<section id="precio" data-rail="{w['r_price']}">
  <div class="wrap center">
    <div class="section-head reveal"><h2>{w['price_h']}</h2><p>{w['price_p']}</p></div>
    <div class="price-card reveal">
      <div class="tname" style="font-size:13px;font-weight:750;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3)">OmniDx Tune</div>
      <div class="amount"><span data-price="tune">$19.99</span> <small>{w['once']}</small></div>
      <p class="small" style="margin:0">{w['price_one']}</p>
      <a class="btn btn-primary btn-lg" href="../pricing/">{w['price_btn']}</a>
      <p class="alt">{w['price_alt']}</p>
    </div>
    <div class="pays">
      <span class="pay"><span class="g"></span>Card</span>
      <span class="pay"><span class="g"></span>Apple Pay</span>
      <span class="pay"><span class="g"></span>Google Pay</span>
      <span class="pay"><span class="g"></span>Cash App Pay</span>
      <span class="pay"><span class="g"></span>PayPal</span>
      <span class="pay"><span class="g"></span>Klarna</span>
    </div>
  </div>
</section>

<section id="preguntas" data-rail="{w['r_faq']}">
  <div class="wrap">
    <div class="section-head reveal"><h2>{w['faq_h']}</h2></div>
    <div class="faq" style="max-width:780px">
{faq}
    </div>
    <div class="btn-row" style="margin-top:26px">
      <a class="btn btn-primary" href="{DISCORD}" target="_blank" rel="noopener">{w['discord']}</a>
    </div>
    <p class="small muted" style="margin-top:10px">{w['discord_p']}</p>
  </div>
</section>

<!-- chrome:footer -->
<!-- /chrome:footer -->
<script type="module" src="../assets/studio.js"></script>
</body>
</html>
'''


def main() -> int:
    for w in WORDS.values():
        out = ROOT / 'studio' / w['dir'] / 'index.html'
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page(w))
        print(f'  wrote studio/{w["dir"]}/index.html')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
