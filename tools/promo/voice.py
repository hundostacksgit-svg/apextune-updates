"""Build the voiceover: one clip per scene, rate-fitted to its slot, then laid
   onto a 28s silent bed at the right offsets."""
import subprocess, json, os, sys

SP = os.environ['SP']
OUT = f'{SP}/vid/vo'
os.makedirs(OUT, exist_ok=True)

VOICE = 'en-us+m3'
TOTAL = 28.0

# (start, slot_seconds, text) — slot leaves a beat at the end of each scene
LINES = [
    (0.15, 3.05, "Check engine light on? Shops charge eighty bucks just to read it."),
    (3.60, 3.40, "You can do it yourself, in about ten seconds."),
    (7.40, 3.80, "All you need is a thirty dollar adapter and your phone."),
    (11.60, 5.80, "It pulls the fault codes and tells you what's actually wrong, in plain English."),
    (17.80, 3.40, "It even shows what the engine was doing the moment it broke."),
    (21.60, 2.90, "The same app checks your phone and your laptop too."),
    (24.80, 3.10, "Free to try. No app store. Link in bio."),
]

def dur(path):
    r = subprocess.run(['ffprobe','-v','error','-show_entries','format=duration',
                        '-of','csv=p=0', path], capture_output=True, text=True)
    return float(r.stdout.strip())

def say(text, wpm, path):
    subprocess.run(['espeak-ng','-v',VOICE,'-s',str(int(wpm)),'-p','40','-a','200',
                    '-w',path,text], check=True, capture_output=True)
    return dur(path)

clips = []
for i, (start, slot, text) in enumerate(LINES):
    path = f'{OUT}/l{i}.wav'
    d = say(text, 175, path)
    # fit to the slot: speed up if long, but never past 215wpm (unintelligible)
    if d > slot:
        wpm = min(215, 175 * (d / slot) * 1.02)
        d = say(text, wpm, path)
        note = f'sped to {wpm:.0f}wpm'
    else:
        wpm, note = 175, 'default rate'
    clips.append((start, path, d))
    flag = '  OVER' if d > slot + 0.05 else ''
    print(f'  {i}: {d:5.2f}s / {slot:.2f}s slot  ({note}){flag}  "{text[:46]}…"')

# lay each clip onto a silent bed at its offset, then normalise
inputs, filters = [], []
inputs += ['-f','lavfi','-t',str(TOTAL),'-i','anullsrc=r=22050:cl=mono']
for _, path, _ in clips:
    inputs += ['-i', path]
mix = ['[0:a]']
for i, (start, _, _) in enumerate(clips, start=1):
    filters.append(f'[{i}:a]adelay={int(start*1000)}|{int(start*1000)},aformat=sample_fmts=fltp:sample_rates=22050:channel_layouts=mono[d{i}]')
    mix.append(f'[d{i}]')
filters.append(''.join(mix) + f'amix=inputs={len(clips)+1}:normalize=0:duration=first[m]')
filters.append('[m]dynaudnorm=f=200:g=5,alimiter=limit=0.94,aresample=44100[out]')

cmd = ['ffmpeg','-y'] + inputs + ['-filter_complex', ';'.join(filters),
       '-map','[out]','-t',str(TOTAL),'-c:a','pcm_s16le', f'{SP}/vid/voiceover.wav']
r = subprocess.run(cmd, capture_output=True, text=True)
if r.returncode:
    print(r.stderr[-1500:]); sys.exit(1)
print(f'\nvoiceover.wav: {dur(f"{SP}/vid/voiceover.wav"):.2f}s')
