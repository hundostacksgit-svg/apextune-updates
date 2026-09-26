/*
 * The fresh-install page: an answer file for Windows setup, made in the browser.
 *
 * Nothing is sent anywhere; the file is built from the form and handed to the
 * browser as a download. It skips the account, licence and privacy screens,
 * makes a local account, and leaves a shortcut to the free look on the desktop.
 * It never mentions a disk: setup still asks where to install, so the file
 * cannot wipe the wrong drive. No product key: Windows activates from the PC's
 * digital licence, or setup asks.
 */
const $ = (s, r = document) => r.querySelector(s);
const x = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const COMP = 'processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS"';

// The desktop shortcut, written at first sign-in by a PowerShell line passed as base64 (UTF-16LE), so no quote
// has to survive XML, cmd and PowerShell in turn.
function shortcutCommand() {
  const ps = [
    "$d = [Environment]::GetFolderPath('Desktop')",
    "$t = \"@echo off`r`npowershell -NoProfile -ExecutionPolicy Bypass -Command \"\"`$env:OMNIDX_MODE='report'; irm omnidx.net/go.ps1 | iex\"\"`r`npause`r`n\"",
    "Set-Content -Path (Join-Path $d 'OmniDx free look.cmd') -Value $t -Encoding ASCII -NoNewline",
  ].join('; ');
  let bin = '';
  for (let i = 0; i < ps.length; i++) { const c = ps.charCodeAt(i); bin += String.fromCharCode(c & 255, c >> 8); }
  return `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${btoa(bin)}`;
}

const RESERVED = /^(administrator|guest|defaultaccount|wdagutilityaccount|system|user|users|admin|none)$/i;
function check(f) {
  const errs = [];
  const name = f.account.trim();
  if (!name || name.length > 20 || /["/\\[\]:;|=,+*?<>@]/.test(name) || /^\.+$|\s$/.test(name)) errs.push('The account name: up to 20 characters, none of " / \\ [ ] : ; | = , + * ? < > @.');
  else if (RESERVED.test(name)) errs.push(`"${name}" is a name Windows keeps for itself; pick another.`);
  const pc = f.pc.trim();
  if (pc && (!/^[A-Za-z0-9-]{1,15}$/.test(pc) || /^[0-9]+$/.test(pc))) errs.push('The PC name: up to 15 letters, digits or hyphens, not only digits. Or leave it empty for a random one.');
  return errs;
}

export function build(f) {
  const account = f.account.trim(), pc = f.pc.trim() || '*';
  const lang = f.lang, input = f.input, region = f.region;
  const pw = `<Password><Value>${x(f.password)}</Value><PlainText>true</PlainText></Password>`;
  const intl = (name) => `    <component name="${name}" ${COMP}>
      <InputLocale>${x(input)}</InputLocale>
      <SystemLocale>${x(region)}</SystemLocale>
      <UILanguage>${x(lang)}</UILanguage>
      <UserLocale>${x(region)}</UserLocale>
    </component>`;
  const first = [];
  if (f.shortcut) first.push(`        <SynchronousCommand wcm:action="add">
          <Order>${first.length + 1}</Order>
          <Description>A shortcut to the OmniDx free look on the desktop (changes nothing when run)</Description>
          <CommandLine>${x(shortcutCommand())}</CommandLine>
        </SynchronousCommand>`);
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Made at omnidx.net/studio/fresh/ on ${new Date().toISOString().slice(0, 10)}.
     Skips the licence, account and privacy screens, makes the local account "${x(account)}" and signs it in once.
     It never names a disk: setup still asks where to install. No product key: Windows activates from this PC's
     digital licence, or setup asks for one. Put this file, named autounattend.xml, at the top of the USB stick. -->
<unattend xmlns="urn:schemas-microsoft-com:unattend" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
  <settings pass="windowsPE">
    <component name="Microsoft-Windows-International-Core-WinPE" ${COMP}>
      <SetupUILanguage><UILanguage>${x(lang)}</UILanguage></SetupUILanguage>
      <InputLocale>${x(input)}</InputLocale>
      <SystemLocale>${x(region)}</SystemLocale>
      <UILanguage>${x(lang)}</UILanguage>
      <UserLocale>${x(region)}</UserLocale>
    </component>
    <component name="Microsoft-Windows-Setup" ${COMP}>
      <UserData><AcceptEula>true</AcceptEula></UserData>
    </component>
  </settings>
  <settings pass="specialize">
    <component name="Microsoft-Windows-Shell-Setup" ${COMP}>
      <ComputerName>${x(pc)}</ComputerName>${f.tz ? `
      <TimeZone>${x(f.tz)}</TimeZone>` : ''}
    </component>
    <component name="Microsoft-Windows-Deployment" ${COMP}>
      <RunSynchronous>
        <RunSynchronousCommand wcm:action="add">
          <Order>1</Order>
          <Description>Let setup finish without a network, so a local account is always possible</Description>
          <Path>reg add HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\OOBE /v BypassNRO /t REG_DWORD /d 1 /f</Path>
        </RunSynchronousCommand>
      </RunSynchronous>
    </component>
  </settings>
  <settings pass="oobeSystem">
${intl('Microsoft-Windows-International-Core')}
    <component name="Microsoft-Windows-Shell-Setup" ${COMP}>
      <OOBE>
        <HideEULAPage>true</HideEULAPage>
        <HideOEMRegistrationScreen>true</HideOEMRegistrationScreen>
        <HideOnlineAccountScreens>true</HideOnlineAccountScreens>
        <HideWirelessSetupInOOBE>${f.skipWifi ? 'true' : 'false'}</HideWirelessSetupInOOBE>
        <ProtectYourPC>${f.privacy ? '3' : '1'}</ProtectYourPC>
      </OOBE>
      <UserAccounts>
        <LocalAccounts>
          <LocalAccount wcm:action="add">
            <Name>${x(account)}</Name>
            <DisplayName>${x(account)}</DisplayName>
            <Group>Administrators</Group>
            ${pw}
          </LocalAccount>
        </LocalAccounts>
      </UserAccounts>
      <AutoLogon>
        <Username>${x(account)}</Username>
        <Enabled>true</Enabled>
        <LogonCount>1</LogonCount>
        ${pw}
      </AutoLogon>${first.length ? `
      <FirstLogonCommands>
${first.join('\n')}
      </FirstLogonCommands>` : ''}
    </component>
  </settings>
</unattend>
`;
}

function read(form) {
  const v = (n) => form.elements[n];
  const kb = v('keyboard').value.split('|');
  return {
    account: v('account').value, password: v('password').value, pc: v('pc').value,
    lang: v('lang').value, input: kb[0], region: kb[1], tz: v('tz').value,
    privacy: v('privacy').checked, skipWifi: v('skipwifi').checked, shortcut: v('shortcut').checked,
  };
}

export function initFresh() {
  const form = $('#fresh-form');
  if (!form || form.dataset.ready) return;
  form.dataset.ready = '1';
  const out = $('#fresh-xml'), errBox = $('#fresh-errors'), dl = $('#fresh-download');
  const render = () => {
    const f = read(form);
    const errs = check(f);
    errBox.hidden = !errs.length;
    errBox.innerHTML = errs.map((e) => `<li>${x(e)}</li>`).join('');
    dl.disabled = !!errs.length;
    out.textContent = errs.length ? '' : build(f);
    return errs.length ? null : out.textContent;
  };
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const xml = render();
    if (!xml) return;
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'autounattend.xml';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
  render();
}
