"""
The install, as a video in real time: director.py keeps a frame of the PC's own screen every five seconds while
Windows installs (timelapse/tl-*.jpg and timelapse.json, with the moment each was taken). Each frame is held until
the next was taken, so a second of this video is a second of the install, and edit.py's speed label stays true
when a segment of it is played 150 times faster.

    python3 tools/promo/film/timelapse.py take/timelapse install.mp4

Frames come in whatever size Windows Setup drew at (the firmware's small screen first); each is fitted to
1920 x 1080 on black. Prints the video's length in seconds.
"""
import json, os, subprocess, sys

FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')


def main():
    d, out = sys.argv[1:3]
    frames = json.load(open(os.path.join(d, 'timelapse.json')))
    if len(frames) < 2: sys.exit('fewer than two frames')
    lst = os.path.join(d, 'frames.ffconcat')
    with open(lst, 'w') as f:
        f.write('ffconcat version 1.0\n')
        for a, b in zip(frames, frames[1:]):
            f.write(f"file '{a['f']}'\nduration {max(0.2, b['wall'] - a['wall']):.3f}\n")
        f.write(f"file '{frames[-1]['f']}'\nduration 5.000\nfile '{frames[-1]['f']}'\n")
    subprocess.run([FFMPEG, '-nostdin', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst,
                    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=10',
                    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', out], check=True)
    print(f"{frames[-1]['wall'] - frames[0]['wall'] + 5:.1f}")


if __name__ == '__main__':
    main()
