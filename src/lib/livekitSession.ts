import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type LocalTrack,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type TrackPublication,
} from "livekit-client";
import { reportError } from "./reportError";

export type LiveKitRemoteTrackEvent = {
  track: RemoteTrack;
  participant: RemoteParticipant;
  publication?: RemoteTrackPublication;
};

export type LiveKitSessionHandlers = {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onReconnecting?: () => void;
  onReconnected?: () => void;
  onTrackSubscribed?: (event: LiveKitRemoteTrackEvent) => void;
  onTrackUnsubscribed?: (event: LiveKitRemoteTrackEvent) => void;
  onTrackPublished?: (publication: RemoteTrackPublication, participant: RemoteParticipant) => void;
  onTrackMuted?: (publication: TrackPublication, participant: Participant) => void;
  onTrackUnmuted?: (publication: TrackPublication, participant: Participant) => void;
  onActiveSpeakers?: (identities: string[]) => void;
  onParticipantConnected?: (participant: RemoteParticipant) => void;
  onParticipantDisconnected?: (participant: RemoteParticipant) => void;
  onLocalPublishPermissionChanged?: (canPublish: boolean | null) => void;
};

function detachTrack(track: RemoteTrack | LocalTrack): void {
  try {
    track.detach().forEach((el) => {
      el.srcObject = null;
      el.remove();
    });
  } catch (error) {
    reportError("livekit.detachTrack", error);
  }
}

export class LiveKitSession {
  private room: Room | null = null;
  private handlers: LiveKitSessionHandlers;
  private connectGeneration = 0;

  constructor(handlers: LiveKitSessionHandlers = {}) {
    this.handlers = handlers;
  }

  setHandlers(handlers: LiveKitSessionHandlers): void {
    this.handlers = handlers;
  }

  get connected(): boolean {
    return this.room?.state === ConnectionState.Connected;
  }

  get raw(): Room | null {
    return this.room;
  }

  get publishPermission(): boolean | null {
    const permissions = this.room?.localParticipant?.permissions;
    if (!permissions) return null;
    return permissions.canPublish === true;
  }

  async connect(url: string, token: string): Promise<void> {
    const generation = ++this.connectGeneration;
    const previous = this.room;
    this.room = null;
    if (previous) {
      previous.removeAllListeners();
      void previous.disconnect().catch((error: unknown) => reportError("livekit.disconnectPrevious", error));
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      stopLocalTrackOnUnpublish: false,
    });
    if (generation !== this.connectGeneration) {
      void room.disconnect().catch((error: unknown) => reportError("livekit.disconnectStale", error));
      return;
    }
    this.room = room;
    this.bind(room, generation);
    await room.connect(url, token);
    if (generation !== this.connectGeneration) {
      void room.disconnect().catch((error: unknown) => reportError("livekit.disconnectStale", error));
    }
  }

  async publishCamera(opts?: { audio?: boolean; video?: boolean }): Promise<void> {
    const room = this.room;
    if (!room || room.state !== ConnectionState.Connected) {
      throw new Error("LiveKit room is not connected");
    }
    await room.localParticipant.setCameraEnabled(opts?.video !== false);
    await room.localParticipant.setMicrophoneEnabled(opts?.audio !== false);
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    await this.room?.localParticipant.setCameraEnabled(enabled);
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    await this.room?.localParticipant.setMicrophoneEnabled(enabled);
  }

  attachLocalVideo(element: HTMLVideoElement): void {
    const pub = this.room?.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track;
    if (track) track.attach(element);
  }

  async disconnect(): Promise<void> {
    this.connectGeneration += 1;
    const room = this.room;
    this.room = null;
    if (!room) return;
    room.removeAllListeners();
    try {
      room.localParticipant.videoTrackPublications.forEach((pub) => {
        if (pub.track) detachTrack(pub.track);
      });
    } catch (error) {
      reportError("livekit.detachLocalVideo", error);
    }
    await room.disconnect().catch((error: unknown) => reportError("livekit.disconnect", error));
  }

  private bind(room: Room, generation: number): void {
    room
      .on(RoomEvent.Connected, () => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onConnected?.();
      })
      .on(RoomEvent.Disconnected, () => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onDisconnected?.();
      })
      .on(RoomEvent.Reconnecting, () => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onReconnecting?.();
      })
      .on(RoomEvent.Reconnected, () => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onReconnected?.();
      })
      .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onTrackSubscribed?.({ track, participant, publication });
      })
      .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        if (generation !== this.connectGeneration) return;
        detachTrack(track);
        this.handlers.onTrackUnsubscribed?.({ track, participant, publication });
      })
      .on(RoomEvent.TrackPublished, (publication, participant) => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onTrackPublished?.(publication, participant);
      })
      .on(RoomEvent.TrackMuted, (publication, participant) => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onTrackMuted?.(publication, participant);
      })
      .on(RoomEvent.TrackUnmuted, (publication, participant) => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onTrackUnmuted?.(publication, participant);
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onActiveSpeakers?.(speakers.map((s) => s.identity));
      })
      .on(RoomEvent.ParticipantConnected, (participant) => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onParticipantConnected?.(participant);
      })
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        if (generation !== this.connectGeneration) return;
        participant.trackPublications.forEach((pub) => {
          if (pub.track) detachTrack(pub.track as RemoteTrack);
        });
        this.handlers.onParticipantDisconnected?.(participant);
      })
      .on(RoomEvent.ParticipantPermissionsChanged, () => {
        if (generation !== this.connectGeneration) return;
        this.handlers.onLocalPublishPermissionChanged?.(this.publishPermission);
      });
  }
}
