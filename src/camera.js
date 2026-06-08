const video = document.querySelector("#preview");
const canvas = document.querySelector("#photo");
const status = document.querySelector("#status");
const captureButton = document.querySelector("#capture");
const retakeButton = document.querySelector("#retake");
const useButton = document.querySelector("#use");
const id = new URLSearchParams(location.search).get("id");
let stream = null;
let image = "";

function stopCamera() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
}

async function startCamera() {
  if (!id) {
    status.textContent = "This camera session is missing. Return to StudyPop and try again.";
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    captureButton.disabled = false;
    status.textContent = "Place the question inside the frame.";
  } catch {
    status.textContent =
      "Camera permission was blocked. Choose Allow in this window, then refresh it.";
  }
}

captureButton.addEventListener("click", () => {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  image = canvas.toDataURL("image/jpeg", 0.86);
  video.hidden = true;
  canvas.hidden = false;
  captureButton.hidden = true;
  retakeButton.hidden = false;
  useButton.hidden = false;
  status.textContent = "Make sure the writing is clear and readable.";
});

retakeButton.addEventListener("click", () => {
  image = "";
  canvas.hidden = true;
  video.hidden = false;
  captureButton.hidden = false;
  retakeButton.hidden = true;
  useButton.hidden = true;
  status.textContent = "Place the question inside the frame.";
});

useButton.addEventListener("click", async () => {
  if (!image) return;
  useButton.disabled = true;
  status.textContent = "Sending the picture to StudyPop...";
  try {
    const response = await fetch("/api/camera/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, image }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    stopCamera();
    status.textContent = "Photo added. You can return to StudyPop!";
    setTimeout(() => window.close(), 700);
  } catch (error) {
    useButton.disabled = false;
    status.textContent = error.message || "The photo could not be sent.";
  }
});

window.addEventListener("pagehide", stopCamera);
startCamera();
