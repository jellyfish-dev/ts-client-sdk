import { RemoteTrackId, TrackContext, TrackEncoding } from './types';
import { simulcastTransceiverConfig } from './const';
import { applyBandwidthLimitation } from './bandwidth';
import { TrackContextImpl } from './internal';

export const addTransceiversIfNeeded = (
  connection: RTCPeerConnection | undefined,
  serverTracks: Map<string, number>,
) => {
  const recvTransceivers = connection!
    .getTransceivers()
    .filter((elem) => elem.direction === 'recvonly');
  let toAdd: string[] = [];

  const getNeededTransceiversTypes = (type: string): string[] => {
    let typeNumber = serverTracks.get(type);
    typeNumber = typeNumber !== undefined ? typeNumber : 0;
    const typeTransceiversNumber = recvTransceivers.filter(
      (elem) => elem.receiver.track.kind === type,
    ).length;
    return Array(typeNumber - typeTransceiversNumber).fill(type);
  };

  const audio = getNeededTransceiversTypes('audio');
  const video = getNeededTransceiversTypes('video');
  toAdd = toAdd.concat(audio);
  toAdd = toAdd.concat(video);

  for (const kind of toAdd)
    connection?.addTransceiver(kind, { direction: 'recvonly' });
};

export const setTransceiverDirection = (connection: RTCPeerConnection) => {
  connection
    .getTransceivers()
    .forEach(
      (transceiver) =>
        (transceiver.direction =
          transceiver.direction === 'sendrecv'
            ? 'sendonly'
            : transceiver.direction),
    );
};

export const addTrackToConnection = <EndpointMetadata, TrackMetadata>(
  trackContext: TrackContext<EndpointMetadata, TrackMetadata>,
  disabledTrackEncodingsMap: Map<string, TrackEncoding[]>,
  connection: RTCPeerConnection | undefined,
) => {
  const transceiverConfig = createTransceiverConfig(
    trackContext,
    disabledTrackEncodingsMap,
  );
  const track = trackContext.track!;
  connection!.addTransceiver(track, transceiverConfig);
};

const createTransceiverConfig = <EndpointMetadata, TrackMetadata>(
  trackContext: TrackContext<EndpointMetadata, TrackMetadata>,
  disabledTrackEncodingsMap: Map<string, TrackEncoding[]>,
): RTCRtpTransceiverInit => {
  let transceiverConfig: RTCRtpTransceiverInit;

  if (trackContext.track!.kind === 'audio') {
    transceiverConfig = createAudioTransceiverConfig(trackContext);
  } else {
    transceiverConfig = createVideoTransceiverConfig(
      trackContext,
      disabledTrackEncodingsMap,
    );
  }

  return transceiverConfig;
};

const createAudioTransceiverConfig = <EndpointMetadata, TrackMetadata>(
  trackContext: TrackContext<EndpointMetadata, TrackMetadata>,
): RTCRtpTransceiverInit => {
  return {
    direction: 'sendonly',
    streams: trackContext.stream ? [trackContext.stream] : [],
  };
};

const createVideoTransceiverConfig = <EndpointMetadata, TrackMetadata>(
  trackContext: TrackContext<EndpointMetadata, TrackMetadata>,
  disabledTrackEncodingsMap: Map<string, TrackEncoding[]>,
): RTCRtpTransceiverInit => {
  let transceiverConfig: RTCRtpTransceiverInit;
  if (trackContext.simulcastConfig!.enabled) {
    transceiverConfig = simulcastTransceiverConfig;
    const trackActiveEncodings = trackContext.simulcastConfig!.activeEncodings;
    const disabledTrackEncodings: TrackEncoding[] = [];
    transceiverConfig.sendEncodings?.forEach((encoding) => {
      if (trackActiveEncodings.includes(encoding.rid! as TrackEncoding)) {
        encoding.active = true;
      } else {
        disabledTrackEncodings.push(encoding.rid! as TrackEncoding);
      }
    });
    disabledTrackEncodingsMap.set(trackContext.trackId, disabledTrackEncodings);
  } else {
    transceiverConfig = {
      direction: 'sendonly',
      sendEncodings: [
        {
          active: true,
        },
      ],
      streams: trackContext.stream ? [trackContext.stream] : [],
    };
  }

  if (trackContext.maxBandwidth && transceiverConfig.sendEncodings)
    applyBandwidthLimitation(
      transceiverConfig.sendEncodings,
      trackContext.maxBandwidth,
    );

  return transceiverConfig;
};

export const setTransceiversToReadOnly = (connection: RTCPeerConnection) => {
  connection
    .getTransceivers()
    .forEach((transceiver) => (transceiver.direction = 'sendonly'));
};

export const getMidToTrackId = <EndpointMetadata, TrackMetadata>(
  connection: RTCPeerConnection | undefined,
  localTrackIdToTrack: Map<
    RemoteTrackId,
    TrackContextImpl<EndpointMetadata, TrackMetadata>
  >,
): Record<string, string> | null => {
  const localTrackMidToTrackId: Record<string, string> = {};

  if (!connection) return null;
  connection.getTransceivers().forEach((transceiver) => {
    const localTrackId = transceiver.sender.track?.id;
    const mid = transceiver.mid;
    if (localTrackId && mid) {
      const trackContext = Array.from(localTrackIdToTrack.values()).find(
        (trackContext) => trackContext!.track!.id === localTrackId,
      )!;
      localTrackMidToTrackId[mid] = trackContext.trackId;
    }
  });

  return localTrackMidToTrackId;
};