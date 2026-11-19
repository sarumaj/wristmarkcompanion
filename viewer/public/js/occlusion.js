// The hands in front of the model hide it (docs/dev/interaction.md#built-the-hand-in-front):
// the camera's image is flat, so without help the model is drawn over everything, a finger
// reaching for it included. From hand tracking's 21 points of each hand (js/hands.js) a
// rough hand of spheres and tubes is placed where the hand is, in millimeters in the
// camera's frame, and drawn before the model into the depth buffer only: invisible, but
// where it is nearer than the model, the model isn't drawn, and the real hand in the video
// shows through.
//
// Where the hand is: MediaPipe gives each hand's points twice, in the image (0 to 1) and in
// meters about the hand's own center ("world" landmarks, the camera's axes). The hand's
// offset from the camera is the one that projects the second onto the first: a linear least
// squares fit, which takes the hand's size and how it is turned into account.
import * as THREE from "../vendor/three/three.module.js";
import { BONES } from "./hands.js";

// The tubes' and joints' radii (mm): fingers about 16 mm wide, the palm's bones wider.
const FINGER_MM = 8;
const PALM_MM = 11;
const PALM_BONES = new Set(["0-1", "0-5", "5-9", "9-13", "13-17", "0-17"]);
// The palm between its bones, a fan from the wrist: the thumb's base and the knuckles.
const PALM_FAN = [1, 5, 9, 13, 17];
// How much farther the hand is put than measured (mm): a hand guessed a little too near
// would cut into a model it is only next to; one a little too far merely shows the model
// over the fingertip that touches it.
export const MARGIN_MM = 10;

// The hand's 21 points in three.js's camera frame (mm; x right, y up, z toward the viewer)
// from its image points (`image`, 0 to 1) and world points (`world`, meters), for a camera
// of `fovDegrees` across an image `width` by `height`. Null where no offset fits (the hand
// would be behind the camera).
export function placeHand(image, world, { width, height, fovDegrees }) {
  // The field of view across the longer side, as the marker's (tracker.js, focalLength).
  const f = (0.5 * Math.max(width, height)) / Math.tan((fovDegrees * Math.PI) / 360);
  // The normal equations of f*Tx - u*Tz = u*Z - f*X and f*Ty - v*Tz = v*Z - f*Y, in the
  // image's frame (x right, y down, z away), the image's center the origin.
  const a = [0, 0, 0, 0, 0, 0];
  const b = [0, 0, 0];
  for (let i = 0; i < image.length; i++) {
    const u = (image[i].x - 0.5) * width;
    const v = (image[i].y - 0.5) * height;
    const [x, y, z] = [world[i].x * 1000, world[i].y * 1000, world[i].z * 1000];
    const bu = u * z - f * x;
    const bv = v * z - f * y;
    // Rows [f, 0, -u] and [0, f, -v]: a holds the symmetric matrix's xx, yy, zz, xy, xz, yz.
    a[0] += f * f;
    a[1] += f * f;
    a[2] += u * u + v * v;
    a[4] += -f * u;
    a[5] += -f * v;
    b[0] += f * bu;
    b[1] += f * bv;
    b[2] += -u * bu - v * bv;
  }
  const m = new THREE.Matrix3().set(a[0], a[3], a[4], a[3], a[1], a[5], a[4], a[5], a[2]);
  if (Math.abs(m.determinant()) < 1e-9) return null;
  const t = new THREE.Vector3(...b).applyMatrix3(m.invert());
  if (t.z <= 0) return null;
  return world.map(({ x, y, z }) => {
    const point = new THREE.Vector3(x * 1000 + t.x, -(y * 1000 + t.y), -(z * 1000 + t.z));
    return point.multiplyScalar((point.length() + MARGIN_MM) / point.length());
  });
}

// Whether a hand's image points (0 to 1) are over the marker last seen at `corners` (the
// detection's pixels in an image `width` by `height`), its box grown by half on each side:
// the hand that hides the marker, which then shouldn't make the model go.
export function handOver(hands, corners, width, height) {
  if (!corners || !hands.length) return false;
  const xs = corners.map((c) => c.x / width);
  const ys = corners.map((c) => c.y / height);
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const grow = 0.5 * Math.max(right - left, bottom - top);
  return hands.some((points) =>
    points.some(({ x, y }) => x >= left - grow && x <= right + grow && y >= top - grow && y <= bottom + grow),
  );
}

// The invisible hands: `object` goes into the scene (its camera at the origin), `update`
// places them each time the hands are looked for, `show` draws them in color (the debug
// view) to see where they are.
export class HandOccluder {
  constructor(hands = 2) {
    this.material = new THREE.MeshBasicMaterial({ color: 0xff3dbb, colorWrite: false, side: THREE.DoubleSide });
    this.joints = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), this.material, 21 * hands);
    this.bones = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), this.material, BONES.length * hands);
    this.palmGeometry = new THREE.BufferGeometry();
    this.palmGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array((PALM_FAN.length - 1) * 9 * hands), 3));
    this.palm = new THREE.Mesh(this.palmGeometry, this.material);
    this.object = new THREE.Group();
    this.object.add(this.joints, this.bones, this.palm);
    // Before everything else: the model's pixels behind a hand then fail the depth test.
    for (const part of [this.joints, this.bones, this.palm]) {
      part.renderOrder = -1;
      part.frustumCulled = false;
    }
    this.object.visible = false;
  }

  show(on) {
    this.material.colorWrite = on;
  }

  // `hands`: each hand's 21 points in the camera's frame (placeHand), or none.
  update(hands) {
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const turn = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const middle = new THREE.Vector3();
    const along = new THREE.Vector3();
    let joints = 0;
    let bones = 0;
    const palm = this.palmGeometry.attributes.position;
    let corner = 0;
    for (const points of hands) {
      points.forEach((point, i) => {
        const radius = i === 0 ? PALM_MM : FINGER_MM;
        this.joints.setMatrixAt(joints++, matrix.compose(point, turn.identity(), scale.setScalar(radius)));
      });
      for (const [from, to] of BONES) {
        along.subVectors(points[to], points[from]);
        const length = along.length();
        if (length < 1e-3) continue;
        const radius = PALM_BONES.has(`${from}-${to}`) ? PALM_MM : FINGER_MM;
        middle.addVectors(points[from], points[to]).multiplyScalar(0.5);
        turn.setFromUnitVectors(up, along.divideScalar(length));
        this.bones.setMatrixAt(bones++, matrix.compose(middle, turn, scale.set(radius, length, radius)));
      }
      for (let k = 0; k + 1 < PALM_FAN.length; k++) {
        for (const index of [0, PALM_FAN[k], PALM_FAN[k + 1]]) palm.setXYZ(corner++, ...points[index].toArray());
      }
    }
    this.joints.count = joints;
    this.bones.count = bones;
    this.joints.instanceMatrix.needsUpdate = true;
    this.bones.instanceMatrix.needsUpdate = true;
    this.palmGeometry.setDrawRange(0, corner);
    palm.needsUpdate = true;
    this.object.visible = hands.length > 0;
  }
}
