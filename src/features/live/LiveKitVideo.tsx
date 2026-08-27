import { useEffect, useRef } from 'react';
import { Room, RoomEvent, type LocalTrackPublication, type Track } from 'livekit-client';

interface LiveKitVideoProps {
  url: string;
  token: string;
  mode: 'publish' | 'subscribe';
}

export default function LiveKitVideo({ url, token, mode }: LiveKitVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    if (!url || !token) return;

    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    const attach = (track: Track | undefined) => {
      if (!track) return;
      if (track.kind === 'video' && videoRef.current) {
        track.attach(videoRef.current);
      } else if (track.kind === 'audio' && audioRef.current) {
        track.attach(audioRef.current);
      }
    };

    const onLocalTrackPublished = (pub: LocalTrackPublication) => attach(pub.track);
    const onTrackSubscribed = (track: Track) => attach(track);
    const onTrackUnsubscribed = (track: Track) => track.detach();

    room.on(RoomEvent.LocalTrackPublished, onLocalTrackPublished);
    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);

    (async () => {
      try {
        await room.connect(url, token);
        if (mode === 'publish') {
          await room.localParticipant.setCameraEnabled(true);
          await room.localParticipant.setMicrophoneEnabled(true);
        }
      } catch (error) {
        console.error('LiveKit connection failed:', error);
      }
    })();

    return () => {
      room.disconnect().catch(() => undefined);
      roomRef.current = null;
    };
  }, [url, token, mode]);

  return (
    <div className="relative h-full w-full">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={mode === 'publish'}
        className="h-full w-full rounded-2xl object-cover"
      />
      {mode === 'subscribe' && <audio ref={audioRef} autoPlay className="hidden" />}
    </div>
  );
}
