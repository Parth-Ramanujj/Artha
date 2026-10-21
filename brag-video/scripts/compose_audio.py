import os
import json
import math
import numpy as np
from scipy.io import wavfile
import subprocess

SAMPLE_RATE = 48000
DURATION = 60.0  # Exactly 60.00 seconds
TOTAL_SAMPLES = int(SAMPLE_RATE * DURATION)

AUDIO_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../audio"))
METADATA_FILE = os.path.join(AUDIO_DIR, "scenes_audio.json")

def generate_cinematic_music():
    print("Synthesizing 60-second 120BPM electronic soundtrack...")
    t = np.linspace(0, DURATION, TOTAL_SAMPLES, endpoint=False)
    
    # Left and Right stereo channels
    left = np.zeros(TOTAL_SAMPLES, dtype=np.float32)
    right = np.zeros(TOTAL_SAMPLES, dtype=np.float32)
    
    bpm = 120.0
    beat_sec = 60.0 / bpm  # 0.5 sec per beat
    
    # 1. Chord Progression: Fm (F3, Ab3, C4) -> Db (Db3, F3, Ab3) -> Ab (Ab3, C4, Eb4) -> Eb (Eb3, G3, Bb3)
    # 4 bars per chord = 8 seconds per chord cycle (repeat every 8s)
    chord_cycle = 8.0
    chords = [
        [174.61, 207.65, 261.63],  # Fm
        [138.59, 174.61, 207.65],  # Db
        [207.65, 261.63, 311.13],  # Ab
        [155.56, 196.00, 233.08],  # Eb
    ]
    
    # Warm analog synth pad
    pad_volume = 0.16
    for i in range(int(DURATION / 2.0)):
        chord_idx = i % 4
        c_freqs = chords[chord_idx]
        start_s = int(i * 2.0 * SAMPLE_RATE)
        end_s = min(int((i + 1) * 2.0 * SAMPLE_RATE), TOTAL_SAMPLES)
        local_t = t[start_s:end_s]
        
        # Smooth envelope
        n_local = end_s - start_s
        env = np.sin(np.linspace(0, np.pi, n_local)) ** 0.5
        
        pad_signal = np.zeros(n_local, dtype=np.float32)
        for f in c_freqs:
            # Add slight detune for rich stereo spread
            pad_signal += 0.3 * np.sin(2 * np.pi * f * local_t)
            pad_signal += 0.2 * np.sin(2 * np.pi * (f * 1.002) * local_t)
            pad_signal += 0.1 * np.sin(2 * np.pi * (f * 0.5) * local_t) # Sub octave
            
        left[start_s:end_s] += pad_signal * env * pad_volume
        right[start_s:end_s] += pad_signal * env * pad_volume
        
    # 2. 16th-Note Pluck Arpeggio (driving tech pulse)
    step_sec = beat_sec / 4.0  # 0.125s (16th note)
    total_steps = int(DURATION / step_sec)
    arp_notes = [261.63, 311.13, 349.23, 392.00, 466.16, 523.25]
    
    for s in range(total_steps):
        s_time = s * step_sec
        # Don't play arp in first 1.5s (intro) or last 1.5s
        if s_time < 1.0 or s_time > 58.5:
            continue
            
        freq = arp_notes[s % len(arp_notes)]
        start_idx = int(s_time * SAMPLE_RATE)
        step_len = int(step_sec * 0.9 * SAMPLE_RATE)
        end_idx = min(start_idx + step_len, TOTAL_SAMPLES)
        n_s = end_idx - start_idx
        
        if n_s > 0:
            env = np.exp(-np.linspace(0, 5, n_s))
            arp_wave = np.sin(2 * np.pi * freq * t[start_idx:end_idx]) * env * 0.08
            pan = 0.5 + 0.3 * np.sin(s * 0.5)
            left[start_idx:end_idx] += arp_wave * pan
            right[start_idx:end_idx] += arp_wave * (1.0 - pan)
            
    # 3. Kicks & Sub-Bass Thumps (on every beat after 8.5s)
    total_beats = int(DURATION / beat_sec)
    for b in range(total_beats):
        b_time = b * beat_sec
        # Drop starts at Scene 2 (8.5s) through 58.0s
        if 8.5 <= b_time <= 58.0:
            start_idx = int(b_time * SAMPLE_RATE)
            kick_len = int(0.25 * SAMPLE_RATE)
            end_idx = min(start_idx + kick_len, TOTAL_SAMPLES)
            n_k = end_idx - start_idx
            
            if n_k > 0:
                k_t = np.linspace(0, 0.25, n_k)
                pitch_drop = 120.0 * np.exp(-k_t * 22.0) + 45.0
                phase = 2 * np.pi * np.cumsum(pitch_drop) / SAMPLE_RATE
                kick = np.sin(phase) * np.exp(-k_t * 12.0) * 0.28
                left[start_idx:end_idx] += kick
                right[start_idx:end_idx] += kick

    # 4. Cinematic Risers before Scene Transitions (at 7.5s, 24.5s, 50.5s)
    riser_moments = [8.5, 25.5, 51.5]
    for r in riser_moments:
        start_idx = max(0, int((r - 1.5) * SAMPLE_RATE))
        end_idx = min(int(r * SAMPLE_RATE), TOTAL_SAMPLES)
        n_r = end_idx - start_idx
        if n_r > 0:
            r_t = np.linspace(0, 1.5, n_r)
            f_rise = 100.0 + 900.0 * (r_t / 1.5) ** 2
            phase = 2 * np.pi * np.cumsum(f_rise) / SAMPLE_RATE
            noise = np.random.normal(0, 0.05, n_r)
            sweep = (np.sin(phase) + noise) * (r_t / 1.5) ** 2 * 0.15
            left[start_idx:end_idx] += sweep
            right[start_idx:end_idx] += sweep

    # 5. Master Fade Out (last 2 seconds)
    fade_len = int(2.0 * SAMPLE_RATE)
    fade_curve = np.linspace(1.0, 0.0, fade_len)
    left[-fade_len:] *= fade_curve
    right[-fade_len:] *= fade_curve
    
    return left, right

def build_master_audio():
    left_music, right_music = generate_cinematic_music()
    
    with open(METADATA_FILE, "r") as f:
        scenes = json.load(f)
        
    left_vo = np.zeros(TOTAL_SAMPLES, dtype=np.float32)
    right_vo = np.zeros(TOTAL_SAMPLES, dtype=np.float32)
    ducking_mask = np.ones(TOTAL_SAMPLES, dtype=np.float32)
    
    print("\nIntegrating Voiceover tracks with sidechain ducking...")
    for s in scenes:
        mp3_file = os.path.join(AUDIO_DIR, f"{s['name']}.mp3")
        wav_tmp = os.path.join(AUDIO_DIR, f"{s['name']}.wav")
        
        # Convert MP3 to 48kHz WAV
        subprocess.run(["ffmpeg", "-y", "-i", mp3_file, "-ar", "48000", "-ac", "1", wav_tmp],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        
        _, data = wavfile.read(wav_tmp)
        os.remove(wav_tmp)
        data = data.astype(np.float32) / 32768.0  # Normalize to [-1, 1]
        
        start_idx = int(s['vo_start'] * SAMPLE_RATE)
        end_idx = min(start_idx + len(data), TOTAL_SAMPLES)
        actual_len = end_idx - start_idx
        
        # Center voiceover in stereo
        left_vo[start_idx:end_idx] += data[:actual_len] * 0.95
        right_vo[start_idx:end_idx] += data[:actual_len] * 0.95
        
        # Duck music during speech: smoothly dip volume down to 40% (-8dB)
        duck_start = max(0, start_idx - int(0.15 * SAMPLE_RATE))
        duck_end = min(TOTAL_SAMPLES, end_idx + int(0.25 * SAMPLE_RATE))
        ducking_mask[duck_start:duck_end] = 0.38
        
    # Smooth ducking mask with moving average
    kernel_size = int(0.2 * SAMPLE_RATE)
    kernel = np.ones(kernel_size) / kernel_size
    ducking_mask = np.convolve(ducking_mask, kernel, mode='same')
    
    # Mix Music + Voiceover
    master_left = left_music * ducking_mask + left_vo
    master_right = right_music * ducking_mask + right_vo
    
    # Master Limiter / Normalization to -1 dBFS
    max_peak = max(np.max(np.abs(master_left)), np.max(np.abs(master_right)))
    if max_peak > 0:
        gain = 0.89 / max_peak
        master_left *= gain
        master_right *= gain
        
    master_stereo = np.column_stack((master_left, master_right))
    master_wav = os.path.join(AUDIO_DIR, "master_audio.wav")
    wavfile.write(master_wav, SAMPLE_RATE, (master_stereo * 32767).astype(np.int16))
    
    # Also export master_audio.mp3
    master_mp3 = os.path.join(AUDIO_DIR, "master_audio.mp3")
    subprocess.run(["ffmpeg", "-y", "-i", master_wav, "-b:a", "320k", master_mp3],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
                   
    # Probe duration
    cmd = ["ffprobe", "-i", master_wav, "-show_entries", "format=duration", "-v", "quiet", "-of", "csv=p=0"]
    final_dur = float(subprocess.check_output(cmd).decode().strip())
    print(f"\n Master Soundtrack Produced: {master_wav}")
    print(f" Verified Audio Duration: {final_dur:.3f} seconds (Target: {DURATION:.1f}s)")

if __name__ == "__main__":
    build_master_audio()
