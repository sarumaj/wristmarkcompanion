// Placeholder until milestone 2: reports whether this browser can open the
// camera here, which needs a secure origin (HTTPS) and getUserMedia.
const status = document.getElementById("camera-support");
if (!window.isSecureContext) {
  status.textContent = "This page is not on HTTPS: the browser will not open the camera here.";
} else if (!navigator.mediaDevices?.getUserMedia) {
  status.textContent = "This browser has no camera access (getUserMedia).";
} else {
  status.textContent = "Camera access is available on this page.";
}
