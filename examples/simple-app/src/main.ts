import "./style.css";

import { createStream } from "./createMockStream";
import { Endpoint } from "@jellyfish-dev/membrane-webrtc-js";
import { JellyfishClient } from "@jellyfish-dev/ts-client-sdk";
import { enumerateDevices, getUserMedia, SCREEN_SHARING_MEDIA_CONSTRAINTS } from "@jellyfish-dev/browser-media-utils";

const peerTokenInput = document.querySelector<HTMLInputElement>("#peer-token-input")!;
const peerNameInput = document.querySelector<HTMLInputElement>("#peer-name-input")!;
const connectButton = document.querySelector<HTMLButtonElement>("#connect-btn")!;
const disconnectButton = document.querySelector<HTMLButtonElement>("#disconnect-btn")!;
const addTrackButton = document.querySelector<HTMLButtonElement>("#add-track-btn")!;
const removeTrackButton = document.querySelector<HTMLButtonElement>("#remove-track-btn")!;
const localVideo = document.querySelector<HTMLVideoElement>("#local-track-video")!;
const enumerateDevicesButton = document.querySelector<HTMLVideoElement>("#enumerate-devices-btn")!;
const screenSharingContainer = document.querySelector<HTMLVideoElement>("#screen-sharing-container")!;
const templateVideoPlayer = document.querySelector("#video-player-template")!;

const elementsToShowIfConnected = document.querySelectorAll(".show-if-connected");
elementsToShowIfConnected.forEach((e) => e.classList.add("hidden"));

const borderActiveClasses = ["border-success", "border-4", "rounded-3", "border-solid"];

const stream = createStream("🧪", "black", 24).stream;
localVideo.srcObject = stream;

type Track = {
  id: string | null;
};
const remoteTracks = {
  canvas: {
    id: null,
  } as Track,
  screen: {
    id: null,
  } as Track,
  cameras: {} as Record<string, Track>,
};

localVideo.play();

const inputArray = [peerTokenInput, peerNameInput];

inputArray.forEach((input) => {
  input.value = localStorage.getItem(input.id) || "";

  input.addEventListener("input", (event: any) => {
    localStorage.setItem(input.id, event.target?.value);
  });
});

const TrackTypeValues = ["screensharing", "camera", "audio"] as const;
export type TrackType = (typeof TrackTypeValues)[number];

export type PeerMetadata = {
  name: string;
};
export type TrackMetadata = {
  type: TrackType;
  active: boolean;
};

const client = new JellyfishClient<PeerMetadata, TrackMetadata>();

client.on("socketClose", () => {
  toastInfo("Socket closed");
});

client.on("socketError", () => {
  toastAlert("Socket error");
});

client.on("authSuccess", () => {
  toastSuccess("Auth success");
});

client.on("authError", () => {
  toastAlert("Auth error");
});

client.on("disconnected", () => {
  toastInfo("Disconnected");
});

client.on("joined", (_peerId, peersInRoom) => {
  console.log("Join success!");
  toastSuccess(`Joined room`);
  const template = document.querySelector("#remote-peer-template-card")!;
  const remotePeers = document.querySelector("#remote-peers")!;

  (peersInRoom || []).forEach((peer: Endpoint) => {
    // @ts-ignore
    const clone = template.content.cloneNode(true);
    const card = clone.firstElementChild;
    card.dataset.peerId = peer.id;

    const peerId = clone.querySelector(".remote-peer-template-id");
    peerId.innerHTML = peer.id;

    clone.firstElementChild.dataset.peerId = peer.id;

    document.querySelector(`div[data-peer-id="${peer.id}"`)?.remove();
    remotePeers.appendChild(clone);
  });
});
client.on("joinError", (_metadata) => {
  toastAlert("Join error");
});
client.on("peerJoined", (peer) => {
  console.log("Join success!");
  const template = document.querySelector("#remote-peer-template-card")!;
  const remotePeers = document.querySelector("#remote-peers")!;

  // @ts-ignore
  const clone = template.content.cloneNode(true);
  const card = clone.firstElementChild;
  card.dataset.peerId = peer.id;

  const peerId = clone.querySelector(".remote-peer-template-id");
  peerId.innerHTML = peer.id;

  clone.firstElementChild.dataset.peerId = peer.id;

  document.querySelector(`div[data-peer-id="${peer.id}"`)?.remove();
  remotePeers.appendChild(clone);
  toastInfo(`New peer joined`);
});
client.on("peerUpdated", (_peer) => {});
client.on("peerLeft", (peer) => {
  const peerComponent = document.querySelector(`div[data-peer-id="${peer.id}"`)!;
  peerComponent.remove();
  toastInfo(`Peer left`);
});
client.on("trackReady", (ctx) => {
  console.log("On track ready");
  const peerId = ctx.endpoint.id;
  const peerComponent = document.querySelector(`div[data-peer-id="${peerId}"`)!;
  const videoPlayer: HTMLVideoElement = peerComponent.querySelector(".remote-peer-template-video")!;

  videoPlayer.srcObject = ctx.stream;
  videoPlayer.play();
});

client.on("trackAdded", (ctx) => {
  ctx.on("encodingChanged", () => {});
  ctx.on("voiceActivityChanged", () => {});
});

client.on("trackRemoved", (_ctx) => {});
client.on("trackUpdated", (_ctx) => {});
client.on("bandwidthEstimationChanged", (_estimation) => {});
client.on("tracksPriorityChanged", (_enabledTracks, _disabledTracks) => {});

connectButton.addEventListener("click", () => {
  console.log("Connect");
  client.connect({
    peerMetadata: { name: peerNameInput.value || "" },
    token: peerTokenInput.value,
  });
  elementsToShowIfConnected.forEach((e) => e.classList.remove("hidden"));
});

disconnectButton.addEventListener("click", () => {
  console.log("Disconnect");
  client.cleanUp();
  elementsToShowIfConnected.forEach((e) => e.classList.add("hidden"));
});

const addTrack = (stream: MediaStream): Track => {
  console.log("Add track");
  const trackMetadata: TrackMetadata = {
    type: "camera",
    active: true,
  };
  const track = stream.getVideoTracks()[0];
  const id = client.addTrack(track, stream, trackMetadata) || null;
  return {
    id,
  };
};

const removeTrack = (track: Track) => {
  if (!track) return;
  console.log("Remove track");
  track.id && client.removeTrack(track.id);
  track.id = null;
};

addTrackButton.addEventListener("click", () => {
  remoteTracks.canvas = addTrack(stream);
  localVideo.classList.add(...borderActiveClasses);
});

removeTrackButton.addEventListener("click", () => {
  removeTrack(remoteTracks.canvas);
  localVideo.classList.remove(...borderActiveClasses);
});

enumerateDevicesButton.addEventListener("click", () => {
  enumerateDevices(true, false).then((result) => {
    console.log(result);
    if (result.video.type !== "OK") return;

    const videoPlayers = document.querySelector("#video-players")!;
    videoPlayers.innerHTML = "";

    // Video devices views
    result.video.devices.forEach((device) => {
      // @ts-ignore
      const clone = templateVideoPlayer.content.firstElementChild.cloneNode(true);
      const videoPlayer = clone.querySelector(".video-player");

      clone.querySelector(".device-label").innerHTML = device.label;
      clone.querySelector(".device-id").innerHTML = device.deviceId;

      clone.querySelector(".start-template-btn").addEventListener("click", () => {
        console.log("Start");
        getUserMedia(device.deviceId, "video").then((stream) => {
          console.log("Connecting stream");
          videoPlayer.srcObject = stream;
          videoPlayer.play();
        });
      });
      clone.querySelector(".stop-template-btn").addEventListener("click", () => {
        console.log("Stop");
        const stream = videoPlayer.srcObject;
        stream.getTracks().forEach((track: MediaStreamTrack) => {
          track.stop();
        });
        videoPlayer.srcObject = null;
      });

      clone.querySelector(".add-track-template-btn").addEventListener("click", () => {
        if (!videoPlayer.srcObject) return;

        remoteTracks.cameras[device.deviceId] = addTrack(videoPlayer.srcObject);
        videoPlayer.classList.add(...borderActiveClasses);
      });

      clone.querySelector(".remove-track-template-btn").addEventListener("click", () => {
        removeTrack(remoteTracks.cameras[device.deviceId]);
        videoPlayer.classList.remove(...borderActiveClasses);
      });

      videoPlayers.appendChild(clone);
    });
  });
});

// Screen sharing view

const templateClone = (templateVideoPlayer as HTMLTemplateElement).content.firstElementChild!.cloneNode(
  true,
)! as HTMLElement;
screenSharingContainer.appendChild(templateClone);

const screenSharingVideo = templateClone.querySelector(".video-player")! as HTMLVideoElement;

templateClone.querySelector(".start-template-btn")!.addEventListener("click", () => {
  navigator.mediaDevices.getDisplayMedia(SCREEN_SHARING_MEDIA_CONSTRAINTS).then((stream) => {
    console.log("Screen sharing stream");
    screenSharingVideo.srcObject = stream;
    screenSharingVideo.play();
  });
});

templateClone.querySelector(".stop-template-btn")!.addEventListener("click", () => {
  console.log("Stop screen sharing");
  const stream = screenSharingVideo.srcObject as MediaStream;
  stream?.getTracks().forEach((track: MediaStreamTrack) => {
    track.stop();
  });
  screenSharingVideo.srcObject = null;
});

templateClone.querySelector(".add-track-template-btn")!.addEventListener("click", () => {
  if (!screenSharingVideo.srcObject) return;

  remoteTracks.screen = addTrack(screenSharingVideo.srcObject as MediaStream);
  screenSharingVideo.classList.add(...borderActiveClasses);
});

templateClone.querySelector(".remove-track-template-btn")!.addEventListener("click", () => {
  removeTrack(remoteTracks.screen);
  screenSharingVideo.classList.remove(...borderActiveClasses);
});

(function hideRemotePeersIfEmpty() {
  const remotePeersContainer = document.getElementById("remote-peers-container")!;
  const targetNode = document.getElementById("remote-peers")!;

  const config = { childList: true };

  const callback = () => {
    if (targetNode.childElementCount === 0) {
      remotePeersContainer.style.display = "none";
    } else {
      remotePeersContainer.style.display = "";
    }
  };

  callback();
  const observer = new MutationObserver(callback);
  observer.observe(targetNode, config);
})();

// Toasts

const templateAlert = document.getElementById("toast-alert-template")! as HTMLTemplateElement;

function toastAlert(message: string) {
  toast(message, templateAlert);
}

const templateInfo = document.getElementById("toast-info-template")! as HTMLTemplateElement;

function toastInfo(message: string) {
  toast(message, templateInfo);
}

const templateSuccess = document.getElementById("toast-success-template")! as HTMLTemplateElement;

function toastSuccess(message: string) {
  toast(message, templateSuccess);
}

function toast(message: string, template: HTMLTemplateElement) {
  const hiddenClasses = ["opacity-0", "-translate-y-4", "scale-x-95", "h-0", "py-0", "mt-0"];
  const visibleClasses = ["opacity-100", "translate-y-0", "scale-100", "h-[60px]", "mt-2"];
  const toastContainer = document.getElementById("toast-container")!;
  const clone = template.content.firstElementChild!.cloneNode(true)! as HTMLElement;

  let animationDuration: number = 0;
  clone.classList.forEach((c) => {
    if (c.startsWith("duration-")) {
      const [_, d] = c.split("-");
      const parsed = parseInt(d);
      if (isNaN(parsed)) return;

      animationDuration = parsed;
    }
  });

  clone.classList.add(...hiddenClasses);
  setTimeout(() => {
    clone.classList.remove(...hiddenClasses);
    clone.classList.add(...visibleClasses);
  }, 1);

  clone.querySelector(".toast-message")!.innerHTML = message;
  toastContainer.appendChild(clone);

  const hideAlert = () => {
    clone.classList.add(...hiddenClasses);
    clone.classList.remove(...visibleClasses);

    setTimeout(() => {
      clone.remove();
    }, animationDuration);
  };

  clone.addEventListener("click", () => {
    hideAlert();
  });

  setTimeout(() => {
    hideAlert();
  }, 2000);
}
