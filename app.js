import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { FBXExporter } from '@comfyorg/fbx-exporter-three';

const $ = (selector) => document.querySelector(selector);

const els = {
  fileInput: $('#fileInput'),
  dropZone: $('#dropZone'),
  clearAllBtn: $('#clearAllBtn'),
  assetList: $('#assetList'),
  assetCount: $('#assetCount'),
  actionList: $('#actionList'),
  actionCount: $('#actionCount'),
  actionSearch: $('#actionSearch'),
  selectAllActionsBtn: $('#selectAllActionsBtn'),
  deselectEmptyActionsBtn: $('#deselectEmptyActionsBtn'),
  renameCompatibleActionsBtn: $('#renameCompatibleActionsBtn'),
  viewport: $('#viewport'),
  viewportEmpty: $('#viewportEmpty'),
  toggleProjectionBtn: $('#toggleProjectionBtn'),
  viewGizmo: $('#viewGizmo'),
  viewAxisButtons: [...document.querySelectorAll('[data-axis-view]')],
  navLineX: $('#navLineX'),
  navLineY: $('#navLineY'),
  navLineZ: $('#navLineZ'),
  navLineXNeg: $('#navLineXNeg'),
  navLineYNeg: $('#navLineYNeg'),
  navLineZNeg: $('#navLineZNeg'),
  baseBadge: $('#baseBadge'),
  activeActionBadge: $('#activeActionBadge'),
  playPauseBtn: $('#playPauseBtn'),
  timeline: $('#timeline'),
  currentTime: $('#currentTime'),
  durationTime: $('#durationTime'),
  speedSelect: $('#speedSelect'),
  toggleMotionPanelBtn: $('#toggleMotionPanelBtn'),
  motionPanel: $('#motionPanel'),
  motionPanelBody: $('#motionPanelBody'),
  motionPanelActionName: $('#motionPanelActionName'),
  resetMotionPanelBtn: $('#resetMotionPanelBtn'),
  overdriveRange: $('#overdriveRange'),
  overdriveValue: $('#overdriveValue'),
  armSpaceRange: $('#armSpaceRange'),
  armSpaceValue: $('#armSpaceValue'),
  trimStartRange: $('#trimStartRange'),
  trimEndRange: $('#trimEndRange'),
  trimRangeFill: $('#trimRangeFill'),
  trimFramesLabel: $('#trimFramesLabel'),
  trimStartValue: $('#trimStartValue'),
  trimEndValue: $('#trimEndValue'),
  resetTrimBtn: $('#resetTrimBtn'),
  mirrorActionCheckbox: $('#mirrorActionCheckbox'),
  rootResolvedName: $('#rootResolvedName'),
  rootOffsetX: $('#rootOffsetX'),
  rootOffsetY: $('#rootOffsetY'),
  rootOffsetZ: $('#rootOffsetZ'),
  rootRotationX: $('#rootRotationX'),
  rootRotationY: $('#rootRotationY'),
  rootRotationZ: $('#rootRotationZ'),
  resetRootOffsetBtn: $('#resetRootOffsetBtn'),
  toggleRootGizmoBtn: $('#toggleRootGizmoBtn'),
  rootMoveSnapSelect: $('#rootMoveSnapSelect'),
  rootRotateSnapSelect: $('#rootRotateSnapSelect'),
  rootGizmoHelp: $('#rootGizmoHelp'),
  limbDetectedLabel: $('#limbDetectedLabel'),
  limbSlotSelect: $('#limbSlotSelect'),
  limbBoneSelect: $('#limbBoneSelect'),
  toggleLimbGizmoBtn: $('#toggleLimbGizmoBtn'),
  limbAllowStretch: $('#limbAllowStretch'),
  limbOffsetX: $('#limbOffsetX'),
  limbOffsetY: $('#limbOffsetY'),
  limbOffsetZ: $('#limbOffsetZ'),
  limbRotationX: $('#limbRotationX'),
  limbRotationY: $('#limbRotationY'),
  limbRotationZ: $('#limbRotationZ'),
  resetLimbOffsetBtn: $('#resetLimbOffsetBtn'),
  toggleSkeletonBtn: $('#toggleSkeletonBtn'),
  fitCameraBtn: $('#fitCameraBtn'),
  statusBar: $('#statusBar'),
  statusText: $('#statusText'),
  presetSelect: $('#presetSelect'),
  exportModelName: $('#exportModelName'),
  exportActionCount: $('#exportActionCount'),
  exportFbxBtn: $('#exportFbxBtn'),
  exportGlbBtn: $('#exportGlbBtn'),
  assetTemplate: $('#assetTemplate'),
  actionTemplate: $('#actionTemplate'),
};

const state = {
  assets: [],
  clips: [],
  baseAssetId: null,
  activeClipId: null,
  mixer: null,
  currentAction: null,
  previewClip: null,
  skeletonHelper: null,
  skeletonVisible: false,
  previewStage: null,
  actionTransformNode: null,
  projectionMode: 'perspective',
  freeProjectionMode: 'perspective',
  orthoViewHeight: 4,
  axisViewActive: false,
  axisViewReturnMode: 'perspective',
  axisViewQuaternion: null,
  axisAutoSwitchPending: false,
  blenderNavDrag: null,
  motionPanelOpen: true,
  rootGizmoEnabled: false,
  rootMoveSnap: 0.5,
  rootRotateSnap: 5,
  rootGizmoDragging: false,
  rootGizmoDrag: null,
  activeLimbKey: 'leftHand',
  limbGizmoEnabled: false,
  limbGizmoDragging: false,
  limbGizmoDrag: null,
  isScrubbing: false,
  exporting: false,
};

const ACTION_TRANSFORM_NAME = '__ActionToEdit_ActionTransform__';
const EXPORT_CONTAINER_NAME = '__ActionToEdit_ExportContainer__';

const fbxLoader = new FBXLoader();
fbxLoader.trimAnimationClips = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1115);

const previewStage = new THREE.Group();
previewStage.name = '__preview_stage__';
scene.add(previewStage);
state.previewStage = previewStage;

// This is the non-destructive per-Action transform layer. The animated rig is
// a CHILD of this object, so moving/rotating it never rewrites any bone curve.
const actionTransformNode = new THREE.Group();
actionTransformNode.name = ACTION_TRANSFORM_NAME;
previewStage.add(actionTransformNode);
state.actionTransformNode = actionTransformNode;

const perspectiveCamera = new THREE.PerspectiveCamera(42, 1, 0.01, 100000);
perspectiveCamera.position.set(3, 2.4, 5);

const orthographicCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 100000);
orthographicCamera.position.copy(perspectiveCamera.position);

let camera = perspectiveCamera;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
els.viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.zoomToCursor = false;
controls.target.set(0, 1, 0);

// Blender-style mouse navigation:
// MMB = orbit, Shift+MMB = pan (handled natively by OrbitControls when
// MIDDLE is ROTATE), Ctrl+MMB = dolly (switched dynamically on pointerdown).
// Left/right mouse are left free for editing/selection instead of camera nav.
controls.mouseButtons.LEFT = null;
controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
controls.mouseButtons.RIGHT = null;

const rootGizmoProxy = new THREE.Object3D();
rootGizmoProxy.name = '__action_root_offset_gizmo__';
scene.add(rootGizmoProxy);

const rootTransformControls = new TransformControls(camera, renderer.domElement);
rootTransformControls.mode = 'translate';
rootTransformControls.space = 'world';
rootTransformControls.size = 0.72;
rootTransformControls.enabled = false;
scene.add(rootTransformControls.getHelper());
rootTransformControls.getHelper().visible = false;

// A second TransformControls shares the exact same proxy so translation arrows
// and rotation rings are visible at the same time. Rotation stays WORLD/GLOBAL.
const rootRotateControls = new TransformControls(camera, renderer.domElement);
rootRotateControls.mode = 'rotate';
rootRotateControls.space = 'world';
rootRotateControls.size = 0.92;
rootRotateControls.enabled = false;
scene.add(rootRotateControls.getHelper());
rootRotateControls.getHelper().visible = false;

const limbGizmoProxy = new THREE.Object3D();
limbGizmoProxy.name = '__limb_ik_gizmo__';
scene.add(limbGizmoProxy);

const limbTransformControls = new TransformControls(camera, renderer.domElement);
limbTransformControls.mode = 'translate';
limbTransformControls.space = 'world';
limbTransformControls.size = 0.58;
limbTransformControls.enabled = false;
scene.add(limbTransformControls.getHelper());
limbTransformControls.getHelper().visible = false;

const limbRotateControls = new TransformControls(camera, renderer.domElement);
limbRotateControls.mode = 'rotate';
limbRotateControls.space = 'world';
limbRotateControls.size = 0.76;
limbRotateControls.enabled = false;
scene.add(limbRotateControls.getHelper());
limbRotateControls.getHelper().visible = false;

const GIZMO_AXIS_COLORS = {
  x: 0xff3b4f,
  y: 0x42d66b,
  z: 0x3f7cff,
  active: 0xffd84a,
};

function applyStandardGizmoColors(control) {
  control.setColors(
    GIZMO_AXIS_COLORS.x,
    GIZMO_AXIS_COLORS.y,
    GIZMO_AXIS_COLORS.z,
    GIZMO_AXIS_COLORS.active
  );
}

// Same exact Blender-style axis convention on every transform control:
// X red · Y green · Z blue.
[
  rootTransformControls,
  rootRotateControls,
  limbTransformControls,
  limbRotateControls,
].forEach(applyStandardGizmoColors);

const hemi = new THREE.HemisphereLight(0xffffff, 0x20252b, 2.0);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 3.0);
key.position.set(4, 7, 5);
key.castShadow = true;
scene.add(key);
const rim = new THREE.DirectionalLight(0x9fb8ff, 1.2);
rim.position.set(-4, 3, -5);
scene.add(rim);

const grid = new THREE.GridHelper(20, 20, 0x39414c, 0x222830);
grid.position.y = 0;
scene.add(grid);

const clock = new THREE.Clock();

function uid(prefix = 'id') {
  return crypto.randomUUID ? crypto.randomUUID() : prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2);
}

function stripExt(name) {
  return name.replace(/\.fbx$/i, '');
}

function formatDuration(seconds) {
  return Number.isFinite(seconds) ? seconds.toFixed(2) + ' s' : '0.00 s';
}

function setStatus(message, kind = 'info') {
  els.statusText.textContent = message;
  els.statusBar.dataset.kind = kind;
}

function getBaseAsset() {
  return state.assets.find((asset) => asset.id === state.baseAssetId) || null;
}

const actionNameCollator = new Intl.Collator('es', {
  sensitivity: 'base',
  numeric: true,
});

function compareActionRecords(a, b) {
  const byName = actionNameCollator.compare(
    String(a?.name || ''),
    String(b?.name || '')
  );
  if (byName !== 0) return byName;

  const bySource = actionNameCollator.compare(
    String(a?.sourceFile || ''),
    String(b?.sourceFile || '')
  );
  if (bySource !== 0) return bySource;

  // Stable deterministic fallback for exact duplicates.
  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

function sortActionRecords(records) {
  return [...records].sort(compareActionRecords);
}

function getIncludedClips() {
  return sortActionRecords(
    state.clips.filter((record) => record.include)
  );
}

function isEmptyClip(record) {
  return Boolean(
    record?.empty ||
    !record?.clip ||
    record.clip.tracks.length === 0 ||
    record.clip.duration <= 1e-6
  );
}

function defaultLimbOffset() {
  return {
    bone: 'auto',
    position: { x: 0, y: 0, z: 0 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    allowStretch: false,
  };
}

const LIMB_KEYS = ['leftHand', 'rightHand', 'leftFoot', 'rightFoot'];

function ensureLimbOffsets(edit) {
  if (!edit.limbOffsets) edit.limbOffsets = {};
  for (const key of LIMB_KEYS) {
    if (!edit.limbOffsets[key]) edit.limbOffsets[key] = defaultLimbOffset();
    const limb = edit.limbOffsets[key];
    if (!limb.position) limb.position = { x: 0, y: 0, z: 0 };
    if (!limb.quaternion) limb.quaternion = { x: 0, y: 0, z: 0, w: 1 };
    if (typeof limb.allowStretch !== 'boolean') limb.allowStretch = false;
    if (!limb.bone) limb.bone = 'auto';
  }
  return edit.limbOffsets;
}

function defaultActionEdit() {
  return {
    overdrive: 50,
    armSpace: 50,
    trimStart: 0,
    trimEnd: 100,
    mirror: false,
    rootOffset: { x: 0, y: 0, z: 0 },
    rootQuaternion: { x: 0, y: 0, z: 0, w: 1 },
    limbOffsets: {
      leftHand: defaultLimbOffset(),
      rightHand: defaultLimbOffset(),
      leftFoot: defaultLimbOffset(),
      rightFoot: defaultLimbOffset(),
    },
  };
}

function normalizedStoredQuaternion(value) {
  const q = new THREE.Quaternion(
    Number(value?.x) || 0,
    Number(value?.y) || 0,
    Number(value?.z) || 0,
    Number.isFinite(Number(value?.w)) ? Number(value.w) : 1
  );
  if (q.lengthSq() < 1e-12) q.identity();
  return q.normalize();
}

function storeEditQuaternion(edit, quaternion) {
  const q = quaternion.clone().normalize();
  edit.rootQuaternion = { x: q.x, y: q.y, z: q.z, w: q.w };
  return q;
}

function getEditQuaternion(edit) {
  return normalizedStoredQuaternion(edit?.rootQuaternion);
}

function ensureActionEdit(record) {
  if (!record) return defaultActionEdit();
  if (!record.edit) record.edit = defaultActionEdit();
  if (!record.edit.rootOffset) record.edit.rootOffset = { x: 0, y: 0, z: 0 };
  ensureLimbOffsets(record.edit);

  if (!record.edit.rootQuaternion) {
    const legacyEuler = record.edit.rootRotation || { x: 0, y: 0, z: 0 };
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(Number(legacyEuler.x) || 0),
        THREE.MathUtils.degToRad(Number(legacyEuler.y) || 0),
        THREE.MathUtils.degToRad(Number(legacyEuler.z) || 0),
        'XYZ'
      )
    ).normalize();

    storeEditQuaternion(record.edit, q);
    delete record.edit.rootRotation;
  } else {
    storeEditQuaternion(record.edit, getEditQuaternion(record.edit));
  }

  return record.edit;
}

function getActiveRecord() {
  return state.clips.find((record) => record.id === state.activeClipId) || null;
}

function normalizeBoneToken(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/mixamorig[:_]?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function boneSideScore(name, side) {
  const raw = String(name || '').toLowerCase();
  const normalized = normalizeBoneToken(name);
  const leftPatterns = [
    /(^|[._:\- ])l($|[._:\- ])/,
    /(^|[._:\- ])left($|[._:\- ])/,
    /^l(hand|foot|wrist|ankle)/,
    /(hand|foot|wrist|ankle)l$/,
  ];
  const rightPatterns = [
    /(^|[._:\- ])r($|[._:\- ])/,
    /(^|[._:\- ])right($|[._:\- ])/,
    /^r(hand|foot|wrist|ankle)/,
    /(hand|foot|wrist|ankle)r$/,
  ];
  const patterns = side === 'left' ? leftPatterns : rightPatterns;
  const opposite = side === 'left' ? rightPatterns : leftPatterns;

  let score = 0;
  if (raw.includes(side)) score += 45;
  if (normalized.includes(side)) score += 45;
  if (patterns.some((re) => re.test(raw) || re.test(normalized))) score += 35;
  if (opposite.some((re) => re.test(raw) || re.test(normalized))) score -= 120;
  if (raw.includes(side === 'left' ? '.l' : '.r')) score += 45;
  if (raw.includes(side === 'left' ? '_l' : '_r')) score += 35;
  return score;
}

function scoreLimbBone(name, key) {
  const raw = String(name || '').toLowerCase();
  const token = normalizeBoneToken(name);
  const isHand = key.endsWith('Hand');
  const side = key.startsWith('left') ? 'left' : 'right';

  let score = boneSideScore(name, side);

  if (isHand) {
    if (/hand/.test(raw) || /hand/.test(token)) score += 90;
    if (/wrist/.test(raw) || /wrist/.test(token)) score += 70;
    if (/palm/.test(raw) || /palm/.test(token)) score += 30;
    if (/finger|thumb|index|middle|ring|pinky|little/.test(raw)) score -= 120;
  } else {
    if (/foot/.test(raw) || /foot/.test(token)) score += 90;
    if (/ankle/.test(raw) || /ankle/.test(token)) score += 70;
    if (/toe|ball/.test(raw)) score -= 100;
  }

  if (/mixamorig/.test(raw)) score += 15;
  if (/^def[-_:]/i.test(name)) score += 20;
  if (/^mch[-_:]|^org[-_:]|^ctrl[-_:]/i.test(name)) score -= 30;
  if (/(hand|foot)_[lr]$/i.test(name)) score += 35;
  if (/(hand|foot)\.[lr]$/i.test(name)) score += 35;
  if (/(left|right)(hand|foot)$/i.test(raw.replace(/[^a-z]/g, ''))) score += 35;

  return score;
}

function detectLimbBone(baseAsset, key) {
  if (!baseAsset) return '';
  const names = collectBoneNames(baseAsset.object);
  let best = '';
  let bestScore = -Infinity;

  for (const name of names) {
    const score = scoreLimbBone(name, key);
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }

  return bestScore >= 70 ? best : '';
}

function resolveLimbBoneName(edit, baseAsset, key) {
  const limb = ensureLimbOffsets(edit)[key];
  if (!limb) return '';
  if (limb.bone && limb.bone !== 'auto') return limb.bone;
  return detectLimbBone(baseAsset, key);
}

function getLimbQuaternion(limb) {
  return normalizedStoredQuaternion(limb?.quaternion);
}

function storeLimbQuaternion(limb, quaternion) {
  const q = quaternion.clone().normalize();
  limb.quaternion = { x: q.x, y: q.y, z: q.z, w: q.w };
  return q;
}

function collectBoneNames(object) {
  const names = [];
  object?.traverse((node) => {
    if (node.isBone && node.name) names.push(node.name);
  });
  return [...new Set(names)];
}

function resolveRootTarget(record, baseAsset) {
  const edit = ensureActionEdit(record);
  if (!baseAsset) return '';

  if (edit.rootTarget === 'object') return baseAsset.object.name || '';

  if (edit.rootTarget && edit.rootTarget !== 'auto') {
    return edit.rootTarget;
  }

  const boneNames = collectBoneNames(baseAsset.object);
  return (
    boneNames.find((name) => /(^|[:_])hips?$/i.test(name)) ||
    boneNames.find((name) => /hips?/i.test(name)) ||
    boneNames.find((name) => /root/i.test(name)) ||
    boneNames[0] ||
    baseAsset.object.name ||
    ''
  );
}

function swapLeftRightName(name) {
  const token = '__ACTION_TO_EDIT_SIDE__';
  return name
    .replace(/left/ig, (m) => token + (m === 'LEFT' ? 'U' : m === 'Left' ? 'T' : 'L'))
    .replace(/right/ig, (m) => {
      if (m === 'RIGHT') return 'LEFT';
      if (m === 'Right') return 'Left';
      return 'left';
    })
    .replace(new RegExp(token + 'U', 'g'), 'RIGHT')
    .replace(new RegExp(token + 'T', 'g'), 'Right')
    .replace(new RegExp(token + 'L', 'g'), 'right');
}

function mirrorAnimationClip(clip) {
  for (const track of clip.tracks) {
    let parsed;
    try {
      parsed = THREE.PropertyBinding.parseTrackName(track.name);
    } catch {
      continue;
    }

    const nodeName = parsed.nodeName || '';
    if (nodeName) {
      const swapped = swapLeftRightName(nodeName);
      if (swapped !== nodeName) {
        track.name = swapped + track.name.slice(nodeName.length);
      }
    }

    if (parsed.propertyName === 'position') {
      for (let i = 0; i < track.values.length; i += 3) track.values[i] *= -1;
    } else if (parsed.propertyName === 'quaternion') {
      // Mirror across the character sagittal plane (X -> -X).
      for (let i = 0; i < track.values.length; i += 4) {
        track.values[i + 1] *= -1;
        track.values[i + 2] *= -1;
      }
    }
  }
}

function getOverdriveSpeed(value) {
  const v = THREE.MathUtils.clamp(Number(value) || 50, 0, 100);
  // 0 = 0.5x · 50 = 1x · 100 = 2x
  return Math.pow(2, (v - 50) / 50);
}

function applyOverdrive(clip, value) {
  const speed = getOverdriveSpeed(value);
  if (!Number.isFinite(speed) || Math.abs(speed - 1) < 1e-6) return;

  // Overdrive is TEMPORAL ONLY: it never changes pose amplitude,
  // positions, rotations or scale values. It only compresses/expands
  // keyframe time, so the exported Action really plays faster/slower.
  for (const track of clip.tracks) {
    for (let i = 0; i < track.times.length; i++) {
      track.times[i] /= speed;
    }
  }

  if (clip.duration > 0) clip.duration /= speed;
}

function applyArmSpace(clip, value) {
  const normalized = (Number(value) - 50) / 50;
  if (!Number.isFinite(normalized) || Math.abs(normalized) < 1e-6) return;

  const angle = THREE.MathUtils.degToRad(18 * normalized);
  const qAdd = new THREE.Quaternion();
  const q = new THREE.Quaternion();

  for (const track of clip.tracks) {
    let parsed;
    try {
      parsed = THREE.PropertyBinding.parseTrackName(track.name);
    } catch {
      continue;
    }

    if (parsed.propertyName !== 'quaternion') continue;
    const nodeName = parsed.nodeName || '';

    const isLeft = /leftarm$/i.test(nodeName) || /leftupperarm/i.test(nodeName);
    const isRight = /rightarm$/i.test(nodeName) || /rightupperarm/i.test(nodeName);
    if (!isLeft && !isRight) continue;

    qAdd.setFromAxisAngle(new THREE.Vector3(0, 0, 1), isLeft ? angle : -angle);

    for (let i = 0; i < track.values.length; i += 4) {
      q.set(track.values[i], track.values[i + 1], track.values[i + 2], track.values[i + 3]).normalize();
      q.multiply(qAdd).normalize();
      track.values[i] = q.x;
      track.values[i + 1] = q.y;
      track.values[i + 2] = q.z;
      track.values[i + 3] = q.w;
    }
  }
}

function findTrackByNodeAndProperty(clip, nodeName, propertyName) {
  return clip.tracks.find((track) => {
    try {
      const parsed = THREE.PropertyBinding.parseTrackName(track.name);
      return parsed.nodeName === nodeName && parsed.propertyName === propertyName;
    } catch {
      return false;
    }
  }) || null;
}

function replaceTrackByNodeAndProperty(clip, track) {
  let parsedNew;
  try {
    parsedNew = THREE.PropertyBinding.parseTrackName(track.name);
  } catch {
    clip.tracks.push(track);
    return;
  }

  clip.tracks = clip.tracks.filter((candidate) => {
    try {
      const parsed = THREE.PropertyBinding.parseTrackName(candidate.name);
      return !(
        parsed.nodeName === parsedNew.nodeName &&
        parsed.propertyName === parsedNew.propertyName
      );
    } catch {
      return true;
    }
  });

  clip.tracks.push(track);
}

function findBoneByName(root, name) {
  let result = null;
  root?.traverse((node) => {
    if (!result && node.isBone && node.name === name) result = node;
  });
  return result;
}

function parentBone(node) {
  let current = node?.parent || null;
  while (current && !current.isBone) current = current.parent;
  return current?.isBone ? current : null;
}

function getTwoBoneChain(root, endBoneName) {
  const end = findBoneByName(root, endBoneName);
  const mid = parentBone(end);
  const upper = parentBone(mid);
  if (!upper || !mid || !end) return null;
  return { upper, mid, end };
}

function setObjectWorldQuaternion(object, worldQuaternion) {
  const parentWorld = new THREE.Quaternion();
  if (object.parent) object.parent.getWorldQuaternion(parentWorld);

  object.quaternion.copy(
    parentWorld.invert().multiply(worldQuaternion).normalize()
  );
}

function captureChainPose(chain) {
  const capture = (bone) => ({
    position: bone.position.clone(),
    quaternion: bone.quaternion.clone(),
    scale: bone.scale.clone(),
  });

  return {
    upper: capture(chain.upper),
    mid: capture(chain.mid),
    end: capture(chain.end),
  };
}

function restoreChainPose(chain, pose) {
  const restore = (bone, saved) => {
    bone.position.copy(saved.position);
    bone.quaternion.copy(saved.quaternion);
    bone.scale.copy(saved.scale);
  };

  restore(chain.upper, pose.upper);
  restore(chain.mid, pose.mid);
  restore(chain.end, pose.end);

  let root = chain.upper;
  while (root.parent) root = root.parent;
  root.updateMatrixWorld(true);
}

function solveTwoBoneIKPose(chain, targetPosition, targetWorldQuaternion, allowStretch) {
  if (!chain) return false;

  let root = chain.upper;
  while (root.parent) root = root.parent;

  root.updateMatrixWorld(true);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  chain.upper.getWorldPosition(a);
  chain.mid.getWorldPosition(b);
  chain.end.getWorldPosition(c);

  const upperWorldOriginal = new THREE.Quaternion();
  const endWorldOriginal = new THREE.Quaternion();
  chain.upper.getWorldQuaternion(upperWorldOriginal);
  chain.end.getWorldQuaternion(endWorldOriginal);

  let l1 = a.distanceTo(b);
  let l2 = b.distanceTo(c);
  if (l1 < 1e-8 || l2 < 1e-8) return false;

  const toTarget = targetPosition.clone().sub(a);
  let targetDistance = toTarget.length();
  if (targetDistance < 1e-8) return false;
  const direction = toTarget.clone().normalize();

  // Optional stretch only when the target lies beyond the natural reach.
  if (allowStretch && targetDistance > l1 + l2) {
    const factor = targetDistance / Math.max(l1 + l2, 1e-8);
    chain.mid.position.multiplyScalar(factor);
    chain.end.position.multiplyScalar(factor);
    root.updateMatrixWorld(true);

    chain.mid.getWorldPosition(b);
    chain.end.getWorldPosition(c);
    l1 = a.distanceTo(b);
    l2 = b.distanceTo(c);
  }

  const minReach = Math.max(Math.abs(l1 - l2) + 1e-6, 1e-6);
  const maxReach = Math.max(l1 + l2 - 1e-6, minReach);
  const solvedDistance = THREE.MathUtils.clamp(targetDistance, minReach, maxReach);
  const solvedEnd = a.clone().addScaledVector(direction, solvedDistance);

  const ab = b.clone().sub(a);
  const bc = c.clone().sub(b);
  let planeNormal = ab.clone().cross(bc);

  if (planeNormal.lengthSq() < 1e-10) {
    const helper = Math.abs(direction.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    planeNormal = direction.clone().cross(helper);
  }

  planeNormal.normalize();
  let bendDirection = planeNormal.clone().cross(direction).normalize();

  // Preserve the animation's current bend side (elbow/knee pole).
  const originalProjection = b.clone()
    .sub(a)
    .sub(direction.clone().multiplyScalar(b.clone().sub(a).dot(direction)));

  if (originalProjection.dot(bendDirection) < 0) {
    bendDirection.negate();
  }

  const x = (l1 * l1 - l2 * l2 + solvedDistance * solvedDistance) /
    (2 * solvedDistance);
  const h = Math.sqrt(Math.max(l1 * l1 - x * x, 0));

  const solvedJoint = a.clone()
    .addScaledVector(direction, x)
    .addScaledVector(bendDirection, h);

  // Upper bone: rotate current A->B toward A->solvedJoint.
  const currentUpperDirection = b.clone().sub(a).normalize();
  const desiredUpperDirection = solvedJoint.clone().sub(a).normalize();
  const upperDelta = new THREE.Quaternion().setFromUnitVectors(
    currentUpperDirection,
    desiredUpperDirection
  );
  const desiredUpperWorld = upperDelta
    .multiply(upperWorldOriginal)
    .normalize();

  setObjectWorldQuaternion(chain.upper, desiredUpperWorld);
  root.updateMatrixWorld(true);

  const bSolved = new THREE.Vector3();
  const cAfterUpper = new THREE.Vector3();
  chain.mid.getWorldPosition(bSolved);
  chain.end.getWorldPosition(cAfterUpper);

  // Lower bone: rotate B->C toward B->solvedEnd.
  const midWorldCurrent = new THREE.Quaternion();
  chain.mid.getWorldQuaternion(midWorldCurrent);

  const currentMidDirection = cAfterUpper.clone().sub(bSolved).normalize();
  const desiredMidDirection = solvedEnd.clone().sub(bSolved).normalize();
  const midDelta = new THREE.Quaternion().setFromUnitVectors(
    currentMidDirection,
    desiredMidDirection
  );
  const desiredMidWorld = midDelta
    .multiply(midWorldCurrent)
    .normalize();

  setObjectWorldQuaternion(chain.mid, desiredMidWorld);
  root.updateMatrixWorld(true);

  // End effector orientation is independent from the positional IK chain.
  const desiredEndWorld = targetWorldQuaternion
    ? targetWorldQuaternion.clone().normalize()
    : endWorldOriginal;

  setObjectWorldQuaternion(chain.end, desiredEndWorld);
  root.updateMatrixWorld(true);

  return true;
}

function collectIKSampleTimes(clip) {
  const map = new Map();
  const add = (value) => {
    if (!Number.isFinite(value)) return;
    const t = THREE.MathUtils.clamp(value, 0, Math.max(clip.duration || 0, 0));
    map.set(t.toFixed(6), t);
  };

  add(0);
  add(clip.duration || 0);

  for (const track of clip.tracks) {
    for (const t of track.times) add(Number(t));
  }

  let times = [...map.values()].sort((a, b) => a - b);

  // Protect the browser from pathological clips with thousands of distinct
  // key times. 30 fps is enough for the existing export pipeline.
  if (times.length > 1200) {
    const duration = Math.max(clip.duration || 0, 1 / 30);
    const count = Math.max(2, Math.ceil(duration * 30) + 1);
    times = Array.from({ length: count }, (_, i) =>
      Math.min(i / 30, duration)
    );
    if (times[times.length - 1] !== duration) times.push(duration);
  }

  return times;
}

function applySingleLimbIKOffset(clip, edit, baseAsset, key) {
  const limb = ensureLimbOffsets(edit)[key];
  const boneName = resolveLimbBoneName(edit, baseAsset, key);
  if (!limb || !boneName) return false;

  const px = Number(limb.position?.x) || 0;
  const py = Number(limb.position?.y) || 0;
  const pz = Number(limb.position?.z) || 0;
  const rotationOffset = getLimbQuaternion(limb);

  const hasPosition = Math.abs(px) + Math.abs(py) + Math.abs(pz) > 1e-9;
  const hasRotation = rotationOffset.angleTo(new THREE.Quaternion()) > 1e-8;
  if (!hasPosition && !hasRotation) return false;

  const sampleRoot = SkeletonUtils.clone(baseAsset.object);
  applyRestPose(sampleRoot, baseAsset.restPose);

  const chain = getTwoBoneChain(sampleRoot, boneName);
  if (!chain) {
    console.warn('No se pudo construir cadena IK de 2 huesos para', boneName);
    return false;
  }

  const sourceClip = clip.clone();
  const sampleTimes = collectIKSampleTimes(sourceClip);
  const mixer = new THREE.AnimationMixer(sampleRoot);
  const action = mixer.clipAction(sourceClip, sampleRoot);
  action.enabled = true;
  action.setLoop(THREE.LoopOnce, 0);
  action.clampWhenFinished = true;
  action.play();

  const upperQ = [];
  const midQ = [];
  const endQ = [];
  const midP = [];
  const endP = [];

  const worldOffset = new THREE.Vector3(px, py, pz);
  const originalEndWorld = new THREE.Quaternion();
  const endPosition = new THREE.Vector3();

  for (const time of sampleTimes) {
    applyRestPose(sampleRoot, baseAsset.restPose);
    mixer.setTime(time);
    sampleRoot.updateMatrixWorld(true);

    chain.end.getWorldPosition(endPosition);
    chain.end.getWorldQuaternion(originalEndWorld);

    const targetPosition = endPosition.clone().add(worldOffset);
    const targetQuaternion = rotationOffset
      .clone()
      .multiply(originalEndWorld)
      .normalize();

    solveTwoBoneIKPose(
      chain,
      targetPosition,
      targetQuaternion,
      Boolean(limb.allowStretch)
    );

    upperQ.push(
      chain.upper.quaternion.x,
      chain.upper.quaternion.y,
      chain.upper.quaternion.z,
      chain.upper.quaternion.w
    );
    midQ.push(
      chain.mid.quaternion.x,
      chain.mid.quaternion.y,
      chain.mid.quaternion.z,
      chain.mid.quaternion.w
    );
    endQ.push(
      chain.end.quaternion.x,
      chain.end.quaternion.y,
      chain.end.quaternion.z,
      chain.end.quaternion.w
    );

    if (limb.allowStretch) {
      midP.push(chain.mid.position.x, chain.mid.position.y, chain.mid.position.z);
      endP.push(chain.end.position.x, chain.end.position.y, chain.end.position.z);
    }
  }

  mixer.stopAllAction();
  mixer.uncacheRoot(sampleRoot);

  replaceTrackByNodeAndProperty(
    clip,
    new THREE.QuaternionKeyframeTrack(
      chain.upper.name + '.quaternion',
      sampleTimes,
      upperQ
    )
  );
  replaceTrackByNodeAndProperty(
    clip,
    new THREE.QuaternionKeyframeTrack(
      chain.mid.name + '.quaternion',
      sampleTimes,
      midQ
    )
  );
  replaceTrackByNodeAndProperty(
    clip,
    new THREE.QuaternionKeyframeTrack(
      chain.end.name + '.quaternion',
      sampleTimes,
      endQ
    )
  );

  if (limb.allowStretch) {
    replaceTrackByNodeAndProperty(
      clip,
      new THREE.VectorKeyframeTrack(
        chain.mid.name + '.position',
        sampleTimes,
        midP
      )
    );
    replaceTrackByNodeAndProperty(
      clip,
      new THREE.VectorKeyframeTrack(
        chain.end.name + '.position',
        sampleTimes,
        endP
      )
    );
  }

  clip.resetDuration();
  return true;
}

function applyLimbOffsets(clip, record, baseAsset) {
  const edit = ensureActionEdit(record);
  for (const key of LIMB_KEYS) {
    applySingleLimbIKOffset(clip, edit, baseAsset, key);
  }
}

function applyActionTransformTracks(clip, record) {
  const edit = ensureActionEdit(record);
  const offset = edit.rootOffset || { x: 0, y: 0, z: 0 };
  const ox = Number(offset.x) || 0;
  const oy = Number(offset.y) || 0;
  const oz = Number(offset.z) || 0;
  const q = getEditQuaternion(edit);
  const duration = Math.max(clip.duration || 0, 1 / 30);

  clip.tracks = clip.tracks.filter((track) => {
    try {
      const parsed = THREE.PropertyBinding.parseTrackName(track.name);
      return parsed.nodeName !== ACTION_TRANSFORM_NAME;
    } catch {
      return true;
    }
  });

  const hasPosition = Math.abs(ox) + Math.abs(oy) + Math.abs(oz) > 1e-9;
  const hasRotation = q.angleTo(new THREE.Quaternion()) > 1e-8;

  clip.tracks.push(new THREE.VectorKeyframeTrack(
    ACTION_TRANSFORM_NAME + '.position',
    [0, duration],
    [ox, oy, oz, ox, oy, oz]
  ));

  clip.tracks.push(new THREE.QuaternionKeyframeTrack(
    ACTION_TRANSFORM_NAME + '.quaternion',
    [0, duration],
    [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w]
  ));

  clip.tracks.push(new THREE.VectorKeyframeTrack(
    ACTION_TRANSFORM_NAME + '.scale',
    [0, duration],
    [1, 1, 1, 1, 1, 1]
  ));

  return hasPosition || hasRotation;
}

function trimClipByPercent(clip, startPct, endPct) {
  const duration = Math.max(clip.duration || 0, 0);
  const start = THREE.MathUtils.clamp(Number(startPct) || 0, 0, 100) / 100 * duration;
  const end = THREE.MathUtils.clamp(Number(endPct) || 100, 0, 100) / 100 * duration;

  if (duration <= 0 || start <= 1e-8 && end >= duration - 1e-8) return;
  if (end <= start + 1e-6) return;

  const nextTracks = [];

  for (const track of clip.tracks) {
    const valueSize = track.getValueSize();
    const interpolant = track.createInterpolant(new track.ValueBufferType(valueSize));
    const times = [];
    const values = [];

    const pushSample = (time, shifted) => {
      const sample = interpolant.evaluate(time);
      times.push(shifted);
      for (let i = 0; i < valueSize; i++) values.push(sample[i]);
    };

    pushSample(start, 0);

    for (let i = 0; i < track.times.length; i++) {
      const t = track.times[i];
      if (t > start + 1e-7 && t < end - 1e-7) {
        times.push(t - start);
        const base = i * valueSize;
        for (let k = 0; k < valueSize; k++) values.push(track.values[base + k]);
      }
    }

    pushSample(end, end - start);

    const next = new track.constructor(
      track.name,
      times,
      values,
      track.getInterpolation()
    );
    nextTracks.push(next);
  }

  clip.tracks = nextTracks;
  clip.duration = end - start;
}

function applyActionEditPipeline(clip, record, baseAsset) {
  const edit = ensureActionEdit(record);

  if (edit.mirror) mirrorAnimationClip(clip);
  applyOverdrive(clip, edit.overdrive);
  applyArmSpace(clip, edit.armSpace);
  applyLimbOffsets(clip, record, baseAsset);
  applyActionTransformTracks(clip, record);
  trimClipByPercent(clip, edit.trimStart, edit.trimEnd);

  clip.resetDuration();
  return clip;
}

function captureRestPose(object) {
  const rest = new Map();
  object.updateMatrixWorld(true);

  object.traverse((node) => {
    if (!node.name) return;

    const worldQuaternion = new THREE.Quaternion();
    node.getWorldQuaternion(worldQuaternion);

    const parentWorldQuaternion = new THREE.Quaternion();
    if (node.parent) node.parent.getWorldQuaternion(parentWorldQuaternion);

    rest.set(node.name, {
      position: node.position.clone(),
      quaternion: node.quaternion.clone(),
      scale: node.scale.clone(),
      worldQuaternion,
      parentWorldQuaternion,
      parentName: node.parent?.name || null,
    });
  });

  return rest;
}

function applyRestPose(object, restPose) {
  if (!restPose) return;

  object.traverse((node) => {
    if (!node.name) return;
    const rest = restPose.get(node.name);
    if (!rest) return;

    node.position.copy(rest.position);
    node.quaternion.copy(rest.quaternion);
    node.scale.copy(rest.scale);
  });

  object.updateMatrixWorld(true);

  object.traverse((node) => {
    if (node.isSkinnedMesh && node.skeleton) {
      node.skeleton.update();
    }
  });
}

function getAssetUnitScale(asset) {
  const n = Number(asset?.unitScaleFactor);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function retargetPositionTrack(track, sourceRest, baseRest, unitRatio) {
  if (!sourceRest || !baseRest) return;

  const values = track.values;
  const sourceParentWorld = sourceRest.parentWorldQuaternion || new THREE.Quaternion();
  const baseParentWorldInv = (baseRest.parentWorldQuaternion || new THREE.Quaternion()).clone().invert();

  const v = new THREE.Vector3();
  for (let i = 0; i < values.length; i += 3) {
    v.set(
      values[i] - sourceRest.position.x,
      values[i + 1] - sourceRest.position.y,
      values[i + 2] - sourceRest.position.z
    );

    // Convert the local translation delta through each rig's rest-space parent axes.
    v.applyQuaternion(sourceParentWorld)
      .multiplyScalar(unitRatio)
      .applyQuaternion(baseParentWorldInv);

    values[i] = baseRest.position.x + v.x;
    values[i + 1] = baseRest.position.y + v.y;
    values[i + 2] = baseRest.position.z + v.z;
  }
}

function findPrimarySkinnedMesh(object) {
  let primary = null;
  object.traverse((node) => {
    if (!primary && node.isSkinnedMesh && node.skeleton?.bones?.length) {
      primary = node;
    }
  });
  return primary;
}

function findHipBoneName(skinnedMesh) {
  const bones = skinnedMesh?.skeleton?.bones || [];
  const exact = bones.find((bone) => /(^|[:_])hips?$/i.test(bone.name));
  if (exact) return exact.name;

  const loose = bones.find((bone) => /hips?/i.test(bone.name));
  return loose?.name || bones[0]?.name || 'hip';
}

function extractRetargetedQuaternionTracks(record, baseAsset) {
  const sourceAsset = state.assets.find((asset) => asset.id === record.sourceId) || null;
  if (!sourceAsset || !baseAsset) return null;

  // Do the matrix-based retarget on isolated clones. This avoids touching
  // either the source FBX or the live preview/model base.
  const sourceRoot = SkeletonUtils.clone(sourceAsset.object);
  const targetRoot = SkeletonUtils.clone(baseAsset.object);

  applyRestPose(sourceRoot, sourceAsset.restPose);
  applyRestPose(targetRoot, baseAsset.restPose);

  const sourceSkin = findPrimarySkinnedMesh(sourceRoot);
  const targetSkin = findPrimarySkinnedMesh(targetRoot);
  if (!sourceSkin || !targetSkin) return null;

  sourceRoot.updateMatrixWorld(true);
  targetRoot.updateMatrixWorld(true);

  const hipName = findHipBoneName(targetSkin);

  let retargeted;
  try {
    retargeted = SkeletonUtils.retargetClip(
      targetSkin,
      sourceSkin,
      record.clip.clone(),
      {
        getBoneName: (bone) => bone.name,
        hip: hipName,
        preserveBonePositions: true,
        preserveBoneMatrix: true,
        useTargetMatrix: false,
        hipInfluence: new THREE.Vector3(1, 1, 1),
        // Position/root scale is already handled by our translation retarget.
        // This clip is used only as the authoritative rotation source.
        scale: 1,
      }
    );
  } catch (error) {
    console.warn('Retarget jerárquico de rotación falló; usando fallback local.', record.sourceFile, error);
    return null;
  }

  const byBone = new Map();

  for (const track of retargeted.tracks) {
    if (!(track instanceof THREE.QuaternionKeyframeTrack)) continue;

    let boneName = '';
    const bonesMatch = track.name.match(/\.bones\[([^\]]+)\]\.quaternion$/);
    if (bonesMatch) {
      boneName = bonesMatch[1];
    } else {
      try {
        boneName = THREE.PropertyBinding.parseTrackName(track.name).nodeName || '';
      } catch {
        boneName = '';
      }
    }

    if (!boneName) continue;

    byBone.set(boneName, new THREE.QuaternionKeyframeTrack(
      boneName + '.quaternion',
      track.times.slice(),
      track.values.slice()
    ));
  }

  return byBone.size ? byBone : null;
}

function replaceQuaternionTracksWithHierarchicalRetarget(record, baseAsset, clip) {
  const rotationTracks = extractRetargetedQuaternionTracks(record, baseAsset);
  if (!rotationTracks) return false;

  clip.tracks = clip.tracks.map((track) => {
    let parsed;
    try {
      parsed = THREE.PropertyBinding.parseTrackName(track.name);
    } catch {
      return track;
    }

    if (parsed.propertyName !== 'quaternion') return track;

    const replacement = rotationTracks.get(parsed.nodeName);
    return replacement ? replacement.clone() : track;
  });

  return true;
}

function retargetQuaternionTrack(track, sourceRest, baseRest) {
  if (!sourceRest || !baseRest) return;

  const values = track.values;
  const sourceRestInv = sourceRest.quaternion.clone().invert();
  const qAnim = new THREE.Quaternion();
  const qDelta = new THREE.Quaternion();
  const qOut = new THREE.Quaternion();

  for (let i = 0; i < values.length; i += 4) {
    qAnim.set(values[i], values[i + 1], values[i + 2], values[i + 3]).normalize();
    qDelta.copy(sourceRestInv).multiply(qAnim).normalize();
    qOut.copy(baseRest.quaternion).multiply(qDelta).normalize();

    values[i] = qOut.x;
    values[i + 1] = qOut.y;
    values[i + 2] = qOut.z;
    values[i + 3] = qOut.w;
  }
}

function retargetScaleTrack(track, sourceRest, baseRest) {
  if (!sourceRest || !baseRest) return;

  const values = track.values;
  for (let i = 0; i < values.length; i += 3) {
    const sx = Math.abs(sourceRest.scale.x) > 1e-8 ? sourceRest.scale.x : 1;
    const sy = Math.abs(sourceRest.scale.y) > 1e-8 ? sourceRest.scale.y : 1;
    const sz = Math.abs(sourceRest.scale.z) > 1e-8 ? sourceRest.scale.z : 1;

    values[i] = baseRest.scale.x * (values[i] / sx);
    values[i + 1] = baseRest.scale.y * (values[i + 1] / sy);
    values[i + 2] = baseRest.scale.z * (values[i + 2] / sz);
  }
}

function countBones(object) {
  let n = 0;
  object.traverse((node) => { if (node.isBone) n += 1; });
  return n;
}

function countSkinnedMeshes(object) {
  let n = 0;
  object.traverse((node) => { if (node.isSkinnedMesh) n += 1; });
  return n;
}

function collectNodeNames(object) {
  const names = new Set();
  object.traverse((node) => {
    if (node.name) names.add(node.name);
  });
  if (object.name) names.add(object.name);
  return names;
}

function getTrackNodeName(trackName) {
  try {
    return THREE.PropertyBinding.parseTrackName(trackName).nodeName || '';
  } catch {
    const dot = trackName.indexOf('.');
    return dot >= 0 ? trackName.slice(0, dot) : trackName;
  }
}

function compatibility(record, baseAsset) {
  if (!baseAsset) return { ratio: 0, matched: 0, total: 0, label: 'Sin base', className: 'warn' };
  const names = baseAsset.nodeNames;
  const sourceRoot = record.sourceRootName;
  let matched = 0;
  let total = 0;

  for (const track of record.clip.tracks) {
    const target = getTrackNodeName(track.name);
    if (!target) continue;
    total += 1;
    if (names.has(target) || (sourceRoot && target === sourceRoot && baseAsset.object.name)) matched += 1;
  }

  if (!total) return { ratio: 1, matched: 0, total: 0, label: 'Sin tracks', className: 'warn' };
  const ratio = matched / total;
  const pct = Math.round(ratio * 100);
  return {
    ratio,
    matched,
    total,
    label: pct + '% compatible',
    className: ratio >= 0.98 ? 'good' : ratio >= 0.7 ? 'warn' : 'bad',
  };
}

function isFullyCompatible(record, baseAsset = getBaseAsset()) {
  if (!baseAsset || isEmptyClip(record)) return false;
  const result = compatibility(record, baseAsset);
  return result.total > 0 && result.matched === result.total;
}

function getFullyCompatibleClips(baseAsset = getBaseAsset()) {
  if (!baseAsset) return [];
  return state.clips.filter((record) => isFullyCompatible(record, baseAsset));
}

function sourceFileToActionName(sourceFile) {
  return stripExt(sourceFile)
    .trim()
    .replace(/\s+/g, '_');
}

function makeClipForBase(record, baseAsset, usedNames = null) {
  const clip = record.clip.clone();
  let exportName = (record.name || record.clip?.name || record.originalName || 'Action').trim() || 'Action';

  if (usedNames) {
    const rootName = exportName;
    let i = 2;
    while (usedNames.has(exportName.toLowerCase())) exportName = rootName + '_' + i++;
    usedNames.add(exportName.toLowerCase());
  }

  clip.name = exportName;

  const sourceAsset = state.assets.find((asset) => asset.id === record.sourceId) || null;
  const sourceRestPose = sourceAsset?.restPose;
  const baseRestPose = baseAsset?.restPose;
  const unitRatio = getAssetUnitScale(sourceAsset) / getAssetUnitScale(baseAsset);

  for (const track of clip.tracks) {
    let parsed;
    try {
      parsed = THREE.PropertyBinding.parseTrackName(track.name);
    } catch {
      continue;
    }

    const sourceNodeName = parsed.nodeName || '';
    let targetNodeName = sourceNodeName;

    if (
      record.sourceRootName &&
      baseAsset.object.name &&
      sourceNodeName === record.sourceRootName &&
      record.sourceRootName !== baseAsset.object.name
    ) {
      targetNodeName = baseAsset.object.name;
      const suffix = track.name.slice(record.sourceRootName.length);
      track.name = baseAsset.object.name + suffix;
    }

    const sourceRest = sourceRestPose?.get(sourceNodeName);
    const baseRest = baseRestPose?.get(targetNodeName);

    if (parsed.propertyName === 'position') {
      retargetPositionTrack(track, sourceRest, baseRest, unitRatio);
    } else if (parsed.propertyName === 'quaternion') {
      // Keep the animation's original local rotation delta relative to its
      // source rest pose, then apply that delta to the base rig rest pose.
      // This is the version that preserved the Mixamo motion correctly.
      retargetQuaternionTrack(track, sourceRest, baseRest);
    } else if (parsed.propertyName === 'scale') {
      retargetScaleTrack(track, sourceRest, baseRest);
    }
  }

  clip.resetDuration();
  applyActionEditPipeline(clip, record, baseAsset);
  return clip;
}

function normalizePreview(object) {
  previewStage.position.set(0, 0, 0);
  previewStage.rotation.set(0, 0, 0);
  previewStage.scale.setScalar(1);

  const savedActionPosition = state.actionTransformNode.position.clone();
  const savedActionQuaternion = state.actionTransformNode.quaternion.clone();
  const savedActionScale = state.actionTransformNode.scale.clone();

  // Normalization is based on the original model, never on an Action offset.
  state.actionTransformNode.position.set(0, 0, 0);
  state.actionTransformNode.quaternion.identity();
  state.actionTransformNode.scale.set(1, 1, 1);

  previewStage.updateMatrixWorld(true);
  object.updateMatrixWorld(true);

  let box = new THREE.Box3().setFromObject(object, true);
  const finite =
    Number.isFinite(box.min.x) && Number.isFinite(box.min.y) && Number.isFinite(box.min.z) &&
    Number.isFinite(box.max.x) && Number.isFinite(box.max.y) && Number.isFinite(box.max.z);

  if (box.isEmpty() || !finite) {
    setStatus('El FBX cargó, pero no se pudo calcular su volumen visual. Intentando vista de respaldo.', 'warn');
    previewStage.position.set(0, 0, 0);
    previewStage.scale.setScalar(1);
    state.actionTransformNode.position.copy(savedActionPosition);
    state.actionTransformNode.quaternion.copy(savedActionQuaternion);
    state.actionTransformNode.scale.copy(savedActionScale);
    state.actionTransformNode.updateMatrixWorld(true);
    return false;
  }

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  if (!Number.isFinite(maxDim) || maxDim <= 1e-8) {
    setStatus('El FBX no tiene un volumen visible utilizable para auto-encuadre.', 'warn');
    state.actionTransformNode.position.copy(savedActionPosition);
    state.actionTransformNode.quaternion.copy(savedActionQuaternion);
    state.actionTransformNode.scale.copy(savedActionScale);
    state.actionTransformNode.updateMatrixWorld(true);
    return false;
  }

  // Normalización solo para la vista previa. NO modifica los transforms del FBX exportado.
  const desiredSize = 3.0;
  const scale = THREE.MathUtils.clamp(desiredSize / maxDim, 1e-6, 1e6);
  previewStage.scale.setScalar(scale);
  previewStage.position.set(
    -center.x * scale,
    -box.min.y * scale,
    -center.z * scale
  );
  previewStage.updateMatrixWorld(true);

  state.actionTransformNode.position.copy(savedActionPosition);
  state.actionTransformNode.quaternion.copy(savedActionQuaternion);
  state.actionTransformNode.scale.copy(savedActionScale);
  state.actionTransformNode.updateMatrixWorld(true);
  object.updateMatrixWorld(true);

  return true;
}

function findRootTargetObject(record = getActiveRecord(), base = getBaseAsset()) {
  if (!record || !base) return null;
  return state.actionTransformNode;
}

function roundOffsetValue(value, step) {
  const snap = Math.max(Number(step) || 0.5, 0.000001);
  const rounded = Math.round(value / snap) * snap;
  return Math.abs(rounded) < 1e-9 ? 0 : Number(rounded.toFixed(4));
}

function cleanLiveNumber(value, decimals = 3) {
  const n = Number(value) || 0;
  if (Math.abs(n) < 1e-8) return 0;
  return Number(n.toFixed(decimals));
}

function quaternionToDisplayEuler(edit) {
  const euler = new THREE.Euler().setFromQuaternion(getEditQuaternion(edit), 'XYZ');
  return {
    x: THREE.MathUtils.radToDeg(euler.x),
    y: THREE.MathUtils.radToDeg(euler.y),
    z: THREE.MathUtils.radToDeg(euler.z),
  };
}

function updateRootOffsetFields(edit, { live = false } = {}) {
  if (!edit) return;

  const posDecimals = live ? 3 : 4;
  const rotDecimals = live ? 2 : 4;

  els.rootOffsetX.value = String(cleanLiveNumber(edit.rootOffset?.x, posDecimals));
  els.rootOffsetY.value = String(cleanLiveNumber(edit.rootOffset?.y, posDecimals));
  els.rootOffsetZ.value = String(cleanLiveNumber(edit.rootOffset?.z, posDecimals));

  const euler = quaternionToDisplayEuler(edit);
  els.rootRotationX.value = String(cleanLiveNumber(euler.x, rotDecimals));
  els.rootRotationY.value = String(cleanLiveNumber(euler.y, rotDecimals));
  els.rootRotationZ.value = String(cleanLiveNumber(euler.z, rotDecimals));
}

function configureRootCombinedGizmoUi() {
  els.toggleRootGizmoBtn.classList.toggle('active', state.rootGizmoEnabled);
  els.toggleRootGizmoBtn.textContent =
    state.rootGizmoEnabled ? 'Transformación activa' : 'Transformar en viewport';

  els.rootMoveSnapSelect.value = String(state.rootMoveSnap);
  els.rootRotateSnapSelect.value = String(state.rootRotateSnap);

  els.rootGizmoHelp.textContent =
    'Flechas = mover · aros = rotar en ejes globales. El arrastre es continuo; la precisión se aplica al soltar.';

  rootTransformControls.setMode('translate');
  rootTransformControls.setSpace('world');
  rootRotateControls.setMode('rotate');
  rootRotateControls.setSpace('world');

  // Continuous while dragging; exact values are rounded only on mouse release.
  rootTransformControls.setTranslationSnap(null);
  rootRotateControls.setRotationSnap(null);
}

function hideRootGizmo() {
  rootTransformControls.detach();
  rootRotateControls.detach();

  rootTransformControls.enabled = false;
  rootRotateControls.enabled = false;

  rootTransformControls.getHelper().visible = false;
  rootRotateControls.getHelper().visible = false;

  els.toggleRootGizmoBtn?.classList.remove('active');
}

function updateRootGizmoAttachment() {
  const record = getActiveRecord();
  const base = getBaseAsset();
  const target = findRootTargetObject(record, base);
  const valid = Boolean(
    state.rootGizmoEnabled &&
    record &&
    base &&
    target &&
    !isEmptyClip(record)
  );

  els.toggleRootGizmoBtn?.classList.toggle('active', valid);

  if (!valid) {
    hideRootGizmo();
    return;
  }

  target.updateWorldMatrix(true, false);
  target.getWorldPosition(rootGizmoProxy.position);
  target.getWorldQuaternion(rootGizmoProxy.quaternion);
  rootGizmoProxy.scale.set(1, 1, 1);
  rootGizmoProxy.updateMatrixWorld(true);

  configureRootCombinedGizmoUi();

  if (rootTransformControls.object !== rootGizmoProxy) {
    rootTransformControls.attach(rootGizmoProxy);
  }
  if (rootRotateControls.object !== rootGizmoProxy) {
    rootRotateControls.attach(rootGizmoProxy);
  }

  rootTransformControls.enabled = true;
  rootRotateControls.enabled = true;
  rootTransformControls.getHelper().visible = true;
  rootRotateControls.getHelper().visible = true;
}

function updateRootGizmoPosition() {
  if (!state.rootGizmoEnabled || state.rootGizmoDragging) return;

  const target = findRootTargetObject();
  if (!target) {
    hideRootGizmo();
    return;
  }

  target.updateWorldMatrix(true, false);
  target.getWorldPosition(rootGizmoProxy.position);
  target.getWorldQuaternion(rootGizmoProxy.quaternion);
  rootGizmoProxy.updateMatrixWorld(true);
}

function limbDisplayName(key) {
  return {
    leftHand: 'Mano L',
    rightHand: 'Mano R',
    leftFoot: 'Pie L',
    rightFoot: 'Pie R',
  }[key] || key;
}

function limbQuaternionToEuler(limb) {
  const e = new THREE.Euler().setFromQuaternion(getLimbQuaternion(limb), 'XYZ');
  return {
    x: THREE.MathUtils.radToDeg(e.x),
    y: THREE.MathUtils.radToDeg(e.y),
    z: THREE.MathUtils.radToDeg(e.z),
  };
}

function renderLimbEditor(edit, base) {
  const key = state.activeLimbKey || 'leftHand';
  const limb = ensureLimbOffsets(edit)[key];
  const resolved = resolveLimbBoneName(edit, base, key);
  const boneNames = collectBoneNames(base?.object);

  els.limbSlotSelect.value = key;
  els.limbBoneSelect.innerHTML =
    '<option value="auto">Auto-detectar</option>' +
    boneNames
      .slice()
      .sort((a, b) => actionNameCollator.compare(a, b))
      .map((name) => '<option value="' +
        name.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') +
        '">' + name.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</option>')
      .join('');

  els.limbBoneSelect.value =
    limb.bone === 'auto' || boneNames.includes(limb.bone)
      ? limb.bone
      : 'auto';

  els.limbDetectedLabel.textContent = resolved
    ? (limb.bone === 'auto' ? 'Auto → ' + resolved : 'Manual → ' + resolved)
    : 'No detectado · selecciona manualmente';

  els.limbAllowStretch.checked = Boolean(limb.allowStretch);

  els.limbOffsetX.value = String(cleanLiveNumber(limb.position.x, 4));
  els.limbOffsetY.value = String(cleanLiveNumber(limb.position.y, 4));
  els.limbOffsetZ.value = String(cleanLiveNumber(limb.position.z, 4));

  const e = limbQuaternionToEuler(limb);
  els.limbRotationX.value = String(cleanLiveNumber(e.x, 2));
  els.limbRotationY.value = String(cleanLiveNumber(e.y, 2));
  els.limbRotationZ.value = String(cleanLiveNumber(e.z, 2));

  els.toggleLimbGizmoBtn.classList.toggle('active', state.limbGizmoEnabled);
  els.toggleLimbGizmoBtn.textContent = state.limbGizmoEnabled
    ? 'Gizmo IK activo'
    : 'Editar extremidad en viewport';

  requestAnimationFrame(updateLimbGizmoAttachment);
}

function getActiveLimbData() {
  const record = getActiveRecord();
  const base = getBaseAsset();
  if (!record || !base) return null;

  const edit = ensureActionEdit(record);
  const key = state.activeLimbKey || 'leftHand';
  const limb = ensureLimbOffsets(edit)[key];
  const boneName = resolveLimbBoneName(edit, base, key);
  const bone = boneName ? findBoneByName(base.object, boneName) : null;

  return { record, base, edit, key, limb, boneName, bone };
}

function hideLimbGizmo() {
  limbTransformControls.detach();
  limbRotateControls.detach();
  limbTransformControls.enabled = false;
  limbRotateControls.enabled = false;
  limbTransformControls.getHelper().visible = false;
  limbRotateControls.getHelper().visible = false;
  els.toggleLimbGizmoBtn?.classList.remove('active');
}

function updateLimbGizmoAttachment() {
  const data = getActiveLimbData();
  const valid = Boolean(
    state.limbGizmoEnabled &&
    data?.bone &&
    !isEmptyClip(data.record)
  );

  els.toggleLimbGizmoBtn?.classList.toggle('active', valid);

  if (!valid) {
    hideLimbGizmo();
    return;
  }

  data.bone.updateWorldMatrix(true, false);
  data.bone.getWorldPosition(limbGizmoProxy.position);
  data.bone.getWorldQuaternion(limbGizmoProxy.quaternion);
  limbGizmoProxy.scale.set(1, 1, 1);
  limbGizmoProxy.updateMatrixWorld(true);

  limbTransformControls.setMode('translate');
  limbTransformControls.setSpace('world');
  limbTransformControls.setTranslationSnap(null);

  limbRotateControls.setMode('rotate');
  limbRotateControls.setSpace('world');
  limbRotateControls.setRotationSnap(null);

  if (limbTransformControls.object !== limbGizmoProxy) {
    limbTransformControls.attach(limbGizmoProxy);
  }
  if (limbRotateControls.object !== limbGizmoProxy) {
    limbRotateControls.attach(limbGizmoProxy);
  }

  limbTransformControls.enabled = true;
  limbRotateControls.enabled = true;
  limbTransformControls.getHelper().visible = true;
  limbRotateControls.getHelper().visible = true;
}

function updateLimbGizmoPosition() {
  if (!state.limbGizmoEnabled || state.limbGizmoDragging) return;

  const data = getActiveLimbData();
  if (!data?.bone) {
    hideLimbGizmo();
    return;
  }

  data.bone.updateWorldMatrix(true, false);
  data.bone.getWorldPosition(limbGizmoProxy.position);
  data.bone.getWorldQuaternion(limbGizmoProxy.quaternion);
  limbGizmoProxy.updateMatrixWorld(true);
}

function sceneDeltaToRigGlobal(deltaWorld) {
  const q = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  state.actionTransformNode.getWorldQuaternion(q);
  state.actionTransformNode.getWorldScale(scale);

  const v = deltaWorld.clone().applyQuaternion(q.clone().invert());
  v.x /= Math.abs(scale.x) > 1e-8 ? scale.x : 1;
  v.y /= Math.abs(scale.y) > 1e-8 ? scale.y : 1;
  v.z /= Math.abs(scale.z) > 1e-8 ? scale.z : 1;
  return v;
}

function sceneQuaternionDeltaToRigGlobal(deltaWorld) {
  const q = new THREE.Quaternion();
  state.actionTransformNode.getWorldQuaternion(q);

  return q.clone()
    .invert()
    .multiply(deltaWorld)
    .multiply(q)
    .normalize();
}

function updateLimbFieldsOnly(limb) {
  els.limbOffsetX.value = String(cleanLiveNumber(limb.position.x, 3));
  els.limbOffsetY.value = String(cleanLiveNumber(limb.position.y, 3));
  els.limbOffsetZ.value = String(cleanLiveNumber(limb.position.z, 3));

  const e = limbQuaternionToEuler(limb);
  els.limbRotationX.value = String(cleanLiveNumber(e.x, 2));
  els.limbRotationY.value = String(cleanLiveNumber(e.y, 2));
  els.limbRotationZ.value = String(cleanLiveNumber(e.z, 2));
}

function updateTrimVisuals(edit, record) {
  const start = Number(edit.trimStart) || 0;
  const end = Number(edit.trimEnd) || 100;
  els.trimStartValue.textContent = String(Math.round(start));
  els.trimEndValue.textContent = String(Math.round(end));
  els.trimRangeFill.style.left = start + '%';
  els.trimRangeFill.style.right = (100 - end) + '%';

  const totalFrames = Math.max(0, Math.round((record?.clip?.duration || 0) * 30));
  const keptFrames = Math.max(0, Math.round(totalFrames * Math.max(end - start, 0) / 100));
  els.trimFramesLabel.textContent = keptFrames + ' / ' + totalFrames + ' Frames';
}

function renderMotionPanel() {
  const record = getActiveRecord();
  const base = getBaseAsset();
  const enabled = Boolean(record && base && !isEmptyClip(record));

  els.motionPanel.classList.toggle('collapsed', !state.motionPanelOpen);
  els.motionPanelBody.classList.toggle('is-disabled', !enabled);
  els.resetMotionPanelBtn.disabled = !enabled;

  if (!enabled) {
    els.motionPanelActionName.textContent = record ? record.name : 'Selecciona una Action';
    requestAnimationFrame(updateRootGizmoAttachment);
    requestAnimationFrame(updateLimbGizmoAttachment);
    return;
  }

  const edit = ensureActionEdit(record);
  els.motionPanelActionName.textContent = record.name;

  els.overdriveRange.value = String(edit.overdrive);
  els.overdriveValue.textContent =
    String(edit.overdrive) + ' · ' + getOverdriveSpeed(edit.overdrive).toFixed(2) + '×';
  els.armSpaceRange.value = String(edit.armSpace);
  els.armSpaceValue.textContent = String(edit.armSpace);

  els.trimStartRange.value = String(edit.trimStart);
  els.trimEndRange.value = String(edit.trimEnd);
  updateTrimVisuals(edit, record);

  els.mirrorActionCheckbox.checked = Boolean(edit.mirror);

  els.rootResolvedName.textContent =
    'Todo el rig · ' + ACTION_TRANSFORM_NAME;

  updateRootOffsetFields(edit);
  configureRootCombinedGizmoUi();
  renderLimbEditor(edit, base);
}

function selectActionForEditing(recordId, { openPanel = true } = {}) {
  const record = state.clips.find((item) => item.id === recordId);
  if (!record) return;

  state.activeClipId = record.id;
  if (openPanel) state.motionPanelOpen = true;
  renderMotionPanel();
  renderActions();
}

function refreshActivePreview() {
  const record = getActiveRecord();
  if (!record || !state.mixer || isEmptyClip(record)) {
    renderMotionPanel();
    return;
  }

  const oldTime = state.currentAction?.time || 0;
  const wasPaused = Boolean(state.currentAction?.paused);
  playClip(record.id, { preserveTime: oldTime, preservePaused: wasPaused, silent: true });
}

function renderAssets() {
  els.assetCount.textContent = String(state.assets.length);
  els.assetList.innerHTML = '';
  els.assetList.classList.toggle('empty-list', state.assets.length === 0);

  if (!state.assets.length) {
    els.assetList.innerHTML = '<p>Importa FBX para elegir cuál conservará la malla y el esqueleto.</p>';
    return;
  }

  for (const asset of state.assets) {
    const node = els.assetTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.assetId = asset.id;
    node.classList.toggle('active', asset.id === state.baseAssetId);

    const radio = node.querySelector('.base-radio');
    radio.value = asset.id;
    radio.checked = asset.id === state.baseAssetId;
    radio.addEventListener('change', () => setBaseAsset(asset.id));

    node.querySelector('.asset-name').textContent = asset.file.name;
    node.querySelector('.asset-meta').textContent =
      asset.clips.length + ' action' + (asset.clips.length === 1 ? '' : 's') +
      ' · ' + asset.boneCount + ' huesos · ' + asset.skinnedMeshCount + ' skin';

    node.querySelector('.asset-remove').addEventListener('click', () => removeAsset(asset.id));
    els.assetList.appendChild(node);
  }
}

function renderActions() {
  const query = els.actionSearch.value.trim().toLowerCase();
  const base = getBaseAsset();
  const filtered = state.clips.filter((record) => {
    if (!query) return true;
    return record.name.toLowerCase().includes(query) || record.sourceFile.toLowerCase().includes(query);
  });

  // Dos grupos físicos: actions con tracks primero y "Sin tracks" al final.
  // Ambos grupos se ordenan siempre alfabéticamente por el nombre ACTUAL.
  const usefulActions = sortActionRecords(
    filtered.filter((record) => !isEmptyClip(record))
  );
  const emptyActions = sortActionRecords(
    filtered.filter((record) => isEmptyClip(record))
  );
  const visible = [...usefulActions, ...emptyActions];

  const compatibleCount = getFullyCompatibleClips(base).length;
  els.actionCount.textContent = String(compatibleCount);
  els.actionCount.title = compatibleCount + ' action' + (compatibleCount === 1 ? '' : 's') + ' 100% compatible' + (compatibleCount === 1 ? '' : 's');
  els.actionList.innerHTML = '';
  els.actionList.classList.toggle('empty-list', visible.length === 0);

  if (!visible.length) {
    els.actionList.innerHTML = state.clips.length
      ? '<p>No hay actions que coincidan con la búsqueda.</p>'
      : '<p>Las animaciones encontradas aparecerán aquí. Puedes cambiarles el nombre y reproducirlas sobre el modelo base.</p>';
    updateExportState();
    return;
  }

  let emptyDividerInserted = false;

  for (const record of visible) {
    const empty = isEmptyClip(record);

    if (empty && !emptyDividerInserted) {
      const divider = document.createElement('div');
      divider.className = 'action-group-divider';
      divider.innerHTML =
        '<span>Sin tracks</span><span>' + emptyActions.length + '</span>';
      els.actionList.appendChild(divider);
      emptyDividerInserted = true;
    }

    const node = els.actionTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.clipId = record.id;
    node.classList.toggle('active', record.id === state.activeClipId);
    node.classList.toggle('empty-action', empty);

    const playButton = node.querySelector('.action-play');
    playButton.disabled = empty;
    playButton.title = empty ? 'Esta action no contiene tracks' : 'Reproducir';
    playButton.addEventListener('click', (event) => {
      event.stopPropagation();
      playClip(record.id);
    });

    node.addEventListener('click', (event) => {
      if (event.target.closest('button, input, label')) return;
      selectActionForEditing(record.id);
    });

    const nameInput = node.querySelector('.action-name');
    const renameButton = node.querySelector('.action-rename');
    nameInput.value = record.name;
    nameInput.readOnly = true;

    let originalEditValue = record.name;

    const saveRename = () => {
      record.name = nameInput.value.trim() || record.originalName || 'Action';
      record.clip.name = record.name;
      nameInput.value = record.name;
      nameInput.readOnly = true;
      node.classList.remove('editing');
      renameButton.textContent = 'Renombrar';
      if (record.id === state.activeClipId) {
        els.activeActionBadge.textContent = record.name;
      }

      // Rebuild immediately: alphabetical order follows the NEW name.
      renderActions();
      renderMotionPanel();

      setStatus(
        'Action renombrada a "' + record.name + '" · lista reordenada alfabéticamente.',
        'ok'
      );
    };

    const cancelRename = () => {
      nameInput.value = originalEditValue;
      nameInput.readOnly = true;
      node.classList.remove('editing');
      renameButton.textContent = 'Renombrar';
    };

    renameButton.addEventListener('click', () => {
      if (!nameInput.readOnly) {
        saveRename();
        return;
      }

      originalEditValue = record.name;
      nameInput.readOnly = false;
      node.classList.add('editing');
      renameButton.textContent = 'Guardar';
      nameInput.focus();
      nameInput.select();
    });

    nameInput.addEventListener('input', (event) => {
      if (record.id === state.activeClipId) {
        els.activeActionBadge.textContent = event.target.value || 'Action';
      }
    });

    nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveRename();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelRename();
      }
    });

    nameInput.addEventListener('dblclick', () => {
      if (nameInput.readOnly) renameButton.click();
    });

    node.querySelector('.action-origin').textContent = record.sourceFile;
    const include = node.querySelector('.action-include');
    include.checked = record.include;
    include.addEventListener('change', () => {
      record.include = include.checked;
      updateExportState();
    });

    node.querySelector('.duration-chip').textContent = formatDuration(record.clip.duration);
    node.querySelector('.tracks-chip').textContent = record.clip.tracks.length + ' tracks';

    const compat = compatibility(record, base);
    const compatEl = node.querySelector('.compat-chip');
    compatEl.textContent = compat.label;
    compatEl.classList.add(compat.className);

    els.actionList.appendChild(node);
  }
  updateExportState();
}

function updateExportState() {
  const base = getBaseAsset();
  const included = getIncludedClips();
  const canExport = Boolean(base && included.length && !state.exporting);
  els.exportModelName.textContent = base ? base.file.name : '—';
  els.exportActionCount.textContent = String(included.length);
  els.exportFbxBtn.disabled = !canExport;
  els.exportGlbBtn.disabled = !canExport;
}

function resetPlaybackUi() {
  state.activeClipId = null;
  state.currentAction = null;
  state.previewClip = null;
  els.activeActionBadge.textContent = 'Sin acción';
  els.playPauseBtn.textContent = '▶';
  els.playPauseBtn.disabled = true;
  els.timeline.disabled = true;
  els.timeline.value = '0';
  els.timeline.max = '1';
  els.currentTime.textContent = '0.00 s';
  els.durationTime.textContent = '0.00 s';
  renderMotionPanel();
}

function disposeMixer() {
  if (state.mixer) {
    state.mixer.stopAllAction();
    if (state.actionTransformNode) state.mixer.uncacheRoot(state.actionTransformNode);
  }
  state.mixer = null;
  state.currentAction = null;
  state.previewClip = null;
}

function setBaseAsset(assetId) {
  const next = state.assets.find((asset) => asset.id === assetId);
  if (!next) return;

  const oldBase = getBaseAsset();
  if (oldBase && oldBase.object.parent === state.actionTransformNode) {
    state.actionTransformNode.remove(oldBase.object);
  }
  if (state.skeletonHelper) {
    scene.remove(state.skeletonHelper);
    state.skeletonHelper.dispose?.();
    state.skeletonHelper = null;
  }

  disposeMixer();
  state.baseAssetId = next.id;

  // Reset the non-destructive Action Transform before mounting another rig.
  state.actionTransformNode.position.set(0, 0, 0);
  state.actionTransformNode.quaternion.identity();
  state.actionTransformNode.scale.set(1, 1, 1);
  state.actionTransformNode.add(next.object);
  state.actionTransformNode.updateMatrixWorld(true);

  normalizePreview(next.object);
  state.mixer = new THREE.AnimationMixer(state.actionTransformNode);

  state.skeletonHelper = new THREE.SkeletonHelper(next.object);
  state.skeletonHelper.visible = state.skeletonVisible;
  scene.add(state.skeletonHelper);

  els.viewportEmpty.classList.add('hidden');
  els.baseBadge.textContent = next.file.name;
  els.toggleSkeletonBtn.disabled = false;
  els.fitCameraBtn.disabled = false;
  resetPlaybackUi();
  fitCameraToObject(next.object);
  renderAssets();
  renderActions();
  renderMotionPanel();

  const actionTotal = state.clips.length;
  setStatus('Modelo base: ' + next.file.name + '. Hay ' + actionTotal + ' action' + (actionTotal === 1 ? '' : 's') + ' disponibles.', 'ok');
}

function removeAsset(assetId) {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) return;

  if (state.baseAssetId === assetId) {
    if (asset.object.parent === state.actionTransformNode) {
      state.actionTransformNode.remove(asset.object);
    }
    disposeMixer();
    state.baseAssetId = null;
    if (state.skeletonHelper) {
      scene.remove(state.skeletonHelper);
      state.skeletonHelper.dispose?.();
      state.skeletonHelper = null;
    }
    resetPlaybackUi();
  }

  state.assets = state.assets.filter((item) => item.id !== assetId);
  state.clips = state.clips.filter((record) => record.sourceId !== assetId);

  if (!state.baseAssetId && state.assets.length) setBaseAsset(state.assets[0].id);
  else {
    renderAssets();
    renderActions();
    updateViewportEmpty();
  }

  setStatus('Se quitó ' + asset.file.name + '.', 'info');
}

function updateViewportEmpty() {
  const base = getBaseAsset();
  els.viewportEmpty.classList.toggle('hidden', Boolean(base));
  els.baseBadge.textContent = base ? base.file.name : 'Sin modelo base';
  els.toggleSkeletonBtn.disabled = !base;
  els.fitCameraBtn.disabled = !base;
  updateExportState();
}

async function importFiles(fileList) {
  const files = Array.from(fileList).filter((file) => /\.fbx$/i.test(file.name));
  if (!files.length) {
    setStatus('Selecciona uno o más archivos .fbx.', 'warn');
    return;
  }

  els.fileInput.disabled = true;
  setStatus('Leyendo ' + files.length + ' FBX...', 'info');
  let imported = 0;
  let failed = 0;

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    try {
      setStatus('Procesando ' + (index + 1) + '/' + files.length + ': ' + file.name, 'info');
      const buffer = await file.arrayBuffer();
      const object = fbxLoader.parse(buffer, '');
      if (!object.name) object.name = stripExt(file.name);

      object.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });

      const rawClips = Array.isArray(object.animations) ? object.animations : [];
      const assetId = uid('asset');
      const assetClips = [];

      rawClips.forEach((clip, clipIndex) => {
        const cloned = clip.clone();
        const originalName = (cloned.name || '').trim() || stripExt(file.name) + '_Action_' + (clipIndex + 1);
        const isEmpty = cloned.tracks.length === 0 || cloned.duration <= 1e-6;

        // El nombre editable empieza SIEMPRE con el nombre interno real del AnimationClip.
        cloned.name = originalName;

        const record = {
          id: uid('clip'),
          sourceId: assetId,
          sourceFile: file.name,
          sourceRootName: object.name || '',
          originalName,
          name: originalName,
          clip: cloned,
          empty: isEmpty,
          include: !isEmpty,
          edit: defaultActionEdit(),
        };
        state.clips.push(record);
        assetClips.push(record.id);
      });

      state.assets.push({
        id: assetId,
        file,
        object,
        clips: assetClips,
        boneCount: countBones(object),
        skinnedMeshCount: countSkinnedMeshes(object),
        nodeNames: collectNodeNames(object),
        restPose: captureRestPose(object),
        unitScaleFactor: Number(object.userData?.unitScaleFactor) || 1,
      });

      imported += 1;
    } catch (error) {
      failed += 1;
      console.error('Error importando FBX', file.name, error);
      setStatus('No se pudo leer ' + file.name + ': ' + (error?.message || error), 'error');
    }
  }

  els.fileInput.disabled = false;
  els.fileInput.value = '';

  if (!state.baseAssetId && state.assets.length) {
    setBaseAsset(state.assets[0].id);
  } else {
    renderAssets();
    renderActions();
    updateViewportEmpty();
  }

  const actionTotal = state.clips.length;
  const usefulTotal = state.clips.filter((record) => !isEmptyClip(record)).length;
  if (imported) {
    setStatus(
      'Importados ' + imported + ' FBX · ' + actionTotal + ' actions detectadas · ' + usefulTotal + ' útiles para reproducir/exportar' +
      (failed ? ' · ' + failed + ' archivo(s) fallaron.' : '.'),
      failed ? 'warn' : 'ok'
    );
  }
}

function playClip(clipId, options = {}) {
  const base = getBaseAsset();
  const record = state.clips.find((item) => item.id === clipId);
  if (!base || !record || !state.mixer) {
    setStatus('Elige un modelo base antes de reproducir una action.', 'warn');
    return;
  }

  if (isEmptyClip(record)) {
    setStatus('"' + record.name + '" está vacía: no contiene tracks de animación reproducibles.', 'warn');
    return;
  }

  state.mixer.stopAllAction();
  state.mixer.setTime(0);

  state.actionTransformNode.position.set(0, 0, 0);
  state.actionTransformNode.quaternion.identity();
  state.actionTransformNode.scale.set(1, 1, 1);
  state.actionTransformNode.updateMatrixWorld(true);

  const clip = makeClipForBase(record, base);
  const action = state.mixer.clipAction(clip, state.actionTransformNode);
  action.reset();
  action.setLoop(THREE.LoopRepeat, Infinity);
  action.clampWhenFinished = false;
  action.paused = false;
  action.play();

  state.activeClipId = record.id;
  state.currentAction = action;
  state.previewClip = clip;

  if (Number.isFinite(options.preserveTime) && clip.duration > 0) {
    const safeTime = THREE.MathUtils.clamp(options.preserveTime, 0, Math.max(clip.duration - 1e-5, 0));
    state.mixer.setTime(safeTime);
  }
  if (options.preservePaused) action.paused = true;

  els.activeActionBadge.textContent = record.name;
  els.playPauseBtn.disabled = false;
  els.playPauseBtn.textContent = action.paused ? '▶' : 'Ⅱ';
  els.timeline.disabled = false;
  els.timeline.min = '0';
  els.timeline.max = String(Math.max(clip.duration, 0.001));
  els.timeline.value = '0';
  els.currentTime.textContent = '0.00 s';
  els.durationTime.textContent = formatDuration(clip.duration);

  renderActions();
  renderMotionPanel();
  requestAnimationFrame(updateRootGizmoAttachment);

  const compat = compatibility(record, base);
  if (options.silent) return;
  if (compat.ratio < 0.7) {
    setStatus('La action "' + record.name + '" solo coincide con ' + Math.round(compat.ratio * 100) + '% de sus tracks en este rig.', 'warn');
  } else {
    setStatus('Reproduciendo "' + record.name + '" sobre ' + base.file.name + '.', 'ok');
  }
}

function getViewportAspect() {
  const width = Math.max(els.viewport.clientWidth, 1);
  const height = Math.max(els.viewport.clientHeight, 1);
  return width / height;
}

function syncOrthographicFrustum(viewHeight = state.orthoViewHeight) {
  const aspect = Math.max(getViewportAspect(), 0.05);
  state.orthoViewHeight = Math.max(Number(viewHeight) || 4, 0.001);
  const halfH = state.orthoViewHeight * 0.5;
  const halfW = halfH * aspect;

  orthographicCamera.left = -halfW;
  orthographicCamera.right = halfW;
  orthographicCamera.top = halfH;
  orthographicCamera.bottom = -halfH;
  orthographicCamera.updateProjectionMatrix();
}

function perspectiveVisibleHeightAtTarget() {
  const distance = Math.max(perspectiveCamera.position.distanceTo(controls.target), 0.001);
  return 2 * distance * Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov) * 0.5);
}

function orthographicVisibleHeight() {
  return state.orthoViewHeight / Math.max(orthographicCamera.zoom || 1, 0.000001);
}

function flushOrbitControls() {
  // OrbitControls keeps damping deltas internally. When swapping camera types
  // those residual deltas can make the next orbit/pan feel as if the axes have
  // changed. One non-damped update clears them.
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = damping;
  controls.update();
}

function safePerspectiveDirection(direction) {
  const dir = direction.clone().normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);

  // Exact top/bottom views are singular with a Y-up perspective camera.
  // Add a tiny forward component so OrbitControls returns to a stable Y-up
  // coordinate system without a visible jump.
  if (Math.abs(dir.dot(worldUp)) > 0.9995) {
    dir.z += dir.y >= 0 ? 0.001 : -0.001;
    dir.normalize();
  }

  return dir;
}

function updateProjectionPreferenceUi() {
  const preferred = state.freeProjectionMode === 'orthographic'
    ? 'orthographic'
    : 'perspective';

  els.toggleProjectionBtn.textContent =
    preferred === 'orthographic' ? 'Ortográfica' : 'Perspectiva';
  els.toggleProjectionBtn.dataset.mode = preferred;
  els.toggleProjectionBtn.title =
    preferred === 'orthographic'
      ? 'Modo libre: Ortográfica'
      : 'Modo libre: Perspectiva';
}

function setActiveCamera(mode, { preserveView = true } = {}) {
  const nextMode = mode === 'orthographic' ? 'orthographic' : 'perspective';

  if (state.projectionMode === nextMode && camera) {
    updateProjectionPreferenceUi();
    return;
  }

  const previous = camera;
  const target = controls.target.clone();
  let viewDirection = previous.position.clone().sub(target);

  if (viewDirection.lengthSq() < 1e-10) viewDirection.set(0.32, 0.12, 1);
  viewDirection.normalize();

  if (nextMode === 'orthographic') {
    if (preserveView && previous.isPerspectiveCamera) {
      state.orthoViewHeight = perspectiveVisibleHeightAtTarget();
    }

    orthographicCamera.zoom = 1;
    syncOrthographicFrustum(state.orthoViewHeight);

    const distance = Math.max(previous.position.distanceTo(target), 0.1);
    orthographicCamera.position.copy(target).addScaledVector(viewDirection, distance);
    orthographicCamera.up.copy(previous.up);
    orthographicCamera.lookAt(target);
    orthographicCamera.updateMatrixWorld(true);

    camera = orthographicCamera;
  } else {
    let visibleHeight = perspectiveVisibleHeightAtTarget();

    if (previous.isOrthographicCamera) {
      visibleHeight = orthographicVisibleHeight();
    }

    const halfFov = THREE.MathUtils.degToRad(perspectiveCamera.fov) * 0.5;
    const distance = Math.max(
      visibleHeight / (2 * Math.tan(halfFov)),
      0.1
    );

    // Perspective navigation ALWAYS returns to the application's Y-up world.
    // Never inherit the special Z-up camera used only to draw top/bottom
    // orthographic views.
    viewDirection = safePerspectiveDirection(viewDirection);

    perspectiveCamera.up.set(0, 1, 0);
    perspectiveCamera.zoom = 1;
    perspectiveCamera.position.copy(target).addScaledVector(viewDirection, distance);
    perspectiveCamera.lookAt(target);
    perspectiveCamera.aspect = getViewportAspect();
    perspectiveCamera.near = Math.max(distance / 5000, 0.001);
    perspectiveCamera.far = Math.max(distance * 100, 1000);
    perspectiveCamera.updateProjectionMatrix();
    perspectiveCamera.updateMatrixWorld(true);

    camera = perspectiveCamera;

    controls.minDistance = Math.max(distance * 0.02, 0.01);
    controls.maxDistance = Math.max(distance * 50, 100);
  }

  state.projectionMode = nextMode;
  controls.object = camera;
  controls.target.copy(target);

  rootTransformControls.camera = camera;
  rootRotateControls.camera = camera;
  limbTransformControls.camera = camera;
  limbRotateControls.camera = camera;

  flushOrbitControls();

  updateProjectionPreferenceUi();
}

function axisViewDefinition(axisView) {
  const definitions = {
    '+x': { direction: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), name: '+X' },
    '-x': { direction: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0), name: '-X' },
    '+y': { direction: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1), name: '+Y' },
    '-y': { direction: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1), name: '-Y' },
    '+z': { direction: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), name: '+Z' },
    '-z': { direction: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0), name: '-Z' },
  };
  return definitions[axisView] || definitions['+z'];
}

function nearestAxisViewFromDirection(direction) {
  const dir = direction.clone().normalize();
  const candidates = [
    ['+x', new THREE.Vector3(1, 0, 0)],
    ['-x', new THREE.Vector3(-1, 0, 0)],
    ['+y', new THREE.Vector3(0, 1, 0)],
    ['-y', new THREE.Vector3(0, -1, 0)],
    ['+z', new THREE.Vector3(0, 0, 1)],
    ['-z', new THREE.Vector3(0, 0, -1)],
  ];

  let bestKey = '+z';
  let bestDot = -Infinity;

  for (const [key, axis] of candidates) {
    const dot = dir.dot(axis);
    if (dot > bestDot) {
      bestDot = dot;
      bestKey = key;
    }
  }

  return bestKey;
}

function virtualOrbitDirectionFromDrag(drag, dx, dy) {
  const yaw = -dx * 0.0075;
  const pitch = -dy * 0.0075;

  const worldUp = new THREE.Vector3(0, 1, 0);
  const qYaw = new THREE.Quaternion().setFromAxisAngle(worldUp, yaw);

  const direction = drag.startDirection.clone().applyQuaternion(qYaw).normalize();
  const right = drag.startRight.clone().applyQuaternion(qYaw).normalize();
  const qPitch = new THREE.Quaternion().setFromAxisAngle(right, pitch);

  direction.applyQuaternion(qPitch).normalize();
  return direction;
}

function beginBlenderAxisSnap(event) {
  const target = controls.target.clone();
  const startDirection = camera.position.clone().sub(target);

  if (startDirection.lengthSq() < 1e-10) startDirection.set(0.32, 0.12, 1);
  startDirection.normalize();

  const startRight = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(camera.quaternion)
    .normalize();

  state.blenderNavDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startDirection,
    startRight,
    lastAxis: null,
    moved: false,
  };

  controls.enabled = false;

  try {
    renderer.domElement.setPointerCapture(event.pointerId);
  } catch {}

  setStatus(
    'Alt + MMB: snap ortográfico. Arrastra hacia una dirección para elegir el eje.',
    'info'
  );
}

function updateBlenderAxisSnap(event) {
  const drag = state.blenderNavDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;

  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  const distance = Math.hypot(dx, dy);

  if (distance < 10) return;

  drag.moved = true;

  const virtualDirection = virtualOrbitDirectionFromDrag(drag, dx, dy);
  const axisView = nearestAxisViewFromDirection(virtualDirection);

  if (axisView === drag.lastAxis) return;

  drag.lastAxis = axisView;
  switchToAxisView(axisView);
}

function endBlenderAxisSnap(event) {
  const drag = state.blenderNavDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;

  state.blenderNavDrag = null;
  controls.enabled = true;
  controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;

  try {
    renderer.domElement.releasePointerCapture(event.pointerId);
  } catch {}

  if (!drag.moved) {
    setStatus('Alt + MMB: arrastra para elegir una vista ortográfica.', 'info');
  } else {
    state.axisViewReturnMode = state.freeProjectionMode;
    updateProjectionPreferenceUi();
  }

  flushOrbitControls();
}

function switchToAxisView(axisView) {
  const def = axisViewDefinition(axisView);
  const target = controls.target.clone();

  // Axis views are ALWAYS orthographic, but they never change what the user
  // selected for free navigation. That preference only changes through the
  // Perspectiva / Ortográfica button.
  state.axisViewReturnMode = state.freeProjectionMode;

  let distance = camera.position.distanceTo(target);
  if (!Number.isFinite(distance) || distance < 0.01) distance = 5;

  if (camera.isPerspectiveCamera) {
    state.orthoViewHeight = perspectiveVisibleHeightAtTarget();
  }

  setActiveCamera('orthographic', { preserveView: true });

  camera.position.copy(target).addScaledVector(def.direction, distance);
  camera.up.copy(def.up);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  controls.object = camera;
  controls.target.copy(target);
  flushOrbitControls();

  state.axisViewQuaternion = camera.quaternion.clone();
  state.axisViewActive = true;
  state.axisAutoSwitchPending = false;

  const returnLabel =
    state.axisViewReturnMode === 'perspective' ? 'Perspectiva' : 'Ortográfica';

  setStatus(
    'Vista ' + def.name + ' ortográfica · al orbitar: ' + returnLabel + '.',
    'info'
  );
}

function handleAxisViewAutoProjection() {
  if (
    !state.axisViewActive ||
    !state.axisViewQuaternion ||
    state.axisAutoSwitchPending ||
    state.rootGizmoDragging ||
    state.blenderNavDrag
  ) {
    return;
  }

  const angle = camera.quaternion.angleTo(state.axisViewQuaternion);

  // About 0.35 degrees: enough to ignore floating-point noise while still
  // feeling immediate on the first deliberate orbit gesture.
  if (angle < THREE.MathUtils.degToRad(0.35)) return;

  const returnMode = state.axisViewReturnMode;
  state.axisViewActive = false;
  state.axisViewQuaternion = null;

  if (returnMode !== state.projectionMode) {
    state.axisAutoSwitchPending = true;

    // Do the camera-type swap outside OrbitControls' own change dispatch.
    // This avoids re-entering update() halfway through an orbit event.
    requestAnimationFrame(() => {
      setActiveCamera(returnMode, { preserveView: true });
      state.axisAutoSwitchPending = false;

      setStatus(
        returnMode === 'perspective'
          ? 'Auto Perspective: vista libre en perspectiva.'
          : 'Vista libre ortográfica.',
        'info'
      );
    });
  } else {
    setStatus(
      returnMode === 'perspective'
        ? 'Vista libre en perspectiva.'
        : 'Vista libre ortográfica.',
      'info'
    );
  }
}

function updateNavigationGizmo() {
  if (!els.viewGizmo) return;

  const center = 43;
  const radius = 27;
  const inverseCameraQuat = camera.quaternion.clone().invert();

  const axes = [
    { key: '+x', vector: new THREE.Vector3(1, 0, 0), line: els.navLineX },
    { key: '-x', vector: new THREE.Vector3(-1, 0, 0), line: els.navLineXNeg },
    { key: '+y', vector: new THREE.Vector3(0, 1, 0), line: els.navLineY },
    { key: '-y', vector: new THREE.Vector3(0, -1, 0), line: els.navLineYNeg },
    { key: '+z', vector: new THREE.Vector3(0, 0, 1), line: els.navLineZ },
    { key: '-z', vector: new THREE.Vector3(0, 0, -1), line: els.navLineZNeg },
  ];

  for (const axis of axes) {
    const viewVector = axis.vector.clone().applyQuaternion(inverseCameraQuat);
    const x = center + viewVector.x * radius;
    const y = center - viewVector.y * radius;

    const button = els.viewAxisButtons.find((el) => el.dataset.axisView === axis.key);
    if (button) {
      button.style.left = x + 'px';
      button.style.top = y + 'px';
      button.style.zIndex = String(30 + Math.round((1 - viewVector.z) * 10));
      button.style.opacity = String(THREE.MathUtils.clamp(0.45 + (1 - viewVector.z) * 0.4, 0.35, 1));
    }

    if (axis.line) {
      axis.line.setAttribute('x1', String(center));
      axis.line.setAttribute('y1', String(center));
      axis.line.setAttribute('x2', String(x));
      axis.line.setAttribute('y2', String(y));
    }
  }
}

function fitCameraToObject(object) {
  previewStage.updateMatrixWorld(true);
  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object, true);
  const finite =
    Number.isFinite(box.min.x) && Number.isFinite(box.min.y) && Number.isFinite(box.min.z) &&
    Number.isFinite(box.max.x) && Number.isFinite(box.max.y) && Number.isFinite(box.max.z);

  if (box.isEmpty() || !finite) {
    controls.target.set(0, 1.5, 0);
    camera.position.set(0, 1.5, 5);
    camera.up.set(0, 1, 0);
    camera.lookAt(controls.target);

    if (camera.isPerspectiveCamera) {
      camera.near = 0.001;
      camera.far = 1000;
      camera.updateProjectionMatrix();
    } else {
      state.orthoViewHeight = 4;
      syncOrthographicFrustum(4);
    }

    controls.update();
    return;
  }

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const aspect = Math.max(getViewportAspect(), 0.05);

  let direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 1e-8) direction.set(0.32, 0.12, 1);
  direction.normalize();

  if (camera.isPerspectiveCamera) {
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const fitHeight = size.y / (2 * Math.tan(verticalFov / 2));
    const fitWidth = size.x / (2 * Math.tan(horizontalFov / 2));
    const fitDepth = size.z * 0.65;
    const distance = Math.max(fitHeight, fitWidth, 1.5) * 1.28 + fitDepth;

    camera.position.copy(center).addScaledVector(direction, distance);
    camera.near = Math.max(distance / 1000, 0.001);
    camera.far = Math.max(distance * 100, 1000);
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    controls.minDistance = Math.max(distance * 0.08, 0.05);
    controls.maxDistance = distance * 12;
  } else {
    const requiredHeight = Math.max(size.y, size.x / aspect, 1) * 1.25;
    state.orthoViewHeight = requiredHeight;
    syncOrthographicFrustum(requiredHeight);

    const distance = Math.max(size.x, size.y, size.z, 1) * 4;
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.lookAt(center);
    camera.near = 0.001;
    camera.far = Math.max(distance * 100, 1000);
    camera.updateProjectionMatrix();
  }

  controls.target.copy(center);
  controls.update();

  grid.position.y = 0;
  grid.scale.setScalar(1);
}

function restoreBasePose() {
  if (state.mixer) {
    state.mixer.stopAllAction();
    state.mixer.setTime(0);
  }

  const base = getBaseAsset();
  if (!base) return;

  if (state.actionTransformNode) {
    state.actionTransformNode.position.set(0, 0, 0);
    state.actionTransformNode.quaternion.identity();
    state.actionTransformNode.scale.set(1, 1, 1);
    state.actionTransformNode.updateMatrixWorld(true);
  }

  applyRestPose(base.object, base.restPose);
}

function buildExportClips(base) {
  const usedNames = new Set();
  return getIncludedClips().map((record) => makeClipForBase(record, base, usedNames));
}

function isolateExportRigResources(exportRig) {
  // SkeletonUtils.clone() correctly remaps cloned bones, but Three.js
  // Skeleton.clone() passes boneInverses into the new Skeleton by reference.
  // rebuildExportBindPose() calls calculateInverses(), which clears/rebuilds
  // that array. Without this copy the LIVE viewport skeleton is corrupted as
  // soon as an export starts.
  exportRig.traverse((node) => {
    if (node.isSkinnedMesh && node.skeleton) {
      node.skeleton.boneInverses = node.skeleton.boneInverses.map(
        (inverse) => inverse.clone()
      );

      // The exporter should not share mutable mesh data with the live preview
      // either. Textures can safely stay shared; geometry/material instances
      // themselves are detached.
      if (node.geometry) {
        node.geometry = node.geometry.clone();
      }

      if (Array.isArray(node.material)) {
        node.material = node.material.map((material) =>
          material?.clone ? material.clone() : material
        );
      } else if (node.material?.clone) {
        node.material = node.material.clone();
      }

      node.bindMatrix = node.bindMatrix.clone();
      node.bindMatrixInverse = node.bindMatrixInverse.clone();
    } else if (node.isMesh) {
      if (node.geometry) {
        node.geometry = node.geometry.clone();
      }

      if (Array.isArray(node.material)) {
        node.material = node.material.map((material) =>
          material?.clone ? material.clone() : material
        );
      } else if (node.material?.clone) {
        node.material = node.material.clone();
      }
    }
  });

  exportRig.updateMatrixWorld(true);
  return exportRig;
}

function buildCleanExportRoot(base, clips) {
  // Export hierarchy:
  // static destination correction
  //   └─ animated Action Transform (per-clip offset/rotation)
  //       └─ untouched rig + mesh
  //
  // This is deliberately equivalent to transforming an Armature object above
  // its bone animation instead of rewriting Hips/root curves.
  const exportContainer = new THREE.Group();
  exportContainer.name = EXPORT_CONTAINER_NAME;

  const exportActionTransform = new THREE.Group();
  exportActionTransform.name = ACTION_TRANSFORM_NAME;
  exportContainer.add(exportActionTransform);

  const exportRig = SkeletonUtils.clone(base.object);
  isolateExportRigResources(exportRig);
  applyRestPose(exportRig, base.restPose);
  exportActionTransform.add(exportRig);

  exportContainer.animations = clips;

  exportRig.traverse((node) => {
    if (node.userData?.__previewOnly) node.visible = false;
  });

  exportContainer.updateMatrixWorld(true);
  return exportContainer;
}

function rebuildExportBindPose(exportRoot) {
  // The FBX exporter derives BindPose / TransformLink from skeleton.boneInverses
  // and SkinnedMesh.bindMatrix. After changing the root orientation, the cloned
  // skin still contains the inverses from the pre-rotation space. Rebind every
  // SkinnedMesh in the final export space so Rest Position and Pose Position
  // agree in Blender/Unity.
  exportRoot.updateMatrixWorld(true);

  const reboundSkeletons = new Set();

  exportRoot.traverse((node) => {
    if (!node.isSkinnedMesh || !node.skeleton) return;

    // Recalculate the inverse bind matrices from the current rest pose once
    // per skeleton, then bind this mesh using its current world transform.
    if (!reboundSkeletons.has(node.skeleton)) {
      // Never mutate an inverse array that might have originated from another
      // Skeleton instance. Matrix4 objects are copied as well.
      node.skeleton.boneInverses = node.skeleton.boneInverses.map(
        (inverse) => inverse.clone()
      );
      node.skeleton.calculateInverses();
      reboundSkeletons.add(node.skeleton);
    }

    node.bind(node.skeleton, node.matrixWorld.clone());
    node.skeleton.update();
  });

  exportRoot.updateMatrixWorld(true);
}

function applyFbxArmatureOrientationFix(exportRoot, preset) {
  // IMPORTANT:
  // Unity's FBX importer already handles the Y-up FBX orientation correctly.
  // Applying our Blender compensation to Unity rotates the instantiated model
  // upside-down even though the animation preview itself is correct.
  //
  // Therefore orientation compensation is BLENDER-ONLY.
  if (preset !== 'blender') {
    exportRoot.updateMatrix();
    exportRoot.updateMatrixWorld(true);
    return;
  }

  // Blender-specific correction confirmed against the imported FBX:
  // - remove the effective 180° Z flip
  // - convert the root X result from -90° to +90° (another 180° on X)
  //
  // These are applied only to the exported root object. Bone curves remain
  // untouched.
  const zCorrection = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    Math.PI
  );

  const xCorrection = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    Math.PI
  );

  exportRoot.quaternion.premultiply(zCorrection);
  exportRoot.quaternion.premultiply(xCorrection);

  exportRoot.updateMatrix();
  exportRoot.updateMatrixWorld(true);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportFBX() {
  const base = getBaseAsset();
  if (!base || state.exporting) return;

  const clips = buildExportClips(base);
  if (!clips.length) return;

  state.exporting = true;
  updateExportState();
  setStatus('Generando FBX con skin/bind pose totalmente aislado · ' + clips.length + ' actions...', 'info');

  try {
    const exportRoot = buildCleanExportRoot(base, clips);
    const preset = els.presetSelect.value;
    applyFbxArmatureOrientationFix(exportRoot, preset);
    rebuildExportBindPose(exportRoot);
    const exporter = new FBXExporter();

    // FBXLoader conserva las unidades numéricas del archivo de origen.
    // Por eso NO debemos imponer UnitScale=100 al preset Blender: eso vuelve
    // a escalar malla, bind pose y traslaciones de animación de forma distinta.
    const sourceUnitScale = getAssetUnitScale(base);

    const bytes = await exporter.parseAsync(exportRoot, {
      preset,
      unitScale: sourceUnitScale,
      animations: clips,
      includeAnimations: true,
      embedTextures: true,
      bakeSpaceTransform: false,
      fps: 30,
    });

    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const filename = preset + '_' + stripExt(base.file.name) + '_all_actions.fbx';
    downloadBlob(blob, filename);

    setStatus(
      'FBX exportado con bind pose reconstruido, retarget de rest pose y orientación específica del destino (' +
      sourceUnitScale + '): ' + filename + ' · ' + clips.length + ' actions.',
      'ok'
    );
  } catch (error) {
    console.error(error);
    setStatus('Error al exportar FBX: ' + (error?.message || error), 'error');
  } finally {
    state.exporting = false;
    updateExportState();
  }
}

async function exportGLB() {
  const base = getBaseAsset();
  if (!base || state.exporting) return;

  const clips = buildExportClips(base);
  if (!clips.length) return;

  state.exporting = true;
  updateExportState();
  setStatus('Generando GLB con recursos totalmente aislados del preview...', 'info');

  try {
    const exportRoot = buildCleanExportRoot(base, clips);
    const exporter = new GLTFExporter();

    const result = await exporter.parseAsync(exportRoot, {
      binary: true,
      animations: clips,
      trs: true,
      onlyVisible: false,
      maxTextureSize: 4096,
    });

    const glbTag = els.presetSelect.value;
    const filename = glbTag + '_' + stripExt(base.file.name) + '_all_actions.glb';
    downloadBlob(new Blob([result], { type: 'model/gltf-binary' }), filename);
    setStatus('GLB exportado con el mismo retarget de rest pose: ' + filename + ' · ' + clips.length + ' actions.', 'ok');
  } catch (error) {
    console.error(error);
    setStatus('Error al exportar GLB: ' + (error?.message || error), 'error');
  } finally {
    state.exporting = false;
    updateExportState();
  }
}

function clearAll() {
  const base = getBaseAsset();
  if (base && base.object.parent === state.actionTransformNode) {
    state.actionTransformNode.remove(base.object);
  }

  state.actionTransformNode.position.set(0, 0, 0);
  state.actionTransformNode.quaternion.identity();
  state.actionTransformNode.scale.set(1, 1, 1);
  state.actionTransformNode.updateMatrixWorld(true);

  disposeMixer();
  if (state.skeletonHelper) {
    scene.remove(state.skeletonHelper);
    state.skeletonHelper.dispose?.();
  }

  state.assets = [];
  state.clips = [];
  state.baseAssetId = null;
  state.activeClipId = null;
  state.skeletonHelper = null;
  state.rootGizmoEnabled = false;
  state.rootGizmoDragging = false;
  state.rootGizmoDrag = null;
  state.limbGizmoEnabled = false;
  state.limbGizmoDragging = false;
  state.limbGizmoDrag = null;
  state.axisViewActive = false;
  state.axisViewQuaternion = null;
  state.axisAutoSwitchPending = false;
  state.freeProjectionMode = 'perspective';
  state.axisViewReturnMode = 'perspective';
  state.blenderNavDrag = null;
  hideRootGizmo();
  hideLimbGizmo();

  resetPlaybackUi();
  renderMotionPanel();
  renderAssets();
  renderActions();
  updateViewportEmpty();
  setStatus('Proyecto limpio. Puedes importar otro lote de FBX.', 'info');
}

els.fileInput.addEventListener('change', (event) => importFiles(event.target.files));
['dragenter', 'dragover'].forEach((type) => els.dropZone.addEventListener(type, (event) => {
  event.preventDefault();
  els.dropZone.classList.add('dragging');
}));
['dragleave', 'drop'].forEach((type) => els.dropZone.addEventListener(type, (event) => {
  event.preventDefault();
  els.dropZone.classList.remove('dragging');
}));
els.dropZone.addEventListener('drop', (event) => importFiles(event.dataTransfer.files));

els.clearAllBtn.addEventListener('click', clearAll);
els.actionSearch.addEventListener('input', renderActions);

els.selectAllActionsBtn.addEventListener('click', () => {
  state.clips.forEach((record) => { record.include = true; });
  renderActions();
  setStatus('Todas las actions quedaron seleccionadas para exportar.', 'ok');
});

els.deselectEmptyActionsBtn.addEventListener('click', () => {
  let changed = 0;
  state.clips.forEach((record) => {
    if (isEmptyClip(record) && record.include) {
      record.include = false;
      changed += 1;
    }
  });
  renderActions();
  setStatus(
    changed
      ? 'Se desmarcaron ' + changed + ' action' + (changed === 1 ? '' : 's') + ' sin tracks.'
      : 'No había actions sin tracks seleccionadas.',
    changed ? 'ok' : 'info'
  );
});

els.renameCompatibleActionsBtn.addEventListener('click', () => {
  const base = getBaseAsset();
  if (!base) {
    setStatus('Selecciona primero un modelo base.', 'warn');
    return;
  }

  const compatible = getFullyCompatibleClips(base);
  if (!compatible.length) {
    setStatus('No hay Actions 100% compatibles para renombrar.', 'warn');
    return;
  }

  compatible.forEach((record) => {
    const nextName = sourceFileToActionName(record.sourceFile) || record.name || record.originalName || 'Action';
    record.name = nextName;
    record.clip.name = nextName;
  });

  const active = state.clips.find((record) => record.id === state.activeClipId);
  if (active) {
    els.activeActionBadge.textContent = active.name;
  }

  renderActions();
  renderMotionPanel();
  setStatus(
    'Renombradas ' + compatible.length +
    ' Actions 100% compatibles usando el nombre de su FBX · orden alfabético actualizado.',
    'ok'
  );
});
els.toggleMotionPanelBtn.addEventListener('click', () => {
  state.motionPanelOpen = !state.motionPanelOpen;
  renderMotionPanel();
});

els.overdriveRange.addEventListener('input', () => {
  const record = getActiveRecord();
  if (!record) return;
  const edit = ensureActionEdit(record);
  edit.overdrive = Number(els.overdriveRange.value);
  els.overdriveValue.textContent =
    String(edit.overdrive) + ' · ' + getOverdriveSpeed(edit.overdrive).toFixed(2) + '×';
  refreshActivePreview();
});

els.armSpaceRange.addEventListener('input', () => {
  const record = getActiveRecord();
  if (!record) return;
  const edit = ensureActionEdit(record);
  edit.armSpace = Number(els.armSpaceRange.value);
  els.armSpaceValue.textContent = String(edit.armSpace);
  refreshActivePreview();
});

function syncTrimFromUi(changed) {
  const record = getActiveRecord();
  if (!record) return;
  const edit = ensureActionEdit(record);

  let start = Number(els.trimStartRange.value);
  let end = Number(els.trimEndRange.value);

  if (changed === 'start' && start > end - 1) start = end - 1;
  if (changed === 'end' && end < start + 1) end = start + 1;

  start = THREE.MathUtils.clamp(start, 0, 99);
  end = THREE.MathUtils.clamp(end, 1, 100);

  edit.trimStart = start;
  edit.trimEnd = end;
  els.trimStartRange.value = String(start);
  els.trimEndRange.value = String(end);
  updateTrimVisuals(edit, record);
  refreshActivePreview();
}

els.trimStartRange.addEventListener('input', () => syncTrimFromUi('start'));
els.trimEndRange.addEventListener('input', () => syncTrimFromUi('end'));

els.resetTrimBtn.addEventListener('click', () => {
  const record = getActiveRecord();
  if (!record) return;
  const edit = ensureActionEdit(record);
  edit.trimStart = 0;
  edit.trimEnd = 100;
  renderMotionPanel();
  refreshActivePreview();
});

els.mirrorActionCheckbox.addEventListener('change', () => {
  const record = getActiveRecord();
  if (!record) return;
  ensureActionEdit(record).mirror = els.mirrorActionCheckbox.checked;
  refreshActivePreview();
});

els.limbSlotSelect.addEventListener('change', () => {
  state.activeLimbKey = els.limbSlotSelect.value;
  const record = getActiveRecord();
  const base = getBaseAsset();
  if (record && base) {
    renderLimbEditor(ensureActionEdit(record), base);
    requestAnimationFrame(updateLimbGizmoAttachment);
  }
});

els.limbBoneSelect.addEventListener('change', () => {
  const record = getActiveRecord();
  const base = getBaseAsset();
  if (!record || !base) return;
  const edit = ensureActionEdit(record);
  ensureLimbOffsets(edit)[state.activeLimbKey].bone = els.limbBoneSelect.value;
  renderLimbEditor(edit, base);
  refreshActivePreview();
  requestAnimationFrame(updateLimbGizmoAttachment);
});

els.limbAllowStretch.addEventListener('change', () => {
  const record = getActiveRecord();
  if (!record) return;
  const edit = ensureActionEdit(record);
  ensureLimbOffsets(edit)[state.activeLimbKey].allowStretch = els.limbAllowStretch.checked;
  refreshActivePreview();
});

function syncLimbPosition() {
  const record = getActiveRecord();
  if (!record) return;
  const limb = ensureLimbOffsets(ensureActionEdit(record))[state.activeLimbKey];
  limb.position.x = Number(els.limbOffsetX.value) || 0;
  limb.position.y = Number(els.limbOffsetY.value) || 0;
  limb.position.z = Number(els.limbOffsetZ.value) || 0;
  refreshActivePreview();
}

els.limbOffsetX.addEventListener('input', syncLimbPosition);
els.limbOffsetY.addEventListener('input', syncLimbPosition);
els.limbOffsetZ.addEventListener('input', syncLimbPosition);

function syncLimbRotation() {
  const record = getActiveRecord();
  if (!record) return;
  const limb = ensureLimbOffsets(ensureActionEdit(record))[state.activeLimbKey];
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(Number(els.limbRotationX.value) || 0),
      THREE.MathUtils.degToRad(Number(els.limbRotationY.value) || 0),
      THREE.MathUtils.degToRad(Number(els.limbRotationZ.value) || 0),
      'XYZ'
    )
  ).normalize();
  storeLimbQuaternion(limb, q);
  refreshActivePreview();
}

els.limbRotationX.addEventListener('input', syncLimbRotation);
els.limbRotationY.addEventListener('input', syncLimbRotation);
els.limbRotationZ.addEventListener('input', syncLimbRotation);

els.resetLimbOffsetBtn.addEventListener('click', () => {
  const record = getActiveRecord();
  const base = getBaseAsset();
  if (!record || !base) return;
  const edit = ensureActionEdit(record);
  edit.limbOffsets[state.activeLimbKey] = defaultLimbOffset();
  renderLimbEditor(edit, base);
  refreshActivePreview();
  setStatus(limbDisplayName(state.activeLimbKey) + ' restablecida.', 'ok');
});

els.toggleLimbGizmoBtn.addEventListener('click', () => {
  const data = getActiveLimbData();
  if (!data?.bone) {
    setStatus('No se detectó un hueso válido para esta extremidad. Selecciónalo manualmente.', 'warn');
    return;
  }

  state.limbGizmoEnabled = !state.limbGizmoEnabled;
  renderLimbEditor(data.edit, data.base);
  updateLimbGizmoAttachment();

  setStatus(
    state.limbGizmoEnabled
      ? 'Gizmo IK activo en ' + data.boneName + '. Flechas = objetivo IK; aros = rotación del efector.'
      : 'Gizmo IK de extremidad desactivado.',
    'info'
  );
});

function beginLimbGizmoDrag(mode) {
  if (state.limbGizmoDragging || state.rootGizmoDragging) return;

  const data = getActiveLimbData();
  if (!data?.bone) return;

  const chain = getTwoBoneChain(data.base.object, data.boneName);
  if (!chain) {
    setStatus('El hueso seleccionado no tiene una cadena padre de 2 huesos compatible con IK.', 'warn');
    return;
  }

  controls.enabled = false;
  state.limbGizmoDragging = true;

  const startProxyWorld = new THREE.Vector3();
  const startProxyQuaternion = new THREE.Quaternion();
  limbGizmoProxy.getWorldPosition(startProxyWorld);
  limbGizmoProxy.getWorldQuaternion(startProxyQuaternion);

  const actionWorldQuaternion = new THREE.Quaternion();
  state.actionTransformNode.getWorldQuaternion(actionWorldQuaternion);

  state.limbGizmoDrag = {
    mode,
    recordId: data.record.id,
    key: data.key,
    chain,
    chainPose: captureChainPose(chain),
    startProxyWorld,
    startProxyQuaternion,
    startPosition: new THREE.Vector3(
      Number(data.limb.position.x) || 0,
      Number(data.limb.position.y) || 0,
      Number(data.limb.position.z) || 0
    ),
    startQuaternion: getLimbQuaternion(data.limb),
    startTime: state.currentAction?.time || 0,
    wasPaused: Boolean(state.currentAction?.paused),
  };

  if (state.currentAction) state.currentAction.paused = true;
}

function updateLimbTranslateDrag() {
  const drag = state.limbGizmoDrag;
  const data = getActiveLimbData();
  if (
    !state.limbGizmoDragging ||
    !drag ||
    drag.mode !== 'translate' ||
    !data ||
    data.record.id !== drag.recordId
  ) return;

  restoreChainPose(drag.chain, drag.chainPose);

  const currentWorld = new THREE.Vector3();
  limbGizmoProxy.getWorldPosition(currentWorld);

  const sceneDelta = currentWorld.clone().sub(drag.startProxyWorld);
  const rigDelta = sceneDeltaToRigGlobal(sceneDelta);

  data.limb.position.x = drag.startPosition.x + rigDelta.x;
  data.limb.position.y = drag.startPosition.y + rigDelta.y;
  data.limb.position.z = drag.startPosition.z + rigDelta.z;
  updateLimbFieldsOnly(data.limb);

  const startEndWorldQ = drag.startProxyQuaternion.clone();
  solveTwoBoneIKPose(
    drag.chain,
    currentWorld,
    startEndWorldQ,
    Boolean(data.limb.allowStretch)
  );
}

function updateLimbRotateDrag() {
  const drag = state.limbGizmoDrag;
  const data = getActiveLimbData();
  if (
    !state.limbGizmoDragging ||
    !drag ||
    drag.mode !== 'rotate' ||
    !data ||
    data.record.id !== drag.recordId
  ) return;

  restoreChainPose(drag.chain, drag.chainPose);

  const currentWorldQ = new THREE.Quaternion();
  limbGizmoProxy.getWorldQuaternion(currentWorldQ);

  const deltaScene = currentWorldQ
    .clone()
    .multiply(drag.startProxyQuaternion.clone().invert())
    .normalize();

  const deltaRig = sceneQuaternionDeltaToRigGlobal(deltaScene);
  storeLimbQuaternion(
    data.limb,
    deltaRig.clone().multiply(drag.startQuaternion).normalize()
  );
  updateLimbFieldsOnly(data.limb);

  const targetPosition = drag.startProxyWorld.clone();
  solveTwoBoneIKPose(
    drag.chain,
    targetPosition,
    currentWorldQ,
    Boolean(data.limb.allowStretch)
  );
}

function finishLimbGizmoDrag(mode) {
  const drag = state.limbGizmoDrag;
  if (!drag || drag.mode !== mode) return;

  const record = state.clips.find((item) => item.id === drag.recordId);
  const data = getActiveLimbData();

  controls.enabled = true;
  state.limbGizmoDragging = false;
  state.limbGizmoDrag = null;

  if (record && data) {
    const moveSnap = Math.max(Number(state.rootMoveSnap) || 0.5, 0.000001);
    if (mode === 'translate') {
      data.limb.position.x = roundOffsetValue(data.limb.position.x, moveSnap);
      data.limb.position.y = roundOffsetValue(data.limb.position.y, moveSnap);
      data.limb.position.z = roundOffsetValue(data.limb.position.z, moveSnap);
    } else {
      const snapRad = THREE.MathUtils.degToRad(
        Math.max(Number(state.rootRotateSnap) || 5, 0.0001)
      );
      const current = getLimbQuaternion(data.limb);
      const delta = current
        .clone()
        .multiply(drag.startQuaternion.clone().invert())
        .normalize();

      let angle = 2 * Math.acos(THREE.MathUtils.clamp(delta.w, -1, 1));
      if (angle > Math.PI) angle -= Math.PI * 2;

      const sinHalf = Math.sqrt(Math.max(1 - delta.w * delta.w, 0));
      const axis = sinHalf < 1e-7
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(
            delta.x / sinHalf,
            delta.y / sinHalf,
            delta.z / sinHalf
          ).normalize();

      const snappedAngle = Math.round(angle / snapRad) * snapRad;
      const snappedDelta = new THREE.Quaternion().setFromAxisAngle(axis, snappedAngle);
      storeLimbQuaternion(
        data.limb,
        snappedDelta.multiply(drag.startQuaternion).normalize()
      );
    }
  }

  if (record && state.mixer) {
    playClip(record.id, {
      preserveTime: drag.startTime,
      preservePaused: drag.wasPaused,
      silent: true,
    });
  }

  renderMotionPanel();
  requestAnimationFrame(updateLimbGizmoAttachment);

  setStatus(
    mode === 'translate'
      ? 'Objetivo IK de ' + limbDisplayName(drag.key) + ' guardado.'
      : 'Rotación global de ' + limbDisplayName(drag.key) + ' guardada como quaternion.',
    'ok'
  );
}

limbTransformControls.addEventListener('mouseDown', () => beginLimbGizmoDrag('translate'));
limbTransformControls.addEventListener('objectChange', updateLimbTranslateDrag);
limbTransformControls.addEventListener('mouseUp', () => finishLimbGizmoDrag('translate'));

limbRotateControls.addEventListener('mouseDown', () => beginLimbGizmoDrag('rotate'));
limbRotateControls.addEventListener('objectChange', updateLimbRotateDrag);
limbRotateControls.addEventListener('mouseUp', () => finishLimbGizmoDrag('rotate'));

function syncRootOffset() {
  const record = getActiveRecord();
  if (!record) return;
  const edit = ensureActionEdit(record);
  edit.rootOffset.x = Number(els.rootOffsetX.value) || 0;
  edit.rootOffset.y = Number(els.rootOffsetY.value) || 0;
  edit.rootOffset.z = Number(els.rootOffsetZ.value) || 0;
  refreshActivePreview();
  requestAnimationFrame(updateRootGizmoAttachment);
}

els.rootOffsetX.addEventListener('input', syncRootOffset);
els.rootOffsetY.addEventListener('input', syncRootOffset);
els.rootOffsetZ.addEventListener('input', syncRootOffset);

function syncRootRotation() {
  const record = getActiveRecord();
  if (!record) return;

  const edit = ensureActionEdit(record);
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(Number(els.rootRotationX.value) || 0),
      THREE.MathUtils.degToRad(Number(els.rootRotationY.value) || 0),
      THREE.MathUtils.degToRad(Number(els.rootRotationZ.value) || 0),
      'XYZ'
    )
  ).normalize();

  storeEditQuaternion(edit, q);
  refreshActivePreview();
  requestAnimationFrame(updateRootGizmoAttachment);
}

els.rootRotationX.addEventListener('input', syncRootRotation);
els.rootRotationY.addEventListener('input', syncRootRotation);
els.rootRotationZ.addEventListener('input', syncRootRotation);

els.resetRootOffsetBtn.addEventListener('click', () => {
  const record = getActiveRecord();
  if (!record) return;
  const edit = ensureActionEdit(record);
  edit.rootOffset = { x: 0, y: 0, z: 0 };
  edit.rootQuaternion = { x: 0, y: 0, z: 0, w: 1 };
  renderMotionPanel();
  refreshActivePreview();
  requestAnimationFrame(updateRootGizmoAttachment);
});

els.resetMotionPanelBtn.addEventListener('click', () => {
  const record = getActiveRecord();
  if (!record) return;
  record.edit = defaultActionEdit();
  renderMotionPanel();
  refreshActivePreview();
});

function toggleCombinedRootGizmo() {
  const record = getActiveRecord();
  const base = getBaseAsset();

  if (!record || !base || isEmptyClip(record)) {
    setStatus('Selecciona y reproduce una Action antes de transformar su root.', 'warn');
    return;
  }

  state.rootGizmoEnabled = !state.rootGizmoEnabled;
  configureRootCombinedGizmoUi();
  updateRootGizmoAttachment();

  setStatus(
    state.rootGizmoEnabled
      ? 'Action Transform activo: mueve o rota todo el rig sin modificar curvas de huesos.'
      : 'Gizmo de transformación desactivado.',
    'info'
  );
}

els.toggleRootGizmoBtn.addEventListener('click', toggleCombinedRootGizmo);

els.rootMoveSnapSelect.addEventListener('change', () => {
  const value = Number(els.rootMoveSnapSelect.value);
  state.rootMoveSnap = Number.isFinite(value) ? value : 0.5;
  setStatus(
    'Ajuste final de movimiento: ' + state.rootMoveSnap + ' unidades FBX.',
    'info'
  );
});

els.rootRotateSnapSelect.addEventListener('change', () => {
  const value = Number(els.rootRotateSnapSelect.value);
  state.rootRotateSnap = Number.isFinite(value) ? value : 5;
  setStatus(
    'Ajuste final de rotación global: ' + state.rootRotateSnap + '°.',
    'info'
  );
});

function beginRootGizmoDrag(mode) {
  if (state.rootGizmoDragging) return;

  const record = getActiveRecord();
  const base = getBaseAsset();
  const target = findRootTargetObject(record, base);
  if (!record || !base || !target) return;

  controls.enabled = false;
  state.rootGizmoDragging = true;

  rootTransformControls.setTranslationSnap(null);
  rootRotateControls.setRotationSnap(null);

  const edit = ensureActionEdit(record);
  const startWorld = new THREE.Vector3();
  const startProxyQuaternion = new THREE.Quaternion();
  const parentWorldQuaternion = new THREE.Quaternion();

  rootGizmoProxy.getWorldPosition(startWorld);
  rootGizmoProxy.getWorldQuaternion(startProxyQuaternion);

  target.updateWorldMatrix(true, false);
  if (target.parent) {
    target.parent.getWorldQuaternion(parentWorldQuaternion);
  }

  state.rootGizmoDrag = {
    recordId: record.id,
    mode,
    target,
    parent: target.parent || null,
    parentWorldQuaternion,
    startWorld,
    startProxyQuaternion,
    startTargetLocal: target.position.clone(),
    startTargetQuaternion: target.quaternion.clone(),
    startOffset: new THREE.Vector3(
      Number(edit.rootOffset.x) || 0,
      Number(edit.rootOffset.y) || 0,
      Number(edit.rootOffset.z) || 0
    ),
    startEditQuaternion: getEditQuaternion(edit),
    time: state.currentAction?.time || 0,
    wasPaused: Boolean(state.currentAction?.paused),
  };

  if (state.currentAction) state.currentAction.paused = true;
}

function updateRootTranslateDrag() {
  const drag = state.rootGizmoDrag;
  const record = getActiveRecord();

  if (
    !state.rootGizmoDragging ||
    !drag ||
    drag.mode !== 'translate' ||
    !record ||
    record.id !== drag.recordId
  ) {
    return;
  }

  const edit = ensureActionEdit(record);
  const currentWorld = new THREE.Vector3();
  rootGizmoProxy.getWorldPosition(currentWorld);

  let deltaLocal;

  if (drag.parent) {
    drag.parent.updateWorldMatrix(true, false);
    const startLocal = drag.parent.worldToLocal(drag.startWorld.clone());
    const currentLocal = drag.parent.worldToLocal(currentWorld.clone());
    deltaLocal = currentLocal.sub(startLocal);
  } else {
    deltaLocal = currentWorld.sub(drag.startWorld);
  }

  const nextX = drag.startOffset.x + deltaLocal.x;
  const nextY = drag.startOffset.y + deltaLocal.y;
  const nextZ = drag.startOffset.z + deltaLocal.z;

  edit.rootOffset.x = nextX;
  edit.rootOffset.y = nextY;
  edit.rootOffset.z = nextZ;
  updateRootOffsetFields(edit, { live: true });

  drag.target.position.copy(drag.startTargetLocal).add(deltaLocal);
  drag.target.updateMatrixWorld(true);
}

function updateRootRotateDrag() {
  const drag = state.rootGizmoDrag;
  const record = getActiveRecord();

  if (
    !state.rootGizmoDragging ||
    !drag ||
    drag.mode !== 'rotate' ||
    !record ||
    record.id !== drag.recordId
  ) return;

  const edit = ensureActionEdit(record);
  const currentProxyQuaternion = new THREE.Quaternion();
  rootGizmoProxy.getWorldQuaternion(currentProxyQuaternion);

  // TransformControls is WORLD/GLOBAL. Compute the world-space rotation delta.
  const deltaWorld = currentProxyQuaternion
    .clone()
    .multiply(drag.startProxyQuaternion.clone().invert())
    .normalize();

  // The Action Transform quaternion itself is LOCAL to previewStage/exportContainer.
  // Convert the world delta into that parent space before composing it:
  // deltaLocal = P^-1 * deltaWorld * P
  const parentWorld = drag.parentWorldQuaternion.clone().normalize();
  const deltaLocal = parentWorld
    .clone()
    .invert()
    .multiply(deltaWorld)
    .multiply(parentWorld)
    .normalize();

  // Compose directly in quaternion space. No Euler accumulation and therefore
  // no gimbal-lock / ±180° axis reassignment while dragging.
  const nextEditQuaternion = deltaLocal
    .clone()
    .multiply(drag.startEditQuaternion)
    .normalize();

  storeEditQuaternion(edit, nextEditQuaternion);
  updateRootOffsetFields(edit, { live: true });

  // Stored quaternion and node.localQuaternion now represent the same thing.
  drag.target.quaternion.copy(nextEditQuaternion);
  drag.target.updateMatrixWorld(true);
}

function finishRootGizmoDrag(mode) {
  const drag = state.rootGizmoDrag;
  if (!drag || drag.mode !== mode) return;

  controls.enabled = true;
  state.rootGizmoDragging = false;
  state.rootGizmoDrag = null;

  const record = state.clips.find((item) => item.id === drag.recordId);

  if (record) {
    const edit = ensureActionEdit(record);

    if (mode === 'rotate') {
      const snapRad = THREE.MathUtils.degToRad(
        Math.max(Number(state.rootRotateSnap) || 5, 0.0001)
      );

      const current = getEditQuaternion(edit);
      const delta = current
        .clone()
        .multiply(drag.startEditQuaternion.clone().invert())
        .normalize();

      let angle = 2 * Math.acos(THREE.MathUtils.clamp(delta.w, -1, 1));
      if (angle > Math.PI) angle -= Math.PI * 2;

      const sinHalf = Math.sqrt(Math.max(1 - delta.w * delta.w, 0));
      const axis = sinHalf < 1e-7
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(delta.x / sinHalf, delta.y / sinHalf, delta.z / sinHalf).normalize();

      const snappedAngle = Math.round(angle / snapRad) * snapRad;
      const snappedDelta = new THREE.Quaternion().setFromAxisAngle(axis, snappedAngle);

      storeEditQuaternion(
        edit,
        snappedDelta.multiply(drag.startEditQuaternion).normalize()
      );
    } else {
      const snap = Math.max(Number(state.rootMoveSnap) || 0.5, 0.000001);
      edit.rootOffset.x = roundOffsetValue(edit.rootOffset.x, snap);
      edit.rootOffset.y = roundOffsetValue(edit.rootOffset.y, snap);
      edit.rootOffset.z = roundOffsetValue(edit.rootOffset.z, snap);
    }

    updateRootOffsetFields(edit);
  }

  if (record && state.mixer) {
    playClip(record.id, {
      preserveTime: drag.time,
      preservePaused: drag.wasPaused,
      silent: true,
    });
  }

  renderMotionPanel();
  requestAnimationFrame(updateRootGizmoAttachment);

  if (!record) return;
  const savedEdit = ensureActionEdit(record);

  if (mode === 'rotate') {
    const display = quaternionToDisplayEuler(savedEdit);
    const q = getEditQuaternion(savedEdit);
    setStatus(
      'Quaternion guardado · Euler aprox. X ' +
      cleanLiveNumber(display.x, 1) + '° · Y ' +
      cleanLiveNumber(display.y, 1) + '° · Z ' +
      cleanLiveNumber(display.z, 1) + '° · q(' +
      cleanLiveNumber(q.x, 3) + ', ' +
      cleanLiveNumber(q.y, 3) + ', ' +
      cleanLiveNumber(q.z, 3) + ', ' +
      cleanLiveNumber(q.w, 3) + ').',
      'ok'
    );
  } else {
    setStatus(
      'Offset guardado: X ' + savedEdit.rootOffset.x + ' · Y ' +
      savedEdit.rootOffset.y + ' · Z ' + savedEdit.rootOffset.z + '.',
      'ok'
    );
  }
}

rootTransformControls.addEventListener('mouseDown', () => {
  beginRootGizmoDrag('translate');
});
rootTransformControls.addEventListener('objectChange', updateRootTranslateDrag);
rootTransformControls.addEventListener('mouseUp', () => {
  finishRootGizmoDrag('translate');
});

rootRotateControls.addEventListener('mouseDown', () => {
  beginRootGizmoDrag('rotate');
});
rootRotateControls.addEventListener('objectChange', updateRootRotateDrag);
rootRotateControls.addEventListener('mouseUp', () => {
  finishRootGizmoDrag('rotate');
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (
    event.pointerType === 'touch' ||
    event.button !== 1 ||
    state.rootGizmoDragging ||
    state.limbGizmoDragging
  ) return;

  // Prevent browser middle-click auto-scroll and configure OrbitControls
  // before its bubble-phase pointerdown handler reads mouseButtons.MIDDLE.
  event.preventDefault();

  if (event.altKey) {
    event.stopImmediatePropagation();
    beginBlenderAxisSnap(event);
    return;
  }

  const isOrbitGesture =
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey;

  // Blender-style Auto Perspective, made deterministic:
  // an axis snap (from Gimbal OR Alt+MMB) is always orthographic, but when
  // the user starts a normal MMB orbit we immediately restore the manually
  // selected free-navigation projection BEFORE OrbitControls begins rotating.
  //
  // Shift+MMB (pan) and Ctrl+MMB (dolly) intentionally keep the snapped
  // orthographic view.
  if (state.axisViewActive && isOrbitGesture) {
    const returnMode = state.freeProjectionMode;

    state.axisViewActive = false;
    state.axisViewQuaternion = null;
    state.axisAutoSwitchPending = false;
    state.axisViewReturnMode = returnMode;

    if (returnMode === 'perspective' && camera.isOrthographicCamera) {
      setActiveCamera('perspective', { preserveView: true });
      setStatus('Auto Perspective: órbita libre en perspectiva.', 'info');
    } else if (returnMode === 'orthographic' && camera.isPerspectiveCamera) {
      setActiveCamera('orthographic', { preserveView: true });
      setStatus('Órbita libre ortográfica.', 'info');
    }
  }

  controls.mouseButtons.MIDDLE =
    (event.ctrlKey || event.metaKey)
      ? THREE.MOUSE.DOLLY
      : THREE.MOUSE.ROTATE;
}, { capture: true });

window.addEventListener('pointermove', (event) => {
  if (!state.blenderNavDrag) return;
  event.preventDefault();
  updateBlenderAxisSnap(event);
}, { passive: false });

window.addEventListener('pointerup', (event) => {
  if (state.blenderNavDrag) {
    endBlenderAxisSnap(event);
  }

  controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
});

window.addEventListener('pointercancel', (event) => {
  if (state.blenderNavDrag) {
    endBlenderAxisSnap(event);
  }

  controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
});

renderer.domElement.addEventListener('auxclick', (event) => {
  if (event.button === 1) event.preventDefault();
});

controls.addEventListener('change', handleAxisViewAutoProjection);

els.toggleProjectionBtn.addEventListener('click', () => {
  const next =
    state.freeProjectionMode === 'perspective'
      ? 'orthographic'
      : 'perspective';

  state.freeProjectionMode = next;
  state.axisViewReturnMode = next;
  state.axisViewActive = false;
  state.axisViewQuaternion = null;
  state.axisAutoSwitchPending = false;

  setActiveCamera(next, { preserveView: true });
  updateProjectionPreferenceUi();

  setStatus(
    next === 'orthographic'
      ? 'Modo libre establecido en Ortográfica.'
      : 'Modo libre establecido en Perspectiva.',
    'info'
  );
});

els.viewAxisButtons.forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    switchToAxisView(button.dataset.axisView);
  });
});

els.fitCameraBtn.addEventListener('click', () => {
  const base = getBaseAsset();
  if (!base) return;

  state.axisViewActive = false;
  state.axisViewQuaternion = null;
  state.axisAutoSwitchPending = false;
  state.axisViewReturnMode = 'perspective';

  // "Encuadrar" funciona como Home Frame de Blender:
  // vuelve SIEMPRE a la perspectiva original del visor y después encuadra.
  normalizePreview(base.object);

  setActiveCamera('perspective', { preserveView: false });

  const target = controls.target.clone();
  const originalDirection = new THREE.Vector3(0.32, 0.12, 1).normalize();
  let distance = perspectiveCamera.position.distanceTo(target);
  if (!Number.isFinite(distance) || distance < 0.01) distance = 5;

  perspectiveCamera.up.set(0, 1, 0);
  perspectiveCamera.position.copy(target).addScaledVector(originalDirection, distance);
  perspectiveCamera.lookAt(target);
  perspectiveCamera.updateMatrixWorld(true);

  controls.object = perspectiveCamera;
  controls.target.copy(target);
  controls.update();

  fitCameraToObject(base.object);
  updateNavigationGizmo();

  setStatus('Vista restablecida: perspectiva original y modelo encuadrado.', 'ok');
});
els.toggleSkeletonBtn.addEventListener('click', () => {
  state.skeletonVisible = !state.skeletonVisible;
  if (state.skeletonHelper) state.skeletonHelper.visible = state.skeletonVisible;
  els.toggleSkeletonBtn.textContent = state.skeletonVisible ? 'Ocultar huesos' : 'Esqueleto';
});
function togglePlaybackPause() {
  if (!state.currentAction) return false;

  state.currentAction.paused = !state.currentAction.paused;
  els.playPauseBtn.textContent = state.currentAction.paused ? '▶' : 'Ⅱ';

  setStatus(
    state.currentAction.paused ? 'Animación pausada.' : 'Animación reanudada.',
    'info'
  );

  return true;
}

els.playPauseBtn.addEventListener('click', () => {
  togglePlaybackPause();
});

window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.repeat) return;

  const active = document.activeElement;
  const tag = active?.tagName?.toLowerCase();
  const isTyping =
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    active?.isContentEditable;

  if (isTyping) return;

  if (togglePlaybackPause()) {
    event.preventDefault();
    event.stopPropagation();
  }
});
els.speedSelect.addEventListener('change', () => {
  if (state.mixer) state.mixer.timeScale = Number(els.speedSelect.value);
});
els.timeline.addEventListener('pointerdown', () => { state.isScrubbing = true; });
window.addEventListener('pointerup', () => { state.isScrubbing = false; });
els.timeline.addEventListener('input', () => {
  if (!state.mixer || !state.previewClip) return;
  const time = Number(els.timeline.value);
  state.mixer.setTime(time);
  els.currentTime.textContent = formatDuration(time);
});
els.exportFbxBtn.addEventListener('click', exportFBX);
els.exportGlbBtn.addEventListener('click', exportGLB);

let lastViewportAspect = 0;

function resize() {
  const width = Math.max(1, els.viewport.clientWidth);
  const height = Math.max(1, els.viewport.clientHeight);
  const nextAspect = width / height;

  renderer.setSize(width, height, false);

  perspectiveCamera.aspect = nextAspect;
  perspectiveCamera.updateProjectionMatrix();
  syncOrthographicFrustum(state.orthoViewHeight);

  const base = getBaseAsset();
  if (base && Math.abs(nextAspect - lastViewportAspect) > 0.08) {
    requestAnimationFrame(() => fitCameraToObject(base.object));
  }
  lastViewportAspect = nextAspect;
}
new ResizeObserver(resize).observe(els.viewport);
resize();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);

  if (state.mixer) state.mixer.update(delta);
  updateRootGizmoPosition();
  updateLimbGizmoPosition();
  controls.update();
  updateNavigationGizmo();

  if (state.currentAction && state.previewClip && !state.isScrubbing) {
    const duration = Math.max(state.previewClip.duration, 0.001);
    const time = ((state.currentAction.time % duration) + duration) % duration;
    els.timeline.value = String(time);
    els.currentTime.textContent = formatDuration(time);
  }

  renderer.render(scene, camera);
}
animate();

renderAssets();
renderActions();
renderMotionPanel();
updateProjectionPreferenceUi();
updateViewportEmpty();
