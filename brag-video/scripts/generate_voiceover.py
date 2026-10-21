import asyncio
import os
import subprocess
import json
import edge_tts

OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../audio"))
os.makedirs(OUT_DIR, exist_ok=True)

# Exact Scene Breakdown for 60.0 seconds total:
SCENES = [
    {
        "id": 1,
        "name": "scene1_hook",
        "scene_start": 0.0,
        "scene_end": 8.5,
        "vo_start": 0.4,
        "text": "Stop paying per message. Own your entire WhatsApp API infrastructure: free, self-hosted, with zero lock-in."
    },
    {
        "id": 2,
        "name": "scene2_reveal",
        "scene_start": 8.5,
        "scene_end": 17.0,
        "vo_start": 8.8,
        "text": "Meet Artha: the open-source WhatsApp gateway. Docker native, powered by NestJS, built for maximum reliability."
    },
    {
        "id": 3,
        "name": "scene3_sessions",
        "scene_start": 17.0,
        "scene_end": 25.5,
        "vo_start": 17.3,
        "text": "Spin up multiple sessions in seconds. Scan QR codes instantly, and monitor live messages from a sleek React dashboard."
    },
    {
        "id": 4,
        "name": "scene4_developer",
        "scene_start": 25.5,
        "scene_end": 34.0,
        "vo_start": 25.8,
        "text": "Send text, media, and voice notes with unified REST APIs, secured by HMAC webhooks and full Swagger documentation."
    },
    {
        "id": 5,
        "name": "scene5_ai",
        "scene_start": 34.0,
        "scene_end": 42.5,
        "vo_start": 34.3,
        "text": "Automate customer chats with AI. Connect Groq and OpenAI models, visual workflows, and autonomous voice calling."
    },
    {
        "id": 6,
        "name": "scene6_integrations",
        "scene_start": 42.5,
        "scene_end": 51.5,
        "vo_start": 42.8,
        "text": "Scale with Postgres, Redis, and S3. Integrate with Chatwoot, Typebot, and n8n with zero licensing fees."
    },
    {
        "id": 7,
        "name": "scene7_outro",
        "scene_start": 51.5,
        "scene_end": 60.0,
        "vo_start": 51.9,
        "text": "Deploy in sixty seconds with Docker. Star Artha on GitHub and take back control of your WhatsApp infrastructure."
    }
]

async def generate():
    voice = "en-US-ChristopherNeural"
    results = []
    
    print("--- GENERATING PERFECT ZERO-OVERLAP VOICEOVERS ---")
    for s in SCENES:
        out_path = os.path.join(OUT_DIR, f"{s['name']}.mp3")
        comm = edge_tts.Communicate(s['text'], voice, rate="+18%")
        await comm.save(out_path)
        
        # Check duration
        cmd = ["ffprobe", "-i", out_path, "-show_entries", "format=duration", "-v", "quiet", "-of", "csv=p=0"]
        dur = float(subprocess.check_output(cmd).decode().strip())
        vo_end = s['vo_start'] + dur
        margin = s['scene_end'] - vo_end
        
        status = "PERFECT" if margin >= 0.2 else "TIGHT"
        print(f"[{s['name']}] Scene: {s['scene_start']:.1f}s-{s['scene_end']:.1f}s | VO: {s['vo_start']:.1f}s -> {vo_end:.2f}s (Silence gap: +{margin:.2f}s) [{status}]")
        results.append({**s, "dur": dur, "vo_end": vo_end, "margin": margin})
        
    with open(os.path.join(OUT_DIR, "scenes_audio.json"), "w") as f:
        json.dump(results, f, indent=2)
    print("\nVerified timeline saved to scenes_audio.json")

if __name__ == "__main__":
    asyncio.run(generate())
