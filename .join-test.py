"""Join Friday's LiveKit room as a test participant and capture her greeting.

Reads creds from ../.env (never prints them). Exits 0 on >=4s of speech.
"""
import asyncio
import os
import sys
import time
import wave

from dotenv import load_dotenv

load_dotenv("/home/darkdevil/friday-multiagent/.env")

from livekit import api, rtc  # noqa: E402

URL = os.environ["LIVEKIT_URL"]
KEY = os.environ["LIVEKIT_API_KEY"]
SECRET = os.environ["LIVEKIT_API_SECRET"]
OUT = "/home/darkdevil/friday-multiagent/.greeting.wav"

SPEECH_SECONDS_NEEDED = 4.0
TOTAL_BUDGET = 240.0


def _frame_energy(frame) -> float:
    data = bytes(frame.data)
    if not data.strip(b"\x00"):
        return 0.0
    import struct as _s

    n = len(data) // 2
    vals = _s.unpack("<%dh" % n, data[: n * 2])
    return sum(abs(v) for v in vals) / n


async def attempt(room: str) -> bool:
    dispatch = api.RoomAgentDispatch(agent_name="")
    token = (
        api.AccessToken(KEY, SECRET)
        .with_identity("boss-tester")
        .with_name("Boss Tester")
        .with_grants(
            api.VideoGrants(
                room_join=True, room=room, can_publish=True, can_subscribe=True
            )
        )
        .with_room_config(api.RoomConfiguration(agents=[dispatch]))
        .to_jwt()
    )
    room_obj = rtc.Room()
    agent_joined = asyncio.Event()
    frames: list = []

    @room_obj.on("participant_connected")
    def _participant(participant: rtc.RemoteParticipant):  # noqa: N802
        print(f"PARTICIPANT_JOINED identity={participant.identity}", flush=True)
        if participant.identity != "boss-tester":
            agent_joined.set()

    @room_obj.on("track_subscribed")
    def _track(
        track: rtc.Track,
        publication: rtc.TrackPublication,
        participant: rtc.RemoteParticipant,
    ):
        print(
            f"TRACK_SUBSCRIBED kind={track.kind} from={participant.identity}",
            flush=True,
        )
        if track.kind == rtc.TrackKind.KIND_AUDIO:

            async def _read():
                stream = rtc.AudioStream(track)
                async for ev in stream:
                    frames.append(ev.frame)

            asyncio.ensure_future(_read())

    try:
        await room_obj.connect(URL, token)
        print("CONNECTED_TO_ROOM", flush=True)
        try:
            await asyncio.wait_for(agent_joined.wait(), timeout=120)
        except asyncio.TimeoutError:
            print("NO_AGENT_JOINED", flush=True)
            return False
        start = time.monotonic()
        speech_s = 0.0
        last_count = 0
        skip_greet = bool(os.getenv("SKIP_GREET"))
        if skip_greet:
            print("GREETING_SKIPPED_WAITING_15S", flush=True)
            await asyncio.sleep(15)
            last_count = len(frames)
        while time.monotonic() - start < TOTAL_BUDGET:
            await asyncio.sleep(3)
            new_frames = frames[last_count:]
            last_count = len(frames)
            for fr in new_frames:
                if _frame_energy(fr) > 50:
                    speech_s += len(fr.data) // 2 // 1 / fr.sample_rate
            elapsed = time.monotonic() - start
            print(
                f"PROGRESS elapsed={elapsed:.0f}s frames={len(frames)} "
                f"speech={speech_s:.1f}s",
                flush=True,
            )
            if speech_s >= SPEECH_SECONDS_NEEDED:
                print("GREETING_DONE", flush=True)
                break
            if skip_greet and elapsed > 20:
                print("GREETING_SKIP_BREAK", flush=True)
                break
        if not frames:
            print("NO_AUDIO_RECEIVED", flush=True)
            return False
        answer_ok = await _mic_phase(room_obj, frames)
        f0 = frames[0]
        print(
            f"FRAMES={len(frames)} rate={f0.sample_rate} ch={f0.num_channels}",
            flush=True,
        )
        with wave.open(OUT, "wb") as w:
            w.setnchannels(f0.num_channels)
            w.setsampwidth(2)
            w.setframerate(f0.sample_rate)
            for fr in frames:
                w.writeframes(bytes(fr.data))
        print(f"WAV_SAVED bytes={os.path.getsize(OUT)}", flush=True)
        print("ANSWER_OK" if answer_ok else "ANSWER_MISSING", flush=True)
        if skip_greet:
            return answer_ok
        return speech_s >= SPEECH_SECONDS_NEEDED and answer_ok
    finally:
        await room_obj.disconnect()


async def _mic_phase(room_obj, frames: list) -> bool:
    """Publish the synthesized question as mic input, await a spoken answer."""
    import struct as _s

    pcm_path = "/home/darkdevil/friday-multiagent/.mic-question.pcm"
    try:
        with open(pcm_path, "rb") as f:
            pcm = f.read()
    except OSError as exc:
        print(f"MIC_FILE_MISSING err={exc}", flush=True)
        return False
    n = len(pcm) // 2
    samples = _s.unpack("<%dh" % n, pcm[: n * 2])
    peak = max(abs(v) for v in samples)
    print(f"MIC_PCM seconds={n / 16000:.1f} peak={peak}", flush=True)
    if peak < 100:
        print("MIC_PCM_SILENT", flush=True)
        return False
    source = rtc.AudioSource(16000, 1)
    track = rtc.LocalAudioTrack.create_audio_track("mic", source)
    options = rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
    try:
        await room_obj.local_participant.publish_track(track, options)
    except Exception as exc:  # noqa: BLE001
        print(f"MIC_PUBLISH_FAILED err={type(exc).__name__}: {exc}", flush=True)
        return False
    print("MIC_PUBLISHED", flush=True)
    base_count = len(frames)
    answer_s = 0.0
    CHUNK = 320  # 20ms @16kHz
    idx = 0
    total_chunks = len(pcm) // (CHUNK * 2)
    start = time.monotonic()
    while idx < total_chunks:
        chunk = pcm[idx * CHUNK * 2 : (idx + 1) * CHUNK * 2]
        await source.capture_frame(
            rtc.AudioFrame(
                data=chunk, sample_rate=16000, num_channels=1, samples_per_channel=CHUNK
            )
        )
        idx += 1
        await asyncio.sleep(0.02)
    print("MIC_DONE", flush=True)
    # Keep listening for her spoken answer (excludes our own mic echo window
    # by counting only frames after publish plus a 2s grace).
    await asyncio.sleep(2)
    mark = len(frames)
    answer_end = time.monotonic() + 150
    last = mark
    while time.monotonic() < answer_end:
        await asyncio.sleep(3)
        for fr in frames[last:]:
            if _frame_energy(fr) > 50:
                answer_s += (len(bytes(fr.data)) // 2) / fr.sample_rate
        last = len(frames)
        elapsed = time.monotonic() - start
        print(
            f"ANSWER_PROGRESS elapsed={elapsed:.0f}s answer={answer_s:.1f}s",
            flush=True,
        )
        if answer_s >= 2.0:
            return True
    return False


async def main() -> int:
    suffix = sys.argv[1] if len(sys.argv) > 1 else str(int(time.time()) % 100000)
    room = f"friday-cli-test-{suffix}"
    print(f"ROOM={room}", flush=True)
    try:
        ok = await attempt(room)
    except Exception as exc:  # noqa: BLE001
        print(f"ATTEMPT_FAILED err={type(exc).__name__}: {exc}", flush=True)
        return 1
    print("GREETING_CAPTURED" if ok else "GREETING_MISSING", flush=True)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
